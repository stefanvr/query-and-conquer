import { test } from "node:test";
import assert from "node:assert/strict";
import {
  endTurn,
  isEliminated,
  checkGameEnd,
  terminate,
  queueBuild,
  cancelQueuedBuild,
  reorderQueuedBuild,
  processTurnStart,
  moveUnit,
  planesOwingMovement,
  markExplored,
  unloadUnit,
  unloadCargo,
  loadUnit,
  isValidLoadTarget,
  enterBaseWithCargo,
  loadIntoBoat,
  isValidLoadIntoBoatTarget,
  isValidAttackTarget,
  attackUnit,
  isValidAttackBaseTarget,
  attackBase,
  claimBase,
} from "../../src/state/commands.js";
import { buildTurns, UNIT_TYPES } from "../../src/state/unit-types.js";
import { TerrainGrid } from "../../src/map/grid.js";
import { offsetKey } from "../../src/map/hex-coords.js";

function state(turnOrder, turnIndex) {
  return {
    turnOrder,
    turnIndex,
    turnNumber: 1,
    terminated: false,
    bases: [],
    units: [],
    nextUnitId: 0,
    // map/players are here so the many commands that now call markExplored (§6's fog of war)
    // don't crash on a missing state.map -- large enough bounds that no test's coordinates clip.
    map: { width: 200, height: 200 },
    players: turnOrder.map((id) => ({ id, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } })),
  };
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
    lastOwnerId: null,
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

/** Gives each of `playerIds` an owned base, so none of them looks eliminated to endTurn's own
 * turn-skip logic (game spec §7) — plain turn-advancement tests don't care about elimination, but
 * every player needs to look like a real, still-in-the-game player for that not to interfere. */
function ownABase(s, playerIds) {
  for (const id of playerIds) s.bases.push(landBase({ id: `base-${id}`, ownerId: id }));
}

test("endTurn advances to the next player in turn order", () => {
  const s = state([0, 1, 2], 0);
  ownABase(s, [0, 1, 2]);
  endTurn(s);
  assert.equal(s.turnIndex, 1);
  assert.equal(s.turnNumber, 1);
});

test("endTurn wraps around and bumps turnNumber", () => {
  const s = state([0, 1, 2], 2);
  ownABase(s, [0, 1, 2]);
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
  queueBuild(s, base.id, "tank", 0);
  assert.deepEqual(base.queue, []);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: buildTurns("tank") });
});

test("queueBuild rejects a unit type the base can't build", () => {
  const s = state([0], 0);
  const base = landBase(); // land base: vehicles and planes, not boats
  s.bases.push(base);
  queueBuild(s, base.id, "fregat", 0);
  assert.equal(base.inProgress, null);
  assert.deepEqual(base.queue, []);
});

test("queueBuild is a no-op if the base isn't owned by the active player", () => {
  const s = state([0], 0);
  const base = landBase({ ownerId: 1 });
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0); // active player 0, base owned by 1
  assert.equal(base.inProgress, null);
  assert.deepEqual(base.queue, []);
});

test("queueBuild queues (doesn't start) additional builds while one is already in progress", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "tank", 0);
  assert.equal(base.queue.length, 1);
  assert.ok(base.inProgress);
});

test("queueBuild rejects once the queue already holds the max pending builds", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0); // starts immediately
  for (let i = 0; i < 5; i++) queueBuild(s, base.id, "tank", 0); // fills the 5-slot queue
  assert.equal(base.queue.length, 5);
  queueBuild(s, base.id, "tank", 0); // 6th queued build: rejected
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
  queueBuild(s, base.id, "tank", 0); // starts immediately, queue stays empty
  queueBuild(s, base.id, "fregat", 0);
  queueBuild(s, base.id, "carrier", 0);
  assert.equal(base.queue.length, 2);

  cancelQueuedBuild(s, base.id, 0, 0);
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["carrier"],
  );
});

test("cancelQueuedBuild is a no-op for an out-of-range index", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "fregat", 0);

  cancelQueuedBuild(s, base.id, 5, 0);
  assert.equal(base.queue.length, 1);
});

test("cancelQueuedBuild is a no-op if the base isn't owned by the active player", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "fregat", 0);

  base.ownerId = 1; // simulate the base changing hands after the queue was built
  cancelQueuedBuild(s, base.id, 0, 0); // active player 0, base owned by 1
  assert.equal(base.queue.length, 1, "queue untouched");
});

test("reorderQueuedBuild swaps a queue entry with its neighbor towards the front or back", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0); // starts immediately
  queueBuild(s, base.id, "fregat", 0);
  queueBuild(s, base.id, "carrier", 0);
  queueBuild(s, base.id, "transporter", 0);
  // queue is now [fregat, carrier, transporter]

  reorderQueuedBuild(s, base.id, 2, -1, 0); // transporter moves up, swaps with carrier
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["fregat", "transporter", "carrier"],
  );

  reorderQueuedBuild(s, base.id, 0, 1, 0); // fregat moves back, swaps with transporter
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["transporter", "fregat", "carrier"],
  );
});

test("reorderQueuedBuild is a no-op at either end of the queue", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "fregat", 0);
  queueBuild(s, base.id, "carrier", 0);

  reorderQueuedBuild(s, base.id, 0, -1, 0); // already at the front
  reorderQueuedBuild(s, base.id, 1, 1, 0); // already at the back
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["fregat", "carrier"],
  );
});

test("reorderQueuedBuild is a no-op if the base isn't owned by the active player", () => {
  const s = state([0], 0);
  const base = portBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "fregat", 0);
  queueBuild(s, base.id, "carrier", 0);

  base.ownerId = 1;
  reorderQueuedBuild(s, base.id, 1, -1, 0); // active player 0, base owned by 1
  assert.deepEqual(
    base.queue.map((q) => q.unitType),
    ["fregat", "carrier"],
    "untouched",
  );
});

test("processTurnStart ticks down the in-progress build and completes it exactly on schedule", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank", 0);
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
  queueBuild(s, base.id, "tank", 0);
  queueBuild(s, base.id, "tank", 0);
  for (let i = 0; i < buildTurns("tank"); i++) processTurnStart(s, 0);
  assert.equal(base.garrison.length, 1);
  assert.ok(base.inProgress, "second queued tank should now be in progress");
});

