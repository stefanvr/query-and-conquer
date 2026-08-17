/**
 * Logical hex (offset col/row) -> pixel placement, flat-top orientation
 * with "odd-q" column-offset layout (style-guide.md §6). This is the
 * OTHER boundary (besides map JSON) where offset coordinates are used
 * directly rather than going through src/hex/coords.js's cube math --
 * pixel placement is a per-cell affine transform, not an
 * adjacency/distance operation, so there's nothing cube math buys here.
 *
 * Reference: https://www.redblobgames.com/grids/hexagons/#hex-to-pixel
 */
import { cubeRound, cubeToOffset } from "../hex/coords.js";

/** World-space hex circumradius, in pixels, before camera zoom is applied. */
export const DEFAULT_HEX_SIZE = 16;

/**
 * @param {{col: number, row: number}} offset
 * @param {number} hexSize - circumradius (center to corner), in pixels
 * @returns {{x: number, y: number}} pixel center of the hex, before camera transform
 */
export function hexCenter({ col, row }, hexSize) {
  const height = Math.sqrt(3) * hexSize;
  const x = hexSize * 1.5 * col;
  const y = height * row + (col % 2 !== 0 ? height / 2 : 0);
  return { x, y };
}

/**
 * The 6 corner points of a flat-top hex centered at (cx, cy), in a
 * fixed order starting from the rightmost point and going clockwise --
 * matching the flat-top orientation used by style-guide.md's CSS
 * clip-path (points left/right, flat edges top/bottom).
 * @param {number} cx
 * @param {number} cy
 * @param {number} hexSize
 * @returns {{x: number, y: number}[]}
 */
export function hexCorners(cx, cy, hexSize) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({ x: cx + hexSize * Math.cos(angle), y: cy + hexSize * Math.sin(angle) });
  }
  return corners;
}

/**
 * Inverse of hexCenter(): which offset cell a world-space pixel point
 * falls in. hexCenter() is exactly the standard flat-top axial-to-pixel
 * formula (q = col, r = row - (col - col&1)/2 = the cube "z" this
 * project uses) -- so the inverse is the standard pixel-to-axial
 * formula, rounded to the nearest hex via cubeRound and converted back
 * to offset via src/hex/coords.js.
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} hexSize
 * @returns {{col: number, row: number}}
 */
export function pixelToHex(worldX, worldY, hexSize) {
  const q = (2 / 3) * worldX / hexSize;
  const r = ((-1 / 3) * worldX + (Math.sqrt(3) / 3) * worldY) / hexSize;
  const cube = cubeRound({ x: q, y: -q - r, z: r });
  return cubeToOffset(cube);
}

/**
 * Bounding box (in pre-camera pixel space) of a full width x height
 * offset grid, given a hex size. Used to size the canvas / fit the
 * initial camera view.
 * @param {number} width
 * @param {number} height
 * @param {number} hexSize
 * @returns {{width: number, height: number}}
 */
export function gridPixelBounds(width, height, hexSize) {
  const last = hexCenter({ col: width - 1, row: height - 1 }, hexSize);
  return {
    width: last.x + hexSize * 2,
    height: last.y + Math.sqrt(3) * hexSize,
  };
}
