/**
 * Defensive strategy (design doc §9):
 *  1. If damaged and a friendly base can repair it this turn, retreat
 *     toward it.
 *  2. Else attack an enemy in range that's threatening a friendly base
 *     (within that base's view).
 *  3. Else hold near the nearest friendly base -- only move toward it
 *     if farther away than (that base's view + this unit's view).
 *  4. Idle at full strength with no threat present: takes no action.
 * Build order: cheapest to most expensive by bbt. Target priority:
 * highest attack value first (neutralize the biggest threat).
 *
 * "Expansion" (a spare capturing-eligible unit pathfinding toward the
 * nearest unclaimed base) is listed in the doc as a bullet alongside
 * "Build order"/"Target priority", not as a 5th numbered rule -- but
 * its own qualifier, "only if not needed for defense (rules 1-2 always
 * take priority)", pins down exactly where it slots in: after rules
 * 1-2 have already had their chance to fire (and didn't), for a
 * capturing-eligible unit specifically, before falling back to
 * hold-near-base. That's a purely per-unit check (no cross-unit "is
 * anyone else free" coordination needed), consistent with §9's
 * per-unit-greedy-loop simplification.
 *
 * A garrisoned unit ("base-defender", §9) only ever tries rule 2
 * (attack). Unlike Aggressive/Balanced (which exit an idle garrisoned
 * unit to go advance/expand -- see priorityWalk.js's module doc),
 * Defensive deliberately does NOT auto-exit here: its whole intent is
 * to hold/defend, and a garrisoned unit with nothing to shoot at is
 * already doing exactly that (already being repaired passively by
 * repairTick, rule 1 doesn't apply to it, and rule 4's "idle at full
 * strength with no threat present: takes no action" describes this
 * situation precisely).
 */
import { findRepairCapableFriendlyBase, findNearestFriendlyBase, findNearestUnclaimedBase, isThreateningFriendlyBase } from "../helpers.js";
import { offsetDistance } from "../../hex/distance.js";
import { UNIT_DEFS } from "../../units/unitDefs.js";
import { BASE_DEFS } from "../../buildings/baseDefs.js";

export const BUILD_ORDER = ["tank", "transporter", "fighter", "fregat", "bomber", "carrier"];
export const TARGET_PRIORITY = "highest-attack";

function threatAttackRule(unit, state, viewerId, deps) {
  const candidates = deps.findAttackCandidates(unit, state, viewerId).filter((c) => isThreateningFriendlyBase(c, state, viewerId));
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
    return threatAttackRule(unit, state, viewerId, deps) ?? { action: "none" };
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

  const attack = threatAttackRule(unit, state, viewerId, deps);
  if (attack) return attack;

  if (UNIT_DEFS[unit.type].canCapture) {
    const unclaimed = findNearestUnclaimedBase(unit, state);
    if (unclaimed) return { action: "move", destination: deps.stepToward(unit, unclaimed.position, state) };
  }

  const nearestBase = findNearestFriendlyBase(unit, state, viewerId);
  if (nearestBase) {
    const distance = offsetDistance(unit.position, nearestBase.position);
    const threshold = BASE_DEFS[state.bases.find((b) => b.id === nearestBase.id).type].view + UNIT_DEFS[unit.type].view;
    if (distance > threshold) {
      return { action: "move", destination: deps.stepToward(unit, nearestBase.position, state) };
    }
  }

  return { action: "none" };
}