test("processTurnStart only affects bases owned by the given player", () => {
  const s = state([0, 1], 0);
  const mine = landBase({ id: 0, ownerId: 0 });
  const theirs = landBase({ id: 1, ownerId: 1 });
  s.bases.push(mine, theirs);
  queueBuild(s, mine.id, "tank", 0);
  queueBuild(s, theirs.id, "tank", 1);
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
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank", sp: UNIT_TYPES.tank.strength }] });
  s.bases.push(base);
  const [dest] = grid.neighborsOf(base.col, base.row);

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row, 0);

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

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row, 0);
  assert.equal(base.garrison.length, 1, "unit never left the base");
});

test("unloadUnit is a no-op if the given hex isn't adjacent to the base", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank" }] });
  s.bases.push(base);

  unloadUnit(s, grid, base.id, 0, 9, 9, 0);
  assert.equal(base.garrison.length, 1, "unit never left the base");
});

test("unloadUnit is a no-op if the base isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ ownerId: 1, col: 5, row: 5, garrison: [{ id: 0, unitType: "tank", sp: UNIT_TYPES.tank.strength }] });
  s.bases.push(base);
  const [dest] = grid.neighborsOf(base.col, base.row);

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row, 0); // active player 0, base owned by 1
  assert.equal(base.garrison.length, 1, "unit never left the base");
  assert.equal(s.units.length, 0);
});

test("unloadUnit carries a damaged garrisoned unit's sp through, not a reset to full", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ col: 5, row: 5, garrison: [{ id: 0, unitType: "tank", sp: 3 }] });
  s.bases.push(base);
  const [dest] = grid.neighborsOf(base.col, base.row);

  unloadUnit(s, grid, base.id, 0, dest.col, dest.row, 0);

  assert.equal(s.units[0].sp, 3);
  assert.equal(s.units[0].maxSp, UNIT_TYPES.tank.strength);
});

test("moveUnit steps onto an adjacent passable, unoccupied hex and spends the move cost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);

  moveUnit(s, grid, 0, dest.col, dest.row, 0);

  assert.equal(unit.col, dest.col);
  assert.equal(unit.row, dest.row);
  assert.equal(unit.remainingActions, 5 - 1); // gras costs 1
});

test("moveUnit rejects a non-adjacent destination", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  moveUnit(s, grid, 0, 10, 10, 0);
  assert.deepEqual([unit.col, unit.row], [5, 5]);
  assert.equal(unit.remainingActions, 5);
});

test("moveUnit is a no-op if the unit isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 1, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);

  moveUnit(s, grid, 0, dest.col, dest.row, 0); // active player 0, unit owned by 1
  assert.deepEqual([unit.col, unit.row], [5, 5]);
});

test("moveUnit rejects impassable terrain", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);
  grid.set(dest.col, dest.row, "mountain"); // impassable for tank

  moveUnit(s, grid, 0, dest.col, dest.row, 0);
  assert.deepEqual([unit.col, unit.row], [5, 5]);
});

test("moveUnit rejects when the unit can't afford the move cost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = { id: 0, ownerId: 0, unitType: "tank", col: 5, row: 5, sp: 10, maxSp: 10, remainingActions: 0 };
  s.units.push(unit);
  const [dest] = grid.neighborsOf(5, 5);

  moveUnit(s, grid, 0, dest.col, dest.row, 0);
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

  loadUnit(s, grid, 7, base.id, 0);

  assert.equal(s.units.length, 0);
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].id, 7);
  assert.equal(base.garrison[0].unitType, "tank");
  assert.equal(base.garrison[0].sp, 10);
});

test("loadUnit is a no-op if the unit isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ id: 0, ownerId: 0, col: 5, row: 5 });
  s.bases.push(base);
  const [adjacent] = grid.neighborsOf(5, 5);
  const unit = { id: 7, ownerId: 1, unitType: "tank", col: adjacent.col, row: adjacent.row, sp: 10, maxSp: 10, remainingActions: 5 };
  s.units.push(unit);

  loadUnit(s, grid, 7, base.id, 0); // active player 0, unit owned by 1
  assert.equal(s.units.length, 1, "tank stays in the field");
  assert.equal(base.garrison.length, 0);
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

  loadUnit(s, grid, 7, base.id, 0);
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

  loadUnit(s, grid, 7, base.id, 0);
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

test("processTurnStart also resets remainingAttacks", () => {
  const s = state([0], 0);
  s.units.push({ id: 0, ownerId: 0, unitType: "tank", col: 0, row: 0, sp: 10, maxSp: 10, remainingActions: 0, remainingAttacks: 0 });
  processTurnStart(s, 0);
  assert.equal(s.units[0].remainingAttacks, UNIT_TYPES.tank.attacksPerTurn);
});

// --- Combat (Stage 6) ---

function tank(overrides = {}) {
  return {
    id: 0,
    ownerId: 0,
    unitType: "tank",
    col: 5,
    row: 5,
    sp: UNIT_TYPES.tank.strength,
    maxSp: UNIT_TYPES.tank.strength,
    remainingActions: UNIT_TYPES.tank.actionsPerTurn,
    remainingAttacks: UNIT_TYPES.tank.attacksPerTurn,
    ...overrides,
  };
}

test("isValidAttackTarget accepts an adjacent enemy in range with attacks/actions left", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  assert.equal(isValidAttackTarget(s, grid, attacker, defender), true);
});

test("isValidAttackTarget rejects same owner, out of range, or no attacks/actions left", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5 });
  const friendly = tank({ id: 1, ownerId: 0, col: 6, row: 5 });
  const farEnemy = tank({ id: 2, ownerId: 1, col: 8, row: 5 });
  assert.equal(isValidAttackTarget(s, grid, attacker, friendly), false, "same owner");
  assert.equal(isValidAttackTarget(s, grid, attacker, farEnemy), false, "out of range");
  assert.equal(isValidAttackTarget(s, grid, tank({ col: 5, row: 5, remainingAttacks: 0 }), farEnemy), false, "no attacks left");
  assert.equal(isValidAttackTarget(s, grid, tank({ col: 5, row: 5, remainingActions: 0 }), farEnemy), false, "no actions left");
});

