#!/usr/bin/env node
// ============================================================================
// DIABLOID — bake catalogue effect payloads into sprite sheets.
//
//   node tools/bake-effects.js [slug ...]
//
// The payloads are three.js scenes that build their geometry procedurally at
// runtime. There is no geometry in the metadata to import — the JSON carries
// the same HTML in a preview_html field — so the only way to get pixels is to
// run each scene and photograph it.
//
// This is an OFFLINE BAKE, not a runtime dependency. It runs here, writes PNG
// sprite sheets into assets/effects/baked/, and those get committed. The game
// keeps loading nothing but its own canvas code: zero dependencies, no build
// step, three.js never ships to a player.
//
// Each payload is sanitised before it is allowed to run:
//   - the cdnjs <script src> is rewritten to the vendored three.js r128
//     (same version, fetched from the npm registry rather than the CDN)
//   - the window.parent.postMessage debug channel is neutralised
//   - a capture hook is injected, because none of the payloads has one
// Anything still reaching for the network is a bug and the page will simply
// fail to load it — the bake runs from file:// with no network at all.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/effects');
const OUT = path.join(SRC, 'baked');
const THREE = path.join(ROOT, 'vendor/three.min.js');

const FRAMES = +(process.env.FRAMES || 8);     // frames per sheet
const CELL = +(process.env.CELL || 128);       // px per frame
const SETTLE = +(process.env.SETTLE || 900);   // ms before the first grab
const STEP = +(process.env.STEP || 110);       // ms between grabs

// Some effects are one-shots that are over before the default settle window.
// An explosion has finished expanding by 900ms and captures as near-black, so
// it gets sampled from the moment it starts instead.
const TIMING = {
  'blast-3d':       { settle: 250, step: 60 },
  'bossdeath-3d':   { settle: 300, step: 80 },
  'falling-meteor-3d': { settle: 300, step: 80 },
};

// ---------------------------------------------------------------------------
// Sanitiser. Returns { html, notes } — notes records what was changed, so a
// payload that needed an unexpected edit is visible rather than silently
// rewritten.
function sanitise(html, threeUrl) {
  const notes = [];
  let out = html;

  // 1. external three.js -> vendored copy, plus a shim.
  //    WebGL clears its drawing buffer after compositing unless you ask it
  //    not to, so toDataURL() on the canvas afterwards returns solid black.
  //    Forcing preserveDrawingBuffer at construction is what makes an
  //    out-of-band capture possible at all. The shim has to land between
  //    three.js and the payload script, which is why it is spliced in here
  //    rather than appended at the end of the document.
  const shim = `<script>
(function () {
  if (!window.THREE || !THREE.WebGLRenderer) return;
  var Orig = THREE.WebGLRenderer;
  function Patched(params) {
    var p = Object.assign({}, params || {}, { preserveDrawingBuffer: true });
    return new Orig(p);
  }
  Patched.prototype = Orig.prototype;
  THREE.WebGLRenderer = Patched;
})();
</script>`;
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*three[^"']*["'][^>]*><\/script>/gi, () => {
    notes.push('three-src-rewritten+preserveDrawingBuffer');
    return `<script src="${threeUrl}"></script>` + shim;
  });

  // 2. any OTHER remote script is not rewritten — it is removed and flagged,
  //    because we have no vetted local copy to substitute.
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*><\/script>/gi, (m) => {
    notes.push('REMOVED-unknown-remote-script: ' + m.slice(0, 80));
    return '<!-- removed remote script -->';
  });

  // 3. remote stylesheets/fonts
  out = out.replace(/<link\b[^>]*\bhref\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*>/gi, () => {
    notes.push('REMOVED-remote-link');
    return '<!-- removed remote link -->';
  });

  // 4. the fcDbg debug channel talks to window.parent with a "*" target.
  //    Harmless in intent, but it is untrusted code holding a handle on the
  //    embedder, so it goes.
  out = out.replace(/window\.parent\.postMessage\s*\(/g, () => {
    notes.push('parent-postMessage-neutralised');
    return 'void (';
  });

  // 5. capture hook. No payload ships one, and a sandboxed frame cannot be
  //    read from outside, so the frame has to hand the bitmap out itself.
  const hook = `
<script>
(function () {
  function findCanvas() {
    var all = document.querySelectorAll('canvas');
    var best = null, area = 0;
    for (var i = 0; i < all.length; i++) {
      var a = all[i].width * all[i].height;
      if (a > area) { area = a; best = all[i]; }
    }
    return best;
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'diabloid:capture') return;
    var c = findCanvas();
    if (!c) { parentPost({ type: 'diabloid:capture:result', error: 'no canvas' }); return; }
    var url = null;
    try { url = c.toDataURL('image/png'); }
    catch (e) { parentPost({ type: 'diabloid:capture:result', error: String(e) }); return; }
    parentPost({ type: 'diabloid:capture:result', dataUrl: url, w: c.width, h: c.height });
  });
  function parentPost(msg) { (window.parent || window).postMessage(msg, '*'); }
})();
</script>`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, hook + '</body>');
  else out += hook;
  notes.push('capture-hook-injected');
  return { html: out, notes };
}

