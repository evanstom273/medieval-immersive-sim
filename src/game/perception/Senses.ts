import type { Character } from '../characters/Character';
import { PX_PER_METRE } from '../movement/tuning';
import type { Point } from '../navigation/NavGrid';
import type { Relationships } from '../social/relationships';
import { Memories, type MemoryKind } from './memory';
import { SCENT, ScentField, smellStrength, type SmellSource } from './scents';
import { LOUDNESS, SIGHT, audibility, stepAwareness, visibility, type NoiseKind } from './senseRules';
import { SpatialHash } from './spatialHash';

const M = PX_PER_METRE;

/** Something a character has just perceived, handed to their brain to decide what to do. */
export type Perception =
  | { kind: 'sawAttack'; attacker: Character; victim: Character }
  | { kind: 'heardFight'; x: number; y: number }
  | { kind: 'heard'; x: number; y: number; noise: NoiseKind; source?: Character; audibility: number }
  | { kind: 'sensedPresence'; who: Character }
  | { kind: 'smelledBlood'; x: number; y: number }
  | { kind: 'stench'; source: SmellSource };

export interface SensesHost {
  readonly now: number;
  readonly characters: readonly Character[];
  readonly relationships: Relationships;
  /** Unobstructed line of sight between two points? */
  sightClear(a: Point, b: Point): boolean;
  /** How many walls lie between two points (for muffling sound). */
  wallsBetween(a: Point, b: Point): number;
  /** Deliver a perception (the host passes it to the character's brain if it has one in charge). */
  perceive(c: Character, p: Perception): void;
}

export interface NoiseEvent {
  kind: NoiseKind;
  x: number;
  y: number;
  /** Metres it carries. */
  loudness: number;
  at: number;
}

const TICK = 0.1;

/**
 * Everyone's senses: sight (awareness of each other), hearing (noise events),
 * smell (presence, scent marks, smell sources), and what they remember.
 * Applies to every character, including the one the player controls: they
 * perceive and remember too, they just don't react automatically.
 */
export class Senses {
  readonly scents = new ScentField();
  readonly smells: SmellSource[] = [];
  readonly memories = new Map<string, Memories>();
  /** Recent noises, for the debug overlay. */
  recentNoises: NoiseEvent[] = [];

  private awareness = new Map<string, number>();
  private noticedAt = new Map<string, number>();
  private lastPresence = new Map<string, number>();
  private smelledMarks = new Map<string, Set<number>>();
  private lastStench = new Map<string, number>();
  private trailTimer = new Map<string, number>();
  /** Who each observer has some awareness of (so awareness of people out of range can still fade). */
  private known = new Map<string, Set<Character>>();
  /** Staggered ticks: observers are updated a few at a time, round-robin, each about every TICK. */
  private cursor = 0;
  private cursorAcc = 0;
  private lastTick = new Map<string, number>();
  private grid = new SpatialHash<Character>(SIGHT.range);
  private nearby: Character[] = [];
  private pruneAt = 0;

  constructor(private readonly host: SensesHost) {
    for (const c of host.characters) this.memories.set(c.id, new Memories());
  }

  /** Someone left the world: forget everything keyed by them. */
  removeCharacter(c: Character): void {
    this.memories.delete(c.id);
    for (const map of [this.awareness, this.noticedAt, this.lastPresence] as Map<string, number>[]) {
      for (const k of [...map.keys()]) if (k.startsWith(`${c.id}>`) || k.endsWith(`>${c.id}`)) map.delete(k);
    }
    this.smelledMarks.delete(c.id);
    this.trailTimer.delete(c.id);
    this.lastTick.delete(c.id);
    this.known.delete(c.id);
    for (const set of this.known.values()) set.delete(c);
  }

  /** Someone new arrived (e.g. spawned in). */
  addCharacter(c: Character): void {
    if (!this.memories.has(c.id)) this.memories.set(c.id, new Memories());
  }

  private key(o: Character, t: Character): string {
    return `${o.id}>${t.id}`;
  }

  private setAwareness(o: Character, t: Character, v: number): void {
    const k = this.key(o, t);
    let set = this.known.get(o.id);
    if (v > 0) {
      this.awareness.set(k, v);
      if (!set) this.known.set(o.id, (set = new Set()));
      set.add(t);
    } else {
      this.awareness.delete(k);
      set?.delete(t);
    }
  }

  /** How aware `o` is of `t`: 0 (not at all) .. 1 (noticed). */
  awarenessOf(o: Character, t: Character): number {
    return this.awareness.get(this.key(o, t)) ?? 0;
  }

