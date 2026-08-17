/**
 * Renders units with owner accent color (style-guide.md §3). Only
 * draws what's in the visible-state projection -- fog filtering
 * already happened in getVisibleState.js, this layer just paints
 * whatever units it's handed.
 */
import { hexCenter, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getPlayerColor } from "../colorTokens.js";

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
    const centerWorld = hexCenter(unit.position, DEFAULT_HEX_SIZE);
    const center = worldToScreen(camera, centerWorld.x, centerWorld.y);
    const playerIndex = players.findIndex((p) => p.id === unit.ownerId);

    ctx.beginPath();
    ctx.arc(center.x, center.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = getPlayerColor(playerIndex);
    ctx.fill();
    ctx.lineWidth = Math.max(1, hexSize * 0.08);
    ctx.strokeStyle = unit.id === selectedUnitId ? "#FFFFFF" : "rgba(0, 0, 0, 0.5)";
    ctx.stroke();
  }
}
