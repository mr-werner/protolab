import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Viewport, { geometryFromData } from "./Viewport.jsx";
import Inspector from "./Inspector.jsx";
import { cad } from "../cad/client.js";
import { SHAPES, makeObject, newId } from "../objects.js";
import { TEMPLATES } from "../templates.js";
import { BUILD_VOLUME, COLORS, MIN_FEATURE_MM, estimatePrice } from "../config.js";
import { ShapeIcon } from "./icons.jsx";
import "./builder.css";

const STORAGE_KEY = "protolab:design:v1";

const geomKeyOf = (o) => (o.type === "import" ? `import:${o.params.importId}` : `${o.type}:${JSON.stringify(o.params)}`);

// Undo history: every committed change pushes the previous list of objects.
function historyReducer(state, action) {
  switch (action.type) {
    case "commit": {
      const next = typeof action.update === "function" ? action.update(state.present) : action.update;
      if (next === state.present) return state;
      // Rapid edits to the same field (slider drags, typing) become one undo step.
      const now = Date.now();
      if (action.key && action.key === state.lastKey && now - state.lastAt < 1200) {
        return { ...state, present: next, future: [], lastAt: now };
      }
      return { past: [...state.past.slice(-80), state.present], present: next, future: [], lastKey: action.key, lastAt: now };
    }
    case "live": // gizmo dragging: change without a history step (committed on release)
      return { ...state, present: action.update(state.present) };
    case "mark":
      return { ...state, past: [...state.past.slice(-80), action.snapshot], future: [] };
    case "undo":
      if (!state.past.length) return state;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    case "redo":
      if (!state.future.length) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    case "reset":
      return { past: [], present: action.objects, future: [] };
    default:
      return state;
  }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return { ...saved, objects: (saved.objects || []).filter((o) => o.type !== "import") };
  } catch {
    return null;
  }
}

function startingDesign() {
  const params = new URLSearchParams(window.location.search);
  const t = TEMPLATES.find((x) => x.id === params.get("template"));
  if (t) return { objects: t.build(), name: t.name };
  const saved = loadSaved();
  if (saved?.objects?.length) return saved;
  return { objects: TEMPLATES[0].build(), name: TEMPLATES[0].name };
}

function featureWarnings(objects) {
  const out = [];
  for (const o of objects) {
    if (o.hole || o.hidden || o.type === "import") continue;
    const p = o.params;
    const k = o.scale || 1;
    const dims = {
      box: [p.w, p.d, p.h],
      cylinder: [p.d, p.h],
      tube: [(p.d - p.id) / 2, p.h],
      sphere: [p.d],
      cone: [Math.max(p.d1, p.d2), p.h],
      polygon: [p.d, p.h],
      text: [p.depth],
    }[o.type] || [];
    const min = Math.min(...dims) * k;
    if (min < MIN_FEATURE_MM) out.push(`${o.name} is ${min.toFixed(1)} mm thick in places. Parts under ${MIN_FEATURE_MM} mm may not print.`);
    if (o.type === "text" && p.size * k < 5) out.push(`${o.name}: letters under 5 mm tall can lose detail.`);
  }
  return out;
}

