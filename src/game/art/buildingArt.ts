import { PX_PER_METRE } from '../movement/tuning';
import type { Opening } from '../buildings/format';
import type { P2, PlacedWall, Town } from '../buildings/place';
import type { ArtJob, ArtRect } from './atlas';
import { makeKit, type Kit, type KitOutput } from './kit';

/**
 * The art jobs for a town's buildings, drawn with the catalogue kit: for
 * every wall its face (with its windows and door frames), its top (full and
 * cut down) and, for a north–south wall, its end; every floor; stairs,
 * ladders and hearths; door leaves; and each building whole from outside,
 * roof and all, for when you're out in the street.
 */

const M = PX_PER_METRE;
const FORE = 0.72;
const RISE = 0.78;
const PAD = 3;

/** World point (px, with height) → screen. */
export const S = (x: number, y: number, z = 0): [number, number] => [x, y * FORE - z * RISE];

const polyD = (pts: [number, number][]) => 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + 'Z';

function bounds(pts: [number, number][], pad = PAD): ArtRect {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.floor(Math.min(...xs) - pad);
  const y = Math.floor(Math.min(...ys) - pad);
  return { x, y, w: Math.ceil(Math.max(...xs) + pad) - x, h: Math.ceil(Math.max(...ys) + pad) - y };
}

function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The screen polygon of a wall's face (its southern edge, from its floor to its top). */
export function faceQuad(edge: [P2, P2], z0: number, z1: number): [number, number][] {
  return [S(edge[0].x, edge[0].y, z0), S(edge[1].x, edge[1].y, z0), S(edge[1].x, edge[1].y, z1), S(edge[0].x, edge[0].y, z1)];
}

const footScreen = (foot: P2[], z = 0) => foot.map((p) => S(p.x, p.y, z));

export const jobKey = {
  face: (w: PlacedWall) => `wf:${w.id}`,
  top: (w: PlacedWall) => `wt:${w.id}`,
  cut: (w: PlacedWall) => `wc:${w.id}`,
  cap: (w: PlacedWall) => `we:${w.id}`,
  floor: (i: number) => `fl:${i}`,
  stair: (i: number) => `st:${i}`,
  fixture: (i: number) => `fx:${i}`,
  door: (i: number) => `dr:${i}`,
  roof: (i: number) => `rf:${i}`,
  sign: (i: number) => `sg:${i}`,
};

