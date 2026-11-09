import { describe, expect, it } from 'vitest';
import type { Offer } from '../world/furniture';
import { freshNeeds } from './needs';
import { liveThrough, liveTogether, type AbstractLife, type Source } from './abstractDay';

const o = (id: string, gains: Offer['gains'], hours: number, extra: Partial<Offer> = {}): Offer => ({ id, label: id, icon: '', gains, posture: 'stand', hours, ...extra });
// The village's things, with the live game's offers (see world/furniture.ts and Bed).
const VILLAGE: Source[] = [
  { id: 'bed', offers: [o('sleep', { rest: 0.14, comfort: 0.1 }, 9, { posture: 'lie', untilFull: 'rest', moodlet: 'slept_bed', single: true })] },
  { id: 'larder', offers: [o('eat', { hunger: 3 }, 0.35, { untilFull: 'hunger', moodlet: 'ate' })] },
  { id: 'well', offers: [o('drink', { thirst: 4 }, 0.25, { untilFull: 'thirst' }), o('wash', { hygiene: 2 }, 0.5, { untilFull: 'hygiene', moodlet: 'washed' })] },
  { id: 'privy', offers: [o('relieve', { bladder: 12 }, 0.1, { untilFull: 'bladder', moodlet: 'relieved' })] },
  { id: 'bench', offers: [o('sit', { comfort: 0.6, rest: 0.04 }, 1, { posture: 'sit', untilFull: 'comfort' })] },
  { id: 'hearth', offers: [o('warm', { fun: 0.15, comfort: 0.1 }, 0.5, { moodlet: 'warm_fire' })], warm: true },
];
const life = (): AbstractLife => ({ needs: freshNeeds(() => 0.5), moodlets: [], health: 100, maxHealth: 100, doing: null, collapsed: false });
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const opts = (sources: Source[], seed = 7) => ({ sources, company: true, dayOfYear: (s: number) => Math.floor(s / 86400) % 336, rng: seeded(seed) });

describe('living through time unwatched', () => {
  it('a year with everything at hand: they look after themselves (no free top-up, just their routine)', () => {
    const l = life();
    liveThrough(l, 7 * 3600, 336 * 86400 + 12 * 3600, opts(VILLAGE));
    expect(l.collapsed).toBe(false);
    expect(l.health).toBeGreaterThan(90);
    for (const k of ['hunger', 'thirst', 'bladder', 'rest'] as const) expect(l.needs[k]).toBeGreaterThan(0.2);
  });

  it('at three in the morning nearly everyone is asleep', () => {
    let asleep = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const l = life();
      liveThrough(l, 7 * 3600, 30 * 86400 + 3 * 3600, opts(VILLAGE, seed));
      if (l.doing?.offer.posture === 'lie') asleep++;
    }
    expect(asleep).toBeGreaterThanOrEqual(8);
  });

  it('with nothing to eat, they go hungry and in time collapse', () => {
    const l = life();
    liveThrough(l, 7 * 3600, 20 * 86400, opts(VILLAGE.filter((s) => s.id !== 'larder')));
    expect(l.needs.hunger).toBe(0);
    expect(l.health).toBeLessThan(100);
  });

  it('living together: one to a bed, the rest make do; and no two the same', () => {
    let seed = 5;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ls = [life(), life(), life()];
    liveTogether(ls, 7 * 3600, 20 * 86400 + 2 * 3600, { ...opts(VILLAGE), rng });
    expect(ls.filter((l) => l.doing?.source === 'bed')).toHaveLength(1);
    expect(ls.filter((l) => l.doing?.offer.posture === 'lie')).toHaveLength(3);
    expect(new Set(ls.map((l) => l.needs.hunger.toFixed(3))).size).toBeGreaterThan(1);
    for (const l of ls) expect(l.collapsed).toBe(false);
  });
});
