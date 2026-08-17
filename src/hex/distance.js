/**
 * Hex-distance helpers for offset coordinates -- design doc §1: "Ranges
 * (view, attack) are hex-distance radii — number of hex steps away."
 * Thin offset-facing wrapper around src/hex/coords.js's cube distance,
 * per this project's coordinate-system rule.
 */
import { offsetDistance } from "./coords.js";

export { offsetDistance };

/**
 * All offset cells within `radius` hex steps of `center` (inclusive),
 * clipped to a width x height grid. Used for view-range/fog and
 * attack-range calculations.
 * @param {{col: number, row: number}} center
 * @param {number} radius
 * @param {number} width
 * @param {number} height
 * @returns {{col: number, row: number}[]}
 */
export function cellsWithinRadius(center, radius, width, height) {
  const cells = [];
  const colMin = Math.max(0, center.col - radius * 2);
  const colMax = Math.min(width - 1, center.col + radius * 2);
  const rowMin = Math.max(0, center.row - radius);
  const rowMax = Math.min(height - 1, center.row + radius);

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const cell = { col, row };
      if (offsetDistance(center, cell) <= radius) cells.push(cell);
    }
  }
  return cells;
}
