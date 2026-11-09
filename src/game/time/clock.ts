/**
 * The game clock and calendar. Pure TypeScript.
 *
 * Calendar (DECIDED): 7 days a week, 4 weeks a month, 12 months a year
 * (3 months a season), so 28 days a month and 336 days a year.
 *
 * How long a day lasts in real time is UNDECIDED: DAY_REAL_MINUTES is a
 * placeholder. A "day" is day + night of equal length.
 */

export const CALENDAR = {
  daysPerWeek: 7,
  weeksPerMonth: 4,
  monthsPerYear: 12,
  monthsPerSeason: 3,
} as const;

export const DAYS_PER_MONTH = CALENDAR.daysPerWeek * CALENDAR.weeksPerMonth; // 28
export const DAYS_PER_YEAR = DAYS_PER_MONTH * CALENDAR.monthsPerYear; // 336

/** PLACEHOLDER: real minutes per full day (day + night). Options under discussion: 10, 20, 30, 40. */
export const DAY_REAL_MINUTES = 30;
const DAY_GAME_SECONDS = 24 * 60 * 60;
/** Game seconds that pass per real second at normal speed. */
export const GAME_SECONDS_PER_REAL = DAY_GAME_SECONDS / (DAY_REAL_MINUTES * 60);

/** PLACEHOLDER: daytime runs 06:00–18:00 (equal day and night). */
export const DAWN_HOUR = 6;
export const DUSK_HOUR = 18;

/** PLACEHOLDER: the game starts on day 1 at 07:00. */
export const START_HOUR = 7;

export interface ClockParts {
  /** All counted from 1. */
  year: number;
  month: number;
  /** Week of the month. */
  week: number;
  /** Day of the month. */
  day: number;
  /** Day of the week. */
  weekday: number;
  /** Days since the start, from 1. */
  dayNumber: number;
  hour: number;
  minute: number;
  isDaytime: boolean;
}

export class GameClock {
  /** Game seconds since midnight on day 1. */
  seconds: number;

  constructor(seconds = START_HOUR * 3600) {
    this.seconds = seconds;
  }

  /** Move time on by `realDt` real seconds at normal speed. */
  advance(realDt: number): void {
    this.seconds += realDt * GAME_SECONDS_PER_REAL;
  }

  get hourOfDay(): number {
    return (this.seconds % DAY_GAME_SECONDS) / 3600;
  }

  parts(): ClockParts {
    return clockParts(this.seconds);
  }

  /** Hours from now until the next time the clock reads `hour` (0 < result ≤ 24). */
  hoursUntil(hour: number): number {
    let h = (hour - this.hourOfDay + 24) % 24;
    if (h < 1 / 60) h += 24;
    return h;
  }
}

export function clockParts(seconds: number): ClockParts {
  const totalDays = Math.floor(seconds / DAY_GAME_SECONDS);
  const secOfDay = seconds - totalDays * DAY_GAME_SECONDS;
  const hour = Math.floor(secOfDay / 3600);
  const minute = Math.floor((secOfDay % 3600) / 60);
  const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1;
  const dayOfYear = totalDays % DAYS_PER_YEAR;
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;
  const dayOfMonth = dayOfYear % DAYS_PER_MONTH;
  return {
    year,
    month,
    week: Math.floor(dayOfMonth / CALENDAR.daysPerWeek) + 1,
    day: dayOfMonth + 1,
    weekday: (totalDays % CALENDAR.daysPerWeek) + 1,
    dayNumber: totalDays + 1,
    hour,
    minute,
    isDaytime: hour >= DAWN_HOUR && hour < DUSK_HOUR,
  };
}

export function formatTime(p: Pick<ClockParts, 'hour' | 'minute'>): string {
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** e.g. "Day 3 · Month 1 · Year 1". Month and weekday names are undecided, so numbers for now. */
export function formatDate(p: ClockParts): string {
  return `Day ${p.day} · Month ${p.month} · Year ${p.year}`;
}

/** Short, for phones: e.g. "Wd 3 · Day 10 · M2 · Y1". */
export function formatShortDate(p: ClockParts): string {
  return `Wd ${p.weekday} · Day ${p.day} · M${p.month} · Y${p.year}`;
}

/** With the day of the week too, e.g. "Weekday 3 · Day 10 · Month 2 · Year 1". */
export function formatFullDate(p: ClockParts): string {
  return `Weekday ${p.weekday} · ${formatDate(p)}`;
}

/** e.g. "5h 20m" / "40m". */
export function formatDuration(gameSeconds: number): string {
  const m = Math.max(0, Math.ceil(gameSeconds / 60));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
