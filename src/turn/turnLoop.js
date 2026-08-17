/**
 * Per-turn sequence orchestration (design doc §6). Steps 1-3 (recalc
 * base repairs, complete expired builds, resolve automatic neutral-base
 * recapture) are no-ops until Stage 5 -- left as comments marking where
 * they hook in, rather than calling into their still-empty stub
 * modules (src/commands/repairTick.js etc.).
 */
import { UNIT_DEFS } from "../units/unitDefs.js";

/**
 * Advances to the next player's turn and runs the start-of-turn
 * housekeeping sequence for them.
 * @param {object} canonicalState
 */
export function advanceTurn(canonicalState) {
  const { players, turn } = canonicalState;
  const nextIndex = (turn.activePlayerIndex + 1) % players.length;
  if (nextIndex === 0) turn.number += 1;
  turn.activePlayerIndex = nextIndex;

  // Design doc §6, steps 1-3, for the newly active player, before
  // control hands over -- Stage 5:
  //   1. Recalculate base repairs.
  //   2. Complete any builds whose timer expired.
  //   3. Resolve automatic neutral-base recapture.

  // Step 4: hand control to the active player. No unused actions carry
  // over -- every unit they own gets a fresh action budget.
  const activePlayer = players[nextIndex];
  for (const unit of canonicalState.units) {
    if (unit.ownerId === activePlayer.id) {
      unit.actionsRemaining = UNIT_DEFS[unit.type].actionsPerTurn;
    }
  }
}
