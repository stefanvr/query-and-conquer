/**
 * Command handler: move a unit (design doc §3). "No partial moves; 0 =
 * impassable" is enforced by bounding the pathfind search to the
 * unit's remaining action budget (maxCost) -- if the destination isn't
 * reachable within that budget, the whole move is rejected rather than
 * moving as far as affordable.
 *
 * Fighter/bomber additionally track cumulative distance flown this
 * sortie against roundTripRangeLimit (§3) -- exceeding it crashes the
 * unit (destroyed, same as a combat kill: removed from canonical
 * state, counted in the owner's unitsLost). Distance is counted in hex
 * cells moved (path length), not action-point cost, matching the
 * doc's "100-cell"/"200-cell" phrasing. Resets to 0 on enterBase.js
 * (returning to base/carrier to rearm/refuel).
 */
import { findPath } from "../hex/pathfinding.js";
import { moveCostFor, UNIT_DEFS } from "../units/unitDefs.js";
import { updateExploredCells } from "../queries/fog.js";

/**
 * @param {object} canonicalState
 * @param {{unitId: number, destination: {col: number, row: number}}} payload
 * @returns {{success: boolean, reason?: string, cost?: number, path?: object[], crashed?: boolean}}
 */
export function moveUnit(canonicalState, { unitId, destination }) {
  const unit = canonicalState.units.find((u) => u.id === unitId);
  if (!unit) return { success: false, reason: "No such unit." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (unit.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (unit.garrisonedAt != null) {
    return { success: false, reason: "Unit is garrisoned -- exit the base first." };
  }

  const { width, height, terrain } = canonicalState.map;

  // One unit per cell, regardless of player (design doc §1) -- occupied
  // cells (other than the mover's own current cell) are impassable.
  // Garrisoned units are the doc's explicit exception (bases can hold up
  // to 15 units on their own cell) -- they don't block movement onto or
  // through it.
  const occupiedKeys = new Set(
    canonicalState.units
      .filter((u) => u.id !== unit.id && u.garrisonedAt == null)
      .map((u) => `${u.position.col},${u.position.row}`)
  );

  function costFn(to) {
    if (occupiedKeys.has(`${to.col},${to.row}`)) return Infinity;
    return moveCostFor(unit.type, terrain[to.row][to.col]);
  }

  const result = findPath({
    start: unit.position,
    goal: destination,
    width,
    height,
    costFn,
    maxCost: unit.actionsRemaining,
  });

  if (!result) {
    return { success: false, reason: "Unreachable within remaining actions." };
  }

  unit.position = destination;
  unit.actionsRemaining -= result.cost;
  updateExploredCells(canonicalState, unit.ownerId);

  const rangeLimit = UNIT_DEFS[unit.type].roundTripRangeLimit;
  if (rangeLimit != null) {
    unit.distanceFlownThisSortie += result.path.length - 1; // cells moved, not action-point cost
    if (unit.distanceFlownThisSortie > rangeLimit) {
      canonicalState.units = canonicalState.units.filter((u) => u.id !== unit.id);
      const owner = canonicalState.players.find((p) => p.id === unit.ownerId);
      if (owner) owner.stats.unitsLost += 1;
      return { success: true, cost: result.cost, path: result.path, crashed: true };
    }
  }

  return { success: true, cost: result.cost, path: result.path };
}
