import Phaser from 'phaser';
import type { ControlMode } from '../bridge';

/**
 * PLACEHOLDER character drawing, viewed straight down, drawn facing +x.
 * Right hand is on +y (the character's right when facing east in y-down space).
 *
 * Not the final art: it exists so facing, gait, hands, attacks and states
 * (yielding, knocked out) are readable while systems are built.
 */

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
  };
}

/** Local-space hand position (character facing +x). */
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

function shade(colour: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(colour);
  return Phaser.Display.Color.GetColor(Math.min(255, c.red * f), Math.min(255, c.green * f), Math.min(255, c.blue * f));
}

export class CharacterView {
  readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly palette: Palette,
  ) {
    // The ring sits in world space (unrotated) under the character.
    this.ring = scene.add.graphics({ x, y });
    this.g = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.g]);
  }

  setDepth(depth: number): this {
    this.ring.setDepth(depth - 1);
    this.container.setDepth(depth);
    return this;
  }

  update(x: number, y: number, facing: number, pose: CharacterPose): void {
    this.container.setPosition(x, y);
    this.container.setRotation(facing);
    this.ring.setPosition(x, y);
    this.ring.clear();
    if (pose.controlled) {
      this.ring.lineStyle(2, 0xffffff, 0.55);
      this.ring.strokeEllipse(0, 0, 50, 50);
    }

    const g = this.g;
    g.clear();
    const flash = pose.hitFlash > 0;
    const tunic = flash ? 0xffffff : pose.crouched || pose.state === 'yielded' ? shade(this.palette.tunic, 0.78) : this.palette.tunic;
    const outlineCol = pose.highlighted ? HIGHLIGHT : OUTLINE;
    const outlineW = pose.highlighted ? 3 : 2;

    if (pose.state === 'ko') {
      // Lying flat on their back, arms out: long along the facing axis.
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(0, 2, 96, 40);
      g.fillStyle(shade(this.palette.tunic, 0.6), 1);
      g.lineStyle(outlineW, outlineCol, 1);
      g.fillEllipse(-26, 0, 34, 18); // legs
      g.strokeEllipse(-26, 0, 34, 18);
      g.fillStyle(tunic, 1);
      g.fillEllipse(4, 0, 40, 28); // torso
      g.strokeEllipse(4, 0, 40, 28);
      g.fillStyle(SKIN, 1);
      for (const s of [-1, 1]) {
        g.fillCircle(10, 24 * s, 4.5);
        g.strokeCircle(10, 24 * s, 4.5);
      }
      g.fillCircle(30, 0, 8.5);
      g.strokeCircle(30, 0, 8.5);
      g.fillStyle(this.palette.hair, 1);
      g.fillEllipse(33, 0, 7, 15);
      return;
    }

    // Contact shadow.
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(1, 1, 30, 38);

    for (const hand of ['left', 'right'] as const) {
      const h = handOffset(hand, pose);
      g.fillStyle(SKIN, 1);
      g.lineStyle(1.5, OUTLINE, 1);
      g.fillCircle(h.x, h.y, 4.5);
      g.strokeCircle(h.x, h.y, 4.5);
    }

    // Shoulders/torso: wide across, shallow front-to-back. Crouching/yielding hunches them forward.
    const hunched = pose.crouched || pose.state === 'yielded';
    const torsoDepth = hunched ? 22 : 17;
    const torsoWidth = hunched ? 28 : 32;
    g.fillStyle(tunic, 1);
    g.lineStyle(outlineW, outlineCol, 1);
    g.fillEllipse(0, 0, torsoDepth, torsoWidth);
    g.strokeEllipse(0, 0, torsoDepth, torsoWidth);

    const hx = hunched ? 5 : 1;
    g.fillStyle(this.palette.hair, 1);
    g.lineStyle(2, OUTLINE, 1);
    g.fillCircle(hx, 0, 8.5);
    g.strokeCircle(hx, 0, 8.5);
    g.fillStyle(SKIN, 1);
    g.fillEllipse(hx + 6, 0, 5, 9);
    g.fillTriangle(hx + 8, -2.5, hx + 8, 2.5, hx + 12, 0);
  }

  destroy(): void {
    this.container.destroy();
    this.ring.destroy();
  }
}
