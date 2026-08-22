import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Node 18 (this project's target, see the WSL toolchain notes) has no global localStorage —
// a minimal in-memory shim is enough for these tests.
function installLocalStorageShim() {
  let store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}
installLocalStorageShim();

const { hasSave, saveGame, loadGame, clearSave } = await import("../../src/save/save-load.js");
const { createGameState, playerBase } = await import("../../src/state/game-state.js");
const { queueBuild, processTurnStart, unloadUnit } = await import("../../src/state/commands.js");
const { buildTurns } = await import("../../src/state/unit-types.js");
const { deserializeGrid } = await import("../../src/map/map-serialize.js");
const { mulberry32 } = await import("../../src/map/prng.js");

beforeEach(() => {
  localStorage.clear();
});

test("hasSave is false with no save, true after saving", () => {
  assert.equal(hasSave(), false);
  saveGame({ turnNumber: 1 });
  assert.equal(hasSave(), true);
});

test("loadGame returns null with no save", () => {
  assert.equal(loadGame(), null);
});

test("saveGame -> loadGame round-trips the state", () => {
  const state = { turnNumber: 3, players: [{ id: 0 }], nested: { a: [1, 2, 3] } };
  saveGame(state);
  assert.deepEqual(loadGame(), state);
});

test("a real game state, including bases with a queued/in-progress build and a garrisoned unit, round-trips exactly (Stage 4)", () => {
  const mapData = {
    size: "small",
    type: "landOnly",
    width: 20,
    height: 20,
    rows: Array.from({ length: 20 }, () => "g".repeat(20)),
  };
  const options = { aiDifficulties: ["easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(1));

  const base = state.bases[0];
  queueBuild(state, base.id, "tank", base.ownerId);
  queueBuild(state, base.id, "tank", base.ownerId); // second one sits in the queue, not yet in-progress
  processTurnStart(state, base.ownerId); // tick the in-progress build once

  saveGame(state);
  const loaded = loadGame();
  assert.deepEqual(loaded, state);
  assert.equal(loaded.bases[0].inProgress.remainingTurns, base.inProgress.remainingTurns);
  assert.deepEqual(loaded.bases[0].queue, base.queue);
});

test("a field unit round-trips exactly through save/load (Stage 10 -- state.units has been part of canonical state since Stage 5, no unit-specific save/load code needed)", () => {
  const mapData = {
    size: "small",
    type: "landOnly",
    width: 20,
    height: 20,
    rows: Array.from({ length: 20 }, () => "g".repeat(20)),
  };
  const options = { aiDifficulties: ["easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(1));
  const grid = deserializeGrid(state.map.width, state.map.height, state.map.rows);

  const base = playerBase(state, 0);
  queueBuild(state, base.id, "tank", 0);
  for (let i = 0; i < buildTurns("tank"); i++) processTurnStart(state, 0); // tick the build to completion
  // The whole map is empty gras -- any in-map neighbor works (base placement doesn't guarantee
  // distance from the map edge, so not every one of the 6 is necessarily in bounds).
  const dest = grid.neighborsOf(base.col, base.row).find((n) => grid.isInMap(n.col, n.row));
  unloadUnit(state, grid, base.id, base.garrison[0].id, dest.col, dest.row, 0);

  saveGame(state);
  const loaded = loadGame();
  assert.deepEqual(loaded, state);
  assert.equal(loaded.units.length, 1);
  assert.deepEqual(loaded.units[0], state.units[0]);
});

test("clearSave removes the save", () => {
  saveGame({ turnNumber: 1 });
  clearSave();
  assert.equal(hasSave(), false);
  assert.equal(loadGame(), null);
});
