import { useEffect, useMemo, useRef, useState } from "react";
import { UNITS, fmtLen } from "../units.js";
import { NumberField } from "./fields.jsx";
import { arcPoints, boundsOf, dist, outlinePath, snapAngle, snapTo, toSvgPath } from "./sketchGeom.js";

// Full-screen 2D editor: draw closed outlines, then extrude or revolve them
// into a part. Everything is stored in mm with Y pointing up.

const TOOLS = [
  ["select", "Select", "V"],
  ["line", "Line", "L"],
  ["rect", "Rectangle", "R"],
  ["circle", "Circle", "C"],
];

const HINTS = {
  select: "Click an outline to edit it. Drag the dots to reshape. Drag empty space to pan, scroll to zoom.",
  line: "Click to add points. Click the first point (or double-click) to close the outline. Hold Shift for 15° steps. Esc cancels.",
  rect: "Click one corner, then the opposite corner. Or type the size on the right.",
  circle: "Click the center, then click again to set the size. Or type it on the right.",
};

export const PLANES = {
  top: { label: "Top (flat on the plate)", rotation: [0, 0, 0] },
  front: { label: "Front (standing up)", rotation: [90, 0, 0] },
  side: { label: "Side (standing up)", rotation: [90, 0, 90] },
};

const round = (v) => Math.round(v * 1000) / 1000;
const roundPt = (p) => [round(p[0]), round(p[1])];
const NICE = [1, 2, 5];

// Grid spacing in mm: a round number in the display unit, at least `minPx` apart on screen.
function gridStep(unit, scale, minPx = 12) {
  const f = UNITS[unit].factor;
  for (let k = -3; k < 6; k++) {
    for (const n of NICE) {
      const step = n * 10 ** k;
      if (step * f * scale >= minPx) return step * f;
    }
  }
  return 100 * f;
}

