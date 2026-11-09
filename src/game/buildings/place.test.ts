import { describe, expect, it } from 'vitest';
import { COTTAGE } from './cottage';
import { TERRACE } from './row';
import { floorAt, placeTown, stairEnds, stairProgress } from './place';
import { PX_PER_METRE as M } from '../movement/tuning';

describe('placing buildings', () => {
  const town = placeTown([...TERRACE.map((p) => ({ ...p, x: p.x + 30, y: p.y + 3 })), { building: COTTAGE, x: 40, y: 21 }]);

  it('trims north–south walls to the faces of the walls they run into', () => {
    const gable = town.walls.find((w) => w.plot === 4 && w.level === 0 && w.material === 'rubble')!;
    expect(gable.kind).toBe('ns');
    expect(gable.joinedA && gable.joinedB).toBe(true);
    const ys = gable.foot.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo((21 + 0.3) * M);
    expect(Math.max(...ys)).toBeCloseTo((21 + 5.1) * M);
  });

  it('splits walls into ~1 m pieces with pieces over doorways', () => {
    expect(town.pieces.length).toBeGreaterThan(200);
    expect(town.pieces.some((p) => p.over > 0)).toBe(true);
    for (const p of town.pieces) expect(p.b - p.a).toBeLessThan(1.6 * M);
  });

  it('hangs a door in every doorway', () => {
    const openings = [...TERRACE.map((p) => p.building), COTTAGE].flatMap((b) => b.storeys.flatMap((s) => s.walls.flatMap((w) => w.openings.filter((o) => o.kind === 'door'))));
    expect(town.doors.length).toBe(openings.length);
  });

  it('finds which floor a point is on', () => {
    const hall = floorAt(town, (40 + 2) * M, (21 + 2.5) * M, 0);
    expect(hall?.name).toBe('Hall');
    expect(floorAt(town, (40 + 2) * M, (21 + 2.5) * M, 1)?.name).toBe('Loft');
    expect(floorAt(town, 10 * M, 10 * M, 0)).toBeNull();
  });

  it('stairs lead up from their foot to their top', () => {
    expect(town.stairs.length).toBe(5);
    for (const s of town.stairs) {
      const { foot, top } = stairEnds(s);
      expect(stairProgress(s, foot.x, foot.y)).toBe(0);
      expect(stairProgress(s, top.x, top.y)).toBe(1);
      expect(s.zTo).toBeGreaterThan(s.zFrom);
      // You can step off at the top onto the floor above.
      expect(floorAt(town, top.x, top.y, s.toLevel)).not.toBeNull();
    }
  });

  it('closes the loft edges where there is no wall', () => {
    expect(town.barriers.some((b) => b.level === 1 && b.w > 5 * M)).toBe(true);
  });
});
