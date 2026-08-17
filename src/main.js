/**
 * App bootstrap. Wires screens together: start -> options -> map view.
 * As of Stage 3, the map view is a static pannable/zoomable terrain
 * render -- no players/units/turns yet (Stage 4).
 */
import { renderStartScreen } from "./ui/startScreen.js";
import { renderOptionsScreen } from "./ui/optionsScreen.js";
import { createCanvasRenderer } from "./render/canvasRenderer.js";
import { getVisibleState } from "./queries/getVisibleState.js";

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
  // canonicalState never leaves this closure into rendering code --
  // the renderer only ever receives the getVisibleState projection,
  // per this project's CQRS query seam.
  root.className = "map-view";
  root.innerHTML = "";
  createCanvasRenderer(root, () => getVisibleState(canonicalState));
}

showStartScreen();
