// Single save slot, localStorage-backed (tech-stack.md's "Save system" design choice — start
// with localStorage, risk of insufficient storage accepted for v1). Only the mid-turn menu's
// Save action writes here (implementation-spec.md §10) — quitting never autosaves.
const SAVE_KEY = "queryAndConquer.save";

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function saveGame(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
