/**
 * Canvas drawing for the per-unit-type shapes (src/units/unitShapes.js).
 * Used by unitLayer.js to draw units on the map itself, not just the
 * HUD's build buttons/slots -- same shape geometry either way.
 */
import { UNIT_SHAPES, SHAPE_POLYGONS } from "../units/unitShapes.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} unitType
 * @param {number} cx - center x, screen space
 * @param {number} cy - center y, screen space
 * @param {number} radius - pixel radius to scale the shape to
 * @param {{fill?: string, stroke?: string, lineWidth?: number}} [opts]
 */
export function drawUnitShape(ctx, unitType, cx, cy, radius, { fill, stroke, lineWidth } = {}) {
  const shape = UNIT_SHAPES[unitType] ?? "circle";

  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else {
    const points = SHAPE_POLYGONS[shape];
    points.forEach(([x, y], i) => {
      const px = cx + x * radius;
      const py = cy + y * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth ?? 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
