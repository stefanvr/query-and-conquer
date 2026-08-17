/**
 * getVisibleState(canonicalState, viewerId) -- the CQRS "query" seam.
 *
 * This is the ONE function rendering, human UI, and easy-difficulty AI
 * are allowed to read game state through (design doc's fog-of-war
 * rules, §5; tech-stack.md's "State access rule"). Nothing else reads
 * canonicalState directly except command handlers (which mutate it,
 * Stage 4+) and hard-difficulty AI (the one documented exception,
 * Stage 7).
 *
 * As of Stage 3, there are no players/units/fog yet, so this is a thin
 * terrain-only projection -- but the renderer already calls this, and
 * never canonicalState, from this stage on. Stage 4 extends it with
 * real per-viewer fog-of-war filtering via src/queries/fog.js.
 *
 * @param {object} canonicalState
 * @param {string|number} [viewerId] - unused until Stage 4's fog filtering
 * @returns {object} filtered projection safe for the given viewer
 */
export function getVisibleState(canonicalState, viewerId) {
  return {
    map: canonicalState.map,
  };
}
