// In-game map camera + viewport-clipped render — per implementation-spec.md §1 "In-game map
// render". Draws only cells inside the current viewport (padded a couple of cells for partial
// edge hexes); a full-map redraw would not hold an acceptable frame rate at Extra Large's
// 12,000 cells (tech-stack.md's Mobile & touch support). Pointer Events unify mouse and touch
// input in one listener set, per that same section's "one input-handling layer" requirement.
import { deserializeGrid } from "../map/map-serialize.js";
import { hexToPixel, hexCorners, pixelToHex } from "../map/hex-pixel.js";
import { PLAYER_COLOR_VARS } from "../state/game-state.js";

const MIN_HEX_SIZE = 4;
const MAX_HEX_SIZE = 32;
const DEFAULT_HEX_SIZE = 14;
const TAP_MOVE_THRESHOLD_PX = 6; // beyond this, a pointer gesture is a pan/drag, not a tap

const TERRAIN_VAR = {
  gras: "--t-gras",
  gravel: "--t-gravel",
  mountain: "--t-mountain",
  sand: "--t-sand",
  shallow: "--t-shallow",
  deep: "--t-deep",
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} mapData - parsed map JSON (width, height, rows)
 * @param {{ bases?: object[], players?: object[], selectedHex?: {col:number,row:number}|null,
 *   onSelectHex?: (col: number, row: number) => void }} [options]
 * @returns {{ draw: () => void, zoomIn: () => void, zoomOut: () => void, centerOn: (col:number,row:number) => void, destroy: () => void }}
 */
export function createMapCamera(canvas, mapData, options = {}) {
  const { bases = [], players = [], onSelectHex } = options;
  let selectedHex = options.selectedHex ?? null;

  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const ctx = canvas.getContext("2d");
  const camera = { x: 0, y: 0, hexSize: DEFAULT_HEX_SIZE };

  function baseAt(col, row) {
    return bases.find((b) => b.col === col && b.row === row);
  }

  function ownerColorVar(ownerId) {
    const player = players.find((p) => p.id === ownerId);
    return player ? PLAYER_COLOR_VARS[player.slot] : "--steel";
  }

  function drawBaseMarker(sx, sy, size, base) {
    const corners = hexCorners(sx, sy, size);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = cssVar(ownerColorVar(base.ownerId));
    ctx.stroke();

    // Plain-text status, per style-guide.md §8's phase-1 treatment.
    const label = base.inProgress ? `Building: ${base.inProgress.unitType}` : null;
    const spLabel = `${base.sp}/${base.maxSp} SP`;
    ctx.font = `${Math.max(11, size * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    const lineHeight = Math.max(10, size * 0.6);
    let ty = sy + size + lineHeight;
    for (const text of [spLabel, label].filter(Boolean)) {
      const padding = 3;
      const width = ctx.measureText(text).width + padding * 2;
      ctx.fillStyle = cssVar("--ink");
      ctx.fillRect(sx - width / 2, ty - lineHeight * 0.75, width, lineHeight);
      ctx.fillStyle = cssVar("--parchment");
      ctx.fillText(text, sx, ty);
      ty += lineHeight;
    }
  }

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
        ctx.fillStyle = cssVar(TERRAIN_VAR[grid.get(col, row)]);
        ctx.fill();

        if (selectedHex && selectedHex.col === col && selectedHex.row === row) {
          ctx.lineWidth = Math.max(1, size * 0.08);
          ctx.strokeStyle = "#FFFFFF";
          ctx.stroke();
        }

        const base = baseAt(col, row);
        if (base) drawBaseMarker(sx, sy, size, base);
      }
    }
  }

  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    draw();
  }

  function centerOn(col, row) {
    const mid = hexToPixel(col, row, camera.hexSize);
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

  function handleTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const worldX = clientX - rect.left + camera.x;
    const worldY = clientY - rect.top + camera.y;
    const { col, row } = pixelToHex(worldX, worldY, camera.hexSize);
    if (!grid.isInMap(col, row)) return;
    onSelectHex?.(col, row);
  }

  // --- Unified mouse + touch input (tech-stack.md's Mobile & touch support). ---
  const activePointers = new Map();
  let dragPointerId = null;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let totalMove = 0;
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
      downX = e.clientX;
      downY = e.clientY;
      totalMove = 0;
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
      totalMove += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    }
  }

  function onPointerEnd(e) {
    const wasSoleDragPointer = e.pointerId === dragPointerId && activePointers.size === 1;
    if (wasSoleDragPointer && totalMove < TAP_MOVE_THRESHOLD_PX) {
      handleTap(downX, downY);
    }
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
    if (options.centerOnCol !== undefined) centerOn(options.centerOnCol, options.centerOnRow);
    else centerOn(Math.floor(mapData.width / 2), Math.floor(mapData.height / 2));
    draw();
  });

  return {
    draw,
    zoomIn: () => zoomBy(1.25, canvas.width / 2, canvas.height / 2),
    zoomOut: () => zoomBy(1 / 1.25, canvas.width / 2, canvas.height / 2),
    centerOn,
    setSelectedHex(hex) {
      selectedHex = hex;
      draw();
    },
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
