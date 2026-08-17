/**
 * Phase-1 text-only status labels (style-guide.md §8): X/Y AP, X/Y SP,
 * X/Y RANGE, IN RANGE. Explicitly a placeholder per the style guide --
 * "dedicated UI elements (selection rings, health bars, range
 * overlays) are expected to replace this in a later pass."
 *
 * Two distinct label sets, deliberately different:
 *  - Your own selected unit/garrisoned unit: AP, SP, and (fighter/
 *    bomber only) sortie range used/limit -- everything you'd actually
 *    know about your own aircraft.
 *  - An inspected ENEMY unit: strength (SP) ONLY. No AP (you wouldn't
 *    know an opponent's exact remaining actions), no range/strikes
 *    (ditto, and it's moot for an enemy anyway). Enemy BASES never get
 *    a strength readout at all here -- see src/ui/input.js, which
 *    doesn't offer an "inspect" selection for bases in the first
 *    place; a base's strength stays unknown until it's demolished.
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
 * @param {{ownUnitId?: number|string|null, enemyUnitId?: number|string|null}} selection
 * @param {Set<string>} [reachableCellKeys] - unused for now, see above
 */
export function drawStatusText(ctx, visibleState, camera, { ownUnitId, enemyUnitId } = {}, reachableCellKeys) {
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;

  const ownUnit = ownUnitId != null ? visibleState.units.find((u) => u.id === ownUnitId) : null;
  if (ownUnit) {
    const centerWorld = hexCenter(ownUnit.position, DEFAULT_HEX_SIZE);
    const def = UNIT_DEFS[ownUnit.type];
    const lines = [`${ownUnit.actionsRemaining}/${def.actionsPerTurn} AP`, `${ownUnit.strength}/${def.strength} SP`];
    if (def.roundTripRangeLimit != null) {
      lines.push(`${ownUnit.distanceFlownThisSortie}/${def.roundTripRangeLimit} RANGE`);
    }
    // Stack bottom-up so AP stays at the same -1.5 spot it's always
    // been at (closest line to the unit is last in `lines`, at -0.9).
    lines.forEach((text, i) => {
      const offset = -hexSize * (0.9 + (lines.length - 1 - i) * 0.6);
      drawLabel(ctx, centerWorld.x, centerWorld.y, camera, text, offset);
    });
  }

  const enemyUnit = enemyUnitId != null ? visibleState.units.find((u) => u.id === enemyUnitId) : null;
  if (enemyUnit) {
    const centerWorld = hexCenter(enemyUnit.position, DEFAULT_HEX_SIZE);
    const maxStrength = UNIT_DEFS[enemyUnit.type].strength;
    drawLabel(ctx, centerWorld.x, centerWorld.y, camera, `${enemyUnit.strength}/${maxStrength} SP`, -hexSize * 1.5);
  }
}
