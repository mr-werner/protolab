import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import * as E from "../src/cad/engine.js";
import { makeObject } from "../src/objects.js";
import { mirrorParts, circularRepeat, linearRepeat, resizePart } from "../src/builder/transforms.js";
R.setOC(await opencascade());
const box = makeObject("box", { params: { w: 40, d: 20, h: 10, radius: 0, edge: 2, edgeStyle: "round" }, position: [30, 0, 0], rotation: [0, 0, 30] });
const bev = makeObject("cylinder", { params: { d: 20, h: 10, edge: 1, edgeStyle: "bevel" }, position: [-30, 0, 0] });
let list = [box, bev];
const before = E.preview(list).volume;
list = mirrorParts(list, [box.id], 0, 0);
const mir = list[0];
console.log("mirror pos", mir.position, "rot", mir.rotation, "flag", mir.mirror, "vol same", Math.abs(E.preview(list).volume - before) < 1);
// mirrored box should now be centered at x=-30 overlapping cylinder
const bb = (objs) => { const m = E.preview(objs).mesh.vertices; let mn = 1e9, mx = -1e9; for (let i = 0; i < m.length; i += 3) { mn = Math.min(mn, m[i]); mx = Math.max(mx, m[i]); } return [mn.toFixed(1), mx.toFixed(1)]; };
console.log("x range after mirror", bb([mir]), "orig", bb([box]));
const lin = linearRepeat([box], [box.id], 3, [50, 0, 0]); console.log("linear", lin.list.map((o) => o.position[0]));
const cir = circularRepeat([box], [box.id], 4, 360, [0, 0]); console.log("circular", cir.list.map((o) => o.position.map((v) => v.toFixed(0)).join(",") + " rz" + o.rotation[2]));
console.log("resize", resizePart(box, [2, 1, 0.5]).params);
try { E.meshObject(makeObject("box", { params: { w: 10, d: 10, h: 2, edge: 5, edgeStyle: "round" } })); } catch (e) { console.log("expected:", e.message); }
