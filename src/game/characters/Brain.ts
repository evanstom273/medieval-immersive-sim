import { MAX_HEALTH, reactToAttack } from '../combat/combat';
import { PX_PER_METRE } from '../movement/tuning';
import type { Point } from '../navigation/NavGrid';
import type { MemoryKind } from '../perception/memory';
import type { Perception } from '../perception/Senses';
import { smellStrength, type SmellSource } from '../perception/scents';
import type { NoiseKind } from '../perception/senseRules';
import type { Relationships } from '../social/relationships';
import type { SocialActionId } from '../social/socialActions';
import { between, weighted, type Rng } from '../util/rng';
import type { Hand } from '../world/CharacterView';
import { canFight } from './body';
import type { Interactable } from '../world/interactables';
import { isOffering, type Offer, type Offering } from '../world/furniture';
import { scoreOffer, WORTH_DOING } from '../life/choose';
import type { MoodletId } from '../life/needs';
import type { Character } from './Character';

/**
 * Autonomy for characters the player isn't controlling (and the one you are,
 * on free will). Needs first: objects nearby advertise what they do for which
 * needs, and the most useful one wins (see life/choose.ts), with a simple
 * routine (bed at night, meals at mealtimes). Otherwise PLACEHOLDER behaviour:
 * idle wandering, using nearby objects, chatting (more when lonely); reacting
 * to being attacked by temperament (fight / flee / yield); and reacting to what
 * they perceive: fights they see or hear, noises, blood, someone close behind,
 * bad smells.
 *
 * The brain only decides. It acts through the same World calls the player's
 * input uses (walk somewhere, start a social action, punch), so NPCs and the
 * player share one set of mechanics.
 */
export interface World {
  readonly now: number;
  readonly rng: Rng;
  readonly characters: readonly Character[];
  readonly interactables: readonly Interactable[];
  readonly relationships: Relationships;
  readonly smells: readonly SmellSource[];
  orderToPoint(c: Character, p: Point): boolean;
  /** Walk until within `reach` of a moving character. */
  orderToCharacter(c: Character, target: Character, reach: number): boolean;
  wanderPoint(c: Character, radius: number): Point | null;
  useObject(c: Character, obj: Interactable, optionId: string): void;
  startSocial(c: Character, target: Character, action: SocialActionId): boolean;
  punch(c: Character, hand: Hand): void;
  yieldTo(c: Character, attacker: Character | null): void;
  announce(message: string, involves: Character[], always?: boolean): void;
  /** Make a noise others may hear. */
  noise(kind: NoiseKind, x: number, y: number, source?: Character): void;
  /** Record something visible for anyone who sees it. */
  witness(kind: MemoryKind, x: number, y: number, actor?: Character, target?: Character): void;
  /** Hour of the day on the game clock (0–24). */
  readonly hour: number;
  /** Stop what they're doing with an object (getting up). */
  stopDoing(c: Character): void;
  /** Feel something (a moodlet). */
  feel(c: Character, id: MoodletId): void;
}

const M = PX_PER_METRE;

type State =
  | { kind: 'idle'; until: number }
  /** Doing something with an order or a conversation; back to idle when it ends (optionally lingering). */
  | { kind: 'busy'; linger?: { lookAt: Point; ms: number } }
  | { kind: 'fight'; foe: Character; nextPunch: number; hand: Hand; lastPlan: number }
  | { kind: 'flee'; from: Character; lastPlan: number; calmAt: number; closeSince: number | null }
  /** Keep a safe distance from a fight and watch it. */
  | { kind: 'watch'; subject: Character; other: Character; distance: number; until: number; lastPlan: number }
  /** Go and see what that was. */
  | { kind: 'investigate'; x: number; y: number; arrived: boolean; until: number };

export class Brain {
  state: State = { kind: 'idle', until: 0 };

  get activity(): string {
    const s = this.state;
    switch (s.kind) {
      case 'fight':
        return `Fighting ${s.foe.name}`;
      case 'flee':
        return `Fleeing ${s.from.name}`;
      case 'watch':
        return `Watching ${s.subject.name} and ${s.other.name}`;
      case 'investigate':
        return 'Looking into a noise';
      default:
        return '';
    }
  }

