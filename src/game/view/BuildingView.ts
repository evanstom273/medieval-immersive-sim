import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import { pointInPoly, type P2, type PlacedFloor, type Town, type WallPiece } from '../buildings/place';
import { uv, type Placed } from '../art/atlas';
import { jobKey, S } from '../art/buildingArt';
import { CUT_HEIGHT, type WallMode } from './walls';
import type { Bounds } from './draw';
import type { Door } from '../world/interactables';

const M = PX_PER_METRE;
const WALL_SPEED = 7 * M;
/** Each storey draws in its own band of depths, so an upper floor covers everything below it. */
export const BAND = 20;
export const bandOf = (level: number) => 10 + level * BAND;

/** Phaser's Mesh2D texture v runs bottom-up unless flipped. */
const FLIP_V = true;

/** A textured quad (or a few) drawn from the baked art. */
class Quad {
  readonly mesh: Phaser.GameObjects.Mesh2D;
  constructor(scene: Phaser.Scene, sheet: string) {
    const v = new Array(16).fill(0);
    this.mesh = scene.add.mesh2d(0, 0, sheet, v, [0, 1, 2, 0, 0, 2, 3, 0], FLIP_V);
  }
  /** Draw screen points `pts` with the art found at screen points `src` of a job. */
  set(pts: [number, number][], src: [number, number][], job: Placed, sheets: string[]): void {
    const v = this.mesh.vertices;
    for (let i = 0; i < 4; i++) {
      const [u, w] = uv(job, src[i][0], src[i][1]);
      v[i * 4] = pts[i][0];
      v[i * 4 + 1] = pts[i][1];
      v[i * 4 + 2] = u;
      v[i * 4 + 3] = FLIP_V ? w : 1 - w;
    }
    const key = sheets[job.sheet];
    if (this.mesh.texture.key !== key) this.mesh.setTexture(key);
  }
}

interface PieceView {
  piece: WallPiece;
  level: number;
  face: Quad | null;
  top: Quad;
  cap: Quad | null;
  shown: number;
  front: boolean;
  bounds: Bounds;
  /** The footprint's ground bounds (for finding the wall round a door). */
  foot: Bounds;
  depth: number;
  visible: boolean;
}

interface Flat {
  quad: Quad;
  level: number;
  bounds: Bounds;
  /** Shown only in the roof view (a building from outside), or only in storey views. */
  roof: boolean;
  depth: number;
  exterior?: boolean;
  /** A roof: the screen line of its front eaves (nothing below it is roof). */
  eaveY?: number;
}

/** Which storey is shown: a level, or the roofs (everything from outside). */
export type ViewLevel = number | 'roof';

/**
 * Draws a town's buildings with the catalogue art. Sims-style: one storey is
 * shown at a time (with everything below it), its walls following the wall
 * mode; or, in the roof view, every building whole from outside.
 */
export class BuildingView {
  private readonly pieces: PieceView[] = [];
  private readonly flats: Flat[] = [];
  private readonly doorQuads = new Map<Door, { quad: Quad; job: Placed }>();
  view: ViewLevel = 'roof';
  private behind = true;
  mode: WallMode = 'cutaway';

