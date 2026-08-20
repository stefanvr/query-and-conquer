import { test } from "node:test";
import assert from "node:assert/strict";
import { generateShapeBounds } from "../../src/map/shape.js";
import { mulberry32 } from "../../src/map/prng.js";
import { SIZES, SHAPE_KINDS } from "../../src/map/map-tables.js";

function countInShapeCells(shape) {
  let count = 0;
  for (let col = 0; col < shape.width; col++) {
    for (let row = 0; row < shape.height; row++) {
      if (shape.inShape(col, row)) count++;
    }
  }
  return count;
}

for (const [sizeName, { maxDimension, maxCells }] of Object.entries(SIZES)) {
  for (const kind of SHAPE_KINDS) {
    test(`${kind} shape at ${sizeName} respects maxDimension and maxCells`, () => {
      const rng = mulberry32(1234);
      const shape = generateShapeBounds(kind, maxDimension, maxCells, rng);
      assert.ok(shape.width <= maxDimension, `width ${shape.width} <= ${maxDimension}`);
      assert.ok(shape.height <= maxDimension, `height ${shape.height} <= ${maxDimension}`);
      const cellCount = countInShapeCells(shape);
      assert.ok(cellCount <= maxCells, `cellCount ${cellCount} <= ${maxCells}`);
      assert.ok(cellCount > 0, "shape must contain at least one cell");
    });
  }
}

test("rectangle and square shapes get reasonably close to maxCells (maximize cell count)", () => {
  const rng = mulberry32(1);
  const { maxDimension, maxCells } = SIZES.small;
  for (const kind of ["rectangle", "square"]) {
    const shape = generateShapeBounds(kind, maxDimension, maxCells, rng);
    const cellCount = countInShapeCells(shape);
    assert.ok(cellCount >= maxCells * 0.9, `${kind}: ${cellCount} should be near ${maxCells}`);
  }
});

test("hexagon and circle shapes are meaningfully non-rectangular (skip some bounding-box cells)", () => {
  const rng = mulberry32(1);
  const { maxDimension, maxCells } = SIZES.medium;
  for (const kind of ["hexagon", "circle"]) {
    const shape = generateShapeBounds(kind, maxDimension, maxCells, rng);
    const cellCount = countInShapeCells(shape);
    assert.ok(
      cellCount < shape.width * shape.height,
      `${kind} should omit some bounding-box corners`,
    );
  }
});
