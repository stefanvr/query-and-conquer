/**
 * Balanced strategy (design doc §9):
 *  1. If damaged, retreat to repair (as Defensive).
 *  2. Else attack an enemy in range.
 *  3. Else, if a known unclaimed base exists and this unit can capture
 *     it, move toward it.
 *  4. Else move toward the nearest known enemy -- but never leave a
 *     base with zero units in view range to do so.
 * Build order: an even mix. Target priority: lowest remaining strength
 * (same simplification as Aggressive for v1).
 *
 * A garrisoned unit ("base-defender", §9) tries rule 2 first (attack in
 * range). If nothing's in range, it exits the base -- Balanced still
 * wants to expand/engage (rules 3-4), so a freshly-built unit needs to
 * actually leave to do that (see priorityWalk.js's module doc). Rule
 * 4's "never leave a base undefended" guard still applies on
 * SUBSEQUENT iterations once it's a field unit, so this doesn't bypass
 * that check -- it just lets the unit reach the point where the check
 * can matter in the first place.
 */
import { findRepairCapableFriendlyBase, findNearestUnclaimedBase, findNearestKnownEnemy, wouldLeaveABaseUndefended } from "../helpers.js";
import { offsetDistance } from "../../hex/distance.js";
import { UNIT_DEFS } from "../../units/unitDefs.js";

export const BUILD_ORDER = ["tank", "fighter", "transporter", "fregat", "bomber", "carrier"];
export const TARGET_PRIORITY = "lowest-strength";

function attackRule(unit, state, viewerId, deps) {
  const candidates = deps.findAttackCandidates(unit, state, viewerId);
  if (candidates.length === 0) return null;
  return { action: "attack", target: deps.chooseTarget(candidates, state, TARGET_PRIORITY) };
}

/**
 * @param {object} unit
 * @param {{state: object, viewerId: number|string, deps: object}} ctx
 * @returns {{action: "attack"|"move"|"enter"|"none", target?: object, destination?: object, baseId?: number|string}}
 */
export function decide(unit, { state, viewerId, deps }) {
  if (unit.garrisonedAt != null) {
    return attackRule(unit, state, viewerId, deps) ?? { action: "exit", baseId: unit.garrisonedAt };
  }

  const maxStrength = UNIT_DEFS[unit.type].strength;
  if (unit.strength < maxStrength) {
    const repairBase = findRepairCapableFriendlyBase(unit, state, viewerId);
    if (repairBase) {
      if (offsetDistance(unit.position, repairBase.position) <= 1) {
        return { action: "enter", baseId: repairBase.id };
      }
      return { action: "move", destination: deps.stepToward(unit, repairBase.position, state) };
    }
  }

  const attack = attackRule(unit, state, viewerId, deps);
  if (attack) return attack;

  if (UNIT_DEFS[unit.type].canCapture) {
    const unclaimed = findNearestUnclaimedBase(unit, state);
    if (unclaimed) return { action: "move", destination: deps.stepToward(unit, unclaimed.position, state) };
  }

  const nearestEnemy = findNearestKnownEnemy(unit, state, viewerId);
  if (nearestEnemy) {
    if (wouldLeaveABaseUndefended(unit, state, viewerId)) return { action: "none" };
    return { action: "move", destination: deps.stepToward(unit, nearestEnemy.position, state) };
  }

  return { action: "none" };
}
