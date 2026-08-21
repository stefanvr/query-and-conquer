// Main menu screen — per implementation-spec.md §8 "Main menu".
import { hasSave } from "../save/save-load.js";

const isDevMode = new URLSearchParams(window.location.search).has("dev");

/** @param {{ onNewGame: () => void, onLoadGame: () => void, onLoadTestGame: () => void }} handlers */
export function initMainMenu({ onNewGame, onLoadGame, onLoadTestGame }) {
  const newGameButton = document.querySelector("#new-game-button");
  const loadGameButton = document.querySelector("#load-game-button");
  const loadTestGameButton = document.querySelector("#load-test-game-button");

  newGameButton.addEventListener("click", onNewGame);
  loadGameButton.addEventListener("click", onLoadGame);

  if (isDevMode) {
    loadTestGameButton.hidden = false;
    loadTestGameButton.addEventListener("click", onLoadTestGame);
  }

  return {
    // Call whenever the main menu is (re-)shown, so Load Game reflects the save slot's current
    // state (e.g. after saving mid-match and then quitting back here).
    refresh() {
      loadGameButton.disabled = !hasSave();
    },
  };
}
