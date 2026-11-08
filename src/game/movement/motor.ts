import { PX_PER_METRE, type MovementTuning } from './tuning';

/**
 * Character motor: turns movement intent into velocity and facing.
 *
 * Pure TypeScript with no Phaser dependency. It knows nothing about who's
 * driving: player input and (later) NPC AI produce the same MotorInput.
 */

export type Gait = 'still' | 'crouch' | 'walk' | 'sprint';

export interface Vec2 {
  x: number;
  y: number;
}

export interface MotorInput {
  /** Desired movement direction. Components in [-1, 1]; normalised internally. */
  move: Vec2;
  /** Sprint key held. */
  sprint: boolean;
  /** Combat mode: face this angle (radians) regardless of movement. */
  aimAngle: number | null;
  /** Out of combat and not moving: turn toward this angle (e.g. to face something being used). */
  lookAngle: number | null;
}

export interface MotorState {
  /** Velocity in px/s. */
  vx: number;
  vy: number;
  /** Facing in radians, 0 = +x (east), y-down. */
  facing: number;
  crouched: boolean;
  gait: Gait;
}

export function createMotorState(facing = 0): MotorState {
  return { vx: 0, vy: 0, facing, crouched: false, gait: 'still' };
}

/** Normalise so diagonals aren't faster. Anything shorter than 1 keeps its length (analogue input). */
export function normaliseMove(move: Vec2): Vec2 {
  const len = Math.hypot(move.x, move.y);
  if (len <= 1e-6) return { x: 0, y: 0 };
  if (len <= 1) return { x: move.x, y: move.y };
  return { x: move.x / len, y: move.y / len };
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Rotate `current` toward `target` by at most `maxStep` radians, the short way round. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}

/** Crouch is a toggle. Returns a new state. */
export function toggleCrouch(state: MotorState): MotorState {
  return { ...state, crouched: !state.crouched };
}

export function speedOf(state: MotorState): number {
  return Math.hypot(state.vx, state.vy);
}

/**
 * Advance the motor by dt seconds.
 *
 * Velocity moves toward the desired velocity as a vector at a capped rate,
 * which gives the "light momentum" feel: quick starts and stops, and
 * direction changes at speed carve a slightly wider line rather than snapping.
 */
export function stepMotor(state: MotorState, input: MotorInput, t: MovementTuning, dt: number): MotorState {
  const dir = normaliseMove(input.move);
  const hasInput = dir.x !== 0 || dir.y !== 0;

  // Sprinting stands you up out of a crouch.
  const crouched = state.crouched && !(input.sprint && hasInput);

  const gait: Gait = !hasInput ? 'still' : crouched ? 'crouch' : input.sprint ? 'sprint' : 'walk';
  const speedMs = gait === 'crouch' ? t.crouchSpeed : gait === 'sprint' ? t.sprintSpeed : gait === 'walk' ? t.walkSpeed : 0;
  const targetSpeed = speedMs * PX_PER_METRE;

  const desiredVx = dir.x * targetSpeed;
  const desiredVy = dir.y * targetSpeed;

  const rate = (hasInput ? t.acceleration : t.deceleration) * PX_PER_METRE * dt;
  const dx = desiredVx - state.vx;
  const dy = desiredVy - state.vy;
  const dist = Math.hypot(dx, dy);
  let vx: number;
  let vy: number;
  if (dist <= rate || dist === 0) {
    vx = desiredVx;
    vy = desiredVy;
  } else {
    vx = state.vx + (dx / dist) * rate;
    vy = state.vy + (dy / dist) * rate;
  }

  // Facing: combat aim > movement intent > look target > hold.
  let facing = state.facing;
  if (input.aimAngle !== null) {
    facing = turnToward(facing, input.aimAngle, ((t.turnRateCombat * Math.PI) / 180) * dt);
  } else if (hasInput) {
    facing = turnToward(facing, Math.atan2(dir.y, dir.x), ((t.turnRateExplore * Math.PI) / 180) * dt);
  } else if (input.lookAngle !== null) {
    facing = turnToward(facing, input.lookAngle, ((t.turnRateExplore * Math.PI) / 180) * dt);
  }

  return { vx, vy, facing, crouched, gait };
}
