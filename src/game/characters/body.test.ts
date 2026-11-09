import { describe, expect, it } from 'vitest';
import { buildOf, canFight, defaultBody, fightGroup, stageOf } from './body';

describe('life stages', () => {
  it('follow the agreed age ranges', () => {
    const at = (ages: number[]) => ages.map(stageOf);
    expect(at([0, 1, 3, 4, 9, 10, 12, 13, 17, 18, 29, 30, 64, 65, 100])).toEqual([
      'Baby', 'Toddler', 'Toddler', 'Child', 'Child', 'Preteen', 'Preteen', 'Teenager', 'Teenager', 'Young adult', 'Young adult', 'Adult', 'Adult', 'Elder', 'Elder',
    ]);
  });
});

describe('who can fight whom', () => {
  it('adults (18+) fight adults, teens only teens, children nobody', () => {
    expect(canFight(30, 70)).toBe(true);
    expect(canFight(18, 64)).toBe(true);
    expect(canFight(15, 16)).toBe(true);
    expect(canFight(15, 30)).toBe(false);
    expect(canFight(30, 15)).toBe(false);
    expect(canFight(30, 12)).toBe(false);
    expect(canFight(12, 12)).toBe(false);
    expect(canFight(8, 30)).toBe(false);
    expect(fightGroup(12)).toBe('child');
    expect(fightGroup(13)).toBe('teen');
  });
});

describe('build from the body', () => {
  it('is about average for a default adult, and smaller for children', () => {
    const adult = buildOf(defaultBody('m'));
    expect(adult.heightM).toBeCloseTo(1.72, 1);
    expect(adult.weightKg).toBeGreaterThan(60);
    expect(adult.weightKg).toBeLessThan(80);
    const child = buildOf({ ...defaultBody('m'), age: 6 });
    expect(child.heightM).toBeLessThan(1.4);
    expect(child.weightKg).toBeLessThan(adult.weightKg / 2);
    const heavy = buildOf({ ...defaultBody('m'), fat: 10, frame: 6 });
    expect(heavy.weightKg).toBeGreaterThan(adult.weightKg * 1.3);
  });
});
