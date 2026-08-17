/**
 * Terrain generation core (design doc §1 "Layout rules" / "Generation").
 * Produces TERRAIN ONLY -- bases are placed at runtime, after a
 * candidate is chosen, by src/state/basePlacement.js (design doc §7).
 * Do not add base placement here.
 *
 * Algorithm, at a glance:
 *  1. Seed random noise, then smooth it with a hex cellular automaton
 *     to get organic (not speckled) land/water blobs at roughly the
 *     target water fraction for the map type.
 *  2. Flood-fill land and water into connected components and erode
 *     any component that doesn't contain a 4x4 square (design doc's
 *     "every disconnected land or water body is at least a 4x4
 *     contiguous region"), merging it into its surroundings.
 *  3. Classify water depth by BFS distance from the nearest land cell:
 *     distance 1-3 = shallow, 4+ = deep. This satisfies the "chain of
 *     shallow water can be at most 3 cells deep" rule exactly, and the
 *     "shallow is only adjacent to land or other shallow" rule for
 *     every shallow cell's shore-facing side. (Those two rules are in
 *     literal tension for any water body wide enough to have a deep
 *     interior -- see the implementation plan's flagged assumptions.
 *     Distance-based classification is the interpretation used here.)
 *  4. Paint land cell sub-types (gras/gravel/mountain/sand) as smaller
 *     decorative blobs; no sub-type ratio is specified in the design
 *     doc, so this is a reasonable-variety default, not a hard rule.
 *
 * generateCandidates() retries with a fresh seed on constraint failure
 * rather than trying to nurse a single grid into exact compliance --
 * cheap since each attempt is a few thousand cells of array work.
 */
import { mulberry32, randInt, pick } from "./rng.js";
import { neighborsInBounds } from "../hex/neighbors.js";
import {
  floodFillComponents,
  maxSquareInComponent,
  validateRegionSizes,
  waterFraction,
  validateRatio,
} from "./constraints.js";
import { isLand, isWater } from "./terrainCodes.js";

const LAND_PLACEHOLDER = "gras";
const WATER_PLACEHOLDER = "deep";

const MAX_GENERATION_ATTEMPTS_PER_CANDIDATE = 60;
const SMOOTHING_ITERATIONS = 4;
const RATIO_ADJUST_ROUNDS = 6;
const FIXUP_ROUNDS = 6;

function createGrid(width, height, fill) {
  return Array.from({ length: height }, () => new Array(width).fill(fill));
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

/** One hex cellular-automaton smoothing pass. */
function smooth(grid, width, height) {
  const next = cloneGrid(grid);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const neighbors = neighborsInBounds({ col, row }, width, height);
      const waterNeighbors = neighbors.filter((n) => isWater(grid[n.row][n.col])).length;
      const ratio = neighbors.length === 0 ? 0 : waterNeighbors / neighbors.length;
      if (ratio >= 0.55) next[row][col] = WATER_PLACEHOLDER;
      else if (ratio <= 0.35) next[row][col] = LAND_PLACEHOLDER;
      // else: keep current value (preserves organic edges instead of flip-flopping)
    }
  }
  return next;
}

/** Grows/shrinks the water placeholder toward targetFraction via noise + smoothing rounds. */
function growWaterBlobs(width, height, rng, targetFraction) {
  let grid = createGrid(width, height, LAND_PLACEHOLDER);

  // Seed with a handful of blob centers plus light random noise, then smooth.
  const seedCount = Math.max(3, Math.round((width * height * targetFraction) / 40));
  for (let i = 0; i < seedCount; i++) {
    const col = randInt(rng, 0, width);
    const row = randInt(rng, 0, height);
    grid[row][col] = WATER_PLACEHOLDER;
  }
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (rng() < targetFraction * 0.5) grid[row][col] = WATER_PLACEHOLDER;
    }
  }
  for (let i = 0; i < SMOOTHING_ITERATIONS; i++) grid = smooth(grid, width, height);

  // Nudge toward the target fraction with a few noise+smooth adjustment rounds.
  for (let round = 0; round < RATIO_ADJUST_ROUNDS; round++) {
    const fraction = waterFraction(grid);
    const diff = targetFraction - fraction;
    if (Math.abs(diff) < 0.03) break;

    const flipToWater = diff > 0;
    const flipProbability = Math.min(0.5, Math.abs(diff) * 1.5);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const terrain = grid[row][col];
        if (flipToWater && isLand(terrain) && rng() < flipProbability) {
          grid[row][col] = WATER_PLACEHOLDER;
        } else if (!flipToWater && isWater(terrain) && rng() < flipProbability) {
          grid[row][col] = LAND_PLACEHOLDER;
        }
      }
    }
    grid = smooth(grid, width, height);
  }

  return grid;
}

