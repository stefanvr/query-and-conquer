// Shallow-water lagoons — per the confirmed reading of query-and-conquer.md §1: shallow water
// never borders deep water, so it forms small land-locked bands (lagoons) rather than a coastal
// apron. Each lagoon grows from a seed cell, bounded to within 3 hex-steps of that seed (an
// approximation of "at most 3 cells deep before reaching land" — validate-map.js checks the
// literal rule against every shallow cell afterward, so this only needs to get close).
import { offsetToCube, cubeDistance, offsetKey } from "./hex-coords.js";
import { growBlob } from "./terrain-body.js";
import { randInt } from "./prng.js";

const LAGOON_OWNER_ID = -1; // shared id so separate lagoons are free to touch/merge

function makeLagoonUnclaimed(grid, seedCube, maxRadius) {
  return (col, row) => {
    if (grid.get(col, row) !== "land") return false;
    if (cubeDistance(seedCube, offsetToCube({ col, row })) > maxRadius) return false;
    return grid.neighborsOf(col, row).every((n) => grid.get(n.col, n.row) !== "deep");
  };
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
  const maxAttempts = Math.max(50, targetShallowCells * 4);

  for (let attempt = 0; attempt < maxAttempts && claimedTotal < targetShallowCells; attempt++) {
    const landCells = [...grid.cells()].filter(
      (c) => grid.get(c.col, c.row) === "land" && !owner.has(offsetKey(c.col, c.row)),
    );
    if (landCells.length === 0) break;

    const seed = landCells[randInt(rng, 0, landCells.length)];
    const seedCube = offsetToCube(seed);
    const targetSize = Math.min(
      randInt(rng, minLagoonSize, maxLagoonSize + 1),
      targetShallowCells - claimedTotal + minLagoonSize,
    );

    const claimed = growBlob(
      grid,
      owner,
      LAGOON_OWNER_ID,
      seed,
      targetSize,
      makeLagoonUnclaimed(grid, seedCube, maxRadius),
      rng,
    );
    if (claimed.length < minLagoonSize) {
      // Too small/boxed-in to count as a body — release the claim and try elsewhere.
      for (const c of claimed) owner.delete(offsetKey(c.col, c.row));
      continue;
    }
    for (const c of claimed) grid.set(c.col, c.row, "shallow");
    claimedTotal += claimed.length;
  }
  return claimedTotal;
}
