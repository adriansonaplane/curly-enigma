#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets/models/baked');
const ALLOWED = new Set(['BoxGeometry', 'CylinderGeometry', 'SphereGeometry', 'ConeGeometry',
  'PlaneGeometry', 'CircleGeometry', 'RingGeometry', 'TorusGeometry', 'IcosahedronGeometry',
  'OctahedronGeometry', 'DodecahedronGeometry', 'TetrahedronGeometry', 'LatheGeometry']);
const MAX_MESHES = 512, MAX_VERTICES = 250000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
let failed = false;
function reject(file, message) { failed = true; console.error(`BLOCK ${path.basename(file)}: ${message}`); }
const manifestFile = path.join(DIR, 'manifest.json');
if (!fs.existsSync(manifestFile)) reject(manifestFile, 'manifest missing');
else {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  for (const entry of manifest.entries || []) {
    if (!/^[a-z0-9-]+\.scene\.json$/.test(entry.file)) { reject(manifestFile, `unsafe file ${entry.file}`); continue; }
    const file = path.join(DIR, entry.file);
    let scene; try { scene = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { reject(file, e.message); continue; }
    const text = fs.readFileSync(file, 'utf8');
    if (/(?:https?:)?\/\/|data:|blob:|javascript:|\beval\b|\bFunction\b|<script/i.test(text)) reject(file, 'external resource or dynamic code');
    if (scene.format !== 'diabloid-primitive-scene' || scene.version !== 1) reject(file, 'unknown format/version');
    if (!Array.isArray(scene.meshes) || scene.meshes.length > MAX_MESHES) reject(file, `mesh limit ${scene.meshes && scene.meshes.length}/${MAX_MESHES}`);
    let vertices = 0;
    for (const [i, mesh] of (scene.meshes || []).entries()) {
      if (!ALLOWED.has(mesh.geometry && mesh.geometry.type)) reject(file, `mesh ${i}: unsupported geometry`);
      for (const key of ['position', 'rotation', 'scale'])
        if (!Array.isArray(mesh[key]) || mesh[key].length !== 3 || !mesh[key].every(finite)) reject(file, `mesh ${i}: non-finite ${key}`);
      const p = mesh.geometry.parameters || {};
      if (Object.values(p).some(v => typeof v === 'number' && !finite(v))) reject(file, `mesh ${i}: non-finite geometry parameter`);
      const radial = p.radialSegments || p.widthSegments || 8, height = p.heightSegments || p.heightSegments || 1;
      vertices += mesh.geometry.type === 'BoxGeometry' ? 24 : Math.max(3, radial + 1) * Math.max(2, height + 1) * 2;
    }
    if (vertices > MAX_VERTICES) reject(file, `estimated vertices ${vertices}/${MAX_VERTICES}`);
    console.log(`ok ${entry.slug}: ${scene.meshes.length} meshes, ~${vertices} vertices`);
  }
}
process.exit(failed ? 1 : 0);
