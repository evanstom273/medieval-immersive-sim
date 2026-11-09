/**
 * How someone decides what to do about their needs: every object nearby
 * advertises what its actions give (see world/furniture.ts), and each action
 * is scored by how much it would help the needs that are pressing, how far
 * away it is, and the time of day (a simple routine: sleep at night, eat at
 * mealtimes). Pure; the brain picks the best and goes.
 *
 * PLACEHOLDER weights. Personality (traits) will weight this later.
 */

import type { Offer } from '../world/furniture';
import { MOODLETS, NEED_IDS, type Needs } from './needs';

/** How much a need's level presses: little when nearly full, a lot when low, very steeply near empty. */
export function urgency(v: number): number {
  return (1 - v) * (1 - v) + (v < 0.3 ? (0.3 - v) * 4 : 0);
}

const MEALTIMES = [7, 12, 18];

/** The routine's pull on an action at this hour. */
export function routineFactor(offer: Offer, needs: Needs, hour: number): number {
  const night = hour >= 21 || hour < 6;
  if (offer.posture === 'lie') {
    if (night) return needs.rest < 0.9 ? 3 : 0.5;
    // Daytime naps only when really tired.
    return needs.rest < 0.25 ? 1 : 0.15;
  }
  if (offer.gains.hunger && MEALTIMES.some((m) => Math.abs(hour - m) < 1) && needs.hunger < 0.85) return 1.6;
  // At night, people stay in rather than wander off to sit or warm up.
  return night ? 0.6 : 1;
}

/** Score an action: relief to pressing needs, scaled by routine, discounted by distance (metres). */
export function scoreOffer(offer: Offer, needs: Needs, distanceM: number, hour: number): number {
  let relief = 0;
  for (const id of NEED_IDS) {
    const g = offer.gains[id];
    if (!g) continue;
    const gained = Math.min(g * offer.hours, 1 - needs[id]);
    relief += urgency(needs[id]) * gained;
  }
  // How it'll feel counts too (a bed beats straw), but only once there's a reason to go at all.
  const feeling = relief > 0.01 && offer.moodlet ? MOODLETS[offer.moodlet].value * 0.004 : 0;
  return ((relief + feeling) * routineFactor(offer, needs, hour)) / (1 + distanceM / 25);
}

/** Below this, nothing's worth going out of their way for: they do something ordinary instead. */
export const WORTH_DOING = 0.04;
