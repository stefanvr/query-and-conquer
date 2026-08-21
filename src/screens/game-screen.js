// Game screen — HUD + map canvas + base/unit panels + mid-turn menu, per implementation-spec.md
// §1/§2/§3/§6/§7/§8.
import { activePlayer, playerBase, baseAtHex, unitAtHex, PLAYER_COLOR_VARS } from "../state/game-state.js";
import { endTurn, terminate, queueBuild, processTurnStart, moveUnit, unloadUnit, loadUnit } from "../state/commands.js";
import { getVisibleState } from "../state/queries.js";
import { saveGame } from "../save/save-load.js";
import { createMapCamera } from "../render/map-canvas.js";
import { buildableUnitTypes, UNIT_TYPES, BASE_CATEGORIES, moveCost } from "../state/unit-types.js";
import { deserializeGrid } from "../map/map-serialize.js";
import { offsetDistance } from "../map/hex-coords.js";

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
  const basePanelGarrison = document.querySelector("#base-panel-garrison");
  const basePanelBuildButtons = document.querySelector("#base-panel-build-buttons");
  const unitPanel = document.querySelector("#unit-panel");
  const unitPanelClose = document.querySelector("#unit-panel-close");
  const unitPanelTitle = document.querySelector("#unit-panel-title");
  const unitPanelSp = document.querySelector("#unit-panel-sp");
  const unitPanelAp = document.querySelector("#unit-panel-ap");
  const unitPanelActions = document.querySelector("#unit-panel-actions");

  let state = null;
  let grid = null; // cached TerrainGrid — state.map is plain JSON, doesn't change during a match
  let camera = null;
  let selectedBase = null;
  let selectedUnit = null;

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

    const isOwnTurn = base.ownerId === activePlayer(state).id;

    basePanelGarrison.innerHTML = "";
    if (isOwnTurn) {
      for (const garrisoned of base.garrison) {
        const line = document.createElement("div");
        line.className = "garrison-line";
        const label = document.createElement("span");
        label.textContent = garrisoned.unitType;
        const unloadButton = document.createElement("button");
        unloadButton.type = "button";
        unloadButton.className = "btn-primary";
        unloadButton.textContent = "Unload";
        unloadButton.addEventListener("click", () => {
          unloadUnit(state, grid, base.id, garrisoned.id);
          renderBasePanel(base);
          camera?.draw();
        });
        line.append(label, unloadButton);
        basePanelGarrison.appendChild(line);
      }
    }

    basePanelBuildButtons.innerHTML = "";
    if (isOwnTurn) {
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

  function findAdjacentFriendlyBase(unit) {
    const category = UNIT_TYPES[unit.unitType].category;
    return grid
      .neighborsOf(unit.col, unit.row)
      .map((n) => baseAtHex(state, n.col, n.row))
      .find((b) => b && b.ownerId === unit.ownerId && BASE_CATEGORIES[b.type].includes(category));
  }

  function renderUnitPanel(unit) {
    unitPanelTitle.textContent = unit.unitType[0].toUpperCase() + unit.unitType.slice(1);
    unitPanelSp.textContent = `${unit.sp}/${unit.maxSp} SP`;
    unitPanelAp.textContent = `${unit.remainingActions}/${UNIT_TYPES[unit.unitType].actionsPerTurn} AP`;

    unitPanelActions.innerHTML = "";
    const targetBase = unit.ownerId === activePlayer(state).id ? findAdjacentFriendlyBase(unit) : null;
    if (targetBase) {
      const cost = moveCost(unit.unitType, grid.get(targetBase.col, targetBase.row));
      const totalCost = cost === null ? Infinity : 1 + cost;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-primary";
      button.textContent = "Load into base";
      button.disabled = totalCost > unit.remainingActions;
      button.addEventListener("click", () => {
        loadUnit(state, grid, unit.id);
        if (state.units.includes(unit)) {
          // Still in the field — loadUnit was a no-op (shouldn't happen with the button
          // disabled above, but don't silently pretend success if it does).
          renderUnitPanel(unit);
        } else {
          closeAllPanels();
        }
        camera?.draw();
      });
      unitPanelActions.appendChild(button);
    }
  }

  function closeAllPanels() {
    selectedBase = null;
    selectedUnit = null;
    basePanel.hidden = true;
    unitPanel.hidden = true;
    camera?.setSelectedHex(null);
  }

  function openBasePanel(base) {
    selectedBase = base;
    selectedUnit = null;
    unitPanel.hidden = true;
    basePanel.hidden = false;
    camera.setSelectedHex({ col: base.col, row: base.row });
    renderBasePanel(base);
  }

  function openUnitPanel(unit) {
    selectedUnit = unit;
    selectedBase = null;
    basePanel.hidden = true;
    unitPanel.hidden = false;
    camera.setSelectedHex({ col: unit.col, row: unit.row });
    renderUnitPanel(unit);
  }

  /** Whether tapping (col, row) with `selectedUnit` active should be treated as a move attempt —
   * mirrors moveUnit's own validation so an invalid adjacent tap falls back to plain selection
   * instead of silently no-op'ing as a failed move (implementation-spec.md §1 "Movement targeting"). */
  function isValidMoveTarget(unit, col, row) {
    if (offsetDistance(unit, { col, row }) !== 1) return false;
    if (!grid.isInMap(col, row)) return false;
    if (baseAtHex(state, col, row) || unitAtHex(state, col, row)) return false;
    const cost = moveCost(unit.unitType, grid.get(col, row));
    return cost !== null && cost <= unit.remainingActions;
  }

  function selectHex(col, row) {
    if (selectedUnit && isValidMoveTarget(selectedUnit, col, row)) {
      moveUnit(state, grid, selectedUnit.id, col, row);
      camera.setSelectedHex({ col: selectedUnit.col, row: selectedUnit.row });
      renderUnitPanel(selectedUnit);
      camera.draw();
      return;
    }

    const base = baseAtHex(state, col, row);
    if (base) {
      openBasePanel(base);
      return;
    }
    const unit = unitAtHex(state, col, row);
    if (unit) {
      openUnitPanel(unit);
      return;
    }
    closeAllPanels();
  }

  function refreshOpenPanel() {
    if (selectedBase) renderBasePanel(selectedBase);
    if (selectedUnit) renderUnitPanel(selectedUnit);
  }

  // Stage 3 has no AI logic yet (Stage 11+) — an AI turn has no decisions to make, so cascade
  // through every AI player automatically and stop back at the human. Each player's own bases
  // and field units still tick/reset on their own turn-start (game spec §7), AI included. Does
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
    refreshOpenPanel();
    camera?.draw();
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
  basePanelClose.addEventListener("click", closeAllPanels);
  unitPanelClose.addEventListener("click", closeAllPanels);

  return {
    start(newState) {
      state = newState;
      grid = deserializeGrid(state.map.width, state.map.height, state.map.rows);
      closeMenu();
      closeAllPanels();
      camera?.destroy();

      advanceCascadeToHuman(); // turn order is randomized (§7) — a match can start on an AI's turn

      const human = state.players.find((p) => p.isHuman);
      const myBase = playerBase(state, human.id);
      camera = createMapCamera(canvas, state.map, {
        bases: state.bases,
        units: state.units,
        players: state.players,
        onSelectHex: selectHex,
        centerOnCol: myBase?.col,
        centerOnRow: myBase?.row,
      });
      refreshHud();
    },
  };
}
