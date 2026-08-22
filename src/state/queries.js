// Read side of tech-stack.md's CQRS-lite / state-access rule. Rendering and UI must go through
// this, never touch canonical state directly — a deliberate seam established from Stage 3
// onward. Stage 9 (Fog of war) fills in real per-viewer filtering (implementation-spec.md §5).
import { offsetKey } from "../map/hex-coords.js";
import { currentlyVisibleCells } from "./visibility.js";

/** @param {object} canonicalState @param {number} viewerId
 * @returns {object} `canonicalState` when `options.fogOfWar` is off (today's passthrough
 * behavior, unchanged); otherwise the same object with `bases`/`units` filtered and a `fog:
 * { exploredCells, visibleCells }` field added (both `Set<string>` of "col,row" keys) for the
 * renderer's three-state treatment. A base stays visible once its cell has ever been explored
 * (a fixed structure, like terrain); a unit needs to be within *current* view (game spec §6). */
export function getVisibleState(canonicalState, viewerId) {
  if (!canonicalState.options.fogOfWar) return canonicalState;

  const player = canonicalState.players.find((p) => p.id === viewerId);
  const visibleCells = currentlyVisibleCells(canonicalState, viewerId);
  const exploredCells = new Set(player?.exploredCells ?? []);
  for (const key of visibleCells) exploredCells.add(key); // currently-visible always counts as explored for display, even before the next persisted sync (commands.js's markExplored)

  return {
    ...canonicalState,
    bases: canonicalState.bases.filter((b) => exploredCells.has(offsetKey(b.col, b.row))),
    units: canonicalState.units.filter((u) => visibleCells.has(offsetKey(u.col, u.row))),
    fog: { exploredCells, visibleCells },
  };
}