  private get engaged(): boolean {
    return this.state.kind === 'fight' || this.state.kind === 'flee';
  }

  reset(now: number): void {
    this.state = { kind: 'idle', until: now + 800 };
  }

  // ------------------------------------------------------------ being attacked

  /** Someone hit us. Decide by temperament and how hurt we are. */
  onAttacked(c: Character, attacker: Character, w: World): void {
    if (c.status !== 'ok') return;
    const response = reactToAttack(c.temperament, c.health / MAX_HEALTH, false);
    if (response === 'yield') {
      w.yieldTo(c, attacker);
      return;
    }
    if (response === 'fight' && canFight(c.age, attacker.age)) {
      if (this.state.kind !== 'fight' || this.state.foe !== attacker) {
        w.announce(`${c.name} fights back!`, [c, attacker], true);
        this.startFight(c, attacker, w);
      }
      return;
    }
    if (this.state.kind !== 'flee') {
      w.announce(`${c.name} runs from ${attacker.name}!`, [c, attacker], true);
      this.startFlee(c, attacker, w);
    }
  }

  private startFight(c: Character, foe: Character, w: World): void {
    w.stopDoing(c);
    c.cancelOrder();
    c.social = null;
    c.mode = 'combat';
    c.lockTarget = foe;
    this.state = { kind: 'fight', foe, nextPunch: w.now + 350, hand: 'right', lastPlan: 0 };
  }

  private startFlee(c: Character, from: Character, w: World): void {
    w.stopDoing(c);
    c.cancelOrder();
    c.social = null;
    this.state = { kind: 'flee', from, lastPlan: 0, calmAt: w.now + 4000, closeSince: null };
  }

  private calm(c: Character, w: World): void {
    c.mode = 'explore';
    c.lockTarget = null;
    c.cancelOrder();
    this.state = { kind: 'idle', until: w.now + between(w.rng, 1500, 3500) };
  }

  // ------------------------------------------------------------ perceiving

  /** React to something just perceived. */
  onPerceive(c: Character, p: Perception, w: World): void {
    if (c.status !== 'ok' || this.engaged) return;
    const glance = (x: number, y: number, ms = 1200) => {
      if (c.social?.phase !== 'perform' && c.heldUntil <= w.now) c.look = { angle: c.angleTo({ x, y }), until: w.now + ms };
    };

    switch (p.kind) {
      case 'sawAttack': {
        const { attacker, victim } = p;
        if (attacker === c || victim === c) return;
        // Already watching this fight: just keep watching.
        if (this.state.kind === 'watch' && [attacker, victim].includes(this.state.subject)) {
          this.state.until = w.now + 6000;
          return;
        }
        this.reactToFight(c, attacker, victim, w);
        return;
      }
      case 'heardFight':
        if (this.state.kind === 'watch' || this.state.kind === 'investigate') return;
        glance(p.x, p.y, 2000);
        c.overhead.emote('❓', w.now, 1200);
        if (c.temperament === 'bold' && !c.social) {
          // Go and see.
          c.cancelOrder();
          this.state = { kind: 'investigate', x: p.x, y: p.y, arrived: false, until: w.now + 15000 };
        } else if (c.temperament === 'meek' && !c.social) {
          this.moveAwayFrom(c, p, 5 * M, w);
        }
        return;
      case 'heard':
        if (p.audibility < 0.15 && p.noise === 'footsteps') return;
        glance(p.x, p.y);
        if ((p.noise === 'shout' || p.noise === 'thud') && !c.social) c.overhead.emote('❓', w.now, 1000);
        return;
      case 'sensedPresence':
        glance(p.who.x, p.who.y);
        return;
      case 'smelledBlood':
        c.overhead.emote('🩸', w.now, 1400);
        glance(p.x, p.y, 1500);
        if (c.temperament === 'bold' && this.state.kind === 'idle') {
          this.state = { kind: 'investigate', x: p.x, y: p.y, arrived: false, until: w.now + 12000 };
        }
        return;
      case 'stench':
        c.overhead.emote('🤢', w.now, 1400);
        if (this.state.kind === 'idle' || (this.state.kind === 'busy' && !c.social)) this.moveAwayFrom(c, p.source, p.source.radius, w);
        return;
    }
  }