function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s) => (s || "design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";

function toBase64(bytes) {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}

export default function Builder() {
  const initial = useMemo(startingDesign, []);
  const [hist, dispatch] = useReducer(historyReducer, { past: [], present: initial.objects, future: [] });
  const objects = hist.present;
  const [name, setName] = useState(initial.name || "My design");
  const [color, setColor] = useState(initial.color || COLORS[4].value);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("move");
  const [geometries, setGeometries] = useState(() => new Map());
  const [engineState, setEngineState] = useState("loading"); // loading | ready | error
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [combined, setCombined] = useState(null);
  const [showCombined, setShowCombined] = useState(false);
  const [panel, setPanel] = useState(null); // templates | order | null
  const [exportOpen, setExportOpen] = useState(false);
  const [buildErrors, setBuildErrors] = useState({});
  const importsRef = useRef(new Map()); // importId -> { name, bytes, kind }
  const viewRef = useRef(null);
  const dragStart = useRef(null);
  const fileRef = useRef(null);
  const projectRef = useRef(null);

  const decorated = useMemo(() => objects.map((o) => ({ ...o, geomKey: geomKeyOf(o) })), [objects]);
  const selected = decorated.find((o) => o.id === selectedId) || null;

  const flash = useCallback((text, tone = "info") => {
    setNotice({ text, tone, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Start the CAD engine.
  useEffect(() => {
    cad("ready")
      .then(() => setEngineState("ready"))
      .catch((e) => {
        setEngineState("error");
        flash(`The 3D engine couldn't start: ${e.message}`, "error");
      });
  }, [flash]);

  // Build any missing geometry (debounced so dragging a slider stays smooth).
  const inflight = useRef(new Set());
  useEffect(() => {
    if (engineState !== "ready") return;
    const t = setTimeout(() => {
      for (const o of decorated) {
        if (geometries.has(o.geomKey) || inflight.current.has(o.geomKey)) continue;
        inflight.current.add(o.geomKey);
        const { geomKey, ...plain } = o;
        cad("mesh", { object: plain })
          .then((data) => {
            const g = geometryFromData(data);
            setGeometries((prev) => {
              const next = new Map(prev);
              next.set(geomKey, g);
              return next;
            });
            setBuildErrors((prev) => {
              if (!prev[o.id]) return prev;
              const { [o.id]: _, ...rest } = prev;
              return rest;
            });
          })
          .catch((e) => setBuildErrors((prev) => ({ ...prev, [o.id]: e.message })))
          .finally(() => inflight.current.delete(geomKey));
      }
    }, 160);
    return () => clearTimeout(t);
  }, [decorated, geometries, engineState]);

  // Drop stale geometries now and then.
  useEffect(() => {
    if (geometries.size < 120) return;
    const used = new Set(decorated.map((o) => o.geomKey));
    setGeometries((prev) => new Map([...prev].filter(([k]) => used.has(k))));
  }, [geometries, decorated]);

  // Any edit invalidates the combined preview.
  useEffect(() => {
    setCombined(null);
    setShowCombined(false);
  }, [objects]);

  // Autosave (imports aren't kept; they're too big for browser storage).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, color, objects }));
    } catch {
      /* storage unavailable */
    }
  }, [objects, name, color]);

  const size = bounds ? [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z] : null;
  const tol = 0.05;
  const outside = bounds
    ? {
        x: bounds.min.x < -BUILD_VOLUME.x / 2 - tol || bounds.max.x > BUILD_VOLUME.x / 2 + tol,
        y: bounds.min.y < -BUILD_VOLUME.y / 2 - tol || bounds.max.y > BUILD_VOLUME.y / 2 + tol,
        z: bounds.max.z > BUILD_VOLUME.z + tol,
        below: bounds.min.z < -tol,
      }
    : null;
  const tooBig = size && (size[0] > BUILD_VOLUME.x + tol || size[1] > BUILD_VOLUME.y + tol || size[2] > BUILD_VOLUME.z + tol);
  const outOfBounds = !!outside && (outside.x || outside.y || outside.z || outside.below);
  const warnings = useMemo(() => featureWarnings(objects), [objects]);
  const floating = bounds && bounds.min.z > tol;
  const price = size && !tooBig ? estimatePrice(size) : null;
  const hasSolids = objects.some((o) => !o.hole && !o.hidden);
  const hasMeshImport = objects.some((o) => o.type === "import" && importsRef.current.get(o.params.importId)?.kind === "mesh");

  const handleBounds = useCallback((box) => {
    setBounds((prev) => {
      if (!box && !prev) return prev;
      if (box && prev && box.equals(prev)) return prev;
      return box ? box.clone() : null;
    });
  }, []);

  const commit = useCallback((update, key) => dispatch({ type: "commit", update, key }), []);
  const updateObject = useCallback(
    (id, patch, key) => commit((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)), key && `${id}:${key}`),
    [commit]
  );

  const addShape = (type) => {
    const obj = makeObject(type);
    // Drop new shapes next to the current design instead of inside it.
    if (bounds) {
      const x = Math.min(bounds.max.x + 30, BUILD_VOLUME.x / 2 - 30);
      obj.position = [Math.round(x), 0, 0];
    }
    commit((list) => [...list, obj]);
    setSelectedId(obj.id);
    setMode("move");
  };

  const duplicate = useCallback(() => {
    if (!selected) return;
    const { geomKey, ...plain } = selected;
    const copy = { ...structuredClone(plain), id: newId(), name: `${plain.name} copy`, position: [plain.position[0] + 10, plain.position[1] + 10, plain.position[2]] };
    commit((list) => [...list, copy]);
    setSelectedId(copy.id);
  }, [selected, commit]);

  const remove = useCallback(() => {
    if (!selected) return;
    commit((list) => list.filter((o) => o.id !== selected.id));
    setSelectedId(null);
  }, [selected, commit]);

  const loadTemplate = (t) => {
    if (objects.length && !window.confirm(`Replace your current design with the ${t.name} template? You can undo this.`)) return;
    commit(t.build());
    setName(t.name);
    setSelectedId(null);
    setPanel(null);
    setTimeout(() => viewRef.current?.frame(null), 50);
  };

  const startBlank = () => {
    if (objects.length && !window.confirm("Clear everything and start from an empty plate? You can undo this.")) return;
    commit([]);
    setName("My design");
    setSelectedId(null);
    setPanel(null);
  };

  const dropToPlate = () => {
    if (!bounds) return;
    const dz = -bounds.min.z;
    commit((list) => list.map((o) => ({ ...o, position: [o.position[0], o.position[1], Math.round((o.position[2] + dz) * 100) / 100] })));
  };

  const centerOnPlate = () => {
    if (!bounds) return;
    const dx = -(bounds.min.x + bounds.max.x) / 2;
    const dy = -(bounds.min.y + bounds.max.y) / 2;
    const dz = -bounds.min.z;
    commit((list) =>
      list.map((o) => ({
        ...o,
        position: [Math.round((o.position[0] + dx) * 100) / 100, Math.round((o.position[1] + dy) * 100) / 100, Math.round((o.position[2] + dz) * 100) / 100],
      }))
    );
  };

  const onTransform = useCallback(
    (id, patch) => {
      if (!dragStart.current) dragStart.current = hist.present;
      dispatch({ type: "live", update: (list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
    },
    [hist.present]
  );
  const onTransformEnd = useCallback(() => {
    if (dragStart.current) dispatch({ type: "mark", snapshot: dragStart.current });
    dragStart.current = null;
  }, []);

  const importFiles = async (files) => {
    for (const file of files) {
      const id = `imp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      setBusy(`Importing ${file.name}…`);
      try {
        const bytes = await file.arrayBuffer();
        const info = await cad("import", { id, name: file.name, bytes: bytes.slice(0) });
        importsRef.current.set(id, { name: file.name, bytes, kind: info.kind });
        const obj = makeObject("import", { name: file.name.replace(/\.[^.]+$/, ""), params: { importId: id, file: file.name, kind: info.kind } });
        if (bounds) obj.position = [Math.round(Math.min(bounds.max.x + 20 + info.size[0] / 2, BUILD_VOLUME.x / 2 - info.size[0] / 2)), 0, 0];
        commit((list) => [...list, obj]);
        setSelectedId(obj.id);
        const sizeText = info.size.map((v) => v.toFixed(0)).join(" × ");
        flash(
          info.kind === "mesh"
            ? `Imported ${file.name} (${sizeText} mm). It's a mesh, so you can move, rotate, scale and combine it, and the design saves as .stl.`
            : `Imported ${file.name} (${sizeText} mm) as an editable solid.`
        );
      } catch (e) {
        flash(`Couldn't import ${file.name}: ${e.message}`, "error");
      } finally {
        setBusy("");
      }
    }
  };

  const plainObjects = () => objects.map(({ geomKey, ...o }) => o);

  const runPreview = async () => {
    if (showCombined) return setShowCombined(false);
    if (combined) return setShowCombined(true);
    setBusy("Combining shapes…");
    try {
      const res = await cad("preview", { objects: plainObjects() });
      setCombined(geometryFromData(res.mesh));
      setShowCombined(true);
      setSelectedId(null);
    } catch (e) {
      flash(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const exportAs = async (format) => {
    setExportOpen(false);
    if (outOfBounds) return flash("Fit the design inside the build area first. Try “Center on plate”.", "error");
    setBusy(format === "step" ? "Making your .stp file…" : "Making your .stl file…");
    try {
      const res = await cad("export", { objects: plainObjects(), format });
      download(`${slug(name)}.${format === "step" ? "stp" : "stl"}`, res.bytes, format === "step" ? "application/step" : "model/stl");
    } catch (e) {
      flash(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const saveProject = () => {
    setExportOpen(false);
    const imports = {};
    for (const o of objects) {
      if (o.type !== "import") continue;
      const i = importsRef.current.get(o.params.importId);
      if (i) imports[o.params.importId] = { name: i.name, data: toBase64(i.bytes) };
    }
    const data = JSON.stringify({ app: "ProtoLab", version: 1, name, color, objects: plainObjects(), imports });
    download(`${slug(name)}.protolab.json`, data, "application/json");
  };

  const openProject = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "ProtoLab" || !Array.isArray(data.objects)) throw new Error("That isn't a ProtoLab design file.");
      setBusy("Opening design…");
      for (const [id, imp] of Object.entries(data.imports || {})) {
        const bytes = fromBase64(imp.data);
        const info = await cad("import", { id, name: imp.name, bytes: bytes.slice(0) });
        importsRef.current.set(id, { name: imp.name, bytes, kind: info.kind });
      }
      commit(data.objects);
      setName(data.name || "My design");
      if (data.color) setColor(data.color);
      setSelectedId(null);
      setTimeout(() => viewRef.current?.frame(null), 50);
    } catch (e) {
      flash(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          remove();
        }
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setPanel(null);
        setExportOpen(false);
      } else if (e.key.toLowerCase() === "m") setMode("move");
      else if (e.key.toLowerCase() === "r") setMode("rotate");
      else if (e.key.toLowerCase() === "f") viewRef.current?.frame(bounds);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, remove, selected, bounds]);

  // Frame the design once its first shapes are in.
  const framed = useRef(false);
  useEffect(() => {
    if (!framed.current && bounds) {
      framed.current = true;
      viewRef.current?.frame(bounds);
    }
  }, [bounds]);

  const fmt = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  const colorLabel = COLORS.find((c) => c.value === color)?.label || "Custom";

  return (
    <div className="builder">
      <header className="b-top">
        <a className="b-brand" href="/" aria-label="ProtoLab home">
          <span className="b-mark" aria-hidden="true" />
          ProtoLab
        </a>
        <input className="b-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Design name" />
        <div className="b-top-actions">
          <button className="b-btn ghost" onClick={() => dispatch({ type: "undo" })} disabled={!hist.past.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="b-btn ghost" onClick={() => dispatch({ type: "redo" })} disabled={!hist.future.length} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <div className="b-menu-wrap">
            <button className="b-btn" onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen} disabled={!hasSolids || engineState !== "ready"}>
              Save file ▾
            </button>
            {exportOpen && (
              <div className="b-menu" role="menu">
                <button role="menuitem" onClick={() => exportAs("step")} disabled={hasMeshImport}>
                  <strong>.stp (STEP)</strong>
                  <span>{hasMeshImport ? "Not available with an imported mesh" : "CAD file for the print shop"}</span>
                </button>
                <button role="menuitem" onClick={() => exportAs("stl")}>
                  <strong>.stl</strong>
                  <span>For slicers and other 3D apps</span>
                </button>
                <hr />
                <button role="menuitem" onClick={saveProject}>
                  <strong>Save design</strong>
                  <span>A .protolab.json file you can open later</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    projectRef.current?.click();
                  }}
                >
                  <strong>Open design</strong>
                  <span>Load a .protolab.json file</span>
                </button>
              </div>
            )}
          </div>
          <button className="b-btn primary" onClick={() => setPanel("order")} disabled={!hasSolids}>
            Order print
          </button>
        </div>
      </header>

      <aside className="b-left" aria-label="Add">
        <section>
          <h2>Start from</h2>
          <button className="b-wide" onClick={() => setPanel("templates")}>
            Templates
          </button>
          <button className="b-wide" onClick={() => fileRef.current?.click()} disabled={engineState !== "ready"}>
            Import a file
          </button>
          <p className="b-hint">.step, .stp, .stl or .3mf</p>
        </section>
        <section>
          <h2>Add a shape</h2>
          <div className="b-shapes">
            {Object.entries(SHAPES).map(([type, def]) => (
              <button key={type} onClick={() => addShape(type)} title={`Add ${def.label.toLowerCase()}`}>
                <ShapeIcon type={type} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="b-parts">
          <h2>Parts ({objects.length})</h2>
          <ul>
            {decorated.map((o) => (
              <li key={o.id}>
                <button className={`b-part ${o.id === selectedId ? "on" : ""} ${o.hidden ? "dim" : ""}`} onClick={() => setSelectedId(o.id)}>
                  <span className={`b-dot ${o.hole ? "hole" : ""}`} style={o.hole ? undefined : { background: color }} />
                  <span className="b-part-name">{o.name}</span>
                  {o.hole && <span className="b-tag">hole</span>}
                  {buildErrors[o.id] && <span className="b-tag err">error</span>}
                </button>
              </li>
            ))}
            {!objects.length && <li className="b-hint">Empty plate. Add a shape or pick a template.</li>}
          </ul>
        </section>
      </aside>

      <main className="b-stage">
        <Viewport
          apiRef={viewRef}
          objects={decorated}
          geometries={geometries}
          selectedId={selectedId}
          color={color}
          mode={mode}
          combined={combined}
          showCombined={showCombined}
          outOfBounds={outOfBounds}
          onSelect={setSelectedId}
          onTransform={onTransform}
          onTransformEnd={onTransformEnd}
          onBounds={handleBounds}
        />
        <div className="b-stage-tools">
          <div className="b-seg" role="group" aria-label="Gizmo">
            <button className={mode === "move" ? "on" : ""} onClick={() => setMode("move")} title="Move (M)">
              Move
            </button>
            <button className={mode === "rotate" ? "on" : ""} onClick={() => setMode("rotate")} title="Rotate (R)">
              Rotate
            </button>
          </div>
          <button className={`b-chip ${showCombined ? "on" : ""}`} onClick={runPreview} disabled={!hasSolids || engineState !== "ready"}>
            {showCombined ? "Back to editing" : "Preview result"}
          </button>
          <button className="b-chip" onClick={() => viewRef.current?.frame(bounds)} title="Frame design (F)">
            Frame
          </button>
        </div>
        <div className="b-size" aria-live="polite">
          <span>
            Build area {BUILD_VOLUME.x} × {BUILD_VOLUME.y} × {BUILD_VOLUME.z} mm
          </span>
          {size && (
            <strong className={outOfBounds ? "bad" : ""}>
              Design {fmt(size[0])} × {fmt(size[1])} × {fmt(size[2])} mm
            </strong>
          )}
        </div>
        {engineState === "loading" && (
          <div className="b-loading">
            <div className="b-spinner" />
            <p>Loading the 3D engine…</p>
            <small>About 10 MB the first time. After that it's cached.</small>
          </div>
        )}
        {busy && (
          <div className="b-busy">
            <div className="b-spinner small" />
            {busy}
          </div>
        )}
        {notice && <div className={`b-notice ${notice.tone}`}>{notice.text}</div>}
      </main>

      <aside className="b-right">
        {selected ? (
          <Inspector
            key={selected.id}
            object={selected}
            importInfo={selected.type === "import" ? importsRef.current.get(selected.params.importId) : null}
            error={buildErrors[selected.id]}
            onChange={(patch, key) => updateObject(selected.id, patch, key)}
            onDuplicate={duplicate}
            onDelete={remove}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="b-insp-empty">
            <h2>Select a part to edit it</h2>
            <p>Click a shape in the view or in the parts list. Drag the arrows to move it, or switch to Rotate.</p>
            <p className="b-hint">Holes cut through any solid they touch. Turn any shape into a hole from its settings.</p>
          </div>
        )}

        <section className="b-summary">
          <h2>Print check</h2>
          <div className={`b-fit ${!size ? "" : outOfBounds ? "bad" : "good"}`}>
            {!size && "Add a solid shape to see its size."}
            {size && !outOfBounds && "Fits the printer"}
            {size && tooBig && "Too big for the printer"}
            {size && !tooBig && outOfBounds && (outside.below ? "Part of it is below the plate" : "Part of it is off the plate")}
          </div>
          {size && outOfBounds && (
            <div className="b-fix">
              {!tooBig && (
                <button className="b-btn small" onClick={centerOnPlate}>
                  Center on plate
                </button>
              )}
              {tooBig && <p className="b-hint">Make it smaller: the largest size is {BUILD_VOLUME.x} × {BUILD_VOLUME.y} × {BUILD_VOLUME.z} mm.</p>}
            </div>
          )}
          {floating && !outOfBounds && (
            <div className="b-fix">
              <p className="b-hint">The design is floating above the plate.</p>
              <button className="b-btn small" onClick={dropToPlate}>
                Drop to plate
              </button>
            </div>
          )}
          {warnings.length > 0 && (
            <ul className="b-warn">
              {warnings.slice(0, 4).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <label className="b-color">
            <span>Color</span>
            <div className="b-swatches">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  className={c.value === color ? "on" : ""}
                  style={{ background: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </label>
          <div className="b-price">
            <span>Estimated price</span>
            <strong>{price ? `$${price.toFixed(2)}` : "—"}</strong>
          </div>
          <p className="b-hint">Test pricing based on the design's overall size. Final price is confirmed before printing.</p>
        </section>
      </aside>

      <input
        ref={fileRef}
        type="file"
        accept=".step,.stp,.stl,.3mf"
        multiple
        hidden
        onChange={(e) => {
          importFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          if (e.target.files[0]) openProject(e.target.files[0]);
          e.target.value = "";
        }}
      />

      {panel === "templates" && (
        <div className="b-modal" role="dialog" aria-modal="true" aria-label="Templates" onClick={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div className="b-sheet">
            <div className="b-sheet-head">
              <h2>Start from a template</h2>
              <button className="b-x" onClick={() => setPanel(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="b-tpl-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="b-tpl" onClick={() => loadTemplate(t)}>
                  <img src={`/templates/${t.id}.png`} alt="" loading="lazy" />
                  <strong>{t.name}</strong>
                  <span>{t.blurb}</span>
                </button>
              ))}
              <button className="b-tpl blank" onClick={startBlank}>
                <span className="b-blank-plate" aria-hidden="true" />
                <strong>Empty plate</strong>
                <span>Start from nothing.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === "order" && (
        <div className="b-modal" role="dialog" aria-modal="true" aria-label="Order" onClick={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div className="b-sheet narrow">
            <div className="b-sheet-head">
              <h2>Order this print</h2>
              <button className="b-x" onClick={() => setPanel(null)} aria-label="Close">
                ×
              </button>
            </div>
            <dl className="b-order">
              <div>
                <dt>Design</dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{size ? `${fmt(size[0])} × ${fmt(size[1])} × ${fmt(size[2])} mm` : "—"}</dd>
              </div>
              <div>
                <dt>Color</dt>
                <dd>{colorLabel}</dd>
              </div>
              <div>
                <dt>Estimate</dt>
                <dd>{price ? `$${price.toFixed(2)}` : "—"}</dd>
              </div>
            </dl>
            {outOfBounds ? (
              <p className="b-fit bad">Fit the design inside the build area before ordering.</p>
            ) : (
              <>
                <p className="b-coming">
                  Online checkout is coming soon. For now, save your file and keep it for your order.
                </p>
                <div className="b-order-actions">
                  <button className="b-btn primary" onClick={() => exportAs(hasMeshImport ? "stl" : "step")}>
                    Save {hasMeshImport ? ".stl" : ".stp"} file
                  </button>
                  <button className="b-btn ghost" onClick={saveProject}>
                    Save editable design
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
