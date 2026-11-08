import Phaser from 'phaser';
import type { ControlMode } from '../bridge';
import { PX_PER_METRE } from '../movement/tuning';
import { emptyBounds, flat, ringOnGround, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';

/**
 * PLACEHOLDER characters in the simple, readable style of RimWorld / Prison
 * Architect: a body, a head and floating hands, no limbs or animation.
 *
 An upright figure facing one of 8 screen directions (the game is drawn in
 * ¾). Hands are placed at their exact positions on the ground plane (so aim
 * and punches stay precise) and drawn in front of or behind the body
 * depending on which side of it they're on.
 *
 * Layer order is body → head → hair → face, with hands slotted before or
 * after; held items and worn equipment would hang off the same anchors
 * (`handGround` for anything held, the head/body for anything worn).
 */

const M = PX_PER_METRE;

export type Hand = 'left' | 'right';
export type BodyState = 'ok' | 'yielded' | 'ko';

export const PUNCH_EXTEND = 0.09; // s to full extension
export const PUNCH_RETRACT = 0.17; // s back to guard
export const PUNCH_TOTAL = PUNCH_EXTEND + PUNCH_RETRACT;

const SKIN = 0xd9ab84;
const OUTLINE = 0x231a12;
const HIGHLIGHT = 0xf3e3b5;

export interface Palette {
  tunic: number;
  hair: number;
}

export interface CharacterPose {
  mode: ControlMode;
  crouched: boolean;
  /** Distance-based stride phase, radians. */
  stridePhase: number;
  /** 0..1 how much the arms swing (scales with speed). */
  strideAmount: number;
  /** Punch timers in seconds since the punch started, or null. */
  punch: Record<Hand, number | null>;
  state: BodyState;
  /** Seconds left on the white hit flash. */
  hitFlash: number;
  highlighted: boolean;
  controlled: boolean;
  /** Raised off the ground (world px), e.g. while climbing through a window, or lying in bed. */
  lift: number;
  /** Lying down asleep (drawn like lying out cold, but in colour). */
  asleep: boolean;
}

export function createPose(): CharacterPose {
  return {
    mode: 'explore',
    crouched: false,
    stridePhase: 0,
    strideAmount: 0,
    punch: { left: null, right: null },
    state: 'ok',
    hitFlash: 0,
    highlighted: false,
    controlled: false,
    lift: 0,
    asleep: false,
  };
}

/** Local-space hand position on the ground plane (character facing +x, right hand on +y). */
export function handOffset(hand: Hand, pose: CharacterPose): { x: number; y: number } {
  const side = hand === 'right' ? 1 : -1;
  if (pose.state === 'yielded') return { x: 11, y: 6 * side }; // hands raised in front
  if (pose.mode === 'combat') {
    const guard = { x: 12, y: 11 * side };
    const t = pose.punch[hand];
    if (t === null) return guard;
    const p = t < PUNCH_EXTEND ? t / PUNCH_EXTEND : 1 - (t - PUNCH_EXTEND) / PUNCH_RETRACT;
    const e = Phaser.Math.Easing.Quadratic.Out(Phaser.Math.Clamp(p, 0, 1));
    return { x: guard.x + (28 - guard.x) * e, y: guard.y + (4 * side - guard.y) * e };
  }
  // Exploring: arms at the sides, swinging opposite to each other with the stride.
  const swing = Math.sin(pose.stridePhase) * 7 * pose.strideAmount * side;
  return { x: (pose.crouched ? 5 : 1) + swing, y: (pose.crouched ? 13 : 16) * side };
}

/** World ground position of a hand (the anchor for anything held in it). */
export function handGround(x: number, y: number, facing: number, hand: Hand, pose: CharacterPose): Pt {
  const h = handOffset(hand, pose);
  return { x: x + h.x * Math.cos(facing) - h.y * Math.sin(facing), y: y + h.x * Math.sin(facing) + h.y * Math.cos(facing) };
}

/** Height of the hands above the ground (world px), for upright figures. */
function handHeight(pose: CharacterPose): number {
  if (pose.state === 'yielded') return 1.25 * M;
  if (pose.mode === 'combat') return 1.0 * M;
  return (pose.crouched ? 0.5 : 0.7) * M;
}

export function shade(colour: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(colour);
  return Phaser.Display.Color.GetColor(Math.min(255, c.red * f), Math.min(255, c.green * f), Math.min(255, c.blue * f));
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, angle: number, n = 18): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * rx;
    const ey = Math.sin(t) * ry;
    out.push({ x: cx + ex * c - ey * s, y: cy + ex * s + ey * c });
  }
  return out;
}

