/**
 * Hinged door swing physics. Pure TypeScript, no Phaser.
 *
 * A door is a thick segment rotating about its hinge. Bodies walking into it
 * push it round and it carries momentum. It's weighted to swing back shut,
 * thudding into the frame with a small bounce, and comes to rest against
 * anyone standing in its way. Someone sneaking eases it: a gentler push and a
 * soft close. Locked doors don't move; the body is pushed back out instead.
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
  /** Eased open by someone sneaking: pushed gently, and closes softly without a thud. */
  quiet?: boolean;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** How readily the door gives way (0..1). Below 1 fakes weight, but the leftover push shoves the body sideways into the door frame, so it stays at 1. */
const GIVE = 1;

/** Door weight, live-tunable from the debug panel. */
export interface DoorTuning {
  /** How much of the push speed the door keeps swinging with after contact. Above 1, it swings ahead of you. */
  momentum: number;
  /** How quickly a swinging door slows (per second). Lower = lighter, freer door. */
  friction: number;
  /** How hard the door is pulled back shut (rad/s² per radian open). 0 = stays where left. */
  closing: number;
}

export const DEFAULT_DOOR_TUNING: Readonly<DoorTuning> = { momentum: 1.4, friction: 2.2, closing: 7 };
export const doorTuning: DoorTuning = { ...DEFAULT_DOOR_TUNING };

/** Pushing near the hinge would spin the door absurdly fast; treat the lever arm as at least this fraction of its length. */
const MIN_LEVER = 0.15;
/** Fraction of speed kept when the door bounces off its frame. */
const BOUNCE = 0.3;
/** Below this closing speed (rad/s) it just settles into the frame without a thud. */
const THUD_MIN_SPEED = 0.8;
/** Easing a door while sneaking: how much of the usual momentum it gets. */
const QUIET_MOMENTUM = 0.25;

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
 * Resolve a body overlapping the door: turn the door out of the way (unless
 * locked), then push the body out of whatever overlap remains.
 *
 * Overlap can come from the body walking into the door, or from the door
 * swinging into the body. Only the body's own push sets the door swinging; a
 * door that swung into someone just stops against them.
 */
export function resolveDoorContact(
  g: DoorGeom,
  swing: DoorSwing,
  body: Circle,
  locked: boolean,
  dt: number,
  sneaking = false,
): ContactResult {
  const first = contact(g, swing, body);
  if (!first) return { swing, pushX: 0, pushY: 0, touched: false };

  let next = swing;
  if (!locked) {
    // A few passes: the contact point slides as the door turns, so one step under-rotates and
    // the leftover would shove the body sideways (into the door frame).
    let angle = swing.angle;
    for (let i = 0; i < 4; i++) {
      const c = contact(g, { ...swing, angle }, body);
      if (!c) break;
      const d = leafDirection(g, { ...swing, angle });
      // Positive angle moves the leaf along (-d.y, d.x). The body pushes the leaf along -n.
      const side = c.nx * -d.y + c.ny * d.x;
      const lever = Math.max(c.along, g.length * MIN_LEVER);
      angle = clamp(angle + (-side * c.depth * GIVE) / lever, -g.maxAngle, g.maxAngle);
      if (Math.abs(angle) >= g.maxAngle) break;
    }
    const applied = angle - swing.angle;

    // This frame the door already moved angVel·dt (possibly into the body). Whatever correction
    // is left over beyond undoing that is the body's own push.
    const bodyPush = dt > 0 ? applied / dt + swing.angVel : 0;
    const bodyPushing = Math.sign(bodyPush) === Math.sign(applied) && Math.abs(bodyPush) > 0.05;

    let angVel: number;
    if (bodyPushing) {
      const carry = bodyPush * doorTuning.momentum * (sneaking ? QUIET_MOMENTUM : 1);
      // Keep whichever is stronger in the push direction: the existing swing, or the new push.
      angVel = Math.sign(swing.angVel) === Math.sign(carry) && Math.abs(swing.angVel) > Math.abs(carry) ? swing.angVel : carry;
    } else {
      // The door swung into them: it comes to rest against them.
      angVel = 0;
    }
    if (Math.abs(angle) >= g.maxAngle) angVel = 0;
    next = { angle, angVel, quiet: bodyPushing ? sneaking : swing.quiet };
  }

  const after = contact(g, next, body);
  return {
    swing: next,
    pushX: after ? after.nx * after.depth : 0,
    pushY: after ? after.ny * after.depth : 0,
    touched: true,
  };
}

export interface StepResult {
  swing: DoorSwing;
  /** Speed (rad/s) the door hit its frame at, or 0 if it didn't thud this step. */
  thud: number;
}

/**
 * Swing under its closing weight and friction. Crossing the closed position
 * means meeting the frame: it thuds and bounces back a little (or, if eased
 * shut quietly or moving slowly, just settles). Stops dead at its open limits.
 */
export function stepDoor(g: DoorGeom, s: DoorSwing, dt: number): StepResult {
  const quiet = !!s.quiet;
  // Quiet doors are pulled shut more softly and damped enough not to slam.
  const k = doorTuning.closing * (quiet ? 0.5 : 1);
  const damping = quiet ? Math.max(doorTuning.friction, 2.2 * Math.sqrt(k)) : doorTuning.friction;

  let angVel = (s.angVel - k * s.angle * dt) * Math.exp(-damping * dt);
  let angle = s.angle + angVel * dt;
  let thud = 0;

  // Meeting the frame (crossing closed) from either side.
  if (s.angle !== 0 && Math.sign(angle) !== Math.sign(s.angle)) {
    const speed = Math.abs(angVel);
    angle = 0;
    if (!quiet && speed >= THUD_MIN_SPEED) {
      thud = speed;
      // Bounce back to the side it came from.
      angVel = -angVel * BOUNCE;
      angle = angVel * dt;
    } else {
      angVel = 0;
    }
  }

  if (angle > g.maxAngle || angle < -g.maxAngle) {
    angle = clamp(angle, -g.maxAngle, g.maxAngle);
    angVel = 0;
  }
  // Settled shut.
  if (Math.abs(angle) < 0.004 && Math.abs(angVel) < 0.05) {
    return { swing: { angle: 0, angVel: 0, quiet: false }, thud };
  }
  return { swing: { angle, angVel, quiet: s.quiet }, thud };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
