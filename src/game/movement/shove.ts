/**
 * People bumping into each other. Pure TypeScript.
 *
 * Arcade physics always splits an overlap 50/50 (and wipes out both people's
 * velocity), so people are kept apart here instead: when two overlap, each is
 * moved out of the way in proportion to how easy they are to shift. A big,
 * stubborn, braced person barely budges; a slight, meek one is easily shoved.
 *
 * PLACEHOLDER numbers throughout.
 */

export interface Build {
  heightM: number;
  weightKg: number;
}

export interface ShoveFactors {
  build: Build;
  /** 0–10 (the Labour skill, for now, stands in for strength). */
  strength: number;
  temperament: 'bold' | 'wary' | 'meek';
  traits: readonly string[];
  /** Standing still / squared up / crouched: braced. */
  braced: boolean;
  /** Out cold: dead weight, but nothing holding them up. */
  limp: boolean;
}

export const TEMPERAMENT_STAND: Record<ShoveFactors['temperament'], number> = { bold: 1.15, wary: 1, meek: 0.8 };

/** Traits that change how readily someone gives way (case-insensitive). */
export const TRAIT_STAND: Record<string, number> = {
  strong: 1.25,
  'hot-headed': 1.15,
  brash: 1.15,
  stubborn: 1.2,
  gentle: 0.85,
  cautious: 0.9,
};

/** How hard someone is to move (bigger = harder). Roughly kilograms of "stand". */
export function resistance(f: ShoveFactors): number {
  let r = f.build.weightKg * (1 + f.strength / 20) * TEMPERAMENT_STAND[f.temperament];
  for (const t of f.traits) r *= TRAIT_STAND[t.toLowerCase()] ?? 1;
  if (f.braced) r *= 1.3;
  if (f.limp) r *= 0.7;
  return r;
}

export interface Body {
  x: number;
  y: number;
  r: number;
  resistance: number;
}

/**
 * Push overlapping people apart. Returns how far to move each (same order).
 * Each pair's overlap is shared out inversely to resistance: the lighter
 * share goes to whoever holds their ground.
 */
export function separate(bodies: readonly Body[], iterations = 2): { dx: number; dy: number }[] {
  const pos = bodies.map((b) => ({ x: b.x, y: b.y }));
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = pos[i];
        const b = pos[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const overlap = bodies[i].r + bodies[j].r - d;
        if (overlap <= 0) continue;
        if (d < 1e-6) {
          // Exactly on top of each other: pick a direction.
          dx = 1;
          dy = 0;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        const ra = bodies[i].resistance;
        const rb = bodies[j].resistance;
        const shareA = rb / (ra + rb);
        const shareB = ra / (ra + rb);
        a.x -= nx * overlap * shareA;
        a.y -= ny * overlap * shareA;
        b.x += nx * overlap * shareB;
        b.y += ny * overlap * shareB;
      }
    }
  }
  return pos.map((p, i) => ({ dx: p.x - bodies[i].x, dy: p.y - bodies[i].y }));
}
