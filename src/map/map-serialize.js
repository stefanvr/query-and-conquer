// Map JSON format — per tech-stack.md, offset (col, row) coordinates are the boundary format
// for the map JSON. A map is stored as one string per row, one character per cell: a terrain
// code, or "." for a cell outside the map's shape (see shape.js). This is the only place that
// knows the character codes, so nothing else hand-rolls them.
import { TerrainGrid } from "./grid.js";

const TERRAIN_CODES = {
  gras: "g",
  gravel: "v",
  mountain: "m",
  sand: "s",
  shallow: "h",
  deep: "d",
};
const CODE_TO_TERRAIN = Object.fromEntries(Object.entries(TERRAIN_CODES).map(([t, c]) => [c, t]));
const OUTSIDE_MAP_CODE = ".";

/** @param {TerrainGrid} grid @returns {string[]} one string per row */
export function serializeGrid(grid) {
  const rows = [];
  for (let row = 0; row < grid.height; row++) {
    let line = "";
    for (let col = 0; col < grid.width; col++) {
      const terrain = grid.get(col, row);
      line += terrain ? TERRAIN_CODES[terrain] : OUTSIDE_MAP_CODE;
    }
    rows.push(line);
  }
  return rows;
}

/** @param {number} width @param {number} height @param {string[]} rows @returns {TerrainGrid} */
export function deserializeGrid(width, height, rows) {
  const grid = new TerrainGrid(width, height, (col, row) => rows[row][col] !== OUTSIDE_MAP_CODE);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const code = rows[row][col];
      if (code !== OUTSIDE_MAP_CODE) grid.set(col, row, CODE_TO_TERRAIN[code]);
    }
  }
  return grid;
}
