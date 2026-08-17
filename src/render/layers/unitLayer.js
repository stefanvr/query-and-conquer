/**
 * Renders units with owner accent color (style-guide.md §3) and a
 * per-type shape (square/triangle/hexagon/bar/circle/star -- see
 * src/units/unitShapes.js) so unit types are visually distinguishable
 * at a glance on the map itself, not just in the HUD. Only draws
 * what's in the visible-state projection -- fog filtering already
 * happened in getVisibleState.js, this layer just paints whatever
 * units it's handed.
 *
 * Garrisoned units are NOT drawn here -- they're "inside" their base,
 * not a distinct visible token on the map, and are shown instead via
 * the base's panel (src/ui/hud.js). Drawing them too would stack
 * multiple shapes on the same cell as the base, unreadable once a base
 * holds more than one or two units.
 */
import { hexCenter, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getPlayerColor } from "../colorTokens.js";
import { drawUnitShape } from "../shapeCanvas.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{units: object[], players: {id: number|string}[]}} visibleState
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {number|string} [selectedUnitId]
 */
export function drawUnits(ctx, visibleState, camera, selectedUnitId) {
  const { units, players } = visibleState;
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;
  const dotRadius = hexSize * 0.4;

  for (const unit of units) {
    if (unit.garrisonedAt != null) continue;
    const centerWorld = hexCenter(unit.position, DEFAULT_HEX_SIZE);
    const center = worldToScreen(camera, centerWorld.x, centerWorld.y);
    const playerIndex = players.findIndex((p) => p.id === unit.ownerId);

    drawUnitShape(ctx, unit.type, center.x, center.y, dotRadius, {
      fill: getPlayerColor(playerIndex),
      stroke: unit.id === selectedUnitId ? "#FFFFFF" : "rgba(0, 0, 0, 0.5)",
      lineWidth: Math.max(1, hexSize * 0.08),
    });
  }
}
