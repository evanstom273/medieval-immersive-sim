/**
 * Hinged door swing physics. Pure TypeScript, no Phaser.
 *
 * A door is a thick segment rotating about its hinge. Bodies walking into it
 * push it round; it carries a little momentum and settles where it's left.
 * Locked doors don't move — the body is pushed back out instead.
 */

export interface DoorGeom {
  hingeX: number;
  hingeY: number;
  /** Leaf direction when closed (radians). */
  baseAngle: number;
  length: number;
  thickness: number;
  /** Swing limit either side of closed (radians). */
  maxAngle: number;
}

export interface DoorSwing {
  /** Current angle relative to closed (radians). */
  angle: number;
  /** rad/s */
  angVel: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** How readily the door gives way (0..1). Below 1 fakes weight, but the leftover push shoves the body sideways into the door frame, so it stays at 1. */
const GIVE = 1;
/** How much of the push speed the door keeps swinging with after contact. */
const CARRY = 0.5;
/** Pushing near the hinge would spin the door absurdly fast; treat the lever arm as at least this fraction of its length. */
const MIN_LEVER = 0.3;

export function leafDirection(g: DoorGeom, s: DoorSwing): { x: number; y: number } {
  const a = g.baseAngle + s.angle;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Closest point on the leaf's centreline to (x, y), and how far along the leaf it is. */
export function closestOnLeaf(g: DoorGeom, s: DoorSwing, x: number, y: number): { x: number; y: number; along: number } {
  const d = leafDirection(g, s);
  const along = Math.max(0, Math.min(g.length, (x - g.hingeX) * d.x + (y - g.hingeY) * d.y));
  return { x: g.hingeX + d.x * along, y: g.hingeY + d.y * along, along };
}

/** Penetration of a circle into the leaf: unit normal (leaf → circle) and depth, or null. */
function contact(g: DoorGeom, s: DoorSwing, c: Circle): { nx: number; ny: number; depth: number; along: number } | null {
  const p = closestOnLeaf(g, s, c.x, c.y);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const dist = Math.hypot(dx, dy);
  const depth = c.r + g.thickness / 2 - dist;
  if (depth <= 0) return null;
  if (dist > 1e-6) return { nx: dx / dist, ny: dy / dist, depth, along: p.along };
  // Dead centre on the leaf: push out along the leaf's normal.
  const d = leafDirection(g, s);
  return { nx: -d.y, ny: d.x, depth, along: p.along };
}

export interface ContactResult {
  swing: DoorSwing;
  /** Move the body by this much to clear the door. */
  pushX: number;
  pushY: number;
  /** The body touched the door. */
  touched: boolean;
}

/**
 * Resolve a body overlapping the door: swing the door away from it (unless
 * locked), then push the body out of whatever overlap remains.
 */
export function resolveDoorContact(g: DoorGeom, swing: DoorSwing, body: Circle, locked: boolean, dt: number): ContactResult {
  const first = contact(g, swing, body);
  if (!first) return { swing, pushX: 0, pushY: 0, touched: false };

  let next = swing;
  if (!locked) {
    // A few passes: the contact point slides as the door turns, so one step under-rotates and
    // the leftover would shove the body sideways (into the door frame).
    let pushVel = 0;
    for (let i = 0; i < 4; i++) {
      const c = i === 0 ? first : contact(g, next, body);
      if (!c) break;
      const d = leafDirection(g, next);
      // Positive angle moves the leaf along (-d.y, d.x). The body pushes the leaf along -n.
      const side = c.nx * -d.y + c.ny * d.x;
      const leafMove = -side * c.depth * GIVE;
      const lever = Math.max(c.along, g.length * MIN_LEVER);
      const target = clamp(next.angle + leafMove / lever, -g.maxAngle, g.maxAngle);
      pushVel += dt > 0 ? (target - next.angle) / dt : 0;
      next = { angle: target, angVel: next.angVel };
      if (Math.abs(target) >= g.maxAngle) break;
    }
    // Keep whichever is stronger: the existing swing, or the new push.
    const angVel = Math.abs(pushVel * CARRY) > Math.abs(swing.angVel) ? pushVel * CARRY : swing.angVel;
    next = { angle: next.angle, angVel: Math.abs(next.angle) >= g.maxAngle ? 0 : angVel };
  }

  const after = contact(g, next, body);
  return {
    swing: next,
    pushX: after ? after.nx * after.depth : 0,
    pushY: after ? after.ny * after.depth : 0,
    touched: true,
  };
}

/** Coast and damp the swing; stops dead at the limits. */
export function stepDoor(g: DoorGeom, s: DoorSwing, dt: number, damping = 5): DoorSwing {
  let angle = s.angle + s.angVel * dt;
  let angVel = s.angVel * Math.exp(-damping * dt);
  if (angle > g.maxAngle || angle < -g.maxAngle) {
    angle = clamp(angle, -g.maxAngle, g.maxAngle);
    angVel = 0;
  }
  if (Math.abs(angVel) < 0.01) angVel = 0;
  return { angle, angVel };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