export default function SketchEditor({ initial, unit, snapStep, isNew, onCancel, onDone }) {
  const [shapes, setShapes] = useState(() => structuredClone(initial?.shapes || []));
  const [past, setPast] = useState([]);
  const [sel, setSel] = useState(null);
  const [tool, setTool] = useState(initial?.shapes?.length ? "select" : "line");
  const [draft, setDraft] = useState([]);
  const [hover, setHover] = useState(null);
  const [op, setOp] = useState(initial?.op || "extrude");
  const [height, setHeight] = useState(initial?.height ?? 10);
  const [angle, setAngle] = useState(initial?.angle ?? 360);
  const [plane, setPlane] = useState("top");
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ cx: 0, cy: 0, s: 3 });
  // Typed-in values for the current tool, in mm.
  const [typed, setTyped] = useState({ len: 20, ang: 0, w: 40, h: 20, d: 20, x: 0, y: 0 });
  const svgRef = useRef(null);
  const drag = useRef(null);

  const f = UNITS[unit].factor;
  const snapMm = snapStep ? snapStep * f : 0;
  const fmt = (mm) => fmtLen(mm, unit);
  const u = UNITS[unit].label;

  // Fit the drawing (or a 120 mm square) in the canvas.
  useEffect(() => {
    const el = svgRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      return r;
    };
    const r = measure();
    const b = boundsOf(shapes);
    const span = b ? Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 20) * 1.4 : 120;
    setView({ cx: b ? (b.min[0] + b.max[0]) / 2 : 0, cy: b ? (b.min[1] + b.max[1]) / 2 : 0, s: Math.min(r.width, r.height) / span });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toScreen = (p) => [size.w / 2 + (p[0] - view.cx) * view.s, size.h / 2 - (p[1] - view.cy) * view.s];
  const toMm = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [view.cx + (e.clientX - r.left - size.w / 2) / view.s, view.cy - (e.clientY - r.top - size.h / 2) / view.s];
  };

  const allPoints = useMemo(() => shapes.flatMap((s) => (s.kind === "circle" ? [s.c] : s.pts)), [shapes]);

  // Snap to nearby existing points first, then to the grid. Shift locks the angle.
  const snapPoint = (raw, e, from) => {
    const near = [...allPoints, ...draft].find((q) => dist(q, raw) * view.s < 9);
    if (near) return near;
    if (e?.shiftKey && from) {
      const p = snapAngle(from, raw);
      const d = snapTo(dist(from, p), snapMm);
      const a = Math.atan2(p[1] - from[1], p[0] - from[0]);
      return roundPt([from[0] + d * Math.cos(a), from[1] + d * Math.sin(a)]);
    }
    return roundPt([snapTo(raw[0], snapMm), snapTo(raw[1], snapMm)]);
  };

  const change = (next) => {
    setPast((p) => [...p.slice(-60), shapes]);
    setShapes(next);
  };
  const undo = () => {
    if (draft.length) return setDraft(draft.slice(0, -1));
    if (!past.length) return;
    setShapes(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setSel(null);
  };
  const addShape = (s) => {
    change([...shapes, s]);
    setSel(shapes.length);
  };
  const updateShape = (i, patch, live) => {
    const next = shapes.map((s, j) => (j === i ? { ...s, ...patch } : s));
    if (live) setShapes(next);
    else change(next);
  };
  const deleteShape = (i) => {
    change(shapes.filter((_, j) => j !== i));
    setSel(null);
  };

  const closeDraft = () => {
    if (draft.length >= 3) addShape({ kind: "poly", pts: draft, bulge: draft.map(() => 0), radius: 0 });
    setDraft([]);
  };

  const pickTool = (t) => {
    setTool(t);
    setDraft([]);
    if (t !== "select") setSel(null);
  };

  // Keyboard: tools, undo, delete, escape. The builder's own shortcuts are off while this is open.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.stopPropagation();
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape") {
        if (draft.length) setDraft([]);
        else setSel(null);
      } else if (e.key === "Enter" && tool === "line") closeDraft();
      else if ((e.key === "Delete" || e.key === "Backspace") && sel != null) {
        e.preventDefault();
        deleteShape(sel);
      } else {
        const t = TOOLS.find(([, , key]) => key.toLowerCase() === k);
        if (t && !e.ctrlKey && !e.metaKey) pickTool(t[0]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const onPointerDown = (e) => {
    if (e.button === 1 || e.button === 2 || (tool === "select" && !e.target.dataset.hit)) {
      if (tool === "select" && e.button === 0) setSel(null);
      drag.current = { kind: "pan", start: [e.clientX, e.clientY], view0: view };
      svgRef.current.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const raw = toMm(e);
    if (tool === "select") {
      const i = Number(e.target.dataset.hit);
      setSel(i);
      return;
    }
    const last = draft[draft.length - 1];
    const p = snapPoint(raw, e, last);
    if (tool === "line") {
      if (draft.length >= 3 && dist(p, draft[0]) * view.s < 9) return closeDraft();
      if (last && dist(p, last) < 0.01) return;
      setDraft([...draft, p]);
    } else if (tool === "rect") {
      if (!draft.length) return setDraft([p]);
      const a = draft[0];
      if (Math.abs(p[0] - a[0]) > 0.05 && Math.abs(p[1] - a[1]) > 0.05) {
        const pts = [a, [p[0], a[1]], p, [a[0], p[1]]];
        addShape({ kind: "poly", pts, bulge: [0, 0, 0, 0], radius: 0 });
      }
      setDraft([]);
    } else if (tool === "circle") {
      if (!draft.length) return setDraft([p]);
      const r = round(snapMm ? Math.max(snapMm, snapTo(dist(draft[0], raw), snapMm)) : dist(draft[0], raw));
      if (r > 0.05) addShape({ kind: "circle", c: draft[0], r });
      setDraft([]);
    }
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (d?.kind === "pan") {
      const v = d.view0;
      setView({ ...v, cx: v.cx - (e.clientX - d.start[0]) / v.s, cy: v.cy + (e.clientY - d.start[1]) / v.s });
      return;
    }
    const raw = toMm(e);
    if (d) {
      const s = shapes[d.si];
      if (!d.moved) {
        setPast((p) => [...p.slice(-60), shapes]);
        d.moved = true;
      }
      if (d.kind === "vertex") {
        const others = shapes.flatMap((sh, j) => (sh.kind === "circle" ? [sh.c] : sh.pts.filter((_, k) => j !== d.si || k !== d.vi)));
        const near = others.find((q) => dist(q, raw) * view.s < 9);
        const p = near || roundPt([snapTo(raw[0], snapMm), snapTo(raw[1], snapMm)]);
        updateShape(d.si, { pts: s.pts.map((q, k) => (k === d.vi ? p : q)) }, true);
      } else if (d.kind === "center") {
        updateShape(d.si, { c: roundPt([snapTo(raw[0], snapMm), snapTo(raw[1], snapMm)]) }, true);
      } else if (d.kind === "radius") {
        const r = snapMm ? Math.max(snapMm, snapTo(dist(s.c, raw), snapMm)) : dist(s.c, raw);
        updateShape(d.si, { r: round(r) }, true);
      } else if (d.kind === "move") {
        const dx = snapTo(raw[0] - d.start[0], snapMm);
        const dy = snapTo(raw[1] - d.start[1], snapMm);
        const o = d.orig;
        updateShape(d.si, o.kind === "circle" ? { c: roundPt([o.c[0] + dx, o.c[1] + dy]) } : { pts: o.pts.map((q) => roundPt([q[0] + dx, q[1] + dy])) }, true);
      }
      return;
    }
    if (tool !== "select") setHover(snapPoint(raw, e, draft[draft.length - 1]));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const startHandle = (e, info) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = info;
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onWheel = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const m = toMm(e);
    const s = Math.min(200, Math.max(0.3, view.s * Math.exp(-e.deltaY * 0.0015)));
    // Keep the point under the cursor still.
    setView({ s, cx: m[0] - (e.clientX - r.left - size.w / 2) / s, cy: m[1] + (e.clientY - r.top - size.h / 2) / s });
  };

  // Typed entry ------------------------------------------------------------
  const setT = (k) => (v) => setTyped((t) => ({ ...t, [k]: v }));
  const typedNext = () => {
    const last = draft[draft.length - 1];
    const a = (typed.ang * Math.PI) / 180;
    return roundPt([last[0] + typed.len * Math.cos(a), last[1] + typed.len * Math.sin(a)]);
  };

  // Drawing -----------------------------------------------------------------
  const grid = useMemo(() => {
    const step = gridStep(unit, view.s);
    const major = step * 5;
    const x0 = view.cx - size.w / 2 / view.s;
    const x1 = view.cx + size.w / 2 / view.s;
    const y0 = view.cy - size.h / 2 / view.s;
    const y1 = view.cy + size.h / 2 / view.s;
    const lines = [];
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) lines.push({ d: `M${x},${y0}V${y1}`, major: Math.abs(x / major - Math.round(x / major)) < 1e-6 });
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) lines.push({ d: `M${x0},${y}H${x1}`, major: Math.abs(y / major - Math.round(y / major)) < 1e-6 });
    return { lines, step, x0, x1, y0, y1 };
  }, [unit, view, size]);

  const fillPath = useMemo(() => shapes.map((s) => toSvgPath(outlinePath(s))).join(" "), [shapes]);
  const selShape = sel != null ? shapes[sel] : null;
  const last = draft[draft.length - 1];
  const preview = hover && tool !== "select" && draft.length ? hover : null;
  const revolveBad = op === "revolve" && allPoints.length && Math.min(...shapes.flatMap((s) => outlinePath(s).map((p) => p[0]))) < -0.001;
  const canFinish = shapes.length > 0 && !revolveBad;

  const label = (() => {
    if (!preview) return null;
    if (tool === "line") {
      const a = (Math.atan2(preview[1] - last[1], preview[0] - last[0]) * 180) / Math.PI;
      return `${fmt(dist(last, preview))} ${u} · ${Math.round(a)}°`;
    }
    if (tool === "rect") return `${fmt(Math.abs(preview[0] - draft[0][0]))} × ${fmt(Math.abs(preview[1] - draft[0][1]))} ${u}`;
    if (tool === "circle") return `⌀ ${fmt(dist(draft[0], preview) * 2)} ${u}`;
    return null;
  })();
  const labelPos = preview && toScreen(preview);

  const finish = () => {
    if (!canFinish) return;
    onDone({ shapes, op, height, angle }, isNew ? PLANES[plane].rotation : null);
  };

  return (
    <div className="sk" role="dialog" aria-modal="true" aria-label="Sketch editor">
      <header className="sk-top">
        <div className="b-seg" role="group" aria-label="Sketch tools">
          {TOOLS.map(([t, l, k]) => (
            <button key={t} className={tool === t ? "on" : ""} onClick={() => pickTool(t)} title={`${l} (${k})`}>
              {l}
            </button>
          ))}
        </div>
        <button className="b-btn small ghost" onClick={undo} disabled={!past.length && !draft.length} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <p className="sk-hint">{HINTS[tool]}</p>
      </header>

      <div className="sk-body">
        <svg
          ref={svgRef}
          className={`sk-canvas tool-${tool}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={() => tool === "line" && closeDraft()}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${size.w / 2 - view.cx * view.s},${size.h / 2 + view.cy * view.s}) scale(${view.s},${-view.s})`}>
            {grid.lines.map((l, i) => (
              <path key={i} d={l.d} className={l.major ? "sk-grid major" : "sk-grid"} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={`M${grid.x0},0H${grid.x1}`} className="sk-axis x" vectorEffect="non-scaling-stroke" />
            <path d={`M0,${grid.y0}V${grid.y1}`} className={`sk-axis y ${op === "revolve" ? "revolve" : ""}`} vectorEffect="non-scaling-stroke" />
            {op === "revolve" && <rect x={grid.x0} y={grid.y0} width={Math.max(0, -grid.x0)} height={grid.y1 - grid.y0} className="sk-off" />}

            <path d={fillPath} className="sk-fill" fillRule="evenodd" />
            {shapes.map((s, i) => (
              <path
                key={i}
                d={toSvgPath(outlinePath(s))}
                data-hit={i}
                className={`sk-shape ${sel === i ? "on" : ""}`}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => {
                  if (tool !== "select" || e.button !== 0) return;
                  e.stopPropagation();
                  setSel(i);
                  drag.current = { kind: "move", si: i, start: toMm(e), orig: s };
                  svgRef.current.setPointerCapture(e.pointerId);
                }}
              />
            ))}

            {draft.length > 0 && (
              <path
                d={toSvgPath(tool === "rect" && preview ? [draft[0], [preview[0], draft[0][1]], preview, [draft[0][0], preview[1]]] : [...draft, ...(preview && tool === "line" ? [preview] : [])], tool === "rect")}
                className="sk-draft"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {tool === "circle" && draft.length > 0 && preview && <circle cx={draft[0][0]} cy={draft[0][1]} r={dist(draft[0], preview)} className="sk-draft" vectorEffect="non-scaling-stroke" />}
          </g>

          {/* Handles and dots are drawn in screen pixels so they stay the same size. */}
          {selShape?.kind === "poly" &&
            selShape.pts.map((p, k) => {
              const [x, y] = toScreen(p);
              return <circle key={k} cx={x} cy={y} r={6} className="sk-handle" onPointerDown={(e) => startHandle(e, { kind: "vertex", si: sel, vi: k })} />;
            })}
          {selShape?.kind === "circle" &&
            (() => {
              const [x, y] = toScreen(selShape.c);
              const [rx, ry] = toScreen([selShape.c[0] + selShape.r, selShape.c[1]]);
              return (
                <>
                  <circle cx={x} cy={y} r={6} className="sk-handle" onPointerDown={(e) => startHandle(e, { kind: "center", si: sel })} />
                  <circle cx={rx} cy={ry} r={6} className="sk-handle size" onPointerDown={(e) => startHandle(e, { kind: "radius", si: sel })} />
                </>
              );
            })()}
          {draft.map((p, k) => {
            const [x, y] = toScreen(p);
            return <circle key={k} cx={x} cy={y} r={k === 0 && draft.length >= 3 ? 7 : 4} className={k === 0 && draft.length >= 3 ? "sk-dot close" : "sk-dot"} />;
          })}
          {hover && tool !== "select" && (
            <circle cx={toScreen(hover)[0]} cy={toScreen(hover)[1]} r={3.5} className="sk-cursor" />
          )}
          {op === "revolve" && (
            <text x={toScreen([0, 0])[0] + 6} y={14} className="sk-axis-label">
              Center line
            </text>
          )}
        </svg>
        {label && (
          <div className="b-measure-label sk-label" style={{ left: labelPos[0] + 14, top: labelPos[1] - 28 }}>
            {label}
          </div>
        )}
        {revolveBad && <div className="b-notice error sk-warn">For Revolve, keep every outline right of the center line. It spins around that line.</div>}

        <aside className="sk-side">
          <ShapePanel
            tool={tool}
            draft={draft}
            shape={selShape}
            unit={unit}
            typed={typed}
            setT={setT}
            onUpdate={(patch) => updateShape(sel, patch)}
            onDelete={() => deleteShape(sel)}
            onStart={() => setDraft([[typed.x, typed.y]])}
            onSegment={() => setDraft([...draft, typedNext()])}
            onClose={closeDraft}
            onRect={() => {
              const { w, h, x, y } = typed;
              addShape({ kind: "poly", pts: [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]].map(roundPt), bulge: [0, 0, 0, 0], radius: 0 });
            }}
            onCircle={() => addShape({ kind: "circle", c: [typed.x, typed.y], r: typed.d / 2 })}
          />
          {shapes.length > 1 && <p className="b-hint">Outlines drawn inside another outline become holes.</p>}
        </aside>
      </div>

      <footer className="sk-foot">
        <div className="b-seg" role="group" aria-label="Make a part by">
          <button className={op === "extrude" ? "on" : ""} onClick={() => setOp("extrude")} title="Push the outline straight up">
            Extrude
          </button>
          <button className={op === "revolve" ? "on" : ""} onClick={() => setOp("revolve")} title="Spin the outline around the center line, like a lathe">
            Revolve
          </button>
        </div>
        {op === "extrude" ? (
          <NumberField label="Height" value={height} min={0.2} max={256} unit={unit} slider={false} onChange={setHeight} />
        ) : (
          <NumberField label="Angle" value={angle} min={1} max={360} step={15} unit="°" slider={false} onChange={setAngle} />
        )}
        {isNew && op === "extrude" && (
          <label className="f-text sk-plane">
            <span className="f-label">Place it</span>
            <select value={plane} onChange={(e) => setPlane(e.target.value)}>
              {Object.entries(PLANES).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="sk-spacer" />
        <button className="b-btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="b-btn primary" onClick={finish} disabled={!canFinish} title={shapes.length ? "" : "Draw a closed outline first"}>
          {isNew ? "Make part" : "Update part"}
        </button>
      </footer>
    </div>
  );
}

function ShapePanel({ tool, draft, shape, unit, typed, setT, onUpdate, onDelete, onStart, onSegment, onClose, onRect, onCircle }) {
  const L = { unit, slider: false };
  if (tool === "line") {
    return (
      <section>
        <h3>Type it in</h3>
        {!draft.length ? (
          <>
            <NumberField label="Start X" value={typed.x} min={-500} max={500} {...L} onChange={setT("x")} />
            <NumberField label="Start Y" value={typed.y} min={-500} max={500} {...L} onChange={setT("y")} />
            <button className="b-btn small" onClick={onStart}>
              Start here
            </button>
          </>
        ) : (
          <>
            <NumberField label="Length" value={typed.len} min={0.1} max={500} {...L} onChange={setT("len")} />
            <NumberField label="Angle" value={typed.ang} min={-360} max={360} step={15} unit="°" slider={false} onChange={setT("ang")} />
            <p className="b-hint">0° points right, 90° points up.</p>
            <div className="b-btnrow">
              <button className="b-btn small" onClick={onSegment}>
                Add line
              </button>
              <button className="b-btn small ghost" onClick={onClose} disabled={draft.length < 3}>
                Close outline
              </button>
            </div>
          </>
        )}
      </section>
    );
  }
  if (tool === "rect") {
    return (
      <section>
        <h3>Type it in</h3>
        <NumberField label="Width" value={typed.w} min={0.2} max={500} {...L} onChange={setT("w")} />
        <NumberField label="Height" value={typed.h} min={0.2} max={500} {...L} onChange={setT("h")} />
        <NumberField label="Center X" value={typed.x} min={-500} max={500} {...L} onChange={setT("x")} />
        <NumberField label="Center Y" value={typed.y} min={-500} max={500} {...L} onChange={setT("y")} />
        <button className="b-btn small" onClick={onRect}>
          Add rectangle
        </button>
      </section>
    );
  }
  if (tool === "circle") {
    return (
      <section>
        <h3>Type it in</h3>
        <NumberField label="Diameter" value={typed.d} min={0.2} max={500} {...L} onChange={setT("d")} />
        <NumberField label="Center X" value={typed.x} min={-500} max={500} {...L} onChange={setT("x")} />
        <NumberField label="Center Y" value={typed.y} min={-500} max={500} {...L} onChange={setT("y")} />
        <button className="b-btn small" onClick={onCircle}>
          Add circle
        </button>
      </section>
    );
  }
  if (!shape) return <p className="b-hint">Select an outline to change its points, curves and corners. Pick a drawing tool above to add more.</p>;

  if (shape.kind === "circle") {
    return (
      <section>
        <h3>Circle</h3>
        <NumberField label="Diameter" value={shape.r * 2} min={0.2} max={500} {...L} onChange={(v) => onUpdate({ r: v / 2 })} />
        <NumberField label="Center X" value={shape.c[0]} min={-500} max={500} {...L} onChange={(v) => onUpdate({ c: [v, shape.c[1]] })} />
        <NumberField label="Center Y" value={shape.c[1]} min={-500} max={500} {...L} onChange={(v) => onUpdate({ c: [shape.c[0], v] })} />
        <button className="b-btn small danger" onClick={onDelete}>
          Delete circle
        </button>
      </section>
    );
  }

  const n = shape.pts.length;
  const bulge = shape.bulge || shape.pts.map(() => 0);
  // The engine bows a side to the left of its direction; show "outward" as positive either way round.
  const area = shape.pts.reduce((a, p, j) => a + p[0] * shape.pts[(j + 1) % n][1] - shape.pts[(j + 1) % n][0] * p[1], 0);
  const out = area > 0 ? -1 : 1;
  const setPt = (k, axis, v) => onUpdate({ pts: shape.pts.map((p, j) => (j === k ? (axis ? [p[0], v] : [v, p[1]]) : p)) });
  // Changing a side's length moves its end point along the same direction.
  const setLen = (k, v) => {
    const a = shape.pts[k];
    const b = shape.pts[(k + 1) % n];
    const d = dist(a, b) || 1;
    const nb = roundPt([a[0] + ((b[0] - a[0]) * v) / d, a[1] + ((b[1] - a[1]) * v) / d]);
    onUpdate({ pts: shape.pts.map((p, j) => (j === (k + 1) % n ? nb : p)) });
  };
  const setBulge = (k, v) => onUpdate({ bulge: bulge.map((b, j) => (j === k ? v * out : b)) });
  const insert = (k) => {
    const a = shape.pts[k];
    const b = shape.pts[(k + 1) % n];
    const mid = arcPoints(a, b, bulge[k] || 0, 2)[1];
    onUpdate({ pts: [...shape.pts.slice(0, k + 1), roundPt(mid), ...shape.pts.slice(k + 1)], bulge: [...bulge.slice(0, k), 0, 0, ...bulge.slice(k + 1)] });
  };
  const removePt = (k) => onUpdate({ pts: shape.pts.filter((_, j) => j !== k), bulge: bulge.filter((_, j) => j !== k).map((b, j) => (j === (k - 1 + n) % n ? 0 : b)) });

  return (
    <section>
      <h3>Outline</h3>
      <NumberField label="Round the corners" value={shape.radius || 0} min={0} max={100} {...L} onChange={(v) => onUpdate({ radius: v })} />
      <div className="sk-pts">
        {shape.pts.map((p, k) => (
          <div key={k} className="sk-pt">
            <div className="sk-pt-head">
              <strong>Point {k + 1}</strong>
              {n > 3 && (
                <button className="b-x" onClick={() => removePt(k)} aria-label={`Remove point ${k + 1}`} title="Remove point">
                  ×
                </button>
              )}
            </div>
            <div className="sk-xy">
              <NumberField label="X" value={p[0]} min={-500} max={500} {...L} onChange={(v) => setPt(k, 0, v)} />
              <NumberField label="Y" value={p[1]} min={-500} max={500} {...L} onChange={(v) => setPt(k, 1, v)} />
            </div>
            <div className="sk-seg">
              <span className="b-hint">
                Side to point {((k + 1) % n) + 1}
              </span>
              <NumberField label="Length" value={round(dist(p, shape.pts[(k + 1) % n]))} min={0.1} max={500} {...L} onChange={(v) => setLen(k, v)} />
              <NumberField label="Curve" value={(bulge[k] || 0) * out} min={-250} max={250} {...L} onChange={(v) => setBulge(k, v)} />
              <button className="b-btn small ghost" onClick={() => insert(k)}>
                Add a point here
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="b-hint">Curve bends a side into an arc: positive bows it outward, negative bows it inward.</p>
      <button className="b-btn small danger" onClick={onDelete}>
        Delete outline
      </button>
    </section>
  );
}
