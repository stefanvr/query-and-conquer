// Hex coordinate math — per tech-stack.md's "Hex coordinate system" section: internal logic
// (distance, neighbors) works in cube coordinates; offset coordinates (odd-q, flat-top) are the
// boundary format for the map JSON and pixel placement. This module owns the conversion between
// the two so nothing else hand-rolls it.

/** @typedef {{x: number, y: number, z: number}} CubeCoord */
/** @typedef {{col: number, row: number}} OffsetCoord */

const CUBE_DIRECTIONS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
];

/** @param {OffsetCoord} offset @returns {CubeCoord} */
export function offsetToCube({ col, row }) {
  const x = col;
  const z = row - (col - (col & 1)) / 2;
  const y = -x - z;
  return { x, y, z };
}

/** @param {CubeCoord} cube @returns {OffsetCoord} */
export function cubeToOffset({ x, z }) {
  // `+ 0` normalizes a possible -0 (e.g. from hexLine's cubeRound) to 0 -- -0 === 0 but
  // Object.is(-0, 0) is false, which deepEqual in tests (correctly) does distinguish.
  const col = x + 0;
  const row = z + (x - (x & 1)) / 2 + 0;
  return { col, row };
}

/** @param {CubeCoord} a @param {CubeCoord} b @returns {number} hex-step distance */
export function cubeDistance(a, b) {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}

/** @param {OffsetCoord} a @param {OffsetCoord} b @returns {number} hex-step distance */
export function offsetDistance(a, b) {
  return cubeDistance(offsetToCube(a), offsetToCube(b));
}

/** @param {OffsetCoord} offset @returns {OffsetCoord[]} the 6 neighboring cells, in a fixed order */
export function offsetNeighbors({ col, row }) {
  const cube = offsetToCube({ col, row });
  return CUBE_DIRECTIONS.map((d) =>
    cubeToOffset({ x: cube.x + d.x, y: cube.y + d.y, z: cube.z + d.z }),
  );
}

/** @param {number} col @param {number} row @returns {string} stable map-key for an offset coord */
export function offsetKey(col, row) {
  return `${col},${row}`;
}

/** @param {CubeCoord} a @param {CubeCoord} b @param {number} t @returns {CubeCoord} */
function cubeLerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Rounds a fractional cube coordinate to the nearest actual hex, correcting whichever
 * component's rounding drifted the most off the x+y+z=0 constraint. @param {CubeCoord} cube
 * @returns {CubeCoord} */
function cubeRound(cube) {
  let x = Math.round(cube.x);
  let y = Math.round(cube.y);
  let z = Math.round(cube.z);
  const xDiff = Math.abs(x - cube.x);
  const yDiff = Math.abs(y - cube.y);
  const zDiff = Math.abs(z - cube.z);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff > zDiff) y = -x - z;
  else z = -x - y;
  return { x, y, z };
}

/** Every hex from `a` to `b` inclusive, in order — standard hex line-draw (Amit Patel's
 * red-blob-games technique): linearly interpolate in cube coordinates, one step per hex of
 * distance, rounding each step to the nearest actual hex. Used for line-of-sight (game spec §1's
 * "blocked by mountain cells, units, and bases anywhere along the line" — not just adjacent
 * cells, so a simple midpoint lookup isn't enough once a unit's attack range exceeds 1).
 * @param {OffsetCoord} a @param {OffsetCoord} b @returns {OffsetCoord[]} */
export function hexLine(a, b) {
  const cubeA = offsetToCube(a);
  const cubeB = offsetToCube(b);
  const steps = cubeDistance(cubeA, cubeB);
  const line = [];
  for (let i = 0; i <= steps; i++) {
    line.push(cubeToOffset(cubeRound(cubeLerp(cubeA, cubeB, steps === 0 ? 0 : i / steps))));
  }
  return line;
}
