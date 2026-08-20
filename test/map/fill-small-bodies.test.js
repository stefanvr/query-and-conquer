import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid, findComponents } from "../../src/map/grid.js";
import { fillSmallBodies } from "../../src/map/fill-small-bodies.js";
import { isWaterTerrain } from "../../src/map/map-tables.js";

function fillGrid(width, height, terrain) {
  const grid = new TerrainGrid(width, height, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, terrain);
  return grid;
}

test("merges a stray single-cell deep hole into surrounding land", () => {
  const grid = fillGrid(15, 15, "land");
  grid.set(7, 7, "deep"); // an isolated 1x1 hole, fully surrounded by land
  fillSmallBodies(grid);
  assert.equal(grid.get(7, 7), "land");
});

test("merges a too-small shallow patch (below 4x4) into land", () => {
  const grid = fillGrid(15, 15, "land");
  grid.set(5, 5, "shallow");
  grid.set(6, 5, "shallow"); // a 2x1 shallow sliver, below the 4x4 minimum
  fillSmallBodies(grid);
  assert.equal(grid.get(5, 5), "land");
  assert.equal(grid.get(6, 5), "land");
});

test("leaves a properly-sized body (>= 4x4) untouched", () => {
  const grid = fillGrid(15, 15, "land");
  for (let c = 4; c < 9; c++) for (let r = 4; r < 9; r++) grid.set(c, r, "deep"); // 5x5
  fillSmallBodies(grid);
  const [component] = findComponents(grid, (t) => t === "deep");
  assert.equal(component.cells.length, 25);
});

test("after fillSmallBodies, no land/water component remains below the 4x4 minimum", () => {
  const grid = fillGrid(25, 25, "land");
  // Scatter several small holes and slivers of both categories.
  grid.set(2, 2, "deep");
  grid.set(10, 3, "shallow");
  grid.set(11, 3, "shallow");
  grid.set(20, 20, "deep");
  grid.set(20, 21, "deep");
  grid.set(20, 22, "deep");
  fillSmallBodies(grid);

  const components = [...findComponents(grid, (t) => t === "land"), ...findComponents(grid, isWaterTerrain)];
  for (const c of components) {
    const w = c.maxCol - c.minCol + 1;
    const h = c.maxRow - c.minRow + 1;
    assert.ok(w >= 4 && h >= 4, `leftover small component: ${w}x${h}`);
  }
});
