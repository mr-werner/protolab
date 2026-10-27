import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { BUILD_VOLUME } from "../config.js";

const DEG = Math.PI / 180;

function makePlate() {
  const group = new THREE.Group();
  const { x, y } = BUILD_VOLUME;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(x, y),
    new THREE.MeshStandardMaterial({ color: 0x1d2329, roughness: 0.9, metalness: 0.05 })
  );
  plate.position.z = -0.05;
  plate.receiveShadow = true;
  plate.userData.plate = true;
  group.add(plate);

  const pts = [];
  for (let i = -x / 2; i <= x / 2 + 0.01; i += 10) pts.push(i, -y / 2, 0, i, y / 2, 0);
  for (let j = -y / 2; j <= y / 2 + 0.01; j += 10) pts.push(-x / 2, j, 0, x / 2, j, 0);
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0x33404a })
  );
  group.add(grid);

  const axes = new THREE.Group();
  const axis = (dir, color) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.05), dir.clone().multiplyScalar(24).setZ(dir.z * 24 + 0.05)]);
    axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color })));
  };
  axis(new THREE.Vector3(1, 0, 0), 0xff5a4a);
  axis(new THREE.Vector3(0, 1, 0), 0x5ad17a);
  axis(new THREE.Vector3(0, 0, 1), 0x4a8bff);
  axes.position.set(-x / 2, -y / 2, 0);
  group.add(axes);
  return group;
}

function makeVolume() {
  const { x, y, z } = BUILD_VOLUME;
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(x, y, z)),
    new THREE.LineDashedMaterial({ color: 0x5b7184, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.8 })
  );
  box.position.z = z / 2;
  box.computeLineDistances();
  return box;
}

const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });

