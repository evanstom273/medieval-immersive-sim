import { describe, expect, it } from 'vitest';
import { resolveDoorContact, stepDoor, type DoorGeom, type DoorSwing } from './doorPhysics';

// Closed leaf runs along +x from the hinge at the origin. y-down.
const geom: DoorGeom = { hingeX: 0, hingeY: 0, baseAngle: 0, length: 64, thickness: 10, maxAngle: Math.PI / 2 };
const closed: DoorSwing = { angle: 0, angVel: 0 };
const DT = 1 / 60;

interface Sim {
  swing: DoorSwing;
  body: { x: number; y: number; r: number };
  maxAngle: number;
  thuds: number[];
}

/** Run a body with a fixed velocity (px/s) against the door, the same way the game does: step, then resolve. */
function simulate(opts: { start: [number, number]; vel: [number, number]; frames: number; locked?: boolean; sneaking?: boolean; swing?: DoorSwing }): Sim {
  const sim: Sim = { swing: opts.swing ?? closed, body: { x: opts.start[0], y: opts.start[1], r: 16 }, maxAngle: 0, thuds: [] };
  for (let i = 0; i < opts.frames; i++) {
    const stepped = stepDoor(geom, sim.swing, DT);
    if (stepped.thud) sim.thuds.push(stepped.thud);
    sim.body.x += opts.vel[0] * DT;
    sim.body.y += opts.vel[1] * DT;
    const res = resolveDoorContact(geom, stepped.swing, sim.body, !!opts.locked, DT, !!opts.sneaking);
    sim.swing = res.swing;
    sim.body.x += res.pushX;
    sim.body.y += res.pushY;
    sim.maxAngle = Math.max(sim.maxAngle, Math.abs(sim.swing.angle));
  }
  return sim;
}

const WALK = 1.4 * 64;

describe('door physics', () => {
  it('swings away from a body walking into it, and the body gets through', () => {
    const sim = simulate({ start: [40, -40], vel: [0, WALK], frames: 120 });
    expect(sim.maxAngle).toBeGreaterThan(1);
    expect(sim.body.y).toBeGreaterThan(60);
  });

  it('swings the other way when pushed from the other side', () => {
    const sim = simulate({ start: [40, 40], vel: [0, -WALK], frames: 30 });
    expect(sim.swing.angle).toBeLessThan(-0.3);
  });

  it('does not move when locked, and keeps the body out', () => {
    const sim = simulate({ start: [40, -40], vel: [0, WALK], frames: 120, locked: true });
    expect(sim.swing.angle).toBe(0);
    expect(sim.body.y).toBeLessThanOrEqual(-21 + 1e-6);
  });

  it('never swings past its limit', () => {
    const sim = simulate({ start: [40, -40], vel: [0, WALK * 2], frames: 400 });
    expect(sim.maxAngle).toBeLessThanOrEqual(geom.maxAngle + 1e-9);
  });

  it('swings back shut by itself, thudding into the frame', () => {
    const sim = simulate({ start: [500, 500], vel: [0, 0], frames: 240, swing: { angle: 1.4, angVel: 0 } });
    expect(sim.thuds.length).toBeGreaterThan(0);
    expect(sim.swing.angle).toBe(0);
    expect(sim.swing.angVel).toBe(0);
  });

  it('bounces back off the frame rather than swinging through to the other side', () => {
    let s: DoorSwing = { angle: 1.4, angVel: 0 };
    let minAngle = Infinity;
    for (let i = 0; i < 240; i++) {
      s = stepDoor(geom, s, DT).swing;
      minAngle = Math.min(minAngle, s.angle);
    }
    expect(minAngle).toBeGreaterThanOrEqual(0);
  });

  it('comes to rest against someone standing in the doorway instead of bouncing off', () => {
    // Body standing just inside the swing path, door released from wide open.
    const sim = simulate({ start: [40, 30], vel: [0, 0], frames: 240, swing: { angle: 1.4, angVel: 0 } });
    expect(sim.swing.angle).toBeGreaterThan(0.2); // held open by the body
    expect(Math.abs(sim.swing.angVel)).toBeLessThan(0.5); // resting, not flung back open
    expect(sim.thuds.length).toBe(0);
  });

  it('closes once the doorway is clear', () => {
    const held = simulate({ start: [40, 30], vel: [0, 0], frames: 120, swing: { angle: 1.4, angVel: 0 } });
    // Step out of the way.
    const sim = simulate({ start: [400, 400], vel: [0, 0], frames: 240, swing: held.swing });
    expect(sim.swing.angle).toBe(0);
  });

  it('eased shut quietly when sneaking: gentler push, no thud', () => {
    const loud = simulate({ start: [40, -40], vel: [0, 0.8 * 64], frames: 600 });
    const quiet = simulate({ start: [40, -40], vel: [0, 0.8 * 64], frames: 600, sneaking: true });
    expect(loud.thuds.length).toBeGreaterThan(0);
    expect(quiet.thuds.length).toBe(0);
    expect(quiet.swing.angle).toBe(0);
  });
});
