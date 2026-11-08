/**
 * View projections. The simulation lives on a flat ground plane (x, y in world
 * px, 64 px = 1 m) with heights (z, same units). A projection turns ground +
 * height into screen-space for drawing, and screen-space back into ground for
 * input. Pure TypeScript.
 *
 * - top-down: straight overhead (heights invisible).
 * - three-quarter: an oblique view from the south: the ground is foreshortened
 *   and heights rise up the screen, so you see tops and south faces.
 * - isometric: true 2:1 isometric from the south-east: ground axes run along
 *   the diagonals; you see tops, south faces and east faces.
 *
 * The game uses ¾ only. Top-down and isometric were compared in-game and
 * dropped; their maths stays here (and tested), but nothing in the game uses them.
 */

export type ViewMode = 'topdown' | 'threequarter' | 'isometric';

export const VIEW_MODES: ViewMode[] = ['topdown', 'threequarter', 'isometric'];
export const VIEW_LABEL: Record<ViewMode, string> = { topdown: 'Top-down', threequarter: '¾ view', isometric: 'Isometric' };

export interface Pt {
  x: number;
  y: number;
}

export interface Projection {
  readonly mode: ViewMode;
  toScreen(x: number, y: number, z?: number): Pt;
  /** Screen point → the ground point (z = 0) under it. */
  toGround(sx: number, sy: number): Pt;
  /** Draw order: larger = nearer the viewer, drawn later. */
  depth(x: number, y: number): number;
  /** Unit ground direction pointing towards the viewer (which faces are visible); null when looking straight down. */
  readonly toward: Pt | null;
  /** Screen px per world px of height. */
  readonly up: number;
  /** Rough horizontal screen scale, for sizing upright figures consistently. */
  readonly across: number;
  /** Characters drawn upright (true) or seen from above (false). */
  readonly upright: boolean;
}

const FORE = 0.72; // three-quarter: ground foreshortening
const RISE34 = 0.78; // three-quarter: height scale
const ISO_X = Math.SQRT1_2; // isometric: ground → screen x
const ISO_Y = Math.SQRT1_2 / 2; // isometric: 2:1
const RISE_ISO = 0.78;

export function makeProjection(mode: ViewMode): Projection {
  switch (mode) {
    case 'topdown':
      return {
        mode,
        toScreen: (x, y) => ({ x, y }),
        toGround: (sx, sy) => ({ x: sx, y: sy }),
        depth: (_x, y) => y,
        toward: null,
        up: 0,
        across: 1,
        upright: false,
      };
    case 'threequarter':
      return {
        mode,
        toScreen: (x, y, z = 0) => ({ x, y: y * FORE - z * RISE34 }),
        toGround: (sx, sy) => ({ x: sx, y: sy / FORE }),
        depth: (_x, y) => y,
        toward: { x: 0, y: 1 },
        up: RISE34,
        across: 1,
        upright: true,
      };
    case 'isometric':
      return {
        mode,
        toScreen: (x, y, z = 0) => ({ x: (x - y) * ISO_X, y: (x + y) * ISO_Y - z * RISE_ISO }),
        toGround: (sx, sy) => {
          const a = sx / ISO_X; // x − y
          const b = sy / ISO_Y; // x + y
          return { x: (a + b) / 2, y: (b - a) / 2 };
        },
        depth: (x, y) => x + y,
        toward: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
        up: RISE_ISO,
        across: 0.9,
        upright: true,
      };
  }
}

/**
 * A direction on screen (e.g. from WASD or the touch stick: up = (0, −1)) →
 * the ground direction that moves that way on screen, keeping the input's
 * strength (length). So "up" always walks up the screen, whatever the view.
 */
export function screenToGroundDir(p: Projection, dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  const o = p.toGround(0, 0);
  const g = p.toGround(dx, dy);
  const gx = g.x - o.x;
  const gy = g.y - o.y;
  const glen = Math.hypot(gx, gy) || 1;
  return { x: (gx / glen) * len, y: (gy / glen) * len };
}

/** Screen-space bounds of a ground rectangle, with room for things up to `maxHeight` tall. */
export function projectedBounds(p: Projection, w: number, h: number, maxHeight: number): { x: number; y: number; width: number; height: number } {
  const pts = [
    p.toScreen(0, 0),
    p.toScreen(w, 0),
    p.toScreen(0, h),
    p.toScreen(w, h),
    p.toScreen(0, 0, maxHeight),
    p.toScreen(w, 0, maxHeight),
    p.toScreen(0, h, maxHeight),
    p.toScreen(w, h, maxHeight),
  ];
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
