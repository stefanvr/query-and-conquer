/**
 * Shared decision-support helpers used by all three strategies
 * (src/ai/strategies/*.js) -- "nearest known enemy", "nearest
 * unclaimed base", "nearest unexplored cell", "nearest friendly base",
 * "is this base able to take in a damaged unit for repair", "is this
 * target threatening one of my bases". Kept here instead of duplicated
 * per-strategy so the three strategy files only contain what's
 * actually STRATEGY-specific (design doc §9's priority-list rules).
 *
 * All of these read from `state` -- the observable state a difficulty
 * module's getState() produced (fog-filtered for easy, full for hard,
 * Stage 7) -- never canonicalState directly, so a strategy's decisions
 * automatically respect whatever information boundary the difficulty
 * axis is supposed to enforce (design doc §9: "Strategy defines
 * intent... Difficulty defines execution quality... independent axes").
 *
 * "Nearest" is always measured from the acting unit's own current
 * position (§9), and ties are broken by lowest ID for determinism.
 */
import { offsetDistance, cellsWithinRadius } from "../hex/distance.js";
import { UNIT_DEFS } from "../units/unitDefs.js";
import { BASE_DEFS, MAX_BASE_CAPACITY } from "../buildings/baseDefs.js";

/**
 * @param {object} unit
 * @param {object} state - observable state (fog-filtered or full)
 * @param {number|string} viewerId
 * @returns {{kind: "unit"|"base", id: number|string, position: object}|null}
 */
export function findNearestKnownEnemy(unit, state, viewerId) {
  const candidates = [
    ...state.units
      .filter((u) => u.ownerId !== viewerId && u.garrisonedAt == null)
      .map((u) => ({ kind: "unit", id: u.id, position: u.position })),
    ...state.bases
      .filter((b) => b.ownerId != null && b.ownerId !== viewerId)
      .map((b) => ({ kind: "base", id: b.id, position: b.position })),
  ];
  return nearestByDistance(unit.position, candidates);
}

/**
 * @param {object} unit
 * @param {object} state
 * @returns {object|null} nearest unclaimed base (ownerId == null)
 */
export function findNearestUnclaimedBase(unit, state) {
  const candidates = state.bases.filter((b) => b.ownerId == null).map((b) => ({ kind: "base", id: b.id, position: b.position }));
  return nearestByDistance(unit.position, candidates);
}

/**
 * @param {object} unit
 * @param {number|string} viewerId
 * @returns {object|null} nearest base this player owns
 */
export function findNearestFriendlyBase(unit, state, viewerId) {
  const candidates = state.bases.filter((b) => b.ownerId === viewerId).map((b) => ({ kind: "base", id: b.id, position: b.position }));
  return nearestByDistance(unit.position, candidates);
}

/**
 * Nearest friendly base with room to garrison one more unit -- a
 * simple proxy for design doc §9's "a friendly base can repair it this
 * turn" (exact per-turn repair-slot prediction would need simulating
 * the other 4 parallel-repair slots and garrison arrival order;
 * "has room to accept the unit at all" is the documented simplification).
 * @param {object} unit
 * @param {object} state
 * @param {number|string} viewerId
 * @returns {object|null}
 */
export function findRepairCapableFriendlyBase(unit, state, viewerId) {
  const candidates = state.bases
    .filter((b) => b.ownerId === viewerId)
    .filter((b) => {
      const inProgressSlot = b.currentBuild ? 1 : 0;
      return b.garrison.length + inProgressSlot < MAX_BASE_CAPACITY;
    })
    .map((b) => ({ kind: "base", id: b.id, position: b.position }));
  return nearestByDistance(unit.position, candidates);
}

/**
 * Nearest cell this player hasn't explored yet -- an expanding-ring
 * search outward from the unit (cheap in the common case: stops at the
 * first ring containing any unexplored cell, rather than scanning the
 * whole map). Only meaningful for easy AI's fog-respecting observable
 * state; a hard-AI "full map knowledge" state (Stage 7) would never
 * have unexplored cells to find in the first place.
 * @param {object} unit
 * @param {object} state - must carry fogState (getVisibleState's projection)
 * @returns {{col: number, row: number}|null}
 */
export function findNearestUnexploredCell(unit, state) {
  const { width, height, fogState } = state.map;
  if (!fogState) return null;
  const maxRadius = width + height;

  for (let radius = 1; radius <= maxRadius; radius++) {
    const ring = cellsWithinRadius(unit.position, radius, width, height).filter(
      (c) => offsetDistance(unit.position, c) === radius
    );
    const unexplored = ring.filter((c) => fogState[c.row][c.col] === "unexplored");
    if (unexplored.length > 0) {
      unexplored.sort((a, b) => a.row - b.row || a.col - b.col);
      return unexplored[0];
    }
  }
  return null;
}

/**
 * Is `candidate` (an attack target) within some friendly base's view
 * range -- design doc §9 Defensive rule 2: "an enemy in range that's
 * threatening a friendly base (within that base's view)".
 * @param {{position: {col: number, row: number}}} candidate
 * @param {object} state
 * @param {number|string} viewerId
 * @returns {boolean}
 */
export function isThreateningFriendlyBase(candidate, state, viewerId) {
  return state.bases
    .filter((b) => b.ownerId === viewerId)
    .some((b) => offsetDistance(b.position, candidate.position) <= BASE_DEFS[b.type].view);
}

/**
 * Would moving `unit` away leave some friendly base with zero units in
 * its view range -- design doc §9 Balanced rule 4: "never leave a base
 * with zero units in view range to do so".
 * @param {object} unit
 * @param {object} state
 * @param {number|string} viewerId
 * @returns {boolean}
 */
export function wouldLeaveABaseUndefended(unit, state, viewerId) {
  const friendlyBases = state.bases.filter((b) => b.ownerId === viewerId);
  const friendlyFieldUnits = state.units.filter((u) => u.ownerId === viewerId && u.garrisonedAt == null);

  for (const base of friendlyBases) {
    const viewRange = BASE_DEFS[base.type].view;
    const covering = friendlyFieldUnits.filter((u) => offsetDistance(u.position, base.position) <= viewRange);
    if (covering.length === 1 && covering[0].id === unit.id) return true;
  }
  return false;
}

/**
 * A rough "how dangerous is this target" score for target-priority
 * comparisons (hard AI, Stage 7) -- the higher of its ground/air
 * attack values. Not used by easy AI (which always picks the first
 * candidate found, design doc §9's difficulty table), but computed now
 * so the candidate shape is forward-compatible.
 * @param {{kind: "unit"|"base", id: number|string}} candidate
 * @param {object} state
 * @returns {number}
 */
export function threatScore(candidate, state) {
  if (candidate.kind === "base") return 0;
  const unit = state.units.find((u) => u.id === candidate.id);
  if (!unit) return 0;
  const def = UNIT_DEFS[unit.type];
  return Math.max(def.groundAttack, def.airAttack);
}

/**
 * @param {{col: number, row: number}} from
 * @param {{id: number|string, position: {col: number, row: number}}[]} candidates
 * @returns {object|null} the nearest candidate, ties broken by lowest ID
 */
function nearestByDistance(from, candidates) {
  if (candidates.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = offsetDistance(from, c.position);
    if (d < bestDist || (d === bestDist && c.id < best.id)) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
