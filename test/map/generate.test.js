import { test } from "node:test";
import assert from "node:assert/strict";
import { generateValidMap } from "../../src/map/generate.js";
import { validateMap } from "../../src/map/validate-map.js";
import { SHAPE_KINDS, LAND_TERRAINS, WATER_TERRAINS } from "../../src/map/map-tables.js";

// Small size, keeps the suite fast; larger sizes are exercised by the manual generation run
// during Stage 2's own verification pass rather than on every test run.
for (const typeKey of ["landOnly", "mixed"]) {
  for (const shapeKind of SHAPE_KINDS) {
    test(`generates a valid small/${typeKey}/${shapeKind} map`, () => {
      const { grid, attempts } = generateValidMap({ sizeKey: "small", typeKey, shapeKind, seed: 42 });
      assert.deepEqual(validateMap(grid, typeKey), []);
      assert.ok(attempts >= 1);
      for (const { col, row } of grid.cells()) {
        const t = grid.get(col, row);
        assert.ok(LAND_TERRAINS.includes(t) || WATER_TERRAINS.includes(t), `unexpected terrain ${t}`);
      }
    });
  }
}

// Islands is unsupported at small size (see map-tables.js's isComboSupported) — exercised at
// medium instead.
for (const shapeKind of SHAPE_KINDS) {
  test(`generates a valid medium/islands/${shapeKind} map`, () => {
    const { grid } = generateValidMap({ sizeKey: "medium", typeKey: "islands", shapeKind, seed: 42 });
    assert.deepEqual(validateMap(grid, "islands"), []);
  });
}

test("same seed reproduces the same map deterministically", () => {
  const a = generateValidMap({ sizeKey: "small", typeKey: "mixed", shapeKind: "rectangle", seed: 777 });
  const b = generateValidMap({ sizeKey: "small", typeKey: "mixed", shapeKind: "rectangle", seed: 777 });
  assert.deepEqual([...a.grid.cells()].map((c) => a.grid.get(c.col, c.row)), [...b.grid.cells()].map((c) => b.grid.get(c.col, c.row)));
});
