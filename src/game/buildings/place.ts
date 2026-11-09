/**
 * Turns building plans (format.ts) placed on the map into what the game
 * needs: wall pieces to draw (1 m chunks, so people sort in front of and
 * behind them), solid bodies per level, floors, stairs and ladders you can
 * walk up, doorways for doors, and invisible edges round upper floors.
 * Pure TypeScript, world pixels (64 px = 1 m).
 */
import { PX_PER_METRE } from '../movement/tuning';
import type { Building, DoorStyle, Fixture, Opening, Plot, Storey, Wall, WallMaterial } from './format';

const M = PX_PER_METRE;

export interface P2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WallKind = 'ew' | 'ns' | 'diag';

/** One wall of one storey, in world px, with what it needs for drawing. */
export interface PlacedWall {
  id: string;
  plot: number;
  level: number;
  kind: WallKind;
  wall: Wall;
  material: WallMaterial;
  /** Footprint (4 corners, any angle) of the whole wall after trimming. */
  foot: P2[];
  /** The face the camera sees (the southern long edge), or null for north–south walls. */
  edge: [P2, P2] | null;
  /** Unit vector along the wall (from → to), and its trimmed length (px) along it from `from`. */
  dir: P2;
  from: P2;
  a: number;
  b: number;
  thickness: number;
  /** Floor of its storey and its top (world px of height). */
  base: number;
  top: number;
  /** Ends that meet another wall (no outline, no end cap there). */
  joinedA: boolean;
  joinedB: boolean;
  /** A column (drawn as one, but cut away like a wall). */
  column?: boolean;
}

/** A ~1 m piece of a wall (or the bit over a doorway) as drawn. */
export interface WallPiece {
  wall: PlacedWall;
  /** Along the wall (px from `from`). */
  a: number;
  b: number;
  /** Over a doorway: starts at this height above the floor (px), else at the floor. */
  over: number;
  foot: P2[];
  edge: [P2, P2] | null;
  /** North–south walls: this piece is the south end and shows its end face. */
  cap: boolean;
  /** For draw order: the southmost point. */
  south: number;
}

export interface PlacedFloor {
  plot: number;
  level: number;
  /** Height of the floor (px). */
  z: number;
  outline: P2[];
  material: string;
  name: string;
  use: string;
  /** Openings in it (stairwells, hatches). */
  holes: Rect[];
}

export interface StairZone {
  plot: number;
  kind: 'stair' | 'ladder';
  rect: Rect;
  heading: 'n' | 's' | 'e' | 'w';
  fromLevel: number;
  toLevel: number;
  /** Floor heights at the bottom and the top (px). */
  zFrom: number;
  zTo: number;
}

export interface PlacedDoor {
  plot: number;
  level: number;
  style: DoorStyle;
  hinge: P2;
  length: number;
  baseAngle: number;
  /** Into the room (exterior doors), else null. */
  inward: P2 | null;
  height: number;
  /** Floor of its storey. */
  z: number;
  wallId: string;
}

export interface Barrier extends Rect {
  level: number;
}

export interface PlacedFixture {
  plot: number;
  level: number;
  z: number;
  fixture: Fixture;
  /** World px. */
  rect: Rect;
}

export interface PlacedBuilding {
  plot: Plot;
  index: number;
  /** World px of its north-west corner. */
  ox: number;
  oy: number;
  /** Footprint, world px. */
  rect: Rect;
}

export interface Town {
  buildings: PlacedBuilding[];
  walls: PlacedWall[];
  pieces: WallPiece[];
  floors: PlacedFloor[];
  stairs: StairZone[];
  doors: PlacedDoor[];
  barriers: Barrier[];
  fixtures: PlacedFixture[];
  /** Solid parts of walls, per level, as axis-aligned rects (diagonal walls as a row of small squares). */
  bodies: Barrier[];
  /** Highest storey level anywhere. */
  topLevel: number;
}

const EPS = 0.02 * M;

const len = (w: Wall) => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
const kindOf = (w: Wall): WallKind => (w.from[1] === w.to[1] ? 'ew' : w.from[0] === w.to[0] ? 'ns' : 'diag');