export function townArt(town: Town): ArtJob[] {
  const kit = makeKit();
  const jobs: ArtJob[] = [];
  const job = (key: string, rect: ArtRect, draw: (k: Kit) => void) => {
    kit.begin(seedOf(key));
    draw(kit);
    const out: KitOutput = kit.end();
    jobs.push({ key, rect, out });
  };
  const OUT = kit.OUT;

  for (const w of town.walls) {
    const isCottage = town.buildings[w.plot].plot.building.kind === 'cottage';
    // Walls touching this one (same level), whose footprints hide its outline where they meet.
    const touching = town.walls.filter((o) => o !== w && o.level === w.level && overlaps(o.foot, w.foot, 2));
    const maskD = touching.map((o) => polyD(footScreen(grow(o.foot, o.kind === 'diag' ? 0 : 1.2)))).join('');

    // ---- the face
    if (w.edge) {
      const quad = faceQuad(w.edge, w.base, w.top);
      job(jobKey.face(w), bounds(quad), (k) => {
        const r = bounds(quad, 0);
        k.layer();
        k.clipD(polyD(quad));
        if (w.column) column(k, quad);
        else k.face(w.material, r.x, r.y, r.w, r.h, false);
        k.clip(null);
        if (w.kind === 'diag') {
          k.layer();
          k.add({ fill: '#000000', fo: 0.14 }, polyD(quad));
        }
        k.flush();
        if (!w.column) for (const o of w.wall.openings) opening(k, w, o, isCottage);
        // Outline: along the foot and the top, and up the ends that are free.
        k.layer();
        const [a0, b0, b1, a1] = quad;
        const segs: [number, number][][] = [[a0, b0], [a1, b1]];
        const westFirst = w.edge![0].x <= w.edge![1].x;
        const westJoined = westFirst ? endJoinedAt(w, w.edge![0]) : endJoinedAt(w, w.edge![1]);
        const eastJoined = westFirst ? endJoinedAt(w, w.edge![1]) : endJoinedAt(w, w.edge![0]);
        if (!westJoined) segs.push([a0, a1]);
        if (!eastJoined) segs.push([b0, b1]);
        for (const s of segs) k.add({ fill: 'none', stroke: OUT, sw: 1.4 }, k.line(s));
        k.flush();
      });
    }

    // ---- the top, whole and cut through
    const top = footScreen(w.foot);
    for (const cut of [false, true]) {
      job(cut ? jobKey.cut(w) : jobKey.top(w), bounds(top), (k) => {
        const r = bounds(top, 0);
        k.layer();
        k.clipD(polyD(top));
        if (w.column) {
          k.add({ fill: cut ? '#bfb398' : '#d8ccb0' }, polyD(top));
          k.add({ fill: '#000000', fo: 0.12 }, polyD(top));
        } else k.topOf(w.material, r.x, r.y, r.w, r.h, cut);
        k.clip(null);
        k.flush();
        k.layer();
        if (maskD) k.mask(maskD);
        k.add({ fill: 'none', stroke: OUT, sw: 1.3 }, polyD(top));
        k.mask(null);
        k.flush();
      });
    }

    // ---- a north–south wall's side, as the camera sees it (edge-on): one strip of its material from the top of
    // its north end down to the floor at its south end, which every piece's end samples; outlined down both
    // sides, and along the bottom at a free south end.
    if (w.kind === 'ns') {
      const ys0 = Math.min(...w.foot.map((p) => p.y));
      const ys1 = Math.max(...w.foot.map((p) => p.y));
      const xs = w.foot.map((p) => p.x);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const southFree = !(w.dir.y < 0 ? w.joinedA : w.joinedB);
      const quad = [S(x0, ys1, w.base), S(x1, ys1, w.base), S(x1, ys0, w.top), S(x0, ys0, w.top)];
      job(jobKey.cap(w), bounds(quad), (k) => {
        const r = bounds(quad, 0);
        k.layer();
        k.clip(r.x, r.y, r.w, r.h);
        k.face(w.material, r.x - 20, r.y, r.w + 40, r.h, false);
        k.clip(null);
        k.layer();
        k.add({ fill: '#000000', fo: 0.1 }, k.rect(r.x, r.y, r.w, r.h));
        k.add({ fill: 'none', stroke: OUT, sw: 1.4 }, k.line([[r.x, r.y], [r.x, r.y + r.h]]));
        k.add({ fill: 'none', stroke: OUT, sw: 1.4 }, k.line([[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]]));
        if (southFree) k.add({ fill: 'none', stroke: OUT, sw: 1.4 }, k.line([[r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]));
        k.flush();
      });
    }
  }

  // ---- floors
  town.floors.forEach((f, i) => {
    const pts = f.outline.map((p) => S(p.x, p.y));
    job(jobKey.floor(i), bounds(pts), (k) => {
      const r = bounds(pts, 0);
      const holes = f.holes.map((h) => polyD([S(h.x, h.y), S(h.x + h.w, h.y), S(h.x + h.w, h.y + h.h), S(h.x, h.y + h.h)])).join('');
      k.layer();
      k.clipD(polyD(pts) + holes);
      k.floor(f.material, r.x, r.y, r.w, r.h, false);
      k.clip(null);
      k.flush();
      k.layer();
      if (f.level > 0) k.add({ fill: 'none', stroke: OUT, sw: 1.6 }, polyD(pts));
      if (holes) {
        k.add({ fill: 'none', stroke: '#3a2a1c', sw: 3 }, holes);
        k.add({ fill: 'none', stroke: OUT, sw: 1 }, holes);
      }
      k.flush();
    });
  });

  // ---- stairs and ladders (drawn at the bottom storey's floor, rising to the next)
  town.stairs.forEach((s, i) => {
    const r = s.rect;
    const corners = [S(r.x, r.y, s.zFrom), S(r.x + r.w, r.y, s.zTo + 0.3 * M), S(r.x, r.y + r.h, s.zFrom), S(r.x + r.w, r.y + r.h, s.zFrom), S(r.x, r.y, s.zTo + 0.3 * M)];
    job(jobKey.stair(i), bounds(corners, 8), (k) => {
      const x = r.x / M;
      const y = r.y / M;
      const w = r.w / M;
      const d = r.h / M;
      const z0 = s.zFrom / M;
      const up = (s.zTo - s.zFrom) / M;
      if (s.kind === 'ladder') k.ladder([x, y + d, z0], [x, y, z0 + up + 0.3], w, '#9a7650');
      else {
        // Steps rising north (the only way the presets' stairs run yet).
        const n = Math.round(up / 0.2);
        const run = d / n;
        for (let j = n - 1; j >= 0; j--) k.box(x, y + d - (j + 1) * run, z0, w, run, (j + 1) * (up / n), k.pick(['#9a7650', '#8f6c47', '#a67f56']), '#5a4128', { thin: true });
        k.flush();
      }
    });
  });

  // ---- hearths
  town.fixtures.forEach((fx, i) => {
    if (fx.fixture.kind !== 'hearth') return;
    const r = fx.rect;
    const pts = [S(r.x, r.y, fx.z + 0.12 * M), S(r.x + r.w, r.y + r.h, fx.z), S(r.x, r.y + r.h, fx.z), S(r.x + r.w, r.y, fx.z + 0.12 * M)];
    job(jobKey.fixture(i), bounds(pts, 20), (k) => {
      const z = fx.z / M;
      k.box(r.x / M, r.y / M, z, r.w / M, r.h / M, 0.12, '#a39a89', '#7f776a');
      const c = k.P(r.x / M + r.w / M / 2, r.y / M + r.h / M / 2, z + 0.12);
      k.add({ fill: 'url(#bFire)' }, `M${c[0] + 16} ${c[1]}a16 11 0 1 0 -32 0a16 11 0 1 0 32 0Z`);
      k.add({ fill: '#e0712a' }, `M${c[0] - 5} ${c[1] + 2}q5 -14 10 0z`);
      k.add({ fill: '#f6c34a' }, `M${c[0] - 2.5} ${c[1] + 2}q2.5 -8 5 0z`);
      k.flush();
    });
  });

  // ---- door leaves, flat (mapped onto the leaf wherever it's swung to)
  town.doors.forEach((d, i) => {
    const h = d.height * RISE;
    job(jobKey.door(i), { x: 0, y: 0, w: Math.ceil(d.length), h: Math.ceil(h) }, (k) => {
      k.layer();
      k.leaf(d.style, 0, 0, d.length, h, null);
      k.flush();
      k.layer();
      k.add({ fill: 'none', stroke: OUT, sw: 1.6 }, k.rect(0.5, 0.5, d.length - 1, h - 1));
      k.flush();
    });
  });

  // ---- roofs (the walls under them are the pieces above), and shop signs
  for (const b of town.buildings) {
    const bd = b.plot.building;
    const W = bd.size.w;
    const D = bd.size.d;
    const t = Math.tan((bd.roof.pitch * Math.PI) / 180);
    const ridge = bd.roof.eaves + (bd.roof.ridge === 'ns' ? W : D) * 0.5 * t + 3;
    const groundY = (b.rect.y + b.rect.h) * FORE;
    const pts = [S(b.rect.x - 1.5 * M, b.rect.y - M, ridge * M), S(b.rect.x + b.rect.w + 1.5 * M, b.rect.y + b.rect.h + 2 * M, bd.roof.eaves * M * 0.5)];
    job(jobKey.roof(b.index), bounds(pts, 0), (k) => {
      k.roofOf(bd, b.rect.x, groundY);
      k.flush();
    });
    if (bd.sign) {
      // Hung just under the first floor.
      const up = bd.storeys.find((s) => s.level === 1);
      const z1 = up ? up.floorZ - 0.15 : bd.roof.eaves - 0.3;
      const sp = [S(b.rect.x, b.rect.y + b.rect.h, (z1 + 0.2) * M), S(b.rect.x + b.rect.w, b.rect.y + b.rect.h + 0.3 * M, (z1 - 0.6) * M)];
      job(jobKey.sign(b.index), bounds(sp, 4), (k) => {
        k.signOf(bd, b.rect.x, groundY, z1 - 0.4, z1);
      });
    }
  }
  return jobs;
}

/** A plain stone column, drawn across a face quad. */
function column(k: Kit, quad: [number, number][]): void {
  const r = bounds(quad, 0);
  const shaft = k.rect(r.x + r.w * 0.1, r.y, r.w * 0.8, r.h);
  k.add({ fill: '#ddd2b8' }, shaft);
  k.add({ fill: 'url(#rCyl)' }, shaft);
  k.add({ fill: 'none', stroke: k.OUT, sw: 1.1 }, shaft);
  for (const [y0, hh] of [[r.y + r.h - 7, 7], [r.y, 8]]) {
    k.add({ fill: '#d8ccb0' }, k.rect(r.x, y0, r.w, hh));
    k.add({ fill: '#000000', fo: 0.15 }, k.rect(r.x + r.w * 0.75, y0, r.w * 0.25, hh));
    k.add({ fill: 'none', stroke: k.OUT, sw: 1 }, k.rect(r.x, y0, r.w, hh));
  }
}

/** A window (glass, frames) or a door's frame, on a wall's face. */
function opening(k: Kit, w: PlacedWall, o: Opening, cottage: boolean): void {
  const n = { x: -w.dir.y, y: w.dir.x };
  const out = n.y >= 0 ? n : { x: -n.x, y: -n.y };
  const along = o.at * M;
  const wx = w.from.x + w.dir.x * along + (out.x * w.thickness) / 2;
  const wy = w.from.y + w.dir.y * along + (out.y * w.thickness) / 2;
  const z0 = w.base + (o.kind === 'door' ? 0 : (o.sill ?? 0) * M);
  const p0 = S(wx, wy, z0);
  const p1 = S(wx, wy, z0 + o.height * M);
  const wPx = o.width * M;
  const x = w.dir.x < 0 ? p0[0] - wPx : p0[0];
  const groundY = S(wx, wy, w.base)[1];
  const draw = () => {
    if (o.kind === 'door') k.surround(o.style, x, p1[1], wPx, p0[1] - p1[1], 0);
    else if (cottage && (o.style === 'leaded' || o.style === 'shutters')) k.cottageWindowOn(o.style, x, p1[1], wPx, p0[1] - p1[1]);
    else k.openingOn(o, x, p1[1], wPx, p0[1] - p1[1], groundY);
    k.flush();
  };
  if (w.kind === 'diag') {
    const ux = w.dir.x;
    const uy = w.dir.y;
    k.tf([ux, uy * FORE, 0, 1, p0[0] * (1 - ux), -p0[0] * uy * FORE]);
    draw();
    k.tf(null);
    k.flush();
  } else draw();
}

/** Is the end of this wall nearest a point joined to another wall? */
function endJoinedAt(w: PlacedWall, p: P2): boolean {
  const ea = { x: w.from.x + w.dir.x * w.a, y: w.from.y + w.dir.y * w.a };
  const eb = { x: w.from.x + w.dir.x * w.b, y: w.from.y + w.dir.y * w.b };
  return Math.hypot(p.x - ea.x, p.y - ea.y) < Math.hypot(p.x - eb.x, p.y - eb.y) ? w.joinedA : w.joinedB;
}

function grow(foot: P2[], by: number): P2[] {
  const cx = foot.reduce((s, p) => s + p.x, 0) / foot.length;
  const cy = foot.reduce((s, p) => s + p.y, 0) / foot.length;
  return foot.map((p) => ({ x: p.x + Math.sign(p.x - cx) * by, y: p.y + Math.sign(p.y - cy) * by }));
}

function overlaps(a: P2[], b: P2[], slack: number): boolean {
  const ax = a.map((p) => p.x);
  const ay = a.map((p) => p.y);
  const bx = b.map((p) => p.x);
  const by = b.map((p) => p.y);
  return Math.min(...ax) <= Math.max(...bx) + slack && Math.max(...ax) >= Math.min(...bx) - slack && Math.min(...ay) <= Math.max(...by) + slack && Math.max(...ay) >= Math.min(...by) - slack;
}
