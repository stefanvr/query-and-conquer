/**
 * App bootstrap. Wires screens together. As of Stage 1, only the start
 * screen is implemented; Start currently shows a placeholder, since the
 * options screen / map loading are built in Stage 3.
 */
import { renderStartScreen } from "./ui/startScreen.js";

const root = document.getElementById("app");

function showStartScreen() {
  renderStartScreen(root, () => {
    root.innerHTML =
      '<p style="font-family: var(--font-body); color: var(--parchment); margin-top: 40px;">' +
      "Options screen and map loading arrive in a later stage." +
      "</p>";
  });
}

showStartScreen();
