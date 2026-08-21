// Game screen — HUD + map canvas + base panel + mid-turn menu, per implementation-spec.md
// §1/§2/§6/§7/§8.
import { activePlayer, playerBase, PLAYER_COLOR_VARS } from "../state/game-state.js";
import { endTurn, terminate, queueBuild, processTurnStart } from "../state/commands.js";
import { getVisibleState } from "../state/queries.js";
import { saveGame } from "../save/save-load.js";
import { createMapCamera } from "../render/map-canvas.js";
import { buildableUnitTypes } from "../state/unit-types.js";

const BASE_TYPE_LABEL = { land: "Land Base", port: "Port Base", mountain: "Mountain Base" };
const MAX_BASE_CAPACITY = 15;

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
  const basePanel = document.querySelector("#base-panel");
  const basePanelClose = document.querySelector("#base-panel-close");
  const basePanelTitle = document.querySelector("#base-panel-title");
  const basePanelSp = document.querySelector("#base-panel-sp");
  const basePanelCapacity = document.querySelector("#base-panel-capacity");
  const basePanelQueue = document.querySelector("#base-panel-queue");
  const basePanelBuildButtons = document.querySelector("#base-panel-build-buttons");

  let state = null;
  let camera = null;
  let selectedBase = null;

  function refreshHud() {
    const visible = getVisibleState(state, activePlayer(state).id);
    const player = activePlayer(visible);
    const label = player.isHuman ? "Human" : `AI ${player.slot}`;
    turnIndicator.textContent = `Turn ${visible.turnNumber} — ${label}`;
    turnIndicator.style.color = `var(${PLAYER_COLOR_VARS[player.slot]})`;
  }

  function renderBasePanel(base) {
    basePanelTitle.textContent = BASE_TYPE_LABEL[base.type];
    basePanelSp.textContent = `${base.sp}/${base.maxSp} SP`;
    const used = base.garrison.length + (base.inProgress ? 1 : 0);
    basePanelCapacity.textContent = `${used}/${MAX_BASE_CAPACITY} capacity`;

    basePanelQueue.innerHTML = "";
    if (base.inProgress) {
      const line = document.createElement("div");
      line.textContent = `Building: ${base.inProgress.unitType} (${base.inProgress.remainingTurns} turns left)`;
      basePanelQueue.appendChild(line);
    }
    base.queue.forEach((item, i) => {
      const line = document.createElement("div");
      line.textContent = `Queued ${i + 1}: ${item.unitType}`;
      basePanelQueue.appendChild(line);
    });

    basePanelBuildButtons.innerHTML = "";
    if (base.ownerId === activePlayer(state).id) {
      for (const unitType of buildableUnitTypes(base.type, base.adjacentToDeepWater)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-primary";
        button.textContent = `Build ${unitType}`;
        button.disabled = base.queue.length >= 5;
        button.addEventListener("click", () => {
          queueBuild(state, base.id, unitType);
          renderBasePanel(base);
          camera?.draw();
        });
        basePanelBuildButtons.appendChild(button);
      }
    }
  }

  function closeBasePanel() {
    selectedBase = null;
    basePanel.hidden = true;
    camera?.setSelectedHex(null);
  }

  function selectHex(col, row) {
    const base = state.bases.find((b) => b.col === col && b.row === row);
    if (!base) {
      closeBasePanel();
      return;
    }
    selectedBase = base;
    basePanel.hidden = false;
    camera.setSelectedHex({ col, row });
    renderBasePanel(base);
  }

  // Stage 3 has no AI logic yet (Stage 11+) — an AI turn has no decisions to make, so cascade
  // through every AI player automatically and stop back at the human. Each player's own bases
  // still tick their build queues on their own turn-start (game spec §7), AI included. Does
  // nothing if the human is already active — turn order is randomized (§7), so a match can start
  // on an AI's turn, and this must not skip a turn that's already the human's.
  function advanceCascadeToHuman() {
    while (!activePlayer(state).isHuman) {
      endTurn(state);
      processTurnStart(state, activePlayer(state).id);
    }
  }

  /** The End Turn button: explicitly ends the human's own current turn, then cascades past any
   * AI turns that follow. */
  function advanceUntilHuman() {
    endTurn(state);
    processTurnStart(state, activePlayer(state).id);
    advanceCascadeToHuman();
    refreshHud();
    if (selectedBase) renderBasePanel(selectedBase);
    camera?.draw();
  }

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
  basePanelClose.addEventListener("click", closeBasePanel);

  return {
    start(newState) {
      state = newState;
      closeMenu();
      closeBasePanel();
      camera?.destroy();

      advanceCascadeToHuman(); // turn order is randomized (§7) — a match can start on an AI's turn

      const human = state.players.find((p) => p.isHuman);
      const myBase = playerBase(state, human.id);
      camera = createMapCamera(canvas, state.map, {
        bases: state.bases,
        players: state.players,
        onSelectHex: selectHex,
        centerOnCol: myBase?.col,
        centerOnRow: myBase?.row,
      });
      refreshHud();
    },
  };
}
