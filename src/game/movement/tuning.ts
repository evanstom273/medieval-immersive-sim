/**
 * World scale for the placeholder prototype.
 *
 * 1 world unit = 1 world pixel (per the art spec). How many pixels make a metre
 * is NOT decided yet — this is a placeholder so movement can be tuned in
 * real-world units (m/s) and converted once the art scale is settled.
 */
export const PX_PER_METRE = 64;

/** Movement tuning, in real-world units. Mutable so the debug panel can live-edit it. */
export interface MovementTuning {
  /** m/s */
  crouchSpeed: number;
  /** m/s */
  walkSpeed: number;
  /** m/s */
  sprintSpeed: number;
  /** m/s² — how quickly velocity moves toward the desired velocity while there's input. */
  acceleration: number;
  /** m/s² — how quickly velocity bleeds off with no input. */
  deceleration: number;
  /** deg/s — turn rate when facing follows movement. */
  turnRateExplore: number;
  /** deg/s — turn rate when facing follows the mouse (combat). */
  turnRateCombat: number;
}

export const DEFAULT_TUNING: Readonly<MovementTuning> = {
  crouchSpeed: 0.9,
  walkSpeed: 1.7,
  sprintSpeed: 4.4,
  acceleration: 14,
  deceleration: 18,
  turnRateExplore: 600,
  turnRateCombat: 900,
};

/** The live tuning object shared by the game and the debug panel. */
export const tuning: MovementTuning = { ...DEFAULT_TUNING };
