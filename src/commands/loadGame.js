/**
 * Command handler: load (design doc §6 "Load a saved game if one
 * exists" at match setup). Deliberately NOT registered in
 * src/commands/index.js's dispatch table -- every other command
 * mutates an existing canonicalState (dispatch's signature assumes
 * one), but loadGame instead PRODUCES a fresh canonicalState from
 * storage, so it doesn't fit that shape. Called directly by the UI
 * (start screen) before any canonicalState exists yet.
 */
import { readSave } from "../save/storage.js";
import { isCompatibleSave } from "../state/schema.js";

/**
 * @returns {{success: boolean, reason?: string, canonicalState?: object}}
 */
export function loadGame() {
  const data = readSave();
  if (!data) return { success: false, reason: "No save found." };
  if (!isCompatibleSave(data)) return { success: false, reason: "Save is from an incompatible version." };
  return { success: true, canonicalState: data };
}