/** Footprint of a wall between a and b (px) along it. */
function footOf(from: P2, dir: P2, t: number, a: number, b: number): P2[] {
  const n = { x: -dir.y, y: dir.x };
  const h = t / 2;
  const p0 = { x: from.x + dir.x * a, y: from.y + dir.y * a };
  const p1 = { x: from.x + dir.x * b, y: from.y + dir.y * b };
  return [
    { x: p0.x + n.x * h, y: p0.y + n.y * h },
    { x: p1.x + n.x * h, y: p1.y + n.y * h },
    { x: p1.x - n.x * h, y: p1.y - n.y * h },
    { x: p0.x - n.x * h, y: p0.y - n.y * h },
  ];
}

/** Of a footprint's two long edges, the one further south (the face the camera sees). */
function southEdge(foot: P2[]): [P2, P2] {
  const e1: [P2, P2] = [foot[0], foot[1]];
  const e2: [P2, P2] = [foot[3], foot[2]];
  const e = (e1[0].y + e1[1].y) / 2 > (e2[0].y + e2[1].y) / 2 ? e1 : e2;
  return e[0].x <= e[1].x ? e : [e[1], e[0]];
}

export function pointInPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const inRect = (p: P2, r: Rect, slack = 0) => p.x >= r.x - slack && p.x <= r.x + r.w + slack && p.y >= r.y - slack && p.y <= r.y + r.h + slack;

