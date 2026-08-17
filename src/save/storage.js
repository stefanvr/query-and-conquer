/**
 * localStorage read/write for the single save slot (tech-stack.md's
 * "Save system - start with localStorage" design choice; design doc
 * §6: "save (captures exact mid-turn state, single slot)").
 */

const SAVE_KEY = "query-and-conquer:save";

/**
 * @param {object} canonicalState
 */
export function writeSave(canonicalState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(canonicalState));
}

/**
 * @returns {object|null} the parsed save, or null if none exists
 */
export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * @returns {boolean}
 */
export function hasSave() {
  return localStorage.getItem(SAVE_KEY) != null;
}
