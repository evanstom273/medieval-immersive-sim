/**
 * Grid pathfinding (A*, 8-directional, no corner cutting) with string-pulling.
 *
 * Pure TypeScript, no Phaser. Obstacles are inflated by the walker's clearance
 * when the grid is built, so a path through free cells is walkable by a
 * circular body of that radius.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * A hop the grid can't express as walking: e.g. climbing through a window or
 * unbarring a locked door. Directed (from → to). `data` is carried along so
 * whoever follows the path knows what to do when they get to `from`.
 */
export interface NavLink {
  from: Point;
  to: Point;
  /** Extra cost, in metres of walking it's "worth". */
  costMetres: number;
  data: unknown;
}

/** A path waypoint. If `link` is set, reaching this point means: do the link's action, then carry on from its far side. */
export interface Waypoint extends Point {
  link?: NavLink;
}

export type Obstacle =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private links = new Map<number, NavLink[]>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  /** Mark cells whose centres fall within `clearance` of any obstacle. */
  build(obstacles: Obstacle[], clearance: number): void {
    this.blocked.fill(0);
    const cs = this.cellSize;
    for (const o of obstacles) {
      const minX = o.kind === 'rect' ? o.x - clearance : o.x - o.r - clearance;
      const maxX = o.kind === 'rect' ? o.x + o.w + clearance : o.x + o.r + clearance;
      const minY = o.kind === 'rect' ? o.y - clearance : o.y - o.r - clearance;
      const maxY = o.kind === 'rect' ? o.y + o.h + clearance : o.y + o.r + clearance;
      const c0 = Math.max(0, Math.floor(minX / cs));
      const c1 = Math.min(this.cols - 1, Math.floor(maxX / cs));
      const r0 = Math.max(0, Math.floor(minY / cs));
      const r1 = Math.min(this.rows - 1, Math.floor(maxY / cs));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const px = (c + 0.5) * cs;
          const py = (r + 0.5) * cs;
          let d: number;
          if (o.kind === 'rect') {
            const nx = Math.max(o.x, Math.min(px, o.x + o.w));
            const ny = Math.max(o.y, Math.min(py, o.y + o.h));
            d = Math.hypot(px - nx, py - ny);
          } else {
            d = Math.hypot(px - o.x, py - o.y) - o.r;
          }
          if (d < clearance) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    // Keep the walker inside the world.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const px = (c + 0.5) * cs;
        const py = (r + 0.5) * cs;
        if (px < clearance || py < clearance || px > this.width - clearance || py > this.height - clearance) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  /** Replace the set of links (call after `build`, whenever doors/windows change). Links touching blocked cells are dropped. */
  setLinks(links: NavLink[]): void {
    this.links.clear();
    for (const l of links) {
      if (this.isBlockedAt(l.from.x, l.from.y) || this.isBlockedAt(l.to.x, l.to.y)) continue;
      const i = this.cellIndex(l.from);
      const list = this.links.get(i) ?? [];
      list.push(l);
      this.links.set(i, list);
    }
  }

  private cellIndex(p: Point): number {
    return Math.floor(p.y / this.cellSize) * this.cols + Math.floor(p.x / this.cellSize);
  }

  isBlockedCell(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  isBlockedAt(x: number, y: number): boolean {
    return this.isBlockedCell(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
  }

  /** Nearest free point to `p` within `maxRadius` (px), or null. Returns `p` itself if it's free. */
  nearestFree(p: Point, maxRadius: number): Point | null {
    if (!this.isBlockedAt(p.x, p.y)) return { x: p.x, y: p.y };
    const cs = this.cellSize;
    const pc = Math.floor(p.x / cs);
    const pr = Math.floor(p.y / cs);
    const rings = Math.ceil(maxRadius / cs);
    let best: Point | null = null;
    let bestD = Infinity;
    for (let dr = -rings; dr <= rings; dr++) {
      for (let dc = -rings; dc <= rings; dc++) {
        if (this.isBlockedCell(pc + dc, pr + dr)) continue;
        const q = { x: (pc + dc + 0.5) * cs, y: (pr + dr + 0.5) * cs };
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= maxRadius && d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    return best;
  }

  private centre(i: number): Point {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    return { x: (c + 0.5) * this.cellSize, y: (r + 0.5) * this.cellSize };
  }

  /** Is the straight segment a→b clear of blocked cells? */
  lineClear(a: Point, b: Point): boolean {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (this.cellSize / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlockedAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /**
   * Find a path from `start` to any point satisfying `isGoal`.
   * `heuristicTarget` guides the search (use the goal's nearest point).
   * Returns waypoints (excluding start), or null if unreachable.
   */
  findPath(start: Point, isGoal: (p: Point) => boolean, heuristicTarget: Point, maxNodes = 60000, useLinks = false): Waypoint[] | null {
    const cs = this.cellSize;
    let sc = Math.floor(start.x / cs);
    let sr = Math.floor(start.y / cs);
    // If the start cell is blocked (we're hugging something), begin from the nearest free neighbour.
    if (this.isBlockedCell(sc, sr)) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          if (this.isBlockedCell(sc + dc, sr + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = [sc + dc, sr + dr];
          }
        }
      }
      if (!best) return null;
      [sc, sr] = best;
    }

    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    /** The link used to arrive at a cell, if any. */
    const cameBy = new Map<number, NavLink>();
    const closed = new Uint8Array(n);
    const open = new MinHeap();
    const startI = sr * this.cols + sc;
    const h = (i: number) => {
      const p = this.centre(i);
      const dx = Math.abs(p.x - heuristicTarget.x) / cs;
      const dy = Math.abs(p.y - heuristicTarget.y) / cs;
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };
    g[startI] = 0;
    open.push(startI, h(startI));

    let expanded = 0;
    let goalI = -1;
    while (open.size > 0) {
      const i = open.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (isGoal(this.centre(i))) {
        goalI = i;
        break;
      }
      if (++expanded > maxNodes) break;
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      for (const [dc, dr, cost] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (this.isBlockedCell(nc, nr)) continue;
        // No cutting corners past obstacles.
        if (dc !== 0 && dr !== 0 && (this.isBlockedCell(c + dc, r) || this.isBlockedCell(c, r + dr))) continue;
        const ni = nr * this.cols + nc;
        if (closed[ni]) continue;
        const ng = g[i] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = i;
          cameBy.delete(ni);
          open.push(ni, ng + h(ni));
        }
      }
      if (useLinks) {
        for (const link of this.links.get(i) ?? []) {
          const ni = this.cellIndex(link.to);
          if (closed[ni]) continue;
          const ng = g[i] + Math.hypot(link.to.x - link.from.x, link.to.y - link.from.y) / cs + (link.costMetres * 64) / cs;
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = i;
            cameBy.set(ni, link);
            open.push(ni, ng + h(ni));
          }
        }
      }
    }
    if (goalI < 0) return null;

    // Walk back to the start, splitting the route into walkable stretches at each link.
    const stretches: { cells: Point[]; via: NavLink | null }[] = [{ cells: [], via: null }];
    for (let i = goalI; i !== -1; i = came[i]) {
      stretches[stretches.length - 1].cells.push(this.centre(i));
      const via = cameBy.get(i);
      if (via) {
        stretches[stretches.length - 1].via = via;
        stretches.push({ cells: [], via: null });
      }
    }
    stretches.reverse();
    for (const st of stretches) st.cells.reverse();

    const path: Waypoint[] = [];
    let anchor = start;
    for (const st of stretches) {
      if (st.via) {
        // Walk to the link, do it, carry on from its far side.
        path.push({ x: st.via.from.x, y: st.via.from.y, link: st.via });
        anchor = st.via.to;
        path.push({ x: st.via.to.x, y: st.via.to.y });
      }
      path.push(...this.stringPull(anchor, st.cells));
      if (path.length) anchor = path[path.length - 1];
    }
    return path;
  }

  /** Skip waypoints while there's a clear straight line. */
  private stringPull(start: Point, cells: Point[]): Point[] {
    const out: Point[] = [];
    let anchor = start;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let j = cells.length - 1; j > k; j--) {
        if (this.lineClear(anchor, cells[j])) {
          far = j;
          break;
        }
      }
      out.push(cells[far]);
      anchor = cells[far];
      k = far + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, prio: number): void {
    const a = this.items;
    const p = this.prios;
    a.push(item);
    p.push(prio);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= p[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [p[i], p[parent]] = [p[parent], p[i]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items;
    const p = this.prios;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastPrio = p.pop()!;
    if (a.length > 0) {
      a[0] = lastItem;
      p[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
