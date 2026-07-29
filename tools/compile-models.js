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
const KEEP_DECALS = process.argv.includes('--keep-decals');
const SRC = path.join(ROOT, 'assets/models');
const OUT = path.join(SRC, 'baked');
const THREE = path.join(ROOT, 'vendor/three.min.js');
const GEOMETRIES = new Set(['BoxGeometry', 'CylinderGeometry', 'SphereGeometry',
  'ConeGeometry', 'PlaneGeometry', 'CircleGeometry', 'RingGeometry',
  'TorusGeometry', 'IcosahedronGeometry', 'OctahedronGeometry',
  'DodecahedronGeometry', 'TetrahedronGeometry', 'LatheGeometry']);

// The checked-in index is deliberately only a small sample, while developers
// may have the complete catalogue payloads in this directory. Treat the index
// as metadata, not as the authority for what exists: a branch switch must not
// make valid, locally present models disappear from the next compile.
function discoverEntries(src = SRC) {
  const indexFile = path.join(src, 'index.json');
  const index = fs.existsSync(indexFile)
    ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { entries: [] };
  const bySlug = new Map();
  for (const entry of index.entries || []) {
    if (!entry || typeof entry.slug !== 'string' || typeof entry.meta !== 'string') continue;
    if (path.basename(entry.meta) !== entry.meta || !fs.existsSync(path.join(src, entry.meta))) continue;
    bySlug.set(entry.slug, entry);
  }

  for (const meta of fs.readdirSync(src).filter(name => name !== 'index.json' && name.endsWith('.json')).sort()) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(src, meta), 'utf8')); }
    catch (e) { continue; } // compile() reports malformed indexed payloads; unrelated JSON is ignored.
    if (!doc || typeof doc.slug !== 'string' || !doc.html || !doc.spec) continue;
    const slug = doc.slug;
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const existing = bySlug.get(slug);
    if (existing && existing.meta !== meta)
      throw new Error(`duplicate model slug ${slug}: ${existing.meta} and ${meta}`);
    if (!existing) bySlug.set(slug, { slug, meta, html: `${slug}.html` });
  }
  return { entries: [...bySlug.values()], indexed: (index.entries || []).length };
}

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
  // Catalogue payloads generate their own textures from a 2D canvas — blob
  // shadows, gradient ramps and the like. Without document.createElement the
  // payload throws before it ever builds MODEL.root, so the model is lost for
  // a reason that has nothing to do with its geometry. The canvas is inert:
  // nothing is drawn, it exists so THREE.CanvasTexture has something to hold.
  const gradient = () => ({ addColorStop() {} });
  const ctx2d = () => new Proxy({
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    globalAlpha: 1, globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter',
    shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)',
    createRadialGradient: gradient, createLinearGradient: gradient, createConicGradient: gradient,
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
    getImageData: (x, y, w, h) => ({ width: w | 0, height: h | 0,
      data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) }),
    createImageData: (w, h) => ({ width: w | 0, height: h | 0,
      data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) }),
  }, {
    // Any drawing call a payload reaches for is a no-op rather than a crash.
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const makeCanvas = () => {
    const c = { width: 300, height: 150, style: {},
      getContext: () => c._ctx || (c._ctx = ctx2d()),
      toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {},
      appendChild() {}, setAttribute() {}, getBoundingClientRect: () => ({ width: 300, height: 150, top: 0, left: 0 }) };
    return c;
  };
  const makeEl = (tag) => (String(tag).toLowerCase() === 'canvas' ? makeCanvas()
    : { style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {},
        setAttribute() {}, getContext: () => null });
  // Deferred construction has to actually run.
  //
  // These were no-ops, which silently lost every payload that waits for the
  // document before building its model: the scripts completed, nothing threw,
  // and MODEL.root was simply never assigned. Callbacks are queued here and
  // flushed once the scripts have been evaluated.
  //
  // readyState is 'complete' so a payload that branches on it initialises
  // immediately; one that registers unconditionally is caught by the flush.
  const ready = [], frames = [];
  const onEvent = (type, fn) => {
    if (typeof fn === 'function' && (type === 'DOMContentLoaded' || type === 'load')) ready.push(fn);
  };
  // Compilation has to be reproducible. Math.random is already seeded per slug
  // for exactly that reason, but the clock was left live, and the catalogue's
  // animation code reads it: three consecutive compiles of the same payload
  // produced yaws of 0, 0.00035 and 0. A turntable advancing by two hundredths
  // of a degree is invisible, but non-reproducible output is not — it makes
  // `git diff` on the baked scenes useless for telling a real change from a
  // re-run, which is the only cheap check there is that a pipeline edit did
  // not move geometry.
  //
  // The clock is therefore frozen rather than seeded: a model is a pose, not a
  // moment, and every payload should be captured at the same instant of its
  // idle. performance.now() is provided for the same reason and because it was
  // absent entirely, so a payload reaching for it threw into the init guard
  // and lost its model for an unrelated reason.
  const EPOCH = 0;
  function FrozenDate(...args) { return args.length ? new Date(...args) : new Date(EPOCH); }
  FrozenDate.prototype = Date.prototype;
  FrozenDate.now = () => EPOCH;
  FrozenDate.parse = Date.parse; FrozenDate.UTC = Date.UTC;
  const sandbox = { console, Math: seededMath, Date: FrozenDate,
    performance: { now: () => EPOCH },
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener: onEvent, removeEventListener() {},
    requestAnimationFrame(fn) { if (typeof fn === 'function') frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    setTimeout(fn) { if (typeof fn === 'function') ready.push(fn); return 0; },
    clearTimeout() {},
    document: {
      readyState: 'complete',
      body: { appendChild() {} },
      addEventListener: onEvent, removeEventListener() {},
      getElementById() { return { addEventListener() {}, appendChild() {}, style: {} }; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      createElement: makeEl, createElementNS: (ns, tag) => makeEl(tag),
    } };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(fs.readFileSync(THREE, 'utf8'), sandbox, { timeout: 5000 });
  // Keep hold of Object3D subtrees as catalogue code assembles them. Some
  // payload families (notably the RAGM actors) keep their model in a closure
  // instead of publishing window.MODEL, so inspecting global names can never
  // find them. Object3D.add is a considerably stronger boundary: regardless
  // of the variable name, a renderable model must be attached to a group or
  // scene. The original method still does all the work; this is observation
  // only, and the candidates are ranked after construction has finished.
  vm.runInContext(`(() => {
    globalThis.__OBJECT3D_ADDITIONS__ = [];
    const add = THREE.Object3D.prototype.add;
    THREE.Object3D.prototype.add = function (...objects) {
      for (const object of objects) if (object && object.isObject3D)
        globalThis.__OBJECT3D_ADDITIONS__.push(object);
      return add.apply(this, objects);
    };
  })()`, sandbox, { timeout: 5000 });
  sandbox.THREE.WebGLRenderer = class { constructor() { this.domElement = {}; this.shadowMap = {}; }
    setPixelRatio() {} setSize() {} setClearColor() {} render() {} };
  sandbox.THREE.PMREMGenerator = class { compileEquirectangularShader() {} fromScene() { return { texture: null }; } };
  const scripts = [...meta.html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (const script of scripts) vm.runInContext(script.replace(/window\.parent\.postMessage\s*\(/g, 'void ('), sandbox,
    { timeout: 15000, filename: entry.meta });
  // Flush whatever the payload deferred. A self-scheduling animation loop
  // re-queues itself, so only the callbacks pending at flush time are run, and
  // only for a couple of rounds — enough to build a model, not enough to spin.
  const flush = () => {
    for (const fn of ready.splice(0)) { try { fn.call(sandbox); } catch (e) { /* payload's own init guard */ } }
    for (let round = 0; round < 2; round++) {
      const due = frames.splice(0);
      if (!due.length) break;
      for (const fn of due) { try { fn.call(sandbox, round * 16); } catch (e) { /* ditto */ } }
    }
  };
  flush();
  if (typeof sandbox.onload === 'function') { try { sandbox.onload.call(sandbox); } catch (e) {} flush(); }

  // Find the model.
  //
  // `window.MODEL.root` is the documented contract and is tried first, but
  // every monster payload in the catalogue failed it while every prop passed,
  // which says the shape varies rather than that fifteen files are broken.
  // So a few obvious equivalents are accepted too.
  //
  // The guard that matters: a candidate must contain meshes and must NOT
  // contain a camera or a light. That is what separates the model from the
  // catalogue's whole preview scene — and pulling in the preview scene means
  // pulling in its ground plane, which is exactly how earlier bakes ended up
  // with an opaque slab under everything.
  const root = vm.runInContext(`(() => {
    const looksLikeModel = (o) => {
      if (!o || !o.isObject3D) return false;
      let meshes = 0, bad = 0;
      o.traverse(n => {
        if (n.isMesh) meshes++;
        if (n.isCamera || n.isLight) bad++;
      });
      return meshes > 0 && bad === 0;
    };
    const tried = [];
    const consider = (label, o) => {
      if (!o) return null;
      tried.push(label + (o.isObject3D ? ':Object3D' : ':' + typeof o));
      return looksLikeModel(o) ? o : null;
    };
    let found = null;
    if (typeof MODEL !== 'undefined' && MODEL) {
      found = consider('MODEL.root', MODEL.root) || consider('MODEL', MODEL)
        || consider('MODEL.group', MODEL.group) || consider('MODEL.object', MODEL.object)
        || consider('MODEL.mesh', MODEL.mesh) || consider('MODEL.model', MODEL.model);
    }
    if (!found) for (const key of ['MONSTER', 'ACTOR', 'ROOT', 'model', 'root', 'group']) {
      found = consider(key, globalThis[key]);
      if (found) break;
    }
    // Closure-local models cannot be reached by name. Prefer the largest
    // usable subtree observed while the payload called Object3D.add(). A
    // preview scene is rejected by looksLikeModel because it contains its
    // camera/lights; a model group remains a valid candidate. Stable insertion
    // order breaks ties, so this does not introduce machine-dependent output.
    if (!found) {
      const observed = (globalThis.__OBJECT3D_ADDITIONS__ || []).map((o, order) => {
        let meshes = 0;
        if (o && o.isObject3D) o.traverse(n => { if (n.isMesh) meshes++; });
        return { o, order, meshes };
      }).filter(x => looksLikeModel(x.o))
        .sort((a, b) => b.meshes - a.meshes || a.order - b.order);
      if (observed.length) {
        found = observed[0].o;
        tried.push('observed Object3D subtree:' + observed[0].meshes + ' meshes');
      }
    }
    return { found, tried, observed: (globalThis.__OBJECT3D_ADDITIONS__ || []).length,
      modelKeys: (typeof MODEL !== 'undefined' && MODEL && !MODEL.isObject3D)
      ? Object.keys(MODEL).slice(0, 20) : null };
  })()`, sandbox, { timeout: 5000 });

  if (!root.found) {
    // Report what the payload DID expose. A bare "did not expose MODEL.root"
    // costs a round trip to a human who has the file; this does not.
    const detail = [
      root.modelKeys ? `window.MODEL keys: [${root.modelKeys.join(', ')}]` : 'window.MODEL: absent',
      root.tried.length ? `candidates seen: ${root.tried.join(', ')}` : 'no Object3D globals found',
      `Object3D additions observed: ${root.observed}`,
      `scripts executed: ${scripts.length}`,
    ].join('; ');
    throw new Error(`${entry.slug}: no usable model root — ${detail}`);
  }
  sandbox.__ROOT__ = root.found;
  sandbox.KEEP_DECALS = KEEP_DECALS;
  const scene = vm.runInContext(`(() => {
    const round = n => Object.is(n, -0) ? 0 : +n.toFixed(6);
    const vec = v => [round(v.x), round(v.y), round(v.z)];
    const materials = [], byObject = new Map(), byValue = new Map();
    // Two materials that describe the same appearance ARE the same material.
    //
    // This used to key only on object identity, which is not how the catalogue
    // builds scenes: each part constructs its own MeshStandardMaterial, so a
    // model made of one grey stone emitted one entry per part. runic-pillar
    // carried 40 entries that were 31 distinct descriptions; a bookcase carried
    // 73 that were nearly all the same wood.
    //
    // That reads as file redundancy and is not. The renderer merges static
    // parts per material and draws one mesh each, so a duplicated description
    // is a duplicated draw call — and a model whose parts each held a private
    // material got no merge at all, which is why bookcase compiled to 73
    // primitives and 73 draws.
    //
    // Object identity is still checked first, purely to avoid re-describing a
    // shared material once per mesh that uses it.
    function material(m) {
      if (Array.isArray(m)) throw new Error('material arrays are unsupported');
      if (byObject.has(m)) return byObject.get(m);
      const desc = {
        type: m.type, color: m.color ? m.color.getHex() : 0xffffff,
        emissive: m.emissive ? m.emissive.getHex() : 0,
        emissiveIntensity: round(m.emissiveIntensity || 0),
        metalness: round(m.metalness || 0), roughness: round(m.roughness == null ? 1 : m.roughness),
        opacity: round(m.opacity == null ? 1 : m.opacity), transparent: !!m.transparent,
        side: m.side, flatShading: !!m.flatShading
      };
      // The scene contract carries no textures. A material that HAD one is
      // recorded so the loss is reported instead of silently changing how the
      // model looks — a transparent blob-shadow plane, for instance, becomes an
      // opaque slab once its alpha map is gone. Carrying it in the description
      // also keeps two materials apart when only their dropped textures differ.
      const maps = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap',
        'metalnessMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap']
        .filter(k => m[k]);
      if (maps.length) desc.droppedMaps = maps.slice().sort();
      // Key order is fixed by the literal above, so this is stable across runs.
      const key = JSON.stringify(desc);
      let id = byValue.get(key);
      if (id === undefined) { id = materials.length; materials.push(desc); byValue.set(key, id); }
      byObject.set(m, id);
      return id;
    }
    const meshes = [], animations = [], dropped = [];
    // A flat, transparent, texture-only plane is a painted decal — the
    // catalogue's fake blob shadow. The scene contract carries no textures, so
    // emitting it produces a solid dark quad under the model instead of a soft
    // shadow. The game casts real shadows, so the decal is unwanted anyway.
    // This is the ONLY mesh the compiler removes, the rule is narrow on
    // purpose, and every removal is reported. --keep-decals disables it.
    const isDecal = (o) => {
      if (KEEP_DECALS) return false;
      const m = o.material;
      if (!m || Array.isArray(m) || !m.transparent) return false;
      if (!(m.map || m.alphaMap)) return false;
      return o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry';
    };
    __ROOT__.updateMatrixWorld(true);
    __ROOT__.traverse(o => {
      if (!o.isMesh) return;
      if (isDecal(o)) { dropped.push(o.geometry.type); return; }
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
    return { meshes, materials, animations, dropped };
  })()`, sandbox, { timeout: 5000 });
  for (const m of scene.meshes) if (!GEOMETRIES.has(m.geometry.type))
    throw new Error(`unsupported geometry ${m.geometry.type}`);
  return stable({ format: 'diabloid-primitive-scene', version: 1, slug: entry.slug,
    coordinateSystem: 'right-handed-y-up', unitsPerMetre: 1, pivot: meta.spec.pivot,
    meshes: scene.meshes, materials: scene.materials, animations: scene.animations,
    droppedDecals: scene.dropped.length || undefined });
}

async function main() {
  const discovered = discoverEntries();
  const wanted = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));
  const entries = discovered.entries.filter(e => !wanted.size || wanted.has(e.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
  if (discovered.entries.length > discovered.indexed)
    console.log(`discovered ${discovered.entries.length - discovered.indexed} model(s) present on disk but absent from index.json`);
  fs.mkdirSync(OUT, { recursive: true });
  const manifestEntries = [], texturedModels = [], failures = [];
    for (const entry of entries) {
      try {
        const result = compile(entry);
        const name = entry.slug + '.scene.json';
        fs.writeFileSync(path.join(OUT, name), JSON.stringify(result) + '\n');
        manifestEntries.push({ slug: entry.slug, file: name });
        const decals = result.droppedDecals || 0;
        const textured = result.materials.filter(m => m.droppedMaps);
        console.log(`compiled ${entry.slug}: ${result.meshes.length} meshes`
          + (decals ? `  [dropped ${decals} shadow decal(s)]` : '')
          + (textured.length ? `  [${textured.length} material(s) lost textures: `
            + textured.map(m => m.droppedMaps.join('+')).join(', ') + ']' : ''));
        if (textured.length) texturedModels.push(entry.slug);
      } catch (e) {
        // Compiling ~100 catalogue models, one dud must not cost the other 99.
        // The run continues, the manifest keeps what succeeded, and the exit
        // code still reports failure.
        failures.push({ slug: entry.slug, reason: (e && e.message) || String(e) });
        console.error(`FAILED  ${entry.slug}: ${(e && e.message) || e}`);
      }
    }
  // A partial invocation intentionally creates a partial, deterministic manifest.
  const manifest = stable({ kind: 'compiled-models', version: 1, entries: manifestEntries });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n  compiled ${manifestEntries.length} of ${entries.length} model(s)`);
  if (failures.length) {
    console.error(`\n  ${failures.length} model(s) failed:`);
    for (const f of failures) console.error(`    ${f.slug} — ${f.reason}`);
  }
  if (texturedModels.length) {
    console.warn(`\n  ${texturedModels.length} model(s) reference textures the scene contract cannot carry:`);
    console.warn('  ' + texturedModels.join(', '));
    console.warn('  These compiled, but the textured surfaces will not look as the catalogue previewed them.');
    console.warn('  Inspect before shipping: a dropped alpha map turns a soft decal into a solid shape.');
  }
  if (failures.length) process.exitCode = 1;
}

module.exports = { discoverEntries };
if (require.main === module)
  main().catch(e => { console.error(e.stack || e); process.exit(1); });
