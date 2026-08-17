/**
 * Canvas render entry point. Owns the <canvas> element, the camera,
 * and the redraw loop; delegates actual drawing to per-concern layers
 * (src/render/layers/*.js). Takes a visible-state projection, never
 * canonical state, per this project's CQRS query seam.
 *
 * Also owns click -> hex-cell translation (screen pixel -> world pixel
 * -> offset cell) and forwards it to the caller's onCellClick, plus
 * local (non-canonical) selection/reachable-cell state so unitLayer.js
 * and statusTextLayer.js can highlight the selected unit -- selection
 * itself is UI state, not canonical state (src/ui/input.js owns the
 * selection *logic*; this module just renders whatever it's told).
 */
import { createCamera, attachCameraControls, fitToView } from "./camera.js";
import { gridPixelBounds, pixelToHex, DEFAULT_HEX_SIZE } from "./hexGeometry.js";
import { drawTerrain } from "./layers/terrainLayer.js";
import { drawFog } from "./layers/fogLayer.js";
import { drawUnits } from "./layers/unitLayer.js";
import { drawStatusText } from "./layers/statusTextLayer.js";

/**
 * @param {HTMLElement} container - element to render the canvas into (filled)
 * @param {() => object} getVisibleState - returns the current visible-state projection
 * @param {{onCellClick?: (cell: {col: number, row: number}) => void}} [opts]
 * @returns {{ redraw: () => void, setSelection: (unitId: number|string|null, reachableKeys?: Set<string>) => void, destroy: () => void }}
 */
export function createCanvasRenderer(container, getVisibleState, { onCellClick } = {}) {
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.append(canvas);

  const ctx = canvas.getContext("2d");
  const camera = createCamera();
  const selection = { unitId: null, reachableKeys: null };

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function redraw() {
    const visibleState = getVisibleState();
    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTerrain(ctx, visibleState, camera);
    drawFog(ctx, visibleState, camera);
    drawUnits(ctx, visibleState, camera, selection.unitId);
    drawStatusText(ctx, visibleState, camera, selection.unitId, selection.reachableKeys);
    ctx.restore();
  }

  resizeCanvas();
  const { width, height } = getVisibleState().map;
  const bounds = gridPixelBounds(width, height, DEFAULT_HEX_SIZE);
  // fitToView and all subsequent drawing operate in CSS-pixel space --
  // the ctx.setTransform(dpr, ...) above is what maps that to the
  // higher-resolution device-pixel canvas buffer for crispness.
  const rect = container.getBoundingClientRect();
  fitToView(camera, bounds.width, bounds.height, rect.width, rect.height);

  function handleClick(screenX, screenY) {
    if (!onCellClick) return;
    const worldX = camera.x + screenX / camera.zoom;
    const worldY = camera.y + screenY / camera.zoom;
    onCellClick(pixelToHex(worldX, worldY, DEFAULT_HEX_SIZE));
  }

  const detachControls = attachCameraControls(canvas, camera, redraw, handleClick);

  function onResize() {
    resizeCanvas();
    redraw();
  }
  window.addEventListener("resize", onResize);

  redraw();

  return {
    redraw,
    setSelection(unitId, reachableKeys = null) {
      selection.unitId = unitId;
      selection.reachableKeys = reachableKeys;
      redraw();
    },
    destroy() {
      detachControls();
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    },
  };
}
