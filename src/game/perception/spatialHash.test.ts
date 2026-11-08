import { describe, expect, it } from 'vitest';
import { SpatialHash } from './spatialHash';

describe('SpatialHash', () => {
  it('finds everything within range, and skips far-off cells', () => {
    const pts = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 50, y: Math.floor(i / 20) * 50, i }));
    const h = new SpatialHash<(typeof pts)[number]>(100);
    h.build(pts);
    const near = h.query(500, 500, 120);
    const truth = pts.filter((p) => Math.hypot(p.x - 500, p.y - 500) <= 120);
    for (const p of truth) expect(near).toContain(p);
    expect(near.length).toBeLessThan(pts.length / 4);
  });

  it('works with negative coordinates', () => {
    const h = new SpatialHash<{ x: number; y: number }>(64);
    const p = { x: -10, y: -70 };
    h.build([p]);
    expect(h.query(0, 0, 80)).toContain(p);
  });
});
