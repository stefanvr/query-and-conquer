// App entry point — screen router + glue between screens, state, and save/load. No URL
// routing; screens are toggled via the [hidden] attribute (implementation-spec.md §8).
import { initGameRoom } from "./screens/game-room.js";
import { initOptionsMenu } from "./screens/options-menu.js";
import { initGameScreen } from "./screens/game-screen.js";
import { createGameState } from "./state/game-state.js";
import { loadGame } from "./save/save-load.js";

function showScreen(id) {
  document.querySelectorAll(".screen-view").forEach((el) => {
    el.hidden = el.id !== id;
  });
}

function enterGameScreen(state) {
  gameScreen.start(state);
  showScreen("screen-game");
}

function returnToGameRoom() {
  gameRoom.refresh();
  showScreen("screen-game-room");
}

const gameScreen = initGameScreen({
  onQuit: returnToGameRoom,
  onTerminate: returnToGameRoom,
});

const gameRoom = initGameRoom({
  onNewGame: () => {
    optionsMenu.resetForm();
    showScreen("screen-options");
  },
  onLoadGame: () => {
    const state = loadGame();
    if (state) enterGameScreen(state);
  },
  onLoadTestGame: async () => {
    const state = await (await fetch("assets/dev-save.json")).json();
    enterGameScreen(state);
  },
});

const optionsMenu = initOptionsMenu({
  onBack: () => showScreen("screen-game-room"),
  onStartMatch: (options, mapData) => {
    const state = createGameState(options, mapData, Math.random);
    enterGameScreen(state);
  },
});

document.querySelector("#start-button").addEventListener("click", () => {
  gameRoom.refresh();
  showScreen("screen-game-room");
});
