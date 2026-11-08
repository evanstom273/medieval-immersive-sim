/** Small seeded PRNG (mulberry32), so behaviour can be reproduced from a seed. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function between(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Pick by weight. Entries with weight ≤ 0 are skipped; returns null if nothing is pickable. */
export function weighted<T>(rng: Rng, entries: readonly [T, number][]): T | null {
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [item, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return item;
  }
  return entries.filter(([, w]) => w > 0).at(-1)![0];
}
