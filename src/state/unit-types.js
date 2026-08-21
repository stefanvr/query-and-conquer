// Unit type data for the build economy — game spec §2's build cost table. This is all Stage 4
// needs (what the base panel's build buttons and capacity accounting run on); full per-unit
// stats/movement/combat land with each unit's own stage (Tank: 5, boats: 7, planes: 8).
export const BASE_BUILD_TIME = 5; // "bbt", in turns (§2)

export const UNIT_TYPES = {
  tank: { category: "vehicle", buildCostMultiplier: 1 },
  fighter: { category: "plane", buildCostMultiplier: 2 },
  bomber: { category: "plane", buildCostMultiplier: 5 },
  fregat: { category: "boat", buildCostMultiplier: 3 },
  transporter: { category: "boat", buildCostMultiplier: 1 },
  carrier: { category: "boat", buildCostMultiplier: 8 },
};

/** Which unit categories each base type can build (§2). */
export const BASE_CATEGORIES = {
  land: ["vehicle"],
  port: ["vehicle", "boat"],
  mountain: ["plane"],
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
