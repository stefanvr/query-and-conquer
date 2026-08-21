import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTurns, buildableUnitTypes, BASE_BUILD_TIME, UNIT_TYPES } from "../../src/state/unit-types.js";

test("buildTurns applies the cost multiplier to bbt", () => {
  assert.equal(buildTurns("tank"), 1 * BASE_BUILD_TIME);
  assert.equal(buildTurns("carrier"), 8 * BASE_BUILD_TIME);
  assert.equal(buildTurns("bomber"), 5 * BASE_BUILD_TIME);
});

test("land base can only build vehicles", () => {
  assert.deepEqual(buildableUnitTypes("land", false), ["tank"]);
});

test("mountain base can only build planes", () => {
  assert.deepEqual(buildableUnitTypes("mountain", false).sort(), ["bomber", "fighter"]);
});

test("port base can build vehicles and boats, but carrier only if adjacent to deep water", () => {
  const withoutDeep = buildableUnitTypes("port", false);
  assert.ok(!withoutDeep.includes("carrier"));
  assert.ok(withoutDeep.includes("tank"));
  assert.ok(withoutDeep.includes("fregat"));

  const withDeep = buildableUnitTypes("port", true);
  assert.ok(withDeep.includes("carrier"));
});

test("every UNIT_TYPES entry has a category and a positive cost multiplier", () => {
  for (const [name, def] of Object.entries(UNIT_TYPES)) {
    assert.ok(["vehicle", "plane", "boat"].includes(def.category), `${name} category`);
    assert.ok(def.buildCostMultiplier > 0, `${name} cost`);
  }
});
