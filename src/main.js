/**
 * App bootstrap. Wires screens together: start -> options -> map view.
 * As of Stage 4, the map view is genuinely playable for a human: select
 * a unit, move it (respecting action points/terrain cost/occupancy),
 * end turn, watch fog of war update. No AI yet (Stage 6) and no
 * combat/build economy yet (Stage 5).
 */
import { renderStartScreen } from "./ui/startScreen.js";
import { renderOptionsScreen } from "./ui/optionsScreen.js";
import { renderHud } from "./ui/hud.js";
import { createInputController } from "./ui/input.js";
import { createCanvasRenderer } from "./render/canvasRenderer.js";
import { getVisibleState } from "./queries/getVisibleState.js";
import { setupNewGame } from "./state/newGame.js";
import { dispatch } from "./commands/index.js";

const root = document.getElementById("app");

function showStartScreen() {
  root.className = "";
  renderStartScreen(root, showOptionsScreen);
}

function showOptionsScreen() {
  root.className = "";
  renderOptionsScreen(root, showMapView);
}

function showMapView(canonicalState) {
  // canonicalState never leaves this closure into rendering/UI code --
  // they only ever receive the getVisibleState projection, per this
  // project's CQRS query seam. It's threaded into commands.dispatch()
  // opaquely (input.js doesn't read its fields, just hands it to the
  // one function allowed to mutate it).
  root.className = "map-view";
  root.innerHTML = "";

  const { humanPlayer } = setupNewGame(canonicalState);
  const visibleStateForViewer = () => getVisibleState(canonicalState, humanPlayer.id);

  let inputController;
  const renderer = createCanvasRenderer(root, visibleStateForViewer, {
    onCellClick: (cell) => inputController?.handleCellClick(cell),
  });
  inputController = createInputController({ canonicalState, viewerId: humanPlayer.id, renderer });

  const hud = renderHud(root, {
    getState: visibleStateForViewer,
    onEndTurn: () => {
      dispatch(canonicalState, "endTurn");
      inputController.deselect();
      renderer.redraw();
      hud.update();
    },
  });
  hud.update();
}

showStartScreen();
