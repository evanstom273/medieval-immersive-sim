import { between, createRng, type Rng } from '../util/rng';

/**
 * A generated region around the village: terrain (hills, a river, woods), settlements (villages, ours
 * among them, and a market town), lords' places (manors, a castle), the open fields and commons round
 * each village, and the roads between them. Metres, with the playable village's world at the origin
 * (it spans 0..villageW × 0..villageH). Pure and seeded: the same seed always gives the same region.
 *
 * PLACEHOLDER: only the home village is a real place yet; the rest is drawn so the zoom can be built
 * and tuned, and is meant to become real places later. Places are labelled plainly until they're named.
 */

export type P = [number, number];

export type SettlementKind = 'home' | 'village' | 'town' | 'manor' | 'castle';

export interface Settlement {
  kind: SettlementKind;
  x: number;
  y: number;
  label: string;
  /** Houses drawn round it (small rectangles), metres. */
  houses: { x: number; y: number; w: number; h: number; a: number }[];
}

export interface Road {
  points: P[];
  /** A main road (between towns and villages) or a track. */
  main: boolean;
}

export interface Region {
  seed: number;
  /** Bounds, metres. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  settlements: Settlement[];
  roads: Road[];
  river: P[];
  /** Open-field strips (four corners each). */
  fields: P[][];
  /** Commons: rough blobs. */
  commons: P[][];
  /** Woods: overlapping circles (x, y, r) that read as woodland together. */
  woods: [number, number, number][];
  /** Hills: where to draw a hill mark (x, y, size). */
  hills: [number, number, number][];
}

export interface RegionOptions {
  seed?: number;
  /** The home village's world size (metres); it sits at 0..w × 0..h. */
  villageW: number;
  villageH: number;
  /** Half the region's width and height (metres). */
  halfW?: number;
  halfH?: number;
}

/** Smooth value noise in 0..1. */
function noise2(seed: number): (x: number, y: number) => number {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 144269) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  const one = (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * fx;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x, y) => (one(x, y) * 0.55 + one(x * 2.1 + 17, y * 2.1 + 9) * 0.3 + one(x * 4.3 + 41, y * 4.3 + 23) * 0.15);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function distToPolyline(x: number, y: number, pl: P[]): number {
  let best = Infinity;
  for (let i = 0; i < pl.length - 1; i++) {
    const [ax, ay] = pl[i];
    const [bx, by] = pl[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/** A road between two points that wanders a little (midpoint displacement). */
function wander(rng: Rng, a: P, b: P, depth = 4, amount = 0.12): P[] {
  if (depth === 0) return [a, b];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / (len || 1);
  const ny = (b[0] - a[0]) / (len || 1);
  const off = between(rng, -amount, amount) * len;
  const m: P = [mx + nx * off, my + ny * off];
  return [...wander(rng, a, m, depth - 1, amount), ...wander(rng, m, b, depth - 1, amount).slice(1)];
}

function cluster(rng: Rng, x: number, y: number, n: number, spread: number, size: [number, number]): Settlement['houses'] {
  const out: Settlement['houses'] = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * spread;
    out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, w: between(rng, size[0], size[1]), h: between(rng, size[0] * 0.55, size[1] * 0.6), a: between(rng, -0.4, 0.4) });
  }
  return out;
}