// ---------------------------------------------------------------------------
(async () => {
  if (!fs.existsSync(THREE)) {
    console.error('vendor/three.min.js missing. Fetch it from the npm registry:');
    console.error('  npm pack three@0.128.0 && tar xzf three-0.128.0.tgz package/build/three.min.js');
    process.exit(2);
  }
  const idxPath = path.join(SRC, 'index.json');
  if (!fs.existsSync(idxPath)) { console.error('no ' + idxPath); process.exit(2); }
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  let entries = idx.entries;
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
    const srcHtml = fs.readFileSync(path.join(SRC, e.html), 'utf8');
    const { html, notes } = sanitise(srcHtml, path.relative(work, THREE).split(path.sep).join('/'));
    const tmp = path.join(work, e.slug + '.html');
    fs.writeFileSync(tmp, html);

    const page = await browser.newPage({ viewport: { width: CELL * 2, height: CELL * 2 } });
    const errs = [];
    page.on('pageerror', err => errs.push(err.message.split('\n')[0]));
    const blockedReq = [];
    // hard proof that nothing phones home: fail any non-file request
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      blockedReq.push(u.slice(0, 90));
      return route.abort();
    });

    let frames = [];
    try {
      const tm = TIMING[e.slug] || {};
      const settle = tm.settle || SETTLE, step = tm.step || STEP;
      await page.goto('file://' + tmp, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(settle);
      for (let i = 0; i < FRAMES; i++) {
        const dataUrl = await page.evaluate(() => new Promise((res) => {
          const to = setTimeout(() => res(null), 3000);
          const on = (ev) => {
            const d = ev.data;
            if (!d || d.type !== 'diabloid:capture:result') return;
            clearTimeout(to); window.removeEventListener('message', on);
            res(d.dataUrl || null);
          };
          window.addEventListener('message', on);
          window.postMessage({ type: 'diabloid:capture' }, '*');
        }));
        if (dataUrl) frames.push(dataUrl);
        await page.waitForTimeout(step);
      }
    } catch (err) {
      errs.push(String(err.message).split('\n')[0]);
    }

    // stitch the frames into one horizontal sheet, in-page so we stay in canvas
    let sheetBuf = null, pixels = null;
    if (frames.length) {
      const stitcher = await browser.newPage();
      const dataUrl = await stitcher.evaluate(async ({ frames, cell }) => {
        const imgs = await Promise.all(frames.map(src => new Promise((res, rej) => {
          const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
        })));
        const cv = document.createElement('canvas');
        cv.width = cell * imgs.length; cv.height = cell;
        const c = cv.getContext('2d');
        imgs.forEach((im, i) => c.drawImage(im, i * cell, 0, cell, cell));
        return cv.toDataURL('image/png');
      }, { frames, cell: CELL });
      // Verify the sheet actually has content BEFORE writing it. The first
      // run of this tool reported "8/8 frames ok" for sheets that were solid
      // black — the capture succeeded, the scene had never drawn. A frame
      // count is not evidence of pixels, so check the pixels.
      pixels = await stitcher.evaluate(async ({ src, cell, n }) => {
        const im = await new Promise((res, rej) => {
          const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
        });
        const cv = document.createElement('canvas');
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext('2d');
        c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        const seen = new Set();
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 8 && (d[i] + d[i + 1] + d[i + 2]) > 24) lit++;
          if (i % 320 === 0) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
        }
        // does the animation actually move between the first and middle frame?
        let motion = 0;
        if (n > 1) {
          const a = c.getImageData(0, 0, cell, cell).data;
          const b = c.getImageData(cell * (n >> 1), 0, cell, cell).data;
          for (let i = 0; i < a.length; i += 4)
            if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 3] - b[i + 3]) > 6) motion++;
        }
        return { litFrac: lit / (d.length / 4), colors: seen.size, motion };
      }, { src: dataUrl, cell: CELL, n: frames.length });
      await stitcher.close();
      sheetBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, e.slug + '.png'), sheetBuf);
    }
    await page.close();

    // A sheet counts as baked only if it has lit pixels, more than a couple of
    // distinct colours, and visible motion between frames.
    const blank = !pixels || pixels.litFrac < 0.002 || pixels.colors < 3;
    const still = pixels && pixels.motion < 16;
    const good = frames.length === FRAMES && !blockedReq.length && !blank && !still;
    if (blank) errs.unshift('BLANK sheet (litFrac=' + (pixels ? pixels.litFrac.toFixed(4) : 'n/a') +
                            ', colors=' + (pixels ? pixels.colors : 0) + ')');
    else if (still) errs.unshift('STATIC sheet (no motion between frames)');
    if (good) ok++; else bad++;
    results.push({ slug: e.slug, frames: frames.length, bytes: sheetBuf ? sheetBuf.length : 0,
                   blockedReq, errs: errs.slice(0, 2), notes, pixels, good });
    console.log(`  ${good ? ' ok ' : 'FAIL'}  ${e.slug.padEnd(22)} ${String(frames.length).padStart(2)}/${FRAMES} frames` +
                (sheetBuf ? `  ${String(sheetBuf.length).padStart(7)} B` : '        —') +
                (blockedReq.length ? `  NET:${blockedReq.length}` : '') +
                (pixels ? `  lit:${(pixels.litFrac * 100).toFixed(1)}% col:${pixels.colors} mot:${pixels.motion}` : '') +
                (errs.length ? `  ${errs[0].slice(0, 46)}` : ''));
  }
  await browser.close();

  // manifest for the runtime loader
  // Merge into the existing manifest rather than replacing it. Running with
  // slugs on the command line only processes those, so writing `results`
  // straight out would truncate the index down to whatever this run touched
  // and silently drop every other baked sheet — the same trap the pull script
  // had. Anything whose PNG is still on disk stays listed.
  const manPath = path.join(OUT, 'index.json');
  const prev = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')).entries || [] : [];
  const merged = new Map(prev.filter(e => fs.existsSync(path.join(OUT, e.sheet))).map(e => [e.slug, e]));
  for (const r of results) {
    if (r.good) merged.set(r.slug, { slug: r.slug, sheet: r.slug + '.png' });
    else merged.delete(r.slug);          // a slug that failed THIS run is not usable
  }
  fs.writeFileSync(manPath, JSON.stringify({
    kind: 'baked-effects', frames: FRAMES, cell: CELL,
    baked: new Date().toISOString(),
    entries: [...merged.values()].sort((a, b) => a.slug < b.slug ? -1 : 1),
  }, null, 2) + '\n');

  fs.rmSync(work, { recursive: true, force: true });

  const netHits = results.filter(r => r.blockedReq.length);
  console.log('\n' + '-'.repeat(60));
  console.log(`  baked   : ${ok}`);
  console.log(`  failed  : ${bad}`);
  console.log(`  out     : ${path.relative(ROOT, OUT)}`);
  console.log(`  network attempts during bake: ${netHits.length ? netHits.length + ' payload(s)!' : 'none'}`);
  for (const r of netHits) console.log(`      ${r.slug}: ${r.blockedReq.join(', ')}`);
  process.exit(bad ? 1 : 0);
})();
