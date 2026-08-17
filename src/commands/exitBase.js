/**
 * Command handler: un-garrison a unit, back to a field unit standing on
 * the base's cell (design doc §3: "unloading ... a base costs 1
 * action"). Actually leaving the cell afterward is a separate, normal
 * moveUnit command paying its own terrain cost -- see moveUnit.js's
 * module doc for why "entering/exiting costs 2 actions total" is
 * implemented as two separate steps rather than a flat override of
 * terrain-based move cost.
 */

/**
 * @param {object} canonicalState
 * @param {{unitId: number}} payload
 * @returns {{success: boolean, reason?: string}}
 */
export function exitBase(canonicalState, { unitId }) {
  const unit = canonicalState.units.find((u) => u.id === unitId);
  if (!unit) return { success: false, reason: "No such unit." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (unit.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (unit.garrisonedAt == null) {
    return { success: false, reason: "Unit isn't garrisoned." };
  }
  if (unit.actionsRemaining < 1) {
    return { success: false, reason: "No actions remaining." };
  }

  const base = canonicalState.bases.find((b) => b.id === unit.garrisonedAt);
  if (base) base.garrison = base.garrison.filter((id) => id !== unit.id);

  unit.actionsRemaining -= 1;
  unit.garrisonedAt = null;

  return { success: true };
}
