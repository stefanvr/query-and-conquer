/**
 * Command dispatch table -- the only entry point allowed to mutate
 * canonical state (tech-stack.md's "State access rule"). UI and AI
 * code call dispatch(), never a command handler directly, so every
 * mutation path funnels through one place.
 *
 * loadGame is NOT here -- it produces a fresh canonicalState rather
 * than mutating an existing one, so it doesn't fit dispatch's
 * signature. See src/commands/loadGame.js's module doc.
 */
import { moveUnit } from "./moveUnit.js";
import { endTurn } from "./endTurn.js";
import { attackUnit } from "./attackUnit.js";
import { attackBase } from "./attackBase.js";
import { claimBase } from "./claimBase.js";
import { buildUnit } from "./buildUnit.js";
import { cancelQueuedBuild } from "./cancelQueuedBuild.js";
import { enterBase } from "./enterBase.js";
import { exitBase } from "./exitBase.js";
import { saveGame } from "./saveGame.js";

export const COMMANDS = {
  moveUnit,
  endTurn,
  attackUnit,
  attackBase,
  claimBase,
  buildUnit,
  cancelQueuedBuild,
  enterBase,
  exitBase,
  saveGame,
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
