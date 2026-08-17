/**
 * Per-turn sequence orchestration (design doc §6): recalc base repairs,
 * complete expired builds, resolve automatic neutral-base recapture,
 * then hand control to the active player. Steps 1-3 must run in this
 * exact order -- recaptureTick only acts on what buildTick just flagged
 * this same tick (see recaptureTick.js's module doc).
 */
import { UNIT_DEFS } from "../units/unitDefs.js";
import { repairTick } from "../commands/repairTick.js";
import { buildTick } from "../commands/buildTick.js";
import { recaptureTick } from "../commands/recaptureTick.js";

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

  const activePlayer = players[nextIndex];

  // Design doc §6, steps 1-3, for the newly active player, before
  // control hands over.
  repairTick(canonicalState, activePlayer.id);
  buildTick(canonicalState, activePlayer.id);
  recaptureTick(canonicalState, activePlayer.id);

  // Step 4: hand control to the active player. No unused actions carry
  // over -- every unit they own gets a fresh action budget. (A unit
  // that just got auto-recaptured/built this same tick already starts
  // with a full budget from createUnit(), so this is a harmless no-op
  // for it, not a double-grant.)
  for (const unit of canonicalState.units) {
    if (unit.ownerId === activePlayer.id) {
      unit.actionsRemaining = UNIT_DEFS[unit.type].actionsPerTurn;
    }
  }
}