  /** Saw someone attack someone else: temperament and loyalties decide. */
  private reactToFight(c: Character, attacker: Character, victim: Character, w: World): void {
    const r = w.relationships;
    const likeVictim = r.opinion(c.id, victim.id);
    const likeAttacker = r.opinion(c.id, attacker.id);
    const side = likeVictim - likeAttacker;
    w.stopDoing(c);
    w.feel(c, 'saw_fight');
    c.cancelOrder();
    c.social = null;

    if (c.temperament === 'bold') {
      if (side > 15 && victim.status === 'ok' && canFight(c.age, attacker.age)) {
        w.announce(`${c.name} steps in to defend ${victim.name}!`, [c, attacker, victim], true);
        w.noise('shout', c.x, c.y, c);
        w.witness('saw_intervene', c.x, c.y, c, victim);
        this.startFight(c, attacker, w);
        return;
      }
      if (side < -15 && victim.status === 'ok' && canFight(c.age, victim.age)) {
        w.announce(`${c.name} joins in against ${victim.name}!`, [c, attacker, victim], true);
        w.noise('shout', c.x, c.y, c);
        this.startFight(c, victim, w);
        return;
      }
      w.announce(`${c.name} shouts at ${attacker.name} to stop!`, [c, attacker, victim], true);
      c.overhead.emote('❗', w.now, 1600);
      w.noise('shout', c.x, c.y, c);
      this.state = { kind: 'watch', subject: attacker, other: victim, distance: 4 * M, until: w.now + 8000, lastPlan: 0 };
      return;
    }
    if (c.temperament === 'wary') {
      if (likeVictim > 40) {
        w.announce(`${c.name} cries out for ${victim.name}!`, [c, attacker, victim], true);
        w.noise('shout', c.x, c.y, c);
        c.overhead.emote('❗', w.now, 1600);
      } else {
        c.overhead.emote('😟', w.now, 1600);
      }
      this.state = { kind: 'watch', subject: attacker, other: victim, distance: 7 * M, until: w.now + 8000, lastPlan: 0 };
      return;
    }
    // Meek: get away from the violence.
    c.overhead.emote('😨', w.now, 1600);
    w.announce(`${c.name} backs away from the fight.`, [c, attacker, victim]);
    this.startFlee(c, attacker, w);
  }

