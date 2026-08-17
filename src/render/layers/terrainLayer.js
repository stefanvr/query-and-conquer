/**
 * Renders terrain tile colors. Reads only from a visible-state
 * projection (never canonicalState directly) per this project's
 * CQRS query seam -- see src/queries/getVisibleState.js.
 */
import { hexCenter, hexCorners, DEFAULT_HEX_SIZE } from "../hexGeometry.js";
import { worldToScreen } from "../camera.js";
import { getTerrainColor } from "../colorTokens.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{map: {width: number, height: number, terrain: string[][]}}} visibleState
 * @param {{x: number, y: number, zoom: number}} camera
 */
export function drawTerrain(ctx, visibleState, camera) {
  const { width, height, terrain } = visibleState.map;
  const hexSize = DEFAULT_HEX_SIZE * camera.zoom;

  // ctx has a device-pixel-ratio transform applied (see canvasRenderer.js),
  // so drawing coordinates -- and therefore these culling bounds -- are in
  // CSS-pixel space, not the canvas buffer's raw device-pixel dimensions.
  const dpr = window.devicePixelRatio || 1;
  const viewWidth = ctx.canvas.width / dpr;
  const viewHeight = ctx.canvas.height / dpr;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      // Unexplored cells (fog-of-war, Stage 4+) are terrain: null --
      // "not rendered — full --ink" per style-guide.md §7. The canvas
      // has no fill of its own, so simply not drawing here lets the
      // page's --ink background (src/styles/layout.css) show through.
      if (terrain[row][col] == null) continue;

      const centerWorld = hexCenter({ col, row }, DEFAULT_HEX_SIZE);
      const center = worldToScreen(camera, centerWorld.x, centerWorld.y);

      // Cull hexes fully outside the canvas before touching the path API.
      if (
        center.x < -hexSize * 2 ||
        center.x > viewWidth + hexSize * 2 ||
        center.y < -hexSize * 2 ||
        center.y > viewHeight + hexSize * 2
      ) {
        continue;
      }

      const corners = hexCorners(center.x, center.y, hexSize);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fillStyle = getTerrainColor(terrain[row][col]);
      ctx.fill();
    }
  }
}
