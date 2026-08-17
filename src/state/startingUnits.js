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
import { UNIT_DEFS } from "../units/unitDefs.js";
import { allocateEntityId } from "./initialState.js";

/**
 * @param {object} canonicalState
 * @param {object[]} bases - newly placed bases (one per player) to spawn a starting unit at
 * @returns {object[]} the newly created units
 */
export function spawnStartingUnits(canonicalState, bases) {
  const newUnits = bases.map((base) => {
    const type = cheapestBuildableType(base.type);
    return {
      id: allocateEntityId(canonicalState),
      ownerId: base.ownerId,
      type,
      position: { ...base.position },
      strength: UNIT_DEFS[type].strength,
      actionsRemaining: UNIT_DEFS[type].actionsPerTurn,
      // Reserved for Stage 5 (combat/return-to-base) and beyond, so the
      // unit shape doesn't need retrofitting later -- see the
      // implementation plan's "canonical state fields" risk note.
      strikesUsed: 0,
      distanceFlownThisSortie: 0,
      cargo: [],
      constructionTurnsRemaining: null,
    };
  });

  canonicalState.units.push(...newUnits);
  return newUnits;
}

function cheapestBuildableType(baseType) {
  const buildable = BASE_DEFS[baseType].canBuild;
  return buildable.reduce((cheapest, type) =>
    BUILD_COST_MULTIPLIER[type] < BUILD_COST_MULTIPLIER[cheapest] ? type : cheapest
  );
}
