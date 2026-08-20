// Validates a fully-generated grid against query-and-conquer.md §1's hard rules. Returns a list
// of human-readable violations (empty = valid). The generator is best-effort; this is the
// authority that decides whether a candidate map is actually usable — a candidate with any
// violation gets discarded and regenerated with a new seed (see generate.js).
import { findComponents } from "./grid.js";
import { offsetKey } from "./hex-coords.js";
import { MIN_BODY_EXTENT, MAX_SHALLOW_CHAIN, TYPES, isLandTerrain, isWaterTerrain } from "./map-tables.js";

const isLand = isLandTerrain;
const isWater = isWaterTerrain;

/** BFS outward from `start` up to maxRadius hex-steps; true if a land cell is reached. */
function hasLandWithinRadius(grid, start, maxRadius) {
  let frontier = [start];
  const visited = new Set([offsetKey(start.col, start.row)]);
  for (let dist = 0; dist <= maxRadius; dist++) {
    if (frontier.some((c) => isLand(grid.get(c.col, c.row)))) return true;
    const next = [];
    for (const cell of frontier) {
      for (const n of grid.neighborsOf(cell.col, cell.row)) {
        const key = offsetKey(n.col, n.row);
        if (!visited.has(key)) {
          visited.add(key);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return false;
}

function touchesTerrain(grid, cells, predicate) {
  return cells.some(({ col, row }) => grid.neighborsOf(col, row).some((n) => predicate(grid.get(n.col, n.row))));
}

/**
 * @param {import("./grid.js").TerrainGrid} grid
 * @param {"landOnly"|"mixed"|"islands"} typeKey
 * @returns {string[]} violations; empty means the map is valid
 */
export function validateMap(grid, typeKey) {
  const violations = [];
  const allCells = [...grid.cells()];
  const totalCells = allCells.length;

  const landComponents = findComponents(grid, isLand);
  const waterComponents = findComponents(grid, isWater);

  for (const c of [...landComponents, ...waterComponents]) {
    const w = c.maxCol - c.minCol + 1;
    const h = c.maxRow - c.minRow + 1;
    if (w < MIN_BODY_EXTENT || h < MIN_BODY_EXTENT) {
      violations.push(
        `body near (${c.minCol},${c.minRow}) is only ${w}x${h}, below the ${MIN_BODY_EXTENT}x${MIN_BODY_EXTENT} minimum`,
      );
    }
  }

  for (const { col, row } of allCells) {
    if (grid.get(col, row) !== "shallow") continue;
    if (grid.neighborsOf(col, row).some((n) => grid.get(n.col, n.row) === "deep")) {
      violations.push(`shallow (${col},${row}) is adjacent to deep water`);
    }
    if (!hasLandWithinRadius(grid, { col, row }, MAX_SHALLOW_CHAIN)) {
      violations.push(`shallow (${col},${row}) is more than ${MAX_SHALLOW_CHAIN} cells from land`);
    }
  }

  const waterCells = waterComponents.reduce((sum, c) => sum + c.cells.length, 0);
  const waterFraction = totalCells === 0 ? 0 : waterCells / totalCells;

  if (typeKey === "landOnly") {
    if (waterCells > 0) violations.push(`land-only map has ${waterCells} water cells, expected 0`);
  } else {
    const { waterMin, waterMax } = TYPES[typeKey];
    if (waterFraction < waterMin || waterFraction > waterMax) {
      violations.push(
        `water fraction ${waterFraction.toFixed(3)} outside [${waterMin}, ${waterMax}] for type "${typeKey}"`,
      );
    }
  }

  if (typeKey === "mixed") {
    const deepComponents = findComponents(grid, (t) => t === "deep");
    const coastCount = deepComponents.filter((c) => touchesTerrain(grid, c.cells, isLand)).length;
    if (coastCount < TYPES.mixed.minDeepCoasts) {
      violations.push(`only ${coastCount} deep-water coasts, need >= ${TYPES.mixed.minDeepCoasts}`);
    }
  }

  if (typeKey === "islands") {
    const islandBodies = landComponents.filter((c) => c.cells.length >= TYPES.islands.minIslandSize);
    if (islandBodies.length < TYPES.islands.minIslands) {
      violations.push(
        `only ${islandBodies.length} islands >= ${TYPES.islands.minIslandSize} cells, need >= ${TYPES.islands.minIslands}`,
      );
    }
    const deepAdjacentIslands = islandBodies.filter((c) =>
      touchesTerrain(grid, c.cells, (t) => t === "deep"),
    ).length;
    if (deepAdjacentIslands < TYPES.islands.minDeepIslands) {
      violations.push(
        `only ${deepAdjacentIslands} islands adjacent to deep water, need >= ${TYPES.islands.minDeepIslands}`,
      );
    }
  }

  return violations;
}
