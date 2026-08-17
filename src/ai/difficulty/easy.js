/**
 * Easy AI (design doc §9's difficulty table):
 *  - Information: respects fog of war -- reads exclusively via
 *    getVisibleState, same as a human player and per tech-stack.md's
 *    "State access rule". This is the first real exercise of that
 *    seam being usable by something other than rendering/human UI.
 *  - Targeting: first valid target found, no optimization -- ignores
 *    the strategy's own target-priority rule entirely.
 *  - Pathing: naive -- moves toward whichever neighbor cell is
 *    geometrically closest to the goal (by raw hex distance), ignoring
 *    terrain-cost optimality and not routing around obstacles.
 *  - Action efficiency: a naive move that turns out to be
 *    impassable/occupied just fails -- priorityWalk.js stops
 *    processing that unit for the rest of its actions this turn rather
 *    than trying an alternate route, which is exactly what "often
 *    leaves actions unspent/wasted" describes.
 *  - Reaction: only responds to currently visible threats -- a natural
 *    consequence of reading through getVisibleState, which already
 *    hides non-visible enemies.
 *
 * Provides the "deps" bundle strategies (src/ai/strategies/*.js) call
 * into for difficulty-specific execution, keeping strategy modules
 * unaware of which difficulty is driving them.
 */
import { getVisibleState } from "../../queries/getVisibleState.js";
import { offsetDistance } from "../../hex/distance.js";
import { hasLineOfSight } from "../../hex/lineOfSight.js";
import { neighborsInBounds } from "../../hex/neighbors.js";
import { UNIT_DEFS } from "../../units/unitDefs.js";

export function createEasyDeps() {
  return {
    /**
     * @param {object} canonicalState
     * @param {number|string} aiPlayerId
     * @returns {object} the same fog-filtered projection a human would see
     */
    getState(canonicalState, aiPlayerId) {
      return getVisibleState(canonicalState, aiPlayerId);
    },

    /**
     * Enemy units/bases within `unit`'s attack range + LOS, from the
     * OBSERVABLE (already fog-filtered) state handed in -- so a target
     * outside current view never shows up here in the first place.
     * @returns {{kind: "unit"|"base", id: number|string, position: object, strength: number}[]}
     */
    findAttackCandidates(unit, state, viewerId) {
      const def = UNIT_DEFS[unit.type];
      const candidates = [];

      for (const other of state.units) {
        if (other.ownerId === viewerId || other.garrisonedAt != null) continue;
        if (offsetDistance(unit.position, other.position) > def.attackRange) continue;
        if (def.needsLineOfSight && !clearLineOfSight(unit.position, other.position, state)) continue;
        candidates.push({ kind: "unit", id: other.id, position: other.position, strength: other.strength });
      }
      for (const base of state.bases) {
        if (base.ownerId == null || base.ownerId === viewerId) continue;
        if (offsetDistance(unit.position, base.position) > def.attackRange) continue;
        if (def.needsLineOfSight && !clearLineOfSight(unit.position, base.position, state)) continue;
        candidates.push({ kind: "base", id: base.id, position: base.position, strength: base.strength });
      }
      return candidates;
    },

    /**
     * "First valid target found (no optimization)" -- easy AI ignores
     * the strategy's target-priority rule entirely and always takes
     * whatever came first in findAttackCandidates' iteration order
     * (units before bases; each in canonicalState.units/.bases order,
     * which is creation order -- stable and deterministic).
     */
    chooseTarget(candidates) {
      return candidates[0];
    },

    /**
     * Naive pathing: the single neighbor cell that minimizes raw hex
     * distance to the goal, ignoring terrain-cost optimality. Doesn't
     * check passability itself -- the resulting moveUnit dispatch will
     * simply fail if this neighbor turns out to be impassable/occupied,
     * which is what "may waste actions on obstacles" describes.
     * @returns {{col: number, row: number}}
     */
    stepToward(unit, targetPos, state) {
      const neighbors = neighborsInBounds(unit.position, state.map.width, state.map.height);
      let best = neighbors[0];
      let bestDist = Infinity;
      for (const n of neighbors) {
        const d = offsetDistance(n, targetPos);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      return best;
    },
  };
}

function clearLineOfSight(from, to, state) {
  return hasLineOfSight(from, to, { terrain: state.map.terrain, units: state.units, bases: state.bases });
}
