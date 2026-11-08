import { describe, expect, it } from 'vitest';
import { createMotorState, stepMotor } from '../movement/motor';
import { DEFAULT_TUNING, PX_PER_METRE } from '../movement/tuning';
import { MoveOrder } from './MoveOrder';
import { NavGrid } from './NavGrid';

const W = 40 * PX_PER_METRE;

function grid(withWall = true) {
  const nav = new NavGrid(W, W, 8);
  nav.build(withWall ? [{ kind: 'rect', x: 10 * PX_PER_METRE, y: 0, w: 20, h: 20 * PX_PER_METRE }] : [], 18);
  return nav;
}

/** Drive a point through the order with the real motor (no collisions). */
function drive(order: MoveOrder, start: { x: number; y: number }, seconds: number) {
  let s = createMotorState();
  const pos = { ...start };
  let arrived = false;
  let ran = false;
  const dt = 1 / 60;
  for (let i = 0; i < seconds / dt && !arrived; i++) {
    const st = order.step(pos, dt);
    if (st.arrived) arrived = true;
    if (st.run) ran = true;
    s = stepMotor(s, { move: st.move, sprint: st.run, aimAngle: null, lookAngle: null }, DEFAULT_TUNING, dt);
    pos.x += s.vx * dt;
    pos.y += s.vy * dt;
  }
  return { pos, arrived, ran };
}

describe('MoveOrder', () => {
  it('walks short trips and arrives without overshooting', () => {
    const order = MoveOrder.plan(grid(false), { x: 100, y: 100 }, { kind: 'point', x: 100 + 3 * PX_PER_METRE, y: 100 })!;
    expect(order.run).toBe(false);
    const r = drive(order, { x: 100, y: 100 }, 10);
    expect(r.arrived).toBe(true);
    expect(Math.abs(r.pos.x - (100 + 3 * PX_PER_METRE))).toBeLessThan(6);
  });

  it('runs long trips', () => {
    const order = MoveOrder.plan(grid(false), { x: 100, y: 100 }, { kind: 'point', x: 100 + 15 * PX_PER_METRE, y: 100 })!;
    expect(order.run).toBe(true);
    expect(drive(order, { x: 100, y: 100 }, 15).arrived).toBe(true);
  });

  it('routes around a wall to reach the far side', () => {
    const nav = grid();
    const start = { x: 5 * PX_PER_METRE, y: 5 * PX_PER_METRE };
    const goal = { x: 15 * PX_PER_METRE, y: 5 * PX_PER_METRE };
    const order = MoveOrder.plan(nav, start, { kind: 'point', ...goal })!;
    expect(order.path.length).toBeGreaterThan(1);
    expect(drive(order, start, 30).arrived).toBe(true);
  });

  it('aims for the nearest standable spot when you click inside a wall', () => {
    const nav = grid();
    const order = MoveOrder.plan(nav, { x: 100, y: 100 }, { kind: 'point', x: 10 * PX_PER_METRE + 10, y: 300 })!;
    expect(order).not.toBeNull();
    expect(nav.isBlockedAt(order.destination.x, order.destination.y)).toBe(false);
  });

  it('switches between walking and running while following, with hysteresis', () => {
    const nav = grid(false);
    const order = MoveOrder.plan(nav, { x: 100, y: 100 }, { kind: 'point', x: 150, y: 100 })!;
    order.following = true;
    order.retarget(nav, { x: 100, y: 100 }, { x: 100 + 5 * PX_PER_METRE, y: 100 });
    expect(order.step({ x: 100, y: 100 }, 1 / 60).run).toBe(true);
    order.retarget(nav, { x: 100, y: 100 }, { x: 100 + 3.5 * PX_PER_METRE, y: 100 });
    expect(order.step({ x: 100, y: 100 }, 1 / 60).run).toBe(true); // still within hysteresis band
    order.retarget(nav, { x: 100, y: 100 }, { x: 100 + 2 * PX_PER_METRE, y: 100 });
    expect(order.step({ x: 100, y: 100 }, 1 / 60).run).toBe(false);
  });
});
