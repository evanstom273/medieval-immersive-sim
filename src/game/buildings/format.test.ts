import { describe, expect, it } from 'vitest';
import { COTTAGE } from './cottage';
import type { Building } from './format';

/** Basic sanity checks every preset building should pass. */
function problems(b: Building): string[] {
  const out: string[] = [];
  for (const s of b.storeys) {
    for (const w of s.walls) {
      const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
      if (w.from[0] !== w.to[0] && w.from[1] !== w.to[1]) out.push(`level ${s.level}: a wall isn't east–west or north–south`);
      for (const o of w.openings) if (o.at < 0 || o.at + o.width > len + 1e-6) out.push(`level ${s.level}: an opening runs off the end of its wall`);
      for (const [x, y] of [w.from, w.to]) if (x < 0 || y < 0 || x > b.size.w || y > b.size.d) out.push(`level ${s.level}: a wall leaves the footprint`);
    }
    for (const r of s.rooms) for (const [x, y] of r.outline) if (x < 0 || y < 0 || x > b.size.w || y > b.size.d) out.push(`${r.name} leaves the footprint`);
    for (const f of s.fixtures) if ((f.kind === 'ladder' || f.kind === 'stair') && !b.storeys.some((o) => o.level === f.toLevel)) out.push(`a ${f.kind} goes to a storey that doesn't exist`);
  }
  return out;
}

describe('building format', () => {
  it('the cottage is well formed', () => {
    expect(problems(COTTAGE)).toEqual([]);
  });

  it('every storey has rooms, and the ladder reaches the loft', () => {
    expect(COTTAGE.storeys.every((s) => s.rooms.length > 0)).toBe(true);
    const ladder = COTTAGE.storeys[0].fixtures.find((f) => f.kind === 'ladder');
    expect(ladder && 'toLevel' in ladder ? ladder.toLevel : null).toBe(1);
  });
});
