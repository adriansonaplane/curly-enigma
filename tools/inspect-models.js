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
// Nothing here is a hard failure — a wall sconce SHOULD float, a ceiling root
// SHOULD hang. Exit code stays 0. This prints the shortlist worth eyeballing
// in-game, so that job is fifteen models instead of ninety-nine.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

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

// --- local bounds -----------------------------------------------------------
// Derived from geometry parameters rather than by building the geometry, so
// there is no constructor-argument-order to get wrong. Curved shapes use their
// full radius and ignore any partial phi/theta sweep, which over-estimates a
// half-sphere slightly. Over-estimating bounds cannot invent a defect: it can
// only fail to report a marginal one.
function localBounds(type, p) {
  const r = p.radius || 0;
  switch (type) {
    case 'BoxGeometry':
      return box(p.width || 1, p.height || 1, p.depth || 1);
    case 'SphereGeometry':
    case 'IcosahedronGeometry': case 'OctahedronGeometry':
    case 'DodecahedronGeometry': case 'TetrahedronGeometry':
      return box(2 * r, 2 * r, 2 * r);
    case 'CylinderGeometry': {
      const d = 2 * Math.max(p.radiusTop || 0, p.radiusBottom || 0);
      return box(d, p.height || 1, d);
    }
    case 'ConeGeometry':
      return box(2 * r, p.height || 1, 2 * r);
    case 'PlaneGeometry':
      return box(p.width || 1, p.height || 1, 0);
    case 'CircleGeometry':
      return box(2 * r, 2 * r, 0);
    case 'RingGeometry': {
      const d = 2 * (p.outerRadius || 0);
      return box(d, d, 0);
    }
    case 'TorusGeometry': {
      const d = 2 * ((p.radius || 0) + (p.tube || 0));
      return box(d, d, 2 * (p.tube || 0));
    }
    case 'LatheGeometry': {
      const pts = Array.isArray(p.points) ? p.points : [];
      if (!pts.length) return box(0, 0, 0);
      const xs = pts.map(q => Math.abs(q[0])), ys = pts.map(q => q[1]);
      const d = 2 * Math.max(...xs);
      return { min: [-d / 2, Math.min(...ys), -d / 2], max: [d / 2, Math.max(...ys), d / 2] };
    }
    default:
      return null;
  }
}
const box = (w, h, d) => ({ min: [-w / 2, -h / 2, -d / 2], max: [w / 2, h / 2, d / 2] });

// --- transform --------------------------------------------------------------
// Transform the eight corners and re-bound. This is what Box3.applyMatrix4
// does, so it matches three.js exactly for the axis-aligned case and is
// conservative for a rotated curved shape.
function euler(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // three.js Euler order 'XYZ' composes as R = Rx * Ry * Rz.
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
}

function meshBounds(mesh) {
  const local = localBounds(mesh.geometry.type, mesh.geometry.parameters || {});
  if (!local) return null;
  const [sx, sy, sz] = mesh.scale, R = euler(...mesh.rotation), [px, py, pz] = mesh.position;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const v = [
      (c & 1 ? local.max[0] : local.min[0]) * sx,
      (c & 2 ? local.max[1] : local.min[1]) * sy,
      (c & 4 ? local.max[2] : local.min[2]) * sz,
    ];
    for (let i = 0; i < 3; i++) {
      const w = R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2] + [px, py, pz][i];
      if (w < min[i]) min[i] = w;
      if (w > max[i]) max[i] = w;
    }
  }
  return { min, max };
}

// --- per-model report -------------------------------------------------------
function inspect(file, slug) {
  const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const unsupported = new Set();
  const rotations = new Set();
  for (const mesh of scene.meshes || []) {
    const b = meshBounds(mesh);
    if (!b) { unsupported.add(mesh.geometry.type); continue; }
    for (let i = 0; i < 3; i++) {
      if (b.min[i] < min[i]) min[i] = b.min[i];
      if (b.max[i] > max[i]) max[i] = b.max[i];
    }
    rotations.add(mesh.rotation.map(n => n.toFixed(4)).join(','));
  }
  const empty = !isFinite(min[0]);
  const size = empty ? [0, 0, 0] : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const centre = empty ? [0, 0, 0] : [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];

  const flags = [];
  if (empty) flags.push('EMPTY');
  else {
    if (min[1] > GROUND) flags.push('FLOATING');
    if (min[1] < -GROUND) flags.push('SUNKEN');
    if (Math.hypot(centre[0], centre[2]) > CENTRE) flags.push('OFF-CENTRE');
    if (size[1] < MIN_H || size[1] > MAX_H) flags.push('SIZE');
  }
  // One rotation shared by every mesh, and it is not identity: the whole model
  // was turned as a unit before it was baked. A hand-authored model has many
  // distinct part rotations; a frozen turntable has exactly one.
  const only = rotations.size === 1 ? [...rotations][0] : null;
  if (only && only !== '0.0000,0.0000,0.0000' && (scene.meshes || []).length > 3)
    flags.push('FROZEN-ROT');
  if (unsupported.size) flags.push('UNMEASURED:' + [...unsupported].join('/'));
  if (scene.droppedDecals) flags.push('DECALS:' + scene.droppedDecals);
  const textureless = (scene.materials || []).filter(m => m.droppedMaps).length;
  if (textureless) flags.push('TEXLOST:' + textureless);

  return {
    slug, meshes: (scene.meshes || []).length, pivot: scene.pivot || null,
    size: size.map(n => +n.toFixed(3)),
    groundGap: empty ? 0 : +min[1].toFixed(3),
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
  console.log('  ' + 'slug'.padEnd(28) + 'meshes'.padStart(7) + '  ' +
    'w x h x d'.padEnd(22) + 'floor'.padStart(8) + 'offset'.padStart(8) + '  flags');
  console.log('  ' + '-'.repeat(96));
  for (const r of show) {
    const dim = r.size.map(n => n.toFixed(2)).join(' x ');
    console.log('  ' + r.slug.padEnd(28) + String(r.meshes).padStart(7) + '  ' +
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
console.log(`  total meshes   : ${rows.reduce((n, r) => n + r.meshes, 0)}`);
console.log(`  pivot labels   : ${JSON.stringify(pivots)}`);
const contradictory = rows.filter(r => /bottom/i.test(r.pivot || '') &&
  (r.flags.includes('FLOATING') || r.flags.includes('SUNKEN')));
if (contradictory.length)
  console.log(`  !! ${contradictory.length} model(s) claim a bottom pivot but do not rest on y=0`);
console.log(flagged.length ? '\nRun with --verbose to see every model.\n' : '\n');
