/**
 * Canvas render entry point. Owns the <canvas> element, the camera,
 * and the redraw loop; delegates actual drawing to per-concern layers
 * (src/render/layers/*.js). Takes a visible-state projection, never
 * canonical state, per this project's CQRS query seam.
 */
import { createCamera, attachCameraControls, fitToView } from "./camera.js";
import { gridPixelBounds, DEFAULT_HEX_SIZE } from "./hexGeometry.js";
import { drawTerrain } from "./layers/terrainLayer.js";

/**
 * @param {HTMLElement} container - element to render the canvas into (filled)
 * @param {() => object} getVisibleState - returns the current visible-state projection
 * @returns {{ destroy: () => void, redraw: () => void }}
 */
export function createCanvasRenderer(container, getVisibleState) {
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.append(canvas);

  const ctx = canvas.getContext("2d");
  const camera = createCamera();

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

  const detachControls = attachCameraControls(canvas, camera, redraw);

  function onResize() {
    resizeCanvas();
    redraw();
  }
  window.addEventListener("resize", onResize);

  redraw();

  return {
    redraw,
    destroy() {
      detachControls();
      window.removeEventListener("resize", onResize);
      container.innerHTML = "";
    },
  };
}
