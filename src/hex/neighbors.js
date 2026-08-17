/**
 * Hex neighbor lookup. Built on the cube-coordinate direction vectors
 * in src/hex/coords.js, converting back to offset coordinates at the
 * boundary, per this project's coordinate-system rule.
 */
import { offsetToCube, cubeToOffset, cubeAdd, CUBE_DIRECTIONS } from "./coords.js";

/**
 * All 6 neighbors of an offset coordinate, without bounds filtering.
 * @param {{col: number, row: number}} offset
 * @returns {{col: number, row: number}[]}
 */
export function neighborsOf(offset) {
  const cube = offsetToCube(offset);
  return CUBE_DIRECTIONS.map((dir) => cubeToOffset(cubeAdd(cube, dir)));
}

/**
 * Neighbors of an offset coordinate that fall within a width x height
 * grid (0-indexed, col in [0, width), row in [0, height)).
 * @param {{col: number, row: number}} offset
 * @param {number} width
 * @param {number} height
 * @returns {{col: number, row: number}[]}
 */
export function neighborsInBounds(offset, width, height) {
  return neighborsOf(offset).filter(
    ({ col, row }) => col >= 0 && col < width && row >= 0 && row < height
  );
}
