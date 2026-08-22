import { test } from "node:test";
import assert from "node:assert/strict";
import { getVisibleState } from "../../src/state/queries.js";
import { offsetKey } from "../../src/map/hex-coords.js";

function state(overrides = {}) {
  return {
    options: { fogOfWar: true },
    map: { width: 30, height: 30 },
    players: [{ id: 0, exploredCells: [] }, { id: 1, exploredCells: [] }],
    units: [],
    bases: [],
    ...overrides,
  };
}

test("getVisibleState is a pure passthrough when fogOfWar is off", () => {
  const s = state({ options: { fogOfWar: false }, units: [{ id: 0, ownerId: 1, col: 20, row: 20 }] });
  const visible = getVisibleState(s, 0);
  assert.equal(visible, s, "same object, no filtering at all");
});

test("getVisibleState hides an enemy unit outside current view, shows one inside it", () => {
  const s = state({
    units: [
      { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5 },
      { id: 1, ownerId: 1, unitType: "tank", col: 6, row: 5 }, // adjacent -- within tank's view 3
      { id: 2, ownerId: 1, unitType: "tank", col: 25, row: 25 }, // far away
    ],
  });
  const visible = getVisibleState(s, 0);
  const ids = visible.units.map((u) => u.id);
  assert.deepEqual(ids.sort(), [0, 1]);
});

test("getVisibleState keeps a base visible once its cell is explored, even out of current view", () => {
  const s = state({
    players: [{ id: 0, exploredCells: [offsetKey(20, 20)] }],
    bases: [{ id: 0, ownerId: 1, type: "land", col: 20, row: 20 }],
  });
  const visible = getVisibleState(s, 0);
  assert.equal(visible.bases.length, 1, "explored earlier -- still shown even though nothing of the viewer's is nearby now");
});

test("getVisibleState hides a base whose cell was never explored", () => {
  const s = state({ bases: [{ id: 0, ownerId: 1, type: "land", col: 20, row: 20 }] });
  const visible = getVisibleState(s, 0);
  assert.equal(visible.bases.length, 0);
});

test("getVisibleState's fog.exploredCells includes currently-visible cells even before they're persisted", () => {
  const s = state({ units: [{ id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5 }] }); // exploredCells still []
  const visible = getVisibleState(s, 0);
  assert.ok(visible.fog.exploredCells.has(offsetKey(5, 5)));
  assert.ok(visible.fog.visibleCells.has(offsetKey(5, 5)));
});
