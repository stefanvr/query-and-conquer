// Cleans up small ragged holes left by frontier blob growth (terrain-body.js/shallow-water.js
// necessarily leave a few stray unclaimed cells near a growth boundary) by merging any land or
// water component smaller than the 4x4 minimum into a bordering body. Runs before texturing, so
// merges only ever deal in the 3 coarse categories ("land"/"shallow"/"deep"), not the 4 land
// sub-terrains — texturing paints over "land" afterward regardless of how it got there.
//
// Land is preferred as the merge target whenever a violating body borders any land at all: land
// has no adjacency rule of its own, so merging into it can never create a new shallow/deep
// violation. A body with no land border (fully boxed in by one water type) merges into that
// water type instead. validate-map.js is still the final authority — generate.js discards and
// retries any candidate this pass doesn't fully fix.
import { findComponents } from "./grid.js";
import { MIN_BODY_EXTENT, isLandTerrain, isWaterTerrain } from "./map-tables.js";

// This runs before texturing (see generate.js), when untextured land cells still carry the
// "land" placeholder rather than a real gras/gravel/mountain/sand value — so "land" counts as
// the land category here too, alongside the 4 real terrains (for tests/callers that run it after
// texturing instead, cells are always one or the other, never both, so this stays correct).
const isLandCategory = (t) => t === "land" || isLandTerrain(t);
const isWaterCategory = isWaterTerrain;

export function fillSmallBodies(grid, maxIterations = 20) {
  for (let iter = 0; iter < maxIterations; iter++) {
    const components = [
      ...findComponents(grid, isLandCategory),
      ...findComponents(grid, isWaterCategory),
    ];
    let changed = false;

    for (const c of components) {
      const width = c.maxCol - c.minCol + 1;
      const height = c.maxRow - c.minRow + 1;
      if (width >= MIN_BODY_EXTENT && height >= MIN_BODY_EXTENT) continue;

      const componentKeys = new Set(c.cells.map(({ col, row }) => `${col},${row}`));
      const borderCounts = {};
      for (const { col, row } of c.cells) {
        for (const n of grid.neighborsOf(col, row)) {
          if (componentKeys.has(`${n.col},${n.row}`)) continue;
          const t = grid.get(n.col, n.row);
          borderCounts[t] = (borderCounts[t] || 0) + 1;
        }
      }

      const best = (predicate) =>
        Object.entries(borderCounts)
          .filter(([t]) => predicate(t))
          .sort((a, b) => b[1] - a[1])[0]?.[0];
      const mergeInto = best(isLandCategory) ?? best(isWaterCategory);
      if (!mergeInto) continue; // no neighbors at all — shouldn't happen on a connected map

      for (const { col, row } of c.cells) grid.set(col, row, mergeInto);
      changed = true;
    }
    if (!changed) break;
  }
}