  /** Did `o` notice `t` within the last `ms`? */
  justNoticed(o: Character, t: Character, ms = 1500): boolean {
    const at = this.noticedAt.get(this.key(o, t));
    return at !== undefined && this.host.now - at < ms;
  }

  memoriesOf(c: Character): Memories {
    return this.memories.get(c.id)!;
  }

  /** How visible a point/person is to `o` right now (0 = can't see it). */
  visibilityTo(o: Character, t: { x: number; y: number; crouched?: boolean; speed?: number }): number {
    if (o.status === 'ko' || o.asleep) return 0;
    // Range and field of view first: the line-of-sight check is the expensive part, so only do it if they'd otherwise be seen.
    const v = visibility({ x: o.x, y: o.y, facing: o.motor.facing }, { x: t.x, y: t.y, crouched: !!t.crouched, speed: t.speed ?? 1.4 }, true);
    if (v <= 0) return 0;
    return this.host.sightClear({ x: o.x, y: o.y }, t) ? v : 0;
  }

  update(dt: number): void {
    const now = this.host.now;
    this.scents.update(dt);
    this.recentNoises = this.recentNoises.filter((n) => now - n.at < 700);

    // Everyone moving leaves a faint trail; sneaking leaves a fainter one.
    for (const c of this.host.characters) {
      const speed = Math.hypot(c.motor.vx, c.motor.vy) / M;
      if (c.status !== 'ok' || speed < 0.3) continue;
      const t = (this.trailTimer.get(c.id) ?? 0) + dt;
      if (t >= SCENT.trailEvery) {
        this.scents.add({ kind: 'trail', x: c.x, y: c.y, strength: c.motor.crouched ? 0.4 : 0.8, fade: SCENT.trailFade, owner: c.id });
        this.trailTimer.set(c.id, 0);
      } else this.trailTimer.set(c.id, t);
    }

    // Each observer's senses tick about every TICK, but spread out: a few observers per frame,
    // round-robin, so a crowd doesn't do everyone's looking in one frame.
    const all = this.host.characters;
    if (all.length === 0) return;
    this.cursorAcc += (all.length * dt) / TICK;
    const count = Math.min(all.length, Math.floor(this.cursorAcc));
    this.cursorAcc -= count;
    if (count === 0) return;
    this.grid.build(all);

    for (let n = 0; n < count; n++) {
      const o = all[this.cursor++ % all.length];
      this.cursor %= all.length;
      const step = Math.min(1, (now - (this.lastTick.get(o.id) ?? now - TICK * 1000)) / 1000);
      this.lastTick.set(o.id, now);
      if (o.status === 'ko') continue;

      // Only people within sight range can be seen or sensed; everyone else known just fades.
      const near = this.grid.query(o.x, o.y, SIGHT.range, this.nearby);
      const seen = new Set<Character>();
      for (const t of near) {
        if (t === o) continue;
        const d = Math.hypot(t.x - o.x, t.y - o.y);
        if (d > SIGHT.range) continue;
        seen.add(t);
        const k = this.key(o, t);
        const cur = this.awareness.get(k) ?? 0;
        const speed = Math.hypot(t.motor.vx, t.motor.vy) / M;
        const vis = this.visibilityTo(o, { x: t.x, y: t.y, crouched: t.motor.crouched, speed });
        let next = stepAwareness(cur, vis, d, t.motor.crouched, step);
        // Smell/feel someone right behind you, even unseen.
        if (vis === 0 && d < SCENT.presenceRange * M && t.status !== 'ko') {
          next = Math.max(next, Math.min(0.7, cur + 0.5 * step));
          if (now - (this.lastPresence.get(k) ?? -Infinity) > 4000) {
            this.lastPresence.set(k, now);
            this.host.perceive(o, { kind: 'sensedPresence', who: t });
          }
        }
        if (cur < 1 && next >= 1) this.noticedAt.set(k, now);
        this.setAwareness(o, t, next);
      }
      const known = this.known.get(o.id);
      if (known) for (const t of [...known]) if (!seen.has(t)) this.setAwareness(o, t, stepAwareness(this.awareness.get(this.key(o, t)) ?? 0, 0, Infinity, false, step));

      // Blood nearby.
      let smelled = this.smelledMarks.get(o.id);
      if (!smelled) this.smelledMarks.set(o.id, (smelled = new Set()));
      for (const mark of this.scents.near(o.x, o.y, SCENT.smellRange * M, 'blood')) {
        if (mark.strength < 0.15 || smelled.has(mark.id)) continue;
        smelled.add(mark.id);
        this.remember(o, 'smelled_blood', 'smell', mark.x, mark.y, Math.min(1, mark.strength), undefined, mark.owner);
        this.host.perceive(o, { kind: 'smelledBlood', x: mark.x, y: mark.y });
      }

      // Unpleasant smells.
      for (const s of this.smells) {
        if (s.pleasant || smellStrength(s, o.x, o.y) < 0.4) continue;
        const k = `${o.id}>${s.id}`;
        if (now - (this.lastStench.get(k) ?? -Infinity) < 15000) continue;
        this.lastStench.set(k, now);
        this.host.perceive(o, { kind: 'stench', source: s });
      }
    }

    if (now > this.pruneAt) {
      this.pruneAt = now + 5000;
      for (const m of this.memories.values()) m.prune(now);
    }
  }

