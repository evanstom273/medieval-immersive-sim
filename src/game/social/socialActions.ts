/**
 * Social actions and their outcomes. PLACEHOLDER rules, Sims-style: pick an
 * action, it lands well or badly depending on how the other person already
 * feels about you (and, for hostile ones, their temperament), and both
 * opinions shift. Pure TypeScript.
 */
import type { Temperament } from '../combat/combat';
import type { Rng } from '../util/rng';

export type SocialActionId = 'chat' | 'joke' | 'compliment' | 'embrace' | 'argue' | 'insult';

export interface SocialAction {
  id: SocialActionId;
  label: string;
  icon: string;
  hostile: boolean;
}

export const SOCIAL_ACTIONS: SocialAction[] = [
  { id: 'chat', label: 'Chat', icon: '💬', hostile: false },
  { id: 'joke', label: 'Joke', icon: '😄', hostile: false },
  { id: 'compliment', label: 'Compliment', icon: '🌼', hostile: false },
  { id: 'embrace', label: 'Embrace', icon: '🤗', hostile: false },
  { id: 'argue', label: 'Argue', icon: '❗', hostile: true },
  { id: 'insult', label: 'Insult', icon: '💢', hostile: true },
];

export const socialAction = (id: SocialActionId): SocialAction => SOCIAL_ACTIONS.find((a) => a.id === id)!;

export type Reaction = 'pleased' | 'amused' | 'neutral' | 'awkward' | 'annoyed' | 'hurt' | 'angry';

export const REACTION_ICON: Record<Reaction, string> = {
  pleased: '😊',
  amused: '😂',
  neutral: '😐',
  awkward: '😬',
  annoyed: '😒',
  hurt: '😢',
  angry: '😠',
};

export interface SocialOutcome {
  /** Did it land well? */
  success: boolean;
  reaction: Reaction;
  /** Change to the target's opinion of the actor. */
  targetDelta: number;
  /** Change to the actor's opinion of the target. */
  actorDelta: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Chance a friendly action lands, from the target's opinion of the actor (−100…100). */
export function successChance(id: SocialActionId, opinion: number): number {
  switch (id) {
    case 'chat':
      return clamp(0.75 + opinion / 200, 0.2, 0.95);
    case 'joke':
      return clamp(0.55 + opinion / 150, 0.1, 0.9);
    case 'compliment':
      return clamp(0.65 + opinion / 150, 0.15, 0.92);
    case 'embrace':
      // Only welcome from people you're already fond of.
      return opinion < 30 ? 0.08 : clamp(0.5 + (opinion - 30) / 100, 0.5, 0.95);
    default:
      return 1;
  }
}

/**
 * @param opinion  the target's current opinion of the actor
 */
export function resolveSocial(id: SocialActionId, opinion: number, targetTemperament: Temperament, rng: Rng): SocialOutcome {
  switch (id) {
    case 'argue':
      return targetTemperament === 'bold'
        ? { success: true, reaction: 'angry', targetDelta: -8, actorDelta: -5 }
        : { success: true, reaction: 'annoyed', targetDelta: -6, actorDelta: -4 };
    case 'insult':
      return targetTemperament === 'bold'
        ? { success: true, reaction: 'angry', targetDelta: -15, actorDelta: -5 }
        : { success: true, reaction: 'hurt', targetDelta: -12, actorDelta: -3 };
  }
  const success = rng() < successChance(id, opinion);
  switch (id) {
    case 'chat':
      return success
        ? { success, reaction: 'pleased', targetDelta: 3, actorDelta: 2 }
        : { success, reaction: 'neutral', targetDelta: -1, actorDelta: 0 };
    case 'joke':
      return success
        ? { success, reaction: 'amused', targetDelta: 6, actorDelta: 3 }
        : { success, reaction: 'awkward', targetDelta: -3, actorDelta: -1 };
    case 'compliment':
      return success
        ? { success, reaction: 'pleased', targetDelta: 7, actorDelta: 2 }
        : { success, reaction: 'awkward', targetDelta: -2, actorDelta: 0 };
    case 'embrace':
      return success
        ? { success, reaction: 'pleased', targetDelta: 8, actorDelta: 5 }
        : { success, reaction: 'annoyed', targetDelta: -8, actorDelta: -3 };
  }
}

/** Past tense line for the message log, e.g. "Agnes jokes with Wat. Wat laughs." */
export function describeSocial(id: SocialActionId, actor: string, target: string, o: SocialOutcome): string {
  const verb: Record<SocialActionId, string> = {
    chat: `${actor} chats with ${target}.`,
    joke: `${actor} tells ${target} a joke.`,
    compliment: `${actor} compliments ${target}.`,
    embrace: `${actor} embraces ${target}.`,
    argue: `${actor} argues with ${target}.`,
    insult: `${actor} insults ${target}.`,
  };
  const reaction: Record<Reaction, string> = {
    pleased: `${target} is pleased.`,
    amused: `${target} laughs.`,
    neutral: `${target} isn't very interested.`,
    awkward: `It falls flat.`,
    annoyed: `${target} is annoyed.`,
    hurt: `${target} looks hurt.`,
    angry: `${target} is furious.`,
  };
  return `${verb[id]} ${reaction[o.reaction]}`;
}
