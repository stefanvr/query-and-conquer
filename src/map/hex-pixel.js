// Offset (col, row) -> on-screen pixel placement, flat-top hex layout with odd-q offset — the
// other boundary (alongside the map JSON format) where tech-stack.md calls for offset
// coordinates. One module owns this so nothing else hand-rolls the geometry.
import { offsetToCube, cubeToOffset } from "./hex-coords.js";

/** Pixel center of the hex at (col, row), for a hex of the given "radius" size. */
export function hexToPixel(col, row, hexSize) {
  const x = hexSize * 1.5 * col;
  const y = hexSize * Math.sqrt(3) * (row + 0.5 * (((col % 2) + 2) % 2));
  return { x, y };
}

/** Inverse of hexToPixel: which (col, row) hex contains the pixel point (x, y). Goes through
 * cube coordinates (standard axial pixel-to-hex math) with cube rounding, since rounding
 * col/row directly can pick the wrong hex near cell edges. */
export function pixelToHex(x, y, hexSize) {
  const cubeX = ((2 / 3) * x) / hexSize;
  const cubeZ = y / (Math.sqrt(3) * hexSize) - cubeX / 2;
  const cubeY = -cubeX - cubeZ;

  let rx = Math.round(cubeX);
  let ry = Math.round(cubeY);
  let rz = Math.round(cubeZ);
  const dx = Math.abs(rx - cubeX);
  const dy = Math.abs(ry - cubeY);
  const dz = Math.abs(rz - cubeZ);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  return cubeToOffset({ x: rx, y: ry, z: rz });
}

/** The 6 corner points of a flat-top hex centered at (cx, cy), matching style-guide.md's clip
 * path (points left/right, flat top/bottom edges). */
export function hexCorners(cx, cy, hexSize) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({ x: cx + hexSize * Math.cos(angle), y: cy + hexSize * Math.sin(angle) });
  }
  return corners;
}
