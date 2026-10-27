import opencascade from "replicad-opencascadejs";
import Module from "manifold-3d";
import * as R from "replicad";
import fs from "fs";
import * as E from "../src/cad/engine.js";
import { TEMPLATES } from "../src/templates.js";
import { SHAPES, makeObject } from "../src/objects.js";
R.setOC(await opencascade()); const m = await Module(); m.setup?.(); R.setManifold(m);
const buf = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
await E.loadFonts([{ family: "Archivo Black", data: buf("public/fonts/archivo-black.woff") }, { family: "Pacifico", data: buf("public/fonts/pacifico.woff") }, { family: "Space Mono", data: buf("public/fonts/space-mono-bold.woff") }]);
const quiet = (fn) => async (...a) => { const w = process.stdout.write; process.stdout.write = () => true; try { return await fn(...a); } finally { process.stdout.write = w; } };
for (const t of Object.keys(SHAPES)) { const ob = makeObject(t); const mm = E.meshObject(ob); console.log("shape", t, mm.triangles.length/3, "tris"); }
for (const f of ["Pacifico", "Space Mono"]) { const ob = makeObject("text", { params: { text: "Hi Mom", font: f, size: 12, depth: 2 } }); console.log("font", f, E.meshObject(ob).triangles.length/3); }
for (const t of TEMPLATES) {
  const objs = t.build(); const t0 = Date.now();
  const p = E.preview(objs);
  const v = p.mesh.vertices; let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for (let i=0;i<v.length;i+=3) for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],v[i+k]); mx[k]=Math.max(mx[k],v[i+k]); }
  const step = await quiet(E.exportModel)(objs, "step");
  const stl = await E.exportModel(objs, "stl");
  
  console.log(t.id, "vol", p.volume.toFixed(0), "min", mn.map(x=>x.toFixed(1)).join(","), "max", mx.map(x=>x.toFixed(1)).join(","), "step", step.blob.size, "ms", Date.now()-t0);
}
// imports
const kc = await E.exportModel(TEMPLATES[0].build(), "stl");
console.log("import stl", await E.importFile("i1", "kc.stl", await kc.blob.arrayBuffer()));
const objs = [makeObject("import", { params: { importId: "i1" } }), makeObject("cylinder", { hole: true, params: { d: 10, h: 20 }, position: [10, 0, -5] })];
const pr = E.preview(objs); console.log("mesh mode", pr.meshMode, pr.volume.toFixed(0));
const st = await quiet(E.exportModel)(TEMPLATES[4].build(), "step");
console.log("import step", await quiet(E.importFile)("i2", "pot.STEP", await st.blob.arrayBuffer()));
try { await E.exportModel(objs, "step"); } catch (e) { console.log("expected:", e.message); }
