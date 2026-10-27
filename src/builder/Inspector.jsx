import { SHAPES, EDGE_TYPES } from "../objects.js";
import { FONTS } from "../config.js";
import { NumberField, Triple, ArrangeTools } from "./fields.jsx";

export default function Inspector({ object, importInfo, error, unit, ops, onChange, onDuplicate, onDelete, onEditSketch, onClose }) {
  const def = SHAPES[object.type];
  const setParam = (key, value) => onChange({ params: { ...object.params, [key]: value } }, `p.${key}`);
  const edgeStyle = object.params.edgeStyle || "none";

  return (
    <div className="b-insp">
      <div className="b-insp-head">
        <input className="b-insp-name" value={object.name} onChange={(e) => onChange({ name: e.target.value }, "name")} aria-label="Part name" />
        <button className="b-x" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>

      <div className="b-seg wide" role="group" aria-label="Solid or hole">
        <button className={!object.hole ? "on" : ""} onClick={() => onChange({ hole: false })}>
          Solid
        </button>
        <button className={object.hole ? "on hole" : ""} onClick={() => onChange({ hole: true })}>
          Hole
        </button>
      </div>

      {error && <p className="b-err">This part couldn't be built: {error}</p>}

      <section>
        <h3>{object.type === "text" ? "Text" : object.type === "sketch" ? "Sketch" : def ? `${def.label} size` : "Imported file"}</h3>
        {object.type === "sketch" && (
          <>
            <button className="b-btn small" onClick={onEditSketch}>
              Edit sketch
            </button>
            <div className="b-seg wide small" role="group" aria-label="Extrude or revolve">
              {[
                ["extrude", "Extrude"],
                ["revolve", "Revolve"],
              ].map(([v, l]) => (
                <button key={v} className={(object.params.op || "extrude") === v ? "on" : ""} onClick={() => setParam("op", v)}>
                  {l}
                </button>
              ))}
            </div>
            {object.params.op === "revolve" ? (
              <NumberField label="Angle" value={object.params.angle ?? 360} min={1} max={360} step={15} unit="°" onChange={(v) => setParam("angle", v)} />
            ) : (
              <NumberField label="Height" value={object.params.height ?? 10} min={0.2} max={256} unit={unit} onChange={(v) => setParam("height", v)} />
            )}
          </>
        )}
        {object.type === "text" && (
          <>
            <label className="f-text">
              <span className="f-label">Text</span>
              <input value={object.params.text} maxLength={40} onChange={(e) => setParam("text", e.target.value)} />
            </label>
            <label className="f-text">
              <span className="f-label">Font</span>
              <select value={object.params.font} onChange={(e) => setParam("font", e.target.value)}>
                {FONTS.map((f) => (
                  <option key={f.family}>{f.family}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {def?.fields.map(([key, label, min, max, step]) => (
          <NumberField
            key={key}
            label={label}
            value={object.params[key]}
            min={min}
            max={max}
            step={key === "sides" ? step : undefined}
            unit={key === "sides" ? "" : unit}
            onChange={(v) => setParam(key, v)}
          />
        ))}
        {object.type === "import" && (
          <>
            <p className="b-hint">
              {object.params.file}
              {importInfo?.kind === "mesh" ? " · mesh: move, rotate, scale and combine" : " · solid: fully editable"}
            </p>
            <NumberField
              label="Scale"
              value={Math.round((object.scale || 1) * 1000) / 10}
              min={1}
              max={1000}
              step={1}
              unit="%"
              onChange={(v) => onChange({ scale: v / 100 }, "scale")}
            />
          </>
        )}
      </section>

      {EDGE_TYPES.has(object.type) && (
        <section>
          <h3>Edges</h3>
          <div className="b-seg wide small" role="group" aria-label="Edge style">
            {[
              ["none", "Sharp"],
              ["round", "Rounded"],
              ["bevel", "Beveled"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={edgeStyle === v ? "on" : ""}
                onClick={() => onChange({ params: { ...object.params, edgeStyle: v, edge: object.params.edge || 1 } })}
              >
                {l}
              </button>
            ))}
          </div>
          {edgeStyle !== "none" && <NumberField label="Edge size" value={object.params.edge || 1} min={0.2} max={40} unit={unit} onChange={(v) => setParam("edge", v)} />}
        </section>
      )}

      <section>
        <h3>Position</h3>
        <Triple label="Move" values={object.position} unit={unit} min={-500} max={500} onChange={(v, a) => onChange({ position: v }, `pos.${a}`)} />
        <Triple label="Rotate" values={object.rotation} unit="°" step={15} min={-360} max={360} onChange={(v, a) => onChange({ rotation: v }, `rot.${a}`)} />
        <div className="b-row">
          <button className="b-btn small ghost" onClick={() => onChange({ rotation: [0, 0, 0] })}>
            Reset rotation
          </button>
          <button className="b-btn small ghost" onClick={() => onChange({ hidden: !object.hidden })}>
            {object.hidden ? "Show" : "Hide"}
          </button>
        </div>
      </section>

      <ArrangeTools unit={unit} ops={ops} />

      <div className="b-row end">
        <button className="b-btn small" onClick={onDuplicate} title="Duplicate (Ctrl+D)">
          Duplicate
        </button>
        <button className="b-btn small danger" onClick={onDelete} title="Delete (Del)">
          Delete
        </button>
      </div>
    </div>
  );
}
