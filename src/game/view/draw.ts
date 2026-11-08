import Phaser from 'phaser';
import type { Projection, Pt } from './projection';

/**
 * Drawing helpers for PLACEHOLDER geometry with height, in any projection.
 * Shapes are described on the ground plane (world px) plus a base height and
 * a height, and drawn through the projection: in top-down you see the top; in
 * the angled views you see the top and whichever sides face the viewer,
 * shaded by which way they face (light from the north-west, above).
 */

export const OUTLINE = 0x231a12;
export const HIGHLIGHT = 0xf3e3b5;

export function shade(colour: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(colour);
  return Phaser.Display.Color.GetColor(Math.min(255, c.red * f), Math.min(255, c.green * f), Math.min(255, c.blue * f));
}

export function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function circlePts(cx: number, cy: number, r: number, n = 20): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** A rotated rectangle on the ground: from `a` along direction `angle`, `length` long and `thickness` wide. */
export function slabPts(ax: number, ay: number, angle: number, length: number, thickness: number): Pt[] {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy * (thickness / 2);
  const ny = dx * (thickness / 2);
  return [
    { x: ax + nx, y: ay + ny },
    { x: ax + dx * length + nx, y: ay + dy * length + ny },
    { x: ax + dx * length - nx, y: ay + dy * length - ny },
    { x: ax - nx, y: ay - ny },
  ];
}

const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

export interface PrismStyle {
  colour: number;
  /** Top colour (defaults to `colour`). */
  top?: number;
  outline?: number | null;
  outlineWidth?: number;
  alpha?: number;
}

/** Screen bounds of what was drawn, for clicking and occlusion checks. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function emptyBounds(): Bounds {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

function grow(b: Bounds, pts: Pt[]): void {
  for (const p of pts) {
    b.x0 = Math.min(b.x0, p.x);
    b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x);
    b.y1 = Math.max(b.y1, p.y);
  }
}

function fill(g: Phaser.GameObjects.Graphics, pts: Pt[], colour: number, alpha: number, outline: number | null, width: number): void {
  g.fillStyle(colour, alpha);
  g.fillPoints(pts as Phaser.Math.Vector2[], true);
  if (outline !== null) {
    g.lineStyle(width, outline, alpha);
    g.strokePoints(pts as Phaser.Math.Vector2[], true);
  }
}

/**
 * A convex ground polygon extruded from height z0 to z0 + height.
 * Returns the screen bounds drawn.
 */
export function prism(g: Phaser.GameObjects.Graphics, p: Projection, ground: Pt[], z0: number, height: number, s: PrismStyle, bounds = emptyBounds()): Bounds {
  const alpha = s.alpha ?? 1;
  const outline = s.outline === undefined ? OUTLINE : s.outline;
  const width = s.outlineWidth ?? 1.5;
  const top = ground.map((q) => p.toScreen(q.x, q.y, z0 + height));

  if (p.toward) {
    const cx = ground.reduce((a, q) => a + q.x, 0) / ground.length;
    const cy = ground.reduce((a, q) => a + q.y, 0) / ground.length;
    const faces: { pts: Pt[]; depth: number; colour: number }[] = [];
    for (let i = 0; i < ground.length; i++) {
      const a = ground[i];
      const b = ground[(i + 1) % ground.length];
      let nx = b.y - a.y;
      let ny = -(b.x - a.x);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // Point the normal outwards.
      if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (nx * p.toward.x + ny * p.toward.y <= 0.01) continue; // faces away from the viewer
      const lit = 0.68 + 0.2 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y) - 0.06 * Math.max(0, -(nx * LIGHT.x + ny * LIGHT.y));
      faces.push({
        pts: [p.toScreen(a.x, a.y, z0), p.toScreen(b.x, b.y, z0), p.toScreen(b.x, b.y, z0 + height), p.toScreen(a.x, a.y, z0 + height)],
        depth: p.depth((a.x + b.x) / 2, (a.y + b.y) / 2),
        colour: shade(s.colour, lit),
      });
    }
    faces.sort((f1, f2) => f1.depth - f2.depth);
    for (const f of faces) {
      fill(g, f.pts, f.colour, alpha, outline, width);
      grow(bounds, f.pts);
    }
  }
  fill(g, top, s.top ?? s.colour, alpha, outline, width);
  grow(bounds, top);
  return bounds;
}

/** Screen bounds a prism would cover, without drawing it. */
export function prismBounds(p: Projection, ground: Pt[], z0: number, height: number, b = emptyBounds()): Bounds {
  grow(b, ground.map((q) => p.toScreen(q.x, q.y, z0)));
  grow(b, ground.map((q) => p.toScreen(q.x, q.y, z0 + height)));
  return b;
}

/** A flat shape lying at height z. */
export function flat(g: Phaser.GameObjects.Graphics, p: Projection, ground: Pt[], z: number, colour: number, alpha = 1, outline: number | null = null, width = 1.5): Bounds {
  const pts = ground.map((q) => p.toScreen(q.x, q.y, z));
  fill(g, pts, colour, alpha, outline, width);
  const b = emptyBounds();
  grow(b, pts);
  return b;
}

/** Outline of a circle on the ground (or at height z). */
export function ringOnGround(g: Phaser.GameObjects.Graphics, p: Projection, cx: number, cy: number, r: number, z = 0, from = 0, to = Math.PI * 2, n = 32): void {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const s = p.toScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
    if (i === 0) g.moveTo(s.x, s.y);
    else g.lineTo(s.x, s.y);
  }
  g.strokePath();
}

/** A filled circle on the ground. */
export function discOnGround(g: Phaser.GameObjects.Graphics, p: Projection, cx: number, cy: number, r: number, colour: number, alpha: number, z = 0): void {
  flat(g, p, circlePts(cx, cy, r, 24), z, colour, alpha);
}
