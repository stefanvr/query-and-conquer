// Game room screen — per implementation-spec.md §8 "Game room".
import { hasSave } from "../save/save-load.js";

/** @param {{ onNewGame: () => void, onLoadGame: () => void }} handlers */
export function initGameRoom({ onNewGame, onLoadGame }) {
  const newGameButton = document.querySelector("#new-game-button");
  const loadGameButton = document.querySelector("#load-game-button");

  newGameButton.addEventListener("click", onNewGame);
  loadGameButton.addEventListener("click", onLoadGame);

  return {
    // Call whenever the game room is (re-)shown, so Load Game reflects the save slot's current
    // state (e.g. after saving mid-match and then quitting back here).
    refresh() {
      loadGameButton.disabled = !hasSave();
    },
  };
}
