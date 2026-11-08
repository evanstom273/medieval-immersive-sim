import { describe, expect, it } from 'vitest';
import { clockParts, DAYS_PER_YEAR, formatDuration, GameClock, GAME_SECONDS_PER_REAL, DAY_REAL_MINUTES } from './clock';

const DAY = 86400;

describe('calendar', () => {
  it('has 336 days a year', () => {
    expect(DAYS_PER_YEAR).toBe(336);
  });

  it('rolls days into weeks, months and years', () => {
    expect(clockParts(0)).toMatchObject({ year: 1, month: 1, week: 1, day: 1, weekday: 1, hour: 0 });
    expect(clockParts(7 * DAY)).toMatchObject({ week: 2, day: 8, weekday: 1 });
    expect(clockParts(28 * DAY)).toMatchObject({ month: 2, week: 1, day: 1 });
    expect(clockParts(336 * DAY)).toMatchObject({ year: 2, month: 1, day: 1 });
    expect(clockParts(DAY - 60)).toMatchObject({ day: 1, hour: 23, minute: 59 });
  });

  it('splits day and night evenly', () => {
    expect(clockParts(5.99 * 3600).isDaytime).toBe(false);
    expect(clockParts(6 * 3600).isDaytime).toBe(true);
    expect(clockParts(18 * 3600).isDaytime).toBe(false);
  });
});

describe('GameClock', () => {
  it('runs a full day in DAY_REAL_MINUTES real minutes', () => {
    const c = new GameClock(0);
    c.advance(DAY_REAL_MINUTES * 60);
    expect(c.seconds).toBeCloseTo(DAY);
    expect(GAME_SECONDS_PER_REAL * DAY_REAL_MINUTES * 60).toBeCloseTo(DAY);
  });

  it('counts hours until a time of day, wrapping past midnight', () => {
    const c = new GameClock(22 * 3600);
    expect(c.hoursUntil(6)).toBeCloseTo(8);
    expect(c.hoursUntil(23)).toBeCloseTo(1);
    expect(c.hoursUntil(22)).toBeCloseTo(24);
  });

  it('formats durations', () => {
    expect(formatDuration(5 * 3600 + 20 * 60)).toBe('5h 20m');
    expect(formatDuration(40 * 60)).toBe('40m');
  });
});