  constructor(
    private readonly scene: Phaser.Scene,
    readonly town: Town,
    private readonly jobs: Map<string, Placed>,
    private readonly sheets: string[],
  ) {
    const floorsByLevel = new Map<number, PlacedFloor[]>();
    for (const f of town.floors) floorsByLevel.set(f.level, [...(floorsByLevel.get(f.level) ?? []), f]);

    for (const piece of town.pieces) {
      const w = piece.wall;
      const faceJob = jobs.get(jobKey.face(w));
      const pv: PieceView = {
        piece,
        level: w.level,
        face: piece.edge && faceJob ? new Quad(scene, sheets[faceJob.sheet]) : null,
        top: new Quad(scene, sheets[jobs.get(jobKey.top(w))!.sheet]),
        cap: piece.cap && jobs.get(jobKey.cap(w)) ? new Quad(scene, sheets[jobs.get(jobKey.cap(w))!.sheet]) : null,
        shown: w.top,
        front: w.column ? true : isFront(piece, floorsByLevel.get(w.level) ?? []),
        bounds: screenBounds([...piece.foot.map((p) => S(p.x, p.y, w.base)), ...piece.foot.map((p) => S(p.x, p.y, w.top))]),
        foot: screenBounds(piece.foot.map((p) => [p.x, p.y])),
        depth: bandOf(w.level) + piece.south / 1000,
        visible: true,
      };
      this.pieces.push(pv);
      this.drawPiece(pv);
    }

    town.floors.forEach((f, i) => {
      const job = jobs.get(jobKey.floor(i))!;
      const r = job.rect;
      const pts: [number, number][] = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      const lift = f.z * 0.78;
      this.flat(job, pts.map(([x, y]) => [x, y - lift]), pts, f.level, false, f.level === 0 ? 1 : bandOf(f.level) - 1);
    });
    town.stairs.forEach((s, i) => {
      const job = jobs.get(jobKey.stair(i))!;
      this.flat(job, null, null, s.fromLevel, false, bandOf(s.fromLevel) + s.rect.y / 1000);
    });
    town.fixtures.forEach((fx, i) => {
      const job = jobs.get(jobKey.fixture(i));
      if (job) this.flat(job, null, null, fx.level, false, bandOf(fx.level) + fx.rect.y / 1000);
    });
    // From outside: the walls are the pieces (full height), with each roof laid over them.
    for (const b of town.buildings) {
      const front = b.rect.y + b.rect.h;
      const f = this.flat(jobs.get(jobKey.roof(b.index))!, null, null, 0, true, 10 + front / 1000 + 0.0006);
      f.exterior = true;
      const roof = b.plot.building.roof;
      f.eaveY = S(0, front + roof.overhang * M, (roof.eaves - roof.overhang * Math.tan((roof.pitch * Math.PI) / 180)) * M)[1];
      const sign = jobs.get(jobKey.sign(b.index));
      if (sign) this.flat(sign, null, null, 0, true, 10 + (front + 0.3 * M) / 1000);
    }
    this.applyView();
  }

