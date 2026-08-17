/**
 * Small seedable PRNG (mulberry32). Reproducible from a stored seed --
 * originally added for map generation (deterministic candidates), and
 * reused from Stage 4 on for base placement, so any procedural setup
 * step can be re-run deterministically from a seed rather than relying
 * on Math.random(). Lives at src/ (not under map-gen/) because it's a
 * generic utility, not map-gen-specific.
 */

/**
 * @param {number} seed - 32-bit integer seed
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rng
 * @param {number} min - inclusive
 * @param {number} max - exclusive
 * @returns {number} integer in [min, max)
 */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

/**
 * @param {() => number} rng
 * @param {Array<any>} arr
 * @returns {any}
 */
export function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length)];
}

/**
 * Fisher-Yates shuffle, in place.
 * @param {() => number} rng
 * @param {Array<any>} arr
 * @returns {Array<any>} the same array, shuffled
 */
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
