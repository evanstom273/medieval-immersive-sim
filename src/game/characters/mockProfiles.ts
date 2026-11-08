/**
 * PLACEHOLDER character profile data for the character panel: needs, skills,
 * age, traits and background. Static mock values only, to settle the panel's
 * layout and content. Mostly not simulated yet; the exceptions are build,
 * traits and the Labour skill, which decide how hard someone is to shove
 * (see movement/shove.ts).
 *
 * Health, temperament, relationships and memories in the panel are live and
 * come from the simulation, not from here.
 */

import type { Build } from '../movement/shove';

export type NeedId = 'hunger' | 'rest' | 'warmth' | 'comfort' | 'hygiene' | 'social';

export interface NeedDef {
  id: NeedId;
  label: string;
  icon: string;
}

export const NEEDS: NeedDef[] = [
  { id: 'hunger', label: 'Hunger', icon: '🍞' },
  { id: 'rest', label: 'Rest', icon: '💤' },
  { id: 'warmth', label: 'Warmth', icon: '🔥' },
  { id: 'comfort', label: 'Comfort', icon: '🪑' },
  { id: 'hygiene', label: 'Hygiene', icon: '🫧' },
  { id: 'social', label: 'Company', icon: '🗣️' },
];

export type SkillGroup = 'Body' | 'Mind & tongue' | 'Trades';

export interface SkillDef {
  id: string;
  label: string;
  icon: string;
  group: SkillGroup;
}

export const SKILLS: SkillDef[] = [
  { id: 'brawling', label: 'Brawling', icon: '👊', group: 'Body' },
  { id: 'stealth', label: 'Stealth', icon: '🤫', group: 'Body' },
  { id: 'labour', label: 'Labour', icon: '💪', group: 'Body' },
  { id: 'persuasion', label: 'Persuasion', icon: '🗣️', group: 'Mind & tongue' },
  { id: 'haggling', label: 'Haggling', icon: '🪙', group: 'Mind & tongue' },
  { id: 'letters', label: 'Letters', icon: '📜', group: 'Mind & tongue' },
  { id: 'baking', label: 'Baking', icon: '🥖', group: 'Trades' },
  { id: 'smithing', label: 'Smithing', icon: '⚒️', group: 'Trades' },
  { id: 'farming', label: 'Farming', icon: '🌾', group: 'Trades' },
  { id: 'carpentry', label: 'Carpentry', icon: '🪚', group: 'Trades' },
];

export interface SkillValue {
  /** 0–10 */
  level: number;
  /** Progress to the next level, 0–1. */
  progress: number;
}

export interface MockProfile {
  age: number;
  /** Height and weight (PLACEHOLDER). */
  build: Build;
  occupation: string;
  traits: string[];
  background: string;
  /** 0 (desperate) – 1 (fully satisfied). */
  needs: Record<NeedId, number>;
  skills: Record<string, SkillValue>;
}

const s = (level: number, progress = 0.3): SkillValue => ({ level, progress });

export const MOCK_PROFILES: Record<string, MockProfile> = {
  edric: {
    build: { heightM: 1.75, weightKg: 80 },
    age: 34,
    occupation: 'Carter',
    traits: ['Hot-headed', 'Loyal', 'Hard-working'],
    background: 'Hauls goods between the mill and the market. Quick to take offence, quicker to make amends.',
    needs: { hunger: 0.55, rest: 0.7, warmth: 0.8, comfort: 0.5, hygiene: 0.35, social: 0.6 },
    skills: { brawling: s(5, 0.6), stealth: s(1), labour: s(6, 0.2), persuasion: s(2), haggling: s(3, 0.7), letters: s(0, 0), baking: s(0, 0), smithing: s(1), farming: s(2), carpentry: s(3, 0.5) },
  },
  agnes: {
    build: { heightM: 1.62, weightKg: 58 },
    age: 27,
    occupation: 'Alewife',
    traits: ['Gentle', 'Observant', 'Gossip'],
    background: 'Brews and sells ale from her front room. Hears everything; repeats most of it.',
    needs: { hunger: 0.8, rest: 0.45, warmth: 0.6, comfort: 0.7, hygiene: 0.8, social: 0.9 },
    skills: { brawling: s(0, 0.1), stealth: s(2), labour: s(3), persuasion: s(5, 0.4), haggling: s(6, 0.8), letters: s(1, 0.6), baking: s(4), smithing: s(0, 0), farming: s(2), carpentry: s(0, 0) },
  },
  maud: {
    build: { heightM: 1.57, weightKg: 54 },
    age: 52,
    occupation: 'Widow, spinner',
    traits: ['Cautious', 'Shrewd', 'Devout'],
    background: 'Outlived two husbands and most of her patience. Spins wool and keeps her own counsel.',
    needs: { hunger: 0.4, rest: 0.6, warmth: 0.3, comfort: 0.45, hygiene: 0.7, social: 0.35 },
    skills: { brawling: s(0, 0), stealth: s(4, 0.5), labour: s(2), persuasion: s(4), haggling: s(7, 0.2), letters: s(3, 0.4), baking: s(5, 0.9), smithing: s(0, 0), farming: s(4), carpentry: s(1) },
  },
  wat: {
    build: { heightM: 1.86, weightKg: 96 },
    age: 19,
    occupation: "Smith's apprentice",
    traits: ['Brash', 'Cheerful', 'Strong'],
    background: 'Apprenticed at the forge. Big hands, bigger appetite, and an opinion on everything.',
    needs: { hunger: 0.25, rest: 0.85, warmth: 0.9, comfort: 0.6, hygiene: 0.2, social: 0.75 },
    skills: { brawling: s(4, 0.3), stealth: s(0, 0.4), labour: s(7, 0.1), persuasion: s(1), haggling: s(1), letters: s(0, 0), baking: s(0, 0), smithing: s(3, 0.75), farming: s(1), carpentry: s(1) },
  },
};
