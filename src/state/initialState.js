/**
 * Canonical state factory. This is the shape everything else in the
 * app is built around -- command handlers (Stage 4+) are the only code
 * allowed to mutate it; everyone else reads through
 * src/queries/getVisibleState.js.
 *
 * Most fields below are unused until later stages (players/units/bases
 * are empty, turn info is inert) but are established now so the shape
 * doesn't get retrofitted piecemeal. See the implementation plan's
 * "Canonical state fields beyond position/strength" risk note for
 * what Stage 4/5 will still need to add to units/bases specifically.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * @param {{size: string, type: string, width: number, height: number, terrain: string[][]}} map
 * @returns {object} canonical state
 */
export function createInitialState({ size, type, width, height, terrain }) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    map: { size, type, width, height, terrain },
    players: [],
    units: [],
    bases: [],
    turn: {
      number: 1,
      activePlayerIndex: 0,
    },
  };
}
