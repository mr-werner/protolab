// Builds one replicad solid per builder object, in the object's local frame:
// centered on X/Y, sitting on Z = 0. Placement (move/rotate) is applied separately.
import {
  makeBox,
  makeCylinder,
  makeSphere,
  drawCircle,
  drawPolysides,
  drawText,
  drawRoundedRectangle,
} from "replicad";
import { EDGE_TYPES } from "../objects.js";
import { buildSketchSolid } from "./sketch.js";

const EPS = 0.01;

function centered(shape) {
  const [[x0, y0, z0], [x1, y1]] = shape.boundingBox.bounds;
  return shape.translate(-(x0 + x1) / 2, -(y0 + y1) / 2, -z0);
}

function cone(bottomD, topD, h) {
  const r1 = Math.max(bottomD / 2, EPS);
  const r2 = Math.max(topD / 2, EPS);
  const base = drawCircle(r1).sketchOnPlane("XY");
  const top = drawCircle(r2).sketchOnPlane("XY", h);
  return base.loftWith(top);
}


// Rounds (fillet) or bevels (chamfer) every edge of the part.
function finishEdges(shape, p) {
  if (!p.edge || p.edge <= 0 || !p.edgeStyle || p.edgeStyle === "none") return shape;
  try {
    return p.edgeStyle === "bevel" ? shape.chamfer(p.edge) : shape.fillet(p.edge);
  } catch {
    throw new Error("The edge size is too big for this part. Try a smaller value.");
  }
}

export function buildShape(obj, fonts) {
  const shape = buildBase(obj, fonts);
  return EDGE_TYPES.has(obj.type) ? finishEdges(shape, obj.params) : shape;
}

function buildBase(obj, fonts) {
  const p = obj.params;
  switch (obj.type) {
    case "box": {
      const r = Math.min(p.radius || 0, p.w / 2 - EPS, p.d / 2 - EPS);
      if (r > 0.05) {
        return drawRoundedRectangle(p.w, p.d, r).sketchOnPlane("XY").extrude(p.h);
      }
      return makeBox([-p.w / 2, -p.d / 2, 0], [p.w / 2, p.d / 2, p.h]);
    }
    case "cylinder":
      return makeCylinder(p.d / 2, p.h, [0, 0, 0]);
    case "tube": {
      const outer = makeCylinder(p.d / 2, p.h, [0, 0, 0]);
      const id = Math.min(p.id, p.d - 0.4);
      if (id <= 0.1) return outer;
      return outer.cut(makeCylinder(id / 2, p.h + 2, [0, 0, -1]));
    }
    case "sphere":
      return makeSphere(p.d / 2).translate(0, 0, p.d / 2);
    case "cone":
      return cone(p.d1, p.d2, p.h);
    case "polygon":
      return drawPolysides(p.d / 2, Math.round(p.sides)).sketchOnPlane("XY").extrude(p.h);
    case "sketch":
      return buildSketchSolid(p);
    case "text": {
      const family = fonts.has(p.font) ? p.font : fonts.values().next().value;
      const text = (p.text || "").trim() || "Text";
      const shape = drawText(text, { fontSize: p.size, fontFamily: family }).sketchOnPlane("XY").extrude(p.depth);
      return centered(shape);
    }
    default:
      throw new Error(`Unknown shape: ${obj.type}`);
  }
}

// Applies the object's placement: mirror (local X) and scale, then rotate about X, then Y, then Z (degrees), then move.
export function place(shape, obj) {
  const [rx, ry, rz] = obj.rotation;
  const [x, y, z] = obj.position;
  let s = shape;
  if (obj.mirror) s = s.mirror("YZ", [0, 0, 0]);
  if (obj.scale && obj.scale !== 1) s = s.scale(obj.scale, [0, 0, 0]);
  if (rx) s = s.rotate(rx, [0, 0, 0], [1, 0, 0]);
  if (ry) s = s.rotate(ry, [0, 0, 0], [0, 1, 0]);
  if (rz) s = s.rotate(rz, [0, 0, 0], [0, 0, 1]);
  return s.translate(x, y, z);
}

export { centered };
