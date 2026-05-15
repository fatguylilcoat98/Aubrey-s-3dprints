/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Thin three.js wrapper: a reusable 3D preview + STL export, plus helpers
 * to turn JSCAD geometry and loaded GLB models into print-ready meshes.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { geometries } from '@jscad/modeling';

const FONT_URL =
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json';

let _fontPromise = null;
export function loadFont() {
  if (!_fontPromise) {
    _fontPromise = new Promise((resolve, reject) => {
      new FontLoader().load(FONT_URL, resolve, undefined, reject);
    });
  }
  return _fontPromise;
}

/** Convert a JSCAD geom3 into a non-indexed THREE.BufferGeometry (mm units). */
export function jscadToGeometry(geom) {
  const polys = geometries.geom3.toPolygons(geom);
  const positions = [];
  for (const poly of polys) {
    const v = poly.vertices;
    for (let i = 1; i < v.length - 1; i++) {
      positions.push(
        v[0][0], v[0][1], v[0][2],
        v[i][0], v[i][1], v[i][2],
        v[i + 1][0], v[i + 1][1], v[i + 1][2]
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Build an extruded text geometry sitting flat on the XY plane (Z = up). */
export function makeTextGeometry(font, text, size, height) {
  const g = new TextGeometry(text || ' ', {
    font,
    size,
    height,
    curveSegments: 6,
    bevelEnabled: false,
  });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // Center on X/Y, then lay it down so extrusion is along +Z.
  g.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
  return g;
}

/** Merge a list of BufferGeometries (strips UVs / indices so JSCAD + text mix). */
export function mergeGeoms(list) {
  const clean = list.map((g) => {
    const x = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(x.attributes)) {
      if (name !== 'position') x.deleteAttribute(name);
    }
    x.clearGroups();
    return x;
  });
  const merged = BufferGeometryUtils.mergeGeometries(clean, false);
  merged.computeVertexNormals();
  return merged;
}

/** Signed mesh volume in mm^3 (used for rough print-time estimate). */
export function geometryVolumeMm3(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.getAttribute('position');
  let vol = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
    const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return Math.abs(vol);
}

/**
 * Lightweight printability sanity check for AI-generated meshes.
 * Counts boundary edges (an edge used by ≠2 triangles → not watertight)
 * and the smallest bounding dimension (thin-wall proxy).
 * @returns {{triangles:number, openEdges:number, watertight:boolean,
 *   minDimMm:number, verdict:'ok'|'warn'|'bad', message:string}}
 */
export function analyzeMesh(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.getAttribute('position');
  const tris = p.count / 3;

  const key = (i) =>
    `${Math.round(p.getX(i) * 100)},${Math.round(p.getY(i) * 100)},${Math.round(
      p.getZ(i) * 100
    )}`;
  const edges = new Map();
  const addEdge = (a, b) => {
    const e = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(e, (edges.get(e) || 0) + 1);
  };
  for (let i = 0; i < p.count; i += 3) {
    const k0 = key(i), k1 = key(i + 1), k2 = key(i + 2);
    addEdge(k0, k1);
    addEdge(k1, k2);
    addEdge(k2, k0);
  }
  let openEdges = 0;
  for (const c of edges.values()) if (c !== 2) openEdges++;

  g.computeBoundingBox();
  const s = new THREE.Vector3();
  g.boundingBox.getSize(s);
  const minDimMm = Math.min(s.x, s.y, s.z);

  let verdict = 'ok';
  let message = 'Looks watertight and printable. Still eyeball it in your slicer.';
  if (openEdges > 0 || tris < 50) {
    verdict = openEdges > tris * 0.05 ? 'bad' : 'warn';
    message =
      `Mesh has ${openEdges} open edge${openEdges === 1 ? '' : 's'} — ` +
      (verdict === 'bad'
        ? 'likely not watertight. Regenerate, or repair in your slicer / Meshmixer before printing.'
        : 'minor gaps. Most slicers can auto-repair this; check before printing.');
  }
  if (verdict === 'ok' && minDimMm < 2) {
    verdict = 'warn';
    message = `Thinnest dimension is ~${minDimMm.toFixed(
      1
    )}mm — may be too thin to print. Scale up or thicken before printing.`;
  }
  return { triangles: tris, openEdges, watertight: openEdges === 0, minDimMm, verdict, message };
}

export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.position.set(80, 70, 110);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(60, 120, 80);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe6d0, 0.45);
    fill.position.set(-80, 30, -60);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(240, 24, 0xcdbfa6, 0xe3dac6);
    this.scene.add(this.grid);

    this.mesh = null;
    this.material = new THREE.MeshStandardMaterial({
      color: 0xff8a65,
      roughness: 0.6,
      metalness: 0.05,
      flatShading: false,
    });

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._resize();
    this._animate();
  }

  setColor(hex) {
    this.material.color.set(hex || '#ff8a65');
  }

  /** Replace the current model. Returns { boundsMm:[x,y,z], volumeMm3 }. */
  setGeometry(geometry) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);

    // Drop the model so it rests on the grid (Z-up models: min.z -> 0).
    geometry.translate(
      -(bb.max.x + bb.min.x) / 2,
      -(bb.max.y + bb.min.y) / 2,
      -bb.min.z
    );

    this.mesh = new THREE.Mesh(geometry, this.material);
    // three's grid sits on XY; rotate so model Z (height) points up.
    this.mesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.mesh);

    this._frame(size);
    this.currentGeometry = geometry;
    return {
      boundsMm: [size.x, size.y, size.z],
      volumeMm3: geometryVolumeMm3(geometry),
    };
  }

  _frame(size) {
    const maxDim = Math.max(size.x, size.y, size.z, 10);
    const dist = maxDim * 2.4;
    this.camera.position.set(dist * 0.7, dist * 0.65, dist);
    this.camera.near = maxDim / 100;
    this.camera.far = maxDim * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    const gs = Math.max(80, Math.ceil(maxDim / 20) * 20 * 2);
    this.grid.scale.setScalar(gs / 240);
  }

  /** Binary STL Blob of the current model. */
  exportSTLBlob() {
    if (!this.mesh) return null;
    const exporter = new STLExporter();
    const dv = exporter.parse(this.mesh, { binary: true });
    return new Blob([dv], { type: 'model/stl' });
  }

  /** Load a GLB url (Mode 2) and show it; returns bounds info. */
  async loadGLB(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const geos = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        geos.push(g);
      }
    });
    if (!geos.length) throw new Error('No mesh in generated model');
    const merged = mergeGeoms(geos);
    return this.setGeometry(merged);
  }

  _resize() {
    const w = this.container.clientWidth || 480;
    const h = this.container.clientHeight || 360;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