/** Erodes any land/water component that fails the 4x4-square rule into its surroundings. */
function fixSmallRegions(grid, width, height) {
  for (let round = 0; round < FIXUP_ROUNDS; round++) {
    const { valid, violations } = validateRegionSizes(grid, width, height);
    if (valid) break;

    for (const [category, categoryFn] of [["land", isLand], ["water", isWater]]) {
      if (!violations.some((v) => v.category === category)) continue;
      const components = floodFillComponents(grid, width, height, categoryFn);
      for (const component of components) {
        if (maxSquareInComponent(component) < 4) {
          const replacement = category === "land" ? WATER_PLACEHOLDER : LAND_PLACEHOLDER;
          for (const { col, row } of component) grid[row][col] = replacement;
        }
      }
    }
  }
  return grid;
}

/** BFS distance-from-land classification into shallow (1-3) / deep (4+). See module doc. */
function classifyWaterDepth(grid, width, height) {
  const distance = Array.from({ length: height }, () => new Array(width).fill(-1));
  const queue = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isLand(grid[row][col])) {
        distance[row][col] = 0;
        queue.push({ col, row });
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cell = queue[head++];
    const d = distance[cell.row][cell.col];
    for (const n of neighborsInBounds(cell, width, height)) {
      if (distance[n.row][n.col] === -1) {
        distance[n.row][n.col] = d + 1;
        queue.push(n);
      }
    }
  }

  const next = cloneGrid(grid);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isWater(grid[row][col])) {
        next[row][col] = distance[row][col] <= 3 ? "shallow" : "deep";
      }
    }
  }
  return next;
}

/** Paints land sub-type variety (gras/gravel/mountain/sand) via small decorative blobs. */
function assignLandSubtypes(grid, width, height, rng) {
  const next = cloneGrid(grid);
  const landCells = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isLand(grid[row][col])) landCells.push({ col, row });
    }
  }
  if (landCells.length === 0) return next;

  // Roughly: majority gras, moderate gravel/sand patches, smaller compact
  // mountain clusters (kept compact so a mountain base's "all 6 neighbors
  // mountain" siting requirement has a realistic chance of being met by
  // Stage 4's base placement -- not a guarantee, just a favorable shape).
  const blobPlan = [
    { terrain: "gravel", blobs: Math.max(1, Math.round(landCells.length / 900)), radius: 4 },
    { terrain: "sand", blobs: Math.max(1, Math.round(landCells.length / 1100)), radius: 3 },
    { terrain: "mountain", blobs: Math.max(1, Math.round(landCells.length / 1400)), radius: 3 },
  ];

  for (const { terrain, blobs, radius } of blobPlan) {
    for (let i = 0; i < blobs; i++) {
      const center = pick(rng, landCells);
      paintBlob(next, width, height, center, radius, rng, terrain);
    }
  }
  return next;
}

/** Randomized local flood from `center`, painting land cells within roughly `radius` hex steps. */
function paintBlob(grid, width, height, center, radius, rng, terrain) {
  const visited = new Set([`${center.col},${center.row}`]);
  let frontier = [center];
  for (let step = 0; step < radius; step++) {
    const nextFrontier = [];
    for (const cell of frontier) {
      if (isLand(grid[cell.row][cell.col])) grid[cell.row][cell.col] = terrain;
      for (const n of neighborsInBounds(cell, width, height)) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key) && isLand(grid[n.row][n.col]) && rng() < 0.7) {
          visited.add(key);
          nextFrontier.push(n);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
}

/**
 * @param {{width: number, height: number, type: "islands"|"land-only"|"mixed", rng: () => number}} opts
 * @returns {string[][]} grid[row][col] of terrain names
 */
export function generateCandidate({ width, height, type, rng }) {
  if (type === "land-only") {
    const grid = createGrid(width, height, LAND_PLACEHOLDER);
    return assignLandSubtypes(grid, width, height, rng);
  }

  const targetFraction =
    type === "islands"
      ? 0.5 + rng() * 0.15 // [0.50, 0.65]
      : 0.15 + rng() * 0.2; // "mixed": [0.15, 0.35], i.e. land >= 65%

  let grid = growWaterBlobs(width, height, rng, targetFraction);
  grid = fixSmallRegions(grid, width, height);
  grid = classifyWaterDepth(grid, width, height);
  grid = assignLandSubtypes(grid, width, height, rng);
  return grid;
}

/**
 * Generates `count` valid candidates for a size/type combo, retrying
 * with a fresh deterministic seed on constraint failure.
 * @param {{width: number, height: number, type: string, count: number, seedBase: number}} opts
 * @returns {{seed: number, grid: string[][]}[]}
 */
export function generateCandidates({ width, height, type, count, seedBase }) {
  const results = [];
  const maxAttempts = count * MAX_GENERATION_ATTEMPTS_PER_CANDIDATE;
  let attempt = 0;

  while (results.length < count && attempt < maxAttempts) {
    const seed = seedBase + attempt;
    attempt++;
    const rng = mulberry32(seed);
    const grid = generateCandidate({ width, height, type, rng });

    const fraction = waterFraction(grid);
    if (!validateRatio(type, fraction)) continue;
    if (!validateRegionSizes(grid, width, height).valid) continue;

    results.push({ seed, grid });
  }

  if (results.length < count) {
    throw new Error(
      `Only generated ${results.length}/${count} valid candidates for ` +
        `${width}x${height} ${type} after ${attempt} attempts.`
    );
  }
  return results;
}
