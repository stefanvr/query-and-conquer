/**
 * Renderer-agnostic shape geometry distinguishing the 6 unit types at a
 * glance -- consumed by both the canvas map renderer
 * (src/render/shapeCanvas.js, unitLayer.js) and the DOM/SVG HUD icons
 * (src/ui/unitShapes.js, build buttons + garrison/queue slots), so both
 * draw from the exact same point data and can never visually drift
 * apart from each other.
 *
 * The type -> shape mapping is an arbitrary but fixed convention (the
 * design doc doesn't specify unit iconography): roughly, land/blocky ->
 * square, fast/pointed air -> triangle, heavier air -> hexagon,
 * elongated hull -> bar, simple utility -> circle, flagship/priciest ->
 * star.
 *
 * All polygon points are normalized to a unit circle (radius 1,
 * centered at the origin) -- consumers scale by their own desired
 * pixel radius. "circle" has no polygon entry; it's drawn directly
 * (ctx.arc / <circle>) by each consumer instead.
 */

export const UNIT_SHAPES = {
  tank: "square",
  fighter: "triangle",
  bomber: "hexagon",
  fregat: "bar",
  transporter: "circle",
  carrier: "star",
};

function polygonPoints(sides, radius, rotationDegrees) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI / 180) * (rotationDegrees + (360 / sides) * i);
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return points;
}

function starPoints(numPoints, outerRadius, innerRadius) {
  const points = [];
  for (let i = 0; i < numPoints * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / numPoints) * i - Math.PI / 2; // first point straight up
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return points;
}

/** @type {Record<string, [number, number][]>} shape name -> normalized [x, y] vertex list */
export const SHAPE_POLYGONS = {
  square: [
    [-0.75, -0.75],
    [0.75, -0.75],
    [0.75, 0.75],
    [-0.75, 0.75],
  ],
  triangle: polygonPoints(3, 1, -90), // point straight up
  hexagon: polygonPoints(6, 1, 0), // flat-top, matching the game's own hex tiles (src/render/hexGeometry.js)
  bar: [
    [-1, -0.32],
    [1, -0.32],
    [1, 0.32],
    [-1, 0.32],
  ],
  star: starPoints(5, 1, 0.45),
};