test("isValidAttackTarget rejects a target beyond a range-2 attacker's line of sight, blocked by a mountain cell", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  // Fregat has attack range 2 and needsLOS. grid.neighborsOf returns neighbors in a fixed
  // direction order (hex-coords.js) -- taking the same direction index twice continues in a
  // straight line, so `mid` is guaranteed to be the actual cell between attacker and target.
  const mid = grid.neighborsOf(5, 5)[0];
  const target = grid.neighborsOf(mid.col, mid.row)[0];
  grid.set(mid.col, mid.row, "mountain");

  const attacker = { id: 0, ownerId: 0, unitType: "fregat", col: 5, row: 5, remainingActions: 5, remainingAttacks: 1 };
  const defender = { id: 1, ownerId: 1, unitType: "fregat", col: target.col, row: target.row };

  assert.equal(isValidAttackTarget(s, grid, attacker, defender), false, "blocked by the mountain cell in between");
});

test("isValidAttackTarget allows a range-2 attack once the blocking mountain cell is gone", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const mid = grid.neighborsOf(5, 5)[0];
  const target = grid.neighborsOf(mid.col, mid.row)[0];

  const attacker = { id: 0, ownerId: 0, unitType: "fregat", col: 5, row: 5, remainingActions: 5, remainingAttacks: 1 };
  const defender = { id: 1, ownerId: 1, unitType: "fregat", col: target.col, row: target.row };

  assert.equal(isValidAttackTarget(s, grid, attacker, defender), true, "mid cell is plain gras -- nothing blocking");
});

test("isValidAttackTarget doesn't need line of sight for a unit whose type has needsLOS: false", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const mid = grid.neighborsOf(5, 5)[0];
  const target = grid.neighborsOf(mid.col, mid.row)[0];
  grid.set(mid.col, mid.row, "mountain");

  const attacker = { id: 0, ownerId: 0, unitType: "carrier", col: 5, row: 5, remainingActions: 5, remainingAttacks: 1 }; // range 4, needsLOS: false
  const defender = { id: 1, ownerId: 1, unitType: "fregat", col: target.col, row: target.row };

  assert.equal(isValidAttackTarget(s, grid, attacker, defender), true, "carrier doesn't need LOS");
});

test("attackUnit applies the attacker's ground atk against a ground defender's sp, spending 1 action + 1 attack", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  s.units.push(attacker, defender);

  attackUnit(s, grid, 0, 1, 0);

  assert.equal(defender.sp, UNIT_TYPES.tank.strength - UNIT_TYPES.tank.groundAtk);
  assert.equal(attacker.remainingActions, UNIT_TYPES.tank.actionsPerTurn - 1);
  assert.equal(attacker.remainingAttacks, UNIT_TYPES.tank.attacksPerTurn - 1);
});

test("attackUnit uses the attacker's air atk against an air-target-type defender", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5 });
  const defender = { id: 1, ownerId: 1, unitType: "fighter", col: 6, row: 5, sp: UNIT_TYPES.fighter.strength, maxSp: UNIT_TYPES.fighter.strength, remainingActions: 5, remainingAttacks: 1 };
  s.units.push(attacker, defender);

  attackUnit(s, grid, 0, 1, 0);

  assert.equal(defender.sp, UNIT_TYPES.fighter.strength - UNIT_TYPES.tank.airAtk);
});

test("attackUnit destroys the defender (removed from state.units) once sp reaches 0", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5, sp: 1 });
  s.units.push(attacker, defender);

  attackUnit(s, grid, 0, 1, 0);

  assert.equal(s.units.length, 1);
  assert.equal(s.units[0].id, 0);
});

test("attackUnit is a no-op if the attacker isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, ownerId: 1 });
  const defender = tank({ id: 1, ownerId: 0, col: 6, row: 5 });
  s.units.push(attacker, defender);

  attackUnit(s, grid, 0, 1, 0); // active player 0, attacker owned by 1
  assert.equal(defender.sp, UNIT_TYPES.tank.strength, "no damage dealt");
});

test("attackBase destroys garrisoned units oldest-first before any damage spills onto base sp", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const base = landBase({
    ownerId: 1,
    col: 6,
    row: 5,
    sp: 20,
    garrison: [
      { id: 10, unitType: "tank", sp: 10 },
      { id: 11, unitType: "tank", sp: 10 },
    ],
  });
  s.bases.push(base);

  attackBase(s, grid, 0, base.id, 0); // groundAtk 4 -> kills both garrisoned units (1 SP each), 2 damage carries onto base

  assert.equal(base.garrison.length, 0);
  assert.equal(base.sp, 18);
  assert.equal(base.ownerId, 1, "still owned -- sp didn't reach 0");
});

test("attackBase drops the base to neutral once sp hits 0, remembering lastOwnerId", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const base = landBase({ ownerId: 1, col: 6, row: 5, sp: 3, garrison: [] });
  s.bases.push(base);

  attackBase(s, grid, 0, base.id, 0);

  assert.equal(base.sp, 0);
  assert.equal(base.ownerId, null);
  assert.equal(base.lastOwnerId, 1);
});

test("attackBase never destroys a unit still under construction", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const base = landBase({ ownerId: 1, col: 6, row: 5, sp: 3, garrison: [], inProgress: { unitType: "tank", remainingTurns: 2 } });
  s.bases.push(base);

  attackBase(s, grid, 0, base.id, 0);

  assert.equal(base.ownerId, null);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: 2 });
});

test("attackBase is a no-op against a neutral or friendly base", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const neutral = landBase({ id: 1, ownerId: null, col: 6, row: 5, sp: 0 });
  const friendly = landBase({ id: 2, ownerId: 0, col: 5, row: 6, sp: 20 });
  s.bases.push(neutral, friendly);

  attackBase(s, grid, 0, neutral.id, 0);
  attackBase(s, grid, 0, friendly.id, 0);

  assert.equal(neutral.sp, 0);
  assert.equal(friendly.sp, 20);
});

test("claimBase captures a neutral base, transferring ownership and clearing its queue/build", () => {
  const s = state([0], 0);
  const unit = tank({ col: 5, row: 5 });
  s.units.push(unit);
  const grid = allLandGrid();
  const base = landBase({
    ownerId: null,
    lastOwnerId: 1,
    col: 6,
    row: 5,
    sp: 0,
    queue: [{ unitType: "tank" }],
    inProgress: { unitType: "tank", remainingTurns: 3 },
  });
  s.bases.push(base);

  claimBase(s, grid, unit.id, base.id, 0); // claimer 0, lastOwnerId 1 -- an actual capture

  assert.equal(s.units.length, 0);
  assert.equal(base.ownerId, 0);
  assert.equal(base.sp, 4);
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].id, unit.id);
  assert.deepEqual(base.queue, []);
  assert.equal(base.inProgress, null);
});

