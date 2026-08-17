/**
 * Pan/zoom viewport state for the canvas renderer. Owns only the
 * transform (offset + zoom) and the DOM event wiring that changes it --
 * drawing is entirely the caller's responsibility (canvasRenderer.js).
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export function createCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

/**
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {number} worldX
 * @param {number} worldY
 * @returns {{x: number, y: number}}
 */
export function worldToScreen(camera, worldX, worldY) {
  return { x: (worldX - camera.x) * camera.zoom, y: (worldY - camera.y) * camera.zoom };
}

/**
 * Centers the camera on a world-space bounding box, choosing the
 * largest zoom that fits it inside the viewport (clamped to MAX_ZOOM).
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {number} worldWidth
 * @param {number} worldHeight
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 */
export function fitToView(camera, worldWidth, worldHeight, viewportWidth, viewportHeight) {
  const zoom = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight, MAX_ZOOM);
  camera.zoom = Math.max(MIN_ZOOM, zoom);
  camera.x = worldWidth / 2 - viewportWidth / 2 / camera.zoom;
  camera.y = worldHeight / 2 - viewportHeight / 2 / camera.zoom;
}

/**
 * Wires mouse drag (pan), wheel (zoom-to-cursor), and click-without-drag
 * (onClick) on a canvas element. A "click" is a pointerdown/pointerup
 * pair that moved less than a few pixels -- anything more is treated as
 * a pan, not a cell selection.
 * @param {HTMLCanvasElement} canvas
 * @param {{x: number, y: number, zoom: number}} camera
 * @param {() => void} onChange - called after any camera mutation
 * @param {(screenX: number, screenY: number) => void} [onClick] - called with canvas-local coords on a click
 * @returns {() => void} cleanup function to remove listeners
 */
export function attachCameraControls(canvas, camera, onChange, onClick) {
  const CLICK_DRAG_THRESHOLD = 4;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  function onPointerDown(e) {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.abs(e.clientX - downX) > CLICK_DRAG_THRESHOLD || Math.abs(e.clientY - downY) > CLICK_DRAG_THRESHOLD) {
      moved = true;
    }
    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;
    onChange();
  }

  function onPointerUp(e) {
    if (dragging && !moved && onClick) {
      const rect = canvas.getBoundingClientRect();
      onClick(e.clientX - rect.left, e.clientY - rect.top);
    }
    dragging = false;
    canvas.style.cursor = "grab";
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const worldXBefore = camera.x + cursorX / camera.zoom;
    const worldYBefore = camera.y + cursorY / camera.zoom;

    const factor = Math.exp(-e.deltaY * 0.001);
    camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));

    camera.x = worldXBefore - cursorX / camera.zoom;
    camera.y = worldYBefore - cursorY / camera.zoom;
    onChange();
  }

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
  };
}
