#!/usr/bin/env node
// ============================================================================
// DIABLOID — the compiled-model contract, checked without a browser.
//
//   node tests/node/model-contract.js
//
// Two ends have to agree about compiled scenes and neither can see the other:
//
//   tools/compile-models.js  decides which geometry types a scene may contain.
//   js/actors3d.js           decides which geometry types it can rebuild.
//
// When those drifted apart the failure was invisible. A scene using a geometry
// the runtime did not know threw at load, the promise rejected into an empty
// catch, and the monster wore its procedural fallback forever — looking exactly
// like a monster with no authored model at all. The first assertion below is
// that drift, made loud.
//
// The second is the merge. _compileModel folds a model's parts into one mesh
// per material, which is where the draw-call win comes from. A merge that lost
// a part, moved one, or duplicated one would still produce a plausible model,
// so it is checked against a reference build — one mesh per primitive, the
// literal thing the merge replaced.
//
// Runs in a vm sandbox with the vendored three.js and the real actors3d.js.
// No DOM, no GPU, no network: THREE geometry construction needs none of them.
// ============================================================================
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'assets/models/baked');

const sandbox = { console };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor/three.min.js'), 'utf8'), sandbox, { timeout: 10000 });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/actors3d.js'), 'utf8'), sandbox, { timeout: 10000 });
const THREE = sandbox.THREE;
// A top-level `const` lands in the realm's script-lexical scope rather than on
// the global object, so the module has to be read back by evaluating its name.
const Actors3 = vm.runInContext('Actors3', sandbox);

let failed = 0;
const check = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// --- 1. the geometry contract ----------------------------------------------
console.log('\n== geometry contract ==');
const compiler = fs.readFileSync(path.join(ROOT, 'tools/compile-models.js'), 'utf8');
const start = compiler.indexOf('const GEOMETRIES');
const allowed = [...new Set(compiler.slice(start, compiler.indexOf(']);', start))
  .match(/'[A-Za-z]+Geometry'/g).map(s => s.slice(1, -1)))];
check(allowed.length > 5, `read ${allowed.length} geometry types from the compiler`);

const sample = {
  LatheGeometry: { points: [[0, 0], [0.5, 0.5], [0, 1]] },
  RingGeometry: { innerRadius: 0.2, outerRadius: 0.5 },
};
const generic = { radius: 0.5, width: 1, height: 1, depth: 1, tube: 0.2 };
for (const type of allowed) {
  try {
    const g = Actors3._primitive({ type, parameters: sample[type] || generic }, 'probe');
    check(g.attributes.position.count > 0, `${type} rebuilds at runtime`);
  } catch (e) { check(false, `${type}: ${e.message}`); }
}
const missing = allowed.filter(t => !Actors3.GEOMETRY_ARGS[t]);
check(!missing.length, `runtime table covers the compiler allowlist${missing.length ? ' — missing ' + missing.join(', ') : ''}`);

// --- 2. the merge ------------------------------------------------------------
// One mesh per primitive with the transform on the mesh: what _compileModel
// built before it merged, and therefore the thing the merge must agree with.
function reference(doc) {
  const materials = (doc.materials || []).map(d => Actors3._material(d));
  const root = new THREE.Group();
  let verts = 0;
  for (const p of doc.meshes) {
    const g = Actors3._primitive(p.geometry, 'reference');
    verts += g.index ? g.index.count : g.attributes.position.count;
    const mesh = new THREE.Mesh(g, materials[p.material] || materials[0]);
    if (p.position) mesh.position.fromArray(p.position);
    if (p.rotation) mesh.rotation.fromArray(p.rotation);
    if (p.scale) mesh.scale.fromArray(p.scale);
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  return { verts, box: new THREE.Box3().setFromObject(root) };
}
const countVerts = (root) => {
  let n = 0;
  root.traverse(o => {
    if (o.isMesh) n += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
  });
  return n;
};

console.log('\n== merge equivalence ==');
const manifestFile = path.join(DIR, 'manifest.json');
if (!fs.existsSync(manifestFile)) {
  check(false, 'no compiled models to check — run node tools/compile-models.js');
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  for (const entry of manifest.entries || []) {
    const file = path.join(DIR, entry.file);
    if (!fs.existsSync(file)) { check(false, `missing ${entry.file}`); continue; }
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ref = reference(doc);
    const got = Actors3._compileModel(doc, entry.slug);
    const box = new THREE.Box3().setFromObject(got);
    // An animated part keeps its own draw; the rest collapse to one draw per
    // material. Counting materials across ALL meshes double-counts any material
    // an animated part happens to share with a static one.
    const animated = new Set((doc.animations || []).map(a => a.mesh));
    const statics = doc.meshes.filter((m, i) => !animated.has(i));
    const expect = new Set(statics.map(m => m.material || 0)).size + animated.size;

    console.log(`\n${entry.slug}: ${doc.meshes.length} primitives -> ${got.children.length} draws`);
    check(got.children.length === expect, `draws == materials + animated parts (${got.children.length} vs ${expect})`);
    check(got.children.length <= doc.meshes.length, 'draw count did not rise');
    check(countVerts(got) === ref.verts, `vertices preserved (${countVerts(got)} vs ${ref.verts})`);
    check(!got.userData.unmergedMaterials, 'every material bucket merged');

    // The merged bounds must sit inside the reference bounds, never outside.
    // They are legitimately TIGHTER: Box3.setFromObject on an unrotated-geometry
    // mesh transforms that geometry's own AABB, which over-covers a rotated
    // part, while merged geometry bounds the actual welded vertices. A model
    // with rotated parts therefore measures a hair shorter after merging —
    // more correct, not less. Growing, or shrinking by more than a millimetre,
    // would mean a part had moved.
    const eps = 1e-6;
    const inside = box.min.x >= ref.box.min.x - eps && box.min.y >= ref.box.min.y - eps &&
      box.min.z >= ref.box.min.z - eps && box.max.x <= ref.box.max.x + eps &&
      box.max.y <= ref.box.max.y + eps && box.max.z <= ref.box.max.z + eps;
    const drift = Math.max(box.min.distanceTo(ref.box.min), box.max.distanceTo(ref.box.max));
    check(inside, 'merged bounds lie within the reference bounds');
    check(drift < 1e-2, `bounds drift is sub-millimetre (${drift.toExponential(2)})`);
    check(Math.abs(got.userData.minY - ref.box.min.y) < 1e-2, 'minY agrees with the reference');
  }
}

// --- 3. the model map --------------------------------------------------------
// A mapped species whose slug is not in the manifest silently wears its
// procedural fallback. That is acceptable — it is how the fallback is supposed
// to work — but it must be stated, not discovered three PRs later.
console.log('\n== model map ==');
const slugs = fs.existsSync(manifestFile)
  ? new Set(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).entries.map(e => e.slug))
  : new Set();
const mapped = Object.entries(Actors3.MODEL_MAP);
const absent = mapped.filter(([, spec]) => !slugs.has(spec.slug)).map(([fam]) => fam);
console.log(`  ${mapped.length} species mapped; ${mapped.length - absent.length} present in this checkout's manifest`);
if (absent.length) console.log(`  falling back (slug not compiled here): ${absent.join(', ')}`);
check(mapped.every(([, s]) => s.slug && s.height > 0 && s.animation),
  'every mapped species declares a slug, a height and an animation mode');
const dupes = mapped.map(([, s]) => s.slug).filter((s, i, a) => a.indexOf(s) !== i);
check(!dupes.length, `no two species share a model${dupes.length ? ' — ' + dupes.join(', ') : ''}`);

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
