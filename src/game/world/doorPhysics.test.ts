import { describe, expect, it } from 'vitest';
import { resolveDoorContact, stepDoor, type DoorGeom, type DoorSwing } from './doorPhysics';

// Closed leaf runs along +x from the hinge at the origin. y-down.
const geom: DoorGeom = { hingeX: 0, hingeY: 0, baseAngle: 0, length: 64, thickness: 10, maxAngle: Math.PI / 2 };
const closed: DoorSwing = { angle: 0, angVel: 0 };

/** Walk a body straight down (+y) through the doorway, resolving contact each frame. */
function walkThrough(locked: boolean, startY = -40, frames = 120) {
  let swing = closed;
  const body = { x: 40, y: startY, r: 16 };
  const dt = 1 / 60;
  for (let i = 0; i < frames; i++) {
    body.y += 1.5 * 64 * dt; // 1.5 m/s
    const res = resolveDoorContact(geom, swing, body, locked, dt);
    swing = stepDoor(geom, res.swing, dt);
    body.x += res.pushX;
    body.y += res.pushY;
  }
  return { swing, body };
}

describe('door physics', () => {
  it('swings away from a body walking into it', () => {
    const { swing, body } = walkThrough(false);
    // Pushed from the north (−y), it swings south: positive angle in y-down space.
    expect(swing.angle).toBeGreaterThan(0.5);
    expect(body.y).toBeGreaterThan(40);
  });

  it('swings the other way when pushed from the other side', () => {
    let swing = closed;
    const body = { x: 40, y: 40, r: 16 };
    for (let i = 0; i < 120; i++) {
      body.y -= 1.5 * 64 * (1 / 60);
      const res = resolveDoorContact(geom, swing, body, false, 1 / 60);
      swing = stepDoor(geom, res.swing, 1 / 60);
      body.x += res.pushX;
      body.y += res.pushY;
    }
    expect(swing.angle).toBeLessThan(-0.5);
  });

  it('does not move when locked, and keeps the body out', () => {
    const { swing, body } = walkThrough(true);
    expect(swing.angle).toBe(0);
    expect(body.y).toBeLessThanOrEqual(-21 + 1e-6);
  });

  it('never swings past its limit', () => {
    const { swing } = walkThrough(false, -40, 400);
    expect(Math.abs(swing.angle)).toBeLessThanOrEqual(geom.maxAngle + 1e-9);
  });

  it('coasts a little after being pushed, then settles', () => {
    let s: DoorSwing = { angle: 0.3, angVel: 2 };
    s = stepDoor(geom, s, 0.1);
    expect(s.angle).toBeGreaterThan(0.3);
    for (let i = 0; i < 300; i++) s = stepDoor(geom, s, 1 / 60);
    expect(s.angVel).toBe(0);
  });
});
