/**
 * Canvas render entry point. Owns the <canvas> element, the camera,
 * and the redraw loop; delegates actual drawing to per-concern layers
 * (src/render/layers/*.js). Takes a visible-state projection, never
 * canonical state, per this project's CQRS query seam.
 *
 * Also owns click -> hex-cell translation (screen pixel -> world pixel
 * -> offset cell) and forwards it to the caller's onCellClick, plus
 * local (non-canonical) selection/reachable-cell state so unitLayer.js,
 * baseLayer.js, and statusTextLayer.js can highlight the current
 * selection -- selection itself is UI state, not canonical state
 * (src/ui/input.js owns the selection *logic*; this module just
 * renders whatever it's told).
 */
import { createCamera, attachCameraControls, fitToView } from "./camera.js";
import { gridPixelBounds, pixelToHex, DEFAULT_HEX_SIZE } from "./hexGeometry.js";
import { drawTerrain } from "./layers/terrainLayer.js";
import { drawFog } from "./layers/fogLayer.js";
import { drawBases } from "./layers/baseLayer.js";
import { drawUnits } from "./layers/unitLayer.js";
import { drawStatusText } from "./layers/statusTextLayer.js";

/**
 * @param {HTMLElement} container - element to render the canvas into (filled)
 * @param {() => object} getVisibleState - returns the current visible-state projection
 * @param {{onCellClick?: (cell: {col: number, row: number}) => void}} [opts]
 * @returns {{ redraw: () => void, setSelection: (selection: {type: "unit"|"base"|"garrison", id: number|string, baseId?: number|string}|null, reachableKeys?: Set<string>) => void, destroy: () => void }}
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
  let selection = null; // {type: "unit"|"base"|"garrison", id, baseId?} | null
  let reachableKeys = null;

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function redraw() {
    const visibleState = getVisibleState();
    // "garrison" (a drilled-into garrisoned unit, src/ui/input.js) is
    // unit-like for the status-text label (AP/SP shown at the base's
    // position, since unitLayer.js doesn't draw a garrisoned unit's own
    // dot) and keeps that base's selection ring lit too.
    const selectedUnitId = selection?.type === "unit" || selection?.type === "garrison" ? selection.id : null;
    const selectedBaseId =
      selection?.type === "base" ? selection.id : selection?.type === "garrison" ? selection.baseId : null;

    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTerrain(ctx, visibleState, camera);
    drawFog(ctx, visibleState, camera);
    drawBases(ctx, visibleState, camera, selectedBaseId);
    drawUnits(ctx, visibleState, camera, selectedUnitId);
    drawStatusText(ctx, visibleState, camera, selectedUnitId, reachableKeys);
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
    setSelection(newSelection, newReachableKeys = null) {
      selection = newSelection;
      reachableKeys = newReachableKeys;
      redraw();
    },
    destroy() {
      detachControls();
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    },
  };
}
