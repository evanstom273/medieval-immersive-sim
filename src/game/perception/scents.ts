/**
 * Smell. PLACEHOLDER numbers. Pure TypeScript.
 *
 * - Scent marks: left in the world and fading over time. Everyone leaves a
 *   faint trail as they move; fights leave blood.
 * - Smell sources: fixed things that smell (a cooking fire's smoke, a midden).
 * - Presence: very close by, you can sense someone even if you can't see them
 *   (handled with sight in the senses system).
 */

export type ScentKind = 'trail' | 'blood';

export interface ScentMark {
  id: number;
  kind: ScentKind;
  x: number;
  y: number;
  /** 0..1 */
  strength: number;
  /** Strength lost per second. */
  fade: number;
  /** Whose trail / whose blood. */
  owner?: string;
}

export class ScentField {
  marks: ScentMark[] = [];
  private nextId = 1;

  add(m: Omit<ScentMark, 'id'>): ScentMark {
    const mark = { ...m, id: this.nextId++ };
    this.marks.push(mark);
    return mark;
  }

  update(dt: number): void {
    for (const m of this.marks) m.strength -= m.fade * dt;
    this.marks = this.marks.filter((m) => m.strength > 0);
  }

  /** Marks within `radius` px of (x, y), strongest first. */
  near(x: number, y: number, radius: number, kind?: ScentKind): ScentMark[] {
    return this.marks
      .filter((m) => (!kind || m.kind === kind) && Math.hypot(m.x - x, m.y - y) <= radius)
      .sort((a, b) => b.strength - a.strength);
  }
}

export type SmellKind = 'smoke' | 'dung';

export interface SmellSource {
  id: string;
  kind: SmellKind;
  x: number;
  y: number;
  /** How far it can be smelled (px). */
  radius: number;
  /** Do people like it (drawn to it) or not (keep away)? */
  pleasant: boolean;
}

/** 0 (can't smell it) to 1 (right on top of it). */
export function smellStrength(s: SmellSource, x: number, y: number): number {
  return Math.max(0, 1 - Math.hypot(s.x - x, s.y - y) / s.radius);
}

export const SCENT = {
  /** Trails: a mark every this many seconds while moving. Sneaking leaves a fainter trail. */
  trailEvery: 0.6,
  trailFade: 1 / 40,
  bloodFade: 1 / 180,
  /** How close you need to be to smell a scent mark. */
  smellRange: 2.5,
  /** Presence: sense someone unseen this close (m). */
  presenceRange: 1.6,
};
