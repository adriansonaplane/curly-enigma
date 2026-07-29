#!/usr/bin/env node
// ============================================================================
// DIABLOID — security audit for pulled catalogue payloads.
//
//   node tools/audit-assets.js assets/effects
//
// These documents are third-party markup that we execute in the player's
// browser. Before any of it ships, it has to clear three bars:
//
//   1. SELF-CONTAINED   no script/style/image/font pulled from another host,
//                       because the game is zero-dependency and offline-capable,
//                       and a remote script is a live code-injection channel
//                       into every player's session.
//   2. NO EXFILTRATION  no fetch/XHR/WebSocket/beacon/form posting anywhere,
//                       no reading cookies or storage.
//   3. INSPECTABLE      no eval/new Function/dynamic import of assembled
//                       strings, because that defeats this audit entirely.
//
// Exit code is non-zero if anything in the BLOCK class is found.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'assets/effects';

// --- what we look for -------------------------------------------------------
// severity: 'block' fails the audit, 'warn' needs a human to look.
const RULES = [
  // 1. external resources
  { id: 'script-src-remote', sev: 'block', why: 'loads JS from another host',
    re: /<script\b[^>]*\bsrc\s*=\s*["']?(?!["']?(?:\.{0,2}\/|data:|#))([a-z]+:)?\/\//gi },
  { id: 'link-remote', sev: 'block', why: 'loads CSS/font from another host',
    re: /<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//gi },
  { id: 'css-import-remote', sev: 'block', why: '@import from another host',
    re: /@import\s+(?:url\()?["']?(?:https?:)?\/\//gi },
  { id: 'img-remote', sev: 'block', why: 'loads an image from another host',
    re: /<(?:img|image|video|audio|source)\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//gi },
  { id: 'iframe-remote', sev: 'block', why: 'nests a remote frame',
    re: /<iframe\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//gi },
  { id: 'cdn-reference', sev: 'block', why: 'references a public CDN',
    re: /\b(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|skypack\.dev|jspm\.io|googleapis\.com|gstatic\.com)\b/gi },

  // 2. exfiltration / network
  { id: 'fetch', sev: 'block', why: 'makes a network request at runtime',
    re: /\bfetch\s*\(/g },
  { id: 'xhr', sev: 'block', why: 'XMLHttpRequest',
    re: /\bXMLHttpRequest\b/g },
  { id: 'websocket', sev: 'block', why: 'opens a socket',
    re: /\bWebSocket\b|\bEventSource\b/g },
  { id: 'beacon', sev: 'block', why: 'sendBeacon exfiltration',
    re: /\bnavigator\s*\.\s*sendBeacon\b/g },
  { id: 'importmap-or-dynimport', sev: 'block', why: 'dynamic module import',
    re: /\bimport\s*\(|<script[^>]+type\s*=\s*["']importmap["']/gi },
  { id: 'form-action', sev: 'block', why: 'form posts somewhere',
    re: /<form\b[^>]*\baction\s*=/gi },
  { id: 'storage', sev: 'warn', why: 'touches cookies or storage',
    re: /\bdocument\s*\.\s*cookie\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/g },

  // 3. inspectability
  { id: 'eval', sev: 'block', why: 'eval()',
    re: /\beval\s*\(/g },
  { id: 'new-function', sev: 'block', why: 'new Function(...)',
    re: /\bnew\s+Function\s*\(/g },
  { id: 'timer-string', sev: 'block', why: 'setTimeout/Interval with a string body',
    re: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g },
  { id: 'document-write', sev: 'warn', why: 'document.write',
    re: /\bdocument\s*\.\s*write\b/g },
  { id: 'inline-handler', sev: 'warn', why: 'inline on* handler attribute',
    re: /\bon(?:load|error|click|mouseover)\s*=\s*["']/gi },

  // 4. escape attempts
  // Explicit window.parent / window.top / window.opener is unambiguous.
  { id: 'parent-access', sev: 'block', why: 'reaches for the parent frame',
    re: /\bwindow\s*\.\s*(?:parent|top|opener)\s*\./g },
  // postMessage out of the frame, however it is spelled.
  { id: 'frame-postmessage', sev: 'block', why: 'posts a message out of the frame',
    re: /(?:window\s*\.\s*)?\b(?:parent|top|opener)\s*\.\s*postMessage\s*\(/g },
  // A BARE `top.` / `parent.` is usually a local variable — these payloads use
  // `const top = ...` heavily — so it is a warning for a human to judge, not a
  // block. Treating it as a frame reference is what led to the code being
  // rewritten and broken.
  { id: 'bare-frame-word', sev: 'warn', why: 'bare top/parent/opener — check it is a local, not a frame',
    re: /(?<!window\s*\.\s*)(?<![.\w$])(?:parent|top|opener)\s*\.\s*(?!postMessage)/g },
  { id: 'postmessage-wildcard', sev: 'warn', why: 'postMessage to *',
    re: /postMessage\s*\([^)]*,\s*["']\*["']/g },
  { id: 'nav', sev: 'block', why: 'navigates the browser',
    re: /\b(?:location\s*\.\s*(?:href|replace|assign)|window\s*\.\s*open)\s*[=(]/g },
];

// three.js detection — the payload is supposed to build geometry with it
const THREE_HINTS = [
  { id: 'three-global', re: /\bTHREE\s*\./ },
  { id: 'three-inline-lib', re: /THREE\.WebGLRenderer|THREE\.Scene\b/ },
  { id: 'three-import', re: /from\s+["'][^"']*three[^"']*["']/i },
  { id: 'webgl-ctx', re: /getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["']/ },
  { id: 'canvas2d-ctx', re: /getContext\s*\(\s*["']2d["']/ },
  { id: 'geometry-json', re: /"(?:vertices|faces|geometries|attributes|position)"\s*:/ },
  { id: 'capture-hook', re: /diabloid:capture|toDataURL|convertToBlob|transferToImageBitmap/ },
];

function stripComments(s) {
  // crude, but enough to stop a commented-out CDN URL raising a false alarm
  return s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// Syntax-check every inline script. The audit called a batch of payloads
// "clean" while they were full of code the sanitiser had mangled — clean of
// *security* problems, but broken. Valid-JS is cheap to check and would have
// caught that immediately, so it is part of the gate now.
function scriptsParse(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { new Function(m[1]); }
    catch (e) { return e.message.split('\n')[0]; }
  }
  return null;
}

// Severity has to follow whether the code RUNS.
//
// A .json payload is not uniformly executable. The compiler reads exactly two
// things from it: the `html` field, whose inline scripts it evaluates, and
// `spec.pivot`. Everything else — description, tags, and `spec.api`, which
// carries a prose usage example — is inert metadata that nothing ever runs.
//
// Scanning the whole file at block severity treated that documentation as
// though it were code. bookcase.json was reported as making a network request
// at runtime on the strength of a comment reading "// Or fetch the HTML and use
// in your own project", and it stayed on the open-items list for days.
//
// So: the executable surface is judged at full severity, and the rest is still
// reported — a hostile URL in a description is worth seeing — but as a warning
// that says plainly it is not executed.
function split(file, raw) {
  if (!/\.json$/i.test(file)) return { exec: raw, inert: '' };
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { return { exec: raw, inert: '' }; }
  const exec = typeof doc.html === 'string' ? doc.html : '';
  const rest = Object.assign({}, doc); delete rest.html;
  return { exec, inert: JSON.stringify(rest) };
}

function auditFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { exec, inert } = split(file, raw);
  const body = stripComments(exec);
  const hits = [];
  // Now runs for .json too, against the html field the compiler evaluates.
  // Previously this was gated on the filename, so the corruption check never
  // examined what the pipeline actually consumes.
  const err = scriptsParse(exec);
  if (err) hits.push({ id: 'broken-js', sev: 'block', why: 'inline script does not parse — payload is corrupt',
                       n: 1, sample: err.slice(0, 70) });
  for (const r of RULES) {
    r.re.lastIndex = 0;
    const found = body.match(r.re);
    if (found && found.length) {
      hits.push({ id: r.id, sev: r.sev, why: r.why, n: found.length, sample: found[0].slice(0, 70) });
    }
  }
  // Same rules over the inert metadata, always downgraded, never silent.
  const seen = new Set(hits.map(h => h.id));
  const inertBody = stripComments(inert);
  for (const r of RULES) {
    if (seen.has(r.id)) continue;
    r.re.lastIndex = 0;
    const found = inertBody.match(r.re);
    if (found && found.length) {
      hits.push({ id: r.id + ' (metadata)', sev: 'warn', n: found.length,
        why: r.why + ' — but in metadata the pipeline never executes',
        sample: found[0].slice(0, 70) });
    }
  }
  const three = THREE_HINTS.filter(h => h.re.test(body)).map(h => h.id);
  // every host referenced anywhere, so nothing hides behind a rule gap
  const hosts = new Set();
  const urlRe = /(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = urlRe.exec(body))) hosts.add(m[1].toLowerCase());
  return { file, bytes: raw.length, hits, three, hosts: [...hosts] };
}

// --- run --------------------------------------------------------------------
if (!fs.existsSync(dir)) {
  console.error(`no such directory: ${dir}\n`);
  console.error('Run the pull first:  ./tools/pull-effects.sh');
  process.exit(2);
}
const files = fs.readdirSync(dir)
  .filter(f => /\.(html|htm|json)$/i.test(f) && f !== 'index.json')
  .map(f => path.join(dir, f));

if (!files.length) { console.error(`no payloads in ${dir}`); process.exit(2); }

console.log(`Auditing ${files.length} payloads in ${dir}\n`);

let blocked = 0, warned = 0, warnedAny = 0;
const allHosts = new Set(), threeTally = {};
const offenders = [];

for (const f of files) {
  const r = auditFile(f);
  for (const h of r.hosts) allHosts.add(h);
  for (const t of r.three) threeTally[t] = (threeTally[t] || 0) + 1;
  const block = r.hits.filter(h => h.sev === 'block');
  const warn = r.hits.filter(h => h.sev === 'warn');
  // A file can be both blocking and warning; counting it in each bucket and
  // subtracting both from the total drove `clean` negative on the model pull.
  if (block.length) { blocked++; offenders.push(r); }
  else if (warn.length) warned++;
  if (warn.length) warnedAny++;
  const tag = block.length ? 'BLOCK' : warn.length ? ' warn' : '   ok';
  console.log(`  ${tag}  ${path.basename(r.file).padEnd(26)} ${String(r.bytes).padStart(7)} B  ${r.three.join(',') || '-'}`);
  for (const h of block) console.log(`         !! ${h.id} x${h.n} — ${h.why}\n            ${h.sample}`);
  for (const h of warn) console.log(`         ?  ${h.id} x${h.n} — ${h.why}`);
}

console.log('\n' + '-'.repeat(60));
console.log(`  files          : ${files.length}`);
console.log(`  clean          : ${files.length - blocked - warned}`);
console.log(`  warnings       : ${warnedAny}${warned !== warnedAny ? ' (' + warned + ' warn-only)' : ''}`);
console.log(`  BLOCKING       : ${blocked}`);
console.log(`\n  external hosts referenced: ${allHosts.size ? [...allHosts].join(', ') : 'NONE (good)'}`);
console.log(`  three.js / render hints  : ${Object.keys(threeTally).length ? JSON.stringify(threeTally) : 'none found'}`);

if (!Object.keys(threeTally).some(k => k.startsWith('three'))) {
  console.log('\n  NOTE: no three.js usage detected. If these payloads are meant to');
  console.log('        build geometry with three.js, either the library is expected');
  console.log('        from outside (which fails rule 1) or the geometry lives in the');
  console.log('        metadata JSON and we build it ourselves.');
}
if (!threeTally['capture-hook']) {
  console.log('\n  NOTE: no capture hook found. A sandboxed iframe cannot be read from');
  console.log('        the parent, so a payload with no way to hand a bitmap out');
  console.log('        cannot be rasterised. See Assets.api.capture().');
}

console.log(blocked ? '\nAUDIT FAILED — do not ship these as-is.\n' : '\nAudit clean.\n');
process.exit(blocked ? 1 : 0);
