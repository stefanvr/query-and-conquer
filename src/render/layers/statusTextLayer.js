/**
 * Phase-1 text-only status labels (style-guide.md §8): [SELECTED],
 * X/Y SP, IN RANGE. Explicitly a placeholder per the style guide --
 * "dedicated UI elements (selection rings, health bars, range
 * overlays) are expected to replace this in a later pass."
 */
import { hexCenter, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getCssToken } from "../colorTokens.js";
import { UNIT_DEFS } from "../../units/unitDefs.js";

function drawLabel(ctx, worldX, worldY, camera, text, offsetY) {
  const screen = worldToScreen(camera, worldX, worldY);
  const fontSize = Math.max(9, 10 * camera.zoom);
  ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padding = 3 * camera.zoom;
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = fontSize + padding * 1.2;
  const x = screen.x - boxWidth / 2;
  const y = screen.y + offsetY;

  ctx.fillStyle = getCssToken("--ink");
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = getCssToken("--parchment");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padding, y + boxHeight / 2);
}

/**
 * Deliberately does NOT label every reachable cell with "IN RANGE" text
 * -- with a move budget of several actions over cheap terrain that's
 * dozens of cells, and full-text-per-cell at that volume is unreadable
 * clutter, not a reasonable reading of the style guide's placeholder
 * (style-preview.html's own example uses the label on one specific
 * relevant cell, not a flood over an entire range). Move-range
 * highlighting is left for a later UI pass with a real visual
 * treatment; reachableCellKeys is still computed and passed through
 * (src/ui/input.js) for that future use and is accepted here for
 * forward compatibility, just not rendered as text today.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{units: object[]}} visibleState
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {number|string|null} selectedUnitId
 * @param {Set<string>} [reachableCellKeys] - unused for now, see above
 */
export function drawStatusText(ctx, visibleState, camera, selectedUnitId, reachableCellKeys) {
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;
  const selectedUnit = visibleState.units.find((u) => u.id === selectedUnitId);
  if (selectedUnit) {
    const centerWorld = hexCenter(selectedUnit.position, DEFAULT_HEX_SIZE);
    const maxStrength = UNIT_DEFS[selectedUnit.type].strength;
    drawLabel(ctx, centerWorld.x, centerWorld.y, camera, "[SELECTED]", -hexSize * 1.5);
    drawLabel(ctx, centerWorld.x, centerWorld.y, camera, `${selectedUnit.strength}/${maxStrength} SP`, -hexSize * 0.9);
  }
}
