import { describe, expect, it } from 'vitest';
import { NavGrid, type Obstacle } from './NavGrid';

describe('NavGrid', () => {
  it('routes around a wall rather than through it', () => {
    const grid = new NavGrid(400, 400, 8);
    const wall: Obstacle = { kind: 'rect', x: 190, y: 0, w: 20, h: 300 };
    grid.build([wall], 16);
    const goal = { x: 350, y: 50 };
    const path = grid.findPath({ x: 50, y: 50 }, (p) => Math.hypot(p.x - goal.x, p.y - goal.y) < 8, goal);
    expect(path).not.toBeNull();
    // Must dip below the wall's end to get round.
    expect(Math.max(...path!.map((p) => p.y))).toBeGreaterThan(300);
    // Every leg is clear.
    let prev = { x: 50, y: 50 };
    for (const p of path!) {
      expect(grid.lineClear(prev, p)).toBe(true);
      prev = p;
    }
  });

  it('returns null when the goal is sealed off', () => {
    const grid = new NavGrid(400, 400, 8);
    grid.build([{ kind: 'circle', x: 300, y: 300, r: 10 }, { kind: 'rect', x: 250, y: 250, w: 100, h: 4 }, { kind: 'rect', x: 250, y: 346, w: 100, h: 4 }, { kind: 'rect', x: 250, y: 250, w: 4, h: 100 }, { kind: 'rect', x: 346, y: 250, w: 4, h: 100 }], 16);
    const path = grid.findPath({ x: 50, y: 50 }, (p) => Math.hypot(p.x - 300, p.y - 300) < 30, { x: 300, y: 300 });
    expect(path).toBeNull();
  });

  it('fits through a gap just wider than the walker', () => {
    const grid = new NavGrid(400, 400, 8);
    // Two walls with a 48 px gap centred at x=200; walker radius 16 + 2 margin.
    grid.build(
      [
        { kind: 'rect', x: 0, y: 190, w: 176, h: 20 },
        { kind: 'rect', x: 224, y: 190, w: 176, h: 20 },
      ],
      18,
    );
    const goal = { x: 200, y: 350 };
    const path = grid.findPath({ x: 200, y: 50 }, (p) => Math.hypot(p.x - goal.x, p.y - goal.y) < 8, goal);
    expect(path).not.toBeNull();
  });
});

describe('NavGrid links', () => {
  it('routes through a link (e.g. a window) when there is no other way, only if links are allowed', () => {
    const grid = new NavGrid(400, 400, 8);
    // A wall all the way across.
    grid.build([{ kind: 'rect', x: 0, y: 190, w: 400, h: 20 }], 16);
    grid.setLinks([{ from: { x: 200, y: 160 }, to: { x: 200, y: 240 }, costMetres: 6, data: 'window' }]);
    const goal = { x: 200, y: 350 };
    const isGoal = (p: { x: number; y: number }) => Math.hypot(p.x - goal.x, p.y - goal.y) < 8;
    expect(grid.findPath({ x: 50, y: 50 }, isGoal, goal)).toBeNull();
    const path = grid.findPath({ x: 50, y: 50 }, isGoal, goal, 60000, true)!;
    expect(path).not.toBeNull();
    const at = path.findIndex((w) => w.link);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(path[at].link!.data).toBe('window');
    expect(path[at + 1]).toMatchObject({ x: 200, y: 240 }); // carries on from the far side
  });

  it('prefers walking round when that is cheaper than the link', () => {
    const grid = new NavGrid(400, 400, 8);
    // A short wall with an easy way round.
    grid.build([{ kind: 'rect', x: 150, y: 190, w: 100, h: 20 }], 16);
    grid.setLinks([{ from: { x: 200, y: 160 }, to: { x: 200, y: 240 }, costMetres: 6, data: 'window' }]);
    const goal = { x: 200, y: 300 };
    const path = grid.findPath({ x: 200, y: 100 }, (p) => Math.hypot(p.x - goal.x, p.y - goal.y) < 8, goal, 60000, true)!;
    expect(path.some((w) => w.link)).toBe(false);
  });
});
