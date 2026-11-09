import { describe, expect, it } from 'vitest';
import { ageOf, alive, DAYS_PER_YEAR, Population } from './people';
import { mayMarry } from './kinship';

describe('the population over the years', () => {
  it('ages, marries, has children and dies, at believable rates', () => {
    const pop = new Population(7);
    pop.populate(1, 300, 0);
    const start = pop.living().length;
    let births = 0;
    let deaths = 0;
    let marriages = 0;
    for (let d = 1; d <= 20 * DAYS_PER_YEAR; d++) {
      for (const e of pop.day(d, null)) {
        if (e.kind === 'birth') births++;
        if (e.kind === 'death') deaths++;
        if (e.kind === 'marriage') marriages++;
      }
    }
    expect(births).toBeGreaterThan(50);
    expect(deaths).toBeGreaterThan(30);
    expect(marriages).toBeGreaterThan(10);
    // Neither dies out nor explodes over twenty years.
    const end = pop.living().length;
    expect(end).toBeGreaterThan(start * 0.6);
    expect(end).toBeLessThan(start * 2.5);
  });

  it('keeps your family line going: children of family are family, spouses join it', () => {
    // Chance plays its part, so over several lives: most marry and have children, and every child of
    // the family is family (and asks for a name), every spouse joins it.
    let marriedCount = 0;
    let withChildren = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const pop = new Population(seed);
      const you = pop.add({ name: 'Isabel', surname: 'Ward', sex: 'f', born: -25 * DAYS_PER_YEAR, home: 0, family: true, live: true });
      // A region's worth of people, as in the game (a village alone has few unmarried men).
      pop.populate(0, 60, 0);
      pop.populate(1, 300, 0);
      let married = false;
      let child = false;
      for (let d = 1; d <= 15 * DAYS_PER_YEAR && alive(you); d++) {
        for (const e of pop.day(d, you.id)) {
          if (e.kind === 'marriage' && (e.a === you.id || e.b === you.id)) married = true;
          if (e.kind === 'birth' && you.children.includes(e.person)) {
            child = true;
            expect(e.family).toBe(true);
            expect(e.needsName).toBe(true);
          }
        }
      }
      if (you.spouse) expect(pop.get(you.spouse)!.family).toBe(true);
      if (married) marriedCount++;
      if (child) withChildren++;
    }
    expect(marriedCount).toBeGreaterThanOrEqual(6);
    expect(withChildren).toBeGreaterThanOrEqual(4);
  });

  it('nobody marries within the Table of Kindred and Affinity', () => {
    const pop = new Population(11);
    pop.populate(1, 200, 0);
    for (let d = 1; d <= 30 * DAYS_PER_YEAR; d++) pop.day(d, null);
    for (const p of pop.people.values()) {
      if (!p.spouse) continue;
      const s = pop.get(p.spouse)!;
      // Check as if unmarried (they are married to each other, which is fine).
      expect(mayMarry((id) => (id === p.id ? { ...p, spouse: undefined } : id === s.id ? { ...s, spouse: undefined } : pop.get(id)), { ...p, spouse: undefined }, { ...s, spouse: undefined }).allowed).toBe(true);
      expect(ageOf(p, 30 * DAYS_PER_YEAR)).toBeGreaterThan(17);
    }
  });
});
