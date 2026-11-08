import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import { circlePts, flat, prism, prismBounds, rectPts, shade, type Bounds } from './draw';
import type { Projection, Pt } from './projection';

const M = PX_PER_METRE;

import { CUT_HEIGHT, chunks, isFrontWall, type Box, type StaticProp, type WallMode } from './walls';

export { WALL_LABEL, WALL_MODES, type StaticProp, type WallMode } from './walls';

/** Walls glide up and down at this speed (world px per second). */
const WALL_SPEED = 7 * M;

interface Piece {
  g: Phaser.GameObjects.Graphics;
  /** Full-height screen bounds (for picking / occlusion tests, stable while walls move). */
  bounds: Bounds | null;
  depthKey: number;
  box?: Box;
  /** Height currently drawn (walls only). */
  shown: number;
  /** In front of a room as seen from the camera: cut down in cutaway mode. */
  front: boolean;
}

/**
 * Draws the static scenery through the active projection. Rebuilt when the
 * view changes. In the angled views walls are drawn as 1 m pieces so people
 * sort in front of / behind them correctly, and they follow the wall mode:
 * up, cutaway (cut down in front of rooms and wherever they'd hide the
 * character you control) or down.
 */
export class Scenery {
  private readonly props: StaticProp[] = [];
  private pieces: Piece[] = [];
  private readonly ground: Phaser.GameObjects.Graphics;
  private proj: Projection | null = null;
  mode: WallMode = 'cutaway';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldW: number,
    private readonly worldH: number,
  ) {
    this.ground = scene.add.graphics().setDepth(0);
  }

  add(prop: StaticProp): void {
    this.props.push(prop);
  }

  build(p: Projection): void {
    this.proj = p;
    for (const d of this.pieces) d.g.destroy();
    this.pieces = [];
    this.drawGround(p);
    const floors = this.props.filter((q): q is Extract<StaticProp, { kind: 'floor' }> => q.kind === 'floor');

    for (const prop of this.props) {
      if (prop.kind === 'box') {
        for (const box of p.upright ? chunks(prop) : [prop]) {
          const front = !!box.wall && p.upright && isFrontWall(box, floors, p);
          const piece: Piece = { g: this.scene.add.graphics(), bounds: null, depthKey: 0, box, shown: box.height, front };
          // Start at the mode's height so switching views doesn't animate everything.
          piece.shown = this.targetHeight(piece, false);
          piece.bounds = prismBounds(p, rectPts(box.x, box.y, box.w, box.h), 0, p.upright ? box.height : 0);
          this.drawPiece(piece);
          this.pieces.push(piece);
        }
      } else if (prop.kind === 'floor') {
        const g = this.scene.add.graphics().setDepth(1);
        flat(g, p, rectPts(prop.x, prop.y, prop.w, prop.h), 0, prop.colour);
        this.pieces.push({ g, bounds: null, depthKey: 0, shown: 0, front: false });
      } else {
        const g = this.scene.add.graphics();
        const h = p.upright ? prop.height : 0;
        const bounds = prism(g, p, circlePts(prop.x, prop.y, prop.r, 28), 0, h, { colour: 0x7f7a70, top: 0x8c877c, outline: 0x2c2822, outlineWidth: 3 });
        flat(g, p, circlePts(prop.x, prop.y, prop.r * 0.64, 24), h, 0x1f2a33);
        const front = p.mode === 'isometric' ? { x: prop.x + prop.r * 0.7, y: prop.y + prop.r * 0.7 } : { x: prop.x, y: prop.y + prop.r };
        const depthKey = p.depth(front.x, front.y);
        g.setDepth(p.upright ? 10 + depthKey / 1000 : 10);
        this.pieces.push({ g, bounds, depthKey, shown: 0, front: false });
      }
    }
  }

  setMode(mode: WallMode): void {
    this.mode = mode;
  }

  /**
   * Per frame: move walls towards their target heights (cut down / up) and
   * fade any full-height wall that hides the character you control.
   */
  update(dt: number, focusGround: Pt, focusScreen: Bounds | null): void {
    const p = this.proj;
    if (!p || !p.upright) return;
    const key = p.depth(focusGround.x, focusGround.y);
    for (const piece of this.pieces) {
      if (!piece.box?.wall) continue;
      const hides = !!focusScreen && !!piece.bounds && piece.depthKey > key && overlaps(piece.bounds, focusScreen);
      const target = this.targetHeight(piece, hides);
      if (Math.abs(piece.shown - target) > 0.5) {
        const step = WALL_SPEED * dt;
        piece.shown = piece.shown < target ? Math.min(target, piece.shown + step) : Math.max(target, piece.shown - step);
        this.drawPiece(piece);
      }
      // Walls up: rather than cutting, fade what's in the way.
      const alpha = this.mode === 'up' && hides ? 0.28 : 1;
      piece.g.setAlpha(piece.g.alpha + (alpha - piece.g.alpha) * 0.25);
    }
  }

  /** Height of the wall at a point right now (for cutting a doorway's door down with its wall). */
  wallHeightNear(x: number, y: number, slack = 6): number | null {
    let best: number | null = null;
    for (const piece of this.pieces) {
      const b = piece.box;
      if (!b?.wall) continue;
      if (x >= b.x - slack && x <= b.x + b.w + slack && y >= b.y - slack && y <= b.y + b.h + slack) best = best === null ? piece.shown : Math.min(best, piece.shown);
    }
    return best;
  }

  private targetHeight(piece: Piece, hidesFocus: boolean): number {
    const b = piece.box!;
    if (!b.wall || !this.proj?.upright) return b.height;
    if (this.mode === 'down') return Math.min(b.height, CUT_HEIGHT);
    if (this.mode === 'cutaway' && (piece.front || hidesFocus)) return Math.min(b.height, CUT_HEIGHT);
    return b.height;
  }

  private drawPiece(piece: Piece): void {
    const p = this.proj!;
    const b = piece.box!;
    const g = piece.g;
    g.clear();
    const h = p.upright ? piece.shown : 0;
    const cut = b.wall && h < b.height - 0.5;
    // A cut wall shows its cross-section on top, a little darker, like a cut through plaster.
    prism(g, p, rectPts(b.x, b.y, b.w, b.h), 0, h, { colour: b.colour, top: cut ? shade(b.colour, 0.72) : shade(b.colour, 1.06), outline: 0x2c2822, outlineWidth: 1.5 });
    const front = p.mode === 'isometric' ? { x: b.x + b.w, y: b.y + b.h } : { x: b.x + b.w / 2, y: b.y + b.h };
    piece.depthKey = p.depth(front.x, front.y);
    g.setDepth(p.upright ? 10 + piece.depthKey / 1000 : 10);
  }

  private drawGround(p: Projection): void {
    const g = this.ground;
    g.clear();
    flat(g, p, rectPts(0, 0, this.worldW, this.worldH), 0, 0x5d6b45);
    // 1 m grid, heavier every 5 m.
    for (let x = 0; x <= this.worldW; x += M) {
      const a = p.toScreen(x, 0);
      const b = p.toScreen(x, this.worldH);
      g.lineStyle(1, 0x000000, (x / M) % 5 === 0 ? 0.16 : 0.06);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = 0; y <= this.worldH; y += M) {
      const a = p.toScreen(0, y);
      const b = p.toScreen(this.worldW, y);
      g.lineStyle(1, 0x000000, (y / M) % 5 === 0 ? 0.16 : 0.06);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x0 < b.x1 + 6 && a.x1 > b.x0 - 6 && a.y0 < b.y1 && a.y1 > b.y0 - 6;
}