  private moveAwayFrom(c: Character, from: Point, distance: number, w: World): void {
    const away = Math.atan2(c.y - from.y, c.x - from.x);
    for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
      const p = { x: c.x + Math.cos(away + turn) * distance, y: c.y + Math.sin(away + turn) * distance };
      if (w.orderToPoint(c, p)) {
        this.state = { kind: 'busy' };
        return;
      }
    }
  }

  // ------------------------------------------------------------ per-frame

  update(c: Character, w: World): void {
    if (c.status !== 'ok') {
      if (this.state.kind !== 'idle') this.calm(c, w);
      return;
    }
    if (c.heldUntil > w.now) return;
    if (c.doing) return;

    const s = this.state;
    switch (s.kind) {
      case 'fight':
        return this.updateFight(c, s, w);
      case 'flee':
        return this.updateFlee(c, s, w);
      case 'watch':
        return this.updateWatch(c, s, w);
      case 'investigate':
        return this.updateInvestigate(c, s, w);
      case 'busy':
        if (!c.order && !c.social) {
          if (s.linger) {
            c.look = { angle: c.angleTo(s.linger.lookAt), until: w.now + s.linger.ms };
            this.state = { kind: 'idle', until: w.now + s.linger.ms };
          } else this.state = { kind: 'idle', until: w.now + between(w.rng, 1500, 4500) };
        }
        return;
      case 'idle':
        if (w.now >= s.until) this.decide(c, w);
        return;
    }
  }

  private updateFight(c: Character, s: Extract<State, { kind: 'fight' }>, w: World): void {
    const foe = s.foe;
    const d = c.distanceTo(foe);
    if (foe.status !== 'ok' || d > 12 * M) {
      this.calm(c, w);
      return;
    }
    c.mode = 'combat';
    c.lockTarget = foe;
    if (d > 0.7 * M) {
      // Close to arm's length (not into them); re-plan as they move.
      if (!c.order || w.now - s.lastPlan > 300) {
        w.orderToCharacter(c, foe, 0.6 * M);
        s.lastPlan = w.now;
      }
    } else {
      c.cancelOrder();
      if (w.now >= s.nextPunch) {
        w.punch(c, s.hand);
        s.hand = s.hand === 'right' ? 'left' : 'right';
        s.nextPunch = w.now + between(w.rng, 550, 950);
      }
    }
  }

  private updateFlee(c: Character, s: Extract<State, { kind: 'flee' }>, w: World): void {
    const from = s.from;
    const d = c.distanceTo(from);
    if (from.status !== 'ok' || (d > 9 * M && w.now > s.calmAt)) {
      this.calm(c, w);
      return;
    }
    if (d < 9 * M) s.calmAt = w.now + 4000;

    // Cornered: they've caught up and stayed close.
    if (d < 1.2 * M) {
      s.closeSince ??= w.now;
      if (w.now - s.closeSince > 1200) {
        const response = reactToAttack(c.temperament, c.health / MAX_HEALTH, true);
        if (response === 'fight' && canFight(c.age, from.age)) {
          w.announce(`${c.name} is cornered and fights back!`, [c, from], true);
          this.startFight(c, from, w);
        } else if (response === 'yield') {
          w.yieldTo(c, from);
        }
        return;
      }
    } else {
      s.closeSince = null;
    }

    if (!c.order || w.now - s.lastPlan > 700) {
      s.lastPlan = w.now;
      const away = Math.atan2(c.y - from.y, c.x - from.x);
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const p = { x: c.x + Math.cos(away + turn) * 7 * M, y: c.y + Math.sin(away + turn) * 7 * M };
        if (w.orderToPoint(c, p)) {
          if (c.order) c.order.run = true;
          break;
        }
      }
    }
  }

  private updateWatch(c: Character, s: Extract<State, { kind: 'watch' }>, w: World): void {
    const fightOver = s.subject.status !== 'ok' || s.other.status !== 'ok' || s.subject.distanceTo(s.other) > 6 * M;
    if (w.now > s.until || (fightOver && w.now > s.until - 5000)) {
      this.calm(c, w);
      return;
    }
    const cx = (s.subject.x + s.other.x) / 2;
    const cy = (s.subject.y + s.other.y) / 2;
    c.look = { angle: c.angleTo({ x: cx, y: cy }), until: w.now + 300 };
    const d = Math.hypot(c.x - cx, c.y - cy);
    // Too close for comfort: back off to watching distance.
    if (d < s.distance - M && (!c.order || w.now - s.lastPlan > 800)) {
      s.lastPlan = w.now;
      const away = Math.atan2(c.y - cy, c.x - cx);
      w.orderToPoint(c, { x: cx + Math.cos(away) * s.distance, y: cy + Math.sin(away) * s.distance });
    }
  }

  private updateInvestigate(c: Character, s: Extract<State, { kind: 'investigate' }>, w: World): void {
    if (w.now > s.until) {
      this.calm(c, w);
      return;
    }
    if (!s.arrived) {
      if (Math.hypot(c.x - s.x, c.y - s.y) < 1.8 * M) {
        s.arrived = true;
        c.cancelOrder();
        s.until = Math.min(s.until, w.now + 3500);
      } else if (!c.order) {
        if (!w.orderToPoint(c, { x: s.x, y: s.y })) this.calm(c, w);
      }
      return;
    }
    // Look around the spot.
    if (!c.look || w.now > c.look.until) c.look = { angle: w.rng() * Math.PI * 2, until: w.now + 900 };
  }

  /** Idle: pick something ordinary to do. */
  private decide(c: Character, w: World): void {
    c.mode = 'explore';
    c.lockTarget = null;
    if (this.seeToNeeds(c, w)) return;
    const partners = w.characters.filter(
      (o) =>
        o !== c &&
        o.status === 'ok' &&
        !o.social &&
        !o.brain.engaged &&
        c.distanceTo(o) < 14 * M &&
        w.relationships.opinion(c.id, o.id) > -40,
    );
    const objects = w.interactables.filter((o) => o.idleUse() !== null && c.distanceTo(o.closestPoint(c.x, c.y)) < 16 * M);
    // Pleasant smells they can catch from here (e.g. a cooking fire) draw them over.
    const draws = w.smells.filter((s) => s.pleasant && smellStrength(s, c.x, c.y) > 0 && Math.hypot(s.x - c.x, s.y - c.y) > 2.2 * M);

    const choice = weighted(w.rng, [
      ['wander', 5],
      ['idle', 2.5],
      ['use', objects.length ? 1 : 0],
      // Lonely people seek company; cold ones drift towards a fire.
      ['chat', partners.length ? 1 + 6 * (1 - c.needs.company) : 0],
      ['warm', draws.length ? 2 * (1 - c.needs.warmth) : 0],
    ] as const);

    switch (choice) {
      case 'wander': {
        const p = w.wanderPoint(c, 7 * M);
        if (p && w.orderToPoint(c, p)) {
          this.state = { kind: 'busy' };
          return;
        }
        break;
      }
      case 'use': {
        const obj = objects[Math.floor(w.rng() * objects.length)];
        w.useObject(c, obj, obj.idleUse()!);
        this.state = { kind: 'busy' };
        return;
      }
      case 'chat': {
        const partner = partners[Math.floor(w.rng() * partners.length)];
        const action = this.pickSocial(w.relationships.opinion(c.id, partner.id), w.rng);
        if (w.startSocial(c, partner, action)) {
          this.state = { kind: 'busy' };
          return;
        }
        break;
      }
      case 'warm': {
        const s = draws[0];
        const a = Math.atan2(c.y - s.y, c.x - s.x) + between(w.rng, -0.6, 0.6);
        if (w.orderToPoint(c, { x: s.x + Math.cos(a) * 1.4 * M, y: s.y + Math.sin(a) * 1.4 * M })) {
          this.state = { kind: 'busy', linger: { lookAt: s, ms: between(w.rng, 6000, 11000) } };
          return;
        }
        break;
      }
    }
    // Stand about, glancing around.
    c.look = { angle: w.rng() * Math.PI * 2, until: w.now + 1200 };
    this.state = { kind: 'idle', until: w.now + between(w.rng, 2000, 5000) };
  }

  /** Go and do whatever nearby would help their needs most, if anything's worth it. */
  private seeToNeeds(c: Character, w: World): boolean {
    let best: { obj: Offering; offer: Offer; score: number } | null = null;
    for (const obj of w.interactables) {
      if (!isOffering(obj)) continue;
      const p = obj.closestPoint(c.x, c.y);
      const d = Math.hypot(p.x - c.x, p.y - c.y) / M;
      if (d > 60) continue;
      for (const offer of obj.offers()) {
        if (offer.single && obj.users.size > 0 && !obj.users.has(c.id)) continue;
        const score = scoreOffer(offer, c.needs, d, w.hour) * (0.85 + 0.3 * w.rng());
        if (!best || score > best.score) best = { obj, offer, score };
      }
    }
    if (!best || best.score < WORTH_DOING) return false;
    w.useObject(c, best.obj, best.offer.id);
    this.state = { kind: 'busy' };
    return true;
  }

  private pickSocial(opinion: number, rng: Rng): SocialActionId {
    if (opinion >= 40) return weighted(rng, [['chat', 3], ['joke', 3], ['compliment', 2], ['embrace', 2]] as const)!;
    if (opinion >= 0) return weighted(rng, [['chat', 5], ['joke', 3], ['compliment', 2]] as const)!;
    if (opinion >= -20) return weighted(rng, [['chat', 4], ['argue', 2], ['joke', 1]] as const)!;
    return weighted(rng, [['argue', 3], ['insult', 2], ['chat', 1]] as const)!;
  }
}