function toGeometry(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
  g.setIndex(new THREE.BufferAttribute(data.triangles, 1));
  if (data.normals && data.normals.length === data.vertices.length) g.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  else g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function geometryFromData(data) {
  return toGeometry(data);
}


// The 3D view. `objects` and `geometries` drive what is shown; the parent gets
// selection changes, gizmo edits and measurements through the callbacks.
export default function Viewport({
  objects,
  geometries,
  selectedIds,
  color,
  mode,
  snap,
  rotateSnap,
  combined,
  showCombined,
  outOfBounds,
  measureLabel,
  onSelect,
  onTransform,
  onTransformEnd,
  onResizeEnd,
  onMeasure,
  onBounds,
  apiRef,
}) {
  const hostRef = useRef(null);
  const labelRef = useRef(null);
  const state = useRef(null);
  const props = useRef({});
  props.current = { onSelect, onTransform, onTransformEnd, onResizeEnd, onMeasure, onBounds, mode };

  useEffect(() => {
    const host = hostRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161a);
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(220, -300, 230);

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20262c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(150, -200, 400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 10, far: 1200 });
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.7);
    fill.position.set(-250, 200, 120);
    scene.add(fill);

    const plate = makePlate();
    scene.add(plate);
    const volume = makeVolume();
    scene.add(volume);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 30);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
    orbit.maxDistance = 1600;
    orbit.update();

    // Several selected parts move together through this pivot.
    const pivot = new THREE.Object3D();
    scene.add(pivot);
    let dragStart = null; // { pivot: Matrix4, parts: Map<id, Matrix4> }

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.9);
    const gizmoHelper = gizmo.getHelper ? gizmo.getHelper() : gizmo;
    scene.add(gizmoHelper);

    const meshes = new Map();
    const round = (v, n = 100) => Math.round(v * n) / n;
    const partInfo = (m) => ({
      position: m.position.toArray().map((v) => round(v)),
      rotation: [m.rotation.x, m.rotation.y, m.rotation.z].map((r) => round(r / DEG)),
    });

    gizmo.addEventListener("dragging-changed", (e) => {
      orbit.enabled = !e.value;
      const target = gizmo.object;
      if (!target) return;
      if (e.value) {
        target.updateMatrixWorld(true);
        dragStart = { pivot: target.matrixWorld.clone(), scale: target.scale.clone(), parts: new Map() };
        if (target === pivot) for (const id of state.current.selection) dragStart.parts.set(id, meshes.get(id).matrixWorld.clone());
        return;
      }
      if (props.current.mode === "scale" && target !== pivot && dragStart) {
        const f = [0, 1, 2].map((k) => Math.abs(target.scale.getComponent(k) / dragStart.scale.getComponent(k)));
        target.scale.copy(dragStart.scale);
        if (f.some((v) => Math.abs(v - 1) > 0.001)) props.current.onResizeEnd?.(target.userData.id, f);
      } else {
        props.current.onTransformEnd?.();
      }
      dragStart = null;
    });
    gizmo.addEventListener("objectChange", () => {
      const target = gizmo.object;
      if (!target || props.current.mode === "scale") return;
      if (target !== pivot) {
        props.current.onTransform?.({ [target.userData.id]: partInfo(target) });
        return;
      }
      if (!dragStart) return;
      pivot.updateMatrixWorld(true);
      const delta = pivot.matrixWorld.clone().multiply(dragStart.pivot.clone().invert());
      const patch = {};
      for (const [id, start] of dragStart.parts) {
        const mesh = meshes.get(id);
        if (!mesh) continue;
        const m = delta.clone().multiply(start);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        m.decompose(pos, quat, scl);
        // A mirrored part has a negative X scale baked into the matrix.
        if (mesh.userData.mirror) {
          const fixed = m.clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
          fixed.decompose(pos, quat, scl);
        }
        const e = new THREE.Euler().setFromQuaternion(quat, "ZYX");
        patch[id] = { position: pos.toArray().map((v) => round(v)), rotation: [e.x, e.y, e.z].map((r) => round(r / DEG)) };
      }
      props.current.onTransform?.(patch);
    });

    const combinedMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
    combinedMesh.castShadow = true;
    combinedMesh.visible = false;
    scene.add(combinedMesh);

    // Measuring: two clicked points, a line between them and a label.
    const measure = new THREE.Group();
    const dotGeo = new THREE.SphereGeometry(1, 16, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false });
    const dots = [new THREE.Mesh(dotGeo, dotMat), new THREE.Mesh(dotGeo, dotMat)];
    dots.forEach((d) => {
      d.renderOrder = 10;
      d.visible = false;
      measure.add(d);
    });
    const measureLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false })
    );
    measureLine.renderOrder = 10;
    measureLine.visible = false;
    measure.add(measureLine);
    scene.add(measure);
    let points = [];
    const showMeasure = () => {
      dots.forEach((d, i) => {
        d.visible = !!points[i];
        if (points[i]) d.position.copy(points[i]);
      });
      measureLine.visible = points.length === 2;
      if (points.length === 2) measureLine.geometry.setFromPoints(points);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Click to select (ignores drags so orbiting doesn't change the selection).
    const ray = new THREE.Raycaster();
    let down = null;
    const onDown = (e) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || gizmo.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      if (props.current.mode === "measure") {
        const targets = [...meshes.values()].filter((m) => m.visible);
        if (combinedMesh.visible) targets.push(combinedMesh);
        targets.push(plate.children[0]);
        const hit = ray.intersectObjects(targets, false)[0];
        if (!hit) return;
        points = points.length >= 2 ? [hit.point.clone()] : [...points, hit.point.clone()];
        showMeasure();
        props.current.onMeasure?.(points.length === 2 ? points.map((v) => v.toArray()) : points.length ? "first" : null);
        return;
      }
      const hits = ray.intersectObjects([...meshes.values()].filter((m) => m.visible), false);
      props.current.onSelect?.(hits.length ? hits[0].object.userData.id : null, e.shiftKey || e.ctrlKey || e.metaKey);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf;
    const tmp = new THREE.Vector3();
    const loop = () => {
      orbit.update();
      renderer.render(scene, camera);
      const label = labelRef.current;
      if (label) {
        if (points.length === 2 && label.textContent) {
          tmp.copy(points[0]).add(points[1]).multiplyScalar(0.5).project(camera);
          label.style.display = "block";
          label.style.transform = `translate(-50%, -130%) translate(${((tmp.x + 1) / 2) * host.clientWidth}px, ${((1 - tmp.y) / 2) * host.clientHeight}px)`;
        } else label.style.display = "none";
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    state.current = { renderer, scene, camera, orbit, gizmo, meshes, combinedMesh, volume, pivot, selection: [], clearMeasure: () => ((points = []), showMeasure()) };

    if (apiRef) {
      apiRef.current = {
        frame(box) {
          const target = box && !box.isEmpty() ? box : new THREE.Box3(new THREE.Vector3(-60, -60, 0), new THREE.Vector3(60, 60, 60));
          const center = target.getCenter(new THREE.Vector3());
          const size = Math.max(target.getSize(new THREE.Vector3()).length(), 60);
          const dir = new THREE.Vector3(0.55, -0.75, 0.55).normalize();
          orbit.target.copy(center);
          camera.position.copy(center).addScaledVector(dir, (size * 1.6) / Math.min(1, camera.aspect * 1.1));
          orbit.update();
        },
        // World-space boxes of the given parts.
        boxes(ids) {
          const out = new Map();
          for (const id of ids) {
            const m = meshes.get(id);
            if (!m || !m.geometry.attributes.position) continue;
            m.updateMatrixWorld(true);
            out.set(id, new THREE.Box3().setFromObject(m, true));
          }
          return out;
        },
        clearMeasure: () => state.current.clearMeasure(),
        snapshot: () => renderer.domElement.toDataURL("image/png"),
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  // Sync meshes with the objects list.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const selected = new Set(selectedIds);
    const seen = new Set();
    const solidColor = new THREE.Color(color);
    const dragging = s.gizmo.dragging;
    for (const obj of objects) {
      seen.add(obj.id);
      const geom = geometries.get(obj.geomKey);
      let mesh = s.meshes.get(obj.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
        mesh.userData.id = obj.id;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        s.scene.add(mesh);
        s.meshes.set(obj.id, mesh);
      }
      if (geom && mesh.geometry !== geom) {
        mesh.geometry = geom;
        // Dark crease lines make stacked faces (like raised text) readable.
        if (mesh.userData.edges) mesh.remove(mesh.userData.edges);
        if (!geom.userData.edges) geom.userData.edges = new THREE.EdgesGeometry(geom, 28);
        const edges = new THREE.LineSegments(geom.userData.edges, edgeMaterial);
        edges.raycast = () => {};
        mesh.add(edges);
        mesh.userData.edges = edges;
      }
      mesh.visible = !obj.hidden && !!geom && !showCombined;
      mesh.userData.mirror = !!obj.mirror;
      const beingDragged = dragging && (s.gizmo.object === mesh || (s.gizmo.object === s.pivot && selected.has(obj.id)));
      if (!beingDragged || s.gizmo.object === s.pivot) {
        mesh.position.fromArray(obj.position);
        mesh.rotation.set(obj.rotation[0] * DEG, obj.rotation[1] * DEG, obj.rotation[2] * DEG, "ZYX");
      }
      mesh.rotation.order = "ZYX";
      if (!(dragging && mode === "scale" && s.gizmo.object === mesh)) {
        const k = obj.scale || 1;
        mesh.scale.set(obj.mirror ? -k : k, k, k);
      }
      const mat = mesh.material;
      const isSel = selected.has(obj.id);
      if (obj.hole) {
        mat.color.set(isSel ? 0xff9d7a : 0xb9c3cc);
        mat.transparent = true;
        mat.opacity = isSel ? 0.45 : 0.3;
        mat.depthWrite = false;
        mat.emissive.set(0x000000);
        mesh.castShadow = false;
      } else {
        mat.color.copy(solidColor);
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.emissive.set(isSel ? 0x3a1a08 : 0x000000);
        mesh.castShadow = true;
      }
      mat.roughness = 0.55;
      mat.metalness = 0.05;
      mat.needsUpdate = true;
    }
    for (const [id, mesh] of s.meshes) {
      if (!seen.has(id)) {
        if (s.gizmo.object === mesh) s.gizmo.detach();
        s.scene.remove(mesh);
        mesh.material.dispose();
        s.meshes.delete(id);
      }
    }

    // Gizmo: on the part itself for one selection, on a pivot for several.
    s.selection = selectedIds.filter((id) => s.meshes.get(id)?.visible);
    const measuring = mode === "measure";
    if (!dragging) {
      if (!s.selection.length || showCombined || measuring) {
        if (s.gizmo.object) s.gizmo.detach();
      } else if (s.selection.length === 1) {
        const m = s.meshes.get(s.selection[0]);
        if (s.gizmo.object !== m) s.gizmo.attach(m);
      } else {
        const box = new THREE.Box3();
        for (const id of s.selection) {
          const m = s.meshes.get(id);
          m.updateMatrixWorld(true);
          box.expandByObject(m, true);
        }
        const c = box.getCenter(new THREE.Vector3());
        s.pivot.position.set(c.x, c.y, box.min.z);
        s.pivot.rotation.set(0, 0, 0);
        s.pivot.scale.set(1, 1, 1);
        s.pivot.updateMatrixWorld(true);
        if (s.gizmo.object !== s.pivot) s.gizmo.attach(s.pivot);
      }
    }
    const multi = s.selection.length > 1;
    const gizmoMode = mode === "rotate" ? "rotate" : mode === "scale" && !multi ? "scale" : "translate";
    s.gizmo.setMode(gizmoMode);
    s.gizmo.setSpace(gizmoMode === "translate" ? "world" : "local");
    s.gizmo.setTranslationSnap(snap || null);
    s.gizmo.setRotationSnap(rotateSnap ? rotateSnap * DEG : null);
    s.gizmo.setScaleSnap(null);
    if (!measuring) s.clearMeasure();

    // Combined result preview.
    s.combinedMesh.visible = !!(showCombined && combined);
    if (combined && s.combinedMesh.geometry !== combined) {
      s.combinedMesh.geometry = combined;
      if (s.combinedMesh.userData.edges) s.combinedMesh.remove(s.combinedMesh.userData.edges);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(combined, 28), edgeMaterial);
      s.combinedMesh.add(edges);
      s.combinedMesh.userData.edges = edges;
    }
    s.combinedMesh.material.color.copy(solidColor);

    s.volume.material.color.set(outOfBounds ? 0xff5a4a : 0x5b7184);

    // Report the design's bounds (solid parts only) to the parent.
    const box = new THREE.Box3();
    for (const obj of objects) {
      const mesh = s.meshes.get(obj.id);
      if (!mesh || obj.hole || obj.hidden || !geometries.get(obj.geomKey)) continue;
      mesh.updateMatrixWorld(true);
      box.expandByObject(mesh, true);
    }
    props.current.onBounds?.(box.isEmpty() ? null : box);
  }, [objects, geometries, selectedIds, color, mode, snap, rotateSnap, combined, showCombined, outOfBounds]);

  return (
    <div className="viewport" ref={hostRef}>
      <div className="b-measure-label" ref={labelRef}>
        {measureLabel}
      </div>
    </div>
  );
}
