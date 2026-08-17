/**
 * Per-turn-sequence step 2 (design doc §6): "Complete any builds whose
 * timer expired." Runs once per turn, for the player whose turn is
 * starting -- see src/turn/turnLoop.js.
 *
 * Also processes NEUTRAL bases whose previousOwnerId is this player --
 * design doc §4: "A build already in progress ... survives the base
 * sitting neutral". A completed build at a still-neutral base does NOT
 * spawn/garrison a unit immediately (a neutral base has no owner to
 * garrison a unit "for", and always has an empty garrison -- see the
 * module doc for why); it's held as `pendingRecaptureUnitType` for
 * step 3 (src/commands/recaptureTick.js) to actually construct the unit
 * and flip the base back to owned in one atomic step.
 */
import { createUnit } from "../units/createUnit.js";
import { newBuildOrder } from "./buildUnit.js";

/**
 * @param {object} canonicalState
 * @param {number|string} playerId - the player whose turn is starting
 */
export function buildTick(canonicalState, playerId) {
  const relevantBases = canonicalState.bases.filter(
    (b) => b.ownerId === playerId || (b.ownerId == null && b.previousOwnerId === playerId)
  );

  for (const base of relevantBases) {
    if (!base.currentBuild) continue;

    base.currentBuild.turnsRemaining -= 1;
    if (base.currentBuild.turnsRemaining > 0) continue;

    const { unitType } = base.currentBuild;
    base.currentBuild = base.buildQueue.length > 0 ? newBuildOrder(base.buildQueue.shift()) : null;

    if (base.ownerId === playerId) {
      // Normal case: base is owned, garrison the new unit immediately.
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
    } else {
      // Base is currently neutral -- hand off to recaptureTick.
      base.pendingRecaptureUnitType = unitType;
    }
  }
}
