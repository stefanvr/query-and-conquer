import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameState, activePlayer, playerBase } from "../../src/state/game-state.js";
import { neutralBaseCount } from "../../src/state/base-placement.js";
import { deserializeGrid } from "../../src/map/map-serialize.js";
import { mulberry32 } from "../../src/map/prng.js";

// 20x20 all-gras — large enough to fit several bases at the required min-distance apart
// (base-placement.test.js covers the placement algorithm itself in depth).
const mapData = {
  size: "small",
  type: "landOnly",
  width: 20,
  height: 20,
  rows: Array.from({ length: 20 }, () => "g".repeat(20)),
};

test("creates one human player plus one AI per difficulty entry", () => {
  const options = { aiDifficulties: ["easy", "easy", "hard"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(1));
  assert.equal(state.players.length, 4);
  assert.equal(state.players[0].isHuman, true);
  assert.deepEqual(
    state.players.slice(1).map((p) => p.difficulty),
    ["easy", "easy", "hard"],
  );
});

test("turnOrder is a permutation of all player ids", () => {
  const options = { aiDifficulties: ["easy", "easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(2));
  assert.deepEqual([...state.turnOrder].sort(), [0, 1, 2]);
});

test("same seed reproduces the same turn order", () => {
  const options = { aiDifficulties: ["easy", "hard", "easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const a = createGameState(options, mapData, mulberry32(99));
  const b = createGameState(options, mapData, mulberry32(99));
  assert.deepEqual(a.turnOrder, b.turnOrder);
});

test("activePlayer resolves the player at the current turnIndex", () => {
  const options = { aiDifficulties: ["easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(3));
  const expected = state.players.find((p) => p.id === state.turnOrder[0]);
  assert.deepEqual(activePlayer(state), expected);
});

test("places one base per player, each starting at full strength with an empty garrison/queue", () => {
  const options = { aiDifficulties: ["easy", "hard"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(4));
  const ownedBases = state.bases.filter((b) => b.ownerId !== null);
  assert.equal(ownedBases.length, 3);
  assert.deepEqual(
    ownedBases.map((b) => b.ownerId).sort(),
    [0, 1, 2],
  );
  for (const base of ownedBases) {
    assert.equal(base.sp, base.maxSp);
    assert.deepEqual(base.garrison, []);
    assert.deepEqual(base.queue, []);
    assert.equal(base.inProgress, null);
  }
});

test("also seeds neutral bases (game spec §5), at half strength with the same empty state", () => {
  const options = { aiDifficulties: ["easy", "hard"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(4));
  // game spec §5's own formula, computed independently rather than hand-derived here -- its
  // correctness is base-placement.test.js's job; this just confirms createGameState wires it in.
  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const expectedNeutralCount = neutralBaseCount(3, grid);
  const neutralBases = state.bases.filter((b) => b.ownerId === null);
  assert.equal(neutralBases.length, expectedNeutralCount);
  assert.equal(state.bases.length, 3 + expectedNeutralCount, "3 owned + neutral");
  for (const base of neutralBases) {
    assert.equal(base.sp, base.maxSp / 2, "half strength, a stored value only (§5)");
    assert.equal(base.lastOwnerId, null, "never owned before -- no recapture rule applies");
    assert.deepEqual(base.garrison, []);
    assert.deepEqual(base.queue, []);
    assert.equal(base.inProgress, null);
  }
});

test("playerBase finds the base owned by a given player", () => {
  const options = { aiDifficulties: ["easy"], mapSize: "small", mapType: "landOnly", fogOfWar: true };
  const state = createGameState(options, mapData, mulberry32(5));
  const base = playerBase(state, 1);
  assert.equal(base.ownerId, 1);
});
