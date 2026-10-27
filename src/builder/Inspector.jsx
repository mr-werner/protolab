import { useEffect, useState } from "react";
import { SHAPES } from "../objects.js";
import { FONTS } from "../config.js";

function NumberField({ label, value, min, max, step = 0.5, unit = "mm", slider = true, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <label className="f-num">
      <span className="f-label">{label}</span>
      {slider && (
        <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(parseFloat(e.target.value))} />
      )}
      <span className="f-box">
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setDraft(String(value))}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function Triple({ label, values, unit, step, min, max, onChange }) {
  return (
    <fieldset className="f-triple">
      <legend>{label}</legend>
      {["X", "Y", "Z"].map((axis, i) => (
        <label key={axis}>
          <span className={`axis ${axis.toLowerCase()}`}>{axis}</span>
          <NumberField
            label=""
            value={values[i]}
            min={min}
            max={max}
            step={step}
            unit={unit}
            slider={false}
            onChange={(v) => onChange(values.map((x, j) => (j === i ? v : x)), axis)}
          />
        </label>
      ))}
    </fieldset>
  );
}

export default function Inspector({ object, importInfo, error, onChange, onDuplicate, onDelete, onClose }) {
  const def = SHAPES[object.type];
  const setParam = (key, value) => onChange({ params: { ...object.params, [key]: value } }, `p.${key}`);

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
        <h3>{object.type === "text" ? "Text" : def ? `${def.label} size` : "Imported file"}</h3>
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
          <NumberField key={key} label={label} value={object.params[key]} min={min} max={max} step={step || 0.5} unit={key === "sides" ? "" : "mm"} onChange={(v) => setParam(key, v)} />
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

      <section>
        <h3>Position</h3>
        <Triple label="Move" values={object.position} unit="mm" step={1} min={-500} max={500} onChange={(v, a) => onChange({ position: v }, `pos.${a}`)} />
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
