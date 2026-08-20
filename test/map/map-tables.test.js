import { test } from "node:test";
import assert from "node:assert/strict";
import { isComboSupported, SIZES, TYPES } from "../../src/map/map-tables.js";

test("islands is unsupported at small size, per query-and-conquer.md's noted exception", () => {
  assert.equal(isComboSupported("small", "islands"), false);
});

test("every other size x type combination is supported", () => {
  for (const sizeKey of Object.keys(SIZES)) {
    for (const typeKey of Object.keys(TYPES)) {
      if (sizeKey === "small" && typeKey === "islands") continue;
      assert.equal(isComboSupported(sizeKey, typeKey), true, `${sizeKey}/${typeKey}`);
    }
  }
});