test("claimBase works for a fregat claiming a neutral port base (game spec §4: fregats can only ever claim a port)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(5, 5, "shallow"); // the fregat's own cell -- enterCost reads from here
  const fregat = { id: 0, ownerId: 0, unitType: "fregat", col: 5, row: 5, remainingActions: UNIT_TYPES.fregat.actionsPerTurn };
  s.units.push(fregat);
  const base = landBase({ type: "port", ownerId: null, lastOwnerId: 1, col: 6, row: 5, sp: 0 });
  s.bases.push(base);

  claimBase(s, grid, fregat.id, base.id, 0);

  assert.equal(s.units.length, 0);
  assert.equal(base.ownerId, 0);
  assert.equal(base.garrison[0].unitType, "fregat");
});

test("claimBase works for a fighter claiming a neutral mountain base (game spec §4: a mountain base unreachable by tank or boat can only be claimed by a fighter)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const fighter = plane({ unitType: "fighter", col: 5, row: 5 });
  s.units.push(fighter);
  const base = landBase({ type: "mountain", ownerId: null, lastOwnerId: 1, col: 6, row: 5, sp: 0 });
  s.bases.push(base);

  claimBase(s, grid, fighter.id, base.id, 0);

  assert.equal(s.units.length, 0);
  assert.equal(base.ownerId, 0);
  assert.equal(base.garrison[0].unitType, "fighter");
});

test("claimBase works for a fighter claiming a neutral Land or Port base too -- claim eligibility isn't gated by base-build category (game spec §4 has no such restriction, only natural terrain reachability)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();

  const landFighter = plane({ unitType: "fighter", col: 5, row: 5 });
  s.units.push(landFighter);
  const land = landBase({ id: 10, type: "land", ownerId: null, lastOwnerId: 1, col: 6, row: 5, sp: 0 });
  s.bases.push(land);
  claimBase(s, grid, landFighter.id, land.id, 0);
  assert.equal(land.ownerId, 0);

  const portFighter = plane({ id: 62, unitType: "fighter", col: 8, row: 5 });
  s.units.push(portFighter);
  const port = landBase({ id: 11, type: "port", ownerId: null, lastOwnerId: 1, col: 9, row: 5, sp: 0 });
  s.bases.push(port);
  claimBase(s, grid, portFighter.id, port.id, 0);
  assert.equal(port.ownerId, 0);
});

test("claimBase recaptures a neutral base for its own lastOwnerId without clearing the in-progress build", () => {
  const s = state([1], 0);
  const unit = tank({ ownerId: 1, col: 5, row: 5 });
  s.units.push(unit);
  const grid = allLandGrid();
  const base = landBase({
    ownerId: null,
    lastOwnerId: 1,
    col: 6,
    row: 5,
    sp: 0,
    inProgress: { unitType: "tank", remainingTurns: 3 },
  });
  s.bases.push(base);

  claimBase(s, grid, unit.id, base.id, 1); // claimer 1 == lastOwnerId -- a recapture

  assert.equal(base.ownerId, 1);
  assert.equal(base.sp, 4);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: 3 });
});

test("claimBase is a no-op if the base isn't neutral, or the unit type can't capture", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const owned = landBase({ id: 1, ownerId: 1, col: 6, row: 5 });
  const neutral = landBase({ id: 2, ownerId: null, col: 5, row: 6 });
  s.bases.push(owned, neutral);
  const capturer = tank({ id: 0, col: 5, row: 5 });
  // (4, 6) is neutral's west neighbor -- col-1 same row is always adjacent regardless of parity.
  const nonCapturer = { id: 1, ownerId: 0, unitType: "transporter", col: 4, row: 6, sp: 30, maxSp: 30, remainingActions: 8, remainingAttacks: 1 };
  s.units.push(capturer, nonCapturer);

  claimBase(s, grid, capturer.id, owned.id, 0);
  claimBase(s, grid, nonCapturer.id, neutral.id, 0);

  assert.equal(owned.ownerId, 1, "still owned -- can't claim a non-neutral base");
  assert.equal(neutral.ownerId, null, "transporter can't capture");
});

test("processTurnStart repairs a damaged owned base by 1 SP, capped at max", () => {
  const s = state([0], 0);
  const base = landBase({ sp: 18, maxSp: 20 });
  s.bases.push(base);
  processTurnStart(s, 0);
  assert.equal(base.sp, 19);

  base.sp = 20;
  processTurnStart(s, 0);
  assert.equal(base.sp, 20, "never exceeds max");
});

test("processTurnStart repairs up to 5 damaged garrisoned units in parallel, entry order, +5 SP capped at their own max", () => {
  const s = state([0], 0);
  const garrison = Array.from({ length: 6 }, (_, i) => ({ id: i, unitType: "tank", sp: 2 }));
  garrison[5].sp = 2; // the 6th (index 5) is damaged too, but only the first 5 repair this turn
  const base = landBase({ garrison });
  s.bases.push(base);

  processTurnStart(s, 0);

  assert.deepEqual(
    garrison.map((g) => g.sp),
    [7, 7, 7, 7, 7, 2],
  );
});

test("processTurnStart auto-recaptures a neutral base once its lastOwnerId's build completes, at 1 SP", () => {
  const s = state([0], 0);
  const base = landBase({ ownerId: null, lastOwnerId: 0, sp: 0, inProgress: { unitType: "tank", remainingTurns: 1 } });
  s.bases.push(base);

  processTurnStart(s, 0);

  assert.equal(base.ownerId, 0);
  assert.equal(base.sp, 1);
  assert.equal(base.garrison.length, 1);
  assert.equal(base.inProgress, null);
});

test("processTurnStart leaves a neutral base neutral if its lastOwnerId's build hasn't completed yet", () => {
  const s = state([0], 0);
  const base = landBase({ ownerId: null, lastOwnerId: 0, sp: 0, inProgress: { unitType: "tank", remainingTurns: 3 } });
  s.bases.push(base);

  processTurnStart(s, 0);

  assert.equal(base.ownerId, null);
  assert.equal(base.inProgress.remainingTurns, 2);
});

