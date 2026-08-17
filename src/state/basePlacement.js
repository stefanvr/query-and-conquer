/**
 * Automatic base placement (design doc §7): "the map is divided into
 * roughly equal regions (seeded from evenly spaced points), and one
 * base is placed per region via rejection sampling against each base
 * type's terrain and min-distance rules." Deliberately narrow entry
 * point (placeBases) so this heuristic can be swapped for another
 * later without touching any caller.
 */
import { isWater } from "../map-gen/terrainCodes.js";
import { neighborsInBounds } from "../hex/neighbors.js";
import { offsetDistance } from "../hex/distance.js";
import { shuffle } from "../rng.js";
import { BASE_DEFS } from "../buildings/baseDefs.js";
import { allocateEntityId } from "./initialState.js";

const MIN_BASE_DISTANCE = 5; // design doc §1: "regardless of owner"

/**
 * Places one base per given player ID directly onto canonicalState
 * (mutates .bases and the shared ID counter), and returns the newly
 * created base objects.
 * @param {object} canonicalState
 * @param {(number|string)[]} playerIds
 * @param {() => number} rng - seeded PRNG (src/rng.js's mulberry32)
 * @returns {object[]} the newly placed bases
 */
export function placeBases(canonicalState, playerIds, rng) {
  const { width, height, terrain } = canonicalState.map;
  const seeds = generateSeedPoints(width, height, playerIds.length, rng);
  const regionOf = assignRegions(width, height, seeds);

  const placedCells = [];
  const newBases = [];

  for (let i = 0; i < playerIds.length; i++) {
    const regionCells = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (regionOf[row][col] === i) regionCells.push({ col, row });
      }
    }
    shuffle(rng, regionCells);

    let site = findValidSite(regionCells, terrain, width, height, placedCells);
    if (!site) {
      // Fallback: no valid site inside this player's assigned region
      // (e.g. an all-water region on an islands map). The design doc
      // doesn't cover this failure case -- documented assumption:
      // search the whole map instead of failing the player entirely.
      const allCells = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) allCells.push({ col, row });
      }
      shuffle(rng, allCells);
      site = findValidSite(allCells, terrain, width, height, placedCells);
    }
    if (!site) {
      throw new Error(
        `No valid base site found for player ${playerIds[i]} -- terrain/min-distance ` +
          `constraints exhausted across the whole map.`
      );
    }

    const base = {
      id: allocateEntityId(canonicalState),
      ownerId: playerIds[i],
      type: site.type,
      position: site.cell,
      strength: BASE_DEFS[site.type].strength,
      garrison: [], // unit IDs, oldest-entered-first (design doc §4 damage-resolution order)
      buildQueue: [], // pending unitType strings, up to MAX_BUILD_QUEUE
      currentBuild: null, // { unitType, turnsRemaining } | null
      // Neutral-base bookkeeping (design doc §4) -- both null while the
      // base has a normal owner; set when strength hits 0 (Stage 5
      // src/commands/attackBase.js) and cleared on reclaim/capture
      // (src/commands/claimBase.js) or once the pending build actually
      // completes and auto-recaptures (src/commands/recaptureTick.js).
      previousOwnerId: null,
      pendingRecaptureUnitType: null,
    };
    newBases.push(base);
    placedCells.push(site.cell);
  }

  canonicalState.bases.push(...newBases);
  return newBases;
}

/**
 * Which base type (if any) a cell qualifies as a site for, per design
 * doc §2's "Location requirement" column.
 * @returns {"land"|"port"|"mountain"|null}
 */
function baseTypeForCell(cell, terrain, width, height) {
  const t = terrain[cell.row][cell.col];
  const neighbors = neighborsInBounds(cell, width, height);

  if (t === "mountain") {
    const hasFullMountainRing = neighbors.length === 6 && neighbors.every((n) => terrain[n.row][n.col] === "mountain");
    return hasFullMountainRing ? "mountain" : null;
  }

  if (t === "gras" || t === "gravel" || t === "sand") {
    const adjacentToWater = neighbors.some((n) => isWater(terrain[n.row][n.col]));
    return adjacentToWater ? "port" : "land";
  }

  return null; // shallow/deep water cells can never host a base
}

function findValidSite(cells, terrain, width, height, placedCells) {
  for (const cell of cells) {
    const type = baseTypeForCell(cell, terrain, width, height);
    if (!type) continue;
    if (placedCells.some((p) => offsetDistance(p, cell) < MIN_BASE_DISTANCE)) continue;
    return { cell, type };
  }
  return null;
}

/** Roughly evenly-spaced seed points across the grid, one per player, order shuffled. */
function generateSeedPoints(width, height, count, rng) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const points = [];

  for (let r = 0; r < rows && points.length < count; r++) {
    for (let c = 0; c < cols && points.length < count; c++) {
      const col = Math.min(width - 1, Math.max(0, Math.round(((c + 0.5) / cols) * width)));
      const row = Math.min(height - 1, Math.max(0, Math.round(((r + 0.5) / rows) * height)));
      points.push({ col, row });
    }
  }
  return shuffle(rng, points);
}

/** Assigns every cell to its nearest seed point (a Voronoi partition by hex distance). */
function assignRegions(width, height, seeds) {
  const region = Array.from({ length: height }, () => new Array(width).fill(0));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const d = offsetDistance({ col, row }, seeds[i]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      region[row][col] = best;
    }
  }
  return region;
}
