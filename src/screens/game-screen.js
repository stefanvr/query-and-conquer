// Game screen — HUD + map canvas + mid-turn menu, per implementation-spec.md §6 and §8.
import { activePlayer, PLAYER_COLOR_VARS } from "../state/game-state.js";
import { endTurn, terminate } from "../state/commands.js";
import { getVisibleState } from "../state/queries.js";
import { saveGame } from "../save/save-load.js";
import { createMapCamera } from "../render/map-canvas.js";

/** @param {{ onQuit: () => void, onTerminate: () => void }} handlers */
export function initGameScreen({ onQuit, onTerminate }) {
  const canvas = document.querySelector("#map-canvas");
  const turnIndicator = document.querySelector("#hud-turn-indicator");
  const endTurnButton = document.querySelector("#end-turn-button");
  const menuButton = document.querySelector("#menu-button");
  const midTurnMenu = document.querySelector("#mid-turn-menu");
  const midTurnMenuMain = document.querySelector("#mid-turn-menu-main");
  const surrenderConfirm = document.querySelector("#surrender-confirm");
  const saveButton = document.querySelector("#save-button");
  const quitButton = document.querySelector("#quit-button");
  const surrenderButton = document.querySelector("#surrender-button");
  const surrenderConfirmYesButton = document.querySelector("#surrender-confirm-yes");
  const surrenderConfirmCancelButton = document.querySelector("#surrender-confirm-cancel");
  const menuCloseButton = document.querySelector("#menu-close-button");
  const zoomInButton = document.querySelector("#zoom-in-button");
  const zoomOutButton = document.querySelector("#zoom-out-button");

  let state = null;
  let camera = null;

  function refreshHud() {
    const visible = getVisibleState(state, activePlayer(state).id);
    const player = activePlayer(visible);
    const label = player.isHuman ? "Human" : `AI ${player.slot}`;
    turnIndicator.textContent = `Turn ${visible.turnNumber} — ${label}`;
    turnIndicator.style.color = `var(${PLAYER_COLOR_VARS[player.slot]})`;
  }

  function advanceUntilHuman() {
    // Stage 3 has no AI logic yet (Stage 11+) — an AI turn has nothing to do, so cascade
    // through every AI player automatically and stop back at the human.
    do {
      endTurn(state);
    } while (!activePlayer(state).isHuman);
    refreshHud();
  }

  // The mid-turn menu and the surrender confirmation share one overlay backdrop (#mid-turn-menu)
  // and swap which inner panel is shown, rather than stacking two separate overlays.
  function openMenu() {
    midTurnMenuMain.hidden = false;
    surrenderConfirm.hidden = true;
    midTurnMenu.hidden = false;
  }
  function closeMenu() {
    midTurnMenu.hidden = true;
  }
  function openSurrenderConfirm() {
    midTurnMenuMain.hidden = true;
    surrenderConfirm.hidden = false;
  }

  endTurnButton.addEventListener("click", advanceUntilHuman);
  menuButton.addEventListener("click", openMenu);
  menuCloseButton.addEventListener("click", closeMenu);
  saveButton.addEventListener("click", () => {
    saveGame(state);
    closeMenu();
  });
  quitButton.addEventListener("click", () => {
    closeMenu();
    onQuit();
  });
  surrenderButton.addEventListener("click", openSurrenderConfirm);
  surrenderConfirmCancelButton.addEventListener("click", openMenu);
  surrenderConfirmYesButton.addEventListener("click", () => {
    terminate(state);
    closeMenu();
    onTerminate();
  });
  zoomInButton.addEventListener("click", () => camera?.zoomIn());
  zoomOutButton.addEventListener("click", () => camera?.zoomOut());

  return {
    start(newState) {
      state = newState;
      closeMenu();
      camera?.destroy();
      camera = createMapCamera(canvas, state.map);
      refreshHud();
    },
  };
}
