/**
 * Command handler: open-field unit attack (design doc §3). "Attacking
 * costs 1 action." Range/LOS are per the attacker's stats
 * (src/units/unitDefs.js); a unit that needs line of sight cannot
 * attack through a blocking mountain/unit/base.
 */
import { UNIT_DEFS } from "../units/unitDefs.js";
import { offsetDistance } from "../hex/distance.js";
import { hasLineOfSight } from "../hex/lineOfSight.js";
import { resolveOpenFieldCombat } from "../combat/resolveOpenFieldCombat.js";

/**
 * @param {object} canonicalState
 * @param {{attackerUnitId: number, defenderUnitId: number}} payload
 * @returns {{success: boolean, reason?: string, attackValue?: number, destroyed?: boolean}}
 */
export function attackUnit(canonicalState, { attackerUnitId, defenderUnitId }) {
  const attacker = canonicalState.units.find((u) => u.id === attackerUnitId);
  const defender = canonicalState.units.find((u) => u.id === defenderUnitId);
  if (!attacker || !defender) return { success: false, reason: "No such unit." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (attacker.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (attacker.garrisonedAt != null) {
    return { success: false, reason: "Garrisoned units can't attack -- exit the base first." };
  }
  if (defender.ownerId === attacker.ownerId) {
    return { success: false, reason: "Can't attack your own unit." };
  }
  if (attacker.actionsRemaining < 1) {
    return { success: false, reason: "No actions remaining." };
  }

  const def = UNIT_DEFS[attacker.type];
  const distance = offsetDistance(attacker.position, defender.position);
  if (distance > def.attackRange) {
    return { success: false, reason: "Target out of range." };
  }
  if (def.needsLineOfSight) {
    const { terrain } = canonicalState.map;
    const clear = hasLineOfSight(attacker.position, defender.position, {
      terrain,
      units: canonicalState.units,
      bases: canonicalState.bases,
    });
    if (!clear) return { success: false, reason: "No line of sight to target." };
  }

  attacker.actionsRemaining -= 1;
  const { attackValue, destroyed } = resolveOpenFieldCombat(attacker, defender);

  if (destroyed) {
    canonicalState.units = canonicalState.units.filter((u) => u.id !== defender.id);
    const defenderOwner = canonicalState.players.find((p) => p.id === defender.ownerId);
    if (defenderOwner) defenderOwner.stats.unitsLost += 1;
  }

  return { success: true, attackValue, destroyed };
}
