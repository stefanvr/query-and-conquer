/**
 * Validators for the map generation rules in design doc §1 "Layout
 * rules": minimum contiguous region size, water/land ratio per map
 * type, and shallow-water depth. Used by generate.js both to fix up a
 * candidate mid-generation and to accept/reject a finished candidate.
 */
import { isLand, isWater } from "./terrainCodes.js";
import { neighborsInBounds } from "../hex/neighbors.js";

/**
 * Flood-fills a grid into connected components under a boolean
 * category function (e.g. isLand / isWater). Diagonal/hex adjacency
 * only -- no category crosses a cell of the other category.
 * @param {string[][]} grid - grid[row][col]
 * @param {number} width
 * @param {number} height
 * @param {(terrain: string) => boolean} categoryFn
 * @returns {{col: number, row: number}[][]} list of components, each a list of cells
 */
export function floodFillComponents(grid, width, height, categoryFn) {
  const visited = Array.from({ length: height }, () => new Array(width).fill(false));
  const components = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (visited[row][col] || !categoryFn(grid[row][col])) continue;

      const component = [];
      const stack = [{ col, row }];
      visited[row][col] = true;

      while (stack.length > 0) {
        const cell = stack.pop();
        component.push(cell);
        for (const n of neighborsInBounds(cell, width, height)) {
          if (!visited[n.row][n.col] && categoryFn(grid[n.row][n.col])) {
            visited[n.row][n.col] = true;
            stack.push(n);
          }
        }
      }
      components.push(component);
    }
  }
  return components;
}

/**
 * Largest axis-aligned square (in row/col grid space) made up entirely
 * of cells belonging to the given component, via the classic "maximal
 * square" DP. This is the check for design doc §1's "at least a 4x4
 * contiguous region" rule -- component cell COUNT alone isn't enough
 * (a long 1-wide snake can have 16+ cells but never fit a 4x4 square).
 * @param {{col: number, row: number}[]} component
 * @returns {number} side length of the largest square found (0 if empty)
 */
export function maxSquareInComponent(component) {
  if (component.length === 0) return 0;

  let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
  const memberKey = (c, r) => `${c},${r}`;
  const members = new Set();
  for (const { col, row } of component) {
    members.add(memberKey(col, row));
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }

  const w = maxCol - minCol + 1;
  const h = maxRow - minRow + 1;
  // dp[r][c] = side length of the largest all-member square with its
  // bottom-right corner at local (c, r).
  let prevRow = new Array(w + 1).fill(0);
  let best = 0;

  for (let r = 0; r < h; r++) {
    const curRow = new Array(w + 1).fill(0);
    for (let c = 0; c < w; c++) {
      if (members.has(memberKey(c + minCol, r + minRow))) {
        curRow[c + 1] =
          c === 0 || r === 0
            ? 1
            : 1 + Math.min(curRow[c], prevRow[c + 1], prevRow[c]);
        if (curRow[c + 1] > best) best = curRow[c + 1];
      }
    }
    prevRow = curRow;
  }
  return best;
}

/**
 * Checks every land component and every water component has a
 * qualifying >=4x4 square somewhere inside it.
 * @param {string[][]} grid
 * @param {number} width
 * @param {number} height
 * @returns {{valid: boolean, violations: {category: string, size: number, maxSquare: number}[]}}
 */
export function validateRegionSizes(grid, width, height) {
  const violations = [];
  for (const [category, categoryFn] of [["land", isLand], ["water", isWater]]) {
    const components = floodFillComponents(grid, width, height, categoryFn);
    for (const component of components) {
      const square = maxSquareInComponent(component);
      if (square < 4) {
        violations.push({ category, size: component.length, maxSquare: square });
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * @param {string[][]} grid
 * @returns {number} fraction of cells that are water, in [0, 1]
 */
export function waterFraction(grid) {
  let water = 0, total = 0;
  for (const row of grid) {
    for (const terrain of row) {
      total++;
      if (isWater(terrain)) water++;
    }
  }
  return total === 0 ? 0 : water / total;
}

/**
 * Design doc §1 "Generation" table: per-type ratio rules.
 *
 * "Mixed" also enforces a MIN_MIXED_WATER floor beyond the doc's
 * literal "min 65% land" (which only bounds land from below, not water
 * from below -- a 0%-water candidate technically satisfies it). Without
 * a floor, region-size erosion can legitimately wipe out all water and
 * produce a "mixed" map indistinguishable from "land-only", which
 * defeats the point of the type. This is an implementation-level
 * generation-quality assumption, not a design-doc requirement.
 * @param {"islands"|"land-only"|"mixed"} type
 * @param {number} fraction - water fraction, in [0, 1]
 * @returns {boolean}
 */
const MIN_MIXED_WATER = 0.1;

export function validateRatio(type, fraction) {
  if (type === "islands") return fraction >= 0.5;
  if (type === "land-only") return fraction === 0;
  if (type === "mixed") return fraction >= MIN_MIXED_WATER && fraction <= 0.35;
  throw new Error(`Unknown map type: ${type}`);
}
