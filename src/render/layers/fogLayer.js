/**
 * Renders fog-of-war states (design doc §5 / style-guide.md §7):
 *  - unexplored: already skipped entirely by terrainLayer.js (nothing
 *    to do here -- the page's --ink background shows through).
 *  - explored, not currently visible: dimmed by --fog-dim-alpha (30%,
 *    confirmed value -- see the resolved ambiguity note in
 *    doc/style-guide.md §7).
 *  - currently visible: no overlay.
 */
import { hexCenter, hexCorners, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getFogDimAlpha } from "../colorTokens.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{map: {width: number, height: number, fogState: string[][]}}} visibleState
 * @param {{x: number, y: number, zoom: number}} camera
 */
export function drawFog(ctx, visibleState, camera) {
  const { width, height, fogState } = visibleState.map;
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;

  ctx.fillStyle = `rgba(0, 0, 0, ${getFogDimAlpha()})`;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (fogState[row][col] !== "explored") continue;

      const centerWorld = hexCenter({ col, row }, DEFAULT_HEX_SIZE);
      const center = worldToScreen(camera, centerWorld.x, centerWorld.y);
      const corners = hexCorners(center.x, center.y, hexSize);

      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}
