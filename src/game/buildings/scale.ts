import type { Building, Fixture, Plot, Storey, Wall } from './format';

/**
 * Building scale (a test setting, from the Tuning panel): rooms spread out by
 * `size`, storeys taller by `height`, while the parts people use stay human:
 * walls keep their thickness, doors and windows their size, hearths theirs,
 * stairs their width (they get longer, to climb the taller storeys).
 */
export interface BuildingScale {
  /** Floor plans × this. */
  size: number;
  /** Storey heights × this. */
  height: number;
}

export const DEFAULT_SCALE: BuildingScale = { size: 3, height: 1.5 };
const KEY = 'mis.buildingScale';

export function loadScale(): BuildingScale {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as BuildingScale | null;
    if (s && s.size >= 1 && s.size <= 6 && s.height >= 1 && s.height <= 3) return s;
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SCALE };
}

export function saveScale(s: BuildingScale): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/**
 * Scale a building. Every coordinate keeps its distance from the nearest wall line (so a room's
 * edge stays at the wall's face, a hearth stays against its wall), while the wall lines themselves
 * spread out by `k`.
 */
export function scaleBuilding(b: Building, { size: k, height: hk }: BuildingScale): Building {
  if (k === 1 && hk === 1) return b;
  const xs = new Set<number>([0, b.size.w]);
  const ys = new Set<number>([0, b.size.d]);
  for (const s of b.storeys) {
    for (const w of s.walls) {
      if (w.from[0] === w.to[0]) xs.add(w.from[0]);
      else if (w.from[1] === w.to[1]) ys.add(w.from[1]);
      else {
        xs.add(w.from[0]).add(w.to[0]);
        ys.add(w.from[1]).add(w.to[1]);
      }
    }
  }
  const near = (set: Set<number>, v: number) => {
    let best = 0;
    let d = Infinity;
    for (const a of set) {
      if (Math.abs(v - a) < d) {
        d = Math.abs(v - a);
        best = a;
      }
    }
    return best;
  };
  const X = (v: number) => {
    const a = near(xs, v);
    return a * k + (v - a);
  };
  const Y = (v: number) => {
    const a = near(ys, v);
    return a * k + (v - a);
  };
  const P = (p: [number, number]): [number, number] => [X(p[0]), Y(p[1])];

  const wall = (w: Wall): Wall => {
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
    const from = P(w.from);
    const to = P(w.to);
    const len2 = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return {
      ...w,
      from,
      to,
      top: w.top === undefined ? undefined : w.top * hk,
      // Openings keep their size; their middles move with the wall.
      openings: w.openings.map((o) => ({ ...o, at: Math.max(0, Math.min(len2 - o.width, ((o.at + o.width / 2) * len2) / len - o.width / 2)) })),
    };
  };
  const fixture = (f: Fixture): Fixture => {
    if (f.kind === 'stair' || f.kind === 'ladder' || f.kind === 'stairwell' || f.kind === 'hatch') {
      // Longer, to climb the taller storey; with more landing at the top in proportion.
      const run = f.d * hk;
      const y = f.kind === 'hatch' ? Y(f.y) + (f.y - near(ys, f.y)) * (k - 1) : Y(f.y) + (f.y - near(ys, f.y)) * (k - 1);
      return { ...f, x: X(f.x), y, d: run };
    }
    return { ...f, x: X(f.x), y: Y(f.y) };
  };
  const storey = (s: Storey): Storey => ({
    ...s,
    floorZ: s.floorZ * hk,
    height: s.height * hk,
    walls: s.walls.map(wall),
    rooms: s.rooms.map((r) => ({ ...r, outline: r.outline.map(P) })),
    fixtures: s.fixtures.map(fixture),
  });
  return {
    ...b,
    size: { w: b.size.w * k, d: b.size.d * k },
    storeys: b.storeys.map(storey),
    roof: { ...b.roof, eaves: b.roof.eaves * hk },
    chimneys: b.chimneys.map((c) => ({ ...c, x: X(c.x), y: Y(c.y) })),
    gablets: b.gablets?.map((g) => ({ ...g, x: X(g.x), w: X(g.x + g.w) - X(g.x), from: Y(g.from), to: Y(g.to), eaves: g.eaves * hk })),
    sign: b.sign ? { ...b.sign, at: b.sign.at * k } : undefined,
  };
}

/** Scale a row of plots: buildings and the gaps along the row. */
export function scalePlots(plots: Plot[], s: BuildingScale): Plot[] {
  return plots.map((p) => ({ building: scaleBuilding(p.building, s), x: p.x * s.size, y: p.y * s.size }));
}
