import { Channel } from '../bridge';
import type { Hand } from '../world/CharacterView';

/**
 * Touch controls → game. The React touch layer writes here; the scene reads it.
 * Coordinates are CSS pixels relative to the game container.
 */

export const touchStick = {
  /** Analogue direction, length 0..1 after deadzone remapping. */
  move: { x: 0, y: 0 },
  /** Unused: sprint is its own button now (the stick only walks). */
  sprint: false,
};

export type TouchCommand =
  | { kind: 'tap'; x: number; y: number }
  /** Finger held on the ground: walk there, then keep following it (see 'hold'/'release'). */
  | { kind: 'press'; x: number; y: number }
  | { kind: 'hold'; x: number; y: number }
  | { kind: 'release' }
  | { kind: 'zoom'; factor: number }
  | { kind: 'toggleCrouch' }
  | { kind: 'toggleSprint' }
  | { kind: 'toggleCombat' }
  | { kind: 'toggleLock' }
  | { kind: 'talk' }
  | { kind: 'punch'; hand: Hand };

export const touchCommands = new Channel<TouchCommand>();

/** Which input the player last used. Decides whether the mouse aims in combat. */
export type InputSource = 'mouse' | 'touch';
export const inputSourceChannel = new Channel<InputSource>();
