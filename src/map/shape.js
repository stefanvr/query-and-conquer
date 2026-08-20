// Map bounding shape — per query-and-conquer.md §1: within a size's max dimension/max cells,
// the map can be a rectangle (portrait/landscape), square, hexagonal, or circular region,
// chosen to maximize cell count. The map JSON/storage grid is always the bounding rectangle
// (odd-q offset coords, per tech-stack.md); non-rectangular shapes just mark some of that
// rectangle's cells as outside the map.
import { offsetToCube, cubeToOffset } from "./hex-coords.js";

/**
 * @param {number} maxDimension
 * @param {number} maxCells
 * @param {"portrait"|"landscape"} orientation
 */
function rectangleShape(maxDimension, maxCells, orientation) {
  const long = maxDimension;
  const short = Math.min(maxDimension, Math.floor(maxCells / maxDimension));
  const [width, height] = orientation === "portrait" ? [short, long] : [long, short];
  return { width, height, inShape: () => true };
}

function squareShape(maxDimension, maxCells) {
  const side = Math.min(maxDimension, Math.floor(Math.sqrt(maxCells)));
  return { width: side, height: side, inShape: () => true };
}

/** Builds a { width, height, inShape } result from a raw (possibly negative-indexed) offset
 * cell list, by shifting it so the bounding box starts at (0, 0). */
function normalizeCells(cells) {
  const cols = cells.map((c) => c.col);
  const rows = cells.map((c) => c.row);
  const minCol = Math.min(...cols);
  const minRow = Math.min(...rows);
  const width = Math.max(...cols) - minCol + 1;
  const height = Math.max(...rows) - minRow + 1;
  const keys = new Set(cells.map((c) => `${c.col - minCol},${c.row - minRow}`));
  return { width, height, inShape: (col, row) => keys.has(`${col},${row}`) };
}

/** A regular hexagonal region: all cells within cube-distance R of a center, grown until it
 * would exceed maxCells or maxDimension. */
function hexagonShape(maxDimension, maxCells) {
  let best = null;
  for (let R = 0; ; R++) {
    const cells = [];
    for (let x = -R; x <= R; x++) {
      const yMin = Math.max(-R, -x - R);
      const yMax = Math.min(R, -x + R);
      for (let y = yMin; y <= yMax; y++) {
        cells.push(cubeToOffset({ x, y, z: -x - y }));
      }
    }
    const result = normalizeCells(cells);
    if (cells.length > maxCells || result.width > maxDimension || result.height > maxDimension) {
      break;
    }
    best = result;
  }
  if (!best) throw new Error("cannot fit a hexagon shape within the given constraints");
  return best;
}

/** Flat-top pixel position for a hex at (col, row), size=1 units — used only to approximate a
 * circular region; not the app's real on-screen placement math. */
function pixelPosition(col, row) {
  const px = 1.5 * col;
  const py = Math.sqrt(3) * (row + 0.5 * (((col % 2) + 2) % 2));
  return { px, py };
}

/** A roughly circular region: all cells within pixel-distance R of the origin, grown until it
 * would exceed maxCells or maxDimension. */
function circleShape(maxDimension, maxCells) {
  let best = null;
  for (let R = 1; R <= maxDimension; R += 0.5) {
    const colSpan = Math.ceil(R / 1.2) + 1;
    const rowSpan = Math.ceil(R / 1.4) + 1;
    const cells = [];
    for (let col = -colSpan; col <= colSpan; col++) {
      for (let row = -rowSpan; row <= rowSpan; row++) {
        const { px, py } = pixelPosition(col, row);
        if (Math.sqrt(px * px + py * py) <= R) cells.push({ col, row });
      }
    }
    const result = normalizeCells(cells);
    if (cells.length > maxCells || result.width > maxDimension || result.height > maxDimension) {
      break;
    }
    best = result;
  }
  if (!best) throw new Error("cannot fit a circle shape within the given constraints");
  return best;
}

/**
 * @param {"rectangle"|"square"|"hexagon"|"circle"} kind
 * @param {number} maxDimension
 * @param {number} maxCells
 * @param {() => number} rng
 * @returns {{ width: number, height: number, inShape: (col: number, row: number) => boolean }}
 */
export function generateShapeBounds(kind, maxDimension, maxCells, rng) {
  switch (kind) {
    case "rectangle":
      return rectangleShape(maxDimension, maxCells, rng() < 0.5 ? "portrait" : "landscape");
    case "square":
      return squareShape(maxDimension, maxCells);
    case "hexagon":
      return hexagonShape(maxDimension, maxCells);
    case "circle":
      return circleShape(maxDimension, maxCells);
    default:
      throw new Error(`unknown shape kind: ${kind}`);
  }
}
