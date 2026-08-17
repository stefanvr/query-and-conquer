/**
 * Static per-unit-type stats (design doc §3 "Vehicles"). Pure data --
 * combat/build/AI logic that consumes it lives elsewhere and arrives
 * in later stages.
 */

export const UNIT_TYPES = ["tank", "fighter", "bomber", "fregat", "transporter", "carrier"];

export const UNIT_DEFS = {
  tank: {
    actionsPerTurn: 5,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLineOfSight: true,
    view: 3,
    strength: 10,
    groundAttack: 4,
    airAttack: 1,
    moveCost: { gras: 1, gravel: 2, mountain: 0, sand: 3, shallow: 0, deep: 0 },
    canCapture: true,
  },
  fighter: {
    actionsPerTurn: 8,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLineOfSight: false,
    view: 5,
    strength: 15,
    groundAttack: 2,
    airAttack: 4,
    moveCost: { gras: 1, gravel: 1, mountain: 2, sand: 1, shallow: 1, deep: 1 },
    canCapture: true,
    // Returns to base/carrier after 4 strikes; 100-cell round-trip range
    // limit; crashes if exceeded. Enforced by Stage 5 combat/turn logic.
    strikesBeforeReturn: 4,
    roundTripRangeLimit: 100,
  },
  bomber: {
    actionsPerTurn: 6,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLineOfSight: false,
    view: 8,
    strength: 10,
    groundAttack: 8,
    airAttack: 1,
    moveCost: { gras: 1, gravel: 1, mountain: 1, sand: 1, shallow: 1, deep: 1 },
    canCapture: false,
    // Returns to base after 2 strikes; 200-cell round-trip range limit;
    // crashes if exceeded. Enforced by Stage 5 combat/turn logic.
    strikesBeforeReturn: 2,
    roundTripRangeLimit: 200,
  },
  fregat: {
    actionsPerTurn: 5,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLineOfSight: true,
    view: 6,
    strength: 15,
    groundAttack: 6,
    airAttack: 4,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 1, deep: 1 },
    canCapture: true, // can only ever claim a port base -- can't move onto land
  },
  transporter: {
    actionsPerTurn: 8,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLineOfSight: true,
    view: 3,
    strength: 30,
    groundAttack: 0,
    airAttack: 0,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 1, deep: 1 },
    canCapture: false,
    holdCapacity: 5,
    holds: "tank",
  },
  carrier: {
    actionsPerTurn: 3,
    attacksPerTurn: 1,
    attackRange: 4,
    needsLineOfSight: false,
    view: 5,
    strength: 25,
    groundAttack: 8,
    airAttack: 4,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 0, deep: 1 },
    canCapture: false,
    holdCapacity: 5,
    holds: "plane", // fighter or bomber
  },
};

/**
 * @param {string} type
 * @param {string} terrain
 * @returns {number} action-point cost to enter that terrain; 0 = impassable (design doc §3)
 */
export function moveCostFor(type, terrain) {
  return UNIT_DEFS[type].moveCost[terrain];
}
