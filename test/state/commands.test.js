import { test } from "node:test";
import assert from "node:assert/strict";
import {
  endTurn,
  terminate,
  queueBuild,
  cancelQueuedBuild,
  reorderQueuedBuild,
  processTurnStart,
  moveUnit,
  unloadUnit,
  loadUnit,
} from "../../src/state/commands.js";
import { buildTurns, UNIT_TYPES } from "../../src/state/unit-types.js";
import { TerrainGrid } from "../../src/map/grid.js";

function state(turnOrder, turnIndex) {
  return { turnOrder, turnIndex, turnNumber: 1, terminated: false, bases: [], units: [], nextUnitId: 0 };
}

function allLandGrid(size = 15) {
  const grid = new TerrainGrid(size, size, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "gras");
  return grid;
}

function landBase(overrides = {}) {
  return {
    id: 0,
    ownerId: 0,
    type: "land",
    adjacentToDeepWater: false,
    sp: 20,
    maxSp: 20,
    garrison: [],
    queue: [],
    inProgress: null,
    ...overrides,
  };
}

test("endTurn advances to the next player in turn order", () => {
  const s = state([0, 1, 2], 0);
  endTurn(s);
  assert.equal(s.turnIndex, 1);
  assert.equal(s.turnNumber, 1);
});

test("endTurn wraps around and bumps turnNumber", () => {
  const s = state([0, 1, 2], 2);
  endTurn(s);
  assert.equal(s.turnIndex, 0);
  assert.equal(s.turnNumber, 2);
});

test("terminate sets the terminated flag", () => {
  const s = state([0, 1], 0);
  terminate(s);
  assert.equal(s.terminated, true);
});

test("queueBuild on an idle base starts immediately, leaving the queue empty", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  assert.deepEqual(base.queue, []);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: buildTurns("tank") });
});

test("queueBuild rejects a unit type the base can't build", () => {
  const s = state([0], 0);
  const base = landBase(); // land base: vehicles only
  s.bases.push(base);
  queueBuild(s, base.id, "fighter");
  assert.equal(base.inProgress, null);
  assert.deepEqual(base.queue, []);
});

test("queueBuild queues (doesn't start) additional builds while one is already in progress", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "tank");
  assert.equal(base.queue.length, 1);
  assert.ok(base.inProgress);
});

test("queueBuild rejects once the queue already holds the max pending builds", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank"); // starts immediately
  for (let i = 0; i < 5; i++) queueBuild(s, base.id, "tank"); // fills the 5-slot queue
  assert.equal(base.queue.length, 5);
  queueBuild(s, base.id, "tank"); // 6th queued build: rejected
  assert.equal(base.queue.length, 5);
});

// Port base, deep-water adjacent, so tank/fregat/transporter/carrier are all buildable there —
// gives the queue tests distinguishable unit types to assert ordering on.
function portBase(overrides = {}) {
  return landBase({ type: "port", adjacentToDeepWater: true, ...overrides });
}

test("cancelQueuedBuild removes only the targeted pending entry, leaving the rest in order", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank"); // starts immediately, queue stays empty
  queueBuild(s, base.id, "fregat");
  queueBuild(s, base.id, "carrier");
  assert.equal(base.queue.length, 2);

  cancelQueuedBuild(s, base.id, 0);
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["carrier"],
  );
});

test("cancelQueuedBuild is a no-op for an out-of-range index", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "fregat");

  cancelQueuedBuild(s, base.id, 5);
  assert.equal(base.queue.length, 1);
});

test("reorderQueuedBuild swaps a queue entry with its neighbor towards the front or back", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank"); // starts immediately
  queueBuild(s, base.id, "fregat");
  queueBuild(s, base.id, "carrier");
  queueBuild(s, base.id, "transporter");
  // queue is now [fregat, carrier, transporter]

  reorderQueuedBuild(s, base.id, 2, -1); // transporter moves up, swaps with carrier
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["fregat", "transporter", "carrier"],
  );

  reorderQueuedBuild(s, base.id, 0, 1); // fregat moves back, swaps with transporter
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["transporter", "fregat", "carrier"],
  );
});

test("reorderQueuedBuild is a no-op at either end of the queue", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "fregat");
  queueBuild(s, base.id, "carrier");

  reorderQueuedBuild(s, base.id, 0, -1); // already at the front
  reorderQueuedBuild(s, base.id, 1, 1); // already at the back
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["fregat", "carrier"],
  );
});

test("processTurnStart ticks down the in-progress build and completes it exactly on schedule", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  const turns = buildTurns("tank");

  for (let i = 0; i < turns - 1; i++) {
    processTurnStart(s, 0);
    assert.equal(base.garrison.length, 0, `garrison should still be empty after tick ${i + 1}`);
  }
  processTurnStart(s, 0); // final tick
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].unitType, "tank");
  assert.equal(base.inProgress, null);
});

test("processTurnStart starts the next queued build once the current one completes", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "tank");
  for (let i = 0; i < buildTurns("tank"); i++) processTurnStart(s, 0);
  assert.equal(base.garrison.length, 1);
  assert.ok(base.inProgress, "second queued tank should now be in progress");
});

test("processTurnStart only affects bases owned by the given player", () => {
  const s = state([0, 1], 0);
  const mine = landBase({ id: 0, ownerId: 0 });
  const theirs = landBase({ id: 1, ownerId: 1 });
  s.bases.push(mine, theirs);
  queueBuild(s, mine.id, "tank");
  queueBuild(s, theirs.id, "tank");
  processTurnStart(s, 0);
  assert.equal(mine.inProgress.remainingTurns, buildTurns("tank") - 1);
  assert.equal(theirs.inProgress.remainingTurns, buildTurns("tank")); // untouched
});