function bboxOf(pts: P2[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Solid stretches of a wall (between doorways), in px along it. */
function solidRuns(w: Wall, a0: number, b0: number): [number, number][] {
  const cuts = w.openings
    .filter((o) => o.kind === 'door')
    .map((o) => [o.at * M, (o.at + o.width) * M] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const runs: [number, number][] = [];
  let a = a0;
  for (const [c0, c1] of cuts) {
    if (c0 > a + 1) runs.push([a, Math.min(c0, b0)]);
    a = Math.max(a, c1);
  }
  if (b0 > a + 1) runs.push([a, b0]);
  return runs;
}

/** Lay out a set of plots: everything the game needs to build them. */
export function placeTown(plots: Plot[]): Town {
  const town: Town = { buildings: [], walls: [], pieces: [], floors: [], stairs: [], doors: [], barriers: [], fixtures: [], bodies: [], topLevel: 0 };
  plots.forEach((plot, pi) => {
    const b = plot.building;
    const ox = plot.x * M;
    const oy = plot.y * M;
    town.buildings.push({ plot, index: pi, ox, oy, rect: { x: ox, y: oy, w: b.size.w * M, h: b.size.d * M } });
    for (const s of b.storeys) {
      town.topLevel = Math.max(town.topLevel, s.level);
      placeStorey(town, b, s, pi, ox, oy);
    }
  });
  return town;
}

function placeStorey(town: Town, b: Building, s: Storey, pi: number, ox: number, oy: number): void {
  const z = s.floorZ * M;
  const L = s.level;
  const P = (p: [number, number]): P2 => ({ x: ox + p[0] * M, y: oy + p[1] * M });

  // ---- walls: trimmed where they run into another, so each corner belongs to one wall.
  const raw = s.walls.map((w, i) => {
    const from = P(w.from);
    const to = P(w.to);
    const l = len(w) * M;
    const dir = { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
    return { w, i, from, dir, l, kind: kindOf(w), foot: footOf(from, dir, w.thickness * M, 0, l) };
  });
  const ewRects = raw.filter((r) => r.kind === 'ew').map((r) => ({ r, box: bboxOf(r.foot) }));
  const placed: PlacedWall[] = [];
  for (const r of raw) {
    let a = 0;
    let bEnd = r.l;
    if (r.kind === 'ns') {
      // Stop at the face of any east–west wall the end runs into.
      const x = r.from.x;
      for (const { r: e, box } of ewRects) {
        if (e === r || x < box.x - EPS || x > box.x + box.w + EPS) continue;
        const ya = r.from.y + r.dir.y * a;
        const yb = r.from.y + r.dir.y * bEnd;
        if (ya >= box.y - EPS && ya <= box.y + box.h + EPS) a = r.dir.y > 0 ? box.y + box.h - r.from.y : r.from.y - box.y;
        if (yb >= box.y - EPS && yb <= box.y + box.h + EPS) bEnd = r.dir.y > 0 ? box.y - r.from.y : r.from.y - (box.y + box.h);
      }
    }
    if (bEnd - a < 2) continue;
    const t = r.w.thickness * M;
    const foot = footOf(r.from, r.dir, t, a, bEnd);
    const top = z + (r.w.top ?? s.height) * M;
    placed.push({
      id: `${pi}:${L}:${r.i}`,
      plot: pi,
      level: L,
      kind: r.kind,
      wall: r.w,
      material: r.w.material,
      foot,
      edge: r.kind === 'ns' ? null : southEdge(foot),
      dir: r.dir,
      from: r.from,
      a,
      b: bEnd,
      thickness: t,
      base: z,
      top,
      joinedA: a > 0.5,
      joinedB: bEnd < r.l - 0.5,
    });
  }
  // Ends that butt into another wall's footprint are joined too.
  for (const w of placed) {
    const out = 0.06 * M;
    const endA = { x: w.from.x + w.dir.x * (w.a - out), y: w.from.y + w.dir.y * (w.a - out) };
    const endB = { x: w.from.x + w.dir.x * (w.b + out), y: w.from.y + w.dir.y * (w.b + out) };
    for (const o of placed) {
      if (o === w) continue;
      if (!w.joinedA && pointInPoly(endA, o.foot)) w.joinedA = true;
      if (!w.joinedB && pointInPoly(endB, o.foot)) w.joinedB = true;
    }
  }
  town.walls.push(...placed);

  // ---- pieces and solid bodies
  for (const w of placed) {
    const runs = solidRuns(w.wall, w.a, w.b);
    const south = (foot: P2[]) => Math.max(...foot.map((p) => p.y));
    const addPiece = (a: number, b: number, over: number) => {
      const foot = footOf(w.from, w.dir, w.thickness, a, b);
      const capHere = w.kind === 'ns' && !(w.dir.y > 0 ? w.joinedB : w.joinedA) && Math.abs((w.dir.y > 0 ? b : a) - (w.dir.y > 0 ? w.b : w.a)) < 0.5;
      town.pieces.push({ wall: w, a, b, over, foot, edge: w.kind === 'ns' ? null : southEdge(foot), cap: capHere, south: south(foot) });
    };
    for (const [a, b] of runs) {
      const n = Math.max(1, Math.round((b - a) / M));
      for (let k = 0; k < n; k++) addPiece(a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n, 0);
      // Bodies: axis-aligned walls as one rect per run; diagonals as small squares along the line.
      if (w.kind !== 'diag') {
        const bb = bboxOf(footOf(w.from, w.dir, w.thickness, a, b));
        town.bodies.push({ ...bb, level: L });
      } else {
        const step = w.thickness * 0.6;
        for (let d = a + step / 2; d < b; d += step) {
          const c = { x: w.from.x + w.dir.x * d, y: w.from.y + w.dir.y * d };
          town.bodies.push({ x: c.x - w.thickness / 2, y: c.y - w.thickness / 2, w: w.thickness, h: w.thickness, level: L });
        }
      }
    }
    // Over each doorway: the wall carries on above the door, and a door hangs in it.
    for (const o of w.wall.openings) {
      if (o.kind !== 'door') continue;
      const a = Math.max(w.a, o.at * M);
      const b = Math.min(w.b, (o.at + o.width) * M);
      if (b - a < 2) continue;
      if (z + o.height * M < w.top - 1) addPiece(a, b, o.height * M);
      town.doors.push(doorIn(w, o, pi, L, z, b, a, ox, oy, s, town));
    }
  }

  // ---- floors, with holes where stairs come up
  const holes = s.fixtures.filter((f) => f.kind === 'stairwell' || f.kind === 'hatch').map((f) => ({ x: ox + f.x * M, y: oy + f.y * M, w: f.w * M, h: f.d * M }));
  for (const room of s.rooms) {
    town.floors.push({ plot: pi, level: L, z, outline: room.outline.map(P), material: room.floor, name: room.name, use: room.use, holes });
  }

  // ---- fixtures
  for (const f of s.fixtures) {
    const rect = f.kind === 'column' ? { x: ox + (f.x - f.w / 2) * M, y: oy + (f.y - f.d / 2) * M, w: f.w * M, h: f.d * M } : { x: ox + f.x * M, y: oy + f.y * M, w: f.w * M, h: f.d * M };
    town.fixtures.push({ plot: pi, level: L, z, fixture: f, rect });
    if (f.kind === 'column') {
      town.bodies.push({ ...rect, level: L });
      const from = { x: rect.x, y: rect.y + rect.h / 2 };
      const wall: Wall = { from: [0, 0], to: [f.w, 0], thickness: f.d, material: f.material, exterior: true, openings: [] };
      const foot = footOf(from, { x: 1, y: 0 }, rect.h, 0, rect.w);
      const col: PlacedWall = { id: `${pi}:${L}:c${town.fixtures.length}`, plot: pi, level: L, kind: 'ew', wall, material: f.material, foot, edge: southEdge(foot), dir: { x: 1, y: 0 }, from, a: 0, b: rect.w, thickness: rect.h, base: z, top: z + s.height * M, joinedA: false, joinedB: false, column: true };
      town.walls.push(col);
      town.pieces.push({ wall: col, a: 0, b: rect.w, over: 0, foot, edge: col.edge, cap: false, south: rect.y + rect.h });
    }
    if (f.kind === 'stair' || f.kind === 'ladder') {
      const up = b.storeys.find((q) => q.level === f.toLevel);
      if (!up) continue;
      const zone: StairZone = { plot: pi, kind: f.kind, rect, heading: f.heading, fromLevel: L, toLevel: f.toLevel, zFrom: z, zTo: up.floorZ * M };
      town.stairs.push(zone);
      // Below: closed but for the foot. Above: closed but for the top.
      const T = 4;
      const sides = (open: 'n' | 's' | 'e' | 'w', level: number) => {
        const r = rect;
        const all: Record<'n' | 's' | 'e' | 'w', Rect> = {
          n: { x: r.x - T, y: r.y - T, w: r.w + 2 * T, h: T },
          s: { x: r.x - T, y: r.y + r.h, w: r.w + 2 * T, h: T },
          w: { x: r.x - T, y: r.y, w: T, h: r.h },
          e: { x: r.x + r.w, y: r.y, w: T, h: r.h },
        };
        for (const k of ['n', 's', 'e', 'w'] as const) if (k !== open) town.barriers.push({ ...all[k], level });
      };
      const foot = ({ n: 's', s: 'n', e: 'w', w: 'e' } as const)[f.heading];
      sides(foot, L);
      sides(f.heading, f.toLevel);
    }
  }

  // ---- upper floors: invisible edges wherever a floor ends with no wall or other floor beyond it
  if (L > 0) {
    const polys = s.rooms.map((r) => r.outline.map(P));
    const step = 0.1 * M;
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const l = Math.hypot(q.x - p.x, q.y - p.y);
        if (l < 1) continue;
        const d = { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
        // Outward normal: whichever side isn't inside this room.
        let n = { x: -d.y, y: d.x };
        const mid = { x: (p.x + q.x) / 2 + n.x * 2, y: (p.y + q.y) / 2 + n.y * 2 };
        if (pointInPoly(mid, poly)) n = { x: -n.x, y: -n.y };
        let runStart: number | null = null;
        const flush = (t: number) => {
          if (runStart === null) return;
          const a = { x: p.x + d.x * runStart, y: p.y + d.y * runStart };
          const b2 = { x: p.x + d.x * t, y: p.y + d.y * t };
          const T = 6;
          const pts = [a, b2, { x: b2.x + n.x * T, y: b2.y + n.y * T }, { x: a.x + n.x * T, y: a.y + n.y * T }];
          if (Math.abs(d.x) < 0.01 || Math.abs(d.y) < 0.01) town.barriers.push({ ...bboxOf(pts), level: L });
          else for (let k = runStart; k < t; k += T) town.barriers.push({ x: p.x + d.x * k + n.x * 3 - T / 2, y: p.y + d.y * k + n.y * 3 - T / 2, w: T, h: T, level: L });
          runStart = null;
        };
        for (let t = 0; t <= l + 0.01; t += step) {
          const at = { x: p.x + d.x * t + n.x * 0.08 * M, y: p.y + d.y * t + n.y * 0.08 * M };
          const covered = placed.some((w) => pointInPoly(at, w.foot)) || polys.some((o) => o !== poly && pointInPoly(at, o));
          if (!covered && runStart === null) runStart = Math.max(0, t - step / 2);
          if (covered) flush(t);
        }
        flush(l);
      }
    }
  }
}

function doorIn(w: PlacedWall, o: Opening, pi: number, L: number, z: number, b: number, a: number, ox: number, oy: number, s: Storey, town: Town): PlacedDoor {
  void s;
  void town;
  const right = o.hinge === 'right';
  const hingeAt = right ? b : a;
  const hinge = { x: w.from.x + w.dir.x * hingeAt, y: w.from.y + w.dir.y * hingeAt };
  const ang = Math.atan2(w.dir.y, w.dir.x) + (right ? Math.PI : 0);
  let inward: P2 | null = null;
  if (w.wall.exterior) {
    const bld = town.buildings[pi];
    const n = { x: -w.dir.y, y: w.dir.x };
    const c = { x: bld.rect.x + bld.rect.w / 2, y: bld.rect.y + bld.rect.h / 2 };
    inward = (c.x - hinge.x) * n.x + (c.y - hinge.y) * n.y > 0 ? n : { x: -n.x, y: -n.y };
  }
  void ox;
  void oy;
  return { plot: pi, level: L, style: o.style as DoorStyle, hinge, length: b - a, baseAngle: ang, inward, height: o.height * M, z, wallId: w.id };
}

/** Which storey (level and floor height) of which building a point is in, at a level; null outside. */
export function floorAt(town: Town, x: number, y: number, level: number): PlacedFloor | null {
  for (const f of town.floors) {
    if (f.level === level && pointInPoly({ x, y }, f.outline)) return f;
  }
  return null;
}

/** Is a point inside a building's footprint (any storey's walls or rooms) at that level? */
export function insideBuilding(town: Town, x: number, y: number, level: number): PlacedBuilding | null {
  const f = floorAt(town, x, y, level);
  if (f) return town.buildings[f.plot];
  return null;
}

/** Progress (0 at the foot, 1 at the top) of a point along a stair. */
export function stairProgress(z: StairZone, x: number, y: number): number {
  const r = z.rect;
  let t: number;
  switch (z.heading) {
    case 'n':
      t = (r.y + r.h - y) / r.h;
      break;
    case 's':
      t = (y - r.y) / r.h;
      break;
    case 'e':
      t = (x - r.x) / r.w;
      break;
    default:
      t = (r.x + r.w - x) / r.w;
  }
  return Math.min(1, Math.max(0, t));
}

/** The stair foot and top, just outside the zone (where you step on and off). */
export function stairEnds(z: StairZone): { foot: P2; top: P2 } {
  const r = z.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const off = 0.35 * M;
  switch (z.heading) {
    case 'n':
      return { foot: { x: cx, y: r.y + r.h + off }, top: { x: cx, y: r.y - off } };
    case 's':
      return { foot: { x: cx, y: r.y - off }, top: { x: cx, y: r.y + r.h + off } };
    case 'e':
      return { foot: { x: r.x - off, y: cy }, top: { x: r.x + r.w + off, y: cy } };
    default:
      return { foot: { x: r.x + r.w + off, y: cy }, top: { x: r.x - off, y: cy } };
  }
}
