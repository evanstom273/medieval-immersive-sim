import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import { circlePts, flat, prism, rectPts, shade, type Bounds } from './draw';
import type { Projection, Pt } from './projection';

const M = PX_PER_METRE;

/** PLACEHOLDER static scenery, described on the ground plane with heights. */
export type StaticProp =
  /** Walls, crates: a block with height. `fade` lets it go see-through when it hides the player. */
  | { kind: 'box'; x: number; y: number; w: number; h: number; height: number; colour: number; fade?: boolean }
  /** A flat floor. */
  | { kind: 'floor'; x: number; y: number; w: number; h: number; colour: number }
  /** A round stone well with water inside. */
  | { kind: 'well'; x: number; y: number; r: number; height: number };

interface Drawn {
  g: Phaser.GameObjects.Graphics;
  bounds: Bounds | null;
  depthKey: number;
  fade: boolean;
}

/**
 * Draws the static scenery through the active projection. Rebuilt when the
 * view changes. In the angled views long walls are drawn as 1 m chunks so
 * people sort in front of / behind them correctly, and chunks that would hide
 * the character you control fade out.
 */
export class Scenery {
  private readonly props: StaticProp[] = [];
  private drawn: Drawn[] = [];
  private readonly ground: Phaser.GameObjects.Graphics;

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
    for (const d of this.drawn) d.g.destroy();
    this.drawn = [];
    this.drawGround(p);
    for (const prop of this.props) {
      if (prop.kind === 'box' && p.upright) {
        for (const chunk of chunks(prop)) this.drawn.push(this.drawBox(chunk, p));
      } else if (prop.kind === 'box') {
        this.drawn.push(this.drawBox(prop, p));
      } else if (prop.kind === 'floor') {
        const g = this.scene.add.graphics().setDepth(1);
        flat(g, p, rectPts(prop.x, prop.y, prop.w, prop.h), 0, prop.colour);
        this.drawn.push({ g, bounds: null, depthKey: 0, fade: false });
      } else {
        const g = this.scene.add.graphics();
        const outer = circlePts(prop.x, prop.y, prop.r, 28);
        const h = p.upright ? prop.height : 0;
        const bounds = prism(g, p, outer, 0, h, { colour: 0x7f7a70, top: 0x8c877c, outline: 0x2c2822, outlineWidth: 3 });
        flat(g, p, circlePts(prop.x, prop.y, prop.r * 0.64, 24), h, 0x1f2a33);
        const front = p.mode === 'isometric' ? { x: prop.x + prop.r * 0.7, y: prop.y + prop.r * 0.7 } : { x: prop.x, y: prop.y + prop.r };
        const depthKey = p.depth(front.x, front.y);
        g.setDepth(p.upright ? 10 + depthKey / 1000 : 10);
        this.drawn.push({ g, bounds, depthKey, fade: false });
      }
    }
  }

  /**
   * See-through walls: in the angled views, wall chunks in front of `focus`
   * (screen point of the character you control) that overlap them fade out.
   */
  updateFade(p: Projection, focusGround: Pt, focusScreen: Bounds | null): void {
    if (!p.upright || !focusScreen) {
      for (const d of this.drawn) if (d.g.alpha !== 1) d.g.setAlpha(1);
      return;
    }
    const key = p.depth(focusGround.x, focusGround.y);
    for (const d of this.drawn) {
      if (!d.fade || !d.bounds) continue;
      const b = d.bounds;
      const overlaps = b.x0 < focusScreen.x1 + 6 && b.x1 > focusScreen.x0 - 6 && b.y0 < focusScreen.y1 && b.y1 > focusScreen.y0 - 6;
      const target = overlaps && d.depthKey > key ? 0.28 : 1;
      d.g.setAlpha(d.g.alpha + (target - d.g.alpha) * 0.25);
    }
  }

  private drawBox(b: Extract<StaticProp, { kind: 'box' }>, p: Projection): Drawn {
    const g = this.scene.add.graphics();
    const h = p.upright ? b.height : 0;
    const bounds = prism(g, p, rectPts(b.x, b.y, b.w, b.h), 0, h, { colour: b.colour, top: shade(b.colour, 1.06), outline: 0x2c2822, outlineWidth: 1.5 });
    const front = p.mode === 'isometric' ? { x: b.x + b.w, y: b.y + b.h } : { x: b.x + b.w / 2, y: b.y + b.h };
    const depthKey = p.depth(front.x, front.y);
    g.setDepth(p.upright ? 10 + depthKey / 1000 : 10);
    return { g, bounds, depthKey, fade: !!b.fade };
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

/** Split a long box into ~1 m pieces along its long axis. */
function chunks(b: Extract<StaticProp, { kind: 'box' }>): Extract<StaticProp, { kind: 'box' }>[] {
  const out: Extract<StaticProp, { kind: 'box' }>[] = [];
  if (b.w >= b.h) {
    const n = Math.max(1, Math.round(b.w / M));
    for (let i = 0; i < n; i++) out.push({ ...b, x: b.x + (b.w * i) / n, w: b.w / n });
  } else {
    const n = Math.max(1, Math.round(b.h / M));
    for (let i = 0; i < n; i++) out.push({ ...b, y: b.y + (b.h * i) / n, h: b.h / n });
  }
  return out;
}
