import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid, findComponents } from "../../src/map/grid.js";
import { textureLandTerrain } from "../../src/map/terrain-texture.js";
import { mulberry32 } from "../../src/map/prng.js";
import { LAND_TERRAINS } from "../../src/map/map-tables.js";

function allLandGrid(size) {
  const grid = new TerrainGrid(size, size, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "land");
  return grid;
}

test("every land cell ends up as one of the 4 real land terrains, none left as placeholder", () => {
  const grid = allLandGrid(30);
  const owner = new Map();
  textureLandTerrain(grid, owner, mulberry32(1));
  for (const { col, row } of grid.cells()) {
    assert.ok(LAND_TERRAINS.includes(grid.get(col, row)), `unexpected terrain at (${col},${row}): ${grid.get(col, row)}`);
  }
});

test("mountain cells form actual clusters, not scattered singletons", () => {
  const grid = allLandGrid(30);
  const owner = new Map();
  textureLandTerrain(grid, owner, mulberry32(2));
  const mountainComponents = findComponents(grid, (t) => t === "mountain");
  assert.ok(mountainComponents.length > 0, "should produce at least one mountain cluster");
  for (const c of mountainComponents) {
    assert.ok(c.cells.length >= 7, `mountain cluster too small: ${c.cells.length}`);
  }
});
