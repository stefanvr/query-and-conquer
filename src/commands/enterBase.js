/**
 * Command handler: garrison a field unit into a base it's on or
 * adjacent to (design doc §3: "Loading ... a boat or base costs 1
 * action"). Only ever garrisons into your OWN base -- there's no rule
 * for garrisoning into someone else's. Newly-completed builds are
 * garrisoned automatically (src/commands/buildTick.js,
 * src/commands/recaptureTick.js); this command is for a player
 * choosing to garrison an existing field unit (e.g. pulling a unit
 * back to defend, or a boat docking at a port base).
 *
 * Bug fix: this used to require the unit to be ON the base's exact
 * cell -- impossible for any boat (fregat/transporter/carrier) at a
 * port base, since the base's own cell is land terrain and boats have
 * move cost 0/impassable on every land terrain. Distance <= 1 (on the
 * cell OR adjacent to it) matches §3's "[loading can happen] anywhere
 * water is adjacent to land" and mirrors the same fix applied to
 * claimBase.js -- see that module's doc for the fuller reasoning.
 *
 * For fighter/bomber, entering a base is also "returning to rearm" --
 * resets strikesUsed and distanceFlownThisSortie to 0 (see
 * moveUnit.js's and attackUnit.js's docs).
 */
import { MAX_BASE_CAPACITY } from "../buildings/baseDefs.js";
import { offsetDistance } from "../hex/distance.js";

/**
 * @param {object} canonicalState
 * @param {{unitId: number, baseId: number}} payload
 * @returns {{success: boolean, reason?: string}}
 */
export function enterBase(canonicalState, { unitId, baseId }) {
  const unit = canonicalState.units.find((u) => u.id === unitId);
  const base = canonicalState.bases.find((b) => b.id === baseId);
  if (!unit || !base) return { success: false, reason: "No such unit or base." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (unit.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your unit, or not your turn." };
  }
  if (base.ownerId !== unit.ownerId) {
    return { success: false, reason: "Can only garrison into your own base." };
  }
  if (unit.garrisonedAt != null) {
    return { success: false, reason: "Unit is already garrisoned." };
  }
  if (offsetDistance(unit.position, base.position) > 1) {
    return { success: false, reason: "Unit must be on or adjacent to the base to enter it." };
  }
  if (unit.actionsRemaining < 1) {
    return { success: false, reason: "No actions remaining." };
  }
  const inProgressSlot = base.currentBuild ? 1 : 0;
  if (base.garrison.length + inProgressSlot + 1 > MAX_BASE_CAPACITY) {
    return { success: false, reason: "Base is at capacity." };
  }

  unit.actionsRemaining -= 1;
  unit.garrisonedAt = base.id;
  unit.strikesUsed = 0;
  unit.distanceFlownThisSortie = 0;
  base.garrison.push(unit.id);

  return { success: true };
}
