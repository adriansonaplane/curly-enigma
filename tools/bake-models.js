#!/usr/bin/env node
// ============================================================================
// DIABLOID — bake catalogue model payloads into 8-facing sprite sheets.
//
//   node tools/bake-models.js [slug ...]
//
// Models differ from effects in two ways that matter:
//
//   TRANSPARENCY. Effects bake on black and composite additively, so the black
//   contributes nothing. A statue on a black square just shows the square, so
//   props have to come out with a real alpha channel. The payload's renderer is
//   built as WebGLRenderer({antialias:true}) — no alpha — so the shim forces
//   alpha:true and the scene background is nulled after load.
//
//   FACINGS, not frames. A statue does not animate, but it must look right as
//   the camera orbits. Each payload exposes window.MODEL (documented in the
//   metadata's `spec` field, api: "window.MODEL"), whose `root` is the model
//   object — so a facing is just a Y rotation on that root. Rotating the model
//   rather than hunting for the scene camera keeps this working regardless of
//   how any given payload sets its view up.
//
// The metadata also documents pivot "bottom center" and 1 unit ≈ 1 metre,
// which is exactly the anchor Assets.register expects, so no re-anchoring.
//
// Offline bake, same as effects: three.js is used here and never ships.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/models');
const OUT = path.join(SRC, 'baked');
const THREE = path.join(ROOT, 'vendor/three.min.js');

const FACINGS = +(process.env.FACINGS || 8);
const CELL = +(process.env.CELL || 128);
const SETTLE = +(process.env.SETTLE || 1200);

function sanitise(html, threeUrl) {
  const notes = [];
  let out = html;

  // three.js -> vendored, plus the shim. alpha:true is what makes a
  // transparent capture possible at all; preserveDrawingBuffer is what makes
  // any capture possible (WebGL clears after compositing otherwise).
  const shim = `<script>
(function () {
  if (!window.THREE || !THREE.WebGLRenderer) return;
  var Orig = THREE.WebGLRenderer;
  function Patched(params) {
    var p = Object.assign({}, params || {}, { alpha: true, preserveDrawingBuffer: true });
    var r = new Orig(p);
    try { r.setClearColor(0x000000, 0); } catch (e) {}
    return r;
  }
  Patched.prototype = Orig.prototype;
  THREE.WebGLRenderer = Patched;
})();
</script>`;
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*three[^"']*["'][^>]*><\/script>/gi, () => {
    notes.push('three->vendor+alpha+preserveDrawingBuffer');
    return `<script src="${threeUrl}"></script>` + shim;
  });
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*><\/script>/gi, (m) => {
    notes.push('REMOVED-remote-script'); return '<!-- removed -->';
  });
  out = out.replace(/<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*>/gi, () => {
    notes.push('REMOVED-remote-link'); return '<!-- removed -->';
  });
  out = out.replace(/window\.parent\.postMessage\s*\(/g, () => {
    notes.push('parent-postMessage->void'); return 'void (';
  });

  // Control surface: null the scene background so the alpha survives, and
  // expose a facing setter driven off MODEL.root.
  const hook = `
<script>
(function () {
  function sceneOf(o) { while (o && o.parent) o = o.parent; return o; }
  window.__bake = {
    ready: function () { return !!(window.MODEL && window.MODEL.root); },
    clearBg: function () {
      if (!window.MODEL || !window.MODEL.root) return false;
      var s = sceneOf(window.MODEL.root);
      if (s && 'background' in s) { s.background = null; return true; }
      return false;
    },
    face: function (a) {
      if (!window.MODEL || !window.MODEL.root) return false;
      window.MODEL.root.rotation.y = a;
      return true;
    },
    grab: function () {
      var all = document.querySelectorAll('canvas'), best = null, area = 0;
      for (var i = 0; i < all.length; i++) {
        var s = all[i].width * all[i].height;
        if (s > area) { area = s; best = all[i]; }
      }
      if (!best) return null;
      try { return best.toDataURL('image/png'); } catch (e) { return null; }
    },
  };
})();
</script>`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, hook + '</body>') : out + hook;
  notes.push('bake-hook-injected');
  return { html: out, notes };
}

