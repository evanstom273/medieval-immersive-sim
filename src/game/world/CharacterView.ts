import Phaser from 'phaser';
import type { ControlMode } from '../bridge';

/**
 * PLACEHOLDER character drawing, viewed straight down, drawn facing +x.
 * Right hand is on +y (the character's right when facing east in y-down space).
 *
 * This is not the final art — it exists so facing, gait, hands and attacks
 * are readable while movement is tuned.
 */

export type Hand = 'left' | 'right';

export const PUNCH_EXTEND = 0.09; // s to full extension
export const PUNCH_RETRACT = 0.17; // s back to guard
export const PUNCH_TOTAL = PUNCH_EXTEND + PUNCH_RETRACT;

const TUNIC = 0x7d5e41;
const TUNIC_CROUCH = 0x5f4731;
const SKIN = 0xd9ab84;
const HAIR = 0x4a3222;
const OUTLINE = 0x231a12;

export interface CharacterPose {
  mode: ControlMode;
  crouched: boolean;
  /** Distance-based stride phase, radians. */
  stridePhase: number;
  /** 0..1 how much the arms swing (scales with speed). */
  strideAmount: number;
  /** Punch timers in seconds since the punch started, or null. */
  punch: Record<Hand, number | null>;
}

/** Local-space hand position (character facing +x). */
export function handOffset(hand: Hand, pose: CharacterPose): { x: number; y: number } {
  const side = hand === 'right' ? 1 : -1;
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

export class CharacterView {
  readonly container: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.g = scene.add.graphics();
    this.container = scene.add.container(x, y, [this.g]);
  }

  setDepth(depth: number): this {
    this.container.setDepth(depth);
    return this;
  }

  update(x: number, y: number, facing: number, pose: CharacterPose): void {
    this.container.setPosition(x, y);
    this.container.setRotation(facing);
    const g = this.g;
    g.clear();

    // Contact shadow.
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(1, 1, 30, 38);

    // Hands under the shoulders' edge so they read as arms reaching out.
    for (const hand of ['left', 'right'] as const) {
      const h = handOffset(hand, pose);
      g.fillStyle(SKIN, 1);
      g.lineStyle(1.5, OUTLINE, 1);
      g.fillCircle(h.x, h.y, 4.5);
      g.strokeCircle(h.x, h.y, 4.5);
    }

    // Shoulders/torso: wide across, shallow front-to-back. Crouching hunches them forward and in.
    const torsoDepth = pose.crouched ? 22 : 17;
    const torsoWidth = pose.crouched ? 28 : 32;
    g.fillStyle(pose.crouched ? TUNIC_CROUCH : TUNIC, 1);
    g.lineStyle(2, OUTLINE, 1);
    g.fillEllipse(0, 0, torsoDepth, torsoWidth);
    g.strokeEllipse(0, 0, torsoDepth, torsoWidth);

    // Head, pushed forward when crouched.
    const hx = pose.crouched ? 5 : 1;
    g.fillStyle(HAIR, 1);
    g.fillCircle(hx, 0, 8.5);
    g.strokeCircle(hx, 0, 8.5);
    // Face/nose to show facing.
    g.fillStyle(SKIN, 1);
    g.fillEllipse(hx + 6, 0, 5, 9);
    g.fillTriangle(hx + 8, -2.5, hx + 8, 2.5, hx + 12, 0);
  }

  destroy(): void {
    this.container.destroy();
  }
}
