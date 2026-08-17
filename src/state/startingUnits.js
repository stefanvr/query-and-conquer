/**
 * v1 HOUSE RULE, not in the design doc: each player starts with one
 * free unit at their base, so the game is playable/testable through
 * the real UI before the build system (Stage 5) exists. The design
 * doc only says "each player starts with one base" -- confirmed with
 * the user as an intentional deviation (see the implementation
 * conversation for Stage 4).
 *
 * The starting unit's type is picked as the cheapest thing that base
 * type can actually build (BUILD_COST_MULTIPLIER, design doc §2),
 * rather than always a tank -- a tank has move cost 0 (impassable) on
 * mountain terrain, so a mountain-base player given a tank would spawn
 * permanently stranded on their own base.
 */
import { BASE_DEFS, BUILD_COST_MULTIPLIER } from "../buildings/baseDefs.js";
import { createUnit } from "../units/createUnit.js";

/**
 * @param {object} canonicalState
 * @param {object[]} bases - newly placed bases (one per player) to spawn a starting unit at
 * @returns {object[]} the newly created units
 */
export function spawnStartingUnits(canonicalState, bases) {
  const newUnits = bases.map((base) =>
    createUnit(canonicalState, {
      ownerId: base.ownerId,
      type: cheapestBuildableType(base.type),
      position: base.position,
      // A field unit, not garrisoned -- see the module doc; it stands
      // at the base's cell but doesn't count against base capacity.
      garrisonedAt: null,
    })
  );

  canonicalState.units.push(...newUnits);
  return newUnits;
}

function cheapestBuildableType(baseType) {
  const buildable = BASE_DEFS[baseType].canBuild;
  return buildable.reduce((cheapest, type) =>
    BUILD_COST_MULTIPLIER[type] < BUILD_COST_MULTIPLIER[cheapest] ? type : cheapest
  );
}
