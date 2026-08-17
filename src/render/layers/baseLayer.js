/**
 * Renders bases with owner accent color (style-guide.md §3), plus
 * phase-1 text for build/neutral status (style-guide.md §8).
 */
import { hexCenter, hexCorners, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getPlayerColor, getCssToken } from "../colorTokens.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{bases: object[], players: {id: number|string}[]}} visibleState
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {number|string|null} selectedBaseId
 */
export function drawBases(ctx, visibleState, camera, selectedBaseId) {
  const { bases, players } = visibleState;
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;

  for (const base of bases) {
    const centerWorld = hexCenter(base.position, DEFAULT_HEX_SIZE);
    const center = worldToScreen(camera, centerWorld.x, centerWorld.y);
    const corners = hexCorners(center.x, center.y, hexSize * 0.75);

    const playerIndex = base.ownerId == null ? -1 : players.findIndex((p) => p.id === base.ownerId);
    const color = base.ownerId == null ? getCssToken("--steel") : getPlayerColor(playerIndex);

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, hexSize * 0.15);
    ctx.stroke();

    if (base.id === selectedBaseId) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = Math.max(1, hexSize * 0.06);
      ctx.stroke();
    }

    const label = base.ownerId == null ? "NEUTRAL" : base.currentBuild ? `BUILDING: ${base.currentBuild.unitType.toUpperCase()}` : null;
    if (label) drawSmallLabel(ctx, center.x, center.y + hexSize * 1.1, camera, label);
  }
}

function drawSmallLabel(ctx, x, y, camera, text) {
  const fontSize = Math.max(8, 9 * camera.zoom);
  ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padding = 3 * camera.zoom;
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = fontSize + padding * 1.2;

  ctx.fillStyle = getCssToken("--ink");
  ctx.fillRect(x - boxWidth / 2, y, boxWidth, boxHeight);
  ctx.fillStyle = getCssToken("--parchment");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x - boxWidth / 2 + padding, y + boxHeight / 2);
}
