#!/usr/bin/env node
// ============================================================================
// DIABLOID — permanently defang the pulled catalogue payloads, in place.
//
//   node tools/sanitize-payloads.js assets/effects
//
// The bake sanitises on the fly, but the files in the repo were still the
// upstream originals: a <script src> pointing at cdnjs and a debug channel
// calling window.parent.postMessage(..., "*"). Nothing in the game loads them,
// but a payload that reaches for a CDN and holds a handle on its embedder is
// not something to leave lying in a repository where someone might open it.
//
// This rewrites them once, so the committed copies are inert:
//   - cdnjs three.js  -> the vendored r128 in vendor/
//   - window.parent.* -> a no-op, keeping the call shape so the scene still runs
//   - the same edits inside the preview_html field of each .json
//
// The originals stay reproducible: re-running tools/pull-effects.sh with
// FORCE=1 fetches them again untouched.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'assets/effects';
const ROOT = path.resolve(__dirname, '..');

function scrub(html, depth) {
  const notes = [];
  let out = html;
  // The vendored copy, relative to the payload's own directory.
  const rel = '../'.repeat(depth) + 'vendor/three.min.js';

  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']*three[^"']*)\1[^>]*><\/script>/gi, (m, q, url) => {
    if (!/^https?:|^\/\//i.test(url)) return m;      // already local
    notes.push('three->vendor');
    return `<script src="${rel}"></script>`;
  });

  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*><\/script>/gi, () => {
    notes.push('removed-remote-script');
    return '<!-- removed: remote script -->';
  });
  out = out.replace(/<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*>/gi, () => {
    notes.push('removed-remote-link');
    return '<!-- removed: remote link -->';
  });

  // The actual escape vector: postMessage out of the frame. `void (...)` keeps
  // the expression shape, so a scene building its debug object inline still
  // evaluates its arguments and cannot throw.
  out = out.replace(/(?:window\s*\.\s*)?\b(?:parent|top|opener)\s*\.\s*postMessage\s*\(/g, () => {
    notes.push('parent-postMessage->void');
    return 'void (';
  });

  // Only EXPLICIT window.parent / window.top / window.opener are neutralised.
  //
  // This used to also rewrite bare `parent.` / `top.` / `opener.`, which was a
  // serious mistake: `top` is an ordinary local variable name, and these
  // payloads use it constantly (`const top = box(...); top.position.y = ...`).
  // That rule turned thousands of lines of model-building code into
  // `window.position.y = ...`, which throws at runtime. It even corrupted
  // property access — `rays[i].top.scale` became `rays[i].window.scale` inside
  // an animation loop, killing the render call after it.
  //
  // A bare identifier cannot be told from a frame reference by regex, so it is
  // left alone here and reported by the audit instead, for a human to judge.
  out = out.replace(/\bwindow\s*\.\s*(?:parent|top|opener)\s*\.\s*/g, () => {
    notes.push('explicit-window-frame-access->window');
    return 'window.';
  });
  return { out, notes };
}

const files = fs.readdirSync(dir).filter(f => /\.(html|json)$/i.test(f) && f !== 'index.json');
const depth = path.relative(ROOT, path.resolve(dir)).split(path.sep).length;

let changed = 0;
const tally = {};
for (const f of files) {
  const p = path.join(dir, f);
  const raw = fs.readFileSync(p, 'utf8');
  let next = raw, notes = [];

  if (f.endsWith('.json')) {
    // Scrub EVERY string field that looks like markup, not just one named
    // preview_html. The effects JSON used that key; the models JSON does not,
    // so keying off the name silently left the models' embedded HTML intact —
    // the file still changed, because stringify reformats it, which made it
    // look handled when nothing had been touched. Shape, not name.
    const j = JSON.parse(raw);
    const looksLikeHtml = (v) =>
      typeof v === 'string' && v.length > 40 &&
      /<script|<html|<!doctype|<body|<canvas/i.test(v);
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'object' && v) walk(v); else if (looksLikeHtml(v)) { const r = scrub(v, depth); o[i] = r.out; notes.push(...r.notes); } }); return; }
      for (const k in o) {
        const v = o[k];
        if (v && typeof v === 'object') walk(v);
        else if (looksLikeHtml(v)) { const r = scrub(v, depth); o[k] = r.out; notes.push(...r.notes.map(n => k + ':' + n)); }
      }
    };
    walk(j);
    next = JSON.stringify(j, null, 2) + '\n';
  } else {
    const r = scrub(raw, depth);
    next = r.out; notes = r.notes;
  }

  if (next !== raw) {
    fs.writeFileSync(p, next);
    changed++;
    for (const n of notes) tally[n] = (tally[n] || 0) + 1;
    console.log(`  scrubbed  ${f.padEnd(26)} ${[...new Set(notes)].join(', ')}`);
  }
}
console.log('\n' + '-'.repeat(56));
console.log(`  files changed: ${changed} / ${files.length}`);
console.log(`  edits: ${JSON.stringify(tally)}`);
console.log('\n  Now re-run the audit:  node tools/audit-assets.js ' + dir);
