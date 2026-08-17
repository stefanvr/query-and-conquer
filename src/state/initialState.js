/**
 * Canonical state factory. This is the shape everything else in the
 * app is built around -- command handlers (Stage 4+) are the only code
 * allowed to mutate it; everyone else reads through
 * src/queries/getVisibleState.js.
 *
 * Most fields below are unused until later stages (players/units/bases
 * are empty, turn info is inert) but are established now so the shape
 * doesn't get retrofitted piecemeal. See the implementation plan's
 * "Canonical state fields beyond position/strength" risk note for
 * what Stage 4/5 will still need to add to units/bases specifically.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * @param {{size: string, type: string, width: number, height: number, terrain: string[][]}} map
 * @returns {object} canonical state
 */
export function createInitialState({ size, type, width, height, terrain }) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    map: { size, type, width, height, terrain },
    players: [],
    units: [],
    bases: [],
    turn: {
      number: 1,
      activePlayerIndex: 0,
    },
    // Shared ID sequence for every unit/base, so entity IDs never
    // collide across types (useful once combat/targeting needs to
    // reference "this unit or base" generically, and for the AI
    // lowest-ID tie-break rule in design doc §9).
    nextEntityId: 1,
  };
}

/**
 * @param {object} canonicalState
 * @returns {number} a fresh, unique entity ID
 */
export function allocateEntityId(canonicalState) {
  return canonicalState.nextEntityId++;
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {boolean[][]} a fresh all-unexplored grid, used as a
 * player's persistent fog-of-war memory (design doc §5 -- explored
 * cells stay revealed once seen). Lives here rather than in
 * src/queries/fog.js because it's part of the player state shape;
 * fog.js (which computes and merges INTO this grid) imports it from
 * here, keeping the state -> queries dependency direction consistent.
 */
export function createExploredGrid(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(false));
}

/**
 * Adds a player to canonical state and returns it. `kind` distinguishes
 * human from AI (AI-specific fields like strategy/difficulty are added
 * in Stage 6 -- this just establishes the player list and each
 * player's persistent fog-of-war memory).
 * @param {object} canonicalState
 * @param {{kind: "human"|"ai"}} opts
 * @returns {object} the newly created player
 */
export function addPlayer(canonicalState, { kind }) {
  const { width, height } = canonicalState.map;
  const player = {
    id: allocateEntityId(canonicalState),
    kind,
    exploredGrid: createExploredGrid(width, height),
  };
  canonicalState.players.push(player);
  return player;
}
