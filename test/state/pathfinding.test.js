import { test } from "node:test";
import assert from "node:assert/strict";
import { reachableCells } from "../../src/state/pathfinding.js";
import { TerrainGrid } from "../../src/map/grid.js";
import { offsetKey, offsetDistance } from "../../src/map/hex-coords.js";
import { UNIT_TYPES } from "../../src/state/unit-types.js";

const SIZE = 15;

function state(overrides = {}) {
  return { map: { width: SIZE, height: SIZE }, units: [], bases: [], ...overrides };
}

function grasGrid() {
  const grid = new TerrainGrid(SIZE, SIZE, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "gras");
  return grid;
}

function tank(overrides = {}) {
  return {
    id: 1,
    ownerId: 0,
    unitType: "tank",
    col: 7,
    row: 7,
    sp: 10,
    maxSp: 10,
    remainingActions: UNIT_TYPES.tank.actionsPerTurn,
    ...overrides,
  };
}

test("reach on open gras covers exactly the hexes within the unit's AP budget", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 3 }); // gras costs 1, so reach == 3 hex-steps
  s.units.push(unit);

  const reached = reachableCells(s, grid, unit);

  for (const { col, row } of grid.cells()) {
    const distance = offsetDistance(unit, { col, row });
    const isSelf = distance === 0;
    const expected = !isSelf && distance <= 3;
    assert.equal(reached.has(offsetKey(col, row)), expected, `(${col},${row}) at distance ${distance}`);
  }
});

test("the unit's own hex is never part of its reach", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank();
  s.units.push(unit);

  assert.equal(reachableCells(s, grid, unit).has(offsetKey(unit.col, unit.row)), false);
});

test("a unit with no actions left can reach nothing", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 0 });
  s.units.push(unit);

  assert.equal(reachableCells(s, grid, unit).size, 0);
});

test("cost follows terrain, not distance -- expensive ground shrinks reach in that direction", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 3 });
  s.units.push(unit);
  const [firstNeighbor] = grid.neighborsOf(unit.col, unit.row);
  grid.set(firstNeighbor.col, firstNeighbor.row, "sand"); // tank: sand costs 3, gras 1

  const reached = reachableCells(s, grid, unit);
  const entry = reached.get(offsetKey(firstNeighbor.col, firstNeighbor.row));

  assert.ok(entry, "still reachable -- 3 AP exactly covers it");
  assert.equal(entry.cost, 3, "charged sand's cost, not one step");
});

test("impassable terrain is neither entered nor routed through", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 5 });
  s.units.push(unit);
  // Wall the unit in completely: a tank can't cross mountain at all (game spec §3).
  for (const n of grid.neighborsOf(unit.col, unit.row)) grid.set(n.col, n.row, "mountain");

  assert.equal(reachableCells(s, grid, unit).size, 0, "boxed in by impassable terrain");
});

test("occupied hexes block routing -- another unit or a base is neither a destination nor a corridor", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 5 });
  s.units.push(unit);

  const neighbors = grid.neighborsOf(unit.col, unit.row);
  s.units.push(tank({ id: 2, col: neighbors[0].col, row: neighbors[0].row }));
  s.bases.push({ id: 0, ownerId: 0, col: neighbors[1].col, row: neighbors[1].row, type: "land" });

  const reached = reachableCells(s, grid, unit);

  assert.equal(reached.has(offsetKey(neighbors[0].col, neighbors[0].row)), false, "another unit isn't a destination");
  assert.equal(reached.has(offsetKey(neighbors[1].col, neighbors[1].row)), false, "a base isn't a destination");
});

test("a route walled off except for a detour still resolves, at the detour's real cost", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 5 });
  s.units.push(unit);

  // Block the straight-line neighbor toward a target two steps away, leaving the way around open.
  const [straightOn] = grid.neighborsOf(unit.col, unit.row);
  const target = grid.neighborsOf(straightOn.col, straightOn.row)[0];
  grid.set(straightOn.col, straightOn.row, "mountain");

  const reached = reachableCells(s, grid, unit);
  const entry = reached.get(offsetKey(target.col, target.row));

  assert.ok(entry, "reached it the long way round");
  assert.ok(entry.cost > 2, `detour costs more than the blocked straight line (${entry.cost})`);
  assert.ok(
    !entry.path.some((p) => p.col === straightOn.col && p.row === straightOn.row),
    "and the route avoids the impassable hex entirely",
  );
});

test("each entry carries a walkable route: adjacent steps, ending on the destination, excluding the start", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 4 });
  s.units.push(unit);

  const reached = reachableCells(s, grid, unit);

  for (const entry of reached.values()) {
    assert.ok(entry.path.length > 0, "non-empty");
    const last = entry.path[entry.path.length - 1];
    assert.deepEqual([last.col, last.row], [entry.col, entry.row], "ends on the destination");
    assert.ok(
      !entry.path.some((p) => p.col === unit.col && p.row === unit.row),
      "never includes the unit's own starting hex",
    );

    let previous = { col: unit.col, row: unit.row };
    for (const step of entry.path) {
      assert.equal(offsetDistance(previous, step), 1, "each step is to an adjacent hex");
      previous = step;
    }
  }
});

test("a route's step costs sum to exactly its reported cost", () => {
  const s = state();
  const grid = grasGrid();
  // Mixed terrain, so this isn't trivially true via every step costing 1.
  for (const { col, row } of grid.cells()) {
    if ((col + row) % 3 === 0) grid.set(col, row, "gravel"); // tank: 2
  }
  const unit = tank({ remainingActions: 5 });
  s.units.push(unit);

  const reached = reachableCells(s, grid, unit);
  assert.ok(reached.size > 0);

  for (const entry of reached.values()) {
    const summed = entry.path.reduce((total, step) => total + UNIT_TYPES.tank.moveCost[grid.get(step.col, step.row)], 0);
    assert.equal(summed, entry.cost, `route to (${entry.col},${entry.row})`);
    assert.ok(entry.cost <= unit.remainingActions, "and never exceeds the budget");
  }
});

test("a boat's reach follows water, not land", () => {
  const s = state();
  const grid = grasGrid();
  const fregat = { id: 1, ownerId: 0, unitType: "fregat", col: 7, row: 7, remainingActions: 3 };
  s.units.push(fregat);
  // A single water hex adjacent to the boat; everything else stays gras (impassable for a boat).
  const [water] = grid.neighborsOf(7, 7);
  grid.set(7, 7, "shallow");
  grid.set(water.col, water.row, "shallow");

  const reached = reachableCells(s, grid, fregat);

  assert.deepEqual([...reached.keys()], [offsetKey(water.col, water.row)], "only the one water hex");
});

test("reachableCells never mutates the state or the unit it's given", () => {
  const s = state();
  const grid = grasGrid();
  const unit = tank({ remainingActions: 4 });
  s.units.push(unit);
  const before = JSON.stringify({ units: s.units, bases: s.bases });

  reachableCells(s, grid, unit);

  assert.equal(JSON.stringify({ units: s.units, bases: s.bases }), before);
});
