/**
 * Static per-unit-type stats (design doc §3 "Vehicles"). Pure data --
 * combat/build/AI logic that consumes it lives elsewhere and arrives
 * in later stages.
 *
 * Each unit also carries a `category` -- "vehicle" (tank), "boat"
 * (fregat/transporter/carrier), or "plane" (fighter/bomber). This is
 * what design doc §2's "Can build" column actually refers to (Land:
 * "All vehicles" = the Vehicle category, i.e. tank only; Port: "Boats
 * + Vehicles" = boats plus tank; Mountain: "Planes only"), and matches
 * §3's own "Boats and bases are always classified as 'ground' targets"
 * rule, which already treats "boat" as a named grouping. The doc's
 * §3 table previously had no category column at all, which read as if
 * "vehicle" meant "any of the 6 unit types" (the section is titled
 * "Vehicles" too) -- that reading let a land base build boats it could
 * never move (every boat has move cost 0 on all land terrain, and a
 * land base is by definition never adjacent to water). See
 * src/buildings/baseDefs.js for how this actually gates builds.
 */

export const UNIT_TYPES = ["tank", "fighter", "bomber", "fregat", "transporter", "carrier"];

/** @type {Record<string, "vehicle"|"boat"|"plane">} */
export const UNIT_CATEGORIES = {
  tank: "vehicle",
  fighter: "plane",
  bomber: "plane",
  fregat: "boat",
  transporter: "boat",
  carrier: "boat",
};

export const UNIT_DEFS = {
  tank: {
    category: "vehicle",
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
    category: "plane",
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
    // Max 4 strikes before it must return to base/carrier to rearm --
    // not an automatic forced return, just a cap on further attacks
    // until it does (design doc §3, resolved ambiguity -- see the doc's
    // own note). 100-cell round-trip range limit; crashes if exceeded.
    // Enforced by src/commands/attackUnit.js/attackBase.js (strike cap)
    // and moveUnit.js (range/crash).
    maxStrikesPerSortie: 4,
    roundTripRangeLimit: 100,
  },
  bomber: {
    category: "plane",
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
    // Max 2 strikes before it must return to base to rearm -- see
    // fighter's comment above for the "max, not mandatory" resolved
    // ambiguity. 200-cell round-trip range limit; crashes if exceeded.
    maxStrikesPerSortie: 2,
    roundTripRangeLimit: 200,
  },
  fregat: {
    category: "boat",
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
    category: "boat",
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
    category: "boat",
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
