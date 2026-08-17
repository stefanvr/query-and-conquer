/**
 * Line-of-sight checks (design doc §1: "Line of sight is blocked by
 * mountain cells, units, and bases."). Uses the standard hex line-draw
 * algorithm (linear interpolation in cube space, rounded to the
 * nearest hex each step) to find the cells between two points.
 * Reference: https://www.redblobgames.com/grids/hexagons/#line-drawing
 */
import { offsetToCube, cubeToOffset, cubeDistance, cubeRound } from "./coords.js";

function cubeLerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Offset-coordinate cells on the straight hex line from `from` to
 * `to`, inclusive of both endpoints, in order.
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @returns {{col: number, row: number}[]}
 */
export function hexLine(from, to) {
  const a = offsetToCube(from);
  const b = offsetToCube(to);
  const n = cubeDistance(a, b);
  if (n === 0) return [from];

  const line = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    line.push(cubeToOffset(cubeRound(cubeLerp(a, b, t))));
  }
  return line;
}

/**
 * @param {{col: number, row: number}} from
 * @param {{col: number, row: number}} to
 * @param {{terrain: string[][], units: object[], bases: object[]}} map - canonical map + entities
 * @returns {boolean} true if nothing blocks sight between from and to
 */
export function hasLineOfSight(from, to, { terrain, units, bases }) {
  const line = hexLine(from, to);
  // Endpoints never block sight to themselves -- only cells strictly
  // between the observer and the target can obstruct the view.
  const between = line.slice(1, -1);

  const unitAt = (cell) => units.some((u) => u.position.col === cell.col && u.position.row === cell.row);
  const baseAt = (cell) => bases.some((b) => b.position.col === cell.col && b.position.row === cell.row);

  return !between.some(
    (cell) => terrain[cell.row][cell.col] === "mountain" || unitAt(cell) || baseAt(cell)
  );
}
