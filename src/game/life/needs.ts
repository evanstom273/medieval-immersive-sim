/**
 * Needs, moodlets and mood (see the Life Simulation Design doc: "Needs",
 * "Mood and personality"). Pure: no Phaser. The scene ticks these on the game
 * clock and applies what they say (health loss, collapsing asleep, accidents).
 *
 * A need runs from 1 (fully met) to 0 (desperate). PLACEHOLDER numbers
 * throughout: drain rates, thresholds, moodlet values and the mood formula
 * are first guesses to tune.
 */

export type NeedId = 'hunger' | 'thirst' | 'rest' | 'warmth' | 'hygiene' | 'bladder' | 'company' | 'comfort' | 'fun';

export interface NeedDef {
  id: NeedId;
  label: string;
  icon: string;
  /** Game hours from full to empty while awake (warmth instead drifts towards how warm it is around them). */
  drainHours: number;
  /** Drain multiplier while asleep. */
  asleep: number;
  /** Shown over someone's head when this need is low. */
  sign: string;
}

export const NEED_DEFS: NeedDef[] = [
  { id: 'hunger', label: 'Hunger', icon: '🍞', drainHours: 20, asleep: 0.5, sign: '🍞' },
  { id: 'thirst', label: 'Thirst', icon: '💧', drainHours: 10, asleep: 0.5, sign: '💧' },
  { id: 'rest', label: 'Rest', icon: '💤', drainHours: 18, asleep: 0, sign: '🥱' },
  { id: 'warmth', label: 'Warmth', icon: '🔥', drainHours: 0, asleep: 1, sign: '🥶' },
  { id: 'hygiene', label: 'Hygiene', icon: '🫧', drainHours: 48, asleep: 0.5, sign: '🪰' },
  { id: 'bladder', label: 'Bladder', icon: '🚽', drainHours: 6, asleep: 0.4, sign: '🚽' },
  { id: 'company', label: 'Company', icon: '🗣️', drainHours: 16, asleep: 0, sign: '😔' },
  { id: 'comfort', label: 'Comfort', icon: '🪑', drainHours: 14, asleep: 0, sign: '😣' },
  { id: 'fun', label: 'Fun', icon: '🎲', drainHours: 18, asleep: 0, sign: '😑' },
];

export const NEED_IDS = NEED_DEFS.map((d) => d.id);
const DEF = Object.fromEntries(NEED_DEFS.map((d) => [d.id, d])) as Record<NeedId, NeedDef>;

export type Needs = Record<NeedId, number>;

export function freshNeeds(rng: () => number = Math.random): Needs {
  // Start the day comfortable but not identical.
  const n = {} as Needs;
  for (const id of NEED_IDS) n[id] = 0.65 + rng() * 0.3;
  return n;
}

/** Warmth drifts towards how warm it is around someone over about this long (game hours). */
const WARMTH_HOURS = 1.5;

/** How much of what an action gives makes it through: a need being met fills at the action's rate per game hour. */
export type Gains = Partial<Record<NeedId, number>>;

export interface TickInput {
  /** Game seconds passed. */
  dt: number;
  asleep: boolean;
  /** How warm it is around them, 0 (freezing) – 1 (snug). */
  ambientWarmth: number;
  /** What the thing they're doing gives, per game hour. */
  gains?: Gains | null;
}

/** Drain needs, apply what they're doing, and drift warmth. */
export function tickNeeds(n: Needs, t: TickInput): void {
  const h = t.dt / 3600;
  for (const d of NEED_DEFS) {
    if (d.id === 'warmth') {
      const k = Math.min(1, h / WARMTH_HOURS);
      n.warmth += (t.ambientWarmth - n.warmth) * k;
    } else {
      const rate = (1 / d.drainHours) * (t.asleep ? d.asleep : 1);
      n[d.id] -= rate * h;
    }
    const g = t.gains?.[d.id];
    if (g) n[d.id] += g * h;
    n[d.id] = Math.max(0, Math.min(1, n[d.id]));
  }
}

// ------------------------------------------------------------------ what neglect does

/** Health (out of 100) lost per game hour while a need is empty: thirst kills in about two days, cold in hours, hunger in weeks. */
export const EMPTY_HEALTH_PER_HOUR: Partial<Record<NeedId, number>> = {
  thirst: 100 / 48,
  warmth: 100 / 8,
  hunger: 100 / (21 * 24),
};

export function healthLossPerHour(n: Needs): number {
  let loss = 0;
  if (n.thirst <= 0.001) loss += EMPTY_HEALTH_PER_HOUR.thirst!;
  if (n.warmth <= 0.001) loss += EMPTY_HEALTH_PER_HOUR.warmth!;
  if (n.hunger <= 0.001) loss += EMPTY_HEALTH_PER_HOUR.hunger!;
  return loss;
}

/** Something about their needs is actively harming them (so they shouldn't heal). */
export function inDanger(n: Needs): boolean {
  return n.thirst <= 0.001 || n.warmth <= 0.001 || n.hunger <= 0.001;
}