test("processTurnStart never auto-recaptures for a player who isn't the neutral base's lastOwnerId", () => {
  const s = state([1], 0);
  const base = landBase({ ownerId: null, lastOwnerId: 0, sp: 0, inProgress: { unitType: "tank", remainingTurns: 1 } });
  s.bases.push(base);

  processTurnStart(s, 1); // player 1's turn, but lastOwnerId is 0

  assert.equal(base.ownerId, null, "player 1 has no claim to it");
  assert.equal(base.inProgress.remainingTurns, 1, "not this player's base to tick either");
});

// --- Boats & cargo (Stage 7) ---

function transporter(overrides = {}) {
  return {
    id: 50,
    ownerId: 0,
    unitType: "transporter",
    col: 5,
    row: 5,
    sp: UNIT_TYPES.transporter.strength,
    maxSp: UNIT_TYPES.transporter.strength,
    remainingActions: UNIT_TYPES.transporter.actionsPerTurn,
    remainingAttacks: UNIT_TYPES.transporter.attacksPerTurn,
    cargo: [],
    ...overrides,
  };
}

/** A field-unit plane (Fighter or Bomber, `unitType` overridable) at full rearm/fuel — Stage 8's
 * Plane rearm & fuel counters (`strikesUsed`/`cellsFlown`/`actionsSpentMoving`). */
function plane(overrides = {}) {
  const unitType = overrides.unitType ?? "fighter";
  return {
    id: 60,
    ownerId: 0,
    unitType,
    col: 5,
    row: 5,
    sp: UNIT_TYPES[unitType].strength,
    maxSp: UNIT_TYPES[unitType].strength,
    remainingActions: UNIT_TYPES[unitType].actionsPerTurn,
    remainingAttacks: UNIT_TYPES[unitType].attacksPerTurn,
    strikesUsed: 0,
    cellsFlown: 0,
    actionsSpentMoving: 0,
    ...overrides,
  };
}

test("isValidLoadIntoBoatTarget accepts an adjacent friendly transporter with room, for a vehicle-category unit", () => {
  const grid = allLandGrid();
  const boat = transporter({ col: 5, row: 5 });
  const unit = tank({ id: 1, col: 6, row: 5 });
  assert.equal(isValidLoadIntoBoatTarget(grid, unit, boat), true);
});

test("isValidLoadIntoBoatTarget rejects a category mismatch, a full boat, someone else's boat, or a boat loading into itself", () => {
  const grid = allLandGrid();
  const unit = tank({ id: 1, col: 6, row: 5 });

  const carrierBoat = { id: 51, ownerId: 0, unitType: "carrier", col: 5, row: 5, cargo: [] }; // accepts planes, not tanks
  assert.equal(isValidLoadIntoBoatTarget(grid, unit, carrierBoat), false, "category mismatch");

  const fullBoat = transporter({ col: 5, row: 5, cargo: Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, unitType: "tank", sp: 10 })) });
  assert.equal(isValidLoadIntoBoatTarget(grid, unit, fullBoat), false, "full");

  const enemyBoat = transporter({ col: 5, row: 5, ownerId: 1 });
  assert.equal(isValidLoadIntoBoatTarget(grid, unit, enemyBoat), false, "someone else's boat");

  const boat = transporter({ col: 6, row: 5 });
  assert.equal(isValidLoadIntoBoatTarget(grid, boat, boat), false, "a boat can't load into itself/another boat");
});

test("loadIntoBoat moves the unit into cargo, removing it from state.units, sp carried over", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const boat = transporter({ col: 5, row: 5 });
  const unit = tank({ id: 1, col: 6, row: 5, sp: 7 });
  s.units.push(boat, unit);

  loadIntoBoat(s, grid, unit.id, boat.id, 0);

  assert.equal(s.units.length, 1);
  assert.equal(s.units[0].id, boat.id);
  assert.equal(boat.cargo.length, 1);
  assert.equal(boat.cargo[0].id, 1);
  assert.equal(boat.cargo[0].sp, 7);
});

test("loadIntoBoat is a no-op if the unit isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const boat = transporter({ col: 5, row: 5 });
  const unit = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  s.units.push(boat, unit);

  loadIntoBoat(s, grid, unit.id, boat.id, 0);
  assert.equal(s.units.length, 2, "nothing loaded");
  assert.equal(boat.cargo.length, 0);
});

test("unloadCargo places a cargo unit onto the given adjacent hex, sp carried over", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const boat = transporter({ col: 5, row: 5, cargo: [{ id: 1, unitType: "tank", sp: 3 }] });
  s.units.push(boat);
  const [dest] = grid.neighborsOf(5, 5);

  unloadCargo(s, grid, boat.id, 1, dest.col, dest.row, 0);

  assert.equal(boat.cargo.length, 0);
  assert.equal(s.units.length, 2);
  const unloaded = s.units.find((u) => u.id === 1);
  assert.equal(unloaded.unitType, "tank");
  assert.equal(unloaded.sp, 3);
  assert.equal(unloaded.col, dest.col);
  assert.equal(unloaded.row, dest.row);
});

test("unloadCargo is a no-op if the boat isn't owned by the active player", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const boat = transporter({ col: 5, row: 5, ownerId: 1, cargo: [{ id: 1, unitType: "tank", sp: 10 }] });
  s.units.push(boat);
  const [dest] = grid.neighborsOf(5, 5);

  unloadCargo(s, grid, boat.id, 1, dest.col, dest.row, 0);
  assert.equal(boat.cargo.length, 1, "cargo untouched");
});

test("enterBaseWithCargo unloads the boat and every unit it's carrying into the garrison for free", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(5, 5, "shallow"); // the boat's own cell -- enterCost reads from here, not the base's
  const base = landBase({ type: "port", col: 6, row: 5, garrison: [] });
  s.bases.push(base);
  const boat = transporter({
    col: 5,
    row: 5,
    cargo: [
      { id: 1, unitType: "tank", sp: 10 },
      { id: 2, unitType: "tank", sp: 4 },
    ],
  });
  s.units.push(boat);

  enterBaseWithCargo(s, grid, boat.id, base.id, 0);

  assert.equal(s.units.length, 0);
  assert.equal(base.garrison.length, 3);
  assert.deepEqual(
    base.garrison.map((g) => g.id),
    [boat.id, 1, 2],
  );
});

