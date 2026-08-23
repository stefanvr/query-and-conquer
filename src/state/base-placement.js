// Automatic base placement — game spec §5's Grid-cell/Voronoi-region heuristic, and §1's
// min-base-distance rule. Runs once at match start (createGameState), not baked into the map
// JSON, since it depends on player count, which varies per match — see
// doc/implementation-spec.md §2 "Base placement".
import { offsetDistance } from "../map/hex-coords.js";
import { MIN_BASE_DISTANCE, isWaterTerrain, SIZES } from "../map/map-tables.js";
import { randInt } from "../map/prng.js";

/** How many neutral bases to seed alongside the player bases (game spec §5) — scales with player
 * count and how much of the map can actually hold a base, not the map's nominal cell count.
 *
 * The first version of this formula used `SIZES[size].maxCells` — the map's *nominal* cell
 * count — as the size term, on the reasoning that a small map's density already looked right and
 * a bigger map should get proportionally more room to spread neutrals across. It reproduced the
 * approved small-map density correctly (a `landOnly` map is nearly all eligible land, so nominal
 * and eligible cell counts are close there) but broke badly on `islands`: nominal cell count
 * includes all the open water between islands, which a Voronoi region can land squarely inside
 * with zero eligible land to sample from — no amount of retrying finds a base in a region that's
 * entirely water. Measured: `large`/`extraLarge` islands maps at high player counts failed
 * placement **100% of the time**, even with generously raised retry limits — not rare bad luck,
 * a structural dead end. Fixed by measuring this grid's own eligible-cell count directly
 * (`eligibleBaseType` below already defines "eligible" exactly as placement itself needs it) and
 * scaling against that instead — still divided by `SIZES.small.maxCells` to keep the same
 * small-map anchor, since a small `landOnly` map's eligible count is close enough to its nominal
 * one that the reviewed-as-fine density there is unaffected. */
export function neutralBaseCount(playerCount, grid) {
  const eligibleCells = [...grid.cells()].filter((c) => eligibleBaseType(grid, c.col, c.row) !== null).length;
  return Math.round((playerCount * eligibleCells) / SIZES.small.maxCells);
}

/** Half a base type's full strength (game spec §5) — a freshly-seeded neutral base's starting
 * SP. Purely a stored value today (see base-placement's own callers): claiming a base has never
 * read its strength, and a non-owned base's SP is never shown to anyone but its owner. */
export function neutralBaseStartingSp(strength) {
  return Math.round(strength / 2);
}

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

/** One placement attempt at a fixed `neutralCount`, up to `maxReseedAttempts` full reseeds — the
 * body `placeBases` used to run directly. Returns the placed bases, or `null` (never throws) so
 * `placeBases` can fall back to a smaller `neutralCount` rather than failing the whole match. */
function attemptPlacement(grid, allCells, playerIds, neutralCount, rng, maxReseedAttempts, maxCandidateAttempts) {
  const totalCount = playerIds.length + neutralCount;

  for (let reseed = 0; reseed < maxReseedAttempts; reseed++) {
    // One seed pass for players *and* neutrals together, not two separate calls — a second call
    // restarting the greedy search from scratch would ignore the player seeds already chosen and
    // could double up near them. farthestPointSeeds only spends randomness on its very first seed
    // (every seed after that is chosen deterministically by max-min-distance, no further rng
    // draws) — so asking for N+M points instead of N doesn't touch the rng sequence any
    // differently: the first `playerIds.length` seeds are the exact same points either way.
    const seeds = farthestPointSeeds(allCells, totalCount, rng);
    const playerSeeds = seeds.slice(0, playerIds.length);

    // Player regions are partitioned against the player seeds *alone*, not the full N+M set, so
    // a player's own base placement stays bit-identical to running this with `neutralCount: 0` —
    // a neutral seed existing elsewhere on the map must never be able to shrink a player's
    // region (adding more seeds to a Voronoi partition shrinks every existing cell around it) and
    // so change which cell rejection-sampling lands on inside it.
    const playerRegions = Array.from({ length: playerIds.length }, () => []);
    for (const cell of allCells) playerRegions[nearestSeedIndex(cell, playerSeeds)].push(cell);

    const bases = [];
    let failed = false;
    for (let i = 0; i < playerIds.length; i++) {
      const site = sampleBaseInRegion(grid, playerRegions[i], bases, rng, maxCandidateAttempts);
      if (!site) {
        failed = true;
        break;
      }
      bases.push({ ownerId: playerIds[i], ...site });
    }

    // Neutral regions are partitioned against the *full* seed set, computed only now that the
    // player bases above are already fixed — so neutrals carve their own space away from both
    // the player seeds and each other, without being able to move a player base either.
    if (!failed && neutralCount > 0) {
      const allRegions = Array.from({ length: totalCount }, () => []);
      for (const cell of allCells) allRegions[nearestSeedIndex(cell, seeds)].push(cell);
      for (let i = playerIds.length; i < totalCount; i++) {
        const site = sampleBaseInRegion(grid, allRegions[i], bases, rng, maxCandidateAttempts);
        if (!site) {
          failed = true;
          break;
        }
        bases.push({ ownerId: null, ...site });
      }
    }

    if (!failed) return bases;
  }
  return null;
}

/**
 * @param {import("../map/grid.js").TerrainGrid} grid
 * @param {number[]} playerIds
 * @param {() => number} rng
 * @param {{ neutralCount?: number, maxReseedAttempts?: number, maxCandidateAttempts?: number }} [opts]
 *   `neutralCount` (default 0) additional unowned bases, seeded after the player ones — see
 *   `neutralBaseCount` for game spec §5's own formula.
 * @returns {{ ownerId: number | null, col: number, row: number, type: string, adjacentToDeepWater?: boolean }[]}
 */
export function placeBases(grid, playerIds, rng, { neutralCount = 0, maxReseedAttempts = 10, maxCandidateAttempts = 300 } = {}) {
  const allCells = [...grid.cells()];

  // `neutralBaseCount`'s formula is a target based on this grid's own eligible-cell count, but no
  // static formula can predict every generated map's exact capacity — an archipelago's usable
  // land is fragmented in a way a cell count alone doesn't capture (a Voronoi region can land
  // squarely in open water between islands, with nothing to sample regardless of how many times
  // it's retried). Rather than let a map the formula overshot on fail match creation outright,
  // fall back to progressively fewer neutrals — halving each time converges in a handful of
  // attempts, which matters because each failed attempt at the full `maxReseedAttempts` is not
  // cheap. `n = 0` is always the last resort and must succeed whenever player-only placement
  // itself is feasible (unaffected by any of this — see `attemptPlacement`'s own player-region
  // isolation), same as it always has.
  for (let n = neutralCount; n >= 0; n = n === 0 ? -1 : Math.floor(n / 2)) {
    const bases = attemptPlacement(grid, allCells, playerIds, n, rng, maxReseedAttempts, maxCandidateAttempts);
    if (bases) return bases;
  }
  throw new Error(
    `Could not place ${playerIds.length} player bases at all (tried scaling neutral bases down from ${neutralCount} to 0) within ${maxReseedAttempts} reseed attempts each`,
  );
}
