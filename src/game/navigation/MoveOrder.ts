import { PX_PER_METRE, tuning } from '../movement/tuning';
import type { NavGrid, Point } from './NavGrid';

/**
 * A "go there" order: plans a route on the nav grid and turns it into motor
 * input each frame. Pure TypeScript, no Phaser — usable by the player's
 * point-and-click / hold-to-follow and, later, by NPCs.
 */

export type MoveGoal =
  | { kind: 'point'; x: number; y: number }
  /** Get within `reach` of something (e.g. to use it). */
  | { kind: 'reach'; closest: (from: Point) => Point; reach: number };

/** Trips longer than this run; shorter ones walk. */
export const RUN_DISTANCE = 6 * PX_PER_METRE;
/** While following the cursor: start running beyond this, drop back to walking inside FOLLOW_WALK. */
export const FOLLOW_RUN = 4 * PX_PER_METRE;
export const FOLLOW_WALK = 3 * PX_PER_METRE;
const WAYPOINT_RADIUS = 6;
const ARRIVE_RADIUS = 3;
const STUCK_SECONDS = 0.8;

export interface OrderStep {
  move: Point;
  run: boolean;
  /** Reached the goal this frame. */
  arrived: boolean;
  /** Gave up: something is in the way. */
  stuck: boolean;
}

export class MoveOrder {
  /** Remaining waypoints; the last one is the destination. */
  path: Point[];
  run: boolean;
  /** Being steered live (hold-to-follow); run/walk then depends on how far away the cursor is. */
  following = false;
  private best = Infinity;
  private stuckFor = 0;

  private constructor(
    readonly goal: MoveGoal,
    path: Point[],
    run: boolean,
  ) {
    this.path = path;
    this.run = run;
  }

  /** Plan an order from `from`. Returns null if there's no way there. */
  static plan(nav: NavGrid, from: Point, goal: MoveGoal): MoveOrder | null {
    const path = MoveOrder.route(nav, from, goal);
    if (!path) return null;
    return new MoveOrder(goal, path, pathLength(from, path) > RUN_DISTANCE);
  }

  /** The point the order is heading for (the clicked spot, or the end of the route). */
  get destination(): Point {
    return this.path[this.path.length - 1];
  }

  /** Re-aim a point order at a new spot (hold-to-follow). Keeps the old route if the new spot is unreachable. */
  retarget(nav: NavGrid, from: Point, to: Point): boolean {
    const goal: MoveGoal = { kind: 'point', x: to.x, y: to.y };
    const path = MoveOrder.route(nav, from, goal);
    if (!path) return false;
    (this as { goal: MoveGoal }).goal = goal;
    this.path = path;
    this.best = Infinity;
    this.stuckFor = 0;
    return true;
  }

  private static route(nav: NavGrid, from: Point, goal: MoveGoal): Point[] | null {
    if (goal.kind === 'point') {
      // Clicked inside something solid: aim for the nearest spot you could actually stand.
      const dest = nav.nearestFree(goal, 2 * PX_PER_METRE);
      if (!dest) return null;
      if (nav.lineClear(from, dest)) return [dest];
      const path = nav.findPath(from, (p) => Math.hypot(p.x - dest.x, p.y - dest.y) <= nav.cellSize, dest);
      if (!path) return null;
      if (nav.lineClear(path[path.length - 1], dest)) path.push(dest);
      return path;
    }
    const aim = goal.closest(from);
    return nav.findPath(
      from,
      (p) => {
        const q = goal.closest(p);
        return Math.hypot(q.x - p.x, q.y - p.y) <= goal.reach * 0.85;
      },
      aim,
    );
  }

  step(pos: Point, dt: number): OrderStep {
    const idle = { move: { x: 0, y: 0 }, run: false };
    if (this.goal.kind === 'reach') {
      const q = this.goal.closest(pos);
      if (Math.hypot(q.x - pos.x, q.y - pos.y) <= this.goal.reach) return { ...idle, arrived: true, stuck: false };
    }

    while (this.path.length > 1 && Math.hypot(this.path[0].x - pos.x, this.path[0].y - pos.y) < WAYPOINT_RADIUS) {
      this.path.shift();
      this.best = Infinity;
      this.stuckFor = 0;
    }

    // Final leg of a reach order: head for the object itself.
    const wp = this.path[0] ?? (this.goal.kind === 'reach' ? this.goal.closest(pos) : pos);
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const d = Math.hypot(dx, dy);

    if (this.goal.kind === 'point' && this.path.length <= 1 && d <= ARRIVE_RADIUS) {
      return { ...idle, arrived: true, stuck: false };
    }

    if (d < this.best - 1) {
      this.best = d;
      this.stuckFor = 0;
    } else {
      this.stuckFor += dt;
      if (this.stuckFor > STUCK_SECONDS) return { ...idle, arrived: false, stuck: true };
    }

    const remaining = d + pathLength(this.path[0] ?? wp, this.path.slice(1));
    if (this.following) {
      const straight = Math.hypot(this.destination.x - pos.x, this.destination.y - pos.y);
      if (straight > FOLLOW_RUN) this.run = true;
      else if (straight < FOLLOW_WALK) this.run = false;
    }
    // Ease off only as much as needed to stop on the spot: the speed you can still brake from
    // in the remaining distance (with a margin), as a fraction of the current gait's top speed.
    let ease = 1;
    if (this.goal.kind === 'point') {
      const top = (this.run ? tuning.sprintSpeed : tuning.walkSpeed) * PX_PER_METRE;
      const canStopFrom = Math.sqrt(2 * 0.7 * tuning.deceleration * PX_PER_METRE * remaining);
      ease = Math.min(1, Math.max(0.15, canStopFrom / top));
    }
    if (d < 1e-6) return { ...idle, arrived: false, stuck: false };
    return { move: { x: (dx / d) * ease, y: (dy / d) * ease }, run: this.run, arrived: false, stuck: false };
  }
}

export function pathLength(from: Point, path: Point[]): number {
  let total = 0;
  let prev = from;
  for (const p of path) {
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return total;
}
