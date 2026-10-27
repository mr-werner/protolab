// CAD engine shared by the web worker and the Node tests. It keeps a cache of
// built shapes (by geometry, not placement) and imported files (by id).
import * as R from "replicad";
import { buildShape, place, centered } from "./shapes.js";
import { readThreeMF } from "./threemf.js";

const shapeCache = new Map(); // geometry key -> local solid
const imports = new Map(); // import id -> { kind: "solid" | "mesh", shape }
const fonts = new Set();

const MESH_OPTS = { tolerance: 0.08, angularTolerance: 0.25 };

export async function loadFonts(list) {
  for (const { family, data } of list) {
    await R.loadFont(data, family);
    fonts.add(family);
  }
}

function geometryKey(obj) {
  return obj.type === "import" ? `import:${obj.params.importId}` : `${obj.type}:${JSON.stringify(obj.params)}`;
}

function localShape(obj) {
  if (obj.type === "import") {
    const entry = imports.get(obj.params.importId);
    if (!entry) throw new Error("This imported file is no longer loaded. Import it again.");
    return entry.shape;
  }
  const key = geometryKey(obj);
  let shape = shapeCache.get(key);
  if (!shape) {
    shape = buildShape(obj, fonts);
    shapeCache.set(key, shape);
    if (shapeCache.size > 200) shapeCache.delete(shapeCache.keys().next().value);
  }
  return shape;
}

function isMesh(obj) {
  return obj.type === "import" && imports.get(obj.params.importId)?.kind === "mesh";
}

function toBuffers(mesh) {
  return {
    vertices: Float32Array.from(mesh.vertices),
    normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
    triangles: Uint32Array.from(mesh.triangles),
  };
}

// Triangle mesh of one object in its local frame, for the viewport.
export function meshObject(obj) {
  const shape = localShape(obj);
  if (isMesh(obj)) return toBuffers(shape.mesh());
  return toBuffers(shape.mesh(MESH_OPTS));
}

export async function importFile(id, name, bytes) {
  const lower = name.toLowerCase();
  const blob = new Blob([bytes]);
  let entry;
  if (lower.endsWith(".step") || lower.endsWith(".stp")) {
    entry = { kind: "solid", shape: centered(await R.importSTEP(blob)) };
  } else if (lower.endsWith(".stl")) {
    entry = { kind: "mesh", shape: centered(await R.importSTLAsMesh(blob)) };
  } else if (lower.endsWith(".3mf")) {
    const stl = readThreeMF(bytes);
    entry = { kind: "mesh", shape: centered(await R.importSTLAsMesh(new Blob([stl]))) };
  } else {
    throw new Error("Use a .step, .stp, .stl or .3mf file.");
  }
  if (entry.kind === "mesh" && entry.shape.isEmpty) throw new Error("That file has no printable geometry.");
  imports.set(id, entry);
  const [min, max] = entry.shape.boundingBox.bounds;
  return { kind: entry.kind, size: max.map((v, i) => v - min[i]) };
}

// Combines everything: solids are joined, then holes are cut out of them.
function combine(objects) {
  const solids = objects.filter((o) => !o.hole && !o.hidden);
  const holes = objects.filter((o) => o.hole && !o.hidden);
  if (!solids.length) throw new Error("Add at least one solid shape first.");
  const meshMode = objects.some((o) => !o.hidden && isMesh(o));
  const placed = (o) => {
    const s = place(localShape(o).clone(), o);
    return meshMode && !isMesh(o) ? s.meshShape(MESH_OPTS) : s;
  };
  let result = placed(solids[0]);
  for (const o of solids.slice(1)) result = result.fuse(placed(o));
  for (const o of holes) result = result.cut(placed(o));
  return { result, meshMode };
}

export function preview(objects) {
  const { result, meshMode } = combine(objects);
  const mesh = meshMode ? result.mesh() : result.mesh(MESH_OPTS);
  const volume = meshMode ? result.volume() : R.measureVolume(result);
  return { mesh: toBuffers(mesh), volume, meshMode };
}

export async function exportModel(objects, format) {
  const { result, meshMode } = combine(objects);
  if (format === "step") {
    if (meshMode) throw new Error("Designs with an imported .stl or .3mf can only be saved as .stl.");
    return { blob: result.blobSTEP(), meshMode };
  }
  const blob = meshMode ? result.blobSTL({ binary: true }) : result.blobSTL({ ...MESH_OPTS, binary: true });
  return { blob, meshMode };
}

export function forgetImport(id) {
  imports.delete(id);
}
