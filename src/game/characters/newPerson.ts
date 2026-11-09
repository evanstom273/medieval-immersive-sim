/**
 * The person made in character creation, and how they join the world.
 */

import { buildOf, defaultBody, MIN_PLAYABLE_AGE, type Body } from './body';
import type { CharacterDef } from './Character';
import { MOCK_PROFILES, SKILLS, type MockProfile } from './mockProfiles';

export interface NewPerson {
  name: string;
  body: Body;
}

/** Where the game finds them (Phaser's game registry). */
export const PLAYER_REGISTRY_KEY = 'newPerson';

export const PLAYER_ID = 'you';

/** PLACEHOLDER: clothing isn't chosen yet, so everyone made in creation wears this. */
const PLAYER_CLOTHES = 0x7b5e3b;

const STORAGE_KEY = 'mis.newPerson';

export const NAME_IDEAS = ['Alys', 'Joan', 'Cecily', 'Isabel', 'Emma', 'Margery', 'Hugh', 'Roger', 'Walter', 'Geoffrey', 'Robert', 'Hamo'];

/** The last person made (so testing doesn't mean rebuilding them every time), or a fresh one. */
export function loadNewPerson(): NewPerson {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as NewPerson;
      if (p && typeof p.name === 'string' && p.body) return { name: p.name, body: { ...defaultBody(p.body.sex), ...p.body, age: Math.max(MIN_PLAYABLE_AGE, p.body.age ?? 30) } };
    }
  } catch {
    /* storage unavailable or junk */
  }
  return { name: NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)], body: defaultBody('m') };
}

export function saveNewPerson(p: NewPerson): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

/** Their character definition, plus a PLACEHOLDER profile for the character panel. */
export function playerDef(p: NewPerson, x: number, y: number): CharacterDef {
  const profile: MockProfile = {
    age: p.body.age,
    build: buildOf(p.body),
    occupation: 'Newcomer',
    traits: [],
    background: 'Made in character creation. (PLACEHOLDER: no background, traits or skills chosen yet.)',
    needs: { hunger: 0.7, rest: 0.7, warmth: 0.7, comfort: 0.7, hygiene: 0.7, social: 0.7 },
    skills: Object.fromEntries(SKILLS.map((s) => [s.id, { level: 1, progress: 0 }])),
  };
  MOCK_PROFILES[PLAYER_ID] = profile;
  return {
    id: PLAYER_ID,
    name: p.name.trim() || 'Newcomer',
    temperament: 'bold',
    palette: { tunic: PLAYER_CLOTHES, hair: parseInt(p.body.hair.slice(1), 16) },
    body: p.body,
    x,
    y,
  };
}
