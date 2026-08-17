/**
 * App bootstrap. Wires screens together: start -> options -> map view
 * -> end screen. As of Stage 5, the map view is playable end-to-end for
 * a human: move, attack units/bases, claim/enter/exit bases, queue
 * builds, save/load, and see a win/loss end screen. No AI yet
 * (Stage 6) -- see the Stage 4/5 implementation notes on how combat
 * and building are verified without an opponent in the real UI.
 */
import { renderStartScreen } from "./ui/startScreen.js";
import { renderOptionsScreen } from "./ui/optionsScreen.js";
import { renderHud } from "./ui/hud.js";
import { renderEndScreen } from "./ui/endScreen.js";
import { createInputController } from "./ui/input.js";
import { createCanvasRenderer } from "./render/canvasRenderer.js";
import { getVisibleState, getEndGameState } from "./queries/getVisibleState.js";
import { getGameStatus } from "./queries/gameStatus.js";
import { setupNewGame } from "./state/newGame.js";
import { dispatch } from "./commands/index.js";
import { loadGame } from "./commands/loadGame.js";
import { hasSave } from "./save/storage.js";

const root = document.getElementById("app");

function showStartScreen() {
  root.className = "";
  renderStartScreen(root, {
    onStart: showOptionsScreen,
    onContinue: () => {
      const result = loadGame();
      if (result.success) {
        showMapView(result.canonicalState);
      } else {
        // No polished error UI for this yet -- surfacing it is still
        // better than silently doing nothing.
        alert(result.reason);
      }
    },
    hasSave: hasSave(),
  });
}

function showOptionsScreen() {
  root.className = "";
  renderOptionsScreen(root, showMapView);
}

/**
 * @param {object} canonicalState - either freshly created (map only) or loaded from a save
 */
function showMapView(canonicalState) {
  // canonicalState never leaves this closure into rendering/UI code --
  // they only ever receive the getVisibleState projection, per this
  // project's CQRS query seam. It's threaded into commands.dispatch()
  // opaquely (input.js doesn't read its fields, just hands it to the
  // one function allowed to mutate it).
  root.className = "map-view";
  root.innerHTML = "";

  // A loaded save already has players/bases/units; a fresh map-only
  // state doesn't yet -- setupNewGame is idempotent-safe to skip in
  // the loaded case by checking for existing players.
  const humanPlayer =
    canonicalState.players.find((p) => p.kind === "human") ?? setupNewGame(canonicalState).humanPlayer;

  const visibleStateForViewer = () => getVisibleState(canonicalState, humanPlayer.id);

  let inputController;
  let hud;

  const renderer = createCanvasRenderer(root, visibleStateForViewer, {
    onCellClick: (cell) => {
      inputController?.handleCellClick(cell);
      checkGameOver();
    },
  });

  function checkGameOver() {
    const status = getGameStatus(canonicalState);
    if (status.isOver) showEndScreen(canonicalState, humanPlayer.id, status);
    return status.isOver;
  }

  inputController = createInputController({
    canonicalState,
    viewerId: humanPlayer.id,
    renderer,
    onChange: () => hud?.update(),
  });

  hud = renderHud(root, {
    getState: visibleStateForViewer,
    inputController,
    viewerId: humanPlayer.id,
    onEndTurn: () => {
      dispatch(canonicalState, "endTurn");
      inputController.deselect();
      renderer.redraw();
      hud.update();
      checkGameOver();
    },
    onSave: () => {
      dispatch(canonicalState, "saveGame");
      hud.update();
    },
  });
  hud.update();
}

function showEndScreen(canonicalState, viewerId, status) {
  root.className = "";
  const endGameState = getEndGameState(canonicalState);
  renderEndScreen(root, { status, endGameState, viewerId, onBackToMenu: showStartScreen });
}

showStartScreen();
