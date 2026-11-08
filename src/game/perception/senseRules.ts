/**
 * Sight and hearing rules. PLACEHOLDER numbers. Pure TypeScript.
 *
 * Sight: a forward cone with a range, blocked by walls. Being in view doesn't
 * mean being noticed: awareness builds over a moment, faster up close and in
 * the centre of vision, slower at the edges, much slower if you're sneaking.
 *
 * Hearing: noises have a loudness (how far they carry, in metres); each wall
 * between source and listener muffles them.
 */
import { PX_PER_METRE } from '../movement/tuning';

const M = PX_PER_METRE;

export const SIGHT = {
  range: 14 * M,
  halfAngle: (60 * Math.PI) / 180,
  /** Inside this distance (and in view), you're noticed at once unless sneaking. */
  closeRange: 1.2 * M,
  /** Awareness gained per second at visibility 1. */
  gainRate: 2.2,
  /** Awareness lost per second while out of sight. */
  decayRate: 0.2,
};

export interface Viewer {
  x: number;
  y: number;
  /** Radians. */
  facing: number;
}

export interface Seen {
  x: number;
  y: number;
  crouched: boolean;
  /** m/s */
  speed: number;
}

function wrap(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * How visible `t` is to `v` right now: 0 (can't be seen) to about 1.3.
 * @param clear  is there an unobstructed line between them?
 */
export function visibility(v: Viewer, t: Seen, clear: boolean): number {
  const d = Math.hypot(t.x - v.x, t.y - v.y);
  if (d > SIGHT.range || !clear) return 0;
  const off = Math.abs(wrap(Math.atan2(t.y - v.y, t.x - v.x) - v.facing));
  if (off > SIGHT.halfAngle) return 0;
  const distF = 1 - 0.75 * (d / SIGHT.range) ** 2;
  const angleF = 1 - 0.6 * (off / SIGHT.halfAngle) ** 2;
  const moveF = t.crouched ? 0.35 : t.speed < 0.2 ? 0.75 : t.speed > 2.5 ? 1.3 : 1;
  return distF * angleF * moveF;
}

/** Step an awareness level (0..1). Returns the new level. */
export function stepAwareness(current: number, vis: number, distance: number, crouched: boolean, dt: number): number {
  if (vis <= 0) return Math.max(0, current - SIGHT.decayRate * dt);
  if (distance <= SIGHT.closeRange && !crouched) return 1;
  return Math.min(1, current + SIGHT.gainRate * vis * dt);
}

export type NoiseKind = 'footsteps' | 'punch' | 'shout' | 'talk' | 'quarrel' | 'door' | 'thud';

/** How far each kind of noise carries (metres), before walls. */
export const LOUDNESS: Record<NoiseKind, number> = {
  footsteps: 3, // walking; running is louder, sneaking silent (see footstepLoudness)
  punch: 10,
  shout: 18,
  talk: 5,
  quarrel: 9,
  door: 6,
  thud: 8,
};

export function footstepLoudness(gait: 'still' | 'crouch' | 'walk' | 'sprint'): number {
  return gait === 'sprint' ? 7 : gait === 'walk' ? 3 : 0;
}

/** Each wall in the way keeps this fraction of the loudness. */
export const WALL_MUFFLE = 0.35;

/**
 * How clearly a noise is heard: 0 (not at all) to 1 (right next to it).
 * @param loudnessM  metres the noise carries
 * @param walls      walls between source and listener
 */
export function audibility(distancePx: number, loudnessM: number, walls: number): number {
  const reach = loudnessM * M * WALL_MUFFLE ** walls;
  if (reach <= 0 || distancePx >= reach) return 0;
  return 1 - distancePx / reach;
}
