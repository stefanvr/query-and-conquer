/**
 * Turns a freshly-created map-only canonical state (src/state/initialState.js)
 * into a playable game: adds the human player plus `aiDifficulties.length`
 * AI players (design doc §8: "1 to 5 AI opponents"), auto-assigns AI
 * strategies (§9), places every player's base (§7), spawns each
 * player's starting unit (v1 house rule -- see
 * src/state/startingUnits.js's module doc), and reveals each player's
 * initial view.
 */
import { addPlayer } from "./initialState.js";
import { placeBases } from "./basePlacement.js";
import { spawnStartingUnits } from "./startingUnits.js";
import { updateExploredCells } from "../queries/fog.js";
import { assignStrategies } from "../ai/assignStrategies.js";
import { mulberry32 } from "../rng.js";

/**
 * @param {object} canonicalState - must already have `map` populated
 * @param {{aiDifficulties?: ("easy"|"hard")[]}} [opts] - one entry per AI opponent
 * @returns {{canonicalState: object, humanPlayer: object, aiPlayers: object[]}}
 */
export function setupNewGame(canonicalState, { aiDifficulties = [] } = {}) {
  // Browser runtime code (not a Workflow script) -- Date.now() is fine
  // here, unlike in generation code that needs to be seed-reproducible.
  const rng = mulberry32(Date.now() ^ 0x9e3779b9);

  const humanPlayer = addPlayer(canonicalState, { kind: "human" });
  const strategies = assignStrategies(aiDifficulties.length, rng);
  const aiPlayers = aiDifficulties.map((difficulty, i) =>
    addPlayer(canonicalState, { kind: "ai", strategy: strategies[i], difficulty })
  );

  const allPlayers = [humanPlayer, ...aiPlayers];
  const bases = placeBases(canonicalState, allPlayers.map((p) => p.id), rng);
  spawnStartingUnits(canonicalState, bases);
  for (const player of allPlayers) updateExploredCells(canonicalState, player.id);

  return { canonicalState, humanPlayer, aiPlayers };
}
