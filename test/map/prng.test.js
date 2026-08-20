import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32, randInt, pick, shuffle } from "../../src/map/prng.js";

test("same seed produces the same sequence", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("different seeds produce different sequences", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB);
});

test("values stay within [0, 1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("randInt stays within [min, max)", () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 500; i++) {
    const v = randInt(rng, 5, 10);
    assert.ok(v >= 5 && v < 10);
  }
});

test("pick only returns items from the given array", () => {
  const rng = mulberry32(9);
  const items = ["a", "b", "c"];
  for (let i = 0; i < 50; i++) {
    assert.ok(items.includes(pick(rng, items)));
  }
});

test("shuffle returns a permutation (same items, same length)", () => {
  const rng = mulberry32(11);
  const items = [1, 2, 3, 4, 5];
  const shuffled = shuffle(rng, items);
  assert.equal(shuffled.length, items.length);
  assert.deepEqual([...shuffled].sort(), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5], "original array must not be mutated");
});
