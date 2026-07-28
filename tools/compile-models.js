#!/usr/bin/env node
'use strict';

// Compile catalogue HTML embedded in the authoritative metadata JSON into a
// small, declarative scene. Catalogue code is executed only by this offline
// build step, in a code-generation-disabled Node VM with no network globals;
// the game never executes it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/models');
const OUT = path.join(SRC, 'baked');
const THREE = path.join(ROOT, 'vendor/three.min.js');
const GEOMETRIES = new Set(['BoxGeometry', 'CylinderGeometry', 'SphereGeometry',
  'ConeGeometry', 'PlaneGeometry', 'CircleGeometry', 'RingGeometry',
  'TorusGeometry', 'IcosahedronGeometry', 'OctahedronGeometry',
  'DodecahedronGeometry', 'TetrahedronGeometry', 'LatheGeometry']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

function compile(entry) {
  const meta = JSON.parse(fs.readFileSync(path.join(SRC, entry.meta), 'utf8'));
  let seed = 2166136261;
  for (const c of entry.slug) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const sandbox = { console, Math: seededMath, Date, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener() {}, requestAnimationFrame() {}, document: {
      body: { appendChild() {} }, getElementById() { return { addEventListener() {} }; }
    } };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(fs.readFileSync(THREE, 'utf8'), sandbox, { timeout: 5000 });
  sandbox.THREE.WebGLRenderer = class { constructor() { this.domElement = {}; this.shadowMap = {}; }
    setPixelRatio() {} setSize() {} setClearColor() {} render() {} };
  sandbox.THREE.PMREMGenerator = class { compileEquirectangularShader() {} fromScene() { return { texture: null }; } };
  const scripts = [...meta.html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const script of scripts) vm.runInContext(script.replace(/window\.parent\.postMessage\s*\(/g, 'void ('), sandbox,
    { timeout: 15000, filename: entry.meta });
  if (!sandbox.MODEL || !sandbox.MODEL.root) throw new Error('payload did not expose window.MODEL.root');
  const scene = vm.runInContext(`(() => {
    const round = n => Object.is(n, -0) ? 0 : +n.toFixed(6);
    const vec = v => [round(v.x), round(v.y), round(v.z)];
    const materials = [], materialIds = new Map();
    function material(m) {
      if (Array.isArray(m)) throw new Error('material arrays are unsupported');
      if (!materialIds.has(m)) {
        const id = materials.length; materialIds.set(m, id);
        materials.push({
          type: m.type, color: m.color ? m.color.getHex() : 0xffffff,
          emissive: m.emissive ? m.emissive.getHex() : 0,
          emissiveIntensity: round(m.emissiveIntensity || 0),
          metalness: round(m.metalness || 0), roughness: round(m.roughness == null ? 1 : m.roughness),
          opacity: round(m.opacity == null ? 1 : m.opacity), transparent: !!m.transparent,
          side: m.side, flatShading: !!m.flatShading
        });
      }
      return materialIds.get(m);
    }
    const meshes = [], animations = [];
    MODEL.root.updateMatrixWorld(true);
    MODEL.root.traverse(o => {
      if (!o.isMesh) return;
      const p = o.geometry.parameters || {};
      const params = {};
      Object.keys(p).sort().forEach(k => {
        const v = p[k];
        if (typeof v === 'number') params[k] = round(v);
        else if (Array.isArray(v) && v.every(x => x && typeof x.x === 'number'))
          params[k] = v.map(x => [round(x.x), round(x.y)]);
      });
      const e = new THREE.Euler().setFromRotationMatrix(o.matrixWorld, 'XYZ');
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      o.matrixWorld.decompose(pos, quat, scale);
      e.setFromQuaternion(quat, 'XYZ');
      const index = meshes.length;
      meshes.push({ geometry: { type: o.geometry.type, parameters: params },
        position: vec(pos), rotation: vec(e), scale: vec(scale), material: material(o.material) });
      if (o.userData && ['pulse', 'float', 'spin', 'flame'].includes(o.userData.fx))
        animations.push({ mesh: index, type: o.userData.fx });
    });
    return { meshes, materials, animations };
  })()`, sandbox, { timeout: 5000 });
  for (const m of scene.meshes) if (!GEOMETRIES.has(m.geometry.type))
    throw new Error(`unsupported geometry ${m.geometry.type}`);
  return stable({ format: 'diabloid-primitive-scene', version: 1, slug: entry.slug,
    coordinateSystem: 'right-handed-y-up', unitsPerMetre: 1, pivot: meta.spec.pivot,
    meshes: scene.meshes, materials: scene.materials, animations: scene.animations });
}

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8'));
  const wanted = new Set(process.argv.slice(2));
  const entries = index.entries.filter(e => !wanted.size || wanted.has(e.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
  fs.mkdirSync(OUT, { recursive: true });
  const manifestEntries = [];
    for (const entry of entries) {
        const result = compile(entry);
        const name = entry.slug + '.scene.json';
        fs.writeFileSync(path.join(OUT, name), JSON.stringify(result) + '\n');
        manifestEntries.push({ slug: entry.slug, file: name });
        console.log(`compiled ${entry.slug}: ${result.meshes.length} meshes`);
    }
  // A partial invocation intentionally creates a partial, deterministic manifest.
  const manifest = stable({ kind: 'compiled-models', version: 1, entries: manifestEntries });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
})().catch(e => { console.error(e.stack || e); process.exit(1); });
