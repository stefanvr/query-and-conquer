import { test } from "node:test";
import assert from "node:assert/strict";
import { generateValidMap } from "../../src/map/generate.js";
import { validateMap } from "../../src/map/validate-map.js";
import { serializeGrid, deserializeGrid } from "../../src/map/map-serialize.js";

test("serialize -> deserialize round-trips a generated map exactly", () => {
  const { grid } = generateValidMap({ sizeKey: "small", typeKey: "mixed", shapeKind: "hexagon", seed: 1 });
  const rows = serializeGrid(grid);
  const restored = deserializeGrid(grid.width, grid.height, rows);

  for (const { col, row } of grid.cells()) {
    assert.equal(restored.get(col, row), grid.get(col, row));
  }
  assert.deepEqual(validateMap(restored, "mixed"), []);
});

test("cells outside the map shape stay outside after round-tripping", () => {
  const { grid } = generateValidMap({ sizeKey: "small", typeKey: "landOnly", shapeKind: "circle", seed: 1 });
  const rows = serializeGrid(grid);
  const restored = deserializeGrid(grid.width, grid.height, rows);
  for (let col = 0; col < grid.width; col++) {
    for (let row = 0; row < grid.height; row++) {
      assert.equal(restored.isInMap(col, row), grid.isInMap(col, row));
    }
  }
});
