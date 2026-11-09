import { describe, expect, it } from 'vitest';
import { addMoodlet, ambientWarmth, expireMoodlets, freshNeeds, healthLossPerHour, moodOf, NEED_IDS, tickNeeds, type Moodlet, type Needs } from './needs';

const full = (): Needs => Object.fromEntries(NEED_IDS.map((id) => [id, 1])) as Needs;

describe('needs', () => {
  it('drain on the game clock: thirst empties in about 10 hours awake, slower asleep', () => {
    const n = full();
    tickNeeds(n, { dt: 5 * 3600, asleep: false, ambientWarmth: 0.6 });
    expect(n.thirst).toBeCloseTo(0.5, 2);
    expect(n.hunger).toBeCloseTo(0.75, 2);
    const s = full();
    tickNeeds(s, { dt: 5 * 3600, asleep: true, ambientWarmth: 0.6 });
    expect(s.thirst).toBeCloseTo(0.75, 2);
    expect(s.rest).toBe(1);
  });

  it('what someone is doing fills needs at its rate', () => {
    const n = full();
    n.rest = 0.2;
    tickNeeds(n, { dt: 3600, asleep: true, ambientWarmth: 0.6, gains: { rest: 0.15 } });
    expect(n.rest).toBeCloseTo(0.35, 2);
  });

  it('warmth drifts towards how warm it is around them', () => {
    const n = full();
    n.warmth = 0.2;
    tickNeeds(n, { dt: 3 * 3600, asleep: false, ambientWarmth: 0.8 });
    expect(n.warmth).toBeCloseTo(0.8, 2);
  });

  it('empty thirst, hunger or warmth costs health; cold fastest', () => {
    const n = full();
    expect(healthLossPerHour(n)).toBe(0);
    n.thirst = 0;
    expect(healthLossPerHour(n)).toBeCloseTo(100 / 48);
    n.thirst = 1;
    n.warmth = 0;
    expect(healthLossPerHour(n)).toBeCloseTo(100 / 8);
  });

  it('winter nights outdoors are freezing; a fire indoors is snug', () => {
    expect(ambientWarmth(300, 2, false, 99)).toBeLessThan(0.1);
    expect(ambientWarmth(300, 2, true, 1)).toBeGreaterThan(0.5);
  });
});

describe('mood', () => {
  it('is the needs plus moodlets, and moodlets expire', () => {
    const n = freshNeeds(() => 0.5);
    const list: Moodlet[] = [];
    const base = moodOf(n, list);
    addMoodlet(list, 'was_hit', 0);
    expect(moodOf(n, list)).toBe(base - 12);
    addMoodlet(list, 'was_hit', 100);
    expect(list.length).toBe(1);
    expectThatExpires(list);
    const low = full();
    low.hunger = 0;
    expect(moodOf(low, [])).toBeLessThan(moodOf(full(), []) - 10);
  });
});

function expectThatExpires(list: Moodlet[]) {
  expireMoodlets(list, 25 * 3600);
  expect(list.length).toBe(0);
}
