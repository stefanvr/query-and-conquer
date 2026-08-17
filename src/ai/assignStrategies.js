/**
 * Design doc §9 "Assignment": "Strategy (Aggressive/Defensive/Balanced)
 * is auto-assigned per AI: build a list of the three strategies
 * repeated ceil(numAI / 3) times, truncate to numAI, shuffle, and
 * assign in order. This guarantees an even spread by construction
 * (e.g. 5 AI -> 2/2/1) with no separate balancing check needed."
 */
import { STRATEGY_NAMES } from "./strategies/index.js";
import { shuffle } from "../rng.js";

/**
 * @param {number} numAI
 * @param {() => number} rng - seeded PRNG (src/rng.js's mulberry32)
 * @returns {string[]} one strategy name per AI, in assignment order
 */
export function assignStrategies(numAI, rng) {
  const reps = Math.ceil(numAI / STRATEGY_NAMES.length);
  let list = [];
  for (let i = 0; i < reps; i++) list.push(...STRATEGY_NAMES);
  list = list.slice(0, numAI);
  return shuffle(rng, list);
}
