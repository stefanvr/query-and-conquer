// Shallow-water lagoons — per the confirmed reading of query-and-conquer.md §1: shallow water
// never borders deep water, so it forms small land-locked bands (lagoons) rather than a coastal
// apron. Each lagoon grows around a seed cell that is kept as permanent land (never itself
// converted, and never reused by a later lagoon) so every claimed shallow cell always has that
// seed within 3 hex-steps as a witness — a direct, by-construction guarantee of "at most 3 cells
// deep before reaching land," rather than something checked after the fact.
import { offsetToCube, cubeDistance, offsetKey } from "./hex-coords.js";
import { growBlob } from "./terrain-body.js";
import { randInt } from "./prng.js";

const LAGOON_OWNER_ID = -1; // shared id so separate lagoons are free to touch/merge

function isLandAndFree(grid, owner, reserved, col, row) {
  const key = offsetKey(col, row);
  return grid.get(col, row) === "land" && !owner.has(key) && !reserved.has(key);
}

/**
 * Carves shallow-water lagoons out of land cells until `targetShallowCells` is reached or
 * attempts run out. Mutates `grid` (sets claimed cells to "shallow") and `owner`.
 * @returns {number} shallow cells actually carved
 */
export function carveShallowLagoons(
  grid,
  owner,
  rng,
  { targetShallowCells, minLagoonSize = 12, maxLagoonSize = 28, maxRadius = 3 },
) {
  let claimedTotal = 0;
  const reservedAnchors = new Set(); // seed cells of successful lagoons: permanent land witnesses
  const maxAttempts = Math.max(50, targetShallowCells * 4);

  for (let attempt = 0; attempt < maxAttempts && claimedTotal < targetShallowCells; attempt++) {
    const seedCandidates = [...grid.cells()].filter((c) => isLandAndFree(grid, owner, reservedAnchors, c.col, c.row));
    if (seedCandidates.length === 0) break;

    const seed = seedCandidates[randInt(rng, 0, seedCandidates.length)];
    const seedKey = offsetKey(seed.col, seed.row);
    const seedCube = offsetToCube(seed);

    const startCandidates = grid
      .neighborsOf(seed.col, seed.row)
      .filter((n) => isLandAndFree(grid, owner, reservedAnchors, n.col, n.row));
    if (startCandidates.length === 0) continue;
    const start = startCandidates[randInt(rng, 0, startCandidates.length)];

    const isUnclaimed = (col, row) => {
      const key = offsetKey(col, row);
      if (key === seedKey || reservedAnchors.has(key)) return false; // seed stays land, forever
      if (grid.get(col, row) !== "land") return false;
      if (cubeDistance(seedCube, offsetToCube({ col, row })) > maxRadius) return false;
      return grid.neighborsOf(col, row).every((n) => grid.get(n.col, n.row) !== "deep");
    };

    const targetSize = Math.min(
      randInt(rng, minLagoonSize, maxLagoonSize + 1),
      targetShallowCells - claimedTotal + minLagoonSize,
    );
    const claimed = growBlob(grid, owner, LAGOON_OWNER_ID, start, targetSize, isUnclaimed, rng);

    if (claimed.length < minLagoonSize) {
      for (const c of claimed) owner.delete(offsetKey(c.col, c.row));
      continue;
    }
    reservedAnchors.add(seedKey);
    for (const c of claimed) grid.set(c.col, c.row, "shallow");
    claimedTotal += claimed.length;
  }
  return claimedTotal;
}
