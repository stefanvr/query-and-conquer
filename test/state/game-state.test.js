import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameState, activePlayer } from "../../src/state/game-state.js";
import { mulberry32 } from "../../src/map/prng.js";

const mapData = { size: "small", type: "landOnly", width: 4, height: 4, rows: ["gggg", "gggg", "gggg", "gggg"] };

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
