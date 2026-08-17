/**
 * Turns a freshly-created map-only canonical state (src/state/initialState.js)
 * into a playable game: adds players, places their bases (design doc
 * §7), spawns each player's starting unit (v1 house rule -- see
 * src/state/startingUnits.js's module doc), and reveals each player's
 * initial view. Stage 4 only ever creates one human player -- AI player
 * setup (count/difficulty) arrives in Stage 6.
 */
import { addPlayer } from "./initialState.js";
import { placeBases } from "./basePlacement.js";
import { spawnStartingUnits } from "./startingUnits.js";
import { updateExploredCells } from "../queries/fog.js";
import { mulberry32 } from "../rng.js";

/**
 * @param {object} canonicalState - must already have `map` populated
 * @returns {{canonicalState: object, humanPlayer: object}}
 */
export function setupNewGame(canonicalState) {
  // Browser runtime code (not a Workflow script) -- Date.now() is fine
  // here, unlike in generation code that needs to be seed-reproducible.
  const rng = mulberry32(Date.now() ^ 0x9e3779b9);

  const humanPlayer = addPlayer(canonicalState, { kind: "human" });
  const bases = placeBases(canonicalState, [humanPlayer.id], rng);
  spawnStartingUnits(canonicalState, bases);
  updateExploredCells(canonicalState, humanPlayer.id);

  return { canonicalState, humanPlayer };
}