test("a completed build never starts the next queued item if the base is at max capacity", () => {
  const s = state([0], 0);
  const base = landBase({ garrison: Array.from({ length: 15 }, (_, i) => ({ id: i, unitType: "tank" })) });
  s.bases.push(base);
  base.queue.push({ unitType: "tank" }); // manually queued; base is already full
  processTurnStart(s, 0);
  assert.equal(base.inProgress, null, "no room to start a build");
  assert.equal(base.queue.length, 1, "stays queued");
});

// --- Movement / load / unload (Stage 5) ---

test("unloadUnit places the garrisoned unit on the given adjacent hex, deducting 1 action + move cost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank" }] });
  s.bases.push(base);
  const [dest] = grid.neighborsOf(base.col, base.row);

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row);

  assert.equal(base.garrison.length, 0);
  assert.equal(s.units.length, 1);
  const unit = s.units[0];
  assert.equal(unit.id, 0);
  assert.equal(unit.unitType, "tank");
  assert.equal(unit.sp, UNIT_TYPES.tank.strength);
  // gras move cost is 1, unload itself is 1 action -> 2 spent
  assert.equal(unit.remainingActions, UNIT_TYPES.tank.actionsPerTurn - 2);
  assert.equal(unit.col, dest.col);
  assert.equal(unit.row, dest.row);
});

test("unloadUnit is a no-op if the given hex isn't a valid destination (occupied)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank" }] });
  s.bases.push(base);
  const [dest] = grid.neighborsOf(base.col, base.row);
  s.units.push({ id: 100, ownerId: 1, unitType: "tank", col: dest.col, row: dest.row, sp: 10, maxSp: 10, remainingActions: 0 });

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row);
  assert.equal(base.garrison.length, 1, "unit never left the base");
});

test("unloadUnit is a no-op if the given hex isn't adjacent to the base", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank" }] });
  s.bases.push(base);

  unloadUnit(s, grid, base.id, 0, 9, 9);
  assert.equal(base.garrison.length, 1, "unit never left the base");
});

test("moveUnit steps onto an adjacent passable, unoccupied hex and spends the move cost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);

  moveUnit(s, grid, 0, dest.col, dest.row);

  assert.equal(unit.col, dest.col);
  assert.equal(unit.row, dest.row);
  assert.equal(unit.remainingActions, 5 - 1); // gras costs 1
});

test("moveUnit rejects a non-adjacent destination", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  moveUnit(s, grid, 0, 10, 10);
  assert.deepEqual([unit.col, unit.row], [5, 5]);
  assert.equal(unit.remainingActions, 5);
});

test("moveUnit rejects impassable terrain", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);
  grid.set(dest.col, dest.row, "mountain"); // impassable for tank

  moveUnit(s, grid, 0, dest.col, dest.row);
  assert.deepEqual([unit.col, unit.row], [5, 5]);
});

test("moveUnit rejects when the unit can't afford the move cost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 0 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);

  moveUnit(s, grid, 0, dest.col, dest.row);
  assert.deepEqual([unit.col, unit.row], [5, 5]);
});

test("loadUnit moves an adjacent field unit into a friendly base's garrison", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ id: 0, ownerId: 0, col: 5, row: 5 });
  s.bases.push(base);
  const [adjacent] = grid.neighborsOf(5, 5);
  const unit = { id: 7, ownerId: 0, unitType: "tank", col: adjacent.col, row: adjacent.row, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  loadUnit(s, grid, 7);

  assert.equal(s.units.length, 0);
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].id, 7);
  assert.equal(base.garrison[0].unitType, "tank");
});

test("loadUnit is a no-op if the adjacent base doesn't accept the unit's category", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  // A mountain base only accepts planes, not vehicles.
  const base = { id: 0, ownerId: 0, type: "mountain", col: 5, row: 5, adjacentToDeepWater: false, sp: 20, maxSp: 20, garrison: [], queue: [], inProgress: null };
  s.bases.push(base);
  const [adjacent] = grid.neighborsOf(5, 5);
  const unit = { id: 7, ownerId: 0, unitType: "tank", col: adjacent.col, row: adjacent.row, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  loadUnit(s, grid, 7);
  assert.equal(s.units.length, 1, "tank stays in the field");
  assert.equal(base.garrison.length, 0);
});

test("loadUnit is a no-op if the base is at max capacity", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: Array.from({ length: 15 }, (_, i) => ({ id: i, unitType: "tank" })) });
  s.bases.push(base);
  const [adjacent] = grid.neighborsOf(5, 5);
  const unit = { id: 7, ownerId: 0, unitType: "tank", col: adjacent.col, row: adjacent.row, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  loadUnit(s, grid, 7);
  assert.equal(s.units.length, 1);
  assert.equal(base.garrison.length, 15);
});

test("processTurnStart resets only the given player's field units back to full actions", () => {
  const s = state([0, 1], 0);
  s.units.push(
    { id: 0, ownerId: 0, unitType: "tank", col: 0, row: 0, sp: 10, maxSp: 10, remainingActions: 1 },
    { id: 1, ownerId: 1, unitType: "tank", col: 1, row: 1, sp: 10, maxSp: 10, remainingActions: 1 },
  );
  processTurnStart(s, 0);
  assert.equal(s.units[0].remainingActions, UNIT_TYPES.tank.actionsPerTurn);
  assert.equal(s.units[1].remainingActions, 1, "other player's unit untouched");
});
