/**
 * In-game HUD: turn indicator, save/end-turn controls, and a
 * contextual action panel. Attack targets are handled by clicking the
 * canvas directly (src/ui/input.js), but claim/enter/exit/build,
 * queue cancellation, and garrison-unit selection need explicit UI
 * since they're not "click a cell" actions. Reads state only via the
 * same getVisibleState projection the renderer uses, never canonical
 * state directly.
 *
 * Base panel, three labeled sections:
 *  - "Building": 1 slot, current build progress (or empty).
 *  - "Queue": MAX_BUILD_QUEUE slots, pending orders -- click a filled
 *    one to cancel it (src/commands/cancelQueuedBuild.js).
 *  - "Garrison": MAX_BASE_CAPACITY-1 slots, garrisoned units in entry
 *    order -- click a filled one to select it (src/ui/input.js's
 *    selectGarrisonedUnit). This is the fix for garrisoning being a
 *    dead end before: once a unit entered a base there was no way to
 *    click it again (it isn't drawn on the map -- unitLayer.js).
 *
 * Build buttons always show all 6 unit types (never hidden), disabled
 * with a tooltip reason when not currently buildable -- base-type
 * eligibility, the carrier deep-water rule (scoped to port bases only,
 * per §2's table -- a land base can build "All vehicles" including
 * carrier, unconditionally), or capacity/queue limits
 * (src/commands/buildUnit.js's canBuildAt, the single source of truth
 * both this panel and the real command check against).
 *
 * A selected FIELD unit's "Load into base" button(s) come from
 * src/ui/input.js's loadTargets -- one per base the unit is on OR
 * ADJACENT to (not just standing exactly on), since a boat can never
 * physically be on a port base's own land cell (see enterBase.js's
 * module doc). Each button disables itself with a reason (no actions
 * left, base at capacity) rather than disappearing.
 */
import { BUILD_TIME_TURNS, BUILD_COST_MULTIPLIER, MAX_BASE_CAPACITY, MAX_BUILD_QUEUE } from "../buildings/baseDefs.js";
import { UNIT_DEFS } from "../units/unitDefs.js";
import { createShapeIcon } from "./unitShapes.js";

/**
 * @param {HTMLElement} container - positioned ancestor the HUD overlays (must be position: relative)
 * @param {{getState: () => object, onEndTurn: () => void, onSave: () => void, inputController: object, viewerId: number|string}} opts
 * @returns {{update: () => void}}
 */
