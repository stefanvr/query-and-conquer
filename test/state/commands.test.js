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
  isValidAttackTarget,
  attackUnit,
  attackBase,
  claimBase,
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

  loadUnit(s, grid, 7, 0);

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

  loadUnit(s, grid, 7, 0); // active player 0, unit owned by 1
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

  loadUnit(s, grid, 7, 0);
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

  loadUnit(s, grid, 7, 0);
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
  const attacker = tank({ col: 5, row: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  assert.equal(isValidAttackTarget(attacker, defender), true);
});

test("isValidAttackTarget rejects same owner, out of range, or no attacks/actions left", () => {
  const attacker = tank({ col: 5, row: 5 });
  const friendly = tank({ id: 1, ownerId: 0, col: 6, row: 5 });
  const farEnemy = tank({ id: 2, ownerId: 1, col: 8, row: 5 });
  assert.equal(isValidAttackTarget(attacker, friendly), false, "same owner");
  assert.equal(isValidAttackTarget(attacker, farEnemy), false, "out of range");
  assert.equal(isValidAttackTarget(tank({ col: 5, row: 5, remainingAttacks: 0 }), farEnemy), false, "no attacks left");
  assert.equal(isValidAttackTarget(tank({ col: 5, row: 5, remainingActions: 0 }), farEnemy), false, "no actions left");
});

test("attackUnit applies the attacker's ground atk against a ground defender's sp, spending 1 action + 1 attack", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5 });
  s.units.push(attacker, defender);

  attackUnit(s, 0, 1, 0);

  assert.equal(defender.sp, UNIT_TYPES.tank.strength - UNIT_TYPES.tank.groundAtk);
  assert.equal(attacker.remainingActions, UNIT_TYPES.tank.actionsPerTurn - 1);
  assert.equal(attacker.remainingAttacks, UNIT_TYPES.tank.attacksPerTurn - 1);
});

test("attackUnit uses the attacker's air atk against an air-target-type defender", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5 });
  const defender = { id: 1, ownerId: 1, unitType: "fighter", col: 6, row: 5, sp: UNIT_TYPES.fighter.strength, maxSp: UNIT_TYPES.fighter.strength, remainingActions: 5, remainingAttacks: 1 };
  s.units.push(attacker, defender);

  attackUnit(s, 0, 1, 0);

  assert.equal(defender.sp, UNIT_TYPES.fighter.strength - UNIT_TYPES.tank.airAtk);
});

test("attackUnit destroys the defender (removed from state.units) once sp reaches 0", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  const defender = tank({ id: 1, ownerId: 1, col: 6, row: 5, sp: 1 });
  s.units.push(attacker, defender);

  attackUnit(s, 0, 1, 0);

  assert.equal(s.units.length, 1);
  assert.equal(s.units[0].id, 0);
});

test("attackUnit is a no-op if the attacker isn't owned by the active player", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5, ownerId: 1 });
  const defender = tank({ id: 1, ownerId: 0, col: 6, row: 5 });
  s.units.push(attacker, defender);

  attackUnit(s, 0, 1, 0); // active player 0, attacker owned by 1
  assert.equal(defender.sp, UNIT_TYPES.tank.strength, "no damage dealt");
});

test("attackBase destroys garrisoned units oldest-first before any damage spills onto base sp", () => {
  const s = state([0], 0);
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

  attackBase(s, 0, base.id, 0); // groundAtk 4 -> kills both garrisoned units (1 SP each), 2 damage carries onto base

  assert.equal(base.garrison.length, 0);
  assert.equal(base.sp, 18);
  assert.equal(base.ownerId, 1, "still owned -- sp didn't reach 0");
});

test("attackBase drops the base to neutral once sp hits 0, remembering lastOwnerId", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const base = landBase({ ownerId: 1, col: 6, row: 5, sp: 3, garrison: [] });
  s.bases.push(base);

  attackBase(s, 0, base.id, 0);

  assert.equal(base.sp, 0);
  assert.equal(base.ownerId, null);
  assert.equal(base.lastOwnerId, 1);
});

test("attackBase never destroys a unit still under construction", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const base = landBase({ ownerId: 1, col: 6, row: 5, sp: 3, garrison: [], inProgress: { unitType: "tank", remainingTurns: 2 } });
  s.bases.push(base);

  attackBase(s, 0, base.id, 0);

  assert.equal(base.ownerId, null);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: 2 });
});

test("attackBase is a no-op against a neutral or friendly base", () => {
  const s = state([0], 0);
  const attacker = tank({ col: 5, row: 5, remainingAttacks: 5 });
  s.units.push(attacker);
  const neutral = landBase({ id: 1, ownerId: null, col: 6, row: 5, sp: 0 });
  const friendly = landBase({ id: 2, ownerId: 0, col: 5, row: 6, sp: 20 });
  s.bases.push(neutral, friendly);

  attackBase(s, 0, neutral.id, 0);
  attackBase(s, 0, friendly.id, 0);

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
