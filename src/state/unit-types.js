// Unit type data — game spec §2's build cost table and §3's unit/move-cost tables, combined
// into one data source. Full stat block for all 6 units, even though only Tank is actionable
// until boats (Stage 7) and planes (Stage 8) land — same pattern as the build-cost table itself.
export const BASE_BUILD_TIME = 5; // "bbt", in turns (§2)

// Move cost is action points spent to enter a cell of that terrain; 0 = impassable, not free (§3).
export const UNIT_TYPES = {
  tank: {
    category: "vehicle",
    buildCostMultiplier: 1,
    targetType: "ground",
    actionsPerTurn: 5,
    attacksPerTurn: 2,
    attackRange: 1,
    needsLOS: true,
    view: 3,
    strength: 10,
    groundAtk: 4,
    airAtk: 1,
    moveCost: { gras: 1, gravel: 2, mountain: 0, sand: 3, shallow: 0, deep: 0 },
  },
  fighter: {
    category: "plane",
    buildCostMultiplier: 2,
    targetType: "air",
    actionsPerTurn: 8,
    attacksPerTurn: 1,
    attackRange: 2,
    needsLOS: false,
    view: 5,
    strength: 15,
    groundAtk: 2,
    airAtk: 4,
    moveCost: { gras: 1, gravel: 1, mountain: 2, sand: 1, shallow: 1, deep: 1 },
    maxStrikes: 4, // before returning to base/carrier to rearm
    roundTripRange: 100,
  },
  bomber: {
    category: "plane",
    buildCostMultiplier: 5,
    targetType: "air",
    actionsPerTurn: 6,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLOS: false,
    view: 8,
    strength: 10,
    groundAtk: 8,
    airAtk: 1,
    moveCost: { gras: 1, gravel: 1, mountain: 1, sand: 1, shallow: 1, deep: 1 },
    maxStrikes: 2, // before returning to base to rearm
    roundTripRange: 200,
  },
  fregat: {
    category: "boat",
    buildCostMultiplier: 3,
    targetType: "ground",
    actionsPerTurn: 5,
    attacksPerTurn: 1,
    attackRange: 2,
    needsLOS: true,
    view: 6,
    strength: 15,
    groundAtk: 6,
    airAtk: 4,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 1, deep: 1 },
  },
  transporter: {
    category: "boat",
    buildCostMultiplier: 1,
    targetType: "ground",
    actionsPerTurn: 8,
    attacksPerTurn: 1,
    attackRange: 1,
    needsLOS: true,
    view: 3,
    strength: 30,
    groundAtk: 0,
    airAtk: 0,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 1, deep: 1 },
    holdCapacity: 5, // tanks
  },
  carrier: {
    category: "boat",
    buildCostMultiplier: 8,
    targetType: "ground",
    actionsPerTurn: 3,
    attacksPerTurn: 1,
    attackRange: 4,
    needsLOS: false,
    view: 5,
    strength: 25,
    groundAtk: 8,
    airAtk: 4,
    moveCost: { gras: 0, gravel: 0, mountain: 0, sand: 0, shallow: 0, deep: 1 },
    holdCapacity: 5, // planes
  },
};

/** Which unit categories each base type can build (§2). */
export const BASE_CATEGORIES = {
  land: ["vehicle"],
  port: ["vehicle", "boat"],
  mountain: ["plane"],
};

/** The one unit category each cargo-holding unit type accepts (§3's `holdCapacity`) — a
 * transporter carries tanks, a carrier carries planes. */
export const CARGO_CATEGORY = {
  transporter: "vehicle",
  carrier: "plane",
};

/** Build time in turns for a unit type: buildCostMultiplier x bbt (§2). */
export function buildTurns(unitType) {
  return UNIT_TYPES[unitType].buildCostMultiplier * BASE_BUILD_TIME;
}

/** Unit types a base can build, given its type and (for ports) deep-water adjacency — a Carrier
 * is only buildable at a port adjacent to deep water (§2). */
export function buildableUnitTypes(baseType, adjacentToDeepWater) {
  const categories = BASE_CATEGORIES[baseType];
  return Object.entries(UNIT_TYPES)
    .filter(([name, { category }]) => {
      if (!categories.includes(category)) return false;
      if (name === "carrier") return adjacentToDeepWater;
      return true;
    })
    .map(([name]) => name);
}

/** Move cost to enter a cell of the given terrain, or null if impassable for this unit type (§3). */
export function moveCost(unitType, terrain) {
  const cost = UNIT_TYPES[unitType].moveCost[terrain];
  return cost > 0 ? cost : null;
}
