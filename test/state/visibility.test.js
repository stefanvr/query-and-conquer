import { test } from "node:test";
import assert from "node:assert/strict";
import { currentlyVisibleCells } from "../../src/state/visibility.js";
import { offsetKey, offsetDistance } from "../../src/map/hex-coords.js";
import { UNIT_TYPES } from "../../src/state/unit-types.js";
import { BASE_TYPES } from "../../src/state/base-types.js";

function state(overrides = {}) {
  return { map: { width: 30, height: 30 }, units: [], bases: [], ...overrides };
}

test("currentlyVisibleCells includes every cell within a field unit's own view radius", () => {
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 10, row: 10 };
  const s = state({ units: [unit] });
  const cells = currentlyVisibleCells(s, 0);
  assert.ok(cells.has(offsetKey(10, 10)), "the unit's own cell");
  // Every cell within UNIT_TYPES.tank.view of (10,10) should be present.
  let count = 0;
  for (let col = 0; col < 30; col++) {
    for (let row = 0; row < 30; row++) {
      const withinView = offsetDistance({ col: 10, row: 10 }, { col, row }) <= UNIT_TYPES.tank.view;
      assert.equal(cells.has(offsetKey(col, row)), withinView, `(${col},${row})`);
      if (withinView) count++;
    }
  }
  assert.equal(cells.size, count);
});

test("currentlyVisibleCells includes a base's own view radius", () => {
  const base = { id: 0, ownerId: 0, type: "mountain", col: 5, row: 5 };
  const s = state({ bases: [base] });
  const cells = currentlyVisibleCells(s, 0);
  assert.ok(cells.has(offsetKey(5, 5)));
  const farButInRange = offsetDistance({ col: 5, row: 5 }, { col: 5, row: 5 + BASE_TYPES.mountain.view }) <= BASE_TYPES.mountain.view;
  assert.equal(farButInRange, true, "sanity: straight-line distance == view radius should be in range");
});

test("currentlyVisibleCells ignores units/bases owned by other players", () => {
  const s = state({
    units: [{ id: 0, ownerId: 1, unitType: "tank", col: 10, row: 10 }],
    bases: [{ id: 0, ownerId: 1, type: "land", col: 12, row: 12 }],
  });
  assert.equal(currentlyVisibleCells(s, 0).size, 0);
});

test("currentlyVisibleCells excludes out-of-map cells (a view radius near the map edge)", () => {
  const s = state({
    map: { width: 5, height: 5 },
    units: [{ id: 0, ownerId: 0, unitType: "bomber", col: 0, row: 0 }], // view 8, way bigger than the map
  });
  const cells = currentlyVisibleCells(s, 0);
  for (const key of cells) {
    const [col, row] = key.split(",").map(Number);
    assert.ok(col >= 0 && col < 5 && row >= 0 && row < 5, `${key} is out of map bounds`);
  }
});

test("currentlyVisibleCells unions multiple sources (two units, a base)", () => {
  const s = state({
    units: [
      { id: 0, ownerId: 0, unitType: "tank", col: 2, row: 2 },
      { id: 1, ownerId: 0, unitType: "tank", col: 20, row: 20 },
    ],
    bases: [{ id: 0, ownerId: 0, type: "land", col: 10, row: 10 }],
  });
  const cells = currentlyVisibleCells(s, 0);
  assert.ok(cells.has(offsetKey(2, 2)));
  assert.ok(cells.has(offsetKey(20, 20)));
  assert.ok(cells.has(offsetKey(10, 10)));
});
