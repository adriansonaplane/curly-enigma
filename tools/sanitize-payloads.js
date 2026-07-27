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

  // Keep the expression shape — `void (...)` still evaluates the argument list,
  // so a scene that builds its debug object inline cannot throw.
  out = out.replace(/window\.parent\.postMessage\s*\(/g, () => {
    notes.push('parent-postMessage->void');
    return 'void (';
  });
  out = out.replace(/\b(?:window\.)?(?:parent|top|opener)\s*\.\s*(?!postMessage)/g, () => {
    notes.push('other-parent-access->window');
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
    const j = JSON.parse(raw);
    if (typeof j.preview_html === 'string') {
      const r = scrub(j.preview_html, depth);
      j.preview_html = r.out; notes = r.notes;
    }
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
