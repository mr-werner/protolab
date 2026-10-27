import { useEffect, useState } from "react";
import { UNITS, toDisplay, fromDisplay } from "../units.js";

// A number input (plus optional slider). `unit` is a display unit key for
// lengths, or a plain suffix like "°" or "%" for everything else.
export function NumberField({ label, value, min, max, step, unit = "mm", slider = true, onChange }) {
  const isLength = !!UNITS[unit];
  const shown = isLength ? toDisplay(value, unit) : value;
  const lo = isLength ? toDisplay(min, unit) : min;
  const hi = isLength ? toDisplay(max, unit) : max;
  const st = step ?? (isLength ? UNITS[unit].step : 1);
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);
  const emit = (raw) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(hi, Math.max(lo, n));
    onChange(isLength ? fromDisplay(clamped, unit) : clamped);
  };
  return (
    <label className="f-num">
      {label !== "" && <span className="f-label">{label}</span>}
      {slider && <input type="range" min={lo} max={hi} step={st} value={Math.min(hi, Math.max(lo, shown))} onChange={(e) => emit(e.target.value)} />}
      <span className="f-box">
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          min={lo}
          max={hi}
          step={st}
          onChange={(e) => {
            setDraft(e.target.value);
            emit(e.target.value);
          }}
          onBlur={() => setDraft(String(shown))}
        />
        <em>{isLength ? UNITS[unit].label : unit}</em>
      </span>
    </label>
  );
}

export function Triple({ label, values, unit, step, min, max, onChange }) {
  return (
    <fieldset className="f-triple">
      <legend>{label}</legend>
      {["X", "Y", "Z"].map((axis, i) => (
        <label key={axis}>
          <span className={`axis ${axis.toLowerCase()}`}>{axis}</span>
          <NumberField label="" value={values[i]} min={min} max={max} step={step} unit={unit} slider={false} onChange={(v) => onChange(values.map((x, j) => (j === i ? v : x)), axis)} />
        </label>
      ))}
    </fieldset>
  );
}

const AXES = ["X", "Y", "Z"];

// Mirror, align (several parts only), resize by percent and repeat.
export function ArrangeTools({ multi, unit, ops }) {
  const [repeat, setRepeat] = useState("line");
  const [count, setCount] = useState(3);
  const [step, setStep] = useState([30, 0, 0]);
  const [angle, setAngle] = useState(360);
  const [around, setAround] = useState("plate");
  const [pct, setPct] = useState(100);

  return (
    <>
      <section>
        <h3>Mirror</h3>
        <div className="b-btnrow">
          {AXES.map((a, i) => (
            <button key={a} className="b-btn small ghost" onClick={() => ops.mirror(i)} title={`Flip across the ${a} axis`}>
              <span className={`axis ${a.toLowerCase()}`}>{a}</span> Flip
            </button>
          ))}
        </div>
      </section>

      {multi && (
        <section>
          <h3>Align</h3>
          {AXES.map((a, i) => (
            <div className="b-align" key={a}>
              <span className={`axis ${a.toLowerCase()}`}>{a}</span>
              {[
                ["min", i === 2 ? "Bottom" : i === 0 ? "Left" : "Front"],
                ["center", "Center"],
                ["max", i === 2 ? "Top" : i === 0 ? "Right" : "Back"],
              ].map(([w, l]) => (
                <button key={w} className="b-btn small ghost" onClick={() => ops.align(i, w)}>
                  {l}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Resize by percent</h3>
        <div className="b-inline">
          <NumberField label="" value={pct} min={1} max={1000} step={1} unit="%" slider={false} onChange={setPct} />
          <button className="b-btn small" onClick={() => pct !== 100 && ops.resize(pct / 100)}>
            Apply
          </button>
        </div>
      </section>

      <section>
        <h3>Repeat</h3>
        <div className="b-seg wide small" role="group" aria-label="Repeat pattern">
          <button className={repeat === "line" ? "on" : ""} onClick={() => setRepeat("line")}>
            In a line
          </button>
          <button className={repeat === "circle" ? "on" : ""} onClick={() => setRepeat("circle")}>
            In a circle
          </button>
        </div>
        <NumberField label="Total count" value={count} min={2} max={100} step={1} unit="" slider={false} onChange={(v) => setCount(Math.round(v))} />
        {repeat === "line" ? (
          <Triple label="Spacing" values={step} unit={unit} min={-500} max={500} onChange={(v) => setStep(v)} />
        ) : (
          <>
            <NumberField label="Total angle" value={angle} min={-360} max={360} step={15} unit="°" slider={false} onChange={setAngle} />
            <label className="f-text">
              <span className="f-label">Around</span>
              <select value={around} onChange={(e) => setAround(e.target.value)}>
                <option value="plate">Center of the plate</option>
                <option value="self">Center of the selection</option>
              </select>
            </label>
          </>
        )}
        <button
          className="b-btn small"
          onClick={() => {
            if (repeat === "line") ops.linear(count, step);
            else {
              const c = around === "plate" ? [0, 0] : ops.center().slice(0, 2);
              ops.circular(count, angle, c);
            }
          }}
        >
          Make copies
        </button>
        {repeat === "circle" && around === "self" && <p className="b-hint">Tip: move the part away from the center first, or the copies stack on top of each other.</p>}
      </section>
    </>
  );
}
