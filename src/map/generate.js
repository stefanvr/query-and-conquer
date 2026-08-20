// Orchestrates one map candidate end-to-end: shape -> land/water bodies -> shallow lagoons ->
// land texturing -> validation. Generation is best-effort; validate-map.js is the authority, so
// a candidate that fails any rule is simply discarded and retried with a new seed
// (query-and-conquer.md §1's "10 candidates pre-generated" already implies a generate-and-filter
// pipeline, not a single guaranteed-correct pass).
import { TerrainGrid } from "./grid.js";
import { generateShapeBounds } from "./shape.js";
import { growSeparateBodies } from "./terrain-body.js";
import { carveShallowLagoons } from "./shallow-water.js";
import { fillSmallBodies } from "./fill-small-bodies.js";
import { textureLandTerrain } from "./terrain-texture.js";
import { validateMap } from "./validate-map.js";
import { offsetKey } from "./hex-coords.js";
import { mulberry32, randInt } from "./prng.js";
import { SIZES, TYPES, CANDIDATES_PER_COMBO } from "./map-tables.js";

function randomInRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Builds one candidate grid (may or may not satisfy every rule — see module docstring). */
function generateCandidate({ sizeKey, typeKey, shapeKind, seed }) {
  const { maxDimension, maxCells } = SIZES[sizeKey];
  const rng = mulberry32(seed);
  const shape = generateShapeBounds(shapeKind, maxDimension, maxCells, rng);
  const grid = new TerrainGrid(shape.width, shape.height, shape.inShape);
  const totalCells = [...grid.cells()].length;
  const owner = new Map();
  const isUnclaimed = (terrain) => (c, r) => grid.get(c, r) === terrain && !owner.has(offsetKey(c, r));

  const background = typeKey === "islands" ? "deep" : "land";
  for (const { col, row } of grid.cells()) grid.set(col, row, background);

  if (typeKey === "mixed") {
    const { waterMin, waterMax } = TYPES.mixed;
    const totalWaterTarget = Math.round(totalCells * randomInRange(rng, waterMin, waterMax));
    const shallowTarget = Math.round(totalWaterTarget * randomInRange(rng, 0.05, 0.15));
    const deepTarget = totalWaterTarget - shallowTarget;
    const bodyCount = randInt(rng, 2, 5); // >= 2 gives headroom for the min-2-coasts rule

    growSeparateBodies(grid, owner, 1, rng, {
      count: bodyCount,
      totalCells: deepTarget,
      minSize: 16,
      isUnclaimed: isUnclaimed("land"),
    }).forEach((body) => body.cells.forEach(({ col, row }) => grid.set(col, row, "deep")));

    carveShallowLagoons(grid, owner, rng, { targetShallowCells: shallowTarget });
  } else if (typeKey === "islands") {
    const { waterMin, waterMax, minIslands, minIslandSize } = TYPES.islands;
    const landTarget = Math.round(totalCells * (1 - randomInRange(rng, waterMin, waterMax)));
    const islandCount = randInt(rng, minIslands, minIslands + 4);

    growSeparateBodies(grid, owner, 1, rng, {
      count: islandCount,
      totalCells: landTarget,
      minSize: minIslandSize,
      isUnclaimed: isUnclaimed("deep"),
    }).forEach((body) => body.cells.forEach(({ col, row }) => grid.set(col, row, "land")));

    const shallowTarget = Math.round(landTarget * randomInRange(rng, 0, 0.05));
    if (shallowTarget > 0) carveShallowLagoons(grid, owner, rng, { targetShallowCells: shallowTarget });
  }
  // landOnly: background is already "land" everywhere; nothing more to place.

  fillSmallBodies(grid);
  textureLandTerrain(grid, owner, rng);
  return grid;
}

/**
 * Generates one valid map, retrying with new (deterministically derived) seeds until
 * validate-map.js reports no violations.
 * @returns {{ grid: TerrainGrid, seed: number, attempts: number }}
 */
export function generateValidMap({ sizeKey, typeKey, shapeKind, seed, maxAttempts = 300 }) {
  const seedSequence = mulberry32(seed);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidateSeed = Math.floor(seedSequence() * 0xffffffff);
    const grid = generateCandidate({ sizeKey, typeKey, shapeKind, seed: candidateSeed });
    if (validateMap(grid, typeKey).length === 0) {
      return { grid, seed: candidateSeed, attempts: attempt };
    }
  }
  throw new Error(
    `Could not generate a valid ${sizeKey}/${typeKey}/${shapeKind} map after ${maxAttempts} attempts`,
  );
}

/**
 * Generates CANDIDATES_PER_COMBO valid maps for one size x type combination, cycling through
 * shape kinds for visual variety.
 * @returns {{ grid: TerrainGrid, shapeKind: string, seed: number }[]}
 */
export function generateCandidatesForCombo({ sizeKey, typeKey, baseSeed, shapeKinds, count = CANDIDATES_PER_COMBO }) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const shapeKind = shapeKinds[i % shapeKinds.length];
    const { grid, seed } = generateValidMap({ sizeKey, typeKey, shapeKind, seed: baseSeed + i * 7919 });
    results.push({ grid, shapeKind, seed });
  }
  return results;
}
