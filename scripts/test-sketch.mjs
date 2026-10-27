import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import * as E from "../src/cad/engine.js";
import { makeObject } from "../src/objects.js";
R.setOC(await opencascade());
const L = { kind: "poly", pts: [[0, 0], [60, 0], [60, 10], [10, 10], [10, 40], [0, 40]], radius: 2 };
const hole = { kind: "circle", c: [5, 30], r: 2 };
const arcy = { kind: "poly", pts: [[0, 0], [40, 0], [40, 20], [0, 20]], bulge: [0, 0, 8, 0] };
const cases = {
  "L extrude w/ hole": { op: "extrude", height: 8, shapes: [L, hole] },
  "arc top": { op: "extrude", height: 5, shapes: [arcy] },
  "revolve vase": { op: "revolve", angle: 360, shapes: [{ kind: "poly", pts: [[0, 0], [30, 0], [35, 40], [25, 80], [0, 80]], radius: 0 }] },
  "revolve half": { op: "revolve", angle: 180, shapes: [{ kind: "circle", c: [30, 10], r: 5 }] },
  "ring (circle in circle)": { op: "extrude", height: 3, shapes: [{ kind: "circle", c: [0, 0], r: 20 }, { kind: "circle", c: [0, 0], r: 15 }, { kind: "circle", c: [0, 0], r: 5 }] },
};
for (const [name, params] of Object.entries(cases)) {
  try {
    const o = makeObject("sketch", { params });
    const pr = E.preview([o]);
    const v = pr.mesh.vertices; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]); }
    console.log(name, "vol", pr.volume.toFixed(0), "bbox", mn.map((x) => x.toFixed(0)).join(","), "->", mx.map((x) => x.toFixed(0)).join(","));
  } catch (e) { console.log(name, "ERROR", e.message); }
}
try { E.preview([makeObject("sketch", { params: { op: "revolve", shapes: [{ kind: "circle", c: [0, 0], r: 5 }] } })]); } catch (e) { console.log("expected:", e.message); }
try { E.preview([makeObject("sketch", { params: { op: "extrude", height: 3, shapes: [{ kind: "poly", pts: [[0, 0], [10, 10], [10, 0], [0, 10]] }] } })]); } catch (e) { console.log("bowtie:", e.message); }
