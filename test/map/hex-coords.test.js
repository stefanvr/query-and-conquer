import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offsetToCube,
  cubeToOffset,
  cubeDistance,
  offsetDistance,
  offsetNeighbors,
} from "../../src/map/hex-coords.js";

test("offset <-> cube round-trips for a grid of cells, including negative rows/cols", () => {
  for (let col = -5; col <= 5; col++) {
    for (let row = -5; row <= 5; row++) {
      const cube = offsetToCube({ col, row });
      assert.equal(cube.x + cube.y + cube.z, 0, `cube invariant for (${col},${row})`);
      const back = cubeToOffset(cube);
      assert.deepEqual(back, { col, row });
    }
  }
});

test("distance from a cell to itself is 0", () => {
  assert.equal(offsetDistance({ col: 3, row: 4 }, { col: 3, row: 4 }), 0);
});

test("distance is symmetric", () => {
  const a = { col: 2, row: -1 };
  const b = { col: -3, row: 5 };
  assert.equal(offsetDistance(a, b), offsetDistance(b, a));
});

test("every neighbor is exactly hex-distance 1 away, and each pair is unique", () => {
  const centers = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: -1, row: 0 },
    { col: 4, row: -3 },
  ];
  for (const center of centers) {
    const neighbors = offsetNeighbors(center);
    assert.equal(neighbors.length, 6);
    for (const n of neighbors) {
      assert.equal(offsetDistance(center, n), 1);
    }
    const keys = new Set(neighbors.map((n) => `${n.col},${n.row}`));
    assert.equal(keys.size, 6, "all 6 neighbors must be distinct cells");
  }
});

test("neighbor relation is symmetric: if b is a neighbor of a, a is a neighbor of b", () => {
  const a = { col: 2, row: -3 };
  for (const b of offsetNeighbors(a)) {
    const backNeighbors = offsetNeighbors(b).map((n) => `${n.col},${n.row}`);
    assert.ok(backNeighbors.includes(`${a.col},${a.row}`));
  }
});

test("cubeDistance matches offsetDistance for the same cells", () => {
  const a = { col: 5, row: 5 };
  const b = { col: -2, row: 8 };
  assert.equal(cubeDistance(offsetToCube(a), offsetToCube(b)), offsetDistance(a, b));
});
