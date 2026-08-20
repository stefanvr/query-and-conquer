// Land sub-terrain texturing (gras/gravel/mountain/sand) — no hard rules govern this beyond
// what base placement needs later (a mountain base requires an all-mountain neighborhood, §2),
// so mountain is grown in clusters for that to be possible at all; the rest is gras/gravel/sand
// with a light smoothing pass so it doesn't read as salt-and-pepper noise.
import { growSeparateBodies } from "./terrain-body.js";
import { offsetKey } from "./hex-coords.js";
import { pick } from "./prng.js";

const MOUNTAIN_OWNER_BASE = 100000; // separate id range from water/island body owners

/**
 * @param {import("./grid.js").TerrainGrid} grid
 * @param {Map<string, number>} owner
 * @param {() => number} rng
 */
export function textureLandTerrain(grid, owner, rng) {
  const landCells = [...grid.cells()].filter((c) => grid.get(c.col, c.row) === "land");

  const clusterCount = Math.max(1, Math.round(landCells.length / 250));
  const mountainBodies = growSeparateBodies(grid, owner, MOUNTAIN_OWNER_BASE, rng, {
    count: clusterCount,
    totalCells: Math.max(clusterCount * 8, Math.round(landCells.length * 0.08)),
    minSize: 7,
    isUnclaimed: (c, r) => grid.get(c, r) === "land" && !owner.has(offsetKey(c, r)),
  });
  for (const body of mountainBodies) {
    for (const { col, row } of body.cells) grid.set(col, row, "mountain");
  }

  const remaining = landCells.filter((c) => grid.get(c.col, c.row) === "land");
  const weightedChoices = [
    ...Array(5).fill("gras"),
    ...Array(3).fill("gravel"),
    ...Array(2).fill("sand"),
  ];
  for (const { col, row } of remaining) {
    grid.set(col, row, pick(rng, weightedChoices));
  }

  smoothSubTerrain(grid, remaining, rng);
}

function smoothSubTerrain(grid, cells, rng, iterations = 1) {
  const subTerrains = new Set(["gras", "gravel", "sand"]);
  for (let iter = 0; iter < iterations; iter++) {
    const updates = [];
    for (const { col, row } of cells) {
      if (!subTerrains.has(grid.get(col, row))) continue;
      if (rng() >= 0.6) continue;
      const counts = {};
      for (const n of grid.neighborsOf(col, row)) {
        const t = grid.get(n.col, n.row);
        if (subTerrains.has(t)) counts[t] = (counts[t] || 0) + 1;
      }
      const entries = Object.entries(counts);
      if (entries.length === 0) continue;
      entries.sort((a, b) => b[1] - a[1]);
      updates.push({ col, row, terrain: entries[0][0] });
    }
    for (const u of updates) grid.set(u.col, u.row, u.terrain);
  }
}
