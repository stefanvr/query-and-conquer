// Canonical game state — the "command" side of tech-stack.md's CQRS-lite split. Only
// commands.js mutates this; everything else (rendering, UI, easy AI) reads through
// queries.js's getVisibleState.
import { shuffle } from "../map/prng.js";
import { deserializeGrid } from "../map/map-serialize.js";
import { placeBases, neutralBaseCount, neutralBaseStartingSp } from "./base-placement.js";
import { BASE_TYPES } from "./base-types.js";
import { assignStrategies } from "../ai/strategies.js";

/** Fixed player-slot -> accent-color token, per style-guide.md §3 (independent of turn order). */
export const PLAYER_COLOR_VARS = ["--p-human", "--p-ai-1", "--p-ai-2", "--p-ai-3", "--p-ai-4", "--p-ai-5"];

/** "Human"/`AI n` + accent color for a player, or "Neutral"/steel-gray for an unowned base
 * (`player` null) — shared by the HUD turn indicator, the base panel's owner line, and the End
 * screen's stats dialog (implementation-spec.md §2/§4/§6/§9). */
export function playerLabel(player) {
  if (!player) return { text: "Neutral", colorVar: "--steel" };
  return { text: player.isHuman ? "Human" : `AI ${player.slot}`, colorVar: PLAYER_COLOR_VARS[player.slot] };
}

/**
 * @param {{ aiDifficulties: string[], mapSize: string, mapType: string, fogOfWar: boolean }} options
 * @param {object} mapData - parsed map JSON (size, type, shape, width, height, rows, seed)
 * @param {() => number} rng
 */
export function createGameState(options, mapData, rng) {
  // Strategy is assigned once here and fixed for the match, alongside each AI's own difficulty —
  // the two are independent axes (game spec §8): strategy is intent, difficulty is execution.
  const strategies = assignStrategies(options.aiDifficulties.length, (items) => shuffle(rng, items));
  const players = [
    { id: 0, slot: 0, isHuman: true, difficulty: null, strategy: null, exploredCells: [], stats: { unitsBuilt: 0, unitsLost: 0 } },
    ...options.aiDifficulties.map((difficulty, i) => ({
      id: i + 1,
      slot: i + 1,
      isHuman: false,
      difficulty,
      strategy: strategies[i], // "aggressive" | "defensive" | "balanced" (game spec §8)
      exploredCells: [], // fog of war (game spec §6) — "col,row" keys, persisted across turns
      stats: { unitsBuilt: 0, unitsLost: 0 }, // end-of-game stats dialog (implementation-spec.md §9)
    })),
  ];

  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const neutralCount = neutralBaseCount(players.length, grid);
  const sites = placeBases(grid, players.map((p) => p.id), rng, { neutralCount });
  const bases = sites.map((site, i) => {
    const strength = BASE_TYPES[site.type].strength;
    return {
      id: i,
      ownerId: site.ownerId,
      lastOwnerId: null, // set when a base goes neutral (§4) — who to auto-recapture it for
      type: site.type,
      col: site.col,
      row: site.row,
      adjacentToDeepWater: site.adjacentToDeepWater ?? false,
      // A neutral base starts at half strength (game spec §5) — an owned one at full, undamaged.
      sp: site.ownerId === null ? neutralBaseStartingSp(strength) : strength,
      maxSp: strength,
      garrison: [],
      queue: [],
      inProgress: null,
    };
  });

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
