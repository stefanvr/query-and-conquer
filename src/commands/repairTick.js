/**
 * Per-turn-sequence step 1 (design doc §6): "Recalculate base repairs."
 * Runs once per turn, for the player whose turn is starting -- see
 * src/turn/turnLoop.js.
 *
 * - Passive base self-repair: 1 SP/turn, whether or not garrisoned
 *   (design doc §2), independent of unit repair below.
 * - Unit repair: up to 5 damaged garrisoned units repaired in parallel
 *   per base, "every vehicle repairs 10 SP per bbr" (bbr = 2 turns) --
 *   read as a continuous rate (5 SP/turn), consistent with how passive
 *   base repair is phrased as a per-turn rate rather than a lump sum.
 *   "Repair queueing ... first-come, arrival order" (§9) -- garrison
 *   array order IS arrival order (units are appended on entry, per
 *   src/commands/enterBase.js), so taking the first 5 damaged entries
 *   in that order naturally implements first-come queueing with no
 *   separate queue structure needed.
 */
import { UNIT_DEFS } from "../units/unitDefs.js";
import { BASE_DEFS, PASSIVE_BASE_REPAIR_PER_TURN, REPAIR_RATE_PER_BBR, REPAIR_TIME_TURNS, MAX_PARALLEL_REPAIRS } from "../buildings/baseDefs.js";

const UNIT_REPAIR_PER_TURN = REPAIR_RATE_PER_BBR / REPAIR_TIME_TURNS;

/**
 * @param {object} canonicalState
 * @param {number|string} playerId - the player whose turn is starting
 */
export function repairTick(canonicalState, playerId) {
  for (const base of canonicalState.bases) {
    if (base.ownerId !== playerId) continue;

    const maxStrength = BASE_DEFS[base.type].strength;
    if (base.strength < maxStrength) {
      base.strength = Math.min(maxStrength, base.strength + PASSIVE_BASE_REPAIR_PER_TURN);
    }

    const damagedInOrder = base.garrison
      .map((id) => canonicalState.units.find((u) => u.id === id))
      .filter((u) => u && u.strength < UNIT_DEFS[u.type].strength);

    for (const unit of damagedInOrder.slice(0, MAX_PARALLEL_REPAIRS)) {
      unit.strength = Math.min(UNIT_DEFS[unit.type].strength, unit.strength + UNIT_REPAIR_PER_TURN);
    }
  }
}
