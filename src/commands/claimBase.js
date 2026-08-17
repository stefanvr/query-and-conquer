/**
 * Command handler: claim an unclaimed/neutral base (design doc §4).
 * "Enter it with a tank, fighter, or fregat. No other unit type can
 * capture a base." Which base TYPES a given capturing unit can reach is
 * already fully enforced by the terrain move-cost table (fregat's
 * move cost is 0/impassable on every land terrain; tank/fregat both
 * have move cost 0 on mountain) -- no separate base-type eligibility
 * check is needed here, just "is a capturing-capable unit on or
 * adjacent to the base".
 *
 * Bug fix: this used to require the unit to be ON the base's exact
 * cell, which made it IMPOSSIBLE for a fregat to ever claim a port
 * base -- a port base's own cell is land terrain (gras/gravel/sand),
 * and a fregat's move cost on every land terrain is 0/impassable, so
 * it can never physically stand there. The design doc explicitly says
 * "fregats ... can only ever claim a port base" (§4), which is only
 * possible if claiming works from an ADJACENT water cell, matching §3's
 * "[loading/unloading] can happen anywhere water is adjacent to land"
 * for boats generally. Distance <= 1 (on the cell OR adjacent to it)
 * is used instead -- this still self-enforces the same per-unit-type
 * eligibility as before, because a mountain base's placement rule
 * (§7: all 6 neighbors are also mountain) makes every neighboring cell
 * just as impassable to tank/fregat as the base's own cell, so they
 * remain correctly unable to ever get within range of one.
 *
 * Claiming itself is treated as free (0 actions) -- the design doc
 * gives explicit action costs for attacking (1) and loading/unloading
 * (1 each), but describes claiming only as "enter it with a [unit]",
 * with no separate cost mentioned; the move to reach the cell already
 * paid its own action cost via moveUnit.
 *
 * Resolved ambiguity: a neutral base can be reclaimed two ways -- (a)
 * automatically when the original owner's own pending build completes
 * (src/commands/recaptureTick.js), or (b) manually, by walking a
 * capturing unit in, same as any other claim. The design doc doesn't
 * separately address case (b) when the claimant IS the base's own
 * previous owner. Treated here as equivalent to (a) -- strength resets
 * to 1 and the in-progress build/queue survive -- rather than as
 * "capture by an attacker" (strength 4, build/queue cleared), since
 * it's the rightful owner recovering their own base, not someone
 * taking it from them.
 */
import { UNIT_DEFS } from "../units/unitDefs.js";
import { NEUTRAL_BASE_RECAPTURE_STRENGTH, CAPTURED_BASE_RESET_STRENGTH } from "../buildings/baseDefs.js";
import { offsetDistance } from "../hex/distance.js";

/**
 * @param {object} canonicalState
 * @param {{unitId: number, baseId: number}} payload
 * @returns {{success: boolean, reason?: string, reclaimedByOriginalOwner?: boolean}}
 */
export function claimBase(canonicalState, { unitId, baseId }) {
  const unit = canonicalState.units.find((u) => u.id === unitId);
  const base = canonicalState.bases.find((b) => b.id === baseId);
  if (!unit || !base) return { success: false, reason: "No such unit or base." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (unit.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (unit.garrisonedAt != null) {
    return { success: false, reason: "Garrisoned units can't claim -- exit the base first." };
  }
  if (base.ownerId != null) {
    return { success: false, reason: "Base is already claimed -- attack it instead." };
  }
  if (!UNIT_DEFS[unit.type].canCapture) {
    return { success: false, reason: "This unit type can't capture bases." };
  }
  if (offsetDistance(unit.position, base.position) > 1) {
    return { success: false, reason: "Unit must be on or adjacent to the base to claim it." };
  }

  const reclaimedByOriginalOwner = base.previousOwnerId != null && base.previousOwnerId === activePlayer.id;

  base.ownerId = activePlayer.id;
  base.previousOwnerId = null;
  base.pendingRecaptureUnitType = null;

  if (reclaimedByOriginalOwner) {
    base.strength = NEUTRAL_BASE_RECAPTURE_STRENGTH;
  } else {
    base.currentBuild = null;
    base.buildQueue = [];
    base.strength = CAPTURED_BASE_RESET_STRENGTH;
  }

  return { success: true, reclaimedByOriginalOwner };
}
