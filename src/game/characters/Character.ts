import Phaser from 'phaser';
import type { ControlMode } from '../bridge';
import { MAX_HEALTH, type Temperament } from '../combat/combat';
import { createMotorState, type MotorState } from '../movement/motor';
import type { MoveOrder } from '../navigation/MoveOrder';
import type { Point } from '../navigation/NavGrid';
import type { SocialActionId } from '../social/socialActions';
import { CharacterView, createPose, type BodyState, type CharacterPose, type Palette } from '../world/CharacterView';
import { Brain } from './Brain';
import { Overhead } from './Overhead';

export const BODY_RADIUS = 16; // ≈ 0.25 m

/** Anything that can be locked on to and punched. */
export interface Targetable {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  isTargetable(): boolean;
}

export interface CharacterDef {
  id: string;
  name: string;
  temperament: Temperament;
  palette: Palette;
  x: number;
  y: number;
  facing?: number;
}

export interface SocialState {
  target: Character;
  action: SocialActionId;
  phase: 'approach' | 'perform';
  /** When the current phase started (scene time, ms). */
  phaseAt: number;
  resolved: boolean;
  lastPlan: number;
  giveUpAt: number;
}

/**
 * A person in the world. The same object whether the player is controlling
 * them or their brain is: only the source of their intentions differs.
 */
export class Character implements Targetable {
  readonly id: string;
  readonly name: string;
  readonly temperament: Temperament;
  readonly palette: Palette;
  readonly obj: Phaser.GameObjects.Arc;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly view: CharacterView;
  readonly overhead: Overhead;
  readonly brain = new Brain();

  motor: MotorState;
  pose: CharacterPose = createPose();
  mode: ControlMode = 'explore';
  controlled = false;

  health = MAX_HEALTH;
  status: BodyState = 'ok';
  /** When the current yield/knock-out ends (scene time, ms). */
  statusUntil = 0;
  lastHitAt = -Infinity;
  /** Knockback velocity (px/s), decays quickly. */
  knock = { x: 0, y: 0 };
  /** Knockback added to the body's velocity last frame, so the motor doesn't mistake it for its own speed. */
  appliedKnock = { x: 0, y: 0 };

  order: MoveOrder | null = null;
  onArrive: (() => void) | null = null;
  lockTarget: Targetable | null = null;
  look: { angle: number; until: number } | null = null;
  /** Held still until this time: e.g. being talked to, or someone has a menu open on them. */
  heldUntil = 0;
  social: SocialState | null = null;
  /** Climbing through a window: moving from `from` to `to` over `dur` seconds. */
  climb: { from: Point; to: Point; t: number; dur: number; onDone?: () => void } | null = null;
  /** Busy doing a route's link (e.g. opening a window to climb through). */
  linkBusy = false;

  constructor(scene: Phaser.Scene, def: CharacterDef) {
    this.id = def.id;
    this.name = def.name;
    this.temperament = def.temperament;
    this.palette = def.palette;
    this.motor = createMotorState(def.facing ?? 0);
    this.obj = scene.add.circle(def.x, def.y, BODY_RADIUS).setVisible(false);
    scene.physics.add.existing(this.obj);
    this.body = this.obj.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(BODY_RADIUS);
    this.body.setCollideWorldBounds(true);
    this.view = new CharacterView(scene, def.x, def.y, def.palette);
    this.overhead = new Overhead(scene);
  }

  get x(): number {
    return this.obj.x;
  }

  get y(): number {
    return this.obj.y;
  }

  get radius(): number {
    return BODY_RADIUS;
  }

  get healthFraction(): number {
    return this.health / MAX_HEALTH;
  }

  isTargetable(): boolean {
    return this.status !== 'ko';
  }

  /** Physics-centre position (what movement and pathfinding use). */
  pos(): Point {
    return { x: this.body.center.x, y: this.body.center.y };
  }

  distanceTo(o: { x: number; y: number }): number {
    return Math.hypot(o.x - this.x, o.y - this.y);
  }

  angleTo(o: { x: number; y: number }): number {
    return Math.atan2(o.y - this.y, o.x - this.x);
  }

  cancelOrder(): void {
    this.order = null;
    this.onArrive = null;
  }
}