  /** A noise happens. Everyone in earshot who can't already see its source hears it. */
  noise(kind: NoiseKind, x: number, y: number, source?: Character, loudness = LOUDNESS[kind]): void {
    if (loudness <= 0) return;
    const now = this.host.now;
    this.recentNoises.push({ kind, x, y, loudness, at: now });
    for (const o of this.host.characters) {
      if (o === source || o.status === 'ko') continue;
      const dist = Math.hypot(x - o.x, y - o.y);
      if (dist >= loudness * M) continue; // out of earshot even with no walls: skip counting walls
      const aud = audibility(dist, loudness, this.host.wallsBetween({ x: o.x, y: o.y }, { x, y }));
      if (aud <= 0) continue;
      // Already watching whoever made it: nothing new learned by ear.
      if (source && this.awarenessOf(o, source) >= 1 && this.visibilityTo(o, source) > 0) continue;
      if (source) {
        const k = this.key(o, source);
        const cur = this.awareness.get(k) ?? 0;
        // Hearing alone can make you suspect someone's there, not be sure.
        this.setAwareness(o, source, Math.max(cur, Math.min(0.6, cur + 0.3 * aud)));
      }
      if (kind === 'punch') {
        this.remember(o, 'heard_fight', 'sound', x, y, 0.3 + 0.4 * aud);
        this.host.perceive(o, { kind: 'heardFight', x, y });
      } else {
        this.host.perceive(o, { kind: 'heard', x, y, noise: kind, source, audibility: aud });
      }
    }
  }

  /** Someone hit someone. The victim knows; anyone who can see the spot witnesses it. */
  attack(attacker: Character, victim: Character): void {
    const x = (attacker.x + victim.x) / 2;
    const y = (attacker.y + victim.y) / 2;
    this.remember(victim, 'was_attacked', 'touch', attacker.x, attacker.y, 1, attacker.id, victim.id);
    // You know exactly who just hit you.
    const k = this.key(victim, attacker);
    if ((this.awareness.get(k) ?? 0) < 1) this.noticedAt.set(k, this.host.now);
    this.setAwareness(victim, attacker, 1);
    for (const o of this.witnesses(x, y, [attacker, victim])) {
      const vis = this.visibilityTo(o, { x, y, speed: 2 });
      this.remember(o, 'saw_attack', 'sight', x, y, Math.min(1, 0.4 + vis * 0.5), attacker.id, victim.id);
      // Seeing someone attacked sours you on the attacker, more so if you like the victim.
      const r = this.host.relationships;
      r.adjust(o.id, attacker.id, -4 - Math.max(0, r.opinion(o.id, victim.id)) / 10);
      this.host.perceive(o, { kind: 'sawAttack', attacker, victim });
    }
  }

  /** Something visible happened (a yield, a knockout, someone stepping in): record it for anyone who saw. */
  witness(kind: MemoryKind, x: number, y: number, actor?: Character, target?: Character): void {
    for (const o of this.witnesses(x, y, [actor, target])) {
      const vis = this.visibilityTo(o, { x, y, speed: 2 });
      this.remember(o, kind, 'sight', x, y, Math.min(1, 0.4 + vis * 0.5), actor?.id, target?.id);
    }
  }

  private witnesses(x: number, y: number, exclude: (Character | undefined)[]): Character[] {
    return this.host.characters.filter((o) => !exclude.includes(o) && o.status !== 'ko' && this.visibilityTo(o, { x, y, speed: 2 }) > 0);
  }

  private remember(o: Character, kind: MemoryKind, sense: 'sight' | 'sound' | 'smell' | 'touch', x: number, y: number, confidence: number, actor?: string, target?: string): void {
    this.memoriesOf(o).record({ kind, sense, actor, target, x, y, at: this.host.now, confidence });
  }
}
