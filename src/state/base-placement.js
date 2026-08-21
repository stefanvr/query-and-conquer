// Automatic base placement — game spec §5's Grid-cell/Voronoi-region heuristic, and §1's
// min-base-distance rule. Runs once at match start (createGameState), not baked into the map
// JSON, since it depends on player count, which varies per match — see
// doc/implementation-spec.md §2 "Base placement".
import { offsetDistance } from "../map/hex-coords.js";
import { MIN_BASE_DISTANCE, isWaterTerrain } from "../map/map-tables.js";
import { randInt } from "../map/prng.js";

/** A cell's terrain determines the one base type (if any) it's eligible for — land/port/
 * mountain location rules never overlap, so this is a clean partition, not a priority order. */
function eligibleBaseType(grid, col, row) {
  const terrain = grid.get(col, row);
  if (terrain === "mountain") {
    const neighbors = grid.neighborsOf(col, row);
    const allMountain = neighbors.length === 6 && neighbors.every((n) => grid.get(n.col, n.row) === "mountain");
    return allMountain ? { type: "mountain" } : null;
  }
  if (terrain === "gras" || terrain === "gravel" || terrain === "sand") {
    const neighbors = grid.neighborsOf(col, row);
    const adjacentToDeepWater = neighbors.some((n) => grid.get(n.col, n.row) === "deep");
    const adjacentToWater = adjacentToDeepWater || neighbors.some((n) => isWaterTerrain(grid.get(n.col, n.row)));
    return adjacentToWater ? { type: "port", adjacentToDeepWater } : { type: "land" };
  }
  return null; // shallow/deep water: never a base site
}

/** Farthest-point sampling: spreads `count` seed points across `cells` as evenly as an O(n*count)
 * greedy algorithm can manage — first seed random, each next seed maximizes its minimum distance
 * to seeds already chosen. */
function farthestPointSeeds(cells, count, rng) {
  const seeds = [cells[randInt(rng, 0, cells.length)]];
  while (seeds.length < count) {
    let best = null;
    let bestMinDist = -1;
    for (const cell of cells) {
      let minDist = Infinity;
      for (const seed of seeds) {
        const d = offsetDistance(cell, seed);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = cell;
      }
    }
    seeds.push(best);
  }
  return seeds;
}

function nearestSeedIndex(cell, seeds) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < seeds.length; i++) {
    const d = offsetDistance(cell, seeds[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function farEnoughFromPlacedBases(cell, placedBases) {
  return placedBases.every((b) => offsetDistance(cell, b) >= MIN_BASE_DISTANCE);
}

function sampleBaseInRegion(grid, regionCells, placedBases, rng, maxAttempts) {
  for (let attempt = 0; attempt < maxAttempts && regionCells.length > 0; attempt++) {
    const cell = regionCells[randInt(rng, 0, regionCells.length)];
    const eligible = eligibleBaseType(grid, cell.col, cell.row);
    if (!eligible) continue;
    if (!farEnoughFromPlacedBases(cell, placedBases)) continue;
    return { col: cell.col, row: cell.row, ...eligible };
  }
  return null;
}

/**
 * @param {import("../map/grid.js").TerrainGrid} grid
 * @param {number[]} playerIds
 * @param {() => number} rng
 * @returns {{ ownerId: number, col: number, row: number, type: string, adjacentToDeepWater?: boolean }[]}
 */
export function placeBases(grid, playerIds, rng, { maxReseedAttempts = 20, maxCandidateAttempts = 300 } = {}) {
  const allCells = [...grid.cells()];

  for (let reseed = 0; reseed < maxReseedAttempts; reseed++) {
    const seeds = farthestPointSeeds(allCells, playerIds.length, rng);
    const regions = Array.from({ length: playerIds.length }, () => []);
    for (const cell of allCells) regions[nearestSeedIndex(cell, seeds)].push(cell);

    const bases = [];
    let failed = false;
    for (let i = 0; i < playerIds.length; i++) {
      const site = sampleBaseInRegion(grid, regions[i], bases, rng, maxCandidateAttempts);
      if (!site) {
        failed = true;
        break;
      }
      bases.push({ ownerId: playerIds[i], ...site });
    }
    if (!failed) return bases;
  }
  throw new Error(`Could not place ${playerIds.length} bases with the required spacing after ${maxReseedAttempts} reseed attempts`);
}
