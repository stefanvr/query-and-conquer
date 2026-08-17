/**
 * Per-turn-sequence step 3 (design doc §4 / §6): "Resolve automatic
 * neutral-base recapture." On the original owner's own next turn, if a
 * unit finishes construction (buildTick, step 2, just ran), that unit
 * auto-recaptures the base and its strength resets to 1.
 *
 * Runs strictly after buildTick in src/turn/turnLoop.js -- it only acts
 * on bases buildTick just flagged via pendingRecaptureUnitType.
 */
import { createUnit } from "../units/createUnit.js";
import { NEUTRAL_BASE_RECAPTURE_STRENGTH } from "../buildings/baseDefs.js";

/**
 * @param {object} canonicalState
 * @param {number|string} playerId - the player whose turn is starting
 */
export function recaptureTick(canonicalState, playerId) {
  for (const base of canonicalState.bases) {
    if (base.ownerId != null || base.previousOwnerId !== playerId || !base.pendingRecaptureUnitType) continue;

    const unitType = base.pendingRecaptureUnitType;
    base.pendingRecaptureUnitType = null;
    base.previousOwnerId = null;
    base.ownerId = playerId;
    base.strength = NEUTRAL_BASE_RECAPTURE_STRENGTH;

    const unit = createUnit(canonicalState, {
      ownerId: playerId,
      type: unitType,
      position: base.position,
      garrisonedAt: base.id,
    });
    canonicalState.units.push(unit);
    base.garrison.push(unit.id);

    const player = canonicalState.players.find((p) => p.id === playerId);
    if (player) player.stats.unitsBuilt += 1;
  }
}
