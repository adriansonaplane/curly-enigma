#!/usr/bin/env node
// ============================================================================
// DIABLOID — placement audit for compiled model scenes.
//
//   node tools/inspect-models.js [--json] [--verbose] [slug ...]
//
// validate-models.js answers "is this scene file safe and well-formed?".
// It does not answer "is this the right subtree, standing in the right place,
// at the right size?" — and that is the open question for any model whose root
// was RECOVERED rather than published.
//
// Fifteen of the ninety-nine models (the `ragm-*` actors) keep their root in a
// closure. The compiler finds them by watching Object3D.add() and taking the
// largest mesh-bearing subtree. That is a good heuristic, but it is a
// heuristic: it can land on a wrapper group that also carries the catalogue's
// turntable rotation or fit-to-frame scale, and nothing downstream would say
// so. Worse, compile-models.js bakes each mesh from `matrixWorld` — absolute
// scene space, not space relative to the chosen root — so any transform on the
// preview rig's ancestors is baked in permanently.
//
// This tool measures the compiled result and reports the four ways that goes
// wrong:
//
//   FLOATING / SUNKEN   the model does not rest on y=0, so it hovers or sinks
//                       when the game places it on the floor plane.
//   OFF-CENTRE          the model's footprint is not over the origin, so it
//                       orbits its own pivot instead of turning in place.
//   SIZE                the model is not plausibly the size of the thing it
//                       depicts, which means a fit-to-frame scale came along.
//   FROZEN-ROT          every mesh shares one identical non-zero rotation.
//                       That is not a model; that is a turntable stopped
//                       mid-spin and baked in.
//
// Bounds come from the ACTUAL VERTICES of the geometry the game will build,
// via actors3d.js in a vm — no DOM, no GPU. That detail is the whole accuracy
// story. Bounding a rotated part by transforming its axis-aligned box (which
// is what Box3.setFromObject does, and what an analytic bound would do) badly
// over-covers it: a UV sphere's box is the full ±r cube, so rotating a scaled
// sphere can inflate its measured minY by 0.4 world units on ONE part. The
// ragm actors are built entirely from rotated scaled spheres. Measured that
// way, most of them look sunken when they are sitting exactly on the floor.
//
// Nothing here is a hard failure — a wall sconce SHOULD float, a ceiling root
// SHOULD hang. Exit code stays 0. This prints the shortlist worth eyeballing
// in-game, so that job is a handful of models instead of ninety-nine.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets/models/baked');
const AS_JSON = process.argv.includes('--json');
const VERBOSE = process.argv.includes('--verbose');
const WANTED = new Set(process.argv.slice(2).filter(a => !a.startsWith('--')));

// Thresholds. Generous on purpose: this is a shortlist, not a gate.
const GROUND = 0.05;   // metres of float/sink before it is worth a look
const CENTRE = 0.30;   // metres of footprint offset from the origin
const MIN_H = 0.15;    // shorter than this and a scale went missing
const MAX_H = 8.0;     // taller than this and a scale came along

// --- the real builder -------------------------------------------------------
// Measuring what the game builds, rather than a second implementation of it,
// is what keeps this tool honest: there is no separate geometry table here to
// drift out of step with the runtime's.
const sandbox = { console };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor/three.min.js'), 'utf8'), sandbox, { timeout: 10000 });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/actors3d.js'), 'utf8'), sandbox, { timeout: 10000 });
const THREE = sandbox.THREE;
// A top-level `const` lands in the realm's script-lexical scope rather than on
// the global object, so the module has to be read back by evaluating its name.
const Actors3 = vm.runInContext('Actors3', sandbox);

// Bound the vertices themselves. Anything cheaper over-covers rotated parts.
function exactBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  return box;
}

