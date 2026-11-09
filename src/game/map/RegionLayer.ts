import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import type { P, Region } from './region';

/**
 * The region drawn as an ink-and-wash map on parchment, in the game's ¾ screen space (x as is, ground
 * y × 0.72) so it lines up with the village and the live world. Vector shapes, redrawn when the zoom
 * changes enough, so lines stay a steady width on screen and it's sharp at every zoom.
 */

const M = PX_PER_METRE;
const FORE = 0.72;
const INK = 0x3b2a1a;
const INK_SOFT = 0x6b5236;
const PAPER = 0xe9dcb8;

export class RegionLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels: { t: Phaser.GameObjects.Text; x: number; y: number; home: boolean }[] = [];
  private drawnFor = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly region: Region,
  ) {
    this.g = scene.add.graphics().setDepth(-10);
    const res = Math.min(3, window.devicePixelRatio || 1);
    for (const s of region.settlements) {
      const big = s.kind === 'town' || s.kind === 'home';
      const t = scene.add
        .text(0, 0, s.label, { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: big ? '15px' : '12px', color: s.kind === 'home' ? '#7a1a12' : '#2a1d14', stroke: '#efe4c4', strokeThickness: 3 })
        .setOrigin(0.5, 0)
        .setResolution(res)
        .setDepth(-5);
      this.labels.push({ t, x: s.x * M, y: s.y * M * FORE, home: s.kind === 'home' });
    }
  }

  /** Follow the zoom (redraw if it's changed much), and fade. `px` = world px per CSS px. */
  update(alpha: number, px: number, labelAlpha = alpha): void {
    const shown = alpha > 0.001;
    this.g.setVisible(shown).setAlpha(alpha);
    for (const l of this.labels) l.t.setVisible(labelAlpha > 0.001).setAlpha(labelAlpha).setScale(px).setPosition(l.x, l.y + 10 * px);
    if (!shown) return;
    if (this.drawnFor === 0 || Math.abs(Math.log(px / this.drawnFor)) > 0.15) {
      this.drawnFor = px;
      this.draw(px);
    }
  }

  private draw(px: number): void {
    const g = this.g;
    const r = this.region;
    g.clear();
    const X = (x: number) => x * M;
    const Y = (y: number) => y * M * FORE;
    const poly = (pts: P[]) => pts.map(([x, y]) => new Phaser.Math.Vector2(X(x), Y(y)));
    const line = (pts: P[], width: number, colour: number, alpha = 1) => {
      g.lineStyle(width * px, colour, alpha);
      g.strokePoints(poly(pts), false);
    };
    // The sheet.
    g.fillStyle(PAPER, 1);
    g.fillRect(X(r.x0), Y(r.y0), X(r.x1) - X(r.x0), Y(r.y1) - Y(r.y0));
    // Commons: pale green, a dotted edge.
    for (const c of r.commons) {
      g.fillStyle(0xc9cf9a, 0.55);
      g.fillPoints(poly(c), true);
      g.lineStyle(1 * px, INK_SOFT, 0.5);
      g.strokePoints(poly(c), true);
    }
    // Open fields: strips in alternating tints, finely outlined.
    r.fields.forEach((f, i) => {
      g.fillStyle([0xd8c68e, 0xcdbd84, 0xd4cc95, 0xc9b67c][i % 4], 0.85);
      g.fillPoints(poly(f), true);
      g.lineStyle(0.6 * px, INK_SOFT, 0.55);
      g.strokePoints(poly(f), true);
    });
    // Woods: overlapping canopies, a darker edge drawn first so the clump has one outline.
    g.fillStyle(0x6f7a46, 1);
    for (const [x, y, rr] of r.woods) g.fillEllipse(X(x), Y(y), X(rr * 2) + 3 * px * 2, Y(rr * 2) + 3 * px * 2);
    g.fillStyle(0x9aa36a, 1);
    for (const [x, y, rr] of r.woods) g.fillEllipse(X(x), Y(y), X(rr * 2), Y(rr * 2));
    // Tree marks on top, a few per clump.
    g.fillStyle(0x5d683a, 0.9);
    for (const [x, y, rr] of r.woods) {
      for (const [dx, dy] of [[-0.35, -0.2], [0.3, -0.1], [0, 0.3]] as const) g.fillCircle(X(x + dx * rr), Y(y + dy * rr), Math.max(2 * px, X(rr * 0.22)));
    }
    // Hills: a little ridge mark with hachures.
    for (const [x, y, s] of r.hills) {
      const w = X(s);
      const hgt = Y(s * 0.55);
      g.lineStyle(1.4 * px, INK_SOFT, 0.85);
      g.beginPath();
      g.moveTo(X(x) - w / 2, Y(y));
      g.lineTo(X(x), Y(y) - hgt);
      g.lineTo(X(x) + w / 2, Y(y));
      g.strokePath();
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        g.lineBetween(X(x) + (w / 2) * t * 0.9, Y(y) - hgt * (1 - t), X(x) + (w / 2) * t * 0.9 + w * 0.06, Y(y) - hgt * (1 - t) + hgt * 0.35);
      }
    }
    // The river: a darker bank line, the water over it.
    line(r.river, 9, 0x4c6d80, 0.9);
    line(r.river, 6, 0x8fb0c0, 1);
    // Roads: main roads solid, tracks fainter.
    for (const rd of r.roads) {
      if (rd.main) {
        line(rd.points, 4.2, INK, 0.85);
        line(rd.points, 2.2, 0xd9c79c, 1);
      } else line(rd.points, 1.6, INK_SOFT, 0.8);
    }
    // Settlements.
    for (const s of r.settlements) {
      for (const hs of s.houses) {
        const c = Math.cos(hs.a);
        const sn = Math.sin(hs.a);
        const corners: P[] = [
          [-hs.w / 2, -hs.h / 2],
          [hs.w / 2, -hs.h / 2],
          [hs.w / 2, hs.h / 2],
          [-hs.w / 2, hs.h / 2],
        ].map(([dx, dy]) => [hs.x + dx * c - dy * sn, hs.y + dx * sn + dy * c] as P);
        g.fillStyle(0xb5743f, 1);
        g.fillPoints(poly(corners), true);
        g.lineStyle(0.8 * px, INK, 1);
        g.strokePoints(poly(corners), true);
      }
      if (s.kind === 'town') {
        // A town wall round the houses.
        g.lineStyle(3 * px, INK, 0.9);
        g.strokeEllipse(X(s.x), Y(s.y), X(640), Y(640));
      }
      if (s.kind === 'castle') castle(g, X(s.x), Y(s.y), px);
      if (s.kind === 'manor') {
        g.lineStyle(1.2 * px, INK, 0.9);
        g.strokeRect(X(s.x - 45), Y(s.y - 35), X(90), Y(70));
      }
      if (s.kind === 'home') {
        g.lineStyle(2.5 * px, 0xa8261c, 1);
        g.strokeCircle(X(s.x), Y(s.y), Math.max(10 * px, X(70)));
      }
    }
    // The edge of the known world, ruled twice.
    g.lineStyle(4 * px, INK, 1);
    g.strokeRect(X(r.x0), Y(r.y0), X(r.x1) - X(r.x0), Y(r.y1) - Y(r.y0));
    g.lineStyle(1.5 * px, INK, 1);
    g.strokeRect(X(r.x0) + 8 * px, Y(r.y0) + 8 * px, X(r.x1) - X(r.x0) - 16 * px, Y(r.y1) - Y(r.y0) - 16 * px);
  }
}

/** A little castle mark: a curtain wall with towers, drawn a fixed size on screen. */
function castle(g: Phaser.GameObjects.Graphics, x: number, y: number, px: number): void {
  const s = 14 * px;
  g.fillStyle(0xcfc3a5, 1);
  g.lineStyle(1.4 * px, INK, 1);
  g.fillRect(x - s, y - s * 0.6, s * 2, s * 1.2);
  g.strokeRect(x - s, y - s * 0.6, s * 2, s * 1.2);
  for (const tx of [-s, s]) {
    g.fillRect(x + tx - s * 0.35, y - s * 1.1, s * 0.7, s * 1.7);
    g.strokeRect(x + tx - s * 0.35, y - s * 1.1, s * 0.7, s * 1.7);
  }
  g.fillRect(x - s * 0.4, y - s * 1.4, s * 0.8, s * 1.0);
  g.strokeRect(x - s * 0.4, y - s * 1.4, s * 0.8, s * 1.0);
}
