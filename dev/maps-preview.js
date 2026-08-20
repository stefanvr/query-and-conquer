// Dev-only maps preview — static render of a pre-generated map's terrain, per
// doc/implementation-spec.md §1 "Maps preview page (dev-only)". No pan/zoom/interaction; this is
// a visual check on generation output, not the real in-game camera (that's Stage 3).
import { deserializeGrid } from "../src/map/map-serialize.js";
import { hexToPixel, hexCorners } from "../src/map/hex-pixel.js";

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

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`);
  return res.json();
}

function populateSelect(select, index) {
  for (const entry of index) {
    const opt = document.createElement("option");
    opt.value = entry.file;
    opt.textContent = `${entry.size} / ${entry.type} / ${entry.shape} — ${entry.file}`;
    select.appendChild(opt);
  }
}

function renderMap(canvas, data) {
  const grid = deserializeGrid(data.width, data.height, data.rows);
  const hexSize = Math.max(2, Math.min(14, Math.floor(900 / data.width)));

  let maxX = 0;
  let maxY = 0;
  for (const { col, row } of grid.cells()) {
    const { x, y } = hexToPixel(col, row, hexSize);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  canvas.width = maxX + hexSize * 2;
  canvas.height = maxY + hexSize * 2;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const { col, row } of grid.cells()) {
    const { x, y } = hexToPixel(col, row, hexSize);
    const corners = hexCorners(x + hexSize, y + hexSize, hexSize);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = terrainColor(grid.get(col, row));
    ctx.fill();
  }
}

function renderMeta(el, entry, data) {
  el.textContent =
    `size: ${data.size}  type: ${data.type}  shape: ${data.shape}  ` +
    `dimensions: ${data.width}x${data.height}  seed: ${data.seed}  file: ${entry.file}`;
}

async function init() {
  const select = document.querySelector("#map-select");
  const canvas = document.querySelector("#map-canvas");
  const meta = document.querySelector("#map-meta");

  const index = await loadJSON("../assets/maps/index.json");
  populateSelect(select, index);

  async function showSelected() {
    const entry = index[select.selectedIndex];
    const data = await loadJSON(`../assets/maps/${entry.file}`);
    renderMap(canvas, data);
    renderMeta(meta, entry, data);
  }

  select.addEventListener("change", showSelected);
  if (index.length > 0) showSelected();
}

init();
