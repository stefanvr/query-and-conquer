// In-game map camera + viewport-clipped render — per implementation-spec.md §1 "In-game map
// render". Draws only cells inside the current viewport (padded a couple of cells for partial
// edge hexes); a full-map redraw would not hold an acceptable frame rate at Extra Large's
// 12,000 cells (tech-stack.md's Mobile & touch support). Pointer Events unify mouse and touch
// input in one listener set, per that same section's "one input-handling layer" requirement.
import { deserializeGrid } from "../map/map-serialize.js";
import { hexToPixel, hexCorners } from "../map/hex-pixel.js";

const MIN_HEX_SIZE = 4;
const MAX_HEX_SIZE = 32;
const DEFAULT_HEX_SIZE = 14;

const TERRAIN_VAR = {
  gras: "--t-gras",
  gravel: "--t-gravel",
  mountain: "--t-mountain",
  sand: "--t-sand",
  shallow: "--t-shallow",
  deep: "--t-deep",
};

function terrainColor(terrain) {
  return getComputedStyle(document.documentElement).getPropertyValue(TERRAIN_VAR[terrain]).trim();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} mapData - parsed map JSON (width, height, rows)
 * @returns {{ draw: () => void, zoomIn: () => void, zoomOut: () => void, destroy: () => void }}
 */
export function createMapCamera(canvas, mapData) {
  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const ctx = canvas.getContext("2d");
  const camera = { x: 0, y: 0, hexSize: DEFAULT_HEX_SIZE };

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = camera.hexSize;
    const colStep = size * 1.5;
    const rowStep = size * Math.sqrt(3);
    const pad = 2;

    const minCol = Math.max(0, Math.floor(camera.x / colStep) - pad);
    const maxCol = Math.min(mapData.width - 1, Math.ceil((camera.x + canvas.width) / colStep) + pad);
    const minRow = Math.max(0, Math.floor(camera.y / rowStep) - pad);
    const maxRow = Math.min(mapData.height - 1, Math.ceil((camera.y + canvas.height) / rowStep) + pad);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        if (!grid.isInMap(col, row)) continue;
        const { x, y } = hexToPixel(col, row, size);
        const sx = x - camera.x;
        const sy = y - camera.y;
        const corners = hexCorners(sx, sy, size);
        ctx.beginPath();
        corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = terrainColor(grid.get(col, row));
        ctx.fill();
      }
    }
  }

  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    draw();
  }

  function centerOnMap() {
    const mid = hexToPixel(Math.floor(mapData.width / 2), Math.floor(mapData.height / 2), camera.hexSize);
    camera.x = mid.x - canvas.width / 2;
    camera.y = mid.y - canvas.height / 2;
  }

  function pan(dx, dy) {
    camera.x -= dx;
    camera.y -= dy;
    draw();
  }

  /** Zooms by `factor`, keeping the world point under (focalX, focalY) visually stable. */
  function zoomBy(factor, focalX, focalY) {
    const oldSize = camera.hexSize;
    const newSize = Math.max(MIN_HEX_SIZE, Math.min(MAX_HEX_SIZE, oldSize * factor));
    if (newSize === oldSize) return;
    const worldX = camera.x + focalX;
    const worldY = camera.y + focalY;
    const scale = newSize / oldSize;
    camera.x = worldX * scale - focalX;
    camera.y = worldY * scale - focalY;
    camera.hexSize = newSize;
    draw();
  }

  // --- Unified mouse + touch input (tech-stack.md's Mobile & touch support). ---
  const activePointers = new Map();
  let dragPointerId = null;
  let lastX = 0;
  let lastY = 0;
  let pinchStartDist = null;
  let pinchStartSize = null;

  canvas.style.touchAction = "none";

  function onPointerDown(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (activePointers.size === 1) {
      dragPointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (activePointers.size === 2) {
      dragPointerId = null;
      const pts = [...activePointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartSize = camera.hexSize;
    }
  }

  function onPointerMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStartDist) {
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const targetSize = Math.max(MIN_HEX_SIZE, Math.min(MAX_HEX_SIZE, pinchStartSize * (dist / pinchStartDist)));
      zoomBy(targetSize / camera.hexSize, midX, midY);
    } else if (e.pointerId === dragPointerId) {
      pan(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  }

  function onPointerEnd(e) {
    activePointers.delete(e.pointerId);
    if (e.pointerId === dragPointerId) dragPointerId = null;
    if (activePointers.size < 2) pinchStartDist = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", resize);

  // Deferred to the next frame: this canvas is typically sized right after its screen becomes
  // visible (main.js's showScreen), and reading clientWidth/clientHeight in that same
  // synchronous tick can still see the pre-layout size in some cases.
  requestAnimationFrame(() => {
    resize();
    centerOnMap();
    draw();
  });

  return {
    draw,
    zoomIn: () => zoomBy(1.25, canvas.width / 2, canvas.height / 2),
    zoomOut: () => zoomBy(1 / 1.25, canvas.width / 2, canvas.height / 2),
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resize);
    },
  };
}
