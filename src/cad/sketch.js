// Turns a ProtoLab sketch (closed outlines in mm) into a solid by extruding
// or revolving it. Outlines inside another outline become holes.
import { draw, drawCircle } from "replicad";

function pointInPolygon([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A rough polygon of the outline, used only to work out which outlines are holes.
export function outlinePoints(shape) {
  if (shape.kind === "circle") {
    const [cx, cy] = shape.c;
    return Array.from({ length: 24 }, (_, i) => [cx + shape.r * Math.cos((i / 24) * 2 * Math.PI), cy + shape.r * Math.sin((i / 24) * 2 * Math.PI)]);
  }
  return shape.pts;
}

function drawOutline(shape) {
  if (shape.kind === "circle") return drawCircle(shape.r).translate(shape.c[0], shape.c[1]);
  const pts = shape.pts;
  const bulge = shape.bulge || [];
  let pen = draw(pts[0]);
  for (let i = 1; i <= pts.length; i++) {
    const end = pts[i % pts.length];
    const b = bulge[i - 1] || 0;
    if (i === pts.length) {
      if (Math.abs(b) > 0.01) pen = pen.sagittaArcTo(end, b);
      break;
    }
    pen = Math.abs(b) > 0.01 ? pen.sagittaArcTo(end, b) : pen.lineTo(end);
  }
  let d = pen.close();
  if (shape.radius > 0.05) d = d.fillet(shape.radius);
  return d;
}

// Depth of each outline = how many other outlines contain it. Even = solid, odd = hole.
export function profileDrawing(shapes) {
  const valid = shapes.filter((s) => (s.kind === "circle" ? s.r > 0.05 : s.pts?.length >= 3));
  if (!valid.length) throw new Error("Draw at least one closed outline first.");
  const outlines = valid.map(outlinePoints);
  const depth = valid.map((s, i) => outlines.reduce((n, o, j) => (j !== i && pointInPolygon(outlines[i][0], o) ? n + 1 : n), 0));
  const order = valid.map((s, i) => i).sort((a, b) => depth[a] - depth[b]);
  let result = null;
  for (const i of order) {
    let d;
    try {
      d = drawOutline(valid[i]);
    } catch {
      throw new Error("One of the outlines crosses itself or has a corner rounding that's too big.");
    }
    if (!result) result = d;
    else result = depth[i] % 2 ? result.cut(d) : result.fuse(d);
  }
  return result;
}

export function buildSketchSolid(p) {
  const drawing = profileDrawing(p.shapes || []);
  if (p.op === "revolve") {
    // The sketch's X is the distance from the axis and its Y is the height.
    const minX = Math.min(...(p.shapes || []).flatMap((s) => outlinePoints(s).map((q) => q[0])));
    if (minX < -0.001) throw new Error("For Revolve, keep the outline on the right side of the center line.");
    const angle = Math.min(360, Math.max(1, p.angle || 360));
    return drawing.sketchOnPlane("XZ").revolve([0, 0, 1], { angle });
  }
  return drawing.sketchOnPlane("XY").extrude(Math.max(0.2, p.height || 10));
}
