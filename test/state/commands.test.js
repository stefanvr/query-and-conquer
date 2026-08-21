import { test } from "node:test";
import assert from "node:assert/strict";
import { endTurn, terminate, queueBuild, processTurnStart } from "../../src/state/commands.js";
import { buildTurns } from "../../src/state/unit-types.js";

function state(turnOrder, turnIndex) {
  return { turnOrder, turnIndex, turnNumber: 1, terminated: false, bases: [], nextUnitId: 0 };
}

function landBase(overrides = {}) {
  return {
    id: 0,
    ownerId: 0,
    type: "land",
    adjacentToDeepWater: false,
    sp: 20,
    maxSp: 20,
    garrison: [],
    queue: [],
    inProgress: null,
    ...overrides,
  };
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

test("queueBuild on an idle base starts immediately, leaving the queue empty", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  assert.deepEqual(base.queue, []);
  assert.deepEqual(base.inProgress, { unitType: "tank", remainingTurns: buildTurns("tank") });
});

test("queueBuild rejects a unit type the base can't build", () => {
  const s = state([0], 0);
  const base = landBase(); // land base: vehicles only
  s.bases.push(base);
  queueBuild(s, base.id, "fighter");
  assert.equal(base.inProgress, null);
  assert.deepEqual(base.queue, []);
});

test("queueBuild queues (doesn't start) additional builds while one is already in progress", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "tank");
  assert.equal(base.queue.length, 1);
  assert.ok(base.inProgress);
});

test("queueBuild rejects once the queue already holds the max pending builds", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank"); // starts immediately
  for (let i = 0; i < 5; i++) queueBuild(s, base.id, "tank"); // fills the 5-slot queue
  assert.equal(base.queue.length, 5);
  queueBuild(s, base.id, "tank"); // 6th queued build: rejected
  assert.equal(base.queue.length, 5);
});

test("processTurnStart ticks down the in-progress build and completes it exactly on schedule", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  const turns = buildTurns("tank");

  for (let i = 0; i < turns - 1; i++) {
    processTurnStart(s, 0);
    assert.equal(base.garrison.length, 0, `garrison should still be empty after tick ${i + 1}`);
  }
  processTurnStart(s, 0); // final tick
  assert.equal(base.garrison.length, 1);
  assert.equal(base.garrison[0].unitType, "tank");
  assert.equal(base.inProgress, null);
});

test("processTurnStart starts the next queued build once the current one completes", () => {
  const s = state([0], 0);
  const base = landBase();
  s.bases.push(base);
  queueBuild(s, base.id, "tank");
  queueBuild(s, base.id, "tank");
  for (let i = 0; i < buildTurns("tank"); i++) processTurnStart(s, 0);
  assert.equal(base.garrison.length, 1);
  assert.ok(base.inProgress, "second queued tank should now be in progress");
});

test("processTurnStart only affects bases owned by the given player", () => {
  const s = state([0, 1], 0);
  const mine = landBase({ id: 0, ownerId: 0 });
  const theirs = landBase({ id: 1, ownerId: 1 });
  s.bases.push(mine, theirs);
  queueBuild(s, mine.id, "tank");
  queueBuild(s, theirs.id, "tank");
  processTurnStart(s, 0);
  assert.equal(mine.inProgress.remainingTurns, buildTurns("tank") - 1);
  assert.equal(theirs.inProgress.remainingTurns, buildTurns("tank")); // untouched
});

test("a completed build never starts the next queued item if the base is at max capacity", () => {
  const s = state([0], 0);
  const base = landBase({ garrison: Array.from({ length: 15 }, (_, i) => ({ id: i, unitType: "tank" })) });
  s.bases.push(base);
  base.queue.push({ unitType: "tank" }); // manually queued; base is already full
  processTurnStart(s, 0);
  assert.equal(base.inProgress, null, "no room to start a build");
  assert.equal(base.queue.length, 1, "stays queued");
});