test("enterBaseWithCargo works for an empty boat too", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(5, 5, "shallow");
  const base = landBase({ type: "port", col: 6, row: 5, garrison: [] });
  s.bases.push(base);
  const boat = transporter({ col: 5, row: 5 });
  s.units.push(boat);

  enterBaseWithCargo(s, grid, boat.id, base.id, 0);

  assert.equal(s.units.length, 0);
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].id, boat.id);
});

test("enterBaseWithCargo is rejected entirely (all-or-nothing) if there isn't room for the boat + all its cargo", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(5, 5, "shallow");
  // 13 already used, 2 spare -- room for the boat alone, but not the boat + its 2 cargo units.
  const base = landBase({
    type: "port",
    col: 6,
    row: 5,
    garrison: Array.from({ length: 13 }, (_, i) => ({ id: i, unitType: "tank", sp: 10 })),
  });
  s.bases.push(base);
  const boat = transporter({
    col: 5,
    row: 5,
    cargo: [
      { id: 100, unitType: "tank", sp: 10 },
      { id: 101, unitType: "tank", sp: 10 },
    ],
  });
  s.units.push(boat);

  enterBaseWithCargo(s, grid, boat.id, base.id, 0);

  assert.equal(s.units.length, 1, "boat stays in the field -- all-or-nothing");
  assert.equal(base.garrison.length, 13, "untouched");
});

// --- Stage 8: Plane rearm & fuel ---

test("moveUnit tracks a plane's cellsFlown (+1/hex) and actionsSpentMoving (+move cost)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const dest = grid.neighborsOf(5, 5)[0];
  grid.set(dest.col, dest.row, "mountain"); // fighter: mountain costs 2
  const unit = plane({ unitType: "fighter" });
  s.units.push(unit);

  moveUnit(s, grid, unit.id, dest.col, dest.row, 0);

  assert.equal(unit.cellsFlown, 1);
  assert.equal(unit.actionsSpentMoving, 2, "mountain costs 2 for a fighter");
});

test("moveUnit doesn't touch cellsFlown/actionsSpentMoving for a non-plane unit", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = tank({ col: 5, row: 5 });
  s.units.push(unit);
  const dest = grid.neighborsOf(5, 5)[0];

  moveUnit(s, grid, 0, dest.col, dest.row, 0);
  assert.equal(unit.cellsFlown, undefined);
  assert.equal(unit.actionsSpentMoving, undefined);
});

test("moveUnit crashes a plane (destroyed) the moment cellsFlown exceeds its roundTripRange", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = plane({ unitType: "fighter", cellsFlown: UNIT_TYPES.fighter.roundTripRange }); // already at budget
  s.units.push(unit);
  const dest = grid.neighborsOf(5, 5)[0];

  moveUnit(s, grid, unit.id, dest.col, dest.row, 0);

  assert.equal(s.units.length, 0, "one hex past the round-trip budget -- crashed");
});

test("moveUnit doesn't crash a plane still within its round-trip budget", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = plane({ unitType: "fighter", cellsFlown: UNIT_TYPES.fighter.roundTripRange - 1 });
  s.units.push(unit);
  const dest = grid.neighborsOf(5, 5)[0];

  moveUnit(s, grid, unit.id, dest.col, dest.row, 0);

  assert.equal(s.units.length, 1);
  assert.equal(unit.cellsFlown, UNIT_TYPES.fighter.roundTripRange);
});

test("planesOwingMovement lists a player's own under-moved planes, excluding one that's met the floor, one with no actions left, and other players' units", () => {
  const s = state([0], 0);
  const underMoved = plane({ id: 1, unitType: "fighter", actionsSpentMoving: 1 }); // < 8/2 = 4
  const metFloor = plane({ id: 2, unitType: "fighter", actionsSpentMoving: 4 });
  const outOfActions = plane({ id: 3, unitType: "fighter", actionsSpentMoving: 0, remainingActions: 0 });
  const enemyPlane = plane({ id: 4, unitType: "fighter", ownerId: 1, actionsSpentMoving: 0 });
  const groundUnit = tank({ id: 5, col: 5, row: 5, remainingActions: 5 });
  s.units.push(underMoved, metFloor, outOfActions, enemyPlane, groundUnit);

  const owing = planesOwingMovement(s, 0);
  assert.deepEqual(owing.map((u) => u.id), [1]);
});

test("isValidAttackTarget rejects a plane that's used up its rearm-limited strikes", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = plane({ unitType: "fighter", strikesUsed: UNIT_TYPES.fighter.maxStrikes });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  assert.equal(isValidAttackTarget(s, grid, attacker, defender), false);
});

test("attackUnit increments a plane's strikesUsed on a successful attack", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = plane({ unitType: "bomber" });
  const target = grid.neighborsOf(5, 5)[0]; // bomber's attack range is 1
  const defender = tank({ id: 1, ownerId: 1, col: target.col, row: target.row });
  s.units.push(attacker, defender);

  attackUnit(s, grid, attacker.id, 1, 0);

  assert.equal(attacker.strikesUsed, 1);
});

test("attackBase rejects and never damages once a plane's strikes are exhausted", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = plane({ unitType: "bomber", strikesUsed: UNIT_TYPES.bomber.maxStrikes, col: 5, row: 5 });
  const target = grid.neighborsOf(5, 5)[0];
  const base = landBase({ id: 9, ownerId: 1, col: target.col, row: target.row });
  s.units.push(attacker);
  s.bases.push(base);

  assert.equal(isValidAttackBaseTarget(s, grid, attacker, base), false);
  attackBase(s, grid, attacker.id, 9, 0);
  assert.equal(base.sp, base.maxSp, "no-op -- strikes exhausted");
});

