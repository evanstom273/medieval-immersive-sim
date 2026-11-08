import { Channel } from '../bridge';
import type { Hand } from '../world/CharacterView';

/**
 * Touch controls → game. The React touch layer writes here; the scene reads it.
 * Coordinates are CSS pixels relative to the game container.
 */

export const touchStick = {
  /** Analogue direction, length 0..1 after deadzone remapping. */
  move: { x: 0, y: 0 },
  /** Stick pushed to the rim. */
  sprint: false,
};

export type TouchCommand =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'toggleCrouch' }
  | { kind: 'toggleCombat' }
  | { kind: 'toggleLock' }
  | { kind: 'punch'; hand: Hand };

export const touchCommands = new Channel<TouchCommand>();

/** Which input the player last used. Decides whether the mouse aims in combat. */
export type InputSource = 'mouse' | 'touch';
export const inputSourceChannel = new Channel<InputSource>();
