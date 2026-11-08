import { describe, expect, it } from 'vitest';
import { makeProjection } from './projection';
import { chunks, isFrontWall, type StaticProp } from './walls';

// The sandbox house: 8 m × 6 m with 20 px walls.
const hx = 1152;
const hy = 576;
const hw = 512;
const hh = 384;
const t = 20;
const floor = { kind: 'floor' as const, x: hx, y: hy, w: hw, h: hh, colour: 0 };
const wall = (x: number, y: number, w: number, h: number): Extract<StaticProp, { kind: 'box' }> => ({ kind: 'box', x, y, w, h, height: 150, colour: 0, wall: true });
const north = wall(hx, hy, hw, t);
const south = wall(hx, hy + hh - t, hw, t);
const west = wall(hx, hy, t, hh);
const east = wall(hx + hw - t, hy, t, hh);

const fronts = (w: Extract<StaticProp, { kind: 'box' }>, mode: 'threequarter' | 'isometric') =>
  chunks(w).map((c) => isFrontWall(c, [floor], makeProjection(mode)));

describe('cutaway: which walls are in front of the room', () => {
  it('¾: the south wall is cut, the north wall stays, side walls step down near the front', () => {
    expect(fronts(south, 'threequarter').every(Boolean)).toBe(true);
    expect(fronts(north, 'threequarter').some(Boolean)).toBe(false);
    for (const side of [west, east]) {
      const f = fronts(side, 'threequarter');
      expect(f[f.length - 1]).toBe(true); // front end
      expect(f[0]).toBe(false); // back end
    }
  });

  it('isometric: the south and east walls are cut, north and west stay', () => {
    expect(fronts(south, 'isometric').every(Boolean)).toBe(true);
    expect(fronts(east, 'isometric').every(Boolean)).toBe(true);
    expect(fronts(north, 'isometric').some(Boolean)).toBe(false);
    expect(fronts(west, 'isometric').some(Boolean)).toBe(false);
  });
});
