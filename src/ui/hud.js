/**
 * In-game HUD: turn indicator and end-turn control. A thin DOM overlay
 * over the canvas -- reads state only via the same getVisibleState
 * projection the renderer uses (passed in as getState), never
 * canonical state directly.
 */

/**
 * @param {HTMLElement} container - positioned ancestor the HUD overlays (must be position: relative)
 * @param {{getState: () => object, onEndTurn: () => void}} opts
 * @returns {{update: () => void}}
 */
export function renderHud(container, { getState, onEndTurn }) {
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.style.cssText =
    "position: absolute; top: 12px; left: 12px; z-index: 10; " +
    "display: flex; align-items: center; gap: 12px; " +
    "font-family: var(--font-body); color: var(--parchment);";

  const turnLabel = document.createElement("span");
  turnLabel.style.cssText = "background: var(--ink); padding: 6px 12px; border-radius: 4px;";

  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "btn-primary";
  endTurnBtn.type = "button";
  endTurnBtn.style.cssText = "font-size: 14px; padding: 8px 20px;";
  endTurnBtn.textContent = "End Turn";
  endTurnBtn.addEventListener("click", onEndTurn);

  hud.append(turnLabel, endTurnBtn);
  container.append(hud);

  return {
    update() {
      const { turn } = getState();
      turnLabel.textContent = `Turn ${turn.number}`;
    },
  };
}
