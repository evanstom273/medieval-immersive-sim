/**
 * Waiting and sleeping (TES-style: pick how many hours). Direct control has
 * no fast-forward, so these are the one exception: while you wait or sleep,
 * time visibly speeds up, and stops the moment it ends. Your senses can cut
 * it short. Pure TypeScript.
 *
 * PLACEHOLDER numbers and rules throughout.
 */
import type { NoiseKind } from '../perception/senseRules';

export type RestKind = 'wait' | 'sleep';

/** How many times faster than normal time runs while resting. */
export const REST_SPEED = 60;
export const MAX_REST_HOURS = 24;

/** What a resting character perceived (a cut-down Perception, so this stays free of Phaser). */
export type RestStimulus =
  | { kind: 'sawAttack'; attacker: string; victim: string }
  | { kind: 'heardFight' }
  | { kind: 'heard'; noise: NoiseKind; audibility: number }
  | { kind: 'sensedPresence' }
  | { kind: 'smelledBlood' }
  | { kind: 'stench' }
  | { kind: 'hit'; by: string };

/**
 * How clearly (0..1) each noise must be heard to interrupt. Missing = never.
 * Sleeping takes more to rouse you than waiting does.
 */
export const INTERRUPT_AUDIBILITY: Record<RestKind, Partial<Record<NoiseKind, number>>> = {
  wait: { shout: 0, quarrel: 0.2, thud: 0.2, door: 0.7 },
  sleep: { shout: 0.3, quarrel: 0.5, thud: 0.5, door: 0.8 },
};

const NOISE_WORD: Partial<Record<NoiseKind, string>> = { shout: 'a shout', quarrel: 'raised voices', thud: 'a thud', door: 'a door bang' };

/** Does this cut the rest short? Returns what to tell the player, or null. */
export function interruptsRest(kind: RestKind, s: RestStimulus): string | null {
  const woken = kind === 'sleep';
  switch (s.kind) {
    case 'hit':
      return woken ? `You wake with a start: ${s.by} hit you!` : `${s.by} hits you!`;
    case 'sawAttack':
      // Eyes shut: sleepers see nothing.
      return woken ? null : `You see ${s.attacker} attack ${s.victim}.`;
    case 'heardFight':
      return woken ? 'The sound of fighting wakes you.' : 'You hear fighting and stop waiting.';
    case 'heard': {
      const need = INTERRUPT_AUDIBILITY[kind][s.noise];
      if (need === undefined || s.audibility < need) return null;
      const what = NOISE_WORD[s.noise] ?? 'a noise';
      return woken ? `You're woken by ${what}.` : `You hear ${what} and stop waiting.`;
    }
    case 'smelledBlood':
      return woken ? null : 'You smell blood and stop waiting.';
    default:
      return null;
  }
}
