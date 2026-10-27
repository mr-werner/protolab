// Display units. Everything is stored in millimeters; these only change what
// people see and type.
export const UNITS = {
  mm: { label: "mm", factor: 1, step: 0.5, digits: 2, snaps: [0, 0.1, 1, 5, 10] },
  cm: { label: "cm", factor: 10, step: 0.05, digits: 3, snaps: [0, 0.01, 0.1, 0.5, 1] },
  in: { label: "in", factor: 25.4, step: 0.01, digits: 3, snaps: [0, 0.0625, 0.125, 0.25, 1] },
};

export const toDisplay = (mm, unit) => {
  const u = UNITS[unit];
  const f = 10 ** u.digits;
  return Math.round((mm / u.factor) * f) / f;
};

export const fromDisplay = (value, unit) => value * UNITS[unit].factor;

// Short readout for sizes, e.g. "64.0" or "2.52".
export const fmtLen = (mm, unit) => {
  const v = mm / UNITS[unit].factor;
  if (unit === "mm") return v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return v.toFixed(unit === "in" ? 2 : 1);
};

export const snapLabel = (step, unit) => {
  if (!step) return "Off";
  if (unit === "in") {
    const frac = { 0.0625: "1/16", 0.125: "1/8", 0.25: "1/4" }[step];
    return `${frac || step}"`;
  }
  return `${step} ${unit}`;
};