export function generateRegion(o: RegionOptions): Region {
  const seed = o.seed ?? 1647;
  const rng = createRng(seed);
  const halfW = o.halfW ?? 6000;
  const halfH = o.halfH ?? 4500;
  const cx = o.villageW / 2;
  const cy = o.villageH / 2;
  const x0 = cx - halfW;
  const x1 = cx + halfW;
  const y0 = cy - halfH;
  const y1 = cy + halfH;
  const height = noise2(seed);
  const woodsNoise = noise2(seed + 101);
  const h = (x: number, y: number) => height(x / 2600, y / 2600);

  // ---- the river: from the north edge, wandering south and downhill, passing east of home.
  const river: P[] = [];
  let rx = cx + between(rng, 700, 1600);
  for (let y = y0; y <= y1; y += 120) {
    const left = h(rx - 150, y);
    const right = h(rx + 150, y);
    rx += (left < right ? -1 : 1) * 30 + between(rng, -45, 45);
    // Keep clear of home and the region's edges.
    if (Math.abs(rx - cx) < 500 && Math.abs(y - cy) < 900) rx = cx + Math.sign(rx - cx || 1) * 500;
    rx = Math.max(x0 + 600, Math.min(x1 - 600, rx));
    river.push([rx, y]);
  }

  // ---- settlements
  const settlements: Settlement[] = [];
  const place = (kind: SettlementKind, x: number, y: number, label: string, houses: Settlement['houses']) => {
    const s = { kind, x, y, label, houses };
    settlements.push(s);
    return s;
  };
  const home = place('home', cx, cy, 'Home', []);
  // The market town: on the river, a few kilometres off.
  let town: Settlement | null = null;
  for (let tries = 0; tries < 200 && !town; tries++) {
    const i = Math.floor(between(rng, 0.15, 0.85) * river.length);
    const [tx, ty] = river[i];
    if (Math.hypot(tx - cx, ty - cy) < 2400 || Math.hypot(tx - cx, ty - cy) > 4200) continue;
    const side = rng() < 0.5 ? -1 : 1;
    town = place('town', tx + side * 220, ty, 'Market town', cluster(rng, tx + side * 220, ty, 46, 260, [14, 26]));
  }
  if (!town) town = place('town', cx + 3000, cy, 'Market town', cluster(rng, cx + 3000, cy, 46, 260, [14, 26]));
  // Villages: spread out (Poisson-disc style), off the river.
  for (let tries = 0; tries < 600 && settlements.filter((s) => s.kind === 'village').length < 5; tries++) {
    const x = between(rng, x0 + 900, x1 - 900);
    const y = between(rng, y0 + 900, y1 - 900);
    if (settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 2100)) continue;
    if (distToPolyline(x, y, river) < 260) continue;
    place('village', x, y, 'Village', cluster(rng, x, y, 14, 120, [10, 18]));
  }
  // Manors: beside two of the villages (one by home).
  for (const near of [home, ...settlements.filter((s) => s.kind === 'village').slice(0, 1)]) {
    for (let tries = 0; tries < 50; tries++) {
      const a = rng() * Math.PI * 2;
      const r = between(rng, 450, 750);
      const x = near.x + Math.cos(a) * r;
      const y = near.y + Math.sin(a) * r;
      if (distToPolyline(x, y, river) < 200 || settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 400)) continue;
      place('manor', x, y, 'Manor', cluster(rng, x, y, 3, 30, [14, 26]));
      break;
    }
  }
  // The castle: the highest ground within reach of the town.
  let best: P = [town.x + 1500, town.y];
  let bestH = -1;
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2;
    const r = between(rng, 900, 2600);
    const x = town.x + Math.cos(a) * r;
    const y = town.y + Math.sin(a) * r;
    if (x < x0 + 600 || x > x1 - 600 || y < y0 + 600 || y > y1 - 600) continue;
    if (distToPolyline(x, y, river) < 300 || settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 900)) continue;
    if (h(x, y) > bestH) {
      bestH = h(x, y);
      best = [x, y];
    }
  }
  place('castle', best[0], best[1], 'Castle', []);

  // ---- roads: join everything up (shortest links first, Prim's), plus a few extra main roads to town.
  const roads: Road[] = [];
  const nodes = settlements;
  const inTree = new Set([0]);
  while (inTree.size < nodes.length) {
    let pick: [number, number, number] | null = null;
    for (const i of inTree) {
      for (let j = 0; j < nodes.length; j++) {
        if (inTree.has(j)) continue;
        const d = dist(nodes[i], nodes[j]);
        if (!pick || d < pick[2]) pick = [i, j, d];
      }
    }
    const [i, j] = pick!;
    inTree.add(j);
    const main = [nodes[i].kind, nodes[j].kind].every((k) => k === 'village' || k === 'town' || k === 'home');
    roads.push({ points: wander(rng, [nodes[i].x, nodes[i].y], [nodes[j].x, nodes[j].y]), main });
  }
  for (const v of settlements.filter((s) => s.kind === 'village' || s.kind === 'home')) {
    if (dist(v, town) < 4200 && !roads.some((r) => sameEnds(r, v, town!))) roads.push({ points: wander(rng, [v.x, v.y], [town.x, town.y]), main: true });
  }

  // ---- fields and commons round each village and the town
  const fields: P[][] = [];
  const commons: P[][] = [];
  for (const s of settlements.filter((q) => q.kind === 'village' || q.kind === 'home' || q.kind === 'town')) {
    const reach = s.kind === 'town' ? 1000 : 750;
    const inner = s.kind === 'home' ? Math.max(o.villageW, o.villageH) * 0.8 + 60 : s.kind === 'town' ? 380 : 180;
    // Furlongs: blocks of long thin strips, each block turned its own way.
    for (let b = 0; b < 14; b++) {
      const a = rng() * Math.PI * 2;
      const r = between(rng, inner + 80, reach);
      const bx = s.x + Math.cos(a) * r;
      const by = s.y + Math.sin(a) * r;
      if (distToPolyline(bx, by, river) < 120) continue;
      const turn = rng() * Math.PI;
      const ux = Math.cos(turn);
      const uy = Math.sin(turn);
      const strips = Math.floor(between(rng, 5, 10));
      const len = between(rng, 160, 260);
      const wid = between(rng, 12, 22);
      for (let k = 0; k < strips; k++) {
        const ox = bx + -uy * (k - strips / 2) * wid;
        const oy = by + ux * (k - strips / 2) * wid;
        fields.push([
          [ox - ux * len * 0.5, oy - uy * len * 0.5],
          [ox + ux * len * 0.5, oy + uy * len * 0.5],
          [ox + ux * len * 0.5 - uy * wid * 0.92, oy + uy * len * 0.5 + ux * wid * 0.92],
          [ox - ux * len * 0.5 - uy * wid * 0.92, oy - uy * len * 0.5 + ux * wid * 0.92],
        ]);
      }
    }
    // A common: a rough blob just outside the houses.
    const a = rng() * Math.PI * 2;
    const ccx = s.x + Math.cos(a) * (inner + 160);
    const ccy = s.y + Math.sin(a) * (inner + 160);
    const blob: P[] = [];
    for (let k = 0; k < 14; k++) {
      const t = (k / 14) * Math.PI * 2;
      const rr = between(rng, 120, 210);
      blob.push([ccx + Math.cos(t) * rr, ccy + Math.sin(t) * rr * 0.8]);
    }
    commons.push(blob);
  }

  // ---- woods: where the woods noise is high, away from fields, settlements and the river
  const woods: [number, number, number][] = [];
  for (let x = x0 + 150; x < x1; x += 170) {
    for (let y = y0 + 150; y < y1; y += 170) {
      const jx = x + between(rng, -60, 60);
      const jy = y + between(rng, -60, 60);
      if (woodsNoise(jx / 1800, jy / 1800) < 0.56) continue;
      if (settlements.some((s) => Math.hypot(s.x - jx, s.y - jy) < (s.kind === 'town' ? 1050 : s.kind === 'castle' ? 350 : 800))) continue;
      if (distToPolyline(jx, jy, river) < 140) continue;
      woods.push([jx, jy, between(rng, 110, 170)]);
    }
  }

  // ---- hills: marks on the high ground
  const hills: [number, number, number][] = [];
  for (let x = x0 + 300; x < x1; x += 420) {
    for (let y = y0 + 300; y < y1; y += 420) {
      const jx = x + between(rng, -120, 120);
      const jy = y + between(rng, -120, 120);
      const hh = h(jx, jy);
      if (hh < 0.62) continue;
      if (settlements.some((s) => Math.hypot(s.x - jx, s.y - jy) < (s.kind === 'castle' ? 0 : 500))) continue;
      hills.push([jx, jy, 90 + (hh - 0.62) * 600]);
    }
  }

  return { seed, x0, y0, x1, y1, settlements, roads, river, fields, commons, woods, hills };
}

function sameEnds(r: Road, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const p = r.points[0];
  const q = r.points[r.points.length - 1];
  const at = (pt: P, s: { x: number; y: number }) => Math.hypot(pt[0] - s.x, pt[1] - s.y) < 1;
  return (at(p, a) && at(q, b)) || (at(p, b) && at(q, a));
}
