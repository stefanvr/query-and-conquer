/**
 * App bootstrap. Wires screens together: start -> options -> map view
 * -> end screen. As of Stage 6, this is a full playable game against
 * 1-5 easy AI opponents: after the human ends their turn, every AI
 * player's turn runs automatically (src/ai/aiController.js) until
 * control returns to the human or the game ends, using the same
 * command dispatch table a human click would use -- no alternate
 * mutation path.
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
import { runAiTurnAnimated, AI_SPEEDS } from "./ai/aiController.js";

const root = document.getElementById("app");

function showStartScreen() {
  root.className = "";
  renderStartScreen(root, {
    onStart: showOptionsScreen,
    onContinue: () => {
      const result = loadGame();
      if (result.success) {
        showMapView(result.canonicalState, {});
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
 * @param {{aiDifficulties?: string[]}} [opts] - ignored for a loaded save, which already has its players
 */
function showMapView(canonicalState, { aiDifficulties = [] } = {}) {
  // canonicalState never leaves this closure into rendering/UI code --
  // they only ever receive the getVisibleState projection, per this
  // project's CQRS query seam. It's threaded into commands.dispatch()
  // opaquely (input.js doesn't read its fields, just hands it to the
  // one function allowed to mutate it).
  root.className = "map-view";
  root.innerHTML = "";

  // A loaded save already has players/bases/units; a fresh map-only
  // state doesn't yet.
  const humanPlayer =
    canonicalState.players.find((p) => p.kind === "human") ?? setupNewGame(canonicalState, { aiDifficulties }).humanPlayer;

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
    onEndTurn: async () => {
      dispatch(canonicalState, "endTurn");
      inputController.deselect();
      renderer.redraw();
      hud.update();
      if (checkGameOver()) return;

      hud.setInteractive(false);
      await runAiTurnsUntilHuman(canonicalState, humanPlayer.id, {
        delayMs: AI_SPEEDS[hud.getAiSpeed()],
        onRedraw: () => {
          renderer.redraw();
          hud.update();
        },
      });
      hud.setInteractive(true);
      checkGameOver();
    },
    onSave: () => {
      dispatch(canonicalState, "saveGame");
      hud.update();
    },
  });
  hud.update();
}

/**
 * Runs every AI player's turn in sequence (design doc §6's per-turn
 * loop naturally chains through however many AI players are between
 * the human and their next turn) until control returns to the human
 * player or the game ends.
 * @param {object} canonicalState
 * @param {number|string} humanPlayerId
 * @param {{delayMs: number, onRedraw: () => void}} opts
 */
async function runAiTurnsUntilHuman(canonicalState, humanPlayerId, { delayMs, onRedraw }) {
  for (;;) {
    if (getGameStatus(canonicalState).isOver) return;
    const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
    if (activePlayer.id === humanPlayerId) return;

    await runAiTurnAnimated(canonicalState, activePlayer.id, { delayMs, onStep: onRedraw });
    onRedraw();
    if (getGameStatus(canonicalState).isOver) return;

    dispatch(canonicalState, "endTurn");
    onRedraw();
  }
}

function showEndScreen(canonicalState, viewerId, status) {
  root.className = "";
  const endGameState = getEndGameState(canonicalState);
  renderEndScreen(root, { status, endGameState, viewerId, onBackToMenu: showStartScreen });
}

showStartScreen();
