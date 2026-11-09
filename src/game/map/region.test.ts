import { describe, expect, it } from 'vitest';
import { generateRegion } from './region';

describe('generated region', () => {
  const r = generateRegion({ villageW: 84, villageH: 75 });

  it('is the same every time for the same seed', () => {
    expect(JSON.stringify(generateRegion({ villageW: 84, villageH: 75 }))).toBe(JSON.stringify(r));
  });

  it('has home at the village, a market town, villages, manors and a castle', () => {
    const kinds = r.settlements.map((s) => s.kind);
    const home = r.settlements.find((s) => s.kind === 'home')!;
    expect(home.x).toBeCloseTo(42);
    expect(home.y).toBeCloseTo(37.5);
    expect(kinds.filter((k) => k === 'town')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'village').length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === 'manor').length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k) => k === 'castle')).toHaveLength(1);
  });

  it('joins every settlement by road', () => {
    const at = (p: [number, number]) => r.settlements.findIndex((s) => Math.hypot(s.x - p[0], s.y - p[1]) < 1);
    const links = r.roads.map((rd) => [at(rd.points[0]), at(rd.points[rd.points.length - 1])]);
    const seen = new Set([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [a, b] of links) {
        if (seen.has(a) !== seen.has(b)) {
          seen.add(a);
          seen.add(b);
          grew = true;
        }
      }
    }
    expect(seen.size).toBe(r.settlements.length);
  });

  it('keeps the river, woods and fields off the home village', () => {
    const near = (x: number, y: number, d: number) => Math.hypot(x - 42, y - 37.5) < d;
    expect(r.river.some(([x, y]) => near(x, y, 400))).toBe(false);
    expect(r.woods.some(([x, y]) => near(x, y, 400))).toBe(false);
    expect(r.fields.some((f) => f.some(([x, y]) => near(x, y, 60)))).toBe(false);
    expect(r.fields.length).toBeGreaterThan(50);
  });
});
