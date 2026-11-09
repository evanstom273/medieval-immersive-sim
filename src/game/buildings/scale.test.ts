import { describe, expect, it } from 'vitest';
import { COTTAGE } from './cottage';
import { TERRACE } from './row';
import { floorAt, placeTown, stairEnds } from './place';
import { scaleBuilding, scalePlots } from './scale';
import { PX_PER_METRE as M } from '../movement/tuning';

describe('building scale', () => {
  for (const [size, height] of [
    [1, 1],
    [2.5, 1],
    [3, 1.5],
    [5, 2],
  ]) {
    describe(`${size}× rooms, ${height}× storeys`, () => {
      const s = { size, height };
      const town = placeTown([...scalePlots(TERRACE, s), { building: scaleBuilding(COTTAGE, s), x: 0, y: 12 * size + 4 }]);

      it('keeps walls straight or at 45°, and openings on their walls', () => {
        for (const b of town.buildings) {
          for (const st of b.plot.building.storeys) {
            for (const w of st.walls) {
              const dx = Math.abs(w.to[0] - w.from[0]);
              const dy = Math.abs(w.to[1] - w.from[1]);
              if (dx > 1e-6 && dy > 1e-6) expect(dx).toBeCloseTo(dy);
              const len = Math.hypot(dx, dy);
              for (const o of w.openings) expect(o.at + o.width).toBeLessThanOrEqual(len + 1e-6);
            }
          }
        }
      });

      it("stairs land on a floor, and no door swings into one", () => {
        let bad = 0;
        for (const z of town.stairs) {
          const { top } = stairEnds(z);
          expect(floorAt(town, top.x, top.y, z.toLevel)).not.toBeNull();
          for (const d of town.doors) {
            if (d.level !== z.fromLevel && d.level !== z.toLevel) continue;
            const r = z.rect;
            const cx = Math.max(r.x, Math.min(d.hinge.x, r.x + r.w));
            const cy = Math.max(r.y, Math.min(d.hinge.y, r.y + r.h));
            const gap = Math.hypot(d.hinge.x - cx, d.hinge.y - cy);
            if (gap <= d.length + 0.2 * M) bad++;
          }
        }
        expect(bad).toBe(0);
      });

      it('rooms still meet their walls', () => {
        for (const f of town.floors) {
          for (const p of f.outline) {
            // Every corner of a room is within a wall's reach of some wall.
            const nearWall = town.walls.some((w) => w.level === f.level && w.foot.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.6 * M + Math.hypot(w.b - w.a, 0)));
            expect(nearWall).toBe(true);
          }
        }
      });
    });
  }
});
