import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offsetToCube,
  cubeToOffset,
  cubeDistance,
  offsetDistance,
  offsetNeighbors,
  hexesInRange,
  hexLine,
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

test("hexLine from a cell to itself is just that one cell", () => {
  assert.deepEqual(hexLine({ col: 3, row: 4 }, { col: 3, row: 4 }), [{ col: 3, row: 4 }]);
});

test("hexLine to a neighbor is exactly [a, b], with no cell in between", () => {
  const a = { col: 5, row: 5 };
  const b = offsetNeighbors(a)[0];
  assert.deepEqual(hexLine(a, b), [a, b]);
});

test("hexLine has exactly distance+1 cells, starts at a, ends at b, and each step is adjacent to the last", () => {
  const a = { col: 0, row: 0 };
  const b = { col: 4, row: 3 };
  const line = hexLine(a, b);
  assert.equal(line.length, offsetDistance(a, b) + 1);
  assert.deepEqual(line[0], a);
  assert.deepEqual(line[line.length - 1], b);
  for (let i = 1; i < line.length; i++) {
    assert.equal(offsetDistance(line[i - 1], line[i]), 1, `step ${i - 1} -> ${i} isn't adjacent`);
  }
});

test("hexLine is symmetric (reversed a/b retraces the same cells in reverse)", () => {
  const a = { col: -2, row: 3 };
  const b = { col: 3, row: -1 };
  const forward = hexLine(a, b);
  const backward = hexLine(b, a).reverse();
  assert.deepEqual(forward, backward);
});

test("hexesInRange at radius 0 is just the center cell", () => {
  const center = { col: 5, row: 5 };
  assert.deepEqual(hexesInRange(center, 0), [center]);
});

test("hexesInRange at radius 1 is the center plus its 6 neighbors, no duplicates", () => {
  const center = { col: 2, row: -3 };
  const cells = hexesInRange(center, 1);
  assert.equal(cells.length, 7);
  const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
  assert.equal(keys.size, 7, "no duplicate cells");
  assert.ok(cells.some((c) => c.col === center.col && c.row === center.row));
  for (const n of offsetNeighbors(center)) {
    assert.ok(cells.some((c) => c.col === n.col && c.row === n.row), `missing neighbor (${n.col},${n.row})`);
  }
});

test("hexesInRange returns exactly 3*r*(r+1)+1 cells, every one within `radius` of center", () => {
  const center = { col: -4, row: 6 };
  for (const radius of [2, 3, 5]) {
    const cells = hexesInRange(center, radius);
    assert.equal(cells.length, 3 * radius * (radius + 1) + 1);
    for (const c of cells) {
      assert.ok(offsetDistance(center, c) <= radius, `(${c.col},${c.row}) is beyond radius ${radius}`);
    }
  }
});
