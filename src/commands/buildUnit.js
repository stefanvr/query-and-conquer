/**
 * Command handler: queue a unit build at a base (design doc §2).
 * Building is governed entirely by the turn-based bbt timer, not the
 * per-unit action-point economy -- queuing a build costs no actions.
 *
 * Capacity (15, garrisoned + in-progress builds) only gates STARTING a
 * build (occupying the one currentBuild slot); the queue itself is
 * independently capped at 5 pending orders and doesn't count against
 * capacity, since nothing has been "built" yet for a merely-queued
 * order -- "A build in progress occupies 1 capacity slot" (singular).
 *
 * canBuildAt() is exported and reused by src/ui/input.js to compute
 * which build buttons should be disabled -- one source of truth for
 * "is this actually buildable right now", so the UI's disabled state
 * can never drift out of sync with what this command will actually
 * accept.
 */
import { BASE_DEFS, BUILD_COST_MULTIPLIER, BUILD_TIME_TURNS, MAX_BASE_CAPACITY, MAX_BUILD_QUEUE } from "../buildings/baseDefs.js";
import { neighborsInBounds } from "../hex/neighbors.js";

/**
 * @param {object} canonicalState
 * @param {{baseId: number, unitType: string}} payload
 * @returns {{success: boolean, reason?: string, startedImmediately?: boolean}}
 */
export function buildUnit(canonicalState, { baseId, unitType }) {
  const base = canonicalState.bases.find((b) => b.id === baseId);
  if (!base) return { success: false, reason: "No such base." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (base.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your base, or not your turn." };
  }

  const check = canBuildAt(canonicalState, base, unitType);
  if (!check.buildable) return { success: false, reason: check.reason };

  if (!base.currentBuild) {
    base.currentBuild = newBuildOrder(unitType);
    return { success: true, startedImmediately: true };
  }

  base.buildQueue.push(unitType);
  return { success: true, startedImmediately: false };
}

/**
 * Whether `unitType` can be built at `base` right now -- base-type
 * eligibility (design doc §2), the carrier deep-water siting rule, and
 * capacity/queue headroom. Ownership is deliberately NOT checked here
 * (that's a per-player command-dispatch concern, not a property of the
 * base itself) -- callers that need it check separately.
 * @param {object} canonicalState
 * @param {object} base
 * @param {string} unitType
 * @returns {{buildable: boolean, reason?: string}}
 */
export function canBuildAt(canonicalState, base, unitType) {
  if (!BASE_DEFS[base.type].canBuild.includes(unitType)) {
    return { buildable: false, reason: `A ${base.type} base can't build a ${unitType}.` };
  }
  // Design doc §2: the deep-water-adjacency clause for carriers is
  // written INSIDE the Port base row's location-requirement cell, not
  // as a standalone universal rule. Scoping it to port bases only was
  // the actual fix here -- applied to every base type, it made "Build
  // carrier" permanently, unconditionally impossible at a land base
  // (land bases are BY DEFINITION never adjacent to any water), even
  // though land bases can build "All vehicles" per the same table.
  if (unitType === "carrier" && base.type === "port" && !isAdjacentToDeepWater(base.position, canonicalState.map)) {
    return { buildable: false, reason: "Carriers can only be built adjacent to deep water." };
  }
  if (!base.currentBuild) {
    if (base.garrison.length + 1 > MAX_BASE_CAPACITY) {
      return { buildable: false, reason: "Base is at capacity." };
    }
  } else if (base.buildQueue.length >= MAX_BUILD_QUEUE) {
    return { buildable: false, reason: "Build queue is full." };
  }
  return { buildable: true };
}

/** @returns {{unitType: string, turnsRemaining: number}} */
export function newBuildOrder(unitType) {
  return { unitType, turnsRemaining: BUILD_TIME_TURNS * BUILD_COST_MULTIPLIER[unitType] };
}

function isAdjacentToDeepWater(position, map) {
  const { terrain, width, height } = map;
  return neighborsInBounds(position, width, height).some((n) => terrain[n.row][n.col] === "deep");
}
