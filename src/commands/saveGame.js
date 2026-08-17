/**
 * Command handler: save (design doc §6 mid-turn option) -- "captures
 * exact mid-turn state, single slot". Doesn't mutate canonicalState
 * itself; the "mutation" is the localStorage write. Kept in commands/
 * and in the dispatch table anyway, since it's still a deliberate
 * player-triggered stateful action, not a pure read.
 */
import { writeSave } from "../save/storage.js";

/**
 * @param {object} canonicalState
 * @returns {{success: true}}
 */
export function saveGame(canonicalState) {
  writeSave(canonicalState);
  return { success: true };
}
