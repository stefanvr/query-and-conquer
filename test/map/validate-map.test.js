import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid } from "../../src/map/grid.js";
import { validateMap } from "../../src/map/validate-map.js";

function fillGrid(width, height, terrain) {
  const grid = new TerrainGrid(width, height, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, terrain);
  return grid;
}

function setBlock(grid, colStart, rowStart, w, h, terrain) {
  for (let c = colStart; c < colStart + w; c++) {
    for (let r = rowStart; r < rowStart + h; r++) grid.set(c, r, terrain);
  }
}

test("all-land grid has no violations for landOnly", () => {
  const grid = fillGrid(10, 10, "gras");
  assert.deepEqual(validateMap(grid, "landOnly"), []);
});

test("landOnly rejects any water cell", () => {
  const grid = fillGrid(10, 10, "gras");
  grid.set(5, 5, "deep");
  const violations = validateMap(grid, "landOnly");
  assert.ok(violations.some((v) => v.includes("water cells")));
});

test("a valid mixed map (two well-separated 6x6 deep lakes) has no violations", () => {
  const grid = fillGrid(20, 20, "gras");
  setBlock(grid, 2, 2, 6, 6, "deep"); // 36 cells, touches land, own component
  setBlock(grid, 12, 10, 6, 6, "deep"); // 36 cells, well clear of the first block
  // total water = 72 / 400 = 0.18, within mixed's [0.10, 0.30]
  assert.deepEqual(validateMap(grid, "mixed"), []);
});

test("a water/land body smaller than 4x4 is flagged", () => {
  const grid = fillGrid(20, 20, "gras");
  setBlock(grid, 5, 5, 2, 2, "deep"); // 2x2, below the 4x4 minimum
  setBlock(grid, 12, 10, 6, 6, "deep"); // a second, valid-sized lake to also hit water%
  const violations = validateMap(grid, "mixed");
  assert.ok(violations.some((v) => v.includes("below the 4x4 minimum")));
});

test("shallow water adjacent to deep water is flagged", () => {
  const grid = fillGrid(20, 20, "gras");
  setBlock(grid, 5, 5, 6, 6, "deep");
  grid.set(4, 7, "shallow"); // directly left of the deep block, touches it
  const violations = validateMap(grid, "mixed");
  assert.ok(violations.some((v) => v.includes("adjacent to deep water")));
});

test("shallow water more than 3 cells from land is flagged", () => {
  // A big all-shallow block far from any land cell (grid is otherwise all deep, so distance to
  // the single land cell tucked in a corner exceeds 3).
  const grid = fillGrid(20, 20, "deep");
  setBlock(grid, 8, 8, 6, 6, "shallow");
  grid.set(0, 0, "gras");
  const violations = validateMap(grid, "mixed");
  assert.ok(violations.some((v) => v.includes("cells from land")));
});

function buildIslandRow(islandCount, moatTerrainByGap) {
  const islandSize = 14;
  const moatWidth = 2;
  const width = islandCount * islandSize + (islandCount - 1) * moatWidth;
  const grid = new TerrainGrid(width, islandSize, () => true);
  let col = 0;
  for (let i = 0; i < islandCount; i++) {
    setBlock(grid, col, 0, islandSize, islandSize, "gras");
    col += islandSize;
    if (i < islandCount - 1) {
      setBlock(grid, col, 0, moatWidth, islandSize, moatTerrainByGap[i]);
      col += moatWidth;
    }
  }
  return grid;
}

test("islands: fewer than minIslands land bodies of sufficient size is flagged", () => {
  const grid = buildIslandRow(5, ["deep", "deep", "deep", "deep"]); // only 5 islands, need >= 6
  const violations = validateMap(grid, "islands");
  assert.ok(violations.some((v) => /only 5 islands/.test(v)));
});

test("islands: fewer than minDeepIslands touching deep water is flagged", () => {
  // 6 islands, but only the first gap is deep — the rest are shallow moats, so only 2 islands
  // ever touch deep water (need >= 3).
  const grid = buildIslandRow(6, ["deep", "shallow", "shallow", "shallow", "shallow"]);
  const violations = validateMap(grid, "islands");
  assert.ok(violations.some((v) => /only 2 islands adjacent to deep water/.test(v)));
});
