/**
 * Command dispatch table -- the only entry point allowed to mutate
 * canonical state (tech-stack.md's "State access rule"). UI and AI
 * code call dispatch(), never a command handler directly, so every
 * mutation path funnels through one place.
 */
import { moveUnit } from "./moveUnit.js";
import { endTurn } from "./endTurn.js";

export const COMMANDS = {
  moveUnit,
  endTurn,
};

/**
 * @param {object} canonicalState
 * @param {keyof COMMANDS} type
 * @param {object} [payload]
 * @returns {object} the command handler's result
 */
export function dispatch(canonicalState, type, payload) {
  const handler = COMMANDS[type];
  if (!handler) throw new Error(`Unknown command: ${type}`);
  return handler(canonicalState, payload);
}