export interface ViewResult {
  /** Screen bounds of the figure (for picking in angled views). */
  bounds: Bounds;
  /** Screen point just above the head, for bubbles and bars. */
  headTop: Pt;
}

export class CharacterView {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Draw at this depth instead of by ground position (e.g. lying on top of a bed). */
  depthOverride: number | null = null;
  /** Ground ring under the character you control. */
  private readonly ring: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    _x: number,
    _y: number,
    private readonly palette: Palette,
  ) {
    this.ring = scene.add.graphics().setDepth(3);
    this.g = scene.add.graphics().setDepth(20);
  }

  update(x: number, y: number, facing: number, pose: CharacterPose, p: Projection): ViewResult {
    this.ring.clear();
    if (pose.controlled) {
      this.ring.lineStyle(2, 0xffffff, 0.55);
      ringOnGround(this.ring, p, x, y, 25);
    }
    this.g.setDepth(this.depthOverride ?? 10 + p.depth(x, y) / 1000 + 0.0005);
    return this.drawUpright(x, y, facing, pose, p);
  }

  private drawUpright(x: number, y: number, facing: number, pose: CharacterPose, p: Projection): ViewResult {
    const g = this.g;
    g.clear();
    const flash = pose.hitFlash > 0;
    const outlineCol = pose.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = pose.highlighted ? 3 : 1.5;
    const tunic = flash ? 0xffffff : pose.state === 'yielded' ? shade(this.palette.tunic, 0.82) : this.palette.tunic;

    // Shadow on the ground.
    // A soft contact shadow at their feet: smooth, a little narrower than the body, fading at the edge.
    if (pose.state !== 'ko' && !pose.asleep) {
      for (const [r, alpha] of [[0.24, 0.06], [0.2, 0.07], [0.15, 0.08]] as const) flat(g, p, ellipsePts(x, y, r * M, r * M, 0, 48), 0, 0x000000, alpha);
    }

    if (pose.state === 'ko' || pose.asleep) return this.drawLying(x, y, facing, pose, p, tunic, outlineCol, ow, flash);

    // Which of 8 screen directions they're facing. (`lift` raises the whole figure, e.g. climbing.)
    const base = p.toScreen(x, y, pose.lift);
    const ahead = p.toScreen(x + Math.cos(facing) * 10, y + Math.sin(facing) * 10);
    const k = Math.round(Math.atan2(ahead.y - base.y, ahead.x - base.x) / (Math.PI / 4));
    const fx = Math.cos((k * Math.PI) / 4); // + right
    const fy = Math.sin((k * Math.PI) / 4); // + towards the viewer
    const up = p.up;
    const across = p.across;
    const lowered = pose.crouched || pose.state === 'yielded' ? 0.74 : 1;

    // Hands: exact positions on the ground plane, behind or in front of the body.
    const hz = handHeight(pose);
    const hands = (['left', 'right'] as const).map((hand) => {
      const gp = handGround(x, y, facing, hand, pose);
      return { s: p.toScreen(gp.x, gp.y, hz), behind: p.depth(gp.x, gp.y) < p.depth(x, y) - 1 };
    });
    const drawHand = (h: { s: Pt }) => this.hand(h.s.x, h.s.y, 0.075 * M * across, flash);
    hands.filter((h) => h.behind).forEach(drawHand);

    g.save();
    g.translateCanvas(base.x, base.y);
    const fig = this.figure({ fx, fy, up, across, lowered, tunic, outlineCol, ow, flash });
    g.restore();

    hands.filter((h) => !h.behind).forEach(drawHand);

    const bounds = emptyBounds();
    bounds.x0 = base.x - Math.max(fig.bodyW / 2, 0.35 * M * across);
    bounds.x1 = base.x + Math.max(fig.bodyW / 2, 0.35 * M * across);
    bounds.y0 = base.y + fig.headY - fig.headR - 4;
    bounds.y1 = base.y + 6;
    return { bounds, headTop: { x: base.x + fig.headX, y: base.y + fig.headY - fig.headR + 6 } };
  }

  private hand(sx: number, sy: number, r: number, flash: boolean): void {
    const g = this.g;
    g.fillStyle(flash ? 0xffffff : SKIN, 1);
    g.lineStyle(1.2, OUTLINE, 1);
    g.fillCircle(sx, sy, r);
    g.strokeCircle(sx, sy, r);
  }

  /**
   * The figure (legs, tunic, belt, head and face) drawn with its feet at the
   * origin and "up" along screen -y. Standing, that's drawn straight; lying
   * down, the same drawing is rotated onto the floor.
   */
  private figure(o: { fx: number; fy: number; up: number; across: number; lowered: number; tunic: number; outlineCol: number; ow: number; flash: boolean }) {
    const g = this.g;
    const { fx, fy, up, across, lowered, tunic, outlineCol, ow, flash } = o;
    const sy = (z: number) => -z * up;
    // Body: a rounded block, wider seen from the front/back than from the side.
    const bodyW = (0.3 + 0.22 * Math.abs(fy)) * M * across;
    const bodyTop = sy(1.12 * M * lowered);
    const bodyBottom = sy(0.04 * M);
    const r = Math.min(bodyW / 2, 0.16 * M);
    g.fillStyle(shade(this.palette.tunic, 0.55), 1); // hose
    g.fillRoundedRect(-bodyW * 0.38, sy(0.42 * M * lowered), bodyW * 0.76, bodyBottom - sy(0.42 * M * lowered), 4);
    g.fillStyle(tunic, 1);
    g.lineStyle(ow, outlineCol, 1);
    g.fillRoundedRect(-bodyW / 2, bodyTop, bodyW, sy(0.3 * M * lowered) - bodyTop, r);
    g.strokeRoundedRect(-bodyW / 2, bodyTop, bodyW, sy(0.3 * M * lowered) - bodyTop, r);
    // Belt.
    g.lineStyle(2, shade(this.palette.tunic, 0.5), 1);
    const beltY = sy(0.6 * M * lowered);
    g.lineBetween(-bodyW / 2 + 2, beltY, bodyW / 2 - 2, beltY);

    // Head: a skin-coloured ball with the hair as a cap over the top and down the back
    // (all hair when seen from behind). The hair follows the skull, so it never pokes out.
    const headR = 0.21 * M * across;
    const hx = fx * 0.04 * M * across;
    const hy = sy(1.36 * M * lowered);
    const skin = flash ? 0xffffff : SKIN;
    const seenFace = fy > -0.4;
    g.fillStyle(seenFace ? skin : this.palette.hair, 1);
    g.fillCircle(hx, hy, headR);
    if (seenFace) {
      // Arc from low on the back of the head, over the top, to the hairline above the brow.
      // (Canvas angles: 0 = right, 90° = down.) Front-on the hair is symmetrical; in profile
      // it comes further down the back and sits higher at the front.
      const side = Math.abs(fx);
      const back = (Math.PI / 180) * (190 - 60 * side);
      const front = (Math.PI / 180) * (350 - 30 * side);
      const mirror = fx < 0 ? -1 : 1;
      const pts: Pt[] = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = back + ((front - back) * i) / n;
        pts.push({ x: hx + Math.cos(a) * headR * mirror, y: hy + Math.sin(a) * headR });
      }
      // Hairline: straight back across the brow to just behind the ear, then down to the nape.
      const browY = pts[pts.length - 1].y;
      const earX = hx - 0.15 * headR * side * mirror;
      pts.push({ x: earX, y: browY }, { x: earX, y: pts[0].y });
      g.fillStyle(this.palette.hair, 1);
      g.fillPoints(pts as Phaser.Math.Vector2[], true);

      // Eyes: two seen from the front, merging to one in profile. Shut (a line) when asleep or out cold.
      g.fillStyle(0x2a1d14, 1);
      const spread = headR * 0.32 * Math.max(0, fy);
      const ex = hx + fx * headR * 0.45;
      const ey = hy + headR * 0.12;
      if (this.eyesShut) {
        g.lineStyle(1.4, 0x2a1d14, 1);
        for (const dx of spread > 1.2 ? [-spread, spread] : [fx * headR * 0.15]) g.lineBetween(ex + dx - 2, ey, ex + dx + 2, ey);
      } else if (spread > 1.2) {
        g.fillCircle(ex - spread, ey, 1.6);
        g.fillCircle(ex + spread, ey, 1.6);
      } else {
        g.fillCircle(ex + fx * headR * 0.15, ey, 1.6);
      }
    }
    g.lineStyle(ow, outlineCol, 1);
    g.strokeCircle(hx, hy, headR);
    return { bodyW, headR, headX: hx, headY: hy, beltY };
  }

  private eyesShut = false;

  /**
   * Lying flat on their back along their facing (head that way): the standing
   * figure, rotated to lie on the floor (or on a bed, via `lift`) and
   * foreshortened by the view, so it reads as the same person.
   */
  private drawLying(x: number, y: number, facing: number, pose: CharacterPose, p: Projection, tunic: number, outlineCol: number, ow: number, flash: boolean): ViewResult {
    const g = this.g;
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const length = 1.57 * M; // feet to the top of the head
    const z = pose.lift + 0.1 * M; // the body has some thickness
    const feet = { x: x - c * length * 0.5, y: y - s * length * 0.5 };
    const fs = p.toScreen(feet.x, feet.y, z);
    const hs = p.toScreen(feet.x + c * length, feet.y + s * length, z);
    const vx = hs.x - fs.x;
    const vy = hs.y - fs.y;
    const along = Math.hypot(vx, vy);
    const up = p.up || 1;
    // Shadow on the floor (not in bed).
    if (!pose.asleep) {
      for (const [k, alpha] of [[1, 0.06], [0.85, 0.07], [0.68, 0.08]] as const) flat(g, p, ellipsePts(x, y, length * 0.5 * k, 0.24 * M * k, facing, 48), 0, 0x000000, alpha);
    }

    g.save();
    g.translateCanvas(fs.x, fs.y);
    g.rotateCanvas(Math.atan2(vy, vx) + Math.PI / 2);
    g.scaleCanvas(1, Math.max(0.05, along / (length * up)));
    // Face up, seen from the front; arms by their sides (flung out when knocked out).
    this.eyesShut = true;
    const fig = this.figure({ fx: 0, fy: 1, up, across: p.across, lowered: 1, tunic, outlineCol, ow, flash });
    this.eyesShut = false;
    const out = pose.asleep ? 0.62 : 1.05;
    for (const side of [-1, 1]) this.hand(side * fig.bodyW * out, fig.beltY, 0.075 * M * p.across, flash);
    g.restore();

    const pad = 0.4 * M;
    const bounds = { x0: Math.min(fs.x, hs.x) - pad, y0: Math.min(fs.y, hs.y) - pad, x1: Math.max(fs.x, hs.x) + pad, y1: Math.max(fs.y, hs.y) + pad };
    return { bounds, headTop: { x: hs.x, y: Math.min(fs.y, hs.y) - 0.3 * M } };
  }

  destroy(): void {
    this.g.destroy();
    this.ring.destroy();
  }
}
