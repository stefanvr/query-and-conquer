/**
 * Command handler: end the active player's turn (design doc §6). This
 * is the CQRS "command" entry point; the actual sequencing logic lives
 * in src/turn/turnLoop.js so it isn't duplicated between here and
 * wherever else might need to trigger it.
 * @param {object} canonicalState
 * @returns {{success: true, turn: {number: number, activePlayerIndex: number}}}
 */
import { advanceTurn } from "../turn/turnLoop.js";

export function endTurn(canonicalState) {
  advanceTurn(canonicalState);
  return { success: true, turn: { ...canonicalState.turn } };
}
