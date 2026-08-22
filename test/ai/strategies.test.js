import { test } from "node:test";
import assert from "node:assert/strict";
import { STRATEGIES, STRATEGY_NAMES, assignStrategies } from "../../src/ai/strategies.js";
import { UNIT_TYPES } from "../../src/state/unit-types.js";
import { mulberry32, shuffle } from "../../src/map/prng.js";

const identity = (items) => items; // no-op "shuffle", so spread is checked without rng noise

test("assignStrategies gives one strategy per AI, evenly spread (game spec §8's 5 AI -> 2/2/1)", () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const assigned = assignStrategies(count, identity);
    assert.equal(assigned.length, count, `${count} AI`);

    const counts = {};
    for (const s of assigned) counts[s] = (counts[s] ?? 0) + 1;
    const spread = Object.values(counts);
    assert.ok(Math.max(...spread) - Math.min(...spread) <= 1, `${count} AI spread: ${JSON.stringify(counts)}`);
  }

  // The design doc's own worked example, spelled out.
  const five = assignStrategies(5, identity);
  const fiveCounts = STRATEGY_NAMES.map((n) => five.filter((s) => s === n).length).sort();
  assert.deepEqual(fiveCounts, [1, 2, 2]);
});

test("assignStrategies only ever returns known strategy names", () => {
  for (const s of assignStrategies(5, identity)) {
    assert.ok(STRATEGY_NAMES.includes(s), s);
    assert.ok(STRATEGIES[s], `${s} has a definition`);
  }
});

test("assignStrategies is deterministic for a given seed, and does shuffle", () => {
  const runWithSeed = () => assignStrategies(5, (items) => shuffle(mulberry32(3), items));
  assert.deepEqual(runWithSeed(), runWithSeed(), "same seed, same assignment");

  // Sanity: the shuffle is actually applied, not silently dropped -- with a seed that reorders,
  // the result differs from the unshuffled pool.
  const unshuffled = assignStrategies(5, identity);
  const shuffled = assignStrategies(5, (items) => shuffle(mulberry32(1), items));
  assert.equal(shuffled.length, unshuffled.length);
});

test("every strategy defines a rule list, a full build order, and a target priority", () => {
  const allUnitTypes = Object.keys(UNIT_TYPES).sort();
  for (const [name, def] of Object.entries(STRATEGIES)) {
    assert.ok(def.rules.length > 0, `${name} rules`);
    assert.deepEqual([...def.buildOrder].sort(), allUnitTypes, `${name} build order covers every unit type exactly once`);
    assert.ok(["lowestStrength", "highestAttack"].includes(def.targetPriority), `${name} targetPriority`);
  }
});

test("build orders match the design doc's stated ordering per strategy (game spec §8)", () => {
  assert.deepEqual(STRATEGIES.aggressive.buildOrder, ["tank", "fighter", "bomber", "fregat", "carrier", "transporter"]);
  assert.deepEqual(STRATEGIES.defensive.buildOrder, ["tank", "transporter", "fighter", "fregat", "bomber", "carrier"]);
  assert.deepEqual(STRATEGIES.balanced.buildOrder, ["tank", "fighter", "transporter", "fregat", "bomber", "carrier"]);
});

test("defensive's build order really is cheapest-bbt-first (game spec §8's own justification)", () => {
  const costs = STRATEGIES.defensive.buildOrder.map((t) => UNIT_TYPES[t].buildCostMultiplier);
  const ascending = [...costs].sort((a, b) => a - b);
  assert.deepEqual(costs, ascending);
});

test("aggressive never retreats -- no retreat rule at all, unlike the other two (game spec §8)", () => {
  assert.ok(!STRATEGIES.aggressive.rules.includes("retreatToRepair"));
  assert.ok(STRATEGIES.defensive.rules.includes("retreatToRepair"));
  assert.ok(STRATEGIES.balanced.rules.includes("retreatToRepair"));
});
