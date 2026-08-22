// Canonical game state — the "command" side of tech-stack.md's CQRS-lite split. Only
// commands.js mutates this; everything else (rendering, UI, easy AI) reads through
// queries.js's getVisibleState.
import { shuffle } from "../map/prng.js";
import { deserializeGrid } from "../map/map-serialize.js";
import { placeBases } from "./base-placement.js";
import { BASE_TYPES } from "./base-types.js";

/** Fixed player-slot -> accent-color token, per style-guide.md §3 (independent of turn order). */
export const PLAYER_COLOR_VARS = ["--p-human", "--p-ai-1", "--p-ai-2", "--p-ai-3", "--p-ai-4", "--p-ai-5"];

/**
 * @param {{ aiDifficulties: string[], mapSize: string, mapType: string, fogOfWar: boolean }} options
 * @param {object} mapData - parsed map JSON (size, type, shape, width, height, rows, seed)
 * @param {() => number} rng
 */
export function createGameState(options, mapData, rng) {
  const players = [
    { id: 0, slot: 0, isHuman: true, difficulty: null, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } },
    ...options.aiDifficulties.map((difficulty, i) => ({
      id: i + 1,
      slot: i + 1,
      isHuman: false,
      difficulty,
      exploredCells: [], // fog of war (game spec §6) — "col,row" keys, persisted across turns
      stats: { unitsBuilt: 0, unitsLost: 0 }, // end-of-game stats dialog (implementation-spec.md §9)
    })),
  ];

  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const sites = placeBases(grid, players.map((p) => p.id), rng);
  const bases = sites.map((site, i) => ({
    id: i,
    ownerId: site.ownerId,
    lastOwnerId: null, // set when a base goes neutral (§4) — who to auto-recapture it for
    type: site.type,
    col: site.col,
    row: site.row,
    adjacentToDeepWater: site.adjacentToDeepWater ?? false,
    sp: BASE_TYPES[site.type].strength,
    maxSp: BASE_TYPES[site.type].strength,
    garrison: [],
    queue: [],
    inProgress: null,
  }));

  return {
    options,
    map: mapData,
    players,
    bases,
    units: [], // field units (Stage 5+) — garrisoned units live in their base's own garrison instead
    nextUnitId: 0, // shared counter for unit ids, bumped as builds complete
    turnOrder: shuffle(rng, players.map((p) => p.id)), // randomized once at game start (§7)
    turnIndex: 0,
    turnNumber: 1,
    terminated: false,
  };
}

export function activePlayer(state) {
  return state.players.find((p) => p.id === state.turnOrder[state.turnIndex]);
}

export function playerBase(state, playerId) {
  return state.bases.find((b) => b.ownerId === playerId);
}

export function baseAtHex(state, col, row) {
  return state.bases.find((b) => b.col === col && b.row === row);
}

export function unitAtHex(state, col, row) {
  return state.units.find((u) => u.col === col && u.row === row);
}
