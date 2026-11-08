import { MAX_HEALTH, reactToAttack } from '../combat/combat';
import { PX_PER_METRE } from '../movement/tuning';
import type { Point } from '../navigation/NavGrid';
import type { Relationships } from '../social/relationships';
import type { SocialActionId } from '../social/socialActions';
import { between, weighted, type Rng } from '../util/rng';
import type { Hand } from '../world/CharacterView';
import type { Interactable } from '../world/interactables';
import type { Character } from './Character';

/**
 * Autonomy for characters the player isn't controlling. PLACEHOLDER behaviour:
 * idle wandering, using nearby objects, chatting to people, and reacting to
 * being attacked by temperament (fight / flee / yield).
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
  orderToPoint(c: Character, p: Point): boolean;
  /** Walk until within `reach` of a moving character. */
  orderToCharacter(c: Character, target: Character, reach: number): boolean;
  wanderPoint(c: Character, radius: number): Point | null;
  useObject(c: Character, obj: Interactable, optionId: string): void;
  startSocial(c: Character, target: Character, action: SocialActionId): boolean;
  punch(c: Character, hand: Hand): void;
  yieldTo(c: Character, attacker: Character | null): void;
  announce(message: string, involves: Character[]): void;
}

const M = PX_PER_METRE;

type State =
  | { kind: 'idle'; until: number }
  /** Doing something with an order or a conversation; back to idle when it ends. */
  | { kind: 'busy' }
  | { kind: 'fight'; foe: Character; nextPunch: number; hand: Hand; lastPlan: number }
  | { kind: 'flee'; from: Character; lastPlan: number; calmAt: number; closeSince: number | null };

export class Brain {
  state: State = { kind: 'idle', until: 0 };

  get activity(): string {
    switch (this.state.kind) {
      case 'fight':
        return `Fighting ${this.state.foe.name}`;
      case 'flee':
        return `Fleeing ${this.state.from.name}`;
      default:
        return '';
    }
  }

  reset(now: number): void {
    this.state = { kind: 'idle', until: now + 800 };
  }

  /** Someone hit us. Decide by temperament and how hurt we are. */
  onAttacked(c: Character, attacker: Character, w: World): void {
    if (c.status !== 'ok') return;
    const response = reactToAttack(c.temperament, c.health / MAX_HEALTH, false);
    if (response === 'yield') {
      w.yieldTo(c, attacker);
      return;
    }
    if (response === 'fight') {
      if (this.state.kind !== 'fight' || this.state.foe !== attacker) {
        w.announce(`${c.name} fights back!`, [c, attacker]);
        this.startFight(c, attacker, w);
      }
      return;
    }
    if (this.state.kind !== 'flee') {
      w.announce(`${c.name} runs from ${attacker.name}!`, [c, attacker]);
      c.cancelOrder();
      c.social = null;
      this.state = { kind: 'flee', from: attacker, lastPlan: 0, calmAt: w.now + 4000, closeSince: null };
    }
  }

  private startFight(c: Character, foe: Character, w: World): void {
    c.cancelOrder();
    c.social = null;
    c.mode = 'combat';
    c.lockTarget = foe;
    this.state = { kind: 'fight', foe, nextPunch: w.now + 350, hand: 'right', lastPlan: 0 };
  }

  private calm(c: Character, w: World): void {
    c.mode = 'explore';
    c.lockTarget = null;
    c.cancelOrder();
    this.state = { kind: 'idle', until: w.now + between(w.rng, 1500, 3500) };
  }

  update(c: Character, w: World): void {
    if (c.status !== 'ok') {
      if (this.state.kind === 'fight' || this.state.kind === 'flee') this.calm(c, w);
      return;
    }
    if (c.heldUntil > w.now) return;

    const s = this.state;
    switch (s.kind) {
      case 'fight':
        return this.updateFight(c, s, w);
      case 'flee':
        return this.updateFlee(c, s, w);
      case 'busy':
        if (!c.order && !c.social) this.state = { kind: 'idle', until: w.now + between(w.rng, 1500, 4500) };
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
        if (response === 'fight') {
          w.announce(`${c.name} is cornered and fights back!`, [c, from]);
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

  /** Idle: pick something ordinary to do. */
  private decide(c: Character, w: World): void {
    c.mode = 'explore';
    c.lockTarget = null;
    const partners = w.characters.filter(
      (o) =>
        o !== c &&
        o.status === 'ok' &&
        !o.social &&
        o.brain.state.kind !== 'fight' &&
        o.brain.state.kind !== 'flee' &&
        c.distanceTo(o) < 14 * M &&
        w.relationships.opinion(c.id, o.id) > -40,
    );
    const objects = w.interactables.filter((o) => o.idleUse() !== null && c.distanceTo(o.closestPoint(c.x, c.y)) < 16 * M);

    const choice = weighted(w.rng, [
      ['wander', 5],
      ['idle', 2.5],
      ['use', objects.length ? 1 : 0],
      ['chat', partners.length ? 2 : 0],
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
    }
    // Stand about, glancing around.
    c.look = { angle: w.rng() * Math.PI * 2, until: w.now + 1200 };
    this.state = { kind: 'idle', until: w.now + between(w.rng, 2000, 5000) };
  }

  private pickSocial(opinion: number, rng: Rng): SocialActionId {
    if (opinion >= 40) return weighted(rng, [['chat', 3], ['joke', 3], ['compliment', 2], ['embrace', 2]] as const)!;
    if (opinion >= 0) return weighted(rng, [['chat', 5], ['joke', 3], ['compliment', 2]] as const)!;
    if (opinion >= -20) return weighted(rng, [['chat', 4], ['argue', 2], ['joke', 1]] as const)!;
    return weighted(rng, [['argue', 3], ['insult', 2], ['chat', 1]] as const)!;
  }
}