  private flat(job: Placed, pts: [number, number][] | null, src: [number, number][] | null, level: number, roof: boolean, depth: number): Flat {
    const r = job.rect;
    const s: [number, number][] = src ?? [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    const p = pts ?? s;
    const quad = new Quad(this.scene, this.sheets[job.sheet]);
    quad.set(p, s, job, this.sheets);
    quad.mesh.setDepth(depth);
    const f: Flat = { quad, level, bounds: screenBounds(p), roof, depth };
    this.flats.push(f);
    return f;
  }

  /** The art for a door's leaf (job index = the door's index in town.doors). */
  attachDoor(door: Door, index: number): void {
    const job = this.jobs.get(jobKey.door(index));
    if (!job) return;
    this.doorQuads.set(door, { quad: new Quad(this.scene, this.sheets[job.sheet]), job });
  }

  setView(view: ViewLevel): void {
    this.view = view;
    this.applyView();
  }

  /** Is a storey shown at all right now? */
  levelShown(level: number): boolean {
    return this.view !== 'roof' && level <= this.view;
  }

  private applyView(): void {
    const roof = this.view === 'roof';
    for (const pv of this.pieces) {
      pv.visible = roof || this.levelShown(pv.level);
      // From outside, every storey's walls sort together with the people in the street.
      pv.depth = roof ? 10 + pv.piece.south / 1000 : bandOf(pv.level) + pv.piece.south / 1000;
      if (!pv.visible) this.setPieceVisible(pv, false);
      else this.drawPiece(pv);
    }
    for (const f of this.flats) f.quad.mesh.setVisible(f.roof ? this.view === 'roof' : this.levelShown(f.level));
  }

  /**
   * Per frame: walls glide to their heights (cut down in front of rooms on the storey shown,
   * and wherever they'd hide the person you control), off-screen pieces are hidden.
   */
  update(dt: number, focus: P2, focusLevel: number, focusScreen: Bounds | null, view: Bounds): void {
    const key = focus.y;
    // From outside, walls only fade when you're behind a building, not in its porch or doorway.
    this.behind = !this.town.buildings.some((b) => focus.x > b.rect.x && focus.x < b.rect.x + b.rect.w && focus.y > b.rect.y && focus.y < b.rect.y + b.rect.h);
    for (const pv of this.pieces) {
      if (!pv.visible) continue;
      const on = intersects(pv.bounds, view);
      if (!on) {
        this.setPieceVisible(pv, false);
        continue;
      }
      const hides = (pv.level === focusLevel || this.view === 'roof') && !!focusScreen && pv.piece.south > key && intersects(pv.bounds, focusScreen, 6);
      const target = this.targetHeight(pv, hides);
      if (Math.abs(pv.shown - target) > 0.5) {
        const step = WALL_SPEED * dt;
        pv.shown = pv.shown < target ? Math.min(target, pv.shown + step) : Math.max(target, pv.shown - step);
        this.drawPiece(pv);
      }
      this.setPieceVisible(pv, pv.shown > pv.piece.wall.base + pv.piece.over + 0.5);
      const alpha = this.view === 'roof' ? (this.behind && (hides || this.hidesOutside(pv, focus, focusScreen)) ? 0.35 : 1) : this.mode === 'up' && hides && pv.level === this.view ? 0.28 : 1;
      for (const q of [pv.face, pv.top, pv.cap]) if (q) q.mesh.setAlpha(q.mesh.alpha + (alpha - q.mesh.alpha) * 0.25);
    }
    for (const f of this.flats) {
      const shown = f.roof ? this.view === 'roof' : this.levelShown(f.level);
      f.quad.mesh.setVisible(shown && intersects(f.bounds, view));
      if (f.exterior && shown) {
        // From outside, a building in front of the person you control fades so you can see them.
        const hides = !!focusScreen && this.behind && f.depth > 10 + focus.y / 1000 && intersects(f.bounds, focusScreen) && focusScreen.y0 < (f.eaveY ?? Infinity) && overExterior(f, focusScreen);
        const a = hides ? 0.35 : 1;
        f.quad.mesh.setAlpha(f.quad.mesh.alpha + (a - f.quad.mesh.alpha) * 0.2);
      }
    }
  }

  /** From outside: a wall in front of (south of) the person you control, over them on screen. */
  private hidesOutside(pv: PieceView, focus: P2, focusScreen: Bounds | null): boolean {
    return !!focusScreen && pv.piece.south > focus.y && intersects(pv.bounds, focusScreen);
  }

  /** Doors: drawn with their storey, cut down with their wall; the art laid on the leaf's face towards you. */
  updateDoors(doors: Door[]): void {
    for (const d of doors) {
      const dq = this.doorQuads.get(d);
      const shown = this.view === 'roof' ? d.level === 0 : this.levelShown(d.level);
      d.hidden = !shown;
      if (!dq) continue;
      const m = dq.quad.mesh;
      if (!shown) {
        m.setVisible(false);
        continue;
      }
      const h = Math.min(d.height, d.displayHeight ?? d.height);
      const leaf = d.leafNow();
      let n = { x: -Math.sin(leaf.angle), y: Math.cos(leaf.angle) };
      if (n.y < 0 || (Math.abs(n.y) < 1e-3 && n.x < 0)) n = { x: -n.x, y: -n.y };
      // Edge-on (swung to point at you): no face to see.
      if (n.y < 0.05) {
        m.setVisible(false);
        continue;
      }
      const o = (leaf.thickness / 2) * 1.02;
      const a = { x: leaf.hinge.x + n.x * o, y: leaf.hinge.y + n.y * o };
      const b = { x: leaf.latch.x + n.x * o, y: leaf.latch.y + n.y * o };
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const z0 = d.z;
      const pts: [number, number][] = [S(l.x, l.y, z0), S(r.x, r.y, z0), S(r.x, r.y, z0 + h), S(l.x, l.y, z0 + h)];
      const J = dq.job.rect;
      const top = J.h - h * 0.78;
      const src: [number, number][] = [[J.x, J.y + J.h], [J.x + J.w, J.y + J.h], [J.x + J.w, J.y + top], [J.x, J.y + top]];
      dq.quad.set(pts, src, dq.job, this.sheets);
      m.setVisible(h > 2);
      const sp = a.y > b.y ? a : b;
      m.setDepth(bandOf(d.level) + sp.y / 1000 + 0.0003);
    }
  }

  /** How high the wall pieces round a point stand now, above their floor (for cutting a door down with its wall). */
  wallHeightNear(x: number, y: number, level: number, slack = 14): number | null {
    let best: number | null = null;
    for (const pv of this.pieces) {
      if (pv.level !== level || pv.piece.over > 0) continue;
      const bb = pv.foot;
      if (x < bb.x0 - slack || x > bb.x1 + slack || y < bb.y0 - slack || y > bb.y1 + slack) continue;
      const h = pv.shown - pv.piece.wall.base;
      best = best === null ? h : Math.min(best, h);
    }
    return best;
  }

  private targetHeight(pv: PieceView, hidesFocus: boolean): number {
    const w = pv.piece.wall;
    if (this.view === 'roof' || pv.level < this.view) return w.top;
    const cut = Math.min(w.top, w.base + CUT_HEIGHT);
    if (this.mode === 'down') return cut;
    if (this.mode === 'cutaway' && (pv.front || hidesFocus)) return cut;
    return w.top;
  }

  private setPieceVisible(pv: PieceView, on: boolean): void {
    pv.top.mesh.setVisible(on);
    pv.face?.mesh.setVisible(on);
    pv.cap?.mesh.setVisible(on);
  }

  private drawPiece(pv: PieceView): void {
    const { piece } = pv;
    const w = piece.wall;
    const h = pv.shown;
    const z0 = w.base + piece.over;
    const full = h >= w.top - 0.5;
    const topJob = this.jobs.get(full ? jobKey.top(w) : jobKey.cut(w))!;
    pv.top.set(
      piece.foot.map((p) => S(p.x, p.y, h)),
      piece.foot.map((p) => S(p.x, p.y, 0)),
      topJob,
      this.sheets,
    );
    pv.top.mesh.setDepth(pv.depth + 0.00002);
    if (pv.face && piece.edge) {
      const [a, b] = piece.edge;
      const q: [number, number][] = [S(a.x, a.y, z0), S(b.x, b.y, z0), S(b.x, b.y, h), S(a.x, a.y, h)];
      pv.face.set(q, q, this.jobs.get(jobKey.face(w))!, this.sheets);
      pv.face.mesh.setDepth(pv.depth);
    }
    if (pv.cap) {
      const ys = Math.max(...piece.foot.map((p) => p.y));
      const xs = piece.foot.map((p) => p.x);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const q: [number, number][] = [S(x0, ys, z0), S(x1, ys, z0), S(x1, ys, h), S(x0, ys, h)];
      pv.cap.set(q, q, this.jobs.get(jobKey.cap(w))!, this.sheets);
      pv.cap.mesh.setDepth(pv.depth + 0.00001);
    }
  }
}

/** A wall piece stands in front of a room (so cutaway cuts it) if there's floor just behind it, or it's a side wall's front stretch. */
function isFront(piece: WallPiece, floors: PlacedFloor[]): boolean {
  const w = piece.wall;
  const cx = piece.foot.reduce((s, p) => s + p.x, 0) / 4;
  const cy = piece.foot.reduce((s, p) => s + p.y, 0) / 4;
  if (w.kind !== 'ns') {
    const behind = { x: cx, y: cy - w.thickness / 2 - 0.4 * M };
    if (floors.some((f) => pointInPoly(behind, f.outline))) return true;
    // A diagonal's room may be to its side: look along its inward normal too.
    if (w.kind === 'diag') {
      const n = { x: -w.dir.y, y: w.dir.x };
      for (const s of [1, -1]) if (floors.some((f) => pointInPoly({ x: cx + n.x * s * 0.5 * M, y: cy + n.y * s * 0.5 * M }, f.outline))) return true;
    }
    return false;
  }
  // Sticking out past the rooms (e.g. the sides of a porch): in front.
  if (!(w.dir.y > 0 ? w.joinedB : w.joinedA)) return true;
  for (const f of floors) {
    const xs = f.outline.map((p) => p.x);
    const ys = f.outline.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y1 = Math.max(...ys);
    const near = Math.abs(cx - x0) < w.thickness / 2 + 0.15 * M || Math.abs(cx - x1) < w.thickness / 2 + 0.15 * M;
    if (near && cy > y1 - 2.5 * M && cy <= y1 + 0.5 * M) return true;
  }
  return false;
}

function screenBounds(pts: [number, number][]): Bounds {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function intersects(a: Bounds, b: Bounds, slack = 0): boolean {
  return a.x0 < b.x1 + slack && a.x1 > b.x0 - slack && a.y0 < b.y1 && a.y1 > b.y0 - slack;
}

/** Roughly: is the focus within the building's solid part (not the empty sky beside its roof)? */
function overExterior(f: Flat, focus: Bounds): boolean {
  const cx = (focus.x0 + focus.x1) / 2;
  return cx > f.bounds.x0 + 0.8 * M && cx < f.bounds.x1 - 0.8 * M;
}
