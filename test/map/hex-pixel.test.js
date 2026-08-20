import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToPixel, hexCorners } from "../../src/map/hex-pixel.js";
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
