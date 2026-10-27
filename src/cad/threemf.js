// Minimal .3mf reader: unzips the package, collects every <mesh> and returns it
// as a binary STL. Runs in a worker, so it parses the XML with regular expressions.
import { unzipSync, strFromU8 } from "fflate";

const num = (s) => parseFloat(s);

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function parseTransform(t) {
  if (!t) return null;
  const v = t.trim().split(/\s+/).map(num);
  return v.length === 12 ? v : null;
}

function apply(m, [x, y, z]) {
  if (!m) return [x, y, z];
  return [
    x * m[0] + y * m[3] + z * m[6] + m[9],
    x * m[1] + y * m[4] + z * m[7] + m[10],
    x * m[2] + y * m[5] + z * m[8] + m[11],
  ];
}

function readMeshes(xml) {
  const objects = new Map();
  for (const obj of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const { id } = attrs(obj[1]);
    const body = obj[2];
    const meshMatch = body.match(/<mesh>([\s\S]*?)<\/mesh>/);
    const comps = [...body.matchAll(/<component\b([^>]*)\/?>/g)].map((c) => attrs(c[1]));
    let mesh = null;
    if (meshMatch) {
      const verts = [...meshMatch[1].matchAll(/<vertex\b([^>]*)\/?>/g)].map((v) => {
        const a = attrs(v[1]);
        return [num(a.x), num(a.y), num(a.z)];
      });
      const tris = [...meshMatch[1].matchAll(/<triangle\b([^>]*)\/?>/g)].map((t) => {
        const a = attrs(t[1]);
        return [+a.v1, +a.v2, +a.v3];
      });
      mesh = { verts, tris };
    }
    objects.set(id, { mesh, comps });
  }
  const builds = [...xml.matchAll(/<item\b([^>]*)\/?>/g)].map((i) => attrs(i[1]));
  return { objects, builds };
}

export function readThreeMF(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const models = Object.keys(files).filter((f) => f.toLowerCase().endsWith(".model"));
  if (!models.length) throw new Error("That .3mf file has no model inside.");
  const objects = new Map();
  let builds = [];
  for (const path of models) {
    const parsed = readMeshes(strFromU8(files[path]));
    for (const [id, o] of parsed.objects) if (!objects.has(id) || o.mesh) objects.set(id, o);
    if (/3dmodel\.model$/i.test(path) || !builds.length) builds = parsed.builds.length ? parsed.builds : builds;
  }

  const triangles = [];
  const emit = (id, matrix, depth = 0) => {
    const o = objects.get(id);
    if (!o || depth > 8) return;
    if (o.mesh) {
      for (const [a, b, c] of o.mesh.tris) {
        triangles.push([apply(matrix, o.mesh.verts[a]), apply(matrix, o.mesh.verts[b]), apply(matrix, o.mesh.verts[c])]);
      }
    }
    for (const c of o.comps) {
      const local = parseTransform(c.transform);
      emit(c.objectid, combine(matrix, local), depth + 1);
    }
  };
  if (builds.length) for (const b of builds) emit(b.objectid, parseTransform(b.transform));
  else for (const id of objects.keys()) emit(id, null);
  if (!triangles.length) throw new Error("That .3mf file has no triangles in it.");

  const buf = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, triangles.length, true);
  let off = 84;
  for (const tri of triangles) {
    off += 12; // normal left as zero; readers recompute it
    for (const v of tri) for (const c of v) { view.setFloat32(off, c, true); off += 4; }
    off += 2;
  }
  return new Uint8Array(buf);
}

// Composes two 3MF affine transforms: first `inner`, then `outer`.
function combine(outer, inner) {
  if (!outer) return inner;
  if (!inner) return outer;
  const p = (v) => apply(outer, v);
  const o = p([0, 0, 0]);
  const cols = [0, 1, 2].map((i) => {
    const axis = p([inner[i * 3], inner[i * 3 + 1], inner[i * 3 + 2]]);
    return axis.map((c, k) => c - o[k]);
  });
  const t = p([inner[9], inner[10], inner[11]]);
  return [...cols[0], ...cols[1], ...cols[2], ...t];
}