// --- per-model report -------------------------------------------------------
function inspect(file, slug) {
  const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
  let box, error = null, draws = 0;
  try {
    const root = Actors3._compileModel(scene, slug);
    // The compiled root's children ARE the draw calls: one merged mesh per
    // material plus any animated part held out. Reading it off the real
    // compile is the whole point — a count derived some other way is a second
    // implementation waiting to disagree with the renderer.
    draws = root.children.length;
    box = exactBounds(root);
  }
  catch (e) { error = (e && e.message) || String(e); }

  const empty = error || box.isEmpty();
  const size = empty ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray();
  const centre = empty ? [0, 0, 0] : [(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2];
  const minY = empty ? 0 : box.min.y;

  // Rotations come from the scene file, not the compiled root: merging bakes
  // transforms into the vertices, which is exactly what destroys this signal.
  const rotations = new Set((scene.meshes || []).map(m => (m.rotation || [0, 0, 0]).map(n => n.toFixed(4)).join(',')));

  const flags = [];
  if (error) flags.push('ERROR:' + error);
  else if (empty) flags.push('EMPTY');
  else {
    if (minY > GROUND) flags.push('FLOATING');
    if (minY < -GROUND) flags.push('SUNKEN');
    if (Math.hypot(centre[0], centre[2]) > CENTRE) flags.push('OFF-CENTRE');
    if (size[1] < MIN_H || size[1] > MAX_H) flags.push('SIZE');
  }
  // One rotation shared by every mesh, and it is not identity: the whole model
  // was turned as a unit before it was baked. A hand-authored model has many
  // distinct part rotations; a frozen turntable has exactly one.
  const only = rotations.size === 1 ? [...rotations][0] : null;
  if (only && only !== '0.0000,0.0000,0.0000' && (scene.meshes || []).length > 3)
    flags.push('FROZEN-ROT');
  if (scene.droppedDecals) flags.push('DECALS:' + scene.droppedDecals);
  const textureless = (scene.materials || []).filter(m => m.droppedMaps).length;
  if (textureless) flags.push('TEXLOST:' + textureless);

  return {
    slug, meshes: (scene.meshes || []).length, draws, pivot: scene.pivot || null,
    size: size.map(n => +n.toFixed(3)),
    groundGap: +minY.toFixed(3),
    centreOffset: +Math.hypot(centre[0], centre[2]).toFixed(3),
    distinctRotations: rotations.size, flags,
  };
}

// --- run --------------------------------------------------------------------
const manifestFile = path.join(DIR, 'manifest.json');
if (!fs.existsSync(manifestFile)) {
  console.error(`no manifest at ${manifestFile}\nRun: node tools/compile-models.js`);
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const rows = [];
for (const entry of manifest.entries || []) {
  if (WANTED.size && !WANTED.has(entry.slug)) continue;
  const file = path.join(DIR, entry.file);
  if (!fs.existsSync(file)) { console.error(`missing ${entry.file}`); continue; }
  rows.push(inspect(file, entry.slug));
}

if (AS_JSON) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const flagged = rows.filter(r => r.flags.length);
const show = VERBOSE ? rows : flagged;

console.log(`Inspected ${rows.length} compiled scenes in ${path.relative(ROOT, DIR)}\n`);
if (!show.length) console.log('  nothing flagged — every model rests on the floor, centred and plausibly sized.\n');
else {
  console.log('  ' + 'slug'.padEnd(28) + 'meshes'.padStart(7) + 'draws'.padStart(7) + '  ' +
    'w x h x d'.padEnd(22) + 'floor'.padStart(8) + 'offset'.padStart(8) + '  flags');
  console.log('  ' + '-'.repeat(104));
  for (const r of show) {
    const dim = r.size.map(n => n.toFixed(2)).join(' x ');
    console.log('  ' + r.slug.padEnd(28) + String(r.meshes).padStart(7) + String(r.draws).padStart(7) + '  ' +
      dim.padEnd(22) + r.groundGap.toFixed(3).padStart(8) +
      r.centreOffset.toFixed(3).padStart(8) + '  ' + r.flags.join(' '));
  }
}

// A tally of pivot labels, because `pivot` is copied verbatim from the source
// payload's spec and is never verified against the geometry. A model claiming
// "bottom center" while floating is a contradiction the game will believe.
const pivots = {};
for (const r of rows) pivots[r.pivot || '(none)'] = (pivots[r.pivot || '(none)'] || 0) + 1;
console.log('\n' + '-'.repeat(60));
console.log(`  models         : ${rows.length}`);
console.log(`  flagged        : ${flagged.length}`);
const prim = rows.reduce((n, r) => n + r.meshes, 0);
const draws = rows.reduce((n, r) => n + r.draws, 0);
console.log(`  primitives     : ${prim}`);
// What the renderer will actually issue. This is the number the merge and the
// material dedup exist to move, so it belongs next to the placement report
// rather than in a shell one-liner someone has to retype correctly.
console.log(`  draw calls     : ${draws}` +
  (prim ? `  (${(100 * (1 - draws / prim)).toFixed(1)}% fewer than one per primitive)` : ''));
console.log(`  pivot labels   : ${JSON.stringify(pivots)}`);
const contradictory = rows.filter(r => /bottom/i.test(r.pivot || '') &&
  (r.flags.includes('FLOATING') || r.flags.includes('SUNKEN')));
if (contradictory.length)
  console.log(`  !! ${contradictory.length} model(s) claim a bottom pivot but do not rest on y=0`);
console.log(flagged.length ? '\nRun with --verbose to see every model.\n' : '\n');
