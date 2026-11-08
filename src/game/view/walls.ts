/**
 * Wall rules: which walls stand in front of a room (for cutaways), and
 * splitting long walls into pieces. Pure TypeScript.
 */
import { PX_PER_METRE } from '../movement/tuning';
import type { Projection } from './projection';

const M = PX_PER_METRE;

/** PLACEHOLDER static scenery, described on the ground plane with heights. */
export type StaticProp =
  /** Walls, crates: a block with height. `wall` marks it as a wall (it can be cut away / lowered). */
  | { kind: 'box'; x: number; y: number; w: number; h: number; height: number; colour: number; wall?: boolean }
  /** A flat floor (also marks a room, for cutaways). */
  | { kind: 'floor'; x: number; y: number; w: number; h: number; colour: number }
  /** A round stone well with water inside. */
  | { kind: 'well'; x: number; y: number; r: number; height: number };

/** Sims-style wall display: full height; cut away in front of rooms; or all low. */
export type WallMode = 'up' | 'cutaway' | 'down';
export const WALL_MODES: WallMode[] = ['up', 'cutaway', 'down'];
export const WALL_LABEL: Record<WallMode, string> = { up: 'Walls up', cutaway: 'Cutaway', down: 'Walls down' };

/** How tall a cut-down wall stands. */
export const CUT_HEIGHT = 0.35 * M;
/** Side walls step down within this distance of a cut front wall (the "doll's house" corners). */
const CORNER_REACH = 2.5 * M;

export type Box = Extract<StaticProp, { kind: 'box' }>;

function insideFloor(floors: Extract<StaticProp, { kind: 'floor' }>[], x: number, y: number): boolean {
  return floors.some((f) => x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h);
}

/**
 * Is this wall piece standing between the camera and a room? True if there's
 * floor just behind it (on the far side from the viewer). In ¾, the side walls'
 * front stretches count too, so a room's front corners step down like a doll's house.
 */
export function isFrontWall(b: Box, floors: Extract<StaticProp, { kind: 'floor' }>[], p: Projection): boolean {
  const t = p.toward;
  if (!t) return false;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const long = b.w >= b.h ? { x: 1, y: 0 } : { x: 0, y: 1 };
  // Walls that face the viewer (their length runs across the view): look just behind them.
  if (Math.abs(long.x * t.x + long.y * t.y) < 0.8) {
    const d = Math.min(b.w, b.h) / 2 + 0.4 * M;
    if (insideFloor(floors, cx - t.x * d, cy - t.y * d)) return true;
  }
  if (p.mode === 'threequarter' && b.h > b.w) {
    for (const f of floors) {
      const onWestEdge = b.x <= f.x + 4 && b.x + b.w >= f.x - 4;
      const onEastEdge = b.x <= f.x + f.w + 4 && b.x + b.w >= f.x + f.w - 4;
      if ((onWestEdge || onEastEdge) && cy > f.y + f.h - CORNER_REACH && cy <= f.y + f.h + 4) return true;
    }
  }
  return false;
}

/** Split a long box into ~1 m pieces along its long axis. */
export function chunks(b: Box): Box[] {
  const out: Box[] = [];
  if (b.w >= b.h) {
    const n = Math.max(1, Math.round(b.w / M));
    for (let i = 0; i < n; i++) out.push({ ...b, x: b.x + (b.w * i) / n, w: b.w / n });
  } else {
    const n = Math.max(1, Math.round(b.h / M));
    for (let i = 0; i < n; i++) out.push({ ...b, y: b.y + (b.h * i) / n, h: b.h / n });
  }
  return out;
}
