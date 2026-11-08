/**
 * Simulation level of detail. People near the camera are simulated in full;
 * people off screen (beyond a margin) get a cheaper version of their life:
 * they still think, walk their routes, use doors, hear noises and witness
 * attacks (events), but don't look around every tick (sight, smell) or jostle
 * each other, and aren't drawn.
 */
export const detailSettings = {
  /** Off-screen people get the reduced tier. Off = everyone in full detail (worst case). */
  offscreenLod: true,
  /** How far beyond the edge of the screen full detail still reaches (metres). */
  marginM: 3,
};
