import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid, findComponents } from "../../src/map/grid.js";

test("cells() only yields in-map cells; get/set respect the shape mask", () => {
  const grid = new TerrainGrid(3, 3, (col, row) => !(col === 1 && row === 1)); // hole in the middle
  const all = [...grid.cells()];
  assert.equal(all.length, 8);
  assert.equal(grid.isInMap(1, 1), false);
  assert.equal(grid.get(1, 1), null);
  assert.throws(() => grid.set(1, 1, "gras"));
  grid.set(0, 0, "gras");
  assert.equal(grid.get(0, 0), "gras");
});

test("neighborsOf only returns in-map neighbors", () => {
  const grid = new TerrainGrid(2, 2, () => true);
  const neighbors = grid.neighborsOf(0, 0);
  for (const n of neighbors) {
    assert.ok(grid.isInMap(n.col, n.row));
  }
});

test("findComponents groups contiguous matching cells and separates disconnected ones", () => {
  // 5x1 strip: gras gras | deep | gras gras  -> two separate 2-cell land components
  const grid = new TerrainGrid(5, 1, () => true);
  grid.set(0, 0, "gras");
  grid.set(1, 0, "gras");
  grid.set(2, 0, "deep");
  grid.set(3, 0, "gras");
  grid.set(4, 0, "gras");

  const landComponents = findComponents(grid, (t) => t === "gras");
  assert.equal(landComponents.length, 2);
  assert.deepEqual(
    landComponents.map((c) => c.cells.length).sort(),
    [2, 2],
  );

  const waterComponents = findComponents(grid, (t) => t === "deep");
  assert.equal(waterComponents.length, 1);
  assert.equal(waterComponents[0].cells.length, 1);
});

test("findComponents reports correct bounding box", () => {
  const grid = new TerrainGrid(4, 4, () => true);
  for (const [col, row] of [[0, 0], [1, 0], [0, 1]]) grid.set(col, row, "gras");
  const [component] = findComponents(grid, (t) => t === "gras");
  assert.equal(component.minCol, 0);
  assert.equal(component.maxCol, 1);
  assert.equal(component.minRow, 0);
  assert.equal(component.maxRow, 1);
});
