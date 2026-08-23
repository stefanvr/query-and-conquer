import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid } from "../../src/map/grid.js";
import { placeBases, neutralBaseCount, neutralBaseStartingSp } from "../../src/state/base-placement.js";
import { offsetDistance } from "../../src/map/hex-coords.js";
import { MIN_BASE_DISTANCE } from "../../src/map/map-tables.js";
import { mulberry32 } from "../../src/map/prng.js";
import { generateValidMap } from "../../src/map/generate.js";
import { validateMap } from "../../src/map/validate-map.js";

function fillGrid(width, height, terrain) {
  const grid = new TerrainGrid(width, height, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, terrain);
  return grid;
}

test("places exactly one base per player, owned correctly", () => {
  const grid = fillGrid(40, 40, "gras");
  const bases = placeBases(grid, [0, 1, 2, 3], mulberry32(1));
  assert.equal(bases.length, 4);
  assert.deepEqual(
    bases.map((b) => b.ownerId).sort(),
    [0, 1, 2, 3],
  );
});

test("every pair of bases respects the minimum distance rule, regardless of owner", () => {
  const grid = fillGrid(40, 40, "gras");
  const bases = placeBases(grid, [0, 1, 2, 3, 4, 5], mulberry32(2));
  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++) {
      const d = offsetDistance(bases[i], bases[j]);
      assert.ok(d >= MIN_BASE_DISTANCE, `bases ${i},${j} are only ${d} apart`);
    }
  }
});

test("all-gras land, not adjacent to water, places a land base", () => {
  const grid = fillGrid(20, 20, "gras");
  const [base] = placeBases(grid, [0], mulberry32(3));
  assert.equal(base.type, "land");
});

// A 3-column strip (water, land, water) so every land cell is guaranteed water-adjacent —
// placement is uniform-random over all eligible cells, so a single special cell in an otherwise
// all-land grid would almost never be the one sampled; the target terrain has to dominate.
function landStripBetweenWater(waterTerrain, height = 10) {
  const grid = new TerrainGrid(3, height, () => true);
  for (let row = 0; row < height; row++) {
    grid.set(0, row, waterTerrain);
    grid.set(1, row, "gras");
    grid.set(2, row, waterTerrain);
  }
  return grid;
}

test("land adjacent to shallow (but not deep) water places a port, not carrier-eligible", () => {
  const grid = landStripBetweenWater("shallow");
  const [base] = placeBases(grid, [0], mulberry32(4));
  assert.equal(base.type, "port");
  assert.equal(base.adjacentToDeepWater, false);
});

test("land adjacent to deep water places a carrier-eligible port", () => {
  const grid = landStripBetweenWater("deep");
  const [base] = placeBases(grid, [0], mulberry32(5));
  assert.equal(base.type, "port");
  assert.equal(base.adjacentToDeepWater, true);
});

test("an all-mountain grid places a mountain base", () => {
  const grid = fillGrid(10, 10, "mountain"); // interior cells all have 6 mountain neighbors
  const [base] = placeBases(grid, [0], mulberry32(6));
  assert.equal(base.type, "mountain");
});

test("a lone mountain cell (not all neighbors mountain) is never chosen as a base site", () => {
  const grid = fillGrid(10, 10, "gras");
  grid.set(5, 5, "mountain"); // isolated — its neighbors are all gras
  const bases = placeBases(grid, [0], mulberry32(7));
  // The only base placed should be the surrounding land, never the isolated mountain cell.
  assert.notEqual(`${bases[0].col},${bases[0].row}`, "5,5");
});

// --- Neutral bases (game spec §5) ---

test("neutralBaseCount scales with player count, matching it on a fully-eligible small-sized grid", () => {
  // 1600 cells, all gras (eligible everywhere) == SIZES.small.maxCells exactly, so the ratio
  // against SIZES.small.maxCells is 1 and the formula reduces to player count.
  const grid = fillGrid(40, 40, "gras");
  assert.equal(neutralBaseCount(4, grid), 4);
  assert.equal(neutralBaseCount(1, grid), 1);
});

