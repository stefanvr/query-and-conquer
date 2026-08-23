// In-game map camera + viewport-clipped render — per implementation-spec.md §1 "In-game map
// render". Draws only cells inside the current viewport (padded a couple of cells for partial
// edge hexes); a full-map redraw would not hold an acceptable frame rate at Extra Large's
// 12,000 cells (tech-stack.md's Mobile & touch support). Pointer Events unify mouse and touch
// input in one listener set, per that same section's "one input-handling layer" requirement.
//
// draw() is two passes — every terrain tile first, then every base/unit marker+label on top —
// so a marker/label is never painted over by a later-drawn terrain tile (they used to be
// interleaved in one pass, per-cell, which let that happen near a hex's bottom edge).
import { deserializeGrid } from "../map/map-serialize.js";
import { hexToPixel, hexCorners, pixelToHex } from "../map/hex-pixel.js";
import { offsetKey } from "../map/hex-coords.js";
import { PLAYER_COLOR_VARS } from "../state/game-state.js";
import { UNIT_TYPES } from "../state/unit-types.js";

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

// Unit token shape per style-guide.md §9's per-unit-type table.
export const UNIT_SHAPES = {
  tank: "square",
  fighter: "triangle",
  bomber: "hexagon",
  fregat: "circle",
  transporter: "bar",
  carrier: "star",
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Traces `shape`'s outline into the current path, centered at (sx, sy) with the given nominal
 * radius (style-guide.md §9) — doesn't fill/stroke; callers do that afterward so the same trace
 * serves both a normal token and the dashed/translucent pending-unload preview. Unrecognized
 * shapes fall back to a circle rather than drawing nothing. */
function traceShape(ctx, shape, sx, sy, radius) {
  ctx.beginPath();
  switch (shape) {
    case "square": {
      const s = radius * Math.SQRT2; // same nominal radius as a circle token
      ctx.rect(sx - s / 2, sy - s / 2, s, s);
      break;
    }
    case "triangle":
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const x = sx + radius * Math.cos(angle);
        const y = sy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = sx + radius * Math.cos(angle);
        const y = sy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case "bar": {
      const w = radius * 2;
      const h = radius * 0.6;
      ctx.rect(sx - w / 2, sy - h / 2, w, h);
      break;
    }
    case "star": {
      const inner = radius * 0.45;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? radius : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = sx + r * Math.cos(angle);
        const y = sy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case "circle":
    default:
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      break;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} mapData - parsed map JSON (width, height, rows)
 * @param {{ bases?: object[], units?: object[], players?: object[], viewerId?: number|null,
 *   fog?: {exploredCells: Set<string>, visibleCells: Set<string>}|null, revealAll?: boolean,
 *   selectedHex?: {col:number,row:number}|null, onSelectHex?: (col: number, row: number) => void }} [options]
 *   `revealAll` (implementation-spec.md §8's End screen) shows every base's own label, bypassing
 *   the enemy-base non-disclosure rule that `viewerId` alone enforces.
 * @returns {{ draw: () => void, zoomIn: () => void, zoomOut: () => void, centerOn: (col:number,row:number) => void,
 *   setSelectedHex: (hex: {col:number,row:number}|null) => void,
 *   setActionTargets: (targets: {move?: object[], attack?: object[], claim?: object[]}) => void,
 *   setVisibleState: (visible: {bases: object[], units: object[], fog?: object|null}) => void,
 *   setPendingUnload: (preview: {col:number,row:number,ownerId:number,unitType:string,targets:{col:number,row:number}[]}|null) => void,
 *   setPendingLoadTargets: (targets: {col:number,row:number}[]|null) => void,
 *   destroy: () => void }}
 */
export function createMapCamera(canvas, mapData, options = {}) {
  const { players = [], viewerId = null, revealAll = false } = options;
  // Fog of war (implementation-spec.md §5): bases/units are already filtered by the caller's own
  // getVisibleState before reaching here, and reassigned wholesale on every change via
  // setVisibleState, rather than the camera re-deriving them itself — same live-reference pattern
  // as before fog existed, just refreshed explicitly instead of held by reference forever.
  let bases = options.bases ?? [];
  let units = options.units ?? [];
  let fog = options.fog ?? null; // { exploredCells, visibleCells } (Set<string> of "col,row"), or null when fogOfWar is off
  const onSelectHex = options.onSelectHex;
  let selectedHex = options.selectedHex ?? null;

  const grid = deserializeGrid(mapData.width, mapData.height, mapData.rows);
  const ctx = canvas.getContext("2d");
  const camera = { x: 0, y: 0, hexSize: DEFAULT_HEX_SIZE };
  // Unload destination picker (implementation-spec.md §1): while set, draws `unitType`/`ownerId`
  // as a preview token on top of (col, row) — the base/boat being unloaded from — and highlights
  // every hex in `targets` as a selectable destination. Rendering-only; game-screen.js owns the
  // actual click-to-cancel/click-to-confirm interaction.
  let pendingUnload = null;
  // Load destination picker (implementation-spec.md §1): the loading unit is already drawn
  // normally (it hasn't moved), so this only needs the same target-hex highlight, no preview
  // token of its own.
  let pendingLoadTargets = null;
  // What the currently selected unit could do, per hex (implementation-spec.md §1's Movement and
  // Attack & claim targeting): `move` is everywhere it can reach this turn, `attack`/`claim` the
  // hexes where a tap commits to that action. Sets of `offsetKey`s, so drawing is a lookup per
  // hex rather than a scan per overlay. Rendering-only, like the pickers above.
  let actionTargets = { move: new Set(), attack: new Set(), claim: new Set() };

  function baseAt(col, row) {
    return bases.find((b) => b.col === col && b.row === row);
  }

  function ownerColorVar(ownerId) {
    const player = players.find((p) => p.id === ownerId);
    return player ? PLAYER_COLOR_VARS[player.slot] : "--steel";
  }

  /** Draws a small ink-backed text label under (cx, startY), returning the y just past it —
   * shared by base and unit markers so both use the same style-guide.md §8 treatment. */
  function drawLabelLine(cx, y, size, text) {
    const lineHeight = Math.max(10, size * 0.6);
    const padding = 3;
    const width = ctx.measureText(text).width + padding * 2;
    ctx.fillStyle = cssVar("--ink");
    ctx.fillRect(cx - width / 2, y - lineHeight * 0.75, width, lineHeight);
    ctx.fillStyle = cssVar("--parchment");
    ctx.fillText(text, cx, y);
    return y + lineHeight;
  }

  function drawBaseMarker(sx, sy, size, base) {
    const corners = hexCorners(sx, sy, size);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = Math.max(2, size * 0.18);
    ctx.strokeStyle = cssVar(ownerColorVar(base.ownerId));
    ctx.stroke();

    // An enemy-owned base's marker has no label at all — it discloses no interior state
    // (implementation-spec.md §1/§2/§4), same as its panel. `revealAll` (the End screen's own
    // full-map-reveal mode, §8) bypasses this — the game is over, there's nothing left to hide.
    if (!revealAll && base.ownerId !== viewerId) return;
    ctx.font = `${Math.max(11, size * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    let ty = sy + size + Math.max(10, size * 0.6);
    ty = drawLabelLine(sx, ty, size, `${base.sp}/${base.maxSp} SP`);
    if (base.inProgress) drawLabelLine(sx, ty, size, `Building: ${base.inProgress.unitType}`);
  }

  function drawUnitToken(sx, sy, size, unit, isSelected) {
    const radius = size * 0.4;
    traceShape(ctx, UNIT_SHAPES[unit.unitType], sx, sy, radius);
    ctx.fillStyle = cssVar(ownerColorVar(unit.ownerId));
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = isSelected ? "#FFFFFF" : "rgba(0,0,0,0.5)";
    ctx.stroke();

    ctx.font = `${Math.max(11, size * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    let ty = sy + radius + Math.max(10, size * 0.6);
    ty = drawLabelLine(sx, ty, size, `${unit.sp}/${unit.maxSp} SP`);
    const maxActions = UNIT_TYPES[unit.unitType].actionsPerTurn;
    drawLabelLine(sx, ty, size, `${unit.remainingActions}/${maxActions} AP`);
  }

  /** The previewed unit's own token — same shape/owner-color as a placed unit (drawUnitToken),
   * but half-opacity with a dashed stroke so it reads as "not placed yet," and no AP label since
   * the unit isn't a field unit until the player confirms a destination. */
  function drawPendingUnitToken(sx, sy, size, ownerId, unitType) {
    const radius = size * 0.4;
    traceShape(ctx, UNIT_SHAPES[unitType], sx, sy, radius);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = cssVar(ownerColorVar(ownerId));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeStyle = "#FFFFFF";
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Fog of war: pre-fill the whole viewport --ink before drawing any tile, so an off-map cell
    // (never reached by the per-cell loop below, since it only iterates in-map cells) reads
    // identically to an unexplored in-map one. Without this, the canvas's own olive background
    // showed through off-map, giving away the map's shape/edges and the viewer's own position
    // relative to it, through completely unexplored territory (style-guide.md §7's unexplored
    // state is supposed to disclose nothing at all).
    if (fog) {
      ctx.fillStyle = cssVar("--ink");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const size = camera.hexSize;

    /** Tints the hex path currently traced, per style-guide.md §8's overlay table. `stroked`
     * marks the overlays that commit to something irreversible (attack, claim). */
    const fillOverlay = (colorVar, alpha, stroked = false) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cssVar(colorVar);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!stroked) return;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.strokeStyle = cssVar(colorVar);
      ctx.stroke();
    };

    const colStep = size * 1.5;
    const rowStep = size * Math.sqrt(3);
    const pad = 2;

    const minCol = Math.max(0, Math.floor(camera.x / colStep) - pad);
    const maxCol = Math.min(mapData.width - 1, Math.ceil((camera.x + canvas.width) / colStep) + pad);
    const minRow = Math.max(0, Math.floor(camera.y / rowStep) - pad);
    const maxRow = Math.min(mapData.height - 1, Math.ceil((camera.y + canvas.height) / rowStep) + pad);

    // Pass 1: every terrain tile (+ the selection outline, part of the tile itself).
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

        // Fog of war, three states per style-guide.md §7: unexplored -- nothing drawn at all (the
        // whole-viewport --ink pre-fill above already covers it, same as an off-map cell, and it
        // can't be selected/targeted either); explored-not-visible -- terrain color dimmed 30%;
        // currently visible -- terrain color at full value (today's unchanged look).
        const key = offsetKey(col, row);
        if (fog && !fog.exploredCells.has(key)) continue;
        ctx.fillStyle = cssVar(TERRAIN_VAR[grid.get(col, row)]);
        ctx.fill();
        if (fog && !fog.visibleCells.has(key)) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.30)";
          ctx.fill();
        }

        // Hex overlays, style-guide.md §8's table. Drawn ambient-first so an actionable target
        // always reads over the move-range wash it sits inside.
        if (actionTargets.move.has(key)) fillOverlay("--signal", 0.25);
        if (actionTargets.claim.has(key)) fillOverlay("--signal", 0.45, true);
        if (actionTargets.attack.has(key)) fillOverlay("--rust", 0.4, true);

        const isPickerTarget =
          pendingUnload?.targets.some((t) => t.col === col && t.row === row) ||
          pendingLoadTargets?.some((t) => t.col === col && t.row === row);
        if (isPickerTarget) fillOverlay("--signal", 0.35);

        // Selection outline last, so it's never tinted by an overlay drawn on top of it.
        if (selectedHex && selectedHex.col === col && selectedHex.row === row) {
          ctx.lineWidth = Math.max(1, size * 0.08);
          ctx.strokeStyle = "#FFFFFF";
          ctx.stroke();
        }
      }
    }

    // Pass 2: base and unit markers + labels, on top of every tile so nothing overwrites them.
    for (const base of bases) {
      if (base.col < minCol || base.col > maxCol || base.row < minRow || base.row > maxRow) continue;
      const { x, y } = hexToPixel(base.col, base.row, size);
      drawBaseMarker(x - camera.x, y - camera.y, size, base);
    }
    for (const unit of units) {
      if (unit.col < minCol || unit.col > maxCol || unit.row < minRow || unit.row > maxRow) continue;
      const { x, y } = hexToPixel(unit.col, unit.row, size);
      const isSelected = Boolean(selectedHex && selectedHex.col === unit.col && selectedHex.row === unit.row);
      drawUnitToken(x - camera.x, y - camera.y, size, unit, isSelected);
    }
    if (pendingUnload) {
      const { x, y } = hexToPixel(pendingUnload.col, pendingUnload.row, size);
      drawPendingUnitToken(x - camera.x, y - camera.y, size, pendingUnload.ownerId, pendingUnload.unitType);
    }
  }

  let hasSized = false;

  /** Re-measures the canvas, keeping whatever was at the centre of the viewport still centred.
   * The camera stores a top-left offset, so resizing without this pins the top-left corner and
   * everything appears to slide — which happens every time a selection panel opens or closes
   * beside the map, since that changes the canvas's width. Anchoring the centre instead means the
   * thing you were looking at stays where you were looking. */
  function resize() {
    const previousCentre = hasSized
      ? { x: camera.x + canvas.width / 2, y: camera.y + canvas.height / 2 }
      : null;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    hasSized = true;
    if (previousCentre) {
      camera.x = previousCentre.x - canvas.width / 2;
      camera.y = previousCentre.y - canvas.height / 2;
    }
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
  // The canvas also changes size without the window doing so — a selection panel opening or
  // closing beside it takes space out of the row. A window resize listener never hears about that,
  // and a stale canvas.width silently misplaces every hex, so hit-testing lands on the wrong cell.
  // Observing the element itself catches every cause rather than the one we happened to think of.
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);

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
    /** Re-measure now rather than waiting for the ResizeObserver, which fires asynchronously.
     * Callers that change the canvas's size themselves — opening or closing a panel beside it —
     * should use this: between the layout change and the observer firing, the canvas's stored size
     * is stale, so a tap in that window hit-tests against the previous geometry and selects the
     * wrong hex. */
    resize,
    setSelectedHex(hex) {
      selectedHex = hex;
      draw();
    },
    /** What the selected unit can do, per hex (implementation-spec.md §1) — arrays of
     * {col,row}, or null/omitted for none. */
    setActionTargets({ move = [], attack = [], claim = [] } = {}) {
      const toKeys = (cells) => new Set(cells.map((c) => offsetKey(c.col, c.row)));
      actionTargets = { move: toKeys(move), attack: toKeys(attack), claim: toKeys(claim) };
      draw();
    },
    setVisibleState({ bases: newBases, units: newUnits, fog: newFog = null }) {
      bases = newBases;
      units = newUnits;
      fog = newFog;
      draw();
    },
    setPendingUnload(preview) {
      pendingUnload = preview;
      draw();
    },
    setPendingLoadTargets(targets) {
      pendingLoadTargets = targets;
      draw();
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
    },
  };
}
