// Organic blob growth for land/water bodies. Used both directions: growing deep-water lakes
// into a land-majority grid (Mixed) and growing island land into a water-majority grid
// (Islands). Blobs never grow adjacent to a *different* blob's cells, so each stays its own
// connected component by construction (query-and-conquer.md §1's "every disconnected land or
// water body" requirement starts from bodies that are actually disconnected).
import { offsetKey } from "./hex-coords.js";
import { randInt } from "./prng.js";

/**
 * Random frontier growth (Eden-model-style): repeatedly claims a random cell from the growing
 * blob's frontier, until it reaches targetSize or runs out of claimable cells.
 * @param {import("./grid.js").TerrainGrid} grid
 * @param {Map<string, number>} owner cell key -> owning blob id, mutated in place
 * @param {number} ownerId
 * @param {{col:number,row:number}} start
 * @param {number} targetSize
 * @param {(col:number, row:number) => boolean} isUnclaimed true if the cell is still available
 *   to grow into (e.g. still the placeholder background terrain)
 * @param {() => number} rng
 * @returns {{col:number,row:number}[]} the cells actually claimed
 */
export function growBlob(grid, owner, ownerId, start, targetSize, isUnclaimed, rng) {
  const canClaim = (col, row) =>
    isUnclaimed(col, row) &&
    grid.neighborsOf(col, row).every((n) => {
      const o = owner.get(offsetKey(n.col, n.row));
      return o === undefined || o === ownerId;
    });

  if (!canClaim(start.col, start.row)) return [];

  const claimed = [];
  const frontier = [start];
  const frontierSet = new Set([offsetKey(start.col, start.row)]);

  while (claimed.length < targetSize && frontier.length > 0) {
    const i = randInt(rng, 0, frontier.length);
    const cell = frontier[i];
    frontier[i] = frontier[frontier.length - 1];
    frontier.pop();
    const key = offsetKey(cell.col, cell.row);
    frontierSet.delete(key);

    if (owner.has(key) || !canClaim(cell.col, cell.row)) continue;
    owner.set(key, ownerId);
    claimed.push(cell);

    for (const n of grid.neighborsOf(cell.col, cell.row)) {
      const nKey = offsetKey(n.col, n.row);
      if (!owner.has(nKey) && !frontierSet.has(nKey) && canClaim(n.col, n.row)) {
        frontier.push(n);
        frontierSet.add(nKey);
      }
    }
  }
  return claimed;
}

/**
 * Splits a total cell budget across `count` bodies, each at least `minSize`, with some random
 * variance in how the remainder is distributed.
 * @param {() => number} rng
 * @returns {number[]} target sizes, one per body
 */
export function splitSizeBudget(rng, totalCells, count, minSize) {
  const baseline = new Array(count).fill(minSize);
  let remaining = totalCells - minSize * count;
  if (remaining < 0) remaining = 0;
  const weights = Array.from({ length: count }, () => 0.2 + rng());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return baseline.map((size, i) => size + Math.round((weights[i] / weightSum) * remaining));
}

/**
 * Grows `count` separate blobs of the given terrain, each starting from a random unclaimed
 * cell, sized per splitSizeBudget. Bodies that fail to reach minSize (e.g. boxed in by earlier
 * bodies) are dropped from the result — the caller re-validates against the map's hard rules and
 * retries the whole candidate if that leaves too few/too small bodies.
 * @returns {{cells: {col:number,row:number}[]}[]} one entry per successfully grown body
 */
export function growSeparateBodies(grid, owner, startOwnerId, rng, { count, totalCells, minSize, isUnclaimed }) {
  const targets = splitSizeBudget(rng, totalCells, count, minSize);
  const bodies = [];
  const unclaimedCells = () => [...grid.cells()].filter((c) => isUnclaimed(c.col, c.row) && !owner.has(offsetKey(c.col, c.row)));

  for (let i = 0; i < count; i++) {
    const candidates = unclaimedCells();
    if (candidates.length === 0) break;
    const start = candidates[randInt(rng, 0, candidates.length)];
    const ownerId = startOwnerId + i;
    const cells = growBlob(grid, owner, ownerId, start, targets[i], isUnclaimed, rng);
    if (cells.length >= minSize) bodies.push({ cells });
  }
  return bodies;
}
