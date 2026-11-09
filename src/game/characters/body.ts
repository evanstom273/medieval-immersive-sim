/**
 * A person's body: sex, age and the body sliders from the character mock-ups
 * (see DESIGN_LOG "Ages and life stages" and the body sliders board), plus
 * skin and hair colour. Pure data and maths; drawing lives in bodyArt.ts.
 *
 * Sliders run −10..+10 around a normal 0. Fat and muscle change with how
 * someone lives; height, frame, bust, waist and hips are fixed at birth.
 * Age is a whole number of years.
 */

export type Sex = 'm' | 'f';

export interface Body {
  sex: Sex;
  age: number;
  fat: number;
  mus: number;
  height: number;
  frame: number;
  bust: number;
  waist: number;
  hips: number;
  /** CSS hex colours. */
  skin: string;
  hair: string;
}

export const SLIDER_KEYS = ['fat', 'mus', 'height', 'frame', 'bust', 'waist', 'hips'] as const;
export type SliderKey = (typeof SLIDER_KEYS)[number];

/** PLACEHOLDER palettes for character creation. */
export const SKIN_TONES = ['#f1cfb0', '#e8bd98', '#d9a77e', '#c58c62', '#a26a45', '#7a4b2e', '#5a3420'];
export const HAIR_COLOURS = ['#1f1a17', '#3b2416', '#5b3a22', '#8a4a22', '#b06a32', '#b5a07a', '#d8c08a', '#9a2f1c'];

export function defaultBody(sex: Sex = 'm'): Body {
  return { sex, age: 30, fat: 0, mus: 0, height: 0, frame: 0, bust: 0, waist: 0, hips: 0, skin: sex === 'm' ? '#d9a77e' : '#e8bd98', hair: sex === 'm' ? '#3b2416' : '#8a4a22' };
}

// ------------------------------------------------------------------ life stages

export type LifeStage = 'Baby' | 'Toddler' | 'Child' | 'Preteen' | 'Teenager' | 'Young adult' | 'Adult' | 'Elder';

export function stageOf(age: number): LifeStage {
  if (age < 1) return 'Baby';
  if (age <= 3) return 'Toddler';
  if (age <= 9) return 'Child';
  if (age <= 12) return 'Preteen';
  if (age <= 17) return 'Teenager';
  if (age <= 29) return 'Young adult';
  if (age <= 64) return 'Adult';
  return 'Elder';
}

/**
 * Who can fight whom (DESIGN_LOG, a hard rule): young adults, adults and elders
 * fight each other; teenagers only fight teenagers; children (preteens and
 * younger) can't attack or be attacked at all.
 */
export type FightGroup = 'child' | 'teen' | 'adult';

export function fightGroup(age: number): FightGroup {
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  return 'adult';
}

export function canFight(attackerAge: number, victimAge: number): boolean {
  const a = fightGroup(attackerAge);
  return a !== 'child' && a === fightGroup(victimAge);
}

/** Smooth curve through [age, ...values] points. */
function curve(T: number[][], a: number): number[] {
  if (a <= T[0][0]) return T[0].slice(1);
  for (let i = 1; i < T.length; i++) {
    if (a <= T[i][0]) {
      const t = (a - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
      return T[i].slice(1).map((v, j) => T[i - 1][j + 1] + (v - T[i - 1][j + 1]) * t);
    }
  }
  return T[T.length - 1].slice(1);
}

/** Size against an adult: head, torso height, torso width, neck length. */
const GROWTH = [
  [0, 0.6, 0.3, 0.44, 0.1], [1, 0.66, 0.36, 0.48, 0.2], [3, 0.74, 0.46, 0.54, 0.4], [6, 0.81, 0.57, 0.61, 0.6],
  [9, 0.86, 0.67, 0.68, 0.75], [12, 0.91, 0.78, 0.77, 0.85], [15, 0.96, 0.9, 0.87, 0.95], [18, 0.99, 0.97, 0.95, 1],
  [22, 1, 1, 1, 1], [65, 1, 1, 1, 1], [80, 1, 0.97, 0.99, 0.85], [100, 0.99, 0.94, 0.97, 0.75],
];

export interface AgeProfile {
  head: number;
  th: number;
  tw: number;
  neckLen: number;
  /** How far the body has become a man's or a woman's (0 before puberty, 1 adult). */
  pub: number;
  /** Childish face. */
  child: number;
  /** Toddler tummy. */
  belly: number;
  /** Old age: stoop, wrinkles, sagging. */
  eld: number;
  grey: number;
  /** Babies have barely any hair. */
  hairRise: number;
  /** Long hair has to grow. */
  hairLen: number;
}

export function ageProfile(age: number): AgeProfile {
  const [head, th, tw, neckLen] = curve(GROWTH, age);
  const one = (T: number[][]) => curve(T, age)[0];
  return {
    head,
    th,
    tw,
    neckLen,
    pub: one([[0, 0], [10, 0], [13, 0.4], [16, 0.85], [19, 1]]),
    child: one([[0, 1], [4, 0.8], [10, 0.45], [14, 0.15], [18, 0]]),
    belly: one([[0, 1], [3, 0.9], [6, 0.3], [9, 0]]),
    eld: one([[0, 0], [55, 0], [70, 0.5], [85, 0.9], [100, 1]]),
    grey: one([[0, 0], [38, 0], [50, 0.2], [65, 0.55], [80, 0.9], [100, 1]]),
    hairRise: one([[0, 4.5], [1, 3], [2, 1], [3, 0]]),
    hairLen: one([[0, 0], [2, 0.3], [5, 0.8], [8, 1]]),
  };
}

/** Height stretch from the height slider (grows in with puberty). */
export function heightStretch(b: Body, A = ageProfile(b.age)): number {
  return 1 + 0.011 * b.height * (0.5 + 0.5 * A.pub);
}

/**
 * PLACEHOLDER height and weight worked out from the body, for shoving (see
 * movement/shove.ts). Average adult ≈ 1.72 m / 70 kg.
 */
export function buildOf(b: Body): { heightM: number; weightKg: number } {
  const A = ageProfile(b.age);
  const heightM = 1.72 * heightStretch(b, A) * (0.25 + 0.75 * A.th) * (b.sex === 'f' ? 0.95 : 1);
  const size = (heightM / 1.72) ** 2 * A.tw;
  const weightKg = 70 * size * (1 + 0.05 * b.fat + 0.025 * b.mus * A.pub + 0.025 * b.frame);
  return { heightM: Math.round(heightM * 100) / 100, weightKg: Math.round(Math.max(3, weightKg)) };
}

/** Same body → same key (for sharing drawn textures). */
export function bodyKey(b: Body): string {
  return [b.sex, b.age, b.fat, b.mus, b.height, b.frame, b.bust, b.waist, b.hips, b.skin, b.hair].join(',');
}

export function randomBody(rng: () => number = Math.random, opts: { minAge?: number; maxAge?: number } = {}): Body {
  const sex: Sex = rng() < 0.5 ? 'm' : 'f';
  const minAge = opts.minAge ?? 18;
  const maxAge = opts.maxAge ?? 70;
  const r10 = (spread: number) => Math.round((rng() * 2 - 1) * spread);
  return {
    sex,
    age: Math.round(minAge + rng() * (maxAge - minAge)),
    fat: r10(7),
    mus: r10(6),
    height: r10(8),
    frame: r10(6),
    bust: r10(6),
    waist: r10(5),
    hips: r10(5),
    skin: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
    hair: HAIR_COLOURS[Math.floor(rng() * HAIR_COLOURS.length)],
  };
}
