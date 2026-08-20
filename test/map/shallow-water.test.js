import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid } from "../../src/map/grid.js";
import { carveShallowLagoons } from "../../src/map/shallow-water.js";
import { mulberry32 } from "../../src/map/prng.js";

function landGridWithDeepCorner(size) {
  const grid = new TerrainGrid(size, size, () => true);
  for (const { col, row } of grid.cells()) {
    grid.set(col, row, col < 6 && row < 6 ? "deep" : "land");
  }
  return grid;
}

test("carved shallow cells are never adjacent to a deep cell", () => {
  const grid = landGridWithDeepCorner(25);
  const owner = new Map();
  const rng = mulberry32(42);
  carveShallowLagoons(grid, owner, rng, { targetShallowCells: 60 });

  for (const { col, row } of grid.cells()) {
    if (grid.get(col, row) !== "shallow") continue;
    for (const n of grid.neighborsOf(col, row)) {
      assert.notEqual(grid.get(n.col, n.row), "deep", `shallow (${col},${row}) touches deep`);
    }
  }
});

test("carves at least some shallow water when land is available", () => {
  const grid = landGridWithDeepCorner(25);
  const owner = new Map();
  const rng = mulberry32(7);
  const carved = carveShallowLagoons(grid, owner, rng, { targetShallowCells: 40 });
  assert.ok(carved > 0);
});

test("does not exceed the map's available land when the target is unreasonably large", () => {
  const grid = landGridWithDeepCorner(10); // small grid, little land
  const owner = new Map();
  const rng = mulberry32(3);
  const totalCells = [...grid.cells()].length;
  const carved = carveShallowLagoons(grid, owner, rng, { targetShallowCells: 10000 });
  assert.ok(carved <= totalCells);
});
