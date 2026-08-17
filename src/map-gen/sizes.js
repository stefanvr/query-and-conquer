/**
 * Map size/type presets (design doc §1 "Generation").
 *
 * ASSUMPTION (flagged in the implementation plan as an open call): the
 * doc's "multiplier of min size" table is read as an AREA multiplier,
 * not a per-dimension one. Squaring the multiplier's square root onto
 * the 40x40 minimum keeps map cell counts (and therefore checked-in
 * JSON size, render cost, and main-thread AI cost -- already an
 * accepted v1 risk per tech-stack.md) in a reasonable range. A literal
 * per-dimension reading would make Extra Large 320x320 (~102k cells),
 * which is unreasonable to check 10 candidates of into git and to
 * simulate turn-by-turn on the main thread.
 */

export const MIN_DIM = 40;

/** Size name -> area multiplier relative to the 40x40 minimum. */
export const MAP_SIZES = {
  small: 1,
  medium: 3,
  large: 5,
  "extra-large": 8,
};

export const MAP_TYPES = ["islands", "land-only", "mixed"];

export const CANDIDATES_PER_COMBO = 10;

/**
 * Square grid side length for a given area multiplier, rounded to the
 * nearest integer.
 * @param {number} multiplier
 * @returns {number}
 */
export function dimensionForMultiplier(multiplier) {
  return Math.round(MIN_DIM * Math.sqrt(multiplier));
}
