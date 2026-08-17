/**
 * Hex coordinate conversions -- the single source of truth for the
 * coordinate-system decision flagged in the implementation plan.
 *
 * Internal logic (this module and its consumers: neighbors, distance,
 * line-of-sight, pathfinding, map generation) works in CUBE coordinates
 * {x, y, z} where x + y + z === 0, because neighbor/distance/adjacency
 * math is simple constant-time arithmetic there.
 *
 * The map JSON format and on-screen pixel placement use OFFSET
 * coordinates {col, row} instead, because that's the natural shape for
 * a rectangular grid (row-major arrays) and for flat-top hex layout.
 * This module owns the conversion between the two so nothing else
 * hand-rolls it.
 *
 * Offset scheme: "odd-q" (flat-top orientation, per style-guide.md §6 --
 * odd columns are pushed down half a cell). Reference:
 * https://www.redblobgames.com/grids/hexagons/#conversions-offset
 */

/** @typedef {{col: number, row: number}} OffsetCoord */
/** @typedef {{x: number, y: number, z: number}} CubeCoord */

/**
 * The 6 unit steps between neighboring cells in cube space, in a fixed
 * order (no particular compass meaning -- just a stable order other
 * modules can rely on for deterministic iteration).
 * @type {CubeCoord[]}
 */
export const CUBE_DIRECTIONS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
];

/**
 * @param {OffsetCoord} offset
 * @returns {CubeCoord}
 */
export function offsetToCube({ col, row }) {
  const x = col;
  const z = row - (col - (col & 1)) / 2;
  const y = -x - z;
  return { x, y, z };
}

/**
 * @param {CubeCoord} cube
 * @returns {OffsetCoord}
 */
export function cubeToOffset({ x, z }) {
  const col = x;
  const row = z + (x - (x & 1)) / 2;
  return { col, row };
}

/**
 * @param {CubeCoord} a
 * @param {CubeCoord} b
 * @returns {CubeCoord}
 */
export function cubeAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Hex distance (number of hex steps) between two cube coordinates.
 * Used by src/hex/distance.js's offset-facing wrapper (Stage 4) and
 * directly wherever cube coordinates are already in hand.
 * @param {CubeCoord} a
 * @param {CubeCoord} b
 * @returns {number}
 */
export function cubeDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

/**
 * @param {OffsetCoord} a
 * @param {OffsetCoord} b
 * @returns {number}
 */
export function offsetDistance(a, b) {
  return cubeDistance(offsetToCube(a), offsetToCube(b));
}
