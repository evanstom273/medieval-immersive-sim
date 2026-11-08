/**
 * Basic combat rules. PLACEHOLDER numbers. Pure TypeScript.
 */
import type { Hand } from '../world/CharacterView';

export type Temperament = 'bold' | 'wary' | 'meek';
export type AttackResponse = 'fight' | 'flee' | 'yield';

export interface TemperamentRules {
  label: string;
  description: string;
  /** What they do when attacked, while they still have the stomach for it. */
  response: AttackResponse;
  /** Yield once health falls to this fraction (1 = yields at once). */
  yieldAt: number;
}

export const TEMPERAMENTS: Record<Temperament, TemperamentRules> = {
  bold: { label: 'Bold', description: 'Fights back when attacked.', response: 'fight', yieldAt: 0.25 },
  wary: { label: 'Wary', description: 'Runs when attacked; fights if cornered.', response: 'flee', yieldAt: 0.45 },
  meek: { label: 'Meek', description: 'Yields rather than fight.', response: 'yield', yieldAt: 1 },
};

export const MAX_HEALTH = 100;
export const PUNCH_DAMAGE: Record<Hand, number> = { right: 9, left: 6 };
/** How much being hit sours the victim's opinion of the attacker, per hit. */
export const HIT_OPINION = -10;

/** How someone responds to being attacked, given their temperament and state. */
export function reactToAttack(t: Temperament, healthFraction: number, cornered: boolean): AttackResponse {
  const rules = TEMPERAMENTS[t];
  if (healthFraction <= rules.yieldAt) return 'yield';
  if (rules.response === 'flee' && cornered) return 'fight';
  return rules.response;
}
