import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Node 18 (this project's target, see the WSL toolchain notes) has no global localStorage —
// a minimal in-memory shim is enough for these tests.
function installLocalStorageShim() {
  let store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}
installLocalStorageShim();

const { hasSave, saveGame, loadGame, clearSave } = await import("../../src/save/save-load.js");

beforeEach(() => {
  localStorage.clear();
});

test("hasSave is false with no save, true after saving", () => {
  assert.equal(hasSave(), false);
  saveGame({ turnNumber: 1 });
  assert.equal(hasSave(), true);
});

test("loadGame returns null with no save", () => {
  assert.equal(loadGame(), null);
});

test("saveGame -> loadGame round-trips the state", () => {
  const state = { turnNumber: 3, players: [{ id: 0 }], nested: { a: [1, 2, 3] } };
  saveGame(state);
  assert.deepEqual(loadGame(), state);
});

test("clearSave removes the save", () => {
  saveGame({ turnNumber: 1 });
  clearSave();
  assert.equal(hasSave(), false);
  assert.equal(loadGame(), null);
});