test("loadUnit into a base always rearms a plane -- a later unload starts fresh at 0/0", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ type: "mountain", col: 6, row: 5, garrison: [] });
  s.bases.push(base);
  const unit = plane({ unitType: "fighter", col: 5, row: 5, strikesUsed: 3, cellsFlown: 80 });
  s.units.push(unit);

  loadUnit(s, grid, unit.id, base.id, 0);
  assert.equal(base.garrison[0].strikesUsed, undefined, "base entry carries no rearm state -- always rearms");

  unloadUnit(s, grid, base.id, unit.id, 5, 5, 0); // back onto its own now-vacant original hex
  const reFielded = s.units.find((u) => u.id === unit.id);
  assert.equal(reFielded.strikesUsed, 0);
  assert.equal(reFielded.cellsFlown, 0);
});

test("a Bomber can never board a Carrier at all -- isValidLoadIntoBoatTarget rejects it, loadIntoBoat is a no-op", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(6, 5, "shallow");
  const carrier = { ...transporter({ col: 6, row: 5 }), unitType: "carrier", sp: UNIT_TYPES.carrier.strength, maxSp: UNIT_TYPES.carrier.strength };
  s.units.push(carrier);
  const bomber = plane({ unitType: "bomber", col: 5, row: 5, strikesUsed: 1, cellsFlown: 40 });
  s.units.push(bomber);

  assert.equal(isValidLoadIntoBoatTarget(grid, bomber, carrier), false);
  loadIntoBoat(s, grid, bomber.id, carrier.id, 0);
  assert.equal(carrier.cargo.length, 0);
  assert.equal(s.units.length, 2, "bomber stays in the field");
});

test("a Fighter boards a Carrier and rearms on entry (strikesUsed/cellsFlown reset)", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  grid.set(6, 5, "shallow");
  const carrier = { ...transporter({ col: 6, row: 5 }), unitType: "carrier", sp: UNIT_TYPES.carrier.strength, maxSp: UNIT_TYPES.carrier.strength };
  s.units.push(carrier);
  const fighter = plane({ unitType: "fighter", col: 5, row: 5, strikesUsed: 2, cellsFlown: 60 });
  s.units.push(fighter);

  assert.equal(isValidLoadIntoBoatTarget(grid, fighter, carrier), true);
  loadIntoBoat(s, grid, fighter.id, carrier.id, 0);
  assert.equal(carrier.cargo[0].strikesUsed, undefined);
  assert.equal(carrier.cargo[0].cellsFlown, undefined);
});

test("processTurnStart resets a plane's actionsSpentMoving each turn but leaves strikesUsed/cellsFlown untouched", () => {
  const s = state([0], 0);
  const unit = plane({ unitType: "fighter", strikesUsed: 2, cellsFlown: 30, actionsSpentMoving: 5 });
  s.units.push(unit);

  processTurnStart(s, 0);

  assert.equal(unit.actionsSpentMoving, 0);
  assert.equal(unit.strikesUsed, 2);
  assert.equal(unit.cellsFlown, 30);
});

// --- Stage 9: Fog of war ---

test("markExplored merges the player's currently-visible cells into their persisted exploredCells, growing not resetting it", () => {
  const s = state([0], 0);
  s.players[0].exploredCells = [offsetKey(0, 0)]; // pre-existing, far from anything below
  const unit = tank({ col: 5, row: 5 });
  s.units.push(unit);

  markExplored(s, 0);

  const explored = s.players[0].exploredCells;
  assert.ok(explored.includes(offsetKey(0, 0)), "old entries survive");
  assert.ok(explored.includes(offsetKey(5, 5)), "the tank's own cell is now explored");
});

test("markExplored is a no-op for an unknown player id", () => {
  const s = state([0], 0);
  markExplored(s, 99);
  assert.deepEqual(s.players[0].exploredCells, []);
});

test("moveUnit persists the newly-visible destination cell into the mover's exploredCells", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = tank({ col: 5, row: 5 });
  s.units.push(unit);
  const dest = grid.neighborsOf(5, 5)[0];

  moveUnit(s, grid, 0, dest.col, dest.row, 0);

  assert.ok(s.players[0].exploredCells.includes(offsetKey(dest.col, dest.row)));
});

test("claimBase persists the newly-claimed base's view radius into the new owner's exploredCells", () => {
  const s = state([0], 0);
  const unit = tank({ col: 5, row: 5 });
  s.units.push(unit);
  const grid = allLandGrid();
  const base = landBase({ ownerId: null, lastOwnerId: 1, col: 6, row: 5, sp: 0 });
  s.bases.push(base);

  claimBase(s, grid, unit.id, base.id, 0);

  assert.ok(s.players[0].exploredCells.includes(offsetKey(6, 5)));
});

test("processTurnStart resyncs exploredCells as a passive baseline even if nothing moved", () => {
  const s = state([0], 0);
  const base = landBase({ ownerId: 0, col: 8, row: 8 });
  s.bases.push(base);

  processTurnStart(s, 0);

  assert.ok(s.players[0].exploredCells.includes(offsetKey(8, 8)));
});

// --- Stage 10: End game, outer loop ---

test("isEliminated is false for a player who owns a base, even with zero units", () => {
  const s = state([0], 0);
  s.bases.push(landBase({ ownerId: 0 }));
  assert.equal(isEliminated(s, 0), false);
});

test("isEliminated is false for a player who has a field unit, even with zero bases", () => {
  const s = state([0], 0);
  s.units.push(tank({ ownerId: 0 }));
  assert.equal(isEliminated(s, 0), false);
});

test("isEliminated is false for a player with a pending recapture (in-progress build at a neutral base they last owned)", () => {
  const s = state([0], 0);
  s.bases.push(landBase({ ownerId: null, lastOwnerId: 0, inProgress: { unitType: "tank", remainingTurns: 1 } }));
  assert.equal(isEliminated(s, 0), false);
});

test("isEliminated is true with no bases, no units, and no pending recapture", () => {
  const s = state([0], 0);
  assert.equal(isEliminated(s, 0), true);
});

test("isEliminated is true at a neutral base they last owned once its build is gone (no pending recapture left)", () => {
  const s = state([0], 0);
  s.bases.push(landBase({ ownerId: null, lastOwnerId: 0, inProgress: null }));
  assert.equal(isEliminated(s, 0), true);
});

test("checkGameEnd fires with the sole remaining owner once the other player is actually eliminated (no base, no units, no pending recapture)", () => {
  const s = state([0, 1], 0);
  s.bases.push(landBase({ id: 0, ownerId: 0 }), landBase({ id: 1, ownerId: null, lastOwnerId: 1, inProgress: null }));
  assert.deepEqual(checkGameEnd(s), { ended: true, winnerId: 0 });
});

