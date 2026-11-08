import { describe, expect, it } from 'vitest';
import { createMotorState, normaliseMove, speedOf, stepMotor, toggleCrouch, turnToward, type MotorInput } from './motor';
import { DEFAULT_TUNING, PX_PER_METRE } from './tuning';

const idle: MotorInput = { move: { x: 0, y: 0 }, sprint: false, aimAngle: null, lookAngle: null };

function run(input: MotorInput, seconds: number, state = createMotorState()) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) state = stepMotor(state, input, DEFAULT_TUNING, dt);
  return state;
}

describe('motor', () => {
  it('normalises diagonals so they are not faster', () => {
    const n = normaliseMove({ x: 1, y: 1 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
  });

  it('reaches walk speed and stops when input ends', () => {
    let s = run({ ...idle, move: { x: 1, y: 0 } }, 1);
    expect(speedOf(s)).toBeCloseTo(DEFAULT_TUNING.walkSpeed * PX_PER_METRE);
    expect(s.gait).toBe('walk');
    s = run(idle, 1, s);
    expect(speedOf(s)).toBe(0);
    expect(s.gait).toBe('still');
  });

  it('sprints faster than walking, and crouches slower', () => {
    const sprint = run({ ...idle, move: { x: 0, y: 1 }, sprint: true }, 1);
    expect(speedOf(sprint)).toBeCloseTo(DEFAULT_TUNING.sprintSpeed * PX_PER_METRE);
    const crouch = run({ ...idle, move: { x: 0, y: 1 } }, 1, toggleCrouch(createMotorState()));
    expect(crouch.gait).toBe('crouch');
    expect(speedOf(crouch)).toBeCloseTo(DEFAULT_TUNING.crouchSpeed * PX_PER_METRE);
  });

  it('sprinting stands you up from a crouch, but holding sprint while still does not', () => {
    const crouched = toggleCrouch(createMotorState());
    expect(run({ ...idle, sprint: true }, 0.5, crouched).crouched).toBe(true);
    expect(run({ ...idle, move: { x: 1, y: 0 }, sprint: true }, 0.5, crouched).crouched).toBe(false);
  });

  it('faces movement out of combat and the aim in combat', () => {
    const walkingSouth = run({ ...idle, move: { x: 0, y: 1 } }, 1);
    expect(walkingSouth.facing).toBeCloseTo(Math.PI / 2);
    const aimingWest = run({ ...idle, move: { x: 0, y: 1 }, aimAngle: Math.PI }, 1);
    expect(Math.abs(aimingWest.facing)).toBeCloseTo(Math.PI);
  });

  it('turns the short way round', () => {
    const next = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(next).toBeCloseTo(Math.PI - 0.05);
  });
});
