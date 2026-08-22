// The three AI strategies as pure data — game spec §8's Strategies section, one entry per
// strategy. Strategy defines *intent* (which rules, in which order); difficulty defines
// *execution quality* (how well they're carried out) — two independent axes, so this file knows
// nothing about easy vs. hard, and ai-turn.js's rule implementations are shared by both.
//
// `rules` are identifiers the turn engine dispatches on (ai-turn.js's RULES table), in priority
// order: a unit walks the list top to bottom and takes the first applicable action.

/** Strategy names, in the fixed order the even-spread assignment repeats them (game spec §8). */
export const STRATEGY_NAMES = ["aggressive", "defensive", "balanced"];

export const STRATEGIES = {
  aggressive: {
    rules: ["attackInRange", "advanceToNearestEnemy", "exploreOrExpand"],
    // "Never retreats" (game spec §8) needs no rule of its own — it's the *absence* of a
    // retreatToRepair rule, unlike the other two strategies.
    buildOrder: ["tank", "fighter", "bomber", "fregat", "carrier", "transporter"],
    targetPriority: "lowestStrength",
  },
  defensive: {
    // Game spec §8's rule 4 ("idle... takes no action") isn't a rule here: it's what already
    // happens when every rule above falls through, since rule 5's expand is itself conditional on
    // being capture-eligible with a known unclaimed base. Listing it would be a no-op that can
    // never be reached.
    rules: ["retreatToRepair", "attackThreatToBase", "holdNearBase", "expandToUnclaimedBase"],
    buildOrder: ["tank", "transporter", "fighter", "fregat", "bomber", "carrier"], // cheapest bbt first
    targetPriority: "highestAttack",
  },
  balanced: {
    rules: ["retreatToRepair", "attackInRange", "expandToUnclaimedBase", "advanceKeepingBaseHeld"],
    buildOrder: ["tank", "fighter", "transporter", "fregat", "bomber", "carrier"],
    targetPriority: "lowestStrength",
  },
};

/** One strategy per AI, evenly spread by construction (game spec §8): the three names repeated
 * `ceil(count / 3)` times, truncated to `count`, shuffled. E.g. 5 AI -> 2/2/1, with no separate
 * balancing check needed. `shuffle` is passed in rather than imported so this stays free of the
 * rng module and the caller keeps control of determinism. */
export function assignStrategies(count, shuffleFn) {
  const repeats = Math.ceil(count / 3);
  const pool = [];
  for (let i = 0; i < repeats; i++) pool.push(...STRATEGY_NAMES);
  return shuffleFn(pool.slice(0, count));
}
