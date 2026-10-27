// Multi-part operations (mirror, align, repeat, resize). Pure functions over the
// parts list so they're easy to undo and to test.
import * as THREE from "three";
import { newId } from "../objects.js";

const DEG = Math.PI / 180;
const round = (v) => Math.round(v * 1000) / 1000;

function rotationMatrix(rot) {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, "ZYX"));
}

function eulerFromMatrix(m) {
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const e = new THREE.Euler().setFromQuaternion(q, "ZYX");
  return [e.x, e.y, e.z].map((r) => round(r / DEG) || 0);
}

// Reflects parts across the plane through `center` that is normal to `axis` (0, 1, 2).
// The shape itself is mirrored too (text reads backwards), like in any CAD program.
export function mirrorParts(list, ids, axis, center) {
  const sel = new Set(ids);
  const flip = new THREE.Matrix4().makeScale(axis === 0 ? -1 : 1, axis === 1 ? -1 : 1, axis === 2 ? -1 : 1);
  const localX = new THREE.Matrix4().makeScale(-1, 1, 1);
  return list.map((o) => {
    if (!sel.has(o.id)) return o;
    const rot = flip.clone().multiply(rotationMatrix(o.rotation)).multiply(localX);
    const position = o.position.map((v, k) => (k === axis ? round(2 * center - v) : v));
    return { ...o, position, rotation: eulerFromMatrix(rot), mirror: !o.mirror };
  });
}

// Moves parts so their min, center or max edges line up along one axis.
export function alignParts(list, boxes, axis, where) {
  const ids = [...boxes.keys()];
  if (ids.length < 2) return list;
  const mins = ids.map((id) => boxes.get(id).min.getComponent(axis));
  const maxs = ids.map((id) => boxes.get(id).max.getComponent(axis));
  const target = where === "min" ? Math.min(...mins) : where === "max" ? Math.max(...maxs) : (Math.min(...mins) + Math.max(...maxs)) / 2;
  return list.map((o) => {
    const b = boxes.get(o.id);
    if (!b) return o;
    const current = where === "min" ? b.min.getComponent(axis) : where === "max" ? b.max.getComponent(axis) : (b.min.getComponent(axis) + b.max.getComponent(axis)) / 2;
    const position = [...o.position];
    position[axis] = round(position[axis] + target - current);
    return { ...o, position };
  });
}

// Copies the parts in a straight line. `step` is the offset between copies (mm).
export function linearRepeat(list, ids, count, step) {
  const sel = list.filter((o) => ids.includes(o.id));
  const copies = [];
  for (let i = 1; i < count; i++) {
    for (const o of sel) {
      copies.push({ ...structuredClone(o), id: newId(), group: null, position: o.position.map((v, k) => round(v + step[k] * i)) });
    }
  }
  return { list: [...list, ...copies], newIds: copies.map((c) => c.id) };
}

// Copies the parts around a vertical axis through `center` ([x, y]).
export function circularRepeat(list, ids, count, totalAngle, center) {
  const sel = list.filter((o) => ids.includes(o.id));
  const full = Math.abs(totalAngle) >= 359.999;
  const stepDeg = full ? totalAngle / count : totalAngle / Math.max(count - 1, 1);
  const copies = [];
  for (let i = 1; i < count; i++) {
    const a = stepDeg * i * DEG;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const o of sel) {
      const dx = o.position[0] - center[0];
      const dy = o.position[1] - center[1];
      copies.push({
        ...structuredClone(o),
        id: newId(),
        group: null,
        position: [round(center[0] + dx * cos - dy * sin), round(center[1] + dx * sin + dy * cos), o.position[2]],
        rotation: [o.rotation[0], o.rotation[1], round(o.rotation[2] + stepDeg * i)],
      });
    }
  }
  return { list: [...list, ...copies], newIds: copies.map((c) => c.id) };
}

// Turns a resize (per-axis factors in the part's own frame) into new sizes.
export function resizePart(o, [fx, fy, fz]) {
  const p = { ...o.params };
  const xy = (fx + fy) / 2;
  const all = (fx + fy + fz) / 3;
  const r = (v) => Math.max(0.1, round(v));
  switch (o.type) {
    case "box":
      p.w = r(p.w * fx);
      p.d = r(p.d * fy);
      p.h = r(p.h * fz);
      p.radius = Math.min(p.radius || 0, p.w / 2, p.d / 2);
      break;
    case "cylinder":
    case "polygon":
      p.d = r(p.d * xy);
      p.h = r(p.h * fz);
      break;
    case "tube":
      p.d = r(p.d * xy);
      p.id = r(p.id * xy);
      p.h = r(p.h * fz);
      break;
    case "cone":
      p.d1 = round(p.d1 * xy);
      p.d2 = round(p.d2 * xy);
      p.h = r(p.h * fz);
      break;
    case "sphere":
      p.d = r(p.d * all);
      break;
    case "text":
      p.size = r(p.size * xy);
      p.depth = r(p.depth * fz);
      break;
    case "sketch": {
      // Extrude: sketch X/Y are the part's X/Y. Revolve: sketch X is the radius and Y the height.
      const [sx, sy] = p.op === "revolve" ? [xy, fz] : [fx, fy];
      const k = (sx + sy) / 2;
      p.shapes = (p.shapes || []).map((s) =>
        s.kind === "circle"
          ? { ...s, c: [round(s.c[0] * sx), round(s.c[1] * sy)], r: r(s.r * k) }
          : { ...s, pts: s.pts.map(([x, y]) => [round(x * sx), round(y * sy)]), bulge: (s.bulge || []).map((b) => round(b * k)), radius: round((s.radius || 0) * Math.min(sx, sy)) }
      );
      if (p.op !== "revolve") p.height = r((p.height || 10) * fz);
      break;
    }
    case "import":
      return { ...o, scale: round((o.scale || 1) * all) };
    default:
      break;
  }
  if (p.edge) p.edge = round(p.edge * Math.min(fx, fy, fz));
  return { ...o, params: p };
}
