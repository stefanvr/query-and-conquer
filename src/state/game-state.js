// Canonical game state — the "command" side of tech-stack.md's CQRS-lite split. Only
// commands.js mutates this; everything else (rendering, UI, easy AI) reads through
// queries.js's getVisibleState. Stage 3 has no bases/units yet, so the shape here is
// deliberately minimal — just enough for the outer game loop (turn order, map reference).
import { shuffle } from "../map/prng.js";

/** Fixed player-slot -> accent-color token, per style-guide.md §3 (independent of turn order). */
export const PLAYER_COLOR_VARS = ["--p-human", "--p-ai-1", "--p-ai-2", "--p-ai-3", "--p-ai-4", "--p-ai-5"];

/**
 * @param {{ aiDifficulties: string[], mapSize: string, mapType: string, fogOfWar: boolean }} options
 * @param {object} mapData - parsed map JSON (size, type, shape, width, height, rows, seed)
 * @param {() => number} rng
 */
export function createGameState(options, mapData, rng) {
  const players = [
    { id: 0, slot: 0, isHuman: true, difficulty: null },
    ...options.aiDifficulties.map((difficulty, i) => ({
      id: i + 1,
      slot: i + 1,
      isHuman: false,
      difficulty,
    })),
  ];

  return {
    options,
    map: mapData,
    players,
    turnOrder: shuffle(rng, players.map((p) => p.id)), // randomized once at game start (§7)
    turnIndex: 0,
    turnNumber: 1,
    terminated: false,
  };
}

export function activePlayer(state) {
  return state.players.find((p) => p.id === state.turnOrder[state.turnIndex]);
}