(async () => {
  if (!fs.existsSync(THREE)) { console.error('vendor/three.min.js missing'); process.exit(2); }
  const idxPath = path.join(SRC, 'index.json');
  if (!fs.existsSync(idxPath)) { console.error('no ' + idxPath + ' — run tools/pull-models.sh'); process.exit(2); }
  let entries = JSON.parse(fs.readFileSync(idxPath, 'utf8')).entries;
  if (process.argv.length > 2) {
    const want = new Set(process.argv.slice(2));
    entries = entries.filter(e => want.has(e.slug));
  }
  fs.mkdirSync(OUT, { recursive: true });
  const work = path.join(OUT, '.work');
  fs.mkdirSync(work, { recursive: true });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const results = [];
  let ok = 0, bad = 0;

  for (const e of entries) {
    const { html, notes } = sanitise(fs.readFileSync(path.join(SRC, e.html), 'utf8'),
                                     path.relative(work, THREE).split(path.sep).join('/'));
    const tmp = path.join(work, e.slug + '.html');
    fs.writeFileSync(tmp, html);

    const page = await browser.newPage({ viewport: { width: CELL * 2, height: CELL * 2 } });
    const errs = [];
    page.on('pageerror', err => errs.push(err.message.split('\n')[0]));
    const netHits = [];
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      netHits.push(u.slice(0, 80)); return route.abort();
    });

    let frames = [], api = null;
    try {
      await page.goto('file://' + tmp, { waitUntil: 'load', timeout: 25000 });
      await page.waitForTimeout(SETTLE);
      api = await page.evaluate(() => ({
        hook: !!window.__bake,
        model: !!(window.MODEL && window.MODEL.root),
        bgCleared: window.__bake ? window.__bake.clearBg() : false,
      }));
      if (api.model) {
        for (let i = 0; i < FACINGS; i++) {
          const a = i * Math.PI * 2 / FACINGS;
          await page.evaluate((ang) => window.__bake.face(ang), a);
          await page.waitForTimeout(140);        // let its own loop redraw
          const d = await page.evaluate(() => window.__bake.grab());
          if (d) frames.push(d);
        }
      }
    } catch (err) { errs.push(String(err.message).split('\n')[0]); }

    let sheetBuf = null, px = null;
    if (frames.length) {
      const st = await browser.newPage();
      const dataUrl = await st.evaluate(async ({ frames, cell }) => {
        const imgs = await Promise.all(frames.map(src => new Promise((res, rej) => {
          const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
        })));
        const cv = document.createElement('canvas');
        cv.width = cell * imgs.length; cv.height = cell;
        const c = cv.getContext('2d');
        imgs.forEach((im, i) => c.drawImage(im, i * cell, 0, cell, cell));
        return cv.toDataURL('image/png');
      }, { frames, cell: CELL });
      // Content AND transparency check before writing. A frame count is not
      // evidence of pixels, and an opaque sheet is useless for a prop even if
      // it is full of them.
      px = await st.evaluate(async ({ src, cell, n }) => {
        const im = await new Promise((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
        });
        const cv = document.createElement('canvas');
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let opaque = 0, clear = 0, lit = 0;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 8) clear++;
          else { opaque++; if (d[i] + d[i + 1] + d[i + 2] > 24) lit++; }
          if (i % 400 === 0) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
        }
        // facings must actually differ from one another
        let turn = 0;
        if (n > 1) {
          const a = c.getImageData(0, 0, cell, cell).data;
          const b = c.getImageData(cell * (n >> 1), 0, cell, cell).data;
          for (let i = 0; i < a.length; i += 4)
            if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 3] - b[i + 3]) > 6) turn++;
        }
        const total = d.length / 4;
        return { clearFrac: clear / total, litFrac: lit / total, colors: seen.size, turn };
      }, { src: dataUrl, cell: CELL, n: frames.length });
      await st.close();
      sheetBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, e.slug + '.png'), sheetBuf);
    }
    await page.close();

    const transparent = px && px.clearFrac > 0.25;   // a prop must not fill its cell
    const hasContent = px && px.litFrac > 0.01 && px.colors >= 4;
    const turns = px && px.turn > 20;
    const good = frames.length === FACINGS && !netHits.length && transparent && hasContent && turns;
    if (good) ok++; else bad++;
    if (px && !transparent) errs.unshift('OPAQUE (' + (px.clearFrac * 100).toFixed(0) + '% clear)');
    else if (px && !hasContent) errs.unshift('EMPTY (lit ' + (px.litFrac * 100).toFixed(1) + '%)');
    else if (px && !turns) errs.unshift('facings identical');
    results.push({ slug: e.slug, frames: frames.length, good, api, px, errs: errs.slice(0, 2), notes });

    console.log(`  ${good ? ' ok ' : 'FAIL'}  ${e.slug.padEnd(26)} ${String(frames.length).padStart(2)}/${FACINGS}` +
      (px ? `  clear:${(px.clearFrac * 100).toFixed(0)}% lit:${(px.litFrac * 100).toFixed(1)}% col:${px.colors} turn:${px.turn}` : '  —') +
      (api && !api.bgCleared ? '  bg-not-cleared' : '') +
      (netHits.length ? `  NET:${netHits.length}` : '') +
      (errs.length ? `  ${errs[0].slice(0, 40)}` : ''));
  }
  await browser.close();

  const manPath = path.join(OUT, 'index.json');
  const prev = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')).entries || [] : [];
  const merged = new Map(prev.filter(e => fs.existsSync(path.join(OUT, e.sheet))).map(e => [e.slug, e]));
  for (const r of results) {
    if (r.good) merged.set(r.slug, { slug: r.slug, sheet: r.slug + '.png' });
    else merged.delete(r.slug);
  }
  const manifest = { kind: 'baked-models', facings: FACINGS, cell: CELL,
    baked: new Date().toISOString(), entries: [...merged.values()].sort((a, b) => a.slug < b.slug ? -1 : 1) };
  fs.writeFileSync(manPath, JSON.stringify(manifest, null, 2) + '\n');
  const embedded = { ...manifest, entries: manifest.entries.map(e => ({
    slug: e.slug, sheet: e.sheet,
    data: 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, e.sheet)).toString('base64') })) };
  fs.writeFileSync(path.join(OUT, 'index.js'),
    '// generated by tools/bake-models.js — do not edit\n' +
    'window.BAKED_MODELS = ' + JSON.stringify(embedded) + ';\n');

  fs.rmSync(work, { recursive: true, force: true });
  console.log('\n' + '-'.repeat(60));
  console.log(`  baked  : ${ok}\n  failed : ${bad}\n  out    : ${path.relative(ROOT, OUT)}`);
  console.log(`  network attempts: ${results.some(r => r.errs.some(e => /NET/.test(e))) ? 'SOME' : 'none'}`);
  process.exit(bad ? 1 : 0);
})();
