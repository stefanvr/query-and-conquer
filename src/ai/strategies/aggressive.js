/**
 * Aggressive strategy (design doc §9):
 *  1. Attack any enemy unit/base in range.
 *  2. Else move toward the nearest known enemy unit/base.
 *  3. Else move toward the nearest unexplored area or unclaimed base.
 *  4. Never retreats -- fights or advances until destroyed.
 * Build order: cheap combat units first. Target priority: lowest
 * remaining strength (finish off weakened targets).
 *
 * A garrisoned unit ("base-defender", §9) tries rule 1 first (attack in
 * range, defending in place). If nothing's in range, it exits the base
 * instead of idling -- Aggressive's whole intent is to advance, so a
 * freshly-built unit sitting in garrison forever would never do that
 * (see priorityWalk.js's module doc). Exiting spends 1 action; the loop
 * then re-evaluates it as a normal field unit with whatever's left.
 */
import { findNearestKnownEnemy, findNearestUnclaimedBase, findNearestUnexploredCell } from "../helpers.js";
import { offsetDistance } from "../../hex/distance.js";

export const BUILD_ORDER = ["tank", "fighter", "bomber", "fregat", "carrier", "transporter"];
export const TARGET_PRIORITY = "lowest-strength";

function attackRule(unit, state, viewerId, deps) {
  const candidates = deps.findAttackCandidates(unit, state, viewerId);
  if (candidates.length === 0) return null;
  return { action: "attack", target: deps.chooseTarget(candidates, state, TARGET_PRIORITY) };
}

/**
 * @param {object} unit
 * @param {{state: object, viewerId: number|string, deps: object}} ctx
 * @returns {{action: "attack"|"move"|"none", target?: object, destination?: object}}
 */
export function decide(unit, { state, viewerId, deps }) {
  if (unit.garrisonedAt != null) {
    return attackRule(unit, state, viewerId, deps) ?? { action: "exit", baseId: unit.garrisonedAt };
  }

  const attack = attackRule(unit, state, viewerId, deps);
  if (attack) return attack;

  const nearestEnemy = findNearestKnownEnemy(unit, state, viewerId);
  if (nearestEnemy) {
    return { action: "move", destination: deps.stepToward(unit, nearestEnemy.position, state) };
  }

  // "Nearest unexplored area OR unclaimed base" -- a genuine comparison
  // between the two categories (whichever is actually closer), not a
  // fallback chain that always prefers one over the other.
  const explorationTarget = nearerOfUnexploredOrUnclaimedBase(unit, state);
  if (explorationTarget) {
    return { action: "move", destination: deps.stepToward(unit, explorationTarget, state) };
  }

  return { action: "none" };
}

function nearerOfUnexploredOrUnclaimedBase(unit, state) {
  const unexplored = findNearestUnexploredCell(unit, state);
  const unclaimedBase = findNearestUnclaimedBase(unit, state);
  if (!unexplored) return unclaimedBase?.position ?? null;
  if (!unclaimedBase) return unexplored;

  const unexploredDist = offsetDistance(unit.position, unexplored);
  const unclaimedDist = offsetDistance(unit.position, unclaimedBase.position);
  return unexploredDist <= unclaimedDist ? unexplored : unclaimedBase.position;
}
