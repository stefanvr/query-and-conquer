import { test } from "node:test";
import assert from "node:assert/strict";
import { endTurn, terminate } from "../../src/state/commands.js";

function state(turnOrder, turnIndex) {
  return { turnOrder, turnIndex, turnNumber: 1, terminated: false };
}

test("endTurn advances to the next player in turn order", () => {
  const s = state([0, 1, 2], 0);
  endTurn(s);
  assert.equal(s.turnIndex, 1);
  assert.equal(s.turnNumber, 1);
});

test("endTurn wraps around and bumps turnNumber", () => {
  const s = state([0, 1, 2], 2);
  endTurn(s);
  assert.equal(s.turnIndex, 0);
  assert.equal(s.turnNumber, 2);
});

test("terminate sets the terminated flag", () => {
  const s = state([0, 1], 0);
  terminate(s);
  assert.equal(s.terminated, true);
});