/** Effects of low needs on the body: tired people move slower. */
export function speedFactor(n: Needs): number {
  const tired = n.rest < 0.25 ? 0.8 + 0.8 * n.rest : 1;
  const cold = n.warmth < 0.15 ? 0.85 : 1;
  return tired * cold;
}

/** Hungry or exhausted people are short-tempered: conversations go worse. */
export function irritability(n: Needs): number {
  return (n.hunger < 0.25 ? 12 * (1 - n.hunger / 0.25) : 0) + (n.rest < 0.2 ? 10 * (1 - n.rest / 0.2) : 0);
}

/** The most pressing low need to show over their head, if any. */
export function pressingSign(n: Needs): string | null {
  let worst: NeedDef | null = null;
  let v = 0.3;
  for (const d of NEED_DEFS) {
    if (n[d.id] < v) {
      v = n[d.id];
      worst = d;
    }
  }
  return worst ? worst.sign : null;
}

// ------------------------------------------------------------------ moodlets and mood

export type MoodletId = 'slept_bed' | 'slept_straw' | 'slept_rough' | 'nice_chat' | 'argument' | 'saw_fight' | 'was_hit' | 'accident' | 'ale' | 'warm_fire' | 'washed' | 'ate' | 'relieved';

export interface MoodletDef {
  label: string;
  value: number;
  /** Game hours it lasts. */
  hours: number;
}

export const MOODLETS: Record<MoodletId, MoodletDef> = {
  slept_bed: { label: 'Slept in a bed', value: 4, hours: 12 },
  slept_straw: { label: 'Slept on straw', value: 0, hours: 12 },
  slept_rough: { label: 'Slept on the floor', value: -5, hours: 12 },
  nice_chat: { label: 'Had a nice chat', value: 3, hours: 4 },
  argument: { label: 'Had words with someone', value: -4, hours: 6 },
  saw_fight: { label: 'Saw a fight', value: -6, hours: 8 },
  was_hit: { label: 'Was attacked', value: -12, hours: 24 },
  accident: { label: 'Wet myself', value: -12, hours: 12 },
  ale: { label: 'Had a drink', value: 3, hours: 3 },
  warm_fire: { label: 'Warmed by the fire', value: 2, hours: 2 },
  washed: { label: 'Feeling clean', value: 2, hours: 6 },
  ate: { label: 'Had a meal', value: 2, hours: 4 },
  relieved: { label: 'Relieved', value: 1, hours: 1 },
};

export interface Moodlet {
  id: MoodletId;
  /** Game seconds when it ends. */
  until: number;
}

export function addMoodlet(list: Moodlet[], id: MoodletId, nowS: number): void {
  const until = nowS + MOODLETS[id].hours * 3600;
  const existing = list.find((m) => m.id === id);
  if (existing) existing.until = until;
  else list.push({ id, until });
}

export function expireMoodlets(list: Moodlet[], nowS: number): void {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].until <= nowS) list.splice(i, 1);
}

/** Mood, −100 (wretched) to +100 (joyful): how well needs are met, plus moodlets. */
export function moodOf(n: Needs, moodlets: readonly Moodlet[]): number {
  let needs = 0;
  for (const id of NEED_IDS) {
    needs += (n[id] * 2 - 1) * 4; // ±4 each, ±36 in all
    if (n[id] < 0.2) needs -= 10 * (1 - n[id] / 0.2); // a desperate need weighs heavily
  }
  let feelings = 0;
  for (const m of moodlets) feelings += MOODLETS[m.id].value;
  return Math.max(-100, Math.min(100, Math.round(needs + feelings)));
}

export function moodWord(mood: number): { label: string; icon: string } {
  if (mood <= -40) return { label: 'Miserable', icon: '😫' };
  if (mood <= -15) return { label: 'Unhappy', icon: '🙁' };
  if (mood < 15) return { label: 'Fine', icon: '🙂' };
  if (mood < 40) return { label: 'Content', icon: '😊' };
  return { label: 'Happy', icon: '😄' };
}

export const needDef = (id: NeedId): NeedDef => DEF[id];

// ------------------------------------------------------------------ how warm it is

/** PLACEHOLDER season order: the year starts in spring (the calendar's season names aren't decided). */
export function seasonOf(dayOfYear: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(dayOfYear / 84)) as 0 | 1 | 2 | 3;
}

const SEASON_WARMTH = [0.55, 0.8, 0.5, 0.2];

/** How warm it is somewhere, 0–1. PLACEHOLDER until there's weather and clothing. */
export function ambientWarmth(dayOfYear: number, hour: number, indoors: boolean, fireDistanceM: number): number {
  const night = hour < 6 || hour >= 20 ? 0.15 : 0;
  let w = SEASON_WARMTH[seasonOf(dayOfYear)] - night;
  if (indoors) w += 0.25;
  if (fireDistanceM < 4) w += 0.5 * (1 - fireDistanceM / 4);
  return Math.max(0, Math.min(1, w));
}
