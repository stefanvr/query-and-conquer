// Game screen — HUD + map canvas + base/unit panels + mid-turn menu, per implementation-spec.md
// §1/§2/§3/§6/§7/§8.
import { activePlayer, playerBase, baseAtHex, unitAtHex, playerLabel } from "../state/game-state.js";
import {
  endTurn,
  terminate,
  queueBuild,
  cancelQueuedBuild,
  reorderQueuedBuild,
  processTurnStart,
  markExplored,
  moveUnit,
  planesOwingMovement,
  unloadUnit,
  unloadCargo,
  isValidUnloadTarget,
  loadUnit,
  isValidLoadTarget,
  enterBaseWithCargo,
  loadIntoBoat,
  isValidLoadIntoBoatTarget,
  isValidAttackTarget,
  attackUnit,
  isValidAttackBaseTarget,
  attackBase,
  isValidClaimTarget,
  claimBase,
} from "../state/commands.js";
import { getVisibleState } from "../state/queries.js";
import { aiTurnActions } from "../ai/ai-turn.js";
import { saveGame } from "../save/save-load.js";
import { createMapCamera, UNIT_SHAPES } from "../render/map-canvas.js";
import { buildableUnitTypes, UNIT_TYPES } from "../state/unit-types.js";
import { deserializeGrid } from "../map/map-serialize.js";
import { offsetKey } from "../map/hex-coords.js";
import { reachableCells } from "../state/pathfinding.js";

const BASE_TYPE_LABEL = { land: "Land Base", port: "Port Base", mountain: "Mountain Base" };
const MAX_BASE_CAPACITY = 15;
const QUEUE_SLOT_COUNT = 5; // mirrors commands.js's MAX_QUEUE_LENGTH

/** Small shape icon before a slot's (or build button's) label — style-guide.md §9's per-unit-type
 * shape table, the same one the canvas token uses (map-canvas.js's UNIT_SHAPES/traceShape).
 * Tank's square is the unstyled default (.slot-icon alone); every other shape adds a modifier
 * class. */
function slotIcon(unitType) {
  const icon = document.createElement("span");
  const shape = UNIT_SHAPES[unitType] ?? "circle";
  icon.className = shape === "square" ? "slot-icon" : `slot-icon slot-icon-${shape}`;
  return icon;
}

function emptySlot() {
  const el = document.createElement("div");
  el.className = "slot slot-empty";
  return el;
}

/** Actions a garrisoned/cargo unit still has this turn — its type's `actionsPerTurn` less whatever
 * it already spent getting where it is (implementation-spec.md §3's Field units). Shown in place
 * of the type name on garrison/cargo slots: the slot icon already carries the type
 * (style-guide.md §9), while this answers the question actually being asked of a stored unit —
 * can it act this turn? Without it, a unit that spent its budget loading in refuses to deploy for
 * no visible reason. */
function slotApLabel(entry) {
  const perTurn = UNIT_TYPES[entry.unitType].actionsPerTurn;
  return `${perTurn - (entry.spentActions ?? 0)}/${perTurn} AP`;
}

/** Fills a slot element (button or div, caller's choice) with icon + label + an optional second
 * line (e.g. a queue position or a build timer). `primaryLabel` overrides the type name. */
function fillSlotContent(el, unitType, secondLine, primaryLabel) {
  const label = document.createElement("span");
  label.textContent = primaryLabel ?? unitType.toUpperCase();
  el.title = unitType.toUpperCase(); // the type is still reachable when the label is showing something else
  el.append(slotIcon(unitType), label);
  if (secondLine) {
    const sub = document.createElement("span");
    sub.textContent = secondLine;
    el.appendChild(sub);
  }
}

