// 2D helpers for the sketch editor (all values in mm, Y up).

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Points along an arc from a to b whose middle sits `s` mm to the left of the
// chord (the same sign rule the CAD engine uses for its sagitta arcs).
export function arcPoints(a, b, s, steps = 20) {
  const c = dist(a, b);
  if (Math.abs(s) < 0.01 || c < 1e-6) return [a, b];
  const dir = [(b[0] - a[0]) / c, (b[1] - a[1]) / c];
  const left = [-dir[1], dir[0]];
  const mid = [(a[0] + b[0]) / 2 + left[0] * s, (a[1] + b[1]) / 2 + left[1] * s];
  // Circle through a, mid, b.
  const r = (c * c) / (8 * Math.abs(s)) + Math.abs(s) / 2;
  const centerOffset = r - Math.abs(s);
  const sign = Math.sign(s);
  const center = [(a[0] + b[0]) / 2 - left[0] * sign * centerOffset, (a[1] + b[1]) / 2 - left[1] * sign * centerOffset];
  const angle = (p) => Math.atan2(p[1] - center[1], p[0] - center[0]);
  const a0 = angle(a);
  let am = angle(mid);
  let a1 = angle(b);
  // Unwrap so the sweep passes through the middle point.
  const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccw = norm(am - a0) < norm(a1 - a0);
  const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + (sweep * i) / steps;
    out.push([center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)]);
  }
  return out;
}

// Polyline approximation of an outline, for drawing it on screen.
export function outlinePath(shape) {
  if (shape.kind === "circle") {
    return Array.from({ length: 64 }, (_, i) => [shape.c[0] + shape.r * Math.cos((i / 64) * 2 * Math.PI), shape.c[1] + shape.r * Math.sin((i / 64) * 2 * Math.PI)]);
  }
  const out = [];
  const n = shape.pts.length;
  for (let i = 0; i < n; i++) {
    const a = shape.pts[i];
    const b = shape.pts[(i + 1) % n];
    const seg = arcPoints(a, b, (shape.bulge || [])[i] || 0);
    out.push(...seg.slice(0, -1));
  }
  return out;
}

export const toSvgPath = (pts, closed = true) => (pts.length ? `M${pts.map((p) => `${p[0]},${p[1]}`).join("L")}${closed ? "Z" : ""}` : "");

export const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : Math.round(v * 100) / 100);

// Snap the direction from `from` to `to` to multiples of 15 degrees.
export function snapAngle(from, to) {
  const d = dist(from, to);
  const a = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / (Math.PI / 12)) * (Math.PI / 12);
  return [from[0] + d * Math.cos(a), from[1] + d * Math.sin(a)];
}

export function boundsOf(shapes) {
  const pts = shapes.flatMap(outlinePath);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}
