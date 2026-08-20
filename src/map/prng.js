// Seeded PRNG (mulberry32) — used by map generation so a given seed always reproduces the same
// candidate map. No external dependency; deliberately small.

/** @param {number} seed @returns {() => number} a function producing floats in [0, 1) */
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

/** @param {() => number} rng @param {number} minInclusive @param {number} maxExclusive */
export function randInt(rng, minInclusive, maxExclusive) {
  return minInclusive + Math.floor(rng() * (maxExclusive - minInclusive));
}

/** @param {() => number} rng @param {Array} items */
export function pick(rng, items) {
  return items[randInt(rng, 0, items.length)];
}

/** @param {() => number} rng @param {Array} items @returns {Array} a new shuffled array */
export function shuffle(rng, items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