/** @param {{ onQuit: () => void, onGameOver: (state: object) => void }} handlers */
export function initGameScreen({ onQuit, onGameOver }) {
  const canvas = document.querySelector("#map-canvas");
  const turnIndicator = document.querySelector("#hud-turn-indicator");
  const endTurnButton = document.querySelector("#end-turn-button");
  const endTurnBlockedMessage = document.querySelector("#hud-end-turn-blocked");
  const aiSpeedSelect = document.querySelector("#hud-ai-speed");
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
  const basePanelOwner = document.querySelector("#base-panel-owner");
  const basePanelOwnDetails = document.querySelector("#base-panel-own-details");
  const basePanelSp = document.querySelector("#base-panel-sp");
  const basePanelCapacity = document.querySelector("#base-panel-capacity");
  const basePanelBuildSlot = document.querySelector("#base-panel-build-slot");
  const basePanelQueue = document.querySelector("#base-panel-queue");
  const basePanelGarrison = document.querySelector("#base-panel-garrison");
  const basePanelBuildButtons = document.querySelector("#base-panel-build-buttons");
  const unitPanel = document.querySelector("#unit-panel");
  const unitPanelClose = document.querySelector("#unit-panel-close");
  const unitPanelTitle = document.querySelector("#unit-panel-title");
  const unitPanelSp = document.querySelector("#unit-panel-sp");
  const unitPanelAp = document.querySelector("#unit-panel-ap");
  const unitPanelStrikes = document.querySelector("#unit-panel-strikes");
  const unitPanelFuel = document.querySelector("#unit-panel-fuel");
  const unitPanelCargoSection = document.querySelector("#unit-panel-cargo-section");
  const unitPanelCargo = document.querySelector("#unit-panel-cargo");
  const unitPanelActions = document.querySelector("#unit-panel-actions");

  let state = null;
  let grid = null; // cached TerrainGrid — state.map is plain JSON, doesn't change during a match
  let camera = null;
  let humanId = null; // the *viewing* player — distinct from activePlayer(state).id (§2/§4)
  let selectedBase = null;
  let selectedUnit = null;
  let selectedQueueIndex = null; // which base-panel queue slot has its Remove/Move controls open
  let pendingUnload = null; // { containerType, container, garrisoned } while the unload picker is active (§1)
  let pendingLoad = null; // the unit while the load destination picker is active (§1)
  let aiTurnInProgress = false; // true while AI turns are animating (§11) — human input is locked out
  let aiTurnFailure = null; // set if an AI turn threw; keeps the HUD saying so rather than failing silently

  /** Whether it's the viewing human's own turn. Every action this screen performs is gated on it,
   * and every command it issues is issued *as* `humanId` — never as "whoever is active" — so the
   * UI structurally cannot act for another player, whatever state the turn cascade is in. */
  function isHumanTurn() {
    return activePlayer(state).id === humanId;
  }

  function refreshHud() {
    const visible = getVisibleState(state, humanId);
    const player = activePlayer(visible);
    const { text, colorVar } = playerLabel(player);
    turnIndicator.textContent = `Turn ${visible.turnNumber} — ${text}`;
    turnIndicator.style.color = `var(${colorVar})`;
    refreshEndTurnGate();
  }

  /** Disables End Turn (+ a short inline message naming the blocker) while the human still has a
   * field plane owing its mandatory movement this turn (implementation-spec.md §6/§3's Plane
   * rearm & fuel). Call after anything that could change a plane's actionsSpentMoving or
   * remainingActions. */
  function refreshEndTurnGate() {
    // A failed AI turn outranks everything: the match can't be trusted from here, so say so and
    // keep saying it, rather than letting the next refresh quietly clear the message.
    if (aiTurnFailure) {
      endTurnButton.disabled = true;
      endTurnBlockedMessage.textContent = "An AI turn failed — see the browser console. Reload to continue.";
      return;
    }
    const owing = planesOwingMovement(state, humanId);
    // Also disabled while the AI is mid-turn (§11) — but with no blocker message, since that's a
    // transient "wait your turn", not something the human can act on the way a plane's mandatory
    // movement is.
    endTurnButton.disabled = aiTurnInProgress || owing.length > 0;
    // Content-driven, not [hidden] (implementation-spec.md §6) -- the element's own row is always
    // reserved, empty or not, so its text changing never shifts End Turn/Menu on the row above.
    if (owing.length === 0) {
      endTurnBlockedMessage.textContent = "";
      return;
    }
    endTurnBlockedMessage.textContent = owing
      .map((u) => {
        const stats = UNIT_TYPES[u.unitType];
        const name = u.unitType[0].toUpperCase() + u.unitType.slice(1);
        return `${name} still needs to move (${u.actionsSpentMoving}/${stats.actionsPerTurn / 2} AP)`;
      })
      .join("; ");
  }

  function renderBasePanel(base) {
    basePanelTitle.textContent = BASE_TYPE_LABEL[base.type];
    const owner = state.players.find((p) => p.id === base.ownerId) ?? null;
    const { text, colorVar } = playerLabel(owner);
    basePanelOwner.textContent = text;
    basePanelOwner.style.color = `var(${colorVar})`;

    const isOwnBase = base.ownerId === humanId;
    basePanelOwnDetails.hidden = !isOwnBase;
    if (!isOwnBase) return; // enemy base: type + owner is all it discloses (§2/§4)

    basePanelSp.textContent = `${base.sp}/${base.maxSp} SP`;
    const used = base.garrison.length + (base.inProgress ? 1 : 0);
    basePanelCapacity.textContent = `${used}/${MAX_BASE_CAPACITY} capacity`;

    const isOwnTurn = base.ownerId === humanId && isHumanTurn();

    // --- Building slot: always shown (even idle), so Queue/Garrison below never shift. ---
    basePanelBuildSlot.innerHTML = "";
    const buildSlot = document.createElement("div");
    buildSlot.className = "slot slot-building" + (base.inProgress ? "" : " slot-empty");
    if (base.inProgress) fillSlotContent(buildSlot, base.inProgress.unitType, `${base.inProgress.remainingTurns} left`);
    else buildSlot.textContent = "Idle";
    basePanelBuildSlot.appendChild(buildSlot);

    // --- Queue slots: click a filled one (own turn only) to open Remove/Move up/Move down. ---
    basePanelQueue.innerHTML = "";
    for (let i = 0; i < QUEUE_SLOT_COUNT; i++) {
      const item = base.queue[i];
      if (!item) {
        basePanelQueue.appendChild(emptySlot());
        continue;
      }
      if (!isOwnTurn) {
        const el = document.createElement("div");
        el.className = "slot";
        fillSlotContent(el, item.unitType, `#${i + 1}`);
        basePanelQueue.appendChild(el);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "slot" + (selectedQueueIndex === i ? " slot-selected" : "");
      fillSlotContent(el, item.unitType, `#${i + 1}`);
      el.addEventListener("click", () => {
        selectedQueueIndex = selectedQueueIndex === i ? null : i;
        renderBasePanel(base);
      });
      basePanelQueue.appendChild(el);
    }
    if (isOwnTurn && base.queue[selectedQueueIndex]) {
      // grid-column: 1 / -1 (main.css) spans the full row, 1.5fr/2fr/1.5fr — otherwise this
      // would auto-place as a single grid item in the queue's own 5-column grid, squeezing into
      // just the first slot's width instead of spanning the row under it.
      const controls = document.createElement("div");
      controls.className = "slot-controls";

      const upButton = document.createElement("button");
      upButton.type = "button";
      upButton.className = "slot-control-button";
      upButton.textContent = "←";
      upButton.setAttribute("aria-label", "Move earlier in queue");
      upButton.disabled = selectedQueueIndex === 0;
      upButton.addEventListener("click", () => {
        reorderQueuedBuild(state, base.id, selectedQueueIndex, -1, humanId);
        selectedQueueIndex -= 1;
        renderBasePanel(base);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "slot-control-button slot-control-remove";
      removeButton.textContent = "✕";
      removeButton.setAttribute("aria-label", "Remove from queue");
      removeButton.addEventListener("click", () => {
        cancelQueuedBuild(state, base.id, selectedQueueIndex, humanId);
        selectedQueueIndex = null;
        renderBasePanel(base);
      });

      const downButton = document.createElement("button");
      downButton.type = "button";
      downButton.className = "slot-control-button";
      downButton.textContent = "→";
      downButton.setAttribute("aria-label", "Move later in queue");
      downButton.disabled = selectedQueueIndex === base.queue.length - 1;
      downButton.addEventListener("click", () => {
        reorderQueuedBuild(state, base.id, selectedQueueIndex, 1, humanId);
        selectedQueueIndex += 1;
        renderBasePanel(base);
      });

      controls.append(upButton, removeButton, downButton);
      basePanelQueue.appendChild(controls);
    }

    // --- Garrison slots: click a filled, owned one to unload it. ---
    basePanelGarrison.innerHTML = "";
    const garrisonSlotCount = Math.max(MAX_BASE_CAPACITY - 1, base.garrison.length);
    for (let i = 0; i < garrisonSlotCount; i++) {
      const garrisoned = base.garrison[i];
      if (!garrisoned) {
        basePanelGarrison.appendChild(emptySlot());
        continue;
      }
      const spLabel = `${garrisoned.sp}/${UNIT_TYPES[garrisoned.unitType].strength} SP`;
      if (!isOwnTurn) {
        const el = document.createElement("div");
        el.className = "slot";
        fillSlotContent(el, garrisoned.unitType, spLabel, slotApLabel(garrisoned));
        basePanelGarrison.appendChild(el);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "slot";
      fillSlotContent(el, garrisoned.unitType, spLabel, slotApLabel(garrisoned));
      el.addEventListener("click", () => openUnloadPreview("base", base, garrisoned));
      basePanelGarrison.appendChild(el);
    }

    basePanelBuildButtons.innerHTML = "";
    if (isOwnTurn) {
      for (const unitType of buildableUnitTypes(base.type, base.adjacentToDeepWater)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-primary";
        button.append(slotIcon(unitType), document.createTextNode(`Build ${unitType}`));
        button.disabled = base.queue.length >= 5;
        button.addEventListener("click", () => {
          queueBuild(state, base.id, unitType, humanId);
          renderBasePanel(base);
          redraw();
        });
        basePanelBuildButtons.appendChild(button);
      }
    }
  }

  /** Every adjacent base/boat `unit` could load into right now (implementation-spec.md §1's Load
   * destination picker) — mirrors isValidLoadTarget/isValidLoadIntoBoatTarget's own validation
   * so the UI can compute candidates without duplicating the commands' rules. */
  function computeLoadTargets(unit) {
    const targets = [];
    for (const n of grid.neighborsOf(unit.col, unit.row)) {
      const base = baseAtHex(state, n.col, n.row);
      if (base && isValidLoadTarget(grid, unit, base)) {
        targets.push({ col: n.col, row: n.row });
        continue;
      }
      const boat = unitAtHex(state, n.col, n.row);
      if (boat && isValidLoadIntoBoatTarget(grid, unit, boat)) targets.push({ col: n.col, row: n.row });
    }
    return targets;
  }

  function renderUnitPanel(unit) {
    const stats = UNIT_TYPES[unit.unitType];
    unitPanelTitle.textContent = unit.unitType[0].toUpperCase() + unit.unitType.slice(1);
    unitPanelSp.textContent = `${unit.sp}/${unit.maxSp} SP`;
    unitPanelAp.textContent = `${unit.remainingActions}/${stats.actionsPerTurn} AP`;

    // --- Strikes/fuel remaining: only for a plane (roundTripRange set, §3's Plane rearm & fuel). ---
    unitPanelStrikes.hidden = !stats.roundTripRange;
    unitPanelFuel.hidden = !stats.roundTripRange;
    if (stats.roundTripRange) {
      unitPanelStrikes.textContent = `${stats.maxStrikes - unit.strikesUsed}/${stats.maxStrikes} strikes`;
      unitPanelFuel.textContent = `${stats.roundTripRange - unit.cellsFlown}/${stats.roundTripRange} fuel`;
    }

    // --- Cargo slot row: only for a boat (holdCapacity > 0, game spec §3). ---
    unitPanelCargoSection.hidden = !unit.cargo;
    if (unit.cargo) {
      unitPanelCargo.innerHTML = "";
      const isOwnTurn = unit.ownerId === humanId && isHumanTurn();
      const capacity = UNIT_TYPES[unit.unitType].holdCapacity;
      for (let i = 0; i < capacity; i++) {
        const cargoUnit = unit.cargo[i];
        if (!cargoUnit) {
          unitPanelCargo.appendChild(emptySlot());
          continue;
        }
        const cargoSpLabel = `${cargoUnit.sp}/${UNIT_TYPES[cargoUnit.unitType].strength} SP`;
        if (!isOwnTurn) {
          const el = document.createElement("div");
          el.className = "slot";
          fillSlotContent(el, cargoUnit.unitType, cargoSpLabel, slotApLabel(cargoUnit));
          unitPanelCargo.appendChild(el);
          continue;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.className = "slot";
        fillSlotContent(el, cargoUnit.unitType, cargoSpLabel, slotApLabel(cargoUnit));
        el.addEventListener("click", () => openUnloadPreview("boat", unit, cargoUnit));
        unitPanelCargo.appendChild(el);
      }
    }

    unitPanelActions.innerHTML = "";
    const canAct = unit.ownerId === humanId && isHumanTurn();
    if (canAct && computeLoadTargets(unit).length > 0) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-primary";
      button.textContent = "Load";
      button.addEventListener("click", () => openLoadPreview(unit));
      unitPanelActions.appendChild(button);
    }
  }

  function closeAllPanels() {
    selectedBase = null;
    selectedUnit = null;
    selectedQueueIndex = null;
    basePanel.hidden = true;
    unitPanel.hidden = true;
    camera?.resize(); // the map just reclaimed the panel's space — re-measure before any hit-test
    camera?.setSelectedHex(null);
    camera?.setActionTargets({}); // nothing selected -- no reach or targets to show (§1)
    closeUnloadPreview();
    closeLoadPreview();
  }

  function openBasePanel(base) {
    selectedBase = base;
    selectedUnit = null;
    selectedQueueIndex = null;
    unitPanel.hidden = true;
    basePanel.hidden = false;
    camera.resize(); // the panel just took space from the map — re-measure before any hit-test
    camera.setSelectedHex({ col: base.col, row: base.row });
    camera.setActionTargets({}); // a base has no reach/targets of its own (§1)
    renderBasePanel(base);
  }

  /** Every hex `garrisoned` could unload onto from `container` (a base or a boat) — mirrors
   * unloadUnit/unloadCargo's own validation (implementation-spec.md §1) so the UI can highlight
   * destinations without duplicating the commands' rules, only which hexes to check. */
  function computeUnloadTargets(container, garrisoned) {
    return grid.neighborsOf(container.col, container.row).filter((n) => isValidUnloadTarget(state, grid, container, garrisoned, n.col, n.row));
  }

  /** Enters the unload destination picker (§1): closes the base/unit panel and shows the
   * garrisoned/cargo unit's token on top of the container, with valid destinations highlighted.
   * `containerType` is "base" or "boat" — which command/panel a confirm or cancel routes to. */
  function openUnloadPreview(containerType, container, garrisoned) {
    pendingUnload = { containerType, container, garrisoned };
    selectedBase = null;
    selectedUnit = null;
    selectedQueueIndex = null;
    basePanel.hidden = true;
    unitPanel.hidden = true;
    camera?.resize(); // the map just reclaimed the panel's space — re-measure before any hit-test
    // The previous selection's move/attack/claim overlay belongs to a selection this picker has
    // already replaced -- leaving it on screen would be a stale reading (implementation-spec.md §1).
    camera?.setActionTargets({});
    camera.setPendingUnload({
      col: container.col,
      row: container.row,
      ownerId: container.ownerId,
      unitType: garrisoned.unitType,
      targets: computeUnloadTargets(container, garrisoned),
    });
  }

  function closeUnloadPreview() {
    if (!pendingUnload) return;
    pendingUnload = null;
    camera?.setPendingUnload(null);
  }

  /** Every adjacent base/boat `unit` could load into right now — implementation-spec.md §1's
   * Load destination picker highlight set. */
  function openLoadPreview(unit) {
    pendingLoad = unit;
    selectedBase = null;
    selectedUnit = null;
    selectedQueueIndex = null;
    basePanel.hidden = true;
    unitPanel.hidden = true;
    camera?.resize(); // the map just reclaimed the panel's space — re-measure before any hit-test
    // Same reasoning as openUnloadPreview above: don't leave the unit's own move/attack/claim
    // overlay showing once its selection has become this picker instead.
    camera?.setActionTargets({});
    camera.setPendingLoadTargets(computeLoadTargets(unit));
  }

  function closeLoadPreview() {
    if (!pendingLoad) return;
    pendingLoad = null;
    camera?.setPendingLoadTargets(null);
  }

  function openUnitPanel(unit) {
    selectedUnit = unit;
    selectedBase = null;
    basePanel.hidden = true;
    unitPanel.hidden = false;
    camera.resize(); // the panel just took space from the map — re-measure before any hit-test
    camera.setSelectedHex({ col: unit.col, row: unit.row });
    refreshActionTargets(); // show this unit's reach and what it can act on (§1)
    renderUnitPanel(unit);
  }

  /** Where `selectedUnit` can move this turn, keyed by hex (implementation-spec.md §1's Movement
   * targeting) — drives both the move-range overlay and resolving a tap on it, so the two can't
   * disagree about what's reachable. Empty unless the selection is the active player's own,
   * still-alive field unit. */
  let moveReach = new Map();

  function recomputeMoveReach() {
    const unit = selectedUnit;
    const actionable = unit && unit.ownerId === humanId && isHumanTurn() && state.units.includes(unit);
    moveReach = actionable ? reachableCells(state, grid, unit) : new Map();
  }

  /** Hands the camera everything the selected unit could act on, per style-guide.md §8's overlay
   * table. Attack/claim reuse the very predicates the tap itself resolves through, so a hex is
   * highlighted exactly when clicking it would do something. */
  function refreshActionTargets() {
    recomputeMoveReach();
    const unit = selectedUnit;
    if (!unit || unit.ownerId !== humanId || !isHumanTurn() || !state.units.includes(unit)) {
      camera?.setActionTargets({});
      return;
    }
    const attack = [];
    const claim = [];
    for (const enemy of state.units) {
      if (isValidAttackTarget(state, grid, unit, enemy)) attack.push({ col: enemy.col, row: enemy.row });
    }
    for (const base of state.bases) {
      if (isValidAttackBaseTarget(state, grid, unit, base)) attack.push({ col: base.col, row: base.row });
      else if (isValidClaimTarget(grid, unit, base)) claim.push({ col: base.col, row: base.row });
    }
    camera?.setActionTargets({ move: [...moveReach.values()], attack, claim });
  }

  /** Walks `route` one hex at a time through the ordinary moveUnit command rather than teleporting,
   * so every per-hex rule still fires exactly as it would have for individual clicks — AP spend,
   * fog reveal, and a plane's own fuel tick, which can destroy it partway (§3). Stops early if a
   * step is refused or the unit doesn't survive it. @returns whether the unit is still alive. */
  function walkRoute(unit, route) {
    for (const step of route) {
      moveUnit(state, grid, unit.id, step.col, step.row, humanId);
      if (!state.units.includes(unit)) return false; // crashed en route
      if (unit.col !== step.col || unit.row !== step.row) break; // refused -- stop where it stands
    }
    return true;
  }

  /** Redraws the map and re-checks the End Turn gate (§6) — every mutating branch in selectHex
   * uses this instead of calling camera.draw() directly, since any of them could change a plane's
   * actionsSpentMoving/remainingActions (moving, attacking, or removing/adding a field plane via
   * load/unload all qualify) *and* could change what the human's own fog of war currently reveals
   * (§5) — so this recomputes getVisibleState and hands the camera a fresh filtered bases/units/
   * fog via setVisibleState, rather than just re-drawing whatever it already had. */
  function redraw() {
    camera.setVisibleState(getVisibleState(state, humanId));
    refreshActionTargets(); // reach and valid targets both shift with the board (§1)
    refreshEndTurnGate();
  }

  function selectHex(col, row) {
    if (aiTurnInProgress) return; // map clicks are ignored while the AI is playing (§11)
    // Acting requires it to actually be the human's turn — inspecting is always allowed. Every
    // action below is gated on this rather than on the *active* player having the right units,
    // so that a turn left on someone else (a cascade that failed part-way, say) can never hand
    // the human control of that player's army. Nothing about the UI should be able to act as
    // anyone but the viewer.
    if (!isHumanTurn()) {
      selectForInspection(col, row);
      return;
    }
    if (pendingUnload) {
      const { containerType, container, garrisoned } = pendingUnload;
      const targets = computeUnloadTargets(container, garrisoned);
      if (targets.some((t) => t.col === col && t.row === row)) {
        if (containerType === "base") unloadUnit(state, grid, container.id, garrisoned.id, col, row, humanId);
        else unloadCargo(state, grid, container.id, garrisoned.id, col, row, humanId);
        closeUnloadPreview();
        const placedUnit = state.units.find((u) => u.id === garrisoned.id);
        if (placedUnit) openUnitPanel(placedUnit);
        redraw();
        return;
      }
      // Anything else -- the container hex, the previewed unit's own hex, or any other hex --
      // cancels back to the container's own panel (implementation-spec.md §1). No silent no-op:
      // a stray tap now visibly leaves the picker rather than stranding the player in it.
      closeUnloadPreview();
      if (containerType === "base") openBasePanel(container);
      else openUnitPanel(container); // a boat is a field unit -- reselect it
      return;
    }

    if (pendingLoad) {
      const unit = pendingLoad;
      const targets = computeLoadTargets(unit);
      if (targets.some((t) => t.col === col && t.row === row)) {
        const targetBase = baseAtHex(state, col, row);
        if (targetBase) {
          // A boat entering a base always uses the (possibly empty) free-bulk-cargo path (§2);
          // anything else uses the ordinary single-unit load.
          if (unit.cargo) enterBaseWithCargo(state, grid, unit.id, targetBase.id, humanId);
          else loadUnit(state, grid, unit.id, targetBase.id, humanId);
        } else {
          const targetBoat = unitAtHex(state, col, row);
          loadIntoBoat(state, grid, unit.id, targetBoat.id, humanId);
        }
        closeLoadPreview();
        if (state.units.includes(unit)) openUnitPanel(unit);
        // else: unit is now garrisoned/cargo -- nothing left to select, map/HUD alone reflects it.
        redraw();
        return;
      }
      // Anything else -- the unit's own hex, or any other hex -- cancels back to the unit's own
      // panel, unit still selected (implementation-spec.md §1). No silent no-op: a stray tap now
      // visibly leaves the picker rather than stranding the player in it.
      closeLoadPreview();
      openUnitPanel(unit);
      return;
    }

    // Attack & claim targeting (implementation-spec.md §1) takes priority over Movement
    // targeting below — an occupied hex never matches isValidMoveTarget anyway, so there's no
    // overlap to resolve, only a fallback when the attack/claim itself isn't currently valid.
    if (selectedUnit && selectedUnit.ownerId === humanId) {
      // What a tap can *find* is fog-filtered (§5) — the same projection the map is drawn from —
      // so a precisely-aimed click can't select/attack/claim something the renderer shows nothing
      // at. The commands themselves still take canonical `state`, since a rule has to resolve
      // against reality regardless of what the human can currently see.
      const visible = getVisibleState(state, humanId);
      const targetUnit = unitAtHex(visible, col, row);
      if (targetUnit && isValidAttackTarget(state, grid, selectedUnit, targetUnit)) {
        attackUnit(state, grid, selectedUnit.id, targetUnit.id, humanId);
        renderUnitPanel(selectedUnit);
        redraw();
        return;
      }
      const targetBase = baseAtHex(visible, col, row);
      if (targetBase && isValidAttackBaseTarget(state, grid, selectedUnit, targetBase)) {
        attackBase(state, grid, selectedUnit.id, targetBase.id, humanId);
        renderUnitPanel(selectedUnit);
        redraw();
        return;
      }
      if (targetBase && isValidClaimTarget(grid, selectedUnit, targetBase)) {
        claimBase(state, grid, selectedUnit.id, targetBase.id, humanId);
        closeAllPanels(); // the claiming unit is gone -- garrisoned into the base it just took
        redraw();
        return;
      }
    }

    // Movement targeting (§1): any hex in the selected unit's highlighted reach, however far —
    // the stored route is walked hex by hex, not jumped to.
    const destination = selectedUnit ? moveReach.get(offsetKey(col, row)) : undefined;
    if (destination) {
      const unit = selectedUnit;
      if (walkRoute(unit, destination.path)) {
        camera.setSelectedHex({ col: unit.col, row: unit.row });
        renderUnitPanel(unit);
      } else {
        closeAllPanels(); // a plane can crash mid-route (destroyed), §3's fuel rule
      }
      redraw();
      return;
    }

    selectForInspection(col, row);
  }

  /** Opens whatever is on the hex, without acting on it — the fallback for every tap that isn't a
   * move/attack/claim, and the only thing a tap can do outside the human's own turn. Reads the
   * fog-filtered projection (§5), not canonical state, so this can't reveal a unit/base the
   * renderer itself isn't showing at that hex. */
  function selectForInspection(col, row) {
    const visible = getVisibleState(state, humanId);
    const base = baseAtHex(visible, col, row);
    if (base) {
      openBasePanel(base);
      return;
    }
    const unit = unitAtHex(visible, col, row);
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

  /** Whether the match just ended (a natural win/loss, `endTurn`'s own `gameEnded`/`winnerId`, or
   * a surrender's `terminated` — commands.js, game spec §7) — if so, hands off to the End screen
   * (implementation-spec.md §8) via `onGameOver` instead of continuing to process turns. Callers
   * check this right after every `endTurn(state)` call. */
  function checkForGameOver() {
    if (state.gameEnded || state.terminated) {
      onGameOver(state);
      return true;
    }
    return false;
  }

  /** Milliseconds to pause between individual AI actions — 0 (Instant) means play the whole AI
   * turn synchronously, with no `await` on the path at all (implementation-spec.md §11), so
   * ending a turn still resolves inside the same click. */
  function aiStepDelay() {
    return Number(aiSpeedSelect.value);
  }

  /** Plays out every AI turn between now and the human's next one (game spec §8/§11). Each AI's
   * actions come from `aiTurnActions`, one at a time, so a paced run can redraw and wait between
   * them; Instant drains the generator without yielding to the event loop. Does nothing if the
   * human is already active — turn order is randomized (§7), so a match can start on an AI's
   * turn, and this must not skip a turn that's already the human's. */
  async function runAiTurnsUntilHuman() {
    aiTurnInProgress = true;
    refreshEndTurnGate(); // disables End Turn for the duration
    try {
      while (!activePlayer(state).isHuman) {
        const delay = aiStepDelay();
        for (const _action of aiTurnActions(state, grid, activePlayer(state).id)) {
          if (delay > 0) {
            redraw(); // an AI unit stepping into view should appear as it happens (§5's fog)
            refreshOpenPanel(); // an open panel may be showing a base/unit the AI just changed
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        endTurn(state);
        if (checkForGameOver()) return;
        processTurnStart(state, activePlayer(state).id); // whoever's turn is starting, not the viewer
      }
    } catch (error) {
      // An AI turn dying part-way used to leave the match both unplayable and silent: the finally
      // below unlocked input while the turn was still sitting on the AI, the rejection surfaced
      // only in the console, and the post-await refresh never ran — so the HUD went on claiming it
      // was the human's turn while clicks acted as the AI. selectHex's own turn check makes that
      // harmless now, but a failure still has to be *visible* rather than looking like the game
      // merely misbehaving.
      console.error("AI turn failed", error);
      aiTurnFailure = error;
      throw error;
    } finally {
      aiTurnInProgress = false;
      refreshHud(); // re-reads whose turn it actually is, and re-enables End Turn if appropriate
    }
  }

  /** The End Turn button: ends the human's own current turn, then plays out any AI turns that
   * follow before handing control back. */
  async function advanceUntilHuman() {
    if (aiTurnInProgress) return; // no acting out of turn while the AI is still playing
    closeUnloadPreview(); // a stale picker from this turn shouldn't survive into the next one
    closeLoadPreview();
    endTurn(state);
    if (checkForGameOver()) return;
    processTurnStart(state, activePlayer(state).id); // whoever's turn is starting, not the viewer
    await runAiTurnsUntilHuman();
    if (state.gameEnded || state.terminated) return; // the End screen already has the board
    refreshHud();
    refreshOpenPanel();
    redraw(); // AI turns can move enemy units into/out of the human's own fog of war (§5)
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
    checkForGameOver(); // always true here (terminate just set state.terminated) -- routes to the End screen
  });
  zoomInButton.addEventListener("click", () => camera?.zoomIn());
  zoomOutButton.addEventListener("click", () => camera?.zoomOut());
  basePanelClose.addEventListener("click", closeAllPanels);
  unitPanelClose.addEventListener("click", closeAllPanels);

  return {
    start(newState) {
      state = newState;
      grid = deserializeGrid(state.map.width, state.map.height, state.map.rows);
      aiTurnFailure = null; // a fresh match starts trusted again
      closeMenu();
      closeAllPanels();
      camera?.destroy();

      // Baseline fog-of-war exploration for every player (§5), before any turn runs — if turn
      // order happens to start on the human already, no turn-start fires for anyone here, so
      // processTurnStart's own markExplored call would never happen and the human's own starting
      // base would render fully unexplored.
      for (const p of state.players) markExplored(state, p.id);

      const human = state.players.find((p) => p.isHuman);
      humanId = human.id;
      const myBase = playerBase(state, human.id);
      const visible = getVisibleState(state, humanId);
      camera = createMapCamera(canvas, state.map, {
        bases: visible.bases,
        units: visible.units,
        fog: visible.fog,
        players: state.players,
        viewerId: humanId,
        onSelectHex: selectHex,
        centerOnCol: myBase?.col,
        centerOnRow: myBase?.row,
      });
      refreshHud();

      // Turn order is randomized (§7), so a match can open on an AI's turn — play those out the
      // same way any other AI turn is played, rather than as a silent special case. After the
      // camera exists, since a paced run redraws between actions.
      runAiTurnsUntilHuman().then(() => {
        if (state.gameEnded || state.terminated) return;
        refreshHud();
        redraw();
      });
    },
  };
}
