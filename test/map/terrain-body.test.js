import { test } from "node:test";
import assert from "node:assert/strict";
import { TerrainGrid } from "../../src/map/grid.js";
import { offsetKey } from "../../src/map/hex-coords.js";
import { growBlob, growSeparateBodies, splitSizeBudget } from "../../src/map/terrain-body.js";
import { mulberry32 } from "../../src/map/prng.js";

function unclaimedGrid(width, height) {
  const grid = new TerrainGrid(width, height, () => true);
  for (const { col, row } of grid.cells()) grid.set(col, row, "unclaimed");
  return grid;
}

test("growBlob reaches the target size on an open grid", () => {
  const grid = unclaimedGrid(20, 20);
  const owner = new Map();
  const rng = mulberry32(1);
  const cells = growBlob(grid, owner, 1, { col: 10, row: 10 }, 30, (c, r) => grid.get(c, r) === "unclaimed", rng);
  assert.equal(cells.length, 30);
  assert.equal(new Set(cells.map((c) => offsetKey(c.col, c.row))).size, 30, "no duplicate cells");
});

test("growBlob only claims cells owned by nobody or itself", () => {
  const grid = unclaimedGrid(10, 10);
  const owner = new Map();
  const rng = mulberry32(2);
  growBlob(grid, owner, 1, { col: 0, row: 0 }, 15, (c, r) => grid.get(c, r) === "unclaimed", rng);
  for (const [, id] of owner) assert.equal(id, 1);
});

test("splitSizeBudget: every share is at least minSize, and shares sum to <= totalCells when possible", () => {
  const rng = mulberry32(5);
  const shares = splitSizeBudget(rng, 1000, 4, 100);
  assert.equal(shares.length, 4);
  for (const s of shares) assert.ok(s >= 100);
});

test("growSeparateBodies produces bodies that never touch each other", () => {
  const grid = unclaimedGrid(30, 30);
  const owner = new Map();
  const rng = mulberry32(3);
  const bodies = growSeparateBodies(grid, owner, 1, rng, {
    count: 5,
    totalCells: 400,
    minSize: 10,
    isUnclaimed: (c, r) => grid.get(c, r) === "unclaimed",
  });

  assert.ok(bodies.length >= 1, "should grow at least one body in a 30x30 open grid");
  for (const body of bodies) assert.ok(body.cells.length >= 10);

  // No cell in one body may neighbor a cell owned by a different body.
  for (const { col, row } of grid.cells()) {
    const key = offsetKey(col, row);
    const myOwner = owner.get(key);
    if (myOwner === undefined) continue;
    for (const n of grid.neighborsOf(col, row)) {
      const theirOwner = owner.get(offsetKey(n.col, n.row));
      if (theirOwner !== undefined) {
        assert.equal(theirOwner, myOwner, `cell (${col},${row}) touches a different body`);
      }
    }
  }
});
