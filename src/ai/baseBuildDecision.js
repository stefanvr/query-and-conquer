/**
 * Design doc §9: "Each base independently evaluates its build-priority
 * list once per turn, skipping down the list to the first type it's
 * actually allowed to build; if the base is at capacity or its queue
 * is full, it skips production that turn." Reuses buildUnit.js's own
 * canBuildAt() (the same check the HUD's disabled-button state uses)
 * so a base never queues something it couldn't actually build.
 */
import { canBuildAt } from "../commands/buildUnit.js";
import { dispatch } from "../commands/index.js";

/**
 * @param {object} canonicalState
 * @param {number|string} aiPlayerId
 * @param {{BUILD_ORDER: string[]}} strategy
 */
export function decideBaseBuilds(canonicalState, aiPlayerId, strategy) {
  for (const base of canonicalState.bases) {
    if (base.ownerId !== aiPlayerId) continue;

    for (const unitType of strategy.BUILD_ORDER) {
      if (canBuildAt(canonicalState, base, unitType).buildable) {
        dispatch(canonicalState, "buildUnit", { baseId: base.id, unitType });
        break;
      }
    }
    // No type in BUILD_ORDER was buildable this turn (capacity/queue
    // full) -- skip production for this base, per §9.
  }
}
