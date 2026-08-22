// Fog of war's shared vision-footprint computation (game spec §6, implementation-spec.md §5) —
// pure, read-only, no state mutation, so both commands.js (to persist "explored") and queries.js
// (to compute "currently visible" for the render projection) import this instead of each hand-
// rolling their own copy. View range is a pure hex-distance radius (game spec §1), not blocked by
// mountains/units/bases the way attack LOS is — no per-unit-type toggle in the design doc, so
// it's unconditional here.
import { hexesInRange, offsetKey } from "../map/hex-coords.js";
import { UNIT_TYPES } from "./unit-types.js";
import { BASE_TYPES } from "./base-types.js";

/** Every cell within `playerId`'s current view — the union of `hexesInRange` around each of their
 * own field units and owned bases, using each one's own `view` stat. Garrisoned/cargo units don't
 * independently contribute (they're inside a container, not exposed); the container's own
 * position/view already covers wherever it sits. Recomputed fresh every call — this only depends
 * on current canonical positions, nothing needs to persist here (see commands.js's markExplored
 * for the one thing that does). @returns {Set<string>} "col,row" keys, bounded to the map's own
 * width/height (an out-of-map key is harmless but pointless to keep around). */
export function currentlyVisibleCells(state, playerId) {
  const { width, height } = state.map;
  const inBounds = (col, row) => col >= 0 && col < width && row >= 0 && row < height;
  const cells = new Set();

  function addRange(center, view) {
    for (const c of hexesInRange(center, view)) {
      if (inBounds(c.col, c.row)) cells.add(offsetKey(c.col, c.row));
    }
  }

  for (const unit of state.units) {
    if (unit.ownerId === playerId) addRange(unit, UNIT_TYPES[unit.unitType].view);
  }
  for (const base of state.bases) {
    if (base.ownerId === playerId) addRange(base, BASE_TYPES[base.type].view);
  }
  return cells;
}
