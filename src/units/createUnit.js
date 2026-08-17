/**
 * Shared unit-instance factory -- every place a new unit comes into
 * existence (Stage 4's starting-unit house rule, Stage 5's build
 * completion and neutral-base recapture) needs the exact same fresh
 * default shape. One factory means the "reserved for later" fields
 * (strikesUsed, cargo, ...) only need updating in one place as later
 * stages start using them.
 */
import { allocateEntityId } from "../state/initialState.js";
import { UNIT_DEFS } from "./unitDefs.js";

/**
 * @param {object} canonicalState
 * @param {{ownerId: number|string, type: string, position: {col: number, row: number}, garrisonedAt?: number|string|null}} opts
 * @returns {object} the newly created unit (not yet pushed into canonicalState.units)
 */
export function createUnit(canonicalState, { ownerId, type, position, garrisonedAt = null }) {
  return {
    id: allocateEntityId(canonicalState),
    ownerId,
    type,
    position: { ...position },
    strength: UNIT_DEFS[type].strength,
    actionsRemaining: UNIT_DEFS[type].actionsPerTurn,
    // design doc §3's "Attacks/turn" column (1, for every unit type) --
    // reset alongside actionsRemaining each turn (src/turn/turnLoop.js).
    attacksUsedThisTurn: 0,
    strikesUsed: 0,
    distanceFlownThisSortie: 0,
    cargo: [],
    garrisonedAt,
  };
}
