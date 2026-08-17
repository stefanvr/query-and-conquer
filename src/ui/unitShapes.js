/**
 * DOM/SVG rendering of the per-unit-type shapes (src/units/unitShapes.js
 * owns the actual geometry -- this just builds small inline <svg>
 * icons from it for HUD buttons and garrison/queue slots). Canvas
 * rendering (the map itself) uses the same geometry via
 * src/render/shapeCanvas.js -- both draw from identical point data, so
 * they can't visually drift apart.
 */
import { UNIT_SHAPES, SHAPE_POLYGONS } from "../units/unitShapes.js";

export { UNIT_SHAPES };

const VIEWBOX_CENTER = 8;
const VIEWBOX_RADIUS = 6.5;

function shapeMarkup(shape, color) {
  if (shape === "circle") {
    return `<circle cx="${VIEWBOX_CENTER}" cy="${VIEWBOX_CENTER}" r="${VIEWBOX_RADIUS}" fill="${color}"/>`;
  }
  const points = SHAPE_POLYGONS[shape]
    .map(([x, y]) => `${VIEWBOX_CENTER + x * VIEWBOX_RADIUS},${VIEWBOX_CENTER + y * VIEWBOX_RADIUS}`)
    .join(" ");
  return `<polygon points="${points}" fill="${color}"/>`;
}

/**
 * @param {string} unitType
 * @param {{size?: number, color?: string}} [opts]
 * @returns {SVGSVGElement}
 */
export function createShapeIcon(unitType, { size = 14, color = "currentColor" } = {}) {
  const shape = UNIT_SHAPES[unitType] ?? "circle";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.style.flexShrink = "0";
  svg.innerHTML = shapeMarkup(shape, color);
  return svg;
}
