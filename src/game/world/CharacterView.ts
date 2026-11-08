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
    if (!pose.asleep) flat(g, p, ellipsePts(x, y, 0.3 * M, 0.3 * M, 0), 0, 0x000000, 0.2);

    if (pose.state === 'ko' || pose.asleep) {
      // Lying along their facing: on the ground, or (asleep) on whatever they're lying on.
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      const z = pose.lift;
      flat(g, p, ellipsePts(x - c * 0.45 * M, y - s * 0.45 * M, 0.28 * M, 0.12 * M, facing), z + 3, shade(this.palette.tunic, 0.6), 1, outlineCol, ow);
      flat(g, p, ellipsePts(x, y, 0.32 * M, 0.2 * M, facing), z + 6, tunic, 1, outlineCol, ow);
      // Asleep: arms by their sides rather than flung out.
      const reach = pose.asleep ? 0.24 : 0.38;
      for (const side of [-1, 1]) flat(g, p, ellipsePts(x + c * 0.1 * M - s * side * reach * M, y + s * 0.1 * M + c * side * reach * M, 0.07 * M, 0.07 * M, 0), z + 4, SKIN, 1, OUTLINE, 1.2);
      flat(g, p, ellipsePts(x + c * 0.5 * M, y + s * 0.5 * M, 0.17 * M, 0.17 * M, 0), z + 8, SKIN, 1, outlineCol, ow);
      flat(g, p, ellipsePts(x + c * 0.56 * M, y + s * 0.56 * M, 0.12 * M, 0.17 * M, facing), z + 9, this.palette.hair, 1);
      const b = p.toScreen(x, y, z);
      return { bounds: { x0: b.x - 0.7 * M, y0: b.y - 0.5 * M, x1: b.x + 0.7 * M, y1: b.y + 0.5 * M }, headTop: { x: b.x, y: b.y - 0.3 * M } };
    }

    // Which of 8 screen directions they're facing. (`lift` raises the whole figure, e.g. climbing.)
    const base = p.toScreen(x, y, pose.lift);
    const ahead = p.toScreen(x + Math.cos(facing) * 10, y + Math.sin(facing) * 10);
    const k = Math.round(Math.atan2(ahead.y - base.y, ahead.x - base.x) / (Math.PI / 4));
    const fx = Math.cos((k * Math.PI) / 4); // + right
    const fy = Math.sin((k * Math.PI) / 4); // + towards the viewer
    const up = p.up;
    const across = p.across;
    const lowered = pose.crouched || pose.state === 'yielded' ? 0.74 : 1;
    const sy = (z: number) => base.y - z * up;

    // Hands: exact positions on the ground plane, behind or in front of the body.
    const hz = handHeight(pose);
    const hands = (['left', 'right'] as const).map((hand) => {
      const gp = handGround(x, y, facing, hand, pose);
      return { s: p.toScreen(gp.x, gp.y, hz), behind: p.depth(gp.x, gp.y) < p.depth(x, y) - 1 };
    });
    const drawHand = (h: { s: Pt }) => {
      g.fillStyle(flash ? 0xffffff : SKIN, 1);
      g.lineStyle(1.2, OUTLINE, 1);
      g.fillCircle(h.s.x, h.s.y, 0.075 * M * across);
      g.strokeCircle(h.s.x, h.s.y, 0.075 * M * across);
    };
    hands.filter((h) => h.behind).forEach(drawHand);

    // Body: a rounded block, wider seen from the front/back than from the side.
    const bodyW = (0.3 + 0.22 * Math.abs(fy)) * M * across;
    const bodyTop = sy(1.12 * M * lowered);
    const bodyBottom = sy(0.04 * M);
    const r = Math.min(bodyW / 2, 0.16 * M);
    g.fillStyle(shade(this.palette.tunic, 0.55), 1); // hose
    g.fillRoundedRect(base.x - bodyW * 0.38, sy(0.42 * M * lowered), bodyW * 0.76, bodyBottom - sy(0.42 * M * lowered), 4);
    g.fillStyle(tunic, 1);
    g.lineStyle(ow, outlineCol, 1);
    g.fillRoundedRect(base.x - bodyW / 2, bodyTop, bodyW, sy(0.3 * M * lowered) - bodyTop, r);
    g.strokeRoundedRect(base.x - bodyW / 2, bodyTop, bodyW, sy(0.3 * M * lowered) - bodyTop, r);
    // Belt.
    g.lineStyle(2, shade(this.palette.tunic, 0.5), 1);
    const beltY = sy(0.6 * M * lowered);
    g.lineBetween(base.x - bodyW / 2 + 2, beltY, base.x + bodyW / 2 - 2, beltY);

    // Head.
    const headR = 0.21 * M * across;
    const hx = base.x + fx * 0.04 * M * across;
    const hy = sy(1.36 * M * lowered);
    g.fillStyle(this.palette.hair, 1);
    g.lineStyle(ow, outlineCol, 1);
    g.fillCircle(hx, hy, headR);
    g.strokeCircle(hx, hy, headR);
    if (fy > -0.4) {
      // Face, turned towards their facing; hair stays as a cap on top and behind.
      const fcx = hx + fx * headR * 0.32;
      const fcy = hy + headR * 0.18;
      g.fillStyle(flash ? 0xffffff : SKIN, 1);
      g.fillEllipse(fcx, fcy, headR * (1.1 + 0.5 * Math.max(0, fy)), headR * 1.25);
      g.fillStyle(this.palette.hair, 1);
      g.fillEllipse(hx - fx * headR * 0.15, hy - headR * 0.55, headR * 1.9, headR * 0.8);
      // Eyes: two seen from the front, merging to one in profile.
      g.fillStyle(0x2a1d14, 1);
      const spread = headR * 0.32 * Math.max(0, fy);
      const ex = fcx + fx * headR * 0.22;
      const ey = fcy - headR * 0.08;
      if (spread > 1.2) {
        g.fillCircle(ex - spread, ey, 1.6);
        g.fillCircle(ex + spread, ey, 1.6);
      } else {
        g.fillCircle(ex + fx * headR * 0.15, ey, 1.6);
      }
    }

    hands.filter((h) => !h.behind).forEach(drawHand);

    const bounds = emptyBounds();
    bounds.x0 = base.x - Math.max(bodyW / 2, 0.35 * M * across);
    bounds.x1 = base.x + Math.max(bodyW / 2, 0.35 * M * across);
    bounds.y0 = hy - headR - 4;
    bounds.y1 = base.y + 6;
    return { bounds, headTop: { x: hx, y: hy - headR + 6 } };
  }

  destroy(): void {
    this.g.destroy();
    this.ring.destroy();
  }
}
