import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToPixel, hexCorners, pixelToHex } from "../../src/map/hex-pixel.js";
import { offsetNeighbors } from "../../src/map/hex-coords.js";

test("hexCorners returns 6 points, all at the given radius from center", () => {
  const corners = hexCorners(10, 20, 5);
  assert.equal(corners.length, 6);
  for (const { x, y } of corners) {
    const dist = Math.hypot(x - 10, y - 20);
    assert.ok(Math.abs(dist - 5) < 1e-9);
  }
});

test("hexCorners' left/right-most points are pure horizontal offsets (flat-top: points left/right)", () => {
  const corners = hexCorners(0, 0, 10);
  const rightPoint = corners.find((c) => Math.abs(c.x - 10) < 1e-9);
  const leftPoint = corners.find((c) => Math.abs(c.x + 10) < 1e-9);
  assert.ok(rightPoint && Math.abs(rightPoint.y) < 1e-9);
  assert.ok(leftPoint && Math.abs(leftPoint.y) < 1e-9);
});

test("pixelToHex is the exact inverse of hexToPixel at hex centers", () => {
  const size = 12;
  for (let col = -6; col <= 6; col++) {
    for (let row = -6; row <= 6; row++) {
      const { x, y } = hexToPixel(col, row, size);
      assert.deepEqual(pixelToHex(x, y, size), { col, row }, `(${col},${row})`);
    }
  }
});

test("pixelToHex resolves any point inside a hex (not just its exact center) to that hex", () => {
  const size = 12;
  const target = { col: 3, row: -2 };
  const center = hexToPixel(target.col, target.row, size);
  // Small jitters well within the hex's radius should still resolve to the same cell.
  const jitters = [
    [0, 0],
    [size * 0.3, 0],
    [-size * 0.3, 0],
    [0, size * 0.3],
    [0, -size * 0.3],
    [size * 0.2, size * 0.2],
  ];
  for (const [dx, dy] of jitters) {
    assert.deepEqual(pixelToHex(center.x + dx, center.y + dy, size), target, `jitter (${dx},${dy})`);
  }
});

test("pixelToHex picks the nearer of two adjacent hexes near their shared edge", () => {
  const size = 10;
  const a = { col: 0, row: 0 };
  const b = offsetNeighbors(a)[0];
  const centerA = hexToPixel(a.col, a.row, size);
  const centerB = hexToPixel(b.col, b.row, size);
  // A point 90% of the way from A's center to B's center is closer to B.
  const near = { x: centerA.x + (centerB.x - centerA.x) * 0.9, y: centerA.y + (centerB.y - centerA.y) * 0.9 };
  assert.deepEqual(pixelToHex(near.x, near.y, size), b);
});

test("neighboring cells (per hex-coords) map to consistently-spaced pixel centers", () => {
  const size = 10;
  const center = hexToPixel(4, 4, size);
  const distances = offsetNeighbors({ col: 4, row: 4 }).map((n) => {
    const p = hexToPixel(n.col, n.row, size);
    return Math.hypot(p.x - center.x, p.y - center.y);
  });
  // All 6 neighbors should be equidistant from the center (a regular hex grid).
  for (const d of distances) assert.ok(Math.abs(d - distances[0]) < 1e-6);
});
