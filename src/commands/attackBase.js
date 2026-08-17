/**
 * Command handler: attack a claimed (enemy-owned) base (design doc §4).
 * Bases are always "ground" targets (§3), so the attacker's
 * groundAttack value is used regardless of attacker type. On the base
 * hitting 0 strength it goes NEUTRAL (not captured by the attacker) --
 * design doc §4 is explicit that destroying it isn't the same as
 * taking it; claiming a neutral base is a separate action
 * (src/commands/claimBase.js).
 *
 * Garrisoned units CAN attack -- see attackUnit.js's module doc for why
 * (design doc §9's "base-defenders" AI category, and §4's "garrisoned
 * units contribute to a base's combined defense", both require it).
 * Also enforces the "Attacks/turn" cap from §3 (1, every unit type).
 */
import { UNIT_DEFS } from "../units/unitDefs.js";
import { offsetDistance } from "../hex/distance.js";
import { hasLineOfSight } from "../hex/lineOfSight.js";
import { resolveBaseAttack } from "../combat/resolveBaseAttack.js";

/**
 * @param {object} canonicalState
 * @param {{attackerUnitId: number, baseId: number}} payload
 * @returns {{success: boolean, reason?: string, destroyedUnitIds?: (number|string)[], baseDamageDealt?: number, wentNeutral?: boolean}}
 */
export function attackBase(canonicalState, { attackerUnitId, baseId }) {
  const attacker = canonicalState.units.find((u) => u.id === attackerUnitId);
  const base = canonicalState.bases.find((b) => b.id === baseId);
  if (!attacker || !base) return { success: false, reason: "No such unit or base." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (attacker.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (base.ownerId == null) {
    return { success: false, reason: "Base is unclaimed -- claim it instead of attacking it." };
  }
  if (base.ownerId === attacker.ownerId) {
    return { success: false, reason: "Can't attack your own base." };
  }
  if (attacker.actionsRemaining < 1) {
    return { success: false, reason: "No actions remaining." };
  }
  if (attacker.attacksUsedThisTurn >= UNIT_DEFS[attacker.type].attacksPerTurn) {
    return { success: false, reason: "Already attacked this turn." };
  }

  const def = UNIT_DEFS[attacker.type];
  const distance = offsetDistance(attacker.position, base.position);
  if (distance > def.attackRange) {
    return { success: false, reason: "Base out of range." };
  }
  if (def.needsLineOfSight) {
    const { terrain } = canonicalState.map;
    const clear = hasLineOfSight(attacker.position, base.position, {
      terrain,
      units: canonicalState.units,
      bases: canonicalState.bases,
    });
    if (!clear) return { success: false, reason: "No line of sight to base." };
  }

  attacker.actionsRemaining -= 1;
  attacker.attacksUsedThisTurn += 1;
  const previousOwnerId = base.ownerId;
  const { destroyedUnitIds, baseDamageDealt, wentNeutral } = resolveBaseAttack(base, def.groundAttack);

  if (destroyedUnitIds.length > 0) {
    const destroyedSet = new Set(destroyedUnitIds);
    canonicalState.units = canonicalState.units.filter((u) => !destroyedSet.has(u.id));
    const defenderOwner = canonicalState.players.find((p) => p.id === previousOwnerId);
    if (defenderOwner) defenderOwner.stats.unitsLost += destroyedUnitIds.length;
  }

  if (wentNeutral) {
    base.previousOwnerId = previousOwnerId;
    base.ownerId = null;
    base.strength = 0;
    // A build already in progress survives the base sitting neutral
    // (design doc §4) -- currentBuild/buildQueue are deliberately left
    // untouched here; only capture-by-a-different-player clears them
    // (src/commands/claimBase.js).
  }

  return { success: true, destroyedUnitIds, baseDamageDealt, wentNeutral };
}
