import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTurns, buildableUnitTypes, moveCost, BASE_BUILD_TIME, UNIT_TYPES } from "../../src/state/unit-types.js";

test("buildTurns applies the cost multiplier to bbt", () => {
  assert.equal(buildTurns("tank"), 1 * BASE_BUILD_TIME);
  assert.equal(buildTurns("carrier"), 8 * BASE_BUILD_TIME);
  assert.equal(buildTurns("bomber"), 5 * BASE_BUILD_TIME);
});

test("land base can build vehicles and planes, but not boats", () => {
  assert.deepEqual(buildableUnitTypes("land", false).sort(), ["bomber", "fighter", "tank"]);
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

test("every UNIT_TYPES entry has a full, sane stat block", () => {
  for (const [name, def] of Object.entries(UNIT_TYPES)) {
    assert.ok(["vehicle", "plane", "boat"].includes(def.category), `${name} category`);
    assert.ok(def.buildCostMultiplier > 0, `${name} buildCostMultiplier`);
    assert.ok(["ground", "air"].includes(def.targetType), `${name} targetType`);
    assert.ok(def.actionsPerTurn > 0, `${name} actionsPerTurn`);
    assert.ok(def.attacksPerTurn > 0, `${name} attacksPerTurn`);
    assert.ok(def.attackRange > 0, `${name} attackRange`);
    assert.equal(typeof def.needsLOS, "boolean", `${name} needsLOS`);
    assert.ok(def.view > 0, `${name} view`);
    assert.ok(def.strength > 0, `${name} strength`);
    assert.ok(def.groundAtk >= 0, `${name} groundAtk`);
    assert.ok(def.airAtk >= 0, `${name} airAtk`);
    for (const terrain of ["gras", "gravel", "mountain", "sand", "shallow", "deep"]) {
      assert.ok(terrain in def.moveCost, `${name} moveCost.${terrain}`);
    }
  }
});

test("moveCost returns the terrain's cost, or null if impassable", () => {
  assert.equal(moveCost("tank", "gras"), 1);
  assert.equal(moveCost("tank", "sand"), 3);
  assert.equal(moveCost("tank", "mountain"), null);
  assert.equal(moveCost("tank", "deep"), null);
  assert.equal(moveCost("fregat", "shallow"), 1);
  assert.equal(moveCost("fregat", "gras"), null);
});