test("neutralBaseCount scales down on a grid with less usable land, not just a smaller nominal size", () => {
  // Half the cells are deep water (never eligible) -- half the density of the fully-eligible case
  // above, for the exact same nominal cell count. This is the fix for the failure mode found
  // while implementing (islands maps, where nominal cell count includes unusable open water):
  // density must track what the grid can actually hold, not its raw size.
  const grid = new TerrainGrid(40, 40, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, col < 20 ? "gras" : "deep");
  assert.equal(neutralBaseCount(4, grid), 2);
});

test("neutralBaseCount scales up proportionally on a bigger (fully-eligible) grid", () => {
  // extraLarge is 7.5x a small map's cells (map-tables.js's SIZES) -> round(4 * 7.5) = 30.
  const extraLarge = fillGrid(120, 100, "gras"); // >= SIZES.extraLarge.maxCells (12000)
  assert.equal(neutralBaseCount(4, extraLarge), 30);
});

test("neutralBaseStartingSp is half strength, rounded", () => {
  assert.equal(neutralBaseStartingSp(20), 10);
  assert.equal(neutralBaseStartingSp(15), 8); // rounds rather than truncates
});

test("placeBases seeds neutralCount additional unowned bases alongside the player ones", () => {
  const grid = fillGrid(40, 40, "gras");
  const bases = placeBases(grid, [0, 1, 2], mulberry32(10), { neutralCount: 3 });
  assert.equal(bases.length, 6);
  const owned = bases.filter((b) => b.ownerId !== null);
  const neutral = bases.filter((b) => b.ownerId === null);
  assert.deepEqual(owned.map((b) => b.ownerId).sort(), [0, 1, 2]);
  assert.equal(neutral.length, 3);
});

test("adding neutral bases never moves where the player bases land -- same seeds, same order", () => {
  // The whole point of seeding players and neutrals together (base-placement.js's own comment):
  // the first N farthest-point seeds are identical whether N or N+M points are asked for, so
  // this must be a strict superset of the player-only placement, not a different one.
  const grid = fillGrid(40, 40, "gras");
  const playersOnly = placeBases(grid, [0, 1, 2], mulberry32(11));
  const withNeutrals = placeBases(grid, [0, 1, 2], mulberry32(11), { neutralCount: 5 });
  assert.deepEqual(
    withNeutrals.slice(0, 3).map((b) => ({ col: b.col, row: b.row, type: b.type })),
    playersOnly.map((b) => ({ col: b.col, row: b.row, type: b.type })),
  );
});

test("every pair of bases respects the minimum distance rule with neutrals mixed in too", () => {
  const grid = fillGrid(50, 50, "gras");
  const bases = placeBases(grid, [0, 1, 2], mulberry32(12), { neutralCount: 4 });
  assert.equal(bases.length, 7);
  for (let i = 0; i < bases.length; i++) {
    for (let j = i + 1; j < bases.length; j++) {
      assert.ok(offsetDistance(bases[i], bases[j]) >= MIN_BASE_DISTANCE);
    }
  }
});

test("throws when there isn't enough room to place every base with required spacing", () => {
  const grid = fillGrid(6, 6, "gras"); // far too small/cramped for 6 spaced-out bases
  assert.throws(() => placeBases(grid, [0, 1, 2, 3, 4, 5], mulberry32(8), { maxReseedAttempts: 3, maxCandidateAttempts: 20 }));
});

test("integration: real generated maps place bases successfully for a range of player counts", () => {
  for (const [sizeKey, typeKey] of [
    ["small", "landOnly"],
    ["medium", "mixed"],
    ["medium", "islands"],
  ]) {
    const { grid } = generateValidMap({ sizeKey, typeKey, shapeKind: "rectangle", seed: 42 });
    assert.deepEqual(validateMap(grid, typeKey), []);
    for (const playerCount of [2, 6]) {
      const playerIds = Array.from({ length: playerCount }, (_, i) => i);
      const neutralCount = neutralBaseCount(playerCount, grid);
      const bases = placeBases(grid, playerIds, mulberry32(99), { neutralCount });
      assert.equal(bases.length, playerCount + neutralCount);
      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          assert.ok(offsetDistance(bases[i], bases[j]) >= MIN_BASE_DISTANCE);
        }
      }
    }
  }
});
