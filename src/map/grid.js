// A terrain grid over a bounding rectangle of offset (col, row) cells, with an in-map mask for
// non-rectangular shapes (see shape.js). Backs the generator; the same shape is also the map
// JSON's storage layout (tech-stack.md's "offset coordinates are the boundary format").
import { offsetNeighbors } from "./hex-coords.js";

export class TerrainGrid {
  /** @param {number} width @param {number} height @param {(col: number, row: number) => boolean} inShapeFn */
  constructor(width, height, inShapeFn) {
    this.width = width;
    this.height = height;
    this.terrain = new Array(width * height).fill(null);
    this.inMapMask = new Array(width * height).fill(false);
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < height; row++) {
        if (inShapeFn(col, row)) this.inMapMask[row * width + col] = true;
      }
    }
  }

  #idx(col, row) {
    return row * this.width + col;
  }

  isInMap(col, row) {
    return (
      col >= 0 && col < this.width && row >= 0 && row < this.height && this.inMapMask[this.#idx(col, row)]
    );
  }

  get(col, row) {
    return this.isInMap(col, row) ? this.terrain[this.#idx(col, row)] : null;
  }

  set(col, row, terrain) {
    if (!this.isInMap(col, row)) throw new Error(`(${col},${row}) is outside the map shape`);
    this.terrain[this.#idx(col, row)] = terrain;
  }

  /** @returns {Generator<{col: number, row: number}>} every in-map cell */
  *cells() {
    for (let col = 0; col < this.width; col++) {
      for (let row = 0; row < this.height; row++) {
        if (this.inMapMask[this.#idx(col, row)]) yield { col, row };
      }
    }
  }

  /** In-map neighbors of (col, row), per hex adjacency. */
  neighborsOf(col, row) {
    return offsetNeighbors({ col, row }).filter((n) => this.isInMap(n.col, n.row));
  }
}

/**
 * Connected-component analysis (flood fill) over cells matching `predicate(terrain)`.
 * @param {TerrainGrid} grid
 * @param {(terrain: string|null) => boolean} predicate
 * @returns {{ cells: {col:number,row:number}[], minCol: number, maxCol: number, minRow: number, maxRow: number }[]}
 */
export function findComponents(grid, predicate) {
  const visited = new Set();
  const components = [];
  for (const { col, row } of grid.cells()) {
    const key = `${col},${row}`;
    if (visited.has(key) || !predicate(grid.get(col, row))) continue;

    const stack = [{ col, row }];
    visited.add(key);
    const cells = [];
    let minCol = col, maxCol = col, minRow = row, maxRow = row;

    while (stack.length > 0) {
      const cur = stack.pop();
      cells.push(cur);
      minCol = Math.min(minCol, cur.col);
      maxCol = Math.max(maxCol, cur.col);
      minRow = Math.min(minRow, cur.row);
      maxRow = Math.max(maxRow, cur.row);
      for (const n of grid.neighborsOf(cur.col, cur.row)) {
        const nKey = `${n.col},${n.row}`;
        if (!visited.has(nKey) && predicate(grid.get(n.col, n.row))) {
          visited.add(nKey);
          stack.push(n);
        }
      }
    }
    components.push({ cells, minCol, maxCol, minRow, maxRow });
  }
  return components;
}