export function renderHud(container, { getState, onEndTurn, onSave, inputController, viewerId }) {
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.style.cssText =
    "position: absolute; top: 12px; left: 12px; z-index: 10; " +
    "display: flex; flex-direction: column; gap: 8px; align-items: flex-start; " +
    "font-family: var(--font-body); color: var(--parchment); max-width: 360px; " +
    "max-height: calc(100vh - 24px); overflow-y: auto;";

  const topRow = document.createElement("div");
  topRow.style.cssText = "display: flex; align-items: center; gap: 12px;";

  const turnLabel = document.createElement("span");
  turnLabel.style.cssText = "background: var(--ink); padding: 6px 12px; border-radius: 4px;";

  const endTurnBtn = smallButton("End Turn", onEndTurn);
  const saveBtn = smallButton("Save", onSave);

  // Design doc §6: "AI: actions play out step by step, at a
  // configurable speed (instant / fast [1s per action] / slow [2s per
  // action])". Defaults to instant so a normal game doesn't force the
  // player to sit through animation; this just exposes the choice.
  const speedSelect = document.createElement("select");
  for (const speed of ["instant", "fast", "slow"]) {
    const option = document.createElement("option");
    option.value = speed;
    option.textContent = `AI speed: ${speed}`;
    speedSelect.append(option);
  }

  topRow.append(turnLabel, endTurnBtn, saveBtn, speedSelect);

  const messageBox = document.createElement("div");
  messageBox.style.cssText =
    "background: var(--ink); padding: 4px 10px; border-radius: 3px; font-size: 12px; min-height: 1.2em;";

  const actionPanel = document.createElement("div");
  actionPanel.style.cssText = "display: flex; flex-direction: column; gap: 6px; width: 100%;";

  hud.append(topRow, messageBox, actionPanel);
  container.append(hud);

  function smallButton(label, onClick) {
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.type = "button";
    btn.style.cssText = "font-size: 13px; padding: 6px 14px;";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function sectionLabel(text) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = "font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--steel); margin-top: 4px;";
    return el;
  }

  function slotGrid() {
    const grid = document.createElement("div");
    grid.style.cssText = "display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;";
    return grid;
  }

  function slotBase() {
    const el = document.createElement("div");
    el.style.cssText =
      "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; " +
      "height: 44px; border: 1px solid var(--steel); border-radius: 3px; font-size: 9px; " +
      "line-height: 1.15; padding: 2px; text-align: center; overflow: hidden;";
    return el;
  }

  function emptySlotElement() {
    const el = slotBase();
    el.style.opacity = "0.35";
    return el;
  }

  function buildSlotElement(base) {
    const el = slotBase();
    el.style.borderStyle = "dashed";
    if (base.currentBuild) {
      const total = BUILD_TIME_TURNS * BUILD_COST_MULTIPLIER[base.currentBuild.unitType];
      el.append(
        createShapeIcon(base.currentBuild.unitType, { size: 12, color: "var(--signal)" }),
        textLine(base.currentBuild.unitType.toUpperCase(), "bold"),
        textLine(`${base.currentBuild.turnsRemaining}/${total}`)
      );
    } else {
      el.textContent = "IDLE";
      el.style.color = "var(--steel)";
    }
    return el;
  }

  function textLine(text, weight) {
    const span = document.createElement("span");
    span.textContent = text;
    if (weight === "bold") span.style.fontWeight = "bold";
    return span;
  }

  /** A garrison slot (click to select) or queue slot (click to cancel), sharing the same visual language. */
  function unitSlotElement(unitType, statLine, isSelected, isOwner, onClick) {
    const el = document.createElement(isOwner ? "button" : "div");
    el.style.cssText =
      "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; " +
      "height: 44px; border-radius: 3px; font-size: 9px; line-height: 1.15; padding: 2px; " +
      "text-align: center; overflow: hidden; font-family: inherit; color: var(--parchment); " +
      `border: ${isSelected ? "2px solid #FFFFFF" : "1px solid var(--steel)"}; ` +
      `background: ${isSelected ? "var(--olive)" : "var(--ink)"}; ` +
      `cursor: ${isOwner ? "pointer" : "default"};`;
    el.append(
      createShapeIcon(unitType, { size: 12, color: "var(--parchment)" }),
      textLine(unitType.toUpperCase(), "bold"),
      textLine(statLine)
    );
    if (isOwner && onClick) el.addEventListener("click", onClick);
    return el;
  }

  function renderGarrisonGrid(garrisonUnits, selectedUnitId, isOwner) {
    const grid = slotGrid();
    const slotCount = Math.max(MAX_BASE_CAPACITY - 1, garrisonUnits.length);
    for (let i = 0; i < slotCount; i++) {
      const unit = garrisonUnits[i];
      if (!unit) {
        grid.append(emptySlotElement());
        continue;
      }
      const maxStrength = UNIT_DEFS[unit.type].strength;
      grid.append(
        unitSlotElement(unit.type, `${unit.strength}/${maxStrength}`, unit.id === selectedUnitId, isOwner, () =>
          inputController.selectGarrisonedUnit(unit.id, unit.garrisonedAt)
        )
      );
    }
    return grid;
  }

  function renderQueueGrid(buildQueue, isOwner) {
    const grid = slotGrid();
    for (let i = 0; i < MAX_BUILD_QUEUE; i++) {
      const unitType = buildQueue[i];
      if (!unitType) {
        grid.append(emptySlotElement());
        continue;
      }
      grid.append(unitSlotElement(unitType, `#${i + 1}`, false, isOwner, () => inputController.cancelQueuedBuild(i)));
    }
    return grid;
  }

  function renderBuildButtons(buildOptions) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 4px;";
    for (const { type, buildable, reason } of buildOptions) {
      const btn = document.createElement("button");
      btn.className = "btn-primary";
      btn.type = "button";
      btn.disabled = !buildable;
      btn.title = buildable ? "" : reason;
      btn.style.cssText =
        "font-size: 13px; padding: 6px 14px; display: flex; align-items: center; gap: 8px; " +
        (buildable ? "" : "opacity: 0.4; cursor: not-allowed;");
      btn.append(createShapeIcon(type, { size: 14, color: "var(--ink)" }), textLine(`Build ${type}`));
      if (buildable) btn.addEventListener("click", () => inputController.buildAtSelectedBase(type));
      wrap.append(btn);
    }
    return wrap;
  }

  function renderActionPanel() {
    actionPanel.innerHTML = "";
    const status = inputController.getStatus();
    messageBox.textContent = status.message ?? "";
    if (!status.context) return;

    if (status.context.type === "unit") {
      const { canClaim, loadTargets } = status.context;
      if (canClaim) actionPanel.append(smallButton("Claim Base", () => inputController.claimSelectedUnitsBase()));
      // One button per nearby loadable target (design doc's spirit --
      // in practice at most one base can ever be in range at a time,
      // since bases are always >= 5 cells apart, but this renders
      // generically so it's ready for transporter/carrier cargo targets
      // later without changing this loop).
      for (const target of loadTargets) {
        const btn = smallButton(target.label, () => inputController.enterSelectedUnitsBase(target.id));
        btn.disabled = !target.enabled;
        btn.title = target.enabled ? "" : target.reason;
        if (!target.enabled) btn.style.opacity = "0.4";
        actionPanel.append(btn);
      }
      return;
    }

    if (status.context.type === "base" || status.context.type === "garrison") {
      const { base, garrisonUnits, buildOptions } = status.context;
      const isOwner = base.ownerId === viewerId;
      const selectedUnitId = status.context.type === "garrison" ? status.context.unit.id : null;

      actionPanel.append(sectionLabel("Building"), buildSlotElement(base));
      actionPanel.append(sectionLabel(`Queue (${base.buildQueue.length}/${MAX_BUILD_QUEUE})`), renderQueueGrid(base.buildQueue, isOwner));
      actionPanel.append(
        sectionLabel(`Garrison (${garrisonUnits.length}/${MAX_BASE_CAPACITY - 1})`),
        renderGarrisonGrid(garrisonUnits, selectedUnitId, isOwner)
      );

      if (status.context.type === "garrison" && status.context.canExit) {
        actionPanel.append(smallButton("Exit Base (stay put)", () => inputController.exitSelectedUnit()));
      }

      if (isOwner && base.ownerId != null) {
        actionPanel.append(sectionLabel("Build"), renderBuildButtons(buildOptions));
      }
    }
  }

  return {
    update() {
      const { turn } = getState();
      turnLabel.textContent = `Turn ${turn.number}`;
      renderActionPanel();
    },
    getAiSpeed() {
      return speedSelect.value;
    },
    /** Disables end-turn/save while an AI turn is animating, so the human can't act out of turn. */
    setInteractive(enabled) {
      endTurnBtn.disabled = !enabled;
      saveBtn.disabled = !enabled;
    },
  };
}
