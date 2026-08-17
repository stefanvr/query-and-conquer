/**
 * Small seedable PRNG (mulberry32) so map generation is reproducible
 * from a stored seed -- deterministic regeneration is convenient for
 * debugging a specific candidate without needing Math.random(), which
 * this project's Workflow tooling also can't use for the same reason
 * (see the "no Date.now()/Math.random()" note in Workflow scripts;
 * generation itself isn't run inside one, but the same "reproducible
 * output from a stored seed" property is worth having regardless).
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