test("checkGameEnd doesn't fire while multiple players still own bases", () => {
  const s = state([0, 1], 0);
  s.bases.push(landBase({ id: 0, ownerId: 0 }), landBase({ id: 1, ownerId: 1 }));
  assert.deepEqual(checkGameEnd(s), { ended: false, winnerId: null });
});

test("checkGameEnd does NOT fire just because only one player currently owns a base, if another player still has a pending recapture (not eliminated)", () => {
  // The scenario this test exists for: player 0 is the sole current base owner, but player 1
  // hasn't been eliminated yet -- they still have a build in progress at a neutral base they
  // last owned (isEliminated's own pending-recapture exception, game spec §7). The match must
  // not end out from under that recapture attempt just because player 0 is, for the moment, the
  // only one who currently *owns* a base.
  const s = state([0, 1], 0);
  s.bases.push(
    landBase({ id: 0, ownerId: 0 }),
    landBase({ id: 1, ownerId: null, lastOwnerId: 1, inProgress: { unitType: "tank", remainingTurns: 1 } }),
  );
  assert.deepEqual(checkGameEnd(s), { ended: false, winnerId: null });
});

test("checkGameEnd doesn't fire when every base is simultaneously neutral but every player still has a pending recapture", () => {
  const s = state([0, 1], 0);
  s.bases.push(
    landBase({ id: 0, ownerId: null, lastOwnerId: 0, inProgress: { unitType: "tank", remainingTurns: 1 } }),
    landBase({ id: 1, ownerId: null, lastOwnerId: 1, inProgress: { unitType: "tank", remainingTurns: 2 } }),
  );
  assert.deepEqual(checkGameEnd(s), { ended: false, winnerId: null });
});

test("endTurn sets gameEnded/winnerId and stops advancing turns once every other player is actually eliminated", () => {
  const s = state([0, 1, 2], 0);
  ownABase(s, [0]); // only player 0 owns a base; players 1 and 2 have nothing at all -- eliminated
  endTurn(s);
  assert.equal(s.gameEnded, true);
  assert.equal(s.winnerId, 0);
  assert.equal(s.turnIndex, 0, "no further turn advancement once the game has ended");
});

test("endTurn skips an eliminated player's slot, landing on the next player still in the game", () => {
  const s = state([0, 1, 2], 0); // ending player 0's turn -- player 1 is up next, but is eliminated
  ownABase(s, [0, 2]); // player 1 owns nothing and has no units -- eliminated
  endTurn(s);
  assert.equal(s.turnIndex, 2, "skipped straight past player 1's slot");
});

test("endTurn is bounded (doesn't hang) even if every remaining player looks eliminated", () => {
  const s = state([0, 1, 2], 0); // nobody owns a base -- checkGameEnd sees 0 owners, doesn't fire
  endTurn(s); // every isEliminated check is true; the loop must still terminate
  assert.equal(typeof s.turnIndex, "number");
});

test("terminate sets terminated without touching gameEnded/winnerId", () => {
  const s = state([0], 0);
  terminate(s);
  assert.equal(s.terminated, true);
  assert.equal(s.gameEnded, undefined);
  assert.equal(s.winnerId, undefined);
});

test("attackUnit bumps the defender's unitsLost once destroyed, not the attacker's", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5, sp: 1 });
  s.units.push(attacker, defender);
  s.players.push({ id: 1, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } });

  attackUnit(s, grid, 0, 1, 0);

  assert.equal(s.players.find((p) => p.id === 1).stats.unitsLost, 1);
  assert.equal(s.players[0].stats.unitsLost, 0);
});

test("attackBase bumps the base owner's unitsLost once per garrisoned unit destroyed", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const attacker = plane({ unitType: "bomber", col: 5, row: 5 }); // groundAtk 8, attack range 1
  const target = grid.neighborsOf(5, 5)[0];
  const base = landBase({
    id: 9,
    ownerId: 1,
    col: target.col,
    row: target.row,
    sp: 20,
    garrison: [
      { id: 100, unitType: "tank", sp: 10 },
      { id: 101, unitType: "tank", sp: 10 },
    ],
  });
  s.units.push(attacker);
  s.bases.push(base);
  s.players.push({ id: 1, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } });

  attackBase(s, grid, attacker.id, 9, 0);

  assert.equal(s.players.find((p) => p.id === 1).stats.unitsLost, 2, "both garrisoned tanks destroyed");
});

test("moveUnit's fuel crash bumps the plane's own unitsLost", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const unit = plane({ unitType: "fighter", cellsFlown: UNIT_TYPES.fighter.roundTripRange });
  s.units.push(unit);
  const dest = grid.neighborsOf(5, 5)[0];

  moveUnit(s, grid, unit.id, dest.col, dest.row, 0);

  assert.equal(s.players[0].stats.unitsLost, 1);
});

test("processTurnStart bumps unitsBuilt on a normal build completion, and on a recapture completion for the recapturing player", () => {
  const s = state([0], 0);
  const base = landBase({ ownerId: 0, inProgress: { unitType: "tank", remainingTurns: 1 } });
  s.bases.push(base);
  processTurnStart(s, 0);
  assert.equal(s.players[0].stats.unitsBuilt, 1);

  const neutralBase = landBase({ id: 5, ownerId: null, lastOwnerId: 0, inProgress: { unitType: "tank", remainingTurns: 1 } });
  s.bases.push(neutralBase);
  processTurnStart(s, 0);
  assert.equal(s.players[0].stats.unitsBuilt, 2, "the recapture completion also counts as a build");
});

test("loading/unloading/claiming a unit never bumps unitsBuilt or unitsLost -- relocation isn't destruction", () => {
  const s = state([0], 0);
  const grid = allLandGrid();
  const base = landBase({ ownerId: 0, col: 6, row: 5, garrison: [{ id: 1, unitType: "tank", sp: 10 }] });
  s.bases.push(base);

  unloadUnit(s, grid, base.id, 1, 5, 5, 0);
  assert.deepEqual(s.players[0].stats, { unitsBuilt: 0, unitsLost: 0 });

  loadUnit(s, grid, 1, base.id, 0);
  assert.deepEqual(s.players[0].stats, { unitsBuilt: 0, unitsLost: 0 });
});
