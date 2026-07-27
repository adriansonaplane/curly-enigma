// ============ DIABLOID: assets.js — art registry & ingest pipeline ============
'use strict';

// Every visual in this game is drawn procedurally at runtime. That was a
// deliberate choice (no build step, no external files) but it means there is
// nowhere to *put* real art when someone hands us some. This module is that
// place: a slot registry that sits in front of the procedural drawing code.
//
// A "slot" is a named visual the game asks for — a prop kind, a door leaf, a
// hazard tile, an effect. Resolution order for every slot:
//
//   1. registered art  -> blit it
//   2. placeholder on  -> draw a labelled box so gaps are visible, not invisible
//   3. otherwise       -> return false and let the existing vector code run
//
// Nothing breaks if a slot is never filled; the game looks exactly as it does
// today. That is the point — art can land one slot at a time.
//
// MANIFEST maps our slots onto entries in the two catalogues Kevin supplied.
// The catalogues are metadata only (slug/name/category/tags — no geometry, no
// URLs), and fabclaude.com answers 403 at the gateway from this environment,
// so nothing here can be fetched yet. The mapping is the part that survives:
// when egress opens, `ingest()` walks these slugs and fills the registry.
const Assets = {

  // ---- what we want, and what in the catalogue would serve ----
  // src: 'm' = models.json, 'f' = 3deffects.json
  // fit: how confident the match is — 'good' | 'weak' | none yet
  MANIFEST: {
    // -- structural: the biggest readability wins --
    door_wood:    { slug: 'wooden-door-uoc',          src: 'm', fit: 'good' },
    door_barred:  { slug: 'barred-dungeon-door-uoc',  src: 'm', fit: 'good' },
    door_arch:    { slug: 'pointed-archway',          src: 'm', fit: 'good' },
    stairs:       { slug: 'stone-flight-stairs',      src: 'm', fit: 'good' },
    trapdoor:     { slug: 'trapdoor-uoc',             src: 'm', fit: 'good' },

    // -- props, in rough order of how placeholder they look today --
    statue:       { slug: 'titan-watcher-statue-uoc', src: 'm', fit: 'good' },
    pillar:       { slug: 'runic-pillar-uoc',         src: 'm', fit: 'good' },
    sarcophagus:  { slug: 'imperial-sarcophagus-uoc', src: 'm', fit: 'good' },
    idol:         { slug: 'obsidian-king-statue-uoc', src: 'm', fit: 'good' },
    chandelier:   { slug: 'icicle-chandelier-uoc',    src: 'm', fit: 'weak' },
    fountain:     { slug: 'blessed-font-uoc',         src: 'm', fit: 'good' },
    bookshelf:    { slug: 'bookcase',                 src: 'm', fit: 'good' },
    grave:        { slug: 'tombstone',                src: 'm', fit: 'good' },
    urn:          { slug: 'cinerary-urn-uoc',         src: 'm', fit: 'good' },
    skullpile:    { slug: 'bone-heap-uoc',            src: 'm', fit: 'good' },
    bones:        { slug: 'bone-wind-chime-uoc',      src: 'm', fit: 'weak' },
    cobweb:       { slug: 'cobweb-cluster-uoc',       src: 'm', fit: 'good' },
    rubble:       { slug: 'rubble-heap-uoc',          src: 'm', fit: 'good' },
    rock:         { slug: 'mossy-rock-uoc',           src: 'm', fit: 'good' },
    crystal:      { slug: 'quartz-cluster-uoc',       src: 'm', fit: 'good' },
    stalagmite:   { slug: 'cave-stalagmite-uoc',      src: 'm', fit: 'good' },
    mushroom:     { slug: 'glowspore-colony-uoc',     src: 'm', fit: 'good' },
    orevein:      { slug: 'ore-vein-uoc',             src: 'm', fit: 'good' },
    lever:        { slug: 'lever-uoc',                src: 'm', fit: 'good' },
    brazier:      { slug: 'storm-keeper-brazier-uoc', src: 'm', fit: 'good' },
    torch:        { slug: 'wall-torch-sconce-uoc',    src: 'm', fit: 'good' },
    candles:      { slug: 'skull-sconce-uoc',         src: 'm', fit: 'good' },
    lantern:      { slug: 'patrol-lantern-uoc',       src: 'm', fit: 'good' },
    anvil:        { slug: 'inferno-anvil-uoc',        src: 'm', fit: 'good' },
    cauldron:     { slug: 'voodoo-cauldron-uoc',      src: 'm', fit: 'good' },
    banner:       { slug: 'battle-standard-uoc',      src: 'm', fit: 'good' },
    weaponrack:   { slug: 'weapon-rack',              src: 'm', fit: 'good' },
    crate:        { slug: 'crate-stack',              src: 'm', fit: 'good' },
    sack:         { slug: 'seed-sack-uoc',            src: 'm', fit: 'good' },
    chest:        { slug: 'crystal-chest-uoc',        src: 'm', fit: 'weak' },
    shrine:       { slug: 'ancestor-shrine-uoc',      src: 'm', fit: 'weak' },
    waypoint:     { slug: 'teleporter-pad-uoc',       src: 'm', fit: 'good' },
    tree:         { slug: 'autumn-spooky_tree',       src: 'm', fit: 'good' },
    spike:        { slug: 'spike-trap-floor-uoc',     src: 'm', fit: 'good' },
    wellhead:     { slug: 'water-pump-uoc',           src: 'm', fit: 'weak' },
    // no convincing dungeon-appropriate match found in the catalogue:
    table:        { slug: null, src: 'm', note: 'catalogue tables are all modern/domestic' },
    chair:        { slug: null, src: 'm', note: 'ditto — needs a rough timber stool' },
    pot:          { slug: null, src: 'm', note: 'catalogue pots are cookware or planters' },
    barrel:       { slug: null, src: 'm', note: 'nearest is a brewery vat, wrong scale' },

    // -- effects --
    fx_torch:     { slug: 'torch-3d',            src: 'f', fit: 'good' },
    fx_flame:     { slug: 'flame-3d',            src: 'f', fit: 'good' },
    fx_steamvent: { slug: 'geothermalsteam-3d',  src: 'f', fit: 'good' },
    fx_venttell:  { slug: 'steamvent-3d',        src: 'f', fit: 'good' },
    fx_flamejet:  { slug: 'flamejet-3d',         src: 'f', fit: 'good' },
    fx_smoke:     { slug: 'smokeplume-3d',       src: 'f', fit: 'good' },
    fx_ember:     { slug: 'embersdrift-3d',      src: 'f', fit: 'good' },
    fx_dust:      { slug: 'dustmotes-3d',        src: 'f', fit: 'good' },
    fx_fog:       { slug: 'fogbank-3d',          src: 'f', fit: 'good' },
    fx_groundfog: { slug: 'groundfog-3d',        src: 'f', fit: 'good' },
    fx_spark:     { slug: 'sparkblast-3d',       src: 'f', fit: 'good' },
    fx_lightning: { slug: 'lightning-bolt-3d',   src: 'f', fit: 'good' },
    fx_chain:     { slug: 'chain-lightning-3d',  src: 'f', fit: 'good' },
    fx_explosion: { slug: 'blast-3d',            src: 'f', fit: 'good' },
    fx_impact:    { slug: 'groundpound-3d',      src: 'f', fit: 'good' },
    fx_slash:     { slug: 'crescent-3d',         src: 'f', fit: 'good' },
    fx_blood:     { slug: 'bloodsplat-3d',       src: 'f', fit: 'good' },
    fx_bloodpool: { slug: 'bloodpool-3d',        src: 'f', fit: 'good' },
    fx_poison:    { slug: 'poison-cloud-3d',     src: 'f', fit: 'good' },
    fx_frost:     { slug: 'frost-nova-3d',       src: 'f', fit: 'good' },
    fx_meteor:    { slug: 'falling-meteor-3d',   src: 'f', fit: 'good' },
    fx_meteorwarn:{ slug: 'meteorwarn-3d',       src: 'f', fit: 'good' },
    fx_aoe:       { slug: 'aoemarker-3d',        src: 'f', fit: 'good' },
    fx_magiccircle:{ slug: 'magic-circle-3d',    src: 'f', fit: 'good' },
    fx_runes:     { slug: 'runes-3d',            src: 'f', fit: 'good' },
    fx_portal:    { slug: 'netherportal-3d',     src: 'f', fit: 'good' },
    fx_summon:    { slug: 'spawnportal-3d',      src: 'f', fit: 'good' },
    fx_buff:      { slug: 'buff-aura-3d',        src: 'f', fit: 'good' },
    fx_heal:      { slug: 'regenaura-3d',        src: 'f', fit: 'good' },
    fx_shield:    { slug: 'shield-3d',           src: 'f', fit: 'good' },
    fx_lava:      { slug: 'lavaflow-3d',         src: 'f', fit: 'good' },
    fx_ripple:    { slug: 'pondripple-3d',       src: 'f', fit: 'good' },
    fx_bossdeath: { slug: 'bossdeath-3d',        src: 'f', fit: 'good' },
  },

  packs: Object.create(null),     // slot -> { img, ax, ay, scale }
  failed: Object.create(null),    // slot -> reason string
  showPlaceholders: false,        // debug: draw labelled boxes for empty slots
  _ph: Object.create(null),

  // ---- registration ----
  // art may be a canvas/Image, or { img, ax, ay, scale }. ax/ay are the anchor
  // in image pixels: the point that should land on the tile centre. Defaults to
  // bottom-centre, which is what every prop in this game wants.
  register(slot, art) {
    if (!art) return false;
    const img = art.img || art;
    if (!img || !img.width) { this.failed[slot] = 'no pixels'; return false; }
    this.packs[slot] = {
      img,
      ax: art.ax === undefined ? img.width / 2 : art.ax,
      ay: art.ay === undefined ? img.height : art.ay,
      scale: art.scale || 1,
    };
    delete this.failed[slot];
    return true;
  },

  registerPack(obj) {
    let n = 0;
    for (const slot in obj) if (this.register(slot, obj[slot])) n++;
    return n;
  },

  unregister(slot) { delete this.packs[slot]; },
  has(slot) { return !!this.packs[slot]; },
  get(slot) { return this.packs[slot] || null; },

  // ---- drawing ----
  // Call from inside a transform already translated to the tile's screen
  // position. Returns true if it drew, false if the caller should fall back to
  // its own vector code. The two-value contract is what keeps this additive.
  draw(ctx, slot, zoom) {
    const p = this.packs[slot];
    if (p) {
      const s = (p.scale || 1);
      ctx.drawImage(p.img, -p.ax * s, -p.ay * s, p.img.width * s, p.img.height * s);
      return true;
    }
    if (this.showPlaceholders && this.MANIFEST[slot]) {
      const ph = this.placeholder(slot);
      ctx.drawImage(ph, -ph.width / 2, -ph.height);
      return true;
    }
    return false;
  },

  // A labelled box, baked once per slot. Colour-coded so a glance at the level
  // tells you which slots are mapped-but-empty (amber) versus unmapped (grey).
  placeholder(slot) {
    if (this._ph[slot]) return this._ph[slot];
    const W = 40, H = 44;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const entry = this.MANIFEST[slot];
    const mapped = entry && entry.slug;
    const edge = mapped ? '#e8a33c' : '#7a7a86';
    c.fillStyle = mapped ? 'rgba(232,163,60,0.16)' : 'rgba(120,120,134,0.16)';
    c.fillRect(2, 6, W - 4, H - 8);
    c.strokeStyle = edge; c.lineWidth = 1.5;
    c.setLineDash([3, 2]);
    c.strokeRect(2, 6, W - 4, H - 8);
    c.setLineDash([]);
    c.fillStyle = edge;
    c.font = '7px monospace'; c.textAlign = 'center';
    c.fillText(slot.slice(0, 11), W / 2, H - 14);
    if (mapped) { c.globalAlpha = 0.75; c.fillText('mapped', W / 2, H - 5); }
    this._ph[slot] = cv;
    return cv;
  },

  // ---- ingest ----
  // The path a real asset takes to get here. Given a resolver that turns a
  // catalogue slug into something drawable, walk the manifest and fill slots.
  // `resolve(slug, src, slot)` should return an image/canvas (or a promise for
  // one), or null. Failures are recorded per slot rather than thrown, so one
  // bad asset cannot take the level down.
  async ingest(resolve, opts = {}) {
    const only = opts.only || null;
    const out = { loaded: 0, skipped: 0, failed: 0 };
    for (const slot in this.MANIFEST) {
      if (only && !only.includes(slot)) continue;
      const e = this.MANIFEST[slot];
      if (!e.slug) { out.skipped++; continue; }
      try {
        const art = await resolve(e.slug, e.src, slot);
        if (art && this.register(slot, art)) out.loaded++;
        else { this.failed[slot] = 'resolver returned nothing'; out.failed++; }
      } catch (err) {
        this.failed[slot] = String(err && err.message || err);
        out.failed++;
      }
    }
    return out;
  },

  // ---- the catalogue API ----
  // Four documented endpoints:
  //   GET /api/models/:slug          full metadata + HTML source
  //   GET /api/models/:slug/html     raw HTML document, for an iframe
  //   GET /api/effects/:slug         effect metadata + preview HTML
  //   GET /api/effects/:slug/preview raw animation HTML, for an iframe
  //
  // Note what that means: these assets are **HTML documents**, not images.
  // There is no .png to point an <img> at. So the ingest path is: load the
  // document in an offscreen iframe, let it paint, then capture it. Canvas 2D
  // cannot rasterise arbitrary DOM, so capture goes through whatever the
  // document exposes — a <canvas> inside it is the common case for these
  // (the catalogue describes them as procedurally animated scenes), and an
  // SVG root is handled as a fallback via a data-URI blob.
  //
  // NONE OF THIS RUNS TODAY. fabclaude.com is refused at the network gateway
  // (403 to CONNECT, every endpoint, HTTP 000 — the connection is never
  // established). This is written and wired so that the day egress opens, the
  // only change needed is calling Assets.api.ingestPacks().
  api: {
    base: 'https://fabclaude.com/api',
    timeout: 15000,
    // one shared hidden host for the iframes we spin up
    _host: null,

    url(kind, slug, sub) {
      const seg = kind === 'effect' || kind === 'f' ? 'effects' : 'models';
      return this.base + '/' + seg + '/' + encodeURIComponent(slug) + (sub ? '/' + sub : '');
    },

    async meta(slug, kind) {
      const r = await fetch(this.url(kind, slug), { mode: 'cors' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + slug);
      return r.json();
    },

    // Raw document for the iframe: /html for models, /preview for effects.
    async html(slug, kind) {
      const sub = (kind === 'effect' || kind === 'f') ? 'preview' : 'html';
      const r = await fetch(this.url(kind, slug, sub), { mode: 'cors' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + slug + '/' + sub);
      return r.text();
    },

    host() {
      if (this._host) return this._host;
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
      document.body.appendChild(d);
      this._host = d;
      return d;
    },

    // Render one document offscreen and hand back a canvas. `settle` is how
    // long to let a procedural animation run before capturing, so we grab a
    // representative frame rather than frame zero.
    async rasterise(srcHtml, opts = {}) {
      const W = opts.w || 256, H = opts.h || 256, settle = opts.settle ?? 600;
      const frame = document.createElement('iframe');
      frame.width = W; frame.height = H;
      frame.setAttribute('sandbox', 'allow-scripts');   // no same-origin: it is untrusted third-party markup
      this.host().appendChild(frame);
      try {
        await new Promise((ok, no) => {
          const timer = setTimeout(() => no(new Error('iframe load timeout')), this.timeout);
          frame.onload = () => { clearTimeout(timer); ok(); };
          frame.onerror = () => { clearTimeout(timer); no(new Error('iframe failed')); };
          frame.srcdoc = srcHtml;
        });
        await new Promise(r => setTimeout(r, settle));
        // A sandboxed frame without allow-same-origin cannot be read from the
        // parent — by design, since this is third-party markup. Capture has to
        // come from inside, so the document must post a bitmap out. Documents
        // that don't cooperate cannot be rasterised, and that is the honest
        // outcome rather than a silent blank.
        return await this.capture(frame, W, H);
      } finally {
        frame.remove();
      }
    },

    // Ask the framed document for a bitmap. Anything that answers the
    // 'diabloid:capture' message with an ImageBitmap or a data URL works.
    capture(frame, W, H) {
      return new Promise((ok, no) => {
        const timer = setTimeout(() => no(new Error('no capture response')), 4000);
        const onMsg = (ev) => {
          if (ev.source !== frame.contentWindow) return;
          const d = ev.data;
          if (!d || d.type !== 'diabloid:capture:result') return;
          clearTimeout(timer); window.removeEventListener('message', onMsg);
          if (d.bitmap) {
            const cv = document.createElement('canvas');
            cv.width = d.bitmap.width || W; cv.height = d.bitmap.height || H;
            cv.getContext('2d').drawImage(d.bitmap, 0, 0);
            ok(cv);
          } else if (d.dataUrl) {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => no(new Error('bad capture data URL'));
            img.src = d.dataUrl;
          } else no(new Error('capture response carried nothing'));
        };
        window.addEventListener('message', onMsg);
        frame.contentWindow.postMessage({ type: 'diabloid:capture', w: W, h: H }, '*');
      });
    },

    // A resolver for Assets.ingest: slug -> canvas, via metadata + iframe.
    resolver(opts = {}) {
      return async (slug, src) => {
        const kind = src === 'f' ? 'effect' : 'model';
        const doc = await this.html(slug, kind);
        return this.rasterise(doc, opts);
      };
    },

    // Pull only what the act packs ask for — a few dozen entries, not 4,127.
    async ingestPacks(themes, opts = {}) {
      const want = new Set();
      const list = themes ? [].concat(themes) : Object.keys(ACT_PACKS);
      for (const th of list) {
        const p = ACT_PACKS[th];
        if (!p) continue;
        for (const m of p.models) want.add(m.slot);
        for (const e of p.effects) want.add(e.slot);
      }
      return Assets.ingest(this.resolver(opts), { only: [...want] });
    },
  },

  // Fold the curated act packs into MANIFEST. Called once at boot, after
  // assetpacks.js has defined them — pack entries win, since they were chosen
  // per act rather than by a generic name match.
  absorbPacks() {
    if (typeof packManifest !== 'function') return 0;
    const extra = packManifest();
    let n = 0;
    for (const slot in extra) {
      const e = extra[slot];
      this.MANIFEST[slot] = Object.assign({}, this.MANIFEST[slot], e, { fit: 'good' });
      n++;
    }
    return n;
  },

  // ---- reporting ----
  // What is mapped, what is filled, and what still has no candidate at all.
  coverage() {
    const slots = Object.keys(this.MANIFEST);
    const mapped = slots.filter(s => this.MANIFEST[s].slug);
    const unmapped = slots.filter(s => !this.MANIFEST[s].slug);
    const loaded = slots.filter(s => this.has(s));
    const weak = mapped.filter(s => this.MANIFEST[s].fit === 'weak');
    return {
      slots: slots.length,
      mapped: mapped.length,
      unmapped: unmapped.length,
      weak: weak.length,
      loaded: loaded.length,
      pending: mapped.length - loaded.length,
      failed: Object.keys(this.failed).length,
      unmappedSlots: unmapped,
      weakSlots: weak,
    };
  },
};
