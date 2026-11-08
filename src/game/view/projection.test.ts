import { describe, expect, it } from 'vitest';
import { VIEW_MODES, makeProjection } from './projection';

describe('projections', () => {
  it('round-trip ground → screen → ground in every view', () => {
    for (const mode of VIEW_MODES) {
      const p = makeProjection(mode);
      for (const [x, y] of [
        [0, 0],
        [123, 456],
        [2000, 300],
      ]) {
        const s = p.toScreen(x, y);
        const g = p.toGround(s.x, s.y);
        expect(g.x).toBeCloseTo(x);
        expect(g.y).toBeCloseTo(y);
      }
    }
  });

  it('heights rise up the screen except when looking straight down', () => {
    expect(makeProjection('topdown').toScreen(10, 10, 100).y).toBe(10);
    expect(makeProjection('threequarter').toScreen(10, 10, 100).y).toBeLessThan(makeProjection('threequarter').toScreen(10, 10, 0).y);
    expect(makeProjection('isometric').toScreen(10, 10, 100).y).toBeLessThan(makeProjection('isometric').toScreen(10, 10, 0).y);
  });

  it('things nearer the viewer sort later', () => {
    const t = makeProjection('threequarter');
    expect(t.depth(0, 200)).toBeGreaterThan(t.depth(0, 100));
    const iso = makeProjection('isometric');
    expect(iso.depth(200, 200)).toBeGreaterThan(iso.depth(100, 100));
    // In isometric, the "toward the viewer" direction is south-east.
    expect(iso.toward!.x).toBeGreaterThan(0);
    expect(iso.toward!.y).toBeGreaterThan(0);
  });

  it('isometric is 2:1', () => {
    const p = makeProjection('isometric');
    const a = p.toScreen(0, 0);
    const b = p.toScreen(100, 0);
    expect(Math.abs(b.x - a.x) / Math.abs(b.y - a.y)).toBeCloseTo(2);
  });
});
