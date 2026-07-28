// ============ DIABLOID: render.js — isometric renderer, lighting, FX ============
'use strict';

const ISO_X = 32, ISO_Y = 16, WALL_PX = 40;

// ---------------- renderer ----------------
const Render = {
  cv: null, ctx: null, lightCv: null, lctx: null,
  W: 0, H: 0, dpr: 1, mmCv: null, mmCtx: null,
  exploreT: 0,
  fx: {},               // effect toggles owned by the settings UI
  qualityMode: 'auto',  // 'auto' lets trackFps degrade; 'high'/'low' pin it
  // Lighting mood. In 'spooky' the hero stops carrying a lantern: ambient
  // darkness closes in and torches, braziers, lava and glowing growths become
  // the only real light sources.
  mood: 'spooky',
  heroLightMul: 0.42,   // fraction of the hero's light radius that survives

  ambientFor(th) {
    if (this.mood !== 'spooky') return th.ambient;
    return Math.min(0.985, 1 - (1 - th.ambient) * 0.28);
  },

  init() {
    this.cv = document.getElementById('game');
    this.ctx = this.cv.getContext('2d');
    this.lightCv = document.createElement('canvas');
    this.lctx = this.lightCv.getContext('2d');
    this.mmCv = document.getElementById('minimap');
    this.mmCtx = this.mmCv.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lightCv.width = Math.ceil(this.W / 2); this.lightCv.height = Math.ceil(this.H / 2);
    // pre-baked vignette (half-res, stretched at draw time)
    const cw = Math.ceil(this.W / 2), ch = Math.ceil(this.H / 2);
    this.vinCv = document.createElement('canvas');
    this.vinCv.width = cw; this.vinCv.height = ch;
    const vc = this.vinCv.getContext('2d');
    const vg = vc.createRadialGradient(cw / 2, ch / 2, ch * 0.42, cw / 2, ch / 2, Math.max(cw, ch) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.7, 'rgba(0,0,0,0.1)'); vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    vc.fillStyle = vg; vc.fillRect(0, 0, cw, ch);
  },

  camSX: 0, camSY: 0,
  // Projection runs through Cam: screen = P(zoom,pitch) · R(yaw) · (world - focus)
  worldToScreen(x, y, z = 0) {
    const dx = x - Cam.fx, dy = y - Cam.fy;
    const rx = dx * Cam.cos - dy * Cam.sin, ry = dx * Cam.sin + dy * Cam.cos;
    return [
      (rx - ry) * Cam.ux + this.W / 2 + Cam.shx,
      (rx + ry) * Cam.uy + this.H / 2 - z * Cam.zoom + Cam.shy,
    ];
  },
  screenToWorld(sx, sy) {
    const a = (sx - this.W / 2 - Cam.shx) / Cam.ux;   // rx - ry
    const b = (sy - this.H / 2 - Cam.shy) / Cam.uy;   // rx + ry
    const rx = (a + b) / 2, ry = (b - a) / 2;
    return [
      Cam.fx + rx * Cam.cos + ry * Cam.sin,
      Cam.fy - rx * Cam.sin + ry * Cam.cos,
    ];
  },


  // Auto quality: if a machine can't hold frame rate with the full effect
  // stack, quietly shed the most fill-hungry layers (fog, god rays, AO,
  // directional shadows). Degrade-only, re-evaluated over 2.5s windows.
  quality: 'high', _fpsN: 0, _fpsT: 0,
  trackFps(dt) {
    if (this.qualityMode !== 'auto') { this.quality = this.qualityMode; return; }
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 2.5) {
      const avg = this._fpsN / this._fpsT;
      this._fpsN = 0; this._fpsT = 0;
      if (this.quality === 'high' && avg < 34 && G.time > 8) this.quality = 'low';
    }
  },

  frame(dt, t) {
    const ctx = this.ctx, map = G.map, pl = G.player;
    if (!map || !pl) return;
    this.trackFps(dt);
    FX3.update(dt);
    this.updateFog(dt);
    this.updateAmbient(dt);

    // camera + shake
    if (this.fx.shake === false) G.shake = 0;
    G.shake = Math.max(0, G.shake - dt * 30);
    Cam.shx = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.5 : 0;
    Cam.shy = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.5 : 0;
    Cam.update(dt, pl);

    // explored fog for minimap
    this.exploreT -= dt;
    if (this.exploreT <= 0) {
      this.exploreT = 0.25;
      const R = 9;
      for (let y = Math.max(0, Math.floor(pl.y - R)); y < Math.min(map.h, pl.y + R); y++)
        for (let x = Math.max(0, Math.floor(pl.x - R)); x < Math.min(map.w, pl.x + R); x++)
          if (U.dist(x + 0.5, y + 0.5, pl.x, pl.y) < R) map.explored[y * map.w + x] = 1;
      this.drawMinimap();
    }

    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 0, this.W, this.H);

    const tiles = Sprites.getTiles(map.theme);
    this._occl = Cam.mode === 'third' && !map.town;
    this._plDepth = Cam.depth(pl.x, pl.y);
    const R = Cam.viewRadius(this.W, this.H);
    const cx = Math.floor(Cam.fx), cy = Math.floor(Cam.fy);
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(map.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(map.h - 1, Math.ceil(cy + R));

    // ---------- floor pass ----------
    // One camera transform for the whole pass, then every tile blits at its
    // classic-projection offset — correct at any yaw, and a single state
    // change instead of one per tile.
    const lavaFrame = Math.floor(t * 5) % 4;
    const waterFrame = Math.floor(t * 2.4) % 3;
    const aoTiles = Sprites.getAO();
    const hiQ = this.quality === 'high';
    const useAO = hiQ && this.fx.ao !== false && map.ao;
    const M = Cam.tileMatrix();
    const cxs = this.W / 2 + Cam.shx, cys = this.H / 2 + Cam.shy;
    const special = [];
    ctx.save();
    ctx.setTransform(M[0] * this.dpr, M[1] * this.dpr, M[2] * this.dpr, M[3] * this.dpr,
      cxs * this.dpr, cys * this.dpr);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * map.w + tx;
        const tile = map.t[i];
        if (tile === TILE.WALL) continue;
        const dx = tx + 0.5 - Cam.fx, dy = ty + 0.5 - Cam.fy;
        const px = (dx - dy) * ISO_X, py = (dx + dy) * ISO_Y;
        const sx = M[0] * px + M[2] * py + cxs, sy = M[1] * px + M[3] * py + cys;
        if (sx < -90 || sx > this.W + 90 || sy < -90 || sy > this.H + 110) continue;
        const hz = map.haz[i];
        let img;
        if (hz === HAZ.LAVA) img = tiles.lava[lavaFrame];
        else if (hz === HAZ.WATER) img = tiles.water[waterFrame];
        else if (hz === HAZ.SPIKES) img = tiles.spikes;
        else if (hz === HAZ.GAS) img = tiles.gas;
        else if (isVent(hz)) img = tiles[VENT_KINDS[hz].tile];
        else img = tiles.floors[map.variant[i] % tiles.floors.length];
        ctx.drawImage(img, px - ISO_X, py - ISO_Y, ISO_X * 2, ISO_Y * 2);
        if (useAO && map.ao[i]) ctx.drawImage(aoTiles[map.ao[i]], px - ISO_X, py - ISO_Y, ISO_X * 2, ISO_Y * 2);
        if (tile === TILE.EXIT || tile === TILE.ENTRY || isVent(hz) || (hz === HAZ.WATER && hiQ))
          special.push([tx, ty, tile, hz, sx, sy]);
      }
    }
    ctx.restore();

    // portal glyphs and water glints, in plain screen space
    for (const [tx, ty, tile, hz, sx, sy] of special) {
      if (hz === HAZ.WATER) {
        const gl = 0.5 + 0.5 * Math.sin(t * 1.7 + tx * 2.6 + ty * 4.1);
        if (gl > 0.55) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (gl - 0.55) * 0.35;
          ctx.fillStyle = '#cfe8ff';
          ctx.beginPath(); ctx.ellipse(sx + Math.sin(t + tx) * 8, sy + Math.cos(t * 0.8 + ty) * 3, 10 * Cam.zoom, 3.2 * Cam.zoom, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      if (tile === TILE.EXIT || tile === TILE.ENTRY) {
        const glow = tile === TILE.EXIT ? '#ff8a2f' : '#8fc8ff';
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.sin(t * 4) * 0.2;
        ctx.strokeStyle = glow; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - Cam.uy * 0.7); ctx.lineTo(sx + Cam.ux * 0.7, sy);
        ctx.lineTo(sx, sy + Cam.uy * 0.7); ctx.lineTo(sx - Cam.ux * 0.7, sy);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = U.rgba(glow, 0.18); ctx.fill();
        ctx.restore();
      }
      if (isVent(hz)) this.drawVent(ctx, tx, ty, sx, sy, t, VENT_KINDS[hz]);
    }

    // ground effect zones
    for (const gr of G.grounds) {
      const [sx, sy] = this.worldToScreen(gr.x, gr.y);
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(t * 6) * 0.05;
      ctx.fillStyle = ELEM[gr.elem].color;
      ctx.beginPath(); ctx.ellipse(sx, sy, gr.r * Cam.ux, gr.r * Cam.uy, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // meteor telegraphs
    for (const pd of G.pending) {
      const [sx, sy] = this.worldToScreen(pd.x, pd.y);
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 12) * 0.25;
      ctx.strokeStyle = pd.ally ? U.rgba(ELEM[pd.elem].color, 0.8) : '#ff3c2f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, pd.radius * Cam.ux, pd.radius * Cam.uy, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx, sy, pd.radius * Cam.ux * (1 - pd.t), pd.radius * Cam.uy * (1 - pd.t), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // expanding rings
    for (const r of G.rings) {
      const prog = 1 - r.t / r.maxT;
      const rr = U.lerp(r.r, r.maxR, prog);
      const [sx, sy] = this.worldToScreen(r.x, r.y);
      ctx.save();
      ctx.globalAlpha = (r.alpha || 0.9) * (r.t / r.maxT);
      ctx.strokeStyle = r.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, rr * Cam.ux, rr * Cam.uy, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ---------- target reticle (painted on the ground) ----------
    Target.draw(ctx, t);

    // ---------- depth-sorted pass: walls, props, things, entities ----------
    const list = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * map.w + tx;
        if (map.t[i] !== TILE.WALL) continue;
        // skip fully buried walls
        const nb = (Dungeon.isWall(map, tx + 1, ty) && Dungeon.isWall(map, tx - 1, ty) &&
                    Dungeon.isWall(map, tx, ty + 1) && Dungeon.isWall(map, tx, ty - 1) &&
                    Dungeon.isWall(map, tx + 1, ty + 1) && Dungeon.isWall(map, tx - 1, ty - 1) &&
                    Dungeon.isWall(map, tx - 1, ty + 1) && Dungeon.isWall(map, tx + 1, ty - 1));
        if (nb) continue;
        list.push({ d: Cam.depth(tx + 0.5, ty + 0.5), kind: 'wall', tx, ty });
      }
    }
    const D = (x, y) => Cam.depth(x, y);
    const cull2 = (R + 3) * (R + 3);
    for (const pr of map.props) if (U.dist2(pr.x, pr.y, Cam.fx, Cam.fy) < cull2) list.push({ d: D(pr.x, pr.y), kind: 'prop', pr });
    for (const dr of map.doors) if (U.dist2(dr.x, dr.y, Cam.fx, Cam.fy) < cull2) list.push({ d: D(dr.x, dr.y), kind: 'door', dr });
    for (const th of map.things) if (U.dist2(th.x, th.y, Cam.fx, Cam.fy) < cull2) list.push({ d: D(th.x, th.y), kind: 'thing', th });
    for (const gi of G.groundItems) list.push({ d: D(gi.x, gi.y), kind: 'gitem', gi });
    for (const m of G.monsters) list.push({ d: D(m.x, m.y), kind: 'mon', m });
    for (const n of G.npcs) list.push({ d: D(n.x, n.y), kind: 'npc', n });
    if (map.town && typeof Social !== 'undefined')
      for (const sp of Social.townSims) list.push({ d: D(sp.x, sp.y), kind: 'sim', sp });
    for (const db of Physics.debris) if (db.big) list.push({ d: D(db.x, db.y), kind: 'debris', db });
    const pp = G.portalOnMap(map);
    if (pp) list.push({ d: D(pp.x, pp.y), kind: 'portal', pp });
    if (map.waypoint) list.push({ d: D(map.waypoint.x, map.waypoint.y), kind: 'waypoint' });
    if (!pl.dead) list.push({ d: D(pl.x, pl.y), kind: 'player' });
    for (const p of G.projs) list.push({ d: D(p.x, p.y), kind: 'proj', p });
    list.sort((a, b) => a.d - b.d);

    for (const it of list) {
      switch (it.kind) {
        case 'wall': this.drawWall(ctx, it.tx, it.ty, tiles); break;
        case 'prop': this.drawProp(ctx, it.pr, t); break;
        case 'door': this.drawDoor(ctx, it.dr, t); break;
        case 'thing': this.drawThing(ctx, it.th, t); break;
        case 'gitem': this.drawGroundItem(ctx, it.gi, t); break;
        case 'mon': this.drawActor(ctx, it.m, t); break;
        case 'npc': this.drawNpc(ctx, it.n, t); break;
        case 'sim': this.drawSim(ctx, it.sp, t); break;
        case 'player': this.drawPlayer(ctx, pl, t); break;
        case 'proj': this.drawProj(ctx, it.p, t); break;
        case 'debris': Physics.drawBig(ctx, it.db, t); break;
        case 'portal': this.drawPortal(ctx, it.pp, t); break;
        case 'waypoint': this.drawWaypoint(ctx, map.waypoint, t); break;
      }
    }

    // ---------- physics debris ----------
    Physics.drawSmall(ctx);

    // ---------- particles ----------
    // Textured quads from the atlas rather than flat discs. Particles carry an
    // optional `shape`; anything that doesn't name one gets 'dot', which is the
    // soft-edged descendant of the circle this used to draw.
    for (const p of G.parts) {
      const [sx, sy] = this.worldToScreen(p.x, p.y, p.z);
      if (sx < -24 || sx > this.W + 24 || sy < -24 || sy > this.H + 24) continue;
      const a = Math.min(1, p.life / p.maxLife * 1.5);
      if (a <= 0) continue;
      const img = Sprites.getParticle(p.shape || 'dot', p.color);
      // atlas art has soft falloff out to its edge, so it needs more room than
      // the old hard disc of the same nominal radius
      const r = p.size * 1.9 * Cam.zoom;
      ctx.save();
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      if (p.rot !== undefined) {
        ctx.translate(sx, sy);
        ctx.rotate(p.rot + (p.spin || 0) * (p.maxLife - p.life));
        ctx.drawImage(img, -r, -r, r * 2, r * 2);
      } else {
        ctx.drawImage(img, sx - r, sy - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    // lightning bolts
    for (const b of G.bolts) {
      const [sx, sy] = this.worldToScreen(b.x, b.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.t / b.maxT;
      ctx.strokeStyle = b.color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      let px = sx, py = sy - 180;
      ctx.moveTo(px, py);
      for (let i = 1; i <= 6; i++) {
        px = sx + (i === 6 ? 0 : U.rf(U.rand, -14, 14));
        py = sy - 180 + i * 30;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ---------- atmosphere & lighting stack ----------
    this.drawShafts(ctx, t);      // volumetric god rays (lit by their own punch-out)
    this.drawFog(ctx, t, 1);      // fog bank — sits under the darkness so lights carve it
    this.drawLighting(t);
    this.drawGrade(ctx);          // per-theme color grade + vignette (single baked blit)

    // ---------- damage numbers ----------
    ctx.save();
    ctx.font = 'bold 15px Palatino Linotype, serif';
    ctx.textAlign = 'center';
    for (const d of G.dmgNums) {
      const [sx, sy] = this.worldToScreen(d.x, d.y, d.z + 30);
      ctx.globalAlpha = Math.min(1, d.t * 2);
      if (d.crit) { ctx.font = 'bold 21px Palatino Linotype, serif'; }
      ctx.fillStyle = '#000'; ctx.fillText(d.txt, sx + 1.5, sy + 1.5);
      ctx.fillStyle = d.color; ctx.fillText(d.txt, sx, sy);
      if (d.crit) ctx.font = 'bold 15px Palatino Linotype, serif';
    }
    ctx.restore();

    // chat & emote bubbles
    this.drawBubbles(ctx, t);

    // hurt vignette
    if (pl.hurtT > 0) {
      pl.hurtT -= dt;
      const a = Math.min(0.45, pl.hurtT * 1.6);
      const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.75);
      vg.addColorStop(0, 'rgba(120,0,0,0)'); vg.addColorStop(1, `rgba(140,10,5,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
    }
    // low health pulse
    if (pl.hp < pl.derived.maxHp * 0.25 && !pl.dead) {
      const a = 0.12 + Math.sin(t * 6) * 0.08;
      const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.32, this.W / 2, this.H / 2, this.H * 0.8);
      vg.addColorStop(0, 'rgba(120,0,0,0)'); vg.addColorStop(1, `rgba(160,10,5,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
    }
  },

  // A door is drawn from its two jambs, both projected through the live
  // camera, so the frame stays glued to the passage at any orbit angle rather
  // than being a fixed screen-space rectangle.
  drawDoor(ctx, dr, t) {
    const half = 0.46;
    // jamb offsets run across the passage: 'v' passages are entered along y,
    // so their posts sit on the x axis, and vice versa
    const ox = dr.ori === 'v' ? half : 0, oy = dr.ori === 'v' ? 0 : half;
    const [ax, ay] = this.worldToScreen(dr.x - ox, dr.y - oy);
    const [bx, by] = this.worldToScreen(dr.x + ox, dr.y + oy);
    if (Math.max(ax, bx) < -80 || Math.min(ax, bx) > this.W + 80 ||
        Math.max(ay, by) < -140 || Math.min(ay, by) > this.H + 80) return;
    const z = Cam.zoom;
    const H = 34 * z;                       // jamb height in screen px
    const wood = '#4a3420', iron = '#5a5e66', stone = U.shade(THEMES[G.map.theme].wallTop, 0.9);

    ctx.save();
    // --- jambs: two stone posts ---
    ctx.strokeStyle = stone; ctx.lineWidth = 4.5 * z; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - H); ctx.stroke();
    // --- lintel across the top ---
    ctx.strokeStyle = U.shade(stone, 1.15); ctx.lineWidth = 4 * z;
    ctx.beginPath(); ctx.moveTo(ax, ay - H); ctx.lineTo(bx, by - H); ctx.stroke();
    // a keystone so the arch reads at a glance
    ctx.fillStyle = U.shade(stone, 1.3);
    ctx.beginPath();
    ctx.ellipse((ax + bx) / 2, (ay + by) / 2 - H - 1.5 * z, 3.4 * z, 2.6 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    if (dr.kind !== 'arch') {
      // --- the leaf, hinged on jamb A, swinging away as `open` rises ---
      const k = 1 - dr.open * 0.88;          // visible width of the leaf
      const lx = ax + (bx - ax) * k, ly = ay + (by - ay) * k;
      const lean = dr.swing * dr.open * 6 * z;   // slight skew as it swings
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(lx + lean, ly);
      ctx.lineTo(lx + lean, ly - H * 0.92);
      ctx.lineTo(ax, ay - H * 0.92);
      ctx.closePath();
      if (dr.kind === 'barred') {
        ctx.fillStyle = 'rgba(10,10,14,0.55)'; ctx.fill();
        ctx.strokeStyle = iron; ctx.lineWidth = 1.6 * z;
        // vertical bars spaced across whatever width is left
        const n = 4;
        for (let i = 1; i <= n; i++) {
          const f = i / (n + 1);
          const px = ax + (lx + lean - ax) * f, py = ay + (ly - ay) * f;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - H * 0.92); ctx.stroke();
        }
        ctx.strokeStyle = iron; ctx.lineWidth = 1.8 * z; ctx.stroke();
      } else {
        const g = ctx.createLinearGradient(ax, ay - H, lx, ly);
        g.addColorStop(0, U.shade(wood, 1.35)); g.addColorStop(1, U.shade(wood, 0.8));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = U.shade(wood, 0.6); ctx.lineWidth = 1.4 * z; ctx.stroke();
        // plank lines + an iron band
        ctx.strokeStyle = U.shade(wood, 0.62); ctx.lineWidth = 1 * z;
        for (const f of [0.33, 0.66]) {
          const px = ax + (lx + lean - ax) * f, py = ay + (ly - ay) * f;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - H * 0.92); ctx.stroke();
        }
        ctx.strokeStyle = iron; ctx.lineWidth = 1.6 * z;
        ctx.beginPath();
        ctx.moveTo(ax, ay - H * 0.62); ctx.lineTo(lx + lean, ly - H * 0.62);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  // Lights tagged with a vent tile only shine while that vent is firing;
  // everything else burns steadily and returns 1.
  ventScale(l, t) {
    if (l.vent === undefined) return 1;
    if (!ventJetting(l.vent, t)) return ventCharge(l.vent, t) * 0.25;
    return Math.sin(Math.min(1, ventPhase(l.vent, t) / VENT_JET) * Math.PI);
  },

  // A vent spends most of its cycle dormant. It telegraphs with a rising
  // shimmer and a widening ring, then fires a scalding column. Drawing both
  // phases off the same shared clock keeps what you see and what burns you
  // in agreement — the warning is honest.
  drawVent(ctx, tx, ty, sx, sy, t, kind) {
    const i = ty * G.map.w + tx;
    const jetting = ventJetting(i, t);
    const charge = ventCharge(i, t);
    const z = Cam.zoom;
    if (!jetting && charge <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (jetting) {
      const p = ventPhase(i, t) / VENT_JET;          // 0..1 through the jet
      const env = Math.sin(Math.min(1, p) * Math.PI); // fade in and out
      // Baked jet if we have one for this vent kind. Driven off the vent's own
      // phase rather than wall-clock, so the sprite plays in step with the
      // damage window instead of drifting out of sync with it.
      if (kind.sheet && Assets.hasSheet(kind.sheet)) {
        const sheet = Assets.tintedSheet(kind.sheet, kind.hot) || Assets.sheets[kind.sheet];
        const fr = Math.min(sheet.frames - 1, Math.floor(p * sheet.frames));
        ctx.globalAlpha = env;
        ctx.drawImage(sheet.img, fr * sheet.cell, 0, sheet.cell, sheet.cell,
                      sx - 34 * z, sy - 62 * z, 68 * z, 68 * z);
        ctx.restore();
        return;
      }
      const H = (46 + 26 * env) * z * (kind.mul / 1.8);
      const g = ctx.createLinearGradient(sx, sy, sx, sy - H);
      g.addColorStop(0, U.rgba(kind.hot, 0.62 * env));
      g.addColorStop(0.45, U.rgba(kind.color, 0.34 * env));
      g.addColorStop(1, U.rgba(kind.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 7 * z, sy + 2 * z);
      ctx.quadraticCurveTo(sx - 11 * z, sy - H * 0.6, sx - 3 * z, sy - H);
      ctx.lineTo(sx + 3 * z, sy - H);
      ctx.quadraticCurveTo(sx + 11 * z, sy - H * 0.6, sx + 7 * z, sy + 2 * z);
      ctx.closePath(); ctx.fill();
      // hot core
      ctx.fillStyle = U.rgba(kind.hot, 0.5 * env);
      ctx.beginPath(); ctx.ellipse(sx, sy - 6 * z, 4 * z, 9 * z * env, 0, 0, Math.PI * 2); ctx.fill();
      // ground flash
      ctx.fillStyle = U.rgba(kind.color, 0.3 * env);
      ctx.beginPath(); ctx.ellipse(sx, sy, 15 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // telegraph: a shimmer at the mouth and a ring that closes as it charges
      ctx.fillStyle = U.rgba(kind.color, 0.16 * charge);
      ctx.beginPath(); ctx.ellipse(sx, sy - 3 * z, 6 * z, 4 * z, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = U.rgba(kind.hot, 0.3 + 0.45 * charge);
      ctx.lineWidth = 1.4;
      const rr = 1 - charge * 0.55;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 15 * z * rr, 7 * z * rr, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  // ---------- atmosphere: fog, god rays, grading, ambient particles ----------
  fogMap: null, fogPuffs: [],

  // Fog is seeded across the whole visible frustum, not a fixed ring around the
  // hero — zooming out or widening the window must not leave bare corners.
  fogR: 0,
  updateFog(dt) {
    const map = G.map, th = THEMES[map.theme];
    if (!th.fog) { this.fogPuffs = []; this.fogMap = null; return; }
    const R = Cam.viewRadius(this.W, this.H) * 1.15;
    const want = U.clamp(Math.round(14 + R * 0.7), 24, 70);
    // re-seed on a map change or when the view grows/shrinks materially
    if (this.fogMap !== map || Math.abs(R - this.fogR) > R * 0.25 || this.fogPuffs.length !== want) {
      this.fogMap = map;
      this.fogR = R;
      const imgs = Sprites.getFog(map.theme);
      const keep = this.fogPuffs.slice(0, want);
      this.fogPuffs = keep;
      while (this.fogPuffs.length < want) {
        this.fogPuffs.push({
          x: Cam.fx + U.rf(U.rand, -R, R), y: Cam.fy + U.rf(U.rand, -R, R),
          vx: U.rf(U.rand, -0.16, 0.16), vy: U.rf(U.rand, -0.16, 0.16),
          s: U.rf(U.rand, 3.5, 8), a: U.rf(U.rand, 0.5, 1),
          ph: U.rand() * 7, img: U.pick(U.rand, imgs),
        });
      }
    }
    const recycle = this.fogR * 1.25;
    for (const p of this.fogPuffs) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      // drifted past the frustum: mirror it across the camera so cover never thins
      if (U.dist(p.x, p.y, Cam.fx, Cam.fy) > recycle) {
        p.x = Cam.fx - (p.x - Cam.fx) * 0.9; p.y = Cam.fy - (p.y - Cam.fy) * 0.9;
      }
    }
  },

  // Fog renders into a quarter-res buffer once per frame (mult === 1), then
  // both passes just blit it — huge fill-rate savings on soft alpha blends.
  drawFog(ctx, t, mult) {
    if (this.quality === 'low' || this.fx.fog === false) return;
    const th = THEMES[G.map.theme];
    if (!th.fog || !this.fogPuffs.length) return;
    if (mult === 1) {
      const fw = Math.ceil(this.W / 4), fh = Math.ceil(this.H / 4);
      if (!this.fogCv) this.fogCv = document.createElement('canvas');
      if (this.fogCv.width !== fw || this.fogCv.height !== fh) { this.fogCv.width = fw; this.fogCv.height = fh; }
      const fctx = this.fogCv.getContext('2d');
      fctx.clearRect(0, 0, fw, fh);
      const baseA = th.fog[1];
      for (const p of this.fogPuffs) {
        const [sx, sy] = this.worldToScreen(p.x, p.y);
        const w = p.s * Cam.ux * 2;
        if (sx < -w || sx > this.W + w || sy < -w / 2 || sy > this.H + w / 2) continue;
        fctx.globalAlpha = baseA * p.a * (0.75 + 0.25 * Math.sin(t * 0.4 + p.ph));
        fctx.drawImage(p.img, (sx - w / 2) / 4, (sy - w / 4) / 4, w / 4, w / 8);
      }
    }
    if (!this.fogCv) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, mult);
    ctx.drawImage(this.fogCv, 0, 0, this.W, this.H);
    ctx.restore();
  },

  drawShafts(ctx, t) {
    if (this.quality === 'low' || this.fx.shafts === false) return;
    const map = G.map, th = THEMES[map.theme];
    if (!map.shafts || !map.shafts.length || !th.shaft) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of map.shafts) {
      const [sx, sy] = this.worldToScreen(s.x, s.y);
      if (sx < -240 || sx > this.W + 240 || sy < -60 || sy > this.H + 380) continue;
      const pulse = 0.72 + 0.28 * Math.sin(t * 0.6 + s.phase);
      const topX = sx + 74, topY = sy - 370;
      const wTop = 24 * s.w, wBot = 58 * s.w;
      const g = ctx.createLinearGradient(topX, topY, sx, sy);
      g.addColorStop(0, U.rgba(th.shaft, 0));
      g.addColorStop(0.3, U.rgba(th.shaft, 0.1 * pulse));
      g.addColorStop(1, U.rgba(th.shaft, 0.02));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(topX - wTop, topY); ctx.lineTo(topX + wTop, topY);
      ctx.lineTo(sx + wBot, sy); ctx.lineTo(sx - wBot, sy);
      ctx.closePath(); ctx.fill();
      // pool of light where the ray lands
      const pg = ctx.createRadialGradient(sx, sy, 1, sx, sy, wBot);
      pg.addColorStop(0, U.rgba(th.shaft, 0.12 * pulse)); pg.addColorStop(1, U.rgba(th.shaft, 0));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.ellipse(sx, sy, wBot, wBot * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      // motes swimming in the beam
      if (U.rand() < 0.1)
        FX.push({ x: s.x + U.rf(U.rand, -0.8, 0.8), y: s.y + U.rf(U.rand, -0.8, 0.8), z: U.rf(U.rand, 10, 90), vx: 0.1, vy: 0.1, vz: -3, life: 3, maxLife: 3, color: th.shaft, size: 1, add: true, grav: 0 });
    }
    ctx.restore();
  },

  // Color grade + vignette baked per (theme, viewport) — one blit per frame.
  gradeKey: '',
  drawGrade(ctx) {
    if (this.fx.grade === false) return;
    const th = THEMES[G.map.theme];
    if (!th.grade) { ctx.drawImage(this.vinCv, 0, 0, this.W, this.H); return; }
    const key = G.map.theme + '_' + this.W + 'x' + this.H;
    if (this.gradeKey !== key) {
      this.gradeKey = key;
      const gw = Math.ceil(this.W / 4), gh = Math.ceil(this.H / 4);
      this.gradeCv = document.createElement('canvas');
      this.gradeCv.width = gw; this.gradeCv.height = gh;
      const g = this.gradeCv.getContext('2d');
      const [top, bot, a] = th.grade;
      const g1 = g.createLinearGradient(0, 0, 0, gh * 0.55);
      g1.addColorStop(0, U.rgba(top, a)); g1.addColorStop(1, U.rgba(top, 0));
      g.fillStyle = g1; g.fillRect(0, 0, gw, gh * 0.55);
      const g2 = g.createLinearGradient(0, gh * 0.45, 0, gh);
      g2.addColorStop(0, U.rgba(bot, 0)); g2.addColorStop(1, U.rgba(bot, a * 0.9));
      g.fillStyle = g2; g.fillRect(0, gh * 0.45, gw, gh - gh * 0.45);
      g.drawImage(this.vinCv, 0, 0, gw, gh); // vignette baked in: one blit, not two
    }
    ctx.drawImage(this.gradeCv, 0, 0, this.W, this.H);
  },

  updateAmbient(dt) {
    const map = G.map, pl = G.player, th = THEMES[map.theme];
    if (!th.amb) return;
    let rate = { dust: 9, ember: 6, spore: 8, ash: 12, firefly: 2.5 }[th.amb] || 6;
    if (this.quality === 'low') rate *= 0.35;
    // spawn across the whole frustum, scaling the rate with its width so the
    // apparent density stays put as the camera zooms
    const R = Math.max(12, Cam.viewRadius(this.W, this.H) * 0.95);
    // A wider frustum sweeps in proportionally more wall tiles, which are
    // rejected below, so the headroom here has to sit above the pure area
    // ratio or the field visibly thins out at low zoom.
    rate *= U.clamp(R / 12, 1, 4.2);
    if (U.rand() >= dt * rate) return;
    // Clamp the spawn box to the map before sampling. A wide frustum can be
    // larger than the level itself, and sampling the raw box would throw most
    // spawns away out of bounds — thinning the field exactly when the camera
    // pulls back and shows the most of it.
    const bx0 = Math.max(0, Cam.fx - R), bx1 = Math.min(map.w - 0.01, Cam.fx + R);
    const by0 = Math.max(0, Cam.fy - R), by1 = Math.min(map.h - 0.01, Cam.fy + R);
    if (bx1 <= bx0 || by1 <= by0) return;
    const x = U.rf(U.rand, bx0, bx1), y = U.rf(U.rand, by0, by1);
    const tx = Math.floor(x), ty = Math.floor(y);
    if (map.t[ty * map.w + tx] === TILE.WALL && th.amb !== 'ash') return;
    switch (th.amb) {
      case 'dust':
        FX.push({ x, y, z: U.rf(U.rand, 6, 44), vx: U.rf(U.rand, -0.25, 0.25), vy: U.rf(U.rand, -0.25, 0.25), vz: U.rf(U.rand, -2, 2), life: 4, maxLife: 4, color: '#b8b4a8', size: U.rf(U.rand, 0.7, 1.4), add: true, grav: 0, shape: 'dot' });
        break;
      case 'ember':
        FX.push({ x, y, z: U.rf(U.rand, 0, 12), vx: U.rf(U.rand, -0.3, 0.3), vy: U.rf(U.rand, -0.3, 0.3), vz: U.rf(U.rand, 5, 13), life: 2.4, maxLife: 2.4, color: U.rand() < 0.5 ? '#ff8a2f' : '#ffc94f', size: U.rf(U.rand, 0.9, 1.8), add: true, grav: -7, shape: 'ember' });
        break;
      case 'spore':
        FX.push({ x, y, z: U.rf(U.rand, 4, 32), vx: U.rf(U.rand, -0.2, 0.2), vy: U.rf(U.rand, -0.2, 0.2), vz: U.rf(U.rand, -1.5, 3), life: 3.6, maxLife: 3.6, color: U.rand() < 0.7 ? '#8ae8a0' : '#c8ffd8', size: U.rf(U.rand, 0.8, 1.7), add: true, grav: 0, shape: 'dot' });
        break;
      case 'ash':
        FX.push({ x, y, z: U.rf(U.rand, 55, 80), vx: U.rf(U.rand, -0.4, 0.1), vy: U.rf(U.rand, -0.1, 0.4), vz: U.rf(U.rand, -11, -7), life: 6, maxLife: 6, color: U.rand() < 0.75 ? '#9a8880' : '#e06840', size: U.rf(U.rand, 0.8, 1.6), add: false, grav: 0, shape: 'shard', rot: U.rand() * 6.28, spin: 1.6 });
        break;
      case 'firefly':
        FX.push({ x, y, z: U.rf(U.rand, 8, 26), vx: U.rf(U.rand, -0.5, 0.5), vy: U.rf(U.rand, -0.5, 0.5), vz: U.rf(U.rand, -2, 2), life: 5, maxLife: 5, color: '#d8f06a', size: 1.4, add: true, grav: 0 });
        break;
    }
  },

  // ---------- lights ----------
  // Punch-out and glow discs are pre-baked sprites (gradient objects are
  // expensive to build 50+ times a frame), drawn scaled with globalAlpha.
  punchCv: null,
  getPunch() {
    if (this.punchCv) return this.punchCv;
    const S = 128, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    this.punchCv = cv;
    return cv;
  },
  glowCvs: new Map(),
  getGlow(color) {
    let cv = this.glowCvs.get(color);
    if (cv) return cv;
    const S = 96;
    cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, U.rgba(color, 1)); g.addColorStop(1, U.rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    this.glowCvs.set(color, cv);
    return cv;
  },

  drawLighting(t) {
    const map = G.map, pl = G.player;
    const th = THEMES[map.theme];
    const lctx = this.lctx, lw = this.lightCv.width, lh = this.lightCv.height;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle = `rgba(2,2,6,${this.ambientFor(th)})`;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'destination-out';

    const punchImg = this.getPunch();
    const punch = (wx, wy, r, intensity) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const px = sx / 2, py = sy / 2, pr = r * Cam.ux / 2;
      if (px < -pr || px > lw + pr || py < -pr || py > lh + pr) return;
      lctx.globalAlpha = intensity;
      lctx.drawImage(punchImg, px - pr, py - pr, pr * 2, pr * 2);
    };

    const spooky = this.mood === 'spooky';
    // the hero's own light: a full lantern in classic, a faint personal glow in
    // spooky (gear that grants +light radius still widens it)
    const heroR = pl.derived.lightRad * (spooky ? this.heroLightMul : 1);
    if (heroR > 0.2) {
      punch(pl.x, pl.y, heroR, spooky ? 0.85 : 1);
      if (!spooky) punch(pl.x, pl.y, heroR * 2.1, 0.32); // soft fill so midtones survive
    }
    // props carry the scene, so give their pools a little more reach in spooky
    const propR = spooky ? 1.18 : 1;
    for (const l of map.lights) {
      const fl = l.flick ? 0.85 + Math.sin(t * 11 + l.x * 7 + l.y * 13) * 0.15 : 1;
      const vs = this.ventScale(l, t);
      if (vs > 0) punch(l.x, l.y, l.r * fl * propR * vs, 0.95);
    }
    for (const p of G.projs) punch(p.x, p.y, 2.2, 0.8);
    for (const f of G.flashes) punch(f.x, f.y, f.r * 2, f.t / f.maxT);
    const ppL = G.portalOnMap(map);
    if (ppL) punch(ppL.x, ppL.y, 4, 1);
    lctx.globalAlpha = 1;

    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCv, 0, 0, this.W, this.H);
    ctx.restore();

    // warm color glow pass (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (wx, wy, r, color, a) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const pr = r * Cam.ux;
      if (sx < -pr || sx > this.W + pr || sy < -pr || sy > this.H + pr) return;
      ctx.globalAlpha = a;
      ctx.drawImage(this.getGlow(color), sx - pr, sy - pr, pr * 2, pr * 2);
    };
    for (const l of map.lights) {
      const fl = l.flick ? 0.8 + Math.sin(t * 11 + l.x * 7 + l.y * 13) * 0.2 : 1;
      const vs = this.ventScale(l, t);
      if (vs > 0) glow(l.x, l.y, l.r * 0.8 * fl * vs, l.color, (this.mood === 'spooky' ? 0.15 : 0.10) * vs);
    }
    for (const p of G.projs) glow(p.x, p.y, 1.6, ELEM[p.elem].color, 0.16);
    for (const f of G.flashes) glow(f.x, f.y, f.r, f.color, 0.25 * f.t / f.maxT);
    ctx.restore();
  },

  // ---------- walls ----------
  // Classic view blits the pre-baked block. Any rotation or pitch change
  // switches to a true extrusion: ground corners projected, lifted by the
  // wall height, with only the two camera-facing side quads drawn.
  _wc: [0, 0, 0, 0, 0, 0, 0, 0],   // scratch corner buffer (no per-wall allocation)
  drawWall(ctx, tx, ty, tiles) {
    const c = Cam.cos, sn = Cam.sin, ux = Cam.ux, uy = Cam.uy;
    const ox = this.W / 2 + Cam.shx, oy = this.H / 2 + Cam.shy;
    const fx = Cam.fx, fy = Cam.fy;
    // centre first, for culling
    let dx = tx + 0.5 - fx, dy = ty + 0.5 - fy;
    let rx = dx * c - dy * sn, ry = dx * sn + dy * c;
    const sx = (rx - ry) * ux + ox, sy = (rx + ry) * uy + oy;
    if (sx < -140 || sx > this.W + 140 || sy < -180 || sy > this.H + 190) return;
    const wallH = tiles.wallH * Cam.zoom;

    // walls standing between the camera and the hero fade out so a low
    // third-person angle never boxes the player in
    let faded = false;
    if (this._occl) {
      const d = Cam.depth(tx + 0.5, ty + 0.5);
      if (d > this._plDepth + 0.6 && U.dist(tx + 0.5, ty + 0.5, G.player.x, G.player.y) < 7.5) {
        ctx.save();
        ctx.globalAlpha = 0.26;
        faded = true;
      }
    }
    if (!Cam.rotated && Math.abs(Cam.pitch - 0.5) < 0.004) {
      ctx.drawImage(tiles.wall, sx - ux, sy - uy - wallH, ux * 2, uy * 2 + wallH);
      if (faded) ctx.restore();
      return;
    }

    const W8 = this._wc;
    for (let k = 0; k < 4; k++) {
      const wx = tx + (k === 1 || k === 2 ? 1 : 0), wy = ty + (k >= 2 ? 1 : 0);
      dx = wx - fx; dy = wy - fy;
      rx = dx * c - dy * sn; ry = dx * sn + dy * c;
      W8[k * 2] = (rx - ry) * ux + ox;
      W8[k * 2 + 1] = (rx + ry) * uy + oy;
    }
    // the two edges sitting lowest on screen are the camera-facing faces
    let e0 = 0, e1 = 0, m0 = -1e9, m1 = -1e9;
    for (let k = 0; k < 4; k++) {
      const a = k, b = (k + 1) % 4;
      const mid = (W8[a * 2 + 1] + W8[b * 2 + 1]) * 0.5;
      if (mid > m0) { m1 = m0; e1 = e0; m0 = mid; e0 = k; }
      else if (mid > m1) { m1 = mid; e1 = k; }
    }
    const fw = tiles.faceW, fh = tiles.faceH;
    const lowQ = this.quality === 'low';
    for (const k of (lowQ ? [e0] : [e1, e0])) {
      let ax = W8[k * 2], ay = W8[k * 2 + 1];
      const nb = (k + 1) % 4;
      let bx = W8[nb * 2], by = W8[nb * 2 + 1];
      if (bx < ax) { const t1 = ax, t2 = ay; ax = bx; ay = by; bx = t1; by = t2; }
      const face = (by > ay) ? tiles.faceR : tiles.faceL;
      ctx.save();
      ctx.transform((bx - ax) / fw, (by - ay) / fw, 0, wallH / fh, ax, ay - wallH);
      ctx.drawImage(face, 0, 0, fw, fh);
      ctx.restore();
    }
    // top slab: textured normally, flat-filled when quality has been shed
    if (lowQ) {
      ctx.fillStyle = tiles.topFlat;
      ctx.beginPath();
      ctx.moveTo(W8[0], W8[1] - wallH);
      for (let k = 1; k < 4; k++) ctx.lineTo(W8[k * 2], W8[k * 2 + 1] - wallH);
      ctx.closePath(); ctx.fill();
    } else {
      const m = Cam.tileMatrix();
      ctx.save();
      ctx.setTransform(m[0] * this.dpr, m[1] * this.dpr, m[2] * this.dpr, m[3] * this.dpr,
        sx * this.dpr, (sy - wallH) * this.dpr);
      ctx.drawImage(tiles.wallTop, -ISO_X, -ISO_Y, ISO_X * 2, ISO_Y * 2);
      ctx.restore();
    }
    if (faded) ctx.restore();
  },

  // ---------- actors ----------
  // Sprite facings are chosen in screen space, so yaw folds into the angle.
  dirIndex(ang) { return ((Math.round((ang + Cam.yaw) / (Math.PI / 4)) % 8) + 8) % 8; },

  // Nearest light source (torches beat the player's own aura) — shadows
  // stretch away from it and sharpen as the caster nears the flame.
  nearestLight(x, y) {
    const map = G.map;
    let best = null, bd = 49; // within 7 tiles
    if (map && map.lights) {
      for (const l of map.lights) {
        const d = U.dist2(x, y, l.x, l.y);
        if (d < bd && d > 0.04) { bd = d; best = l; }
      }
    }
    const pl = G.player;
    if (!best && pl && (pl.x !== x || pl.y !== y)) {
      const d = U.dist2(x, y, pl.x, pl.y);
      if (d < 36 && d > 0.04) { best = { x: pl.x, y: pl.y }; bd = d; }
    }
    return best ? { l: best, d: Math.sqrt(bd) } : null;
  },

  drawShadow(ctx, x, y, size) {
    const [sx, sy] = this.worldToScreen(x, y);
    ctx.save();
    const src = this.quality === 'high' ? this.nearestLight(x, y) : null;
    if (src) {
      // directional: elongated away from the light, in screen space
      const wx = x - src.l.x, wy = y - src.l.y;
      const vx = (wx - wy) * Cam.ux, vy = (wx + wy) * Cam.uy; // world dir -> screen dir
      const ang = Math.atan2(vy, vx);
      const near = 1 - Math.min(1, src.d / 7);
      const len = 11 * size * (1.15 + near * 1.4);
      const alpha = 0.28 + near * 0.22;
      ctx.translate(sx, sy + 2);
      ctx.rotate(ang);
      const g = ctx.createRadialGradient(len * 0.32, 0, 1, len * 0.32, 0, len);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(len * 0.35, 0, len, 5 * size, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 2, 11 * size, 5 * size, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // Mirror an actor's sprite into standing water beneath it.
  drawReflection(ctx, sheet, frame, dir, sx, sy, C, scale) {
    if (this.fx.reflections === false) return;
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.translate(sx, sy + 3);
    ctx.scale(1 + Math.sin(G.time * 3 + sx * 0.05) * 0.03, -0.72); // shimmer + squash
    ctx.drawImage(sheet.canvas, frame * C, dir * C, C, C, -C / 2 * scale, -C * 0.78 * scale, C * scale, C * scale);
    ctx.restore();
  },

  onWater(x, y) {
    const map = G.map;
    if (!map) return false;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
    return map.haz[ty * map.w + tx] === HAZ.WATER;
  },

  drawActor(ctx, m, t) {
    const [sx, sy] = this.worldToScreen(m.x, m.y);
    if (sx < -80 || sx > this.W + 80 || sy < -100 || sy > this.H + 100) return;
    const sheet = Sprites.getActor(m.boss ? m.bossKey : m.fam === 'trap' ? null : m.fam);
    const wet = !m.fly && this.onWater(m.x, m.y);
    if (!m.fly && !wet) this.drawShadow(ctx, m.x, m.y, m.size * 0.9);

    // trap: draw device instead of actor
    if (m.trap) {
      ctx.save();
      ctx.translate(sx, sy);
      const col = ELEM[m.trap.def.elem].color;
      ctx.fillStyle = '#3a3228';
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8 + Math.sin(t * 8) * 4;
      ctx.beginPath(); ctx.arc(0, -7, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    const dir = this.dirIndex(m.dir);
    let frame;
    if (m.dead) frame = 0;
    else if (m.attackT > 0) frame = 6 + Math.min(3, Math.floor((1 - m.attackT / 0.4) * 4));
    else frame = Math.floor(m.anim) % 6;
    const C = sheet.cell;
    const scale = m.size * Cam.zoom;
    const bob = m.fly ? Math.sin(t * 4 + m.x) * 4 : 0;
    if (wet && !m.dead) this.drawReflection(ctx, sheet, frame, dir, sx, sy, C, scale);

    ctx.save();
    ctx.translate(sx, sy + bob);
    if (m.dead) {
      ctx.globalAlpha = Math.max(0, m.deathT / 0.9);
      if (m.rag) { ctx.translate(0, -m.rag.z * Cam.zoom); ctx.rotate(m.rag.ang * m.rag.fall); }
      else { ctx.translate(0, (0.9 - m.deathT) * 8); ctx.rotate((0.9 - m.deathT) * 0.9); }
    }
    if (m.hitT > 0) ctx.filter = 'brightness(2.2)';
    // rank underglow
    if (m.rank !== 'normal' && !m.dead) {
      const rc = m.rank === 'boss' ? '#ff6a2f' : m.rank === 'elite' ? '#ffd94f' : '#7b9bff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = U.rgba(rc, 0.22 + Math.sin(t * 5) * 0.08);
      ctx.beginPath(); ctx.ellipse(0, 2 - bob, 15 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(sheet.canvas, frame * C, dir * C, C, C, -C / 2 * scale, -C * 0.78 * scale, C * scale, C * scale);
    ctx.restore();

    // nameplate: health bar, status effect icons, name
    const plates = this.fx.nameplates;
    const plateY = sy - 48 * m.size - 6;
    if (!m.dead && !m.ally && (m.hp < m.maxHp || plates)) {
      const w = 30 * Math.min(2, m.size);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(sx - w / 2, plateY, w, 4);
      ctx.fillStyle = m.rank === 'elite' ? '#ffd94f' : m.rank === 'champion' ? '#7b9bff' : '#c0392b';
      ctx.fillRect(sx - w / 2, plateY, w * Math.max(0, m.hp / m.maxHp), 4);
      ctx.restore();
    }
    if (!m.dead && !m.ally) {
      // status icons row above the bar
      const sts = [];
      if (m.stunT > 0) sts.push('#ffd94f');
      if (m.debuffT > 0) {
        if (m.debuffs.slow) sts.push('#7bdcff');
        if (m.debuffs.dot) sts.push(ELEM[m.debuffs.dotElem || 'pois'].color);
        if (m.debuffs.dmgTaken) sts.push('#c07bff');
        if (m.debuffs.weaken) sts.push('#9a9a9a');
      }
      if (sts.length) {
        ctx.save();
        const iw = 7, gap = 2, total = sts.length * iw + (sts.length - 1) * gap;
        let ix = sx - total / 2;
        for (const col of sts) {
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(ix - 1, plateY - 12, iw + 2, iw + 2);
          ctx.fillStyle = col;
          ctx.fillRect(ix, plateY - 11, iw, iw);
          ix += iw + gap;
        }
        ctx.restore();
      }
    }
    if (!m.dead && (m.rank === 'elite' || (plates && !m.ally))) {
      ctx.save();
      ctx.font = '11px Palatino Linotype, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = m.rank === 'elite' ? '#ffd94f' : m.rank === 'champion' ? '#a8bcff' : '#d8cdb0';
      ctx.fillText(m.name, sx, plateY - (m.stunT > 0 || m.debuffT > 0 ? 16 : 5));
      ctx.restore();
    }
  },

  // The hero is drawn live (not from a baked sheet) so equipped gear shows.
  playerAnim(pl, t) {
    if (pl.dead) return { anim: 'dead', phase: U.clamp(1 - (pl.deathT === undefined ? 0 : pl.deathT), 0, 1) };
    if (pl.danceT > 0) return { anim: 'dance', phase: (t * 1.6) % 1 };
    if (pl.attackT > 0) {
      const sk = pl.hotbar && SKILL_BY_ID[pl.hotbar.rmb];
      const casting = pl.lastCastArch && !['strike', 'slam', 'dash'].includes(pl.lastCastArch);
      return { anim: casting ? 'cast' : 'attack', phase: U.clamp(1 - pl.attackT / 0.32, 0, 1) };
    }
    if (pl.hurtT > 0.14) return { anim: 'hurt', phase: 0 };
    if (pl.moving) {
      const fast = pl.derived && pl.derived.moveSpd > 4.6;
      return { anim: fast ? 'run' : 'walk', phase: (pl.gait || 0) % 1 };
    }
    return { anim: 'idle', phase: (t * 0.42) % 1 };
  },

  drawFigureActor(ctx, sx, sy, dirIdx, st, pal, eq, scale, build) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    Figure.draw(ctx, { pose: Figure.pose(st), pal, eq, dir: dirIdx, build: build || 'normal' });
    ctx.restore();
  },

  drawPlayer(ctx, pl, t) {
    const wet = this.onWater(pl.x, pl.y);
    if (!wet) this.drawShadow(ctx, pl.x, pl.y, 1);
    const [sx, sy] = this.worldToScreen(pl.x, pl.y);
    const dir = this.dirIndex(pl.dir);
    const cls = CLASSES.find(c => c.id === pl.cls) || { pal: {} };
    const st = this.playerAnim(pl, t);
    const eq = Figure.equipOf(pl);
    const scale = Cam.zoom;
    // reflection in standing water
    if (wet && this.fx.reflections !== false) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.translate(sx, sy + 3);
      ctx.scale(scale * (1 + Math.sin(t * 3 + sx * 0.05) * 0.03), -0.72 * scale);
      Figure.draw(ctx, { pose: Figure.pose(st), pal: cls.pal, eq, dir, build: 'normal' });
      ctx.restore();
    }
    // buff aura
    if (pl.buffs.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = U.rgba(pl.buffs[0].color || '#ffd94f', 0.12 + Math.sin(t * 6) * 0.05);
      ctx.beginPath(); ctx.ellipse(sx, sy + 2, 16 * scale, 8 * scale * (Cam.pitch / 0.5), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (pl.hurtT > 0) { ctx.save(); ctx.filter = 'brightness(1.9)'; }
    this.drawFigureActor(ctx, sx, sy, dir, st, cls.pal, eq, scale, 'normal');
    if (pl.hurtT > 0) ctx.restore();
  },

  // simulated players in town: class sprite + player-style nameplate
  drawSim(ctx, sp, t) {
    const [sx, sy] = this.worldToScreen(sp.x, sp.y);
    if (sx < -80 || sx > this.W + 80 || sy < -100 || sy > this.H + 100) return;
    const sheet = Sprites.getActor(sp.cls);
    this.drawShadow(ctx, sp.x, sp.y, 1);
    const dir = this.dirIndex(sp.dir);
    const frame = sp.moving ? Math.floor(t * 11) % 6 : sp.danceT > 0 ? Math.floor(t * 9) % 6 : 0;
    const C = sheet.cell, z = Cam.zoom;
    ctx.drawImage(sheet.canvas, frame * C, dir * C, C, C, sx - C / 2 * z, sy - C * 0.78 * z, C * z, C * z);
    const role = Social.ROLES[sp.role || 'none'];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = sp.role === 'gm' ? 'bold 12px Palatino Linotype, serif' : '12px Palatino Linotype, serif';
    const nm = (sp.role === 'gm' ? '★ ' : '') + sp.name;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(nm, sx + 1, sy - 51);
    ctx.fillStyle = role.c;
    ctx.fillText(nm, sx, sy - 52);
    ctx.font = '10px Palatino Linotype, serif';
    ctx.fillStyle = '#9a8a62';
    ctx.fillText((sp.guild ? '⟨' + sp.guild.tag + '⟩ ' : '') + 'Lv ' + sp.lvl, sx, sy - 40);
    ctx.restore();
  },

  // chat / emote bubbles over the player and simulated players
  drawBubbles(ctx, t) {
    if (this.fx.bubbles === false) return;
    const draw = ent => {
      const b = ent.bubble;
      if (!b) return;
      const [sx, sy] = this.worldToScreen(ent.x, ent.y);
      if (sx < -220 || sx > this.W + 220 || sy < -120 || sy > this.H + 220) return;
      ctx.save();
      ctx.font = b.kind === 'emote' ? 'italic 11.5px Palatino Linotype, serif' : '11.5px Palatino Linotype, serif';
      const words = String(b.text).split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > 150 && cur) { lines.push(cur); cur = w; } else cur = test;
      }
      if (cur) lines.push(cur);
      if (lines.length > 3) { lines.length = 3; lines[2] += '…'; }
      let wMax = 0;
      for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);
      const bw = wMax + 16, bh = lines.length * 14 + 9;
      const bx = sx - bw / 2, by = sy - 80 - bh;
      ctx.globalAlpha = Math.min(1, b.t / 0.4);
      ctx.fillStyle = b.kind === 'emote' ? 'rgba(28,15,2,0.85)' : 'rgba(10,8,4,0.88)';
      ctx.strokeStyle = b.kind === 'emote' ? '#8a5a24' : '#4a3a1c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5); else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 4, by + bh); ctx.lineTo(sx + 4, by + bh); ctx.lineTo(sx, by + bh + 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.kind === 'emote' ? '#ffb066' : '#e8dcc0';
      ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, sx, by + 16 + i * 14));
      ctx.restore();
    };
    const pl = G.player;
    if (pl && !pl.dead) draw(pl);
    if (typeof Social !== 'undefined' && G.map && G.map.town)
      for (const sp of Social.townSims) draw(sp);
  },

  drawNpc(ctx, n, t) {
    const sheet = Sprites.getActor(n.id);
    this.drawShadow(ctx, n.x, n.y, 1);
    const [sx, sy] = this.worldToScreen(n.x, n.y);
    const C = sheet.cell;
    const frame = Math.floor(t * 2 + n.x) % 6;
    const z = Cam.zoom;
    ctx.drawImage(sheet.canvas, frame * C, 6 * C, C, C, sx - C / 2 * z, sy - C * 0.78 * z, C * z, C * z);
    ctx.save();
    ctx.font = '12px Palatino Linotype, serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(n.def.name, sx, sy - 52);
    ctx.fillStyle = '#8a7444';
    ctx.font = '10px Palatino Linotype, serif';
    ctx.fillText('« ' + n.def.role + ' »', sx, sy - 40);
    ctx.restore();
  },

  drawProj(ctx, p, t) {
    const [sx, sy] = this.worldToScreen(p.x, p.y, 14);
    const col = ELEM[p.elem].color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (p.kind === 'arrow') {
      const a = Math.atan2(p.vy * 0.5, p.vx);
      ctx.translate(sx, sy); ctx.rotate(a);
      ctx.strokeStyle = '#d8cba8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -2.5); ctx.lineTo(4, 2.5); ctx.closePath(); ctx.fill();
    } else {
      const r = p.kind === 'orb' ? 7 : 5;
      const g = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawProp(ctx, pr, t) {
    if (pr.smashable && pr.hp !== undefined && pr.hp <= 0) return;
    const [sx, sy] = this.worldToScreen(pr.x, pr.y, pr.z || 0);
    if (sx < -80 || sx > this.W + 80 || sy < -120 || sy > this.H + 80) return;
    const rng = makeRng(pr.seed);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(Cam.zoom, Cam.zoom);
    if (pr.ang) ctx.rotate(pr.ang);
    // Registered art wins over the vector code. Assets.draw returns false when
    // the slot is empty, which is the normal case today — so this costs one
    // property lookup and changes nothing until art actually lands.
    if (Assets.draw(ctx, pr.kind, Cam.zoom)) { ctx.restore(); return; }
    switch (pr.kind) {
      case 'crate': {
        const g = ctx.createLinearGradient(-9, -18, 9, 0);
        g.addColorStop(0, '#8a6a3e'); g.addColorStop(1, '#5a4224');
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = g; ctx.fillRect(-9, -17, 18, 17);
        ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 1.4;
        ctx.strokeRect(-9, -17, 18, 17);
        ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(9, 0); ctx.moveTo(9, -17); ctx.lineTo(-9, 0); ctx.stroke();
        ctx.fillStyle = '#a8895a'; ctx.fillRect(-9, -19, 18, 2.6);
        break;
      }
      case 'pot': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-7, -12, 7, 0);
        g.addColorStop(0, '#a07a52'); g.addColorStop(1, '#6a4a2c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -7, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#54381f'; ctx.fillRect(-4, -16, 8, 3);
        ctx.strokeStyle = 'rgba(40,26,12,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, -9, 6, 2.4, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'sack': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 3.6, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-7, -14, 7, 0);
        g.addColorStop(0, '#b8a476'); g.addColorStop(1, '#7a6a48');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-8, -12, -2.5, -14);
        ctx.lineTo(2.5, -14); ctx.quadraticCurveTo(8, -12, 7, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5a4c30'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(3, -14); ctx.stroke();
        break;
      }
      case 'table': {
        ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0, 2, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 2.2;
        for (const lx of [-11, 11]) { ctx.beginPath(); ctx.moveTo(lx, -2); ctx.lineTo(lx, -12); ctx.stroke(); }
        const g = ctx.createLinearGradient(0, -18, 0, -12);
        g.addColorStop(0, '#8a6a44'); g.addColorStop(1, '#5c4228');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -14, 15, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3420'; ctx.fillRect(-15, -14, 30, 2.4);
        break;
      }
      case 'chair': {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5a4228'; ctx.lineWidth = 1.8;
        for (const lx of [-5, 5]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, -8); ctx.stroke(); }
        ctx.fillStyle = '#75542f'; ctx.fillRect(-6.5, -10, 13, 2.4);
        ctx.fillStyle = '#63482a'; ctx.fillRect(-6.5, -22, 2.6, 12);
        ctx.fillRect(3.9, -22, 2.6, 12);
        ctx.fillRect(-6.5, -21, 13, 2);
        break;
      }
      case 'sarcophagus': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 3, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-16, -14, 16, 0);
        g.addColorStop(0, '#8a8a94'); g.addColorStop(1, '#4c4c56');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(-13, -12); ctx.lineTo(13, -12); ctx.lineTo(15, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6a6a76';
        ctx.beginPath(); ctx.ellipse(0, -12, 14, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3c3c46';
        ctx.beginPath(); ctx.ellipse(0, -13.5, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();  // carved face
        ctx.strokeStyle = 'rgba(30,30,38,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-13, -6); ctx.lineTo(13, -6); ctx.stroke();
        break;
      }
      case 'bookshelf': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3420'; ctx.fillRect(-12, -38, 24, 38);
        ctx.fillStyle = '#2c1e10';
        for (let r = 0; r < 3; r++) ctx.fillRect(-10.5, -35 + r * 12, 21, 10);
        const brng = makeRng(pr.seed + 5);
        for (let r = 0; r < 3; r++) {
          let bx = -10;
          while (bx < 9) {
            const bw2 = 1.6 + brng() * 2.2, bh2 = 6 + brng() * 3.5;
            ctx.fillStyle = U.shade(['#7a2020', '#20487a', '#2a6a3a', '#6a5a20'][Math.floor(brng() * 4)], 0.85 + brng() * 0.4);
            ctx.fillRect(bx, -26 + r * 12 - bh2, bw2, bh2);
            bx += bw2 + 0.5;
          }
        }
        if (pr.searched) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-12, -38, 24, 38); }
        break;
      }
      case 'weaponrack': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#5a4228'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-10, -26); ctx.moveTo(10, 0); ctx.lineTo(10, -26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-11, -24); ctx.lineTo(11, -24); ctx.stroke();
        const wrng = makeRng(pr.seed + 9);
        for (let i = -1; i <= 1; i++) {
          ctx.strokeStyle = '#c0c4cc'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(i * 6.5, -24); ctx.lineTo(i * 6.5 + (wrng() - 0.5) * 3, -4); ctx.stroke();
          ctx.strokeStyle = '#8a6b31'; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(i * 6.5 - 2, -22); ctx.lineTo(i * 6.5 + 2, -22); ctx.stroke();
        }
        break;
      }
      case 'anvil': {
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3420'; ctx.fillRect(-7, -6, 14, 6);
        const g = ctx.createLinearGradient(-10, -16, 10, -6);
        g.addColorStop(0, '#6a6e76'); g.addColorStop(1, '#33363c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-9, -16); ctx.lineTo(12, -15); ctx.lineTo(8, -12); ctx.lineTo(4, -12);
        ctx.lineTo(3, -8); ctx.lineTo(-4, -8); ctx.lineTo(-5, -12); ctx.lineTo(-9, -12);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'cauldron': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a3630'; ctx.lineWidth = 2;
        for (const lx of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx * 0.6, -6); ctx.stroke(); }
        const g = ctx.createLinearGradient(-10, -18, 10, -6);
        g.addColorStop(0, '#4c4640'); g.addColorStop(1, '#22201c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -12, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5aa03a';
        ctx.beginPath(); ctx.ellipse(0, -18, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba('#8ef04a', 0.25 + Math.sin(t * 2 + pr.seed) * 0.1);
        ctx.beginPath(); ctx.ellipse(0, -19, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (U.rand() < 0.02) FX.gasPuff(pr.x, pr.y);
        break;
      }
      case 'chandelier': {
        const swing = Math.sin(t * 0.7 + pr.seed) * 2;
        ctx.strokeStyle = '#3a3630'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -78); ctx.lineTo(swing, -52); ctx.stroke();
        ctx.strokeStyle = '#5a5248'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(swing, -50, 13, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const cx2 = swing + Math.cos(a) * 13, cy2 = -50 + Math.sin(a) * 4.6;
          ctx.fillStyle = '#d8ceb8'; ctx.fillRect(cx2 - 1.2, cy2 - 6, 2.4, 6);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const fl = 0.8 + Math.sin(t * 12 + i * 2 + pr.seed) * 0.2;
          ctx.fillStyle = U.rgba('#ffd98f', 0.85);
          ctx.beginPath(); ctx.ellipse(cx2, cy2 - 8.5 * fl, 1.3, 3 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'lantern': {
        ctx.strokeStyle = '#3a3026'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(6, -22); ctx.stroke();
        const fl = 0.85 + Math.sin(t * 8 + pr.seed) * 0.15;
        ctx.fillStyle = 'rgba(30,24,16,0.9)';
        ctx.fillRect(3, -20, 6, 8);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba('#ffcf8f', 0.75 * fl);
        ctx.fillRect(3.8, -19.2, 4.4, 6.4);
        ctx.restore();
        ctx.strokeStyle = '#5a5248'; ctx.lineWidth = 1;
        ctx.strokeRect(3, -20, 6, 8);
        break;
      }
      case 'wellhead': {
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(0, 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a655c';
        ctx.beginPath(); ctx.ellipse(0, -4, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#141018';
        ctx.beginPath(); ctx.ellipse(0, -5, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a4238'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-10, -22); ctx.moveTo(10, -6); ctx.lineTo(10, -22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-12, -22); ctx.lineTo(12, -22); ctx.stroke();
        break;
      }
      case 'orevein': {
        ctx.fillStyle = '#4c463c';
        ctx.beginPath();
        ctx.moveTo(-11, 0); ctx.lineTo(-7, -13); ctx.lineTo(2, -16); ctx.lineTo(10, -8); ctx.lineTo(9, 0);
        ctx.closePath(); ctx.fill();
        const oc = pr.ore > 0 ? '#ffd94f' : '#5a5248';
        for (let i = 0; i < 5; i++) {
          const a = rng() * Math.PI * 2, rr = rng() * 7;
          ctx.fillStyle = oc;
          if (pr.ore > 0) { ctx.shadowColor = oc; ctx.shadowBlur = 5; }
          ctx.beginPath(); ctx.arc(Math.cos(a) * rr, -8 + Math.sin(a) * rr * 0.6, 1.4 + rng() * 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
        break;
      }
      case 'fountain': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 3, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#75706a';
        ctx.beginPath(); ctx.ellipse(0, -3, 15, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        const dry = pr.charges <= 0;
        ctx.fillStyle = dry ? '#3a3830' : '#2a6a9a';
        ctx.beginPath(); ctx.ellipse(0, -4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        if (!dry) {
          ctx.fillStyle = U.rgba('#9fd8ff', 0.5 + Math.sin(t * 2.4 + pr.seed) * 0.15);
          ctx.beginPath(); ctx.ellipse(0, -4, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#8a857c';
        ctx.fillRect(-3, -20, 6, 16);
        ctx.beginPath(); ctx.ellipse(0, -21, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        if (!dry) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = U.rgba('#bfe8ff', 0.55); ctx.lineWidth = 1.2;
          for (let i = 0; i < 4; i++) {
            const a = t * 1.5 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(0, -21);
            ctx.quadraticCurveTo(Math.cos(a) * 7, -14, Math.cos(a) * 10, -5);
            ctx.stroke();
          }
          ctx.restore();
          if (U.rand() < 0.05) FX.ripple(pr.x, pr.y);
        }
        break;
      }
      case 'lever': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 3.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#55505a';
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(-5, -9); ctx.lineTo(5, -9); ctx.lineTo(7, 0);
        ctx.closePath(); ctx.fill();
        const la = pr.on ? 0.8 : -0.8;
        ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(Math.sin(la) * 13, -9 - Math.cos(la) * 13); ctx.stroke();
        const kc = pr.on ? '#6be26b' : '#c0392b';
        ctx.fillStyle = kc; ctx.shadowColor = kc; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(Math.sin(la) * 13, -9 - Math.cos(la) * 13, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'brazier_unlit': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3c3630'; ctx.lineWidth = 2.4;
        for (const lx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx * 0.5, -9); ctx.stroke(); }
        const bg = ctx.createLinearGradient(-9, -16, 9, -9);
        bg.addColorStop(0, '#5c554c'); bg.addColorStop(1, '#332e28');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(0, -12, 9.5, 4.5, 0, 0, Math.PI); ctx.fill();
        ctx.fillRect(-9.5, -16, 19, 4.5);
        if (pr.lit) {
          const fl = 0.85 + Math.sin(t * 9 + pr.seed) * 0.15;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (const [r2, cA, hh] of [[7.5, 0.3, 17], [4.6, 0.55, 12], [2.4, 0.9, 7]]) {
            ctx.fillStyle = U.rgba(hh < 8 ? '#fff2c8' : '#ffb04f', cA);
            ctx.beginPath();
            ctx.moveTo(-r2 * fl, -16);
            ctx.quadraticCurveTo(-r2 * fl, -16 - hh * fl * 0.5, 0, -16 - hh * fl + Math.sin(t * 15 + pr.seed) * 2);
            ctx.quadraticCurveTo(r2 * fl, -16 - hh * fl * 0.5, r2 * fl, -16);
            ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          if (U.rand() < 0.06) FX.push({ x: pr.x, y: pr.y, z: 20, vx: U.rf(U.rand, -0.25, 0.25), vy: U.rf(U.rand, -0.25, 0.25), vz: U.rf(U.rand, 8, 16), life: 0.8, maxLife: 0.8, color: '#ffb04f', size: 1.4, add: true, grav: -5 });
        } else {
          ctx.fillStyle = '#26221c';
          ctx.beginPath(); ctx.ellipse(0, -16, 7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'pillar': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(0, 2, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-8, 0, 8, 0);
        g.addColorStop(0, '#6a6a74'); g.addColorStop(0.5, '#8a8a96'); g.addColorStop(1, '#55555e');
        ctx.fillStyle = g; ctx.fillRect(-7, -46, 14, 46);
        ctx.fillStyle = '#9a9aa8'; ctx.fillRect(-9, -50, 18, 6); ctx.fillRect(-9, -3, 18, 5);
        break;
      }
      case 'grave': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7c7c88';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-7, -16); ctx.arc(0, -16, 7, Math.PI, 0); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#55555e'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -8); ctx.moveTo(-4, -14); ctx.lineTo(4, -14); ctx.stroke();
        break;
      }
      case 'bones': {
        ctx.strokeStyle = '#cfc8b0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const a = rng() * Math.PI;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * -6, -2 + Math.sin(a) * -3); ctx.lineTo(Math.cos(a) * 6, -2 + Math.sin(a) * 3); ctx.stroke();
        }
        ctx.fillStyle = '#cfc8b0'; ctx.beginPath(); ctx.arc(4, -4, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#242018'; ctx.fillRect(2.6, -5, 1.4, 1.4); ctx.fillRect(5, -5, 1.4, 1.4);
        break;
      }
      case 'urn': {
        ctx.fillStyle = '#8a6a4a';
        ctx.beginPath(); ctx.ellipse(0, -6, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a4a2e'; ctx.fillRect(-4, -16, 8, 4);
        break;
      }
      case 'rock': {
        ctx.fillStyle = '#55504a';
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-4, -9 - rng() * 4); ctx.lineTo(4, -7 - rng() * 5); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
        break;
      }
      case 'crystal': {
        const col = '#7bdcff';
        ctx.fillStyle = U.rgba(col, 0.85);
        ctx.shadowColor = col; ctx.shadowBlur = 10 + Math.sin(t * 3 + pr.seed) * 4;
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(5, -6); ctx.lineTo(0, 0); ctx.lineTo(-5, -6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(7, -13); ctx.lineTo(10, -4); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
        break;
      }
      case 'idol': {
        ctx.fillStyle = '#3c5a48';
        ctx.fillRect(-6, -26, 12, 26);
        ctx.fillStyle = '#8ef04a'; ctx.shadowColor = '#8ef04a'; ctx.shadowBlur = 6;
        ctx.fillRect(-3, -20, 2.4, 2.4); ctx.fillRect(1, -20, 2.4, 2.4);
        break;
      }
      case 'spike': {
        ctx.fillStyle = '#3a2420';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * 7 - 3, 0); ctx.lineTo(i * 7, -18 - rng() * 8); ctx.lineTo(i * 7 + 3, 0); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'torch': { // wall sconce with a living flame
        const col = pr.color || '#ffb04f';
        ctx.strokeStyle = '#3a2c1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, -34); ctx.stroke();
        ctx.fillStyle = '#55483a';
        ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(4, -34); ctx.lineTo(2.5, -39); ctx.lineTo(-2.5, -39); ctx.closePath(); ctx.fill();
        // Baked flame if one is loaded; the bracket above is ours either way.
        // The phase is derived from the prop seed so a corridor of torches
        // does not flicker in unison.
        if (Assets.drawSheet(ctx, 'torch-3d', 0, -46, 40, t,
              { phase: (pr.seed % 97) / 97, fps: 11, tint: col })) break;
        const fl = 0.85 + Math.sin(t * 11 + pr.x * 7 + pr.y * 13) * 0.15;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [r, cA, h] of [[6.5, 0.35, 15], [4, 0.6, 11], [2.2, 0.95, 7]]) {
          ctx.fillStyle = U.rgba(h < 8 ? '#fff2c8' : col, cA);
          ctx.beginPath();
          ctx.moveTo(-r * fl, -39);
          ctx.quadraticCurveTo(-r * fl, -39 - h * fl * 0.55, 0, -39 - h * fl + Math.sin(t * 17 + pr.seed) * 1.6);
          ctx.quadraticCurveTo(r * fl, -39 - h * fl * 0.55, r * fl, -39);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        if (U.rand() < 0.05) FX.push({ x: pr.x, y: pr.y, z: 42, vx: U.rf(U.rand, -0.2, 0.2), vy: U.rf(U.rand, -0.2, 0.2), vz: U.rf(U.rand, 6, 14), life: 0.7, maxLife: 0.7, color: col, size: 1.2, add: true, grav: -4 });
        break;
      }
      case 'brazier': { // standing fire bowl
        const col = pr.color || '#ffb04f';
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3c3630'; ctx.lineWidth = 2.4;
        for (const lx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx * 0.5, -9); ctx.stroke(); }
        const bg = ctx.createLinearGradient(-9, -16, 9, -9);
        bg.addColorStop(0, '#5c554c'); bg.addColorStop(1, '#332e28');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.ellipse(0, -12, 9.5, 4.5, 0, 0, Math.PI); ctx.fill();
        ctx.fillRect(-9.5, -16, 19, 4.5);
        ctx.fillStyle = U.rgba('#ff6a20', 0.9);
        ctx.beginPath(); ctx.ellipse(0, -16, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        // the bowl is ours; the fire in it comes from the baked sheet if loaded
        if (Assets.drawSheet(ctx, 'torch-3d', 0, -26, 46, t,
            { phase: (pr.seed % 89) / 89, fps: 10, tint: col })) break;
        const fl = 0.85 + Math.sin(t * 9 + pr.seed) * 0.15;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [r, cA, h] of [[7.5, 0.3, 17], [4.6, 0.55, 12], [2.4, 0.9, 7]]) {
          ctx.fillStyle = U.rgba(h < 8 ? '#fff2c8' : col, cA);
          ctx.beginPath();
          ctx.moveTo(-r * fl, -16);
          ctx.quadraticCurveTo(-r * fl, -16 - h * fl * 0.5, 0, -16 - h * fl + Math.sin(t * 15 + pr.seed) * 2);
          ctx.quadraticCurveTo(r * fl, -16 - h * fl * 0.5, r * fl, -16);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        if (U.rand() < 0.07) FX.push({ x: pr.x, y: pr.y, z: 20, vx: U.rf(U.rand, -0.25, 0.25), vy: U.rf(U.rand, -0.25, 0.25), vz: U.rf(U.rand, 8, 16), life: 0.8, maxLife: 0.8, color: col, size: 1.4, add: true, grav: -5 });
        break;
      }
      case 'statue': { // weathered guardian on a plinth
        ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(0, 2, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        const sg = ctx.createLinearGradient(-10, -44, 10, 0);
        sg.addColorStop(0, '#8a8a96'); sg.addColorStop(1, '#4c4c56');
        ctx.fillStyle = '#5c5c66'; ctx.fillRect(-10, -8, 20, 8);       // plinth
        ctx.fillStyle = '#50505a'; ctx.fillRect(-8, -11, 16, 3);
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(0, -22, 6, 11, 0, 0, Math.PI * 2); ctx.fill();  // torso
        ctx.beginPath(); ctx.arc(0, -36, 4.4, 0, Math.PI * 2); ctx.fill();           // head
        ctx.strokeStyle = '#6a6a76'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(4, -28); ctx.lineTo(11, -40); ctx.stroke();      // raised arm
        ctx.strokeStyle = '#7c7c88'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(11, -48); ctx.lineTo(11, -34); ctx.stroke();     // sword
        // weather streaks
        ctx.strokeStyle = 'rgba(30,34,28,0.5)'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const x = -4 + rng() * 8; ctx.beginPath(); ctx.moveTo(x, -30 - rng() * 4); ctx.lineTo(x + 1, -14); ctx.stroke(); }
        break;
      }
      case 'cobweb': { // silk stretched into the dark upper corner
        ctx.save();
        ctx.strokeStyle = 'rgba(230,235,245,0.2)'; ctx.lineWidth = 0.8;
        const ox = -14, oy = -46;
        for (let i = 0; i < 5; i++) {
          const a = -0.25 + i * 0.32;
          ctx.beginPath(); ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.cos(a) * 26, oy + Math.sin(a) * 26 + 8);
          ctx.stroke();
        }
        for (let r = 8; r <= 24; r += 8) {
          ctx.beginPath();
          for (let i = 0; i <= 5; i++) {
            const a = -0.25 + i * 0.32;
            const px = ox + Math.cos(a) * r, py = oy + Math.sin(a) * r + 8 * (r / 26);
            i === 0 ? ctx.moveTo(px, py) : ctx.quadraticCurveTo(ox + Math.cos(a - 0.16) * (r + 2), oy + Math.sin(a - 0.16) * (r + 2) + 8 * (r / 26), px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'rubble': {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const x = U.rf(rng, -9, 9), y = U.rf(rng, -4, 2), r = U.rf(rng, 1.6, 4);
          ctx.fillStyle = U.shade('#5a544c', U.rf(rng, 0.7, 1.15));
          ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.2, y - r); ctx.lineTo(x + r, y - r * 0.4); ctx.lineTo(x + r * 0.6, y + r * 0.4); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'candles': { // guttering votive cluster
        for (const [cx, cy, ch] of [[-5, 0, 7], [0, -2, 10], [5, 0, 6]]) {
          ctx.fillStyle = '#d8ceb8';
          ctx.fillRect(cx - 1.6, cy - ch, 3.2, ch);
          ctx.fillStyle = '#c4b8a0';
          ctx.beginPath(); ctx.ellipse(cx, cy - ch, 1.6, 0.7, 0, 0, Math.PI * 2); ctx.fill();
          const fl = 0.8 + Math.sin(t * 13 + cx * 3 + pr.seed) * 0.2;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = U.rgba('#ffd98f', 0.9);
          ctx.beginPath(); ctx.ellipse(cx, cy - ch - 3 * fl, 1.1, 2.6 * fl, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'skullpile': {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        for (const [x, y, r] of [[-5, -3, 3.6], [4, -3, 3.2], [-1, -8, 3.4], [7, -1, 2.6]]) {
          ctx.fillStyle = U.shade('#cfc8b0', U.rf(rng, 0.85, 1.05));
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#242018';
          ctx.fillRect(x - r * 0.5, y - r * 0.25, r * 0.36, r * 0.4);
          ctx.fillRect(x + r * 0.14, y - r * 0.25, r * 0.36, r * 0.4);
        }
        break;
      }
      case 'banner': { // torn war banner, swaying
        ctx.strokeStyle = '#4a3826'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1, -46); ctx.lineTo(15, -44); ctx.stroke();
        const sway = Math.sin(t * 1.3 + pr.seed) * 2;
        const bg = ctx.createLinearGradient(0, -44, 0, -16);
        bg.addColorStop(0, '#7a1f1f'); bg.addColorStop(1, '#3c0e0e');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(2, -44); ctx.lineTo(14, -43);
        ctx.lineTo(13 + sway, -24);
        ctx.lineTo(11 + sway, -28); ctx.lineTo(9 + sway, -20);
        ctx.lineTo(6 + sway, -26); ctx.lineTo(3 + sway, -18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(230,200,120,0.5)';
        ctx.beginPath(); ctx.arc(8, -36, 2.6, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'stalagmite': {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
        for (const [x, hgt, w2] of [[-6, 14 + rng() * 6, 4], [1, 24 + rng() * 8, 5.5], [7, 10 + rng() * 5, 3.2]]) {
          const g = ctx.createLinearGradient(x - w2, 0, x + w2, 0);
          g.addColorStop(0, '#4c4038'); g.addColorStop(0.5, '#6a5a4c'); g.addColorStop(1, '#3a3028');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x - w2, 0); ctx.quadraticCurveTo(x - w2 * 0.3, -hgt * 0.6, x, -hgt); ctx.quadraticCurveTo(x + w2 * 0.3, -hgt * 0.6, x + w2, 0); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'mushroom': { // bioluminescent cluster
        const col = '#6ae8a0';
        for (const [x, y, r] of [[-5, 0, 3.4], [2, -2, 4.6], [7, 1, 2.8]]) {
          ctx.fillStyle = '#d8d2c0';
          ctx.fillRect(x - 1.2, y - r * 1.8, 2.4, r * 1.8);
          ctx.save();
          ctx.fillStyle = U.rgba(col, 0.9);
          ctx.shadowColor = col; ctx.shadowBlur = 7 + Math.sin(t * 2.5 + x + pr.seed) * 3;
          ctx.beginPath(); ctx.ellipse(x, y - r * 1.8, r, r * 0.62, 0, Math.PI, 0); ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 1.95, r * 0.3, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (U.rand() < 0.02) FX.push({ x: pr.x, y: pr.y, z: 6, vx: U.rf(U.rand, -0.2, 0.2), vy: U.rf(U.rand, -0.2, 0.2), vz: U.rf(U.rand, 1, 3), life: 2.5, maxLife: 2.5, color: col, size: 1, add: true, grav: 0 });
        break;
      }
      case 'tree': break; // drawn after restore — needs its own transform

      // ---- props added alongside the Act asset packs ----
      // Vector stand-ins, so each act reads as its own place today; every one
      // has a model reserved in js/assetpacks.js for when art lands.

      // Act I — the parish
      case 'soul_cage': {          // hanging iron cage with a trapped wisp
        const gl = 0.5 + Math.sin(t * 2.2 + pr.seed) * 0.4;
        ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -26); ctx.stroke();
        ctx.fillStyle = U.rgba('#8fc8ff', 0.16 + gl * 0.2);
        ctx.beginPath(); ctx.ellipse(0, -16, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.rgba('#dff4ff', 0.5 + gl * 0.4);
        ctx.beginPath(); ctx.ellipse(0, -16 + Math.sin(t * 1.7) * 2, 2.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a4a54'; ctx.lineWidth = 1.2;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 2.4, -26); ctx.lineTo(i * 2.9, -6); ctx.stroke(); }
        ctx.beginPath(); ctx.ellipse(0, -26, 8, 2.6, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -6, 9, 3, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'reliquary': {          // little gilded shrine box on a plinth
        ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.shade('#5a5a64', 1); ctx.fillRect(-8, -10, 16, 10);
        const g = ctx.createLinearGradient(-7, -24, 7, -10);
        g.addColorStop(0, '#c9a44f'); g.addColorStop(1, '#7a6224');
        ctx.fillStyle = g; ctx.fillRect(-7, -22, 14, 12);
        ctx.fillStyle = '#e8d089';
        ctx.beginPath(); ctx.moveTo(-7, -22); ctx.lineTo(0, -28); ctx.lineTo(7, -22); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3a2e12'; ctx.lineWidth = 1; ctx.strokeRect(-7, -22, 14, 12);
        break;
      }
      case 'grave_marker': {       // small leaning slab
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(((pr.seed % 11) - 5) * 0.012);
        ctx.fillStyle = U.shade('#7a7a84', 0.9);
        ctx.beginPath();
        ctx.moveTo(-5, 0); ctx.lineTo(-5, -11); ctx.arc(0, -11, 5, Math.PI, 0); ctx.lineTo(5, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,26,0.6)'; ctx.lineWidth = 0.9; ctx.stroke();
        break;
      }
      case 'corpse_shroud': {      // wrapped body on the floor
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-12, -6, 12, 2);
        g.addColorStop(0, '#b8b0a0'); g.addColorStop(1, '#6a6558');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -3, 12, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,56,48,0.8)'; ctx.lineWidth = 1;
        for (const f of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(f, -7); ctx.lineTo(f, 1); ctx.stroke(); }
        break;
      }
      case 'prison_cell': {        // barred alcove front
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-13, -30, 26, 30);
        ctx.strokeStyle = '#4a4e56'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5.5, -30); ctx.lineTo(i * 5.5, 0); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(-13, -30); ctx.lineTo(13, -30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(13, -16); ctx.stroke();
        break;
      }

      // Act II — the catacombs
      case 'ritual_circle': {      // glowing sigil painted on the floor
        const pulse = 0.4 + Math.sin(t * 1.6 + pr.seed) * 0.25;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba('#c07bff', pulse); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, 0, 17, 8.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5 - Math.PI / 2, b = a + Math.PI * 4 / 5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 8);
          ctx.lineTo(Math.cos(b) * 16, Math.sin(b) * 8);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'spider_eggsac': {      // pale sac slung against the wall
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(-2, -14, 1, 0, -12, 11);
        g.addColorStop(0, '#e8e4d0'); g.addColorStop(1, '#9a9478');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -12, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,86,66,0.55)'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.ellipse(0, -12, 8 - i * 1.6, 11 - i * 2.2, 0, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'plague_vat': {         // bubbling barrel of something wrong
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-10, -22, 10, 0);
        g.addColorStop(0, '#5a5a4a'); g.addColorStop(1, '#32321f');
        ctx.fillStyle = g; ctx.fillRect(-10, -22, 20, 22);
        ctx.strokeStyle = '#6a6a58'; ctx.lineWidth = 1.4;
        for (const yy of [-17, -9, -2]) { ctx.beginPath(); ctx.moveTo(-10, yy); ctx.lineTo(10, yy); ctx.stroke(); }
        const bub = 0.5 + Math.sin(t * 3 + pr.seed) * 0.5;
        ctx.fillStyle = U.rgba('#8ef04a', 0.55);
        ctx.beginPath(); ctx.ellipse(0, -22, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.rgba('#d8ff9a', 0.5 * bub);
        ctx.beginPath(); ctx.ellipse(2 - bub * 3, -23, 2, 1.2, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'haunted_doll': {       // small seated figure, faintly wrong
        ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse(0, 2, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a6a5a';
        ctx.beginPath(); ctx.arc(0, -11, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a3a4a'; ctx.fillRect(-4, -7, 8, 7);
        ctx.strokeStyle = '#7a3a4a'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-7, -1); ctx.moveTo(4, -5); ctx.lineTo(7, -1); ctx.stroke();
        ctx.fillStyle = U.rgba('#ff4f4f', 0.75 + Math.sin(t * 4 + pr.seed) * 0.25);
        ctx.fillRect(-2.2, -12, 1.4, 1.4); ctx.fillRect(0.8, -12, 1.4, 1.4);
        break;
      }

      // Act III — the undercity
      case 'stalactite': {         // hanging spike from the unseen roof
        const g = ctx.createLinearGradient(0, -40, 0, -8);
        g.addColorStop(0, U.shade('#4a3a2e', 1.2)); g.addColorStop(1, '#241a12');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(6, -40); ctx.lineTo(1.2, -8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(-1, -40); ctx.lineTo(0, -12); ctx.closePath(); ctx.fill();
        break;
      }
      case 'echo_crystal': {       // resonating shard, hums with light
        const gl = 0.55 + Math.sin(t * 1.8 + pr.seed) * 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba('#8fd8ff', 0.14 * gl);
        ctx.beginPath(); ctx.arc(0, -13, 15, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        for (const [dx, h, w] of [[-4, 18, 3.4], [0, 26, 4.4], [4.5, 14, 3]]) {
          const g = ctx.createLinearGradient(dx, -h, dx, 0);
          g.addColorStop(0, U.rgba('#cfefff', 0.95)); g.addColorStop(1, U.rgba('#3a7aa0', 0.85));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(dx, -h); ctx.lineTo(dx + w, -h * 0.42); ctx.lineTo(dx, 0);
          ctx.lineTo(dx - w, -h * 0.42); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'mining_beam': {        // timber pit prop
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a4228';
        ctx.fillRect(-13, -34, 4.5, 34); ctx.fillRect(8.5, -34, 4.5, 34);
        ctx.fillStyle = '#6a5030'; ctx.fillRect(-14, -38, 28, 5);
        ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 1;
        ctx.strokeRect(-14, -38, 28, 5);
        break;
      }
      case 'dynamite': {           // bundled charges, smashable
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = i === 0 ? '#b8442a' : '#9a3a22';
          ctx.fillRect(i * 3.4 - 1.5, -12, 3, 12);
        }
        ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(5, -7); ctx.stroke();
        ctx.strokeStyle = '#c8b070'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(4, -18, 1, -21); ctx.stroke();
        break;
      }
      case 'ogre_bonepile': {      // gnawed leavings
        ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(0, 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        const br = makeRng(pr.seed + 3);
        for (let i = 0; i < 9; i++) {
          const a = br() * Math.PI * 2, r = br() * 9;
          ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r * 0.45 - 2); ctx.rotate(br() * Math.PI);
          ctx.strokeStyle = U.shade('#d8d2be', 0.8 + br() * 0.4); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-3.5, 0); ctx.lineTo(3.5, 0); ctx.stroke();
          ctx.restore();
        }
        break;
      }

      // Act IV — the drowned fane
      case 'marsh_grass': {        // reed clump, swaying
        const sw = Math.sin(t * 1.1 + pr.seed) * 2;
        const gr = makeRng(pr.seed + 7);
        for (let i = 0; i < 9; i++) {
          const dx = (gr() - 0.5) * 13, h = 10 + gr() * 13;
          ctx.strokeStyle = U.shade('#4a7a3a', 0.7 + gr() * 0.6); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(dx, 0);
          ctx.quadraticCurveTo(dx + sw * 0.5, -h * 0.6, dx + sw, -h);
          ctx.stroke();
        }
        break;
      }
      case 'poison_vine': {        // creeping vine with fat sacs
        const gr = makeRng(pr.seed + 11);
        ctx.strokeStyle = '#3a6a3a'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-11, 0);
        ctx.quadraticCurveTo(-3, -14, 4, -6); ctx.quadraticCurveTo(9, -1, 12, -13);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const px = -9 + i * 6, py = -4 - gr() * 8;
          ctx.fillStyle = U.rgba('#8ef04a', 0.7);
          ctx.beginPath(); ctx.ellipse(px, py, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'bog_skeleton': {       // half-sunk remains
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 12, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#b8b49a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(6, -3); ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(i * 2.6, -2); ctx.lineTo(i * 2.6 - 1, -6); ctx.stroke();
        }
        ctx.fillStyle = '#c8c4ac';
        ctx.beginPath(); ctx.ellipse(8, -5, 4, 3.4, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a3a2a';
        ctx.beginPath(); ctx.arc(7, -5.5, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'coral_pillar': {       // branching coral column
        const g = ctx.createLinearGradient(0, -34, 0, 0);
        g.addColorStop(0, '#c86a8a'); g.addColorStop(1, '#5a2a44');
        ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(-8, -26, -7, -33); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -21); ctx.quadraticCurveTo(8, -28, 7, -35); ctx.stroke();
        ctx.fillStyle = U.rgba('#ffb0c8', 0.5);
        for (const [px, py] of [[-7, -33], [7, -35], [0, -23]]) {
          ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'giant_clam': {         // shell, ajar, pearl inside
        ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-10, -8, 10, 2);
        g.addColorStop(0, '#9ab8c8'); g.addColorStop(1, '#4a6a7a');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -2, 11, 6, 0, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -8, 11, 6, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(30,44,54,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, -8, 11, 6, 0, Math.PI, 0); ctx.stroke();
        const gl = 0.6 + Math.sin(t * 1.4 + pr.seed) * 0.4;
        ctx.fillStyle = U.rgba('#f0f8ff', 0.6 + gl * 0.4);
        ctx.beginPath(); ctx.arc(0, -5, 2.4, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // Act V — the burning throne
      case 'demonic_sigil': {      // burning ward branded into the floor
        const pulse = 0.45 + Math.sin(t * 2.4 + pr.seed) * 0.3;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba('#ff4f2f', pulse); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.3;
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3 + t * 0.25;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 7);
          ctx.lineTo(Math.cos(a + 2.09) * 14, Math.sin(a + 2.09) * 7);
          ctx.stroke();
        }
        ctx.fillStyle = U.rgba('#ff8a2f', 0.16 * pulse);
        ctx.beginPath(); ctx.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'fel_crystal': {        // jagged green shard, lit from within
        const gl = 0.5 + Math.sin(t * 2 + pr.seed) * 0.4;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba('#8ef04a', 0.13 * gl);
        ctx.beginPath(); ctx.arc(0, -14, 16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        const g = ctx.createLinearGradient(0, -28, 0, 0);
        g.addColorStop(0, '#d8ff9a'); g.addColorStop(1, '#2a5a1a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -28); ctx.lineTo(6, -12); ctx.lineTo(2, 0); ctx.lineTo(-5, -2); ctx.lineTo(-6, -14);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = U.rgba('#f0ffd0', 0.5); ctx.lineWidth = 0.9; ctx.stroke();
        break;
      }
      case 'twisted_tree': {       // dead, wrong-angled trunk
        ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2c1c18'; ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-4, -16, 3, -30); ctx.stroke();
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(1, -20); ctx.quadraticCurveTo(-9, -25, -12, -34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, -25); ctx.quadraticCurveTo(11, -29, 13, -38); ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-12, -34); ctx.lineTo(-15, -39); ctx.moveTo(13, -38); ctx.lineTo(16, -43); ctx.stroke();
        break;
      }
      case 'charred_bones': {      // burnt ribcage
        ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a3230'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -4); ctx.stroke();
        for (let i = -3; i <= 3; i++) {
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(i * 2.8, -3);
          ctx.quadraticCurveTo(i * 3.4, -10, i * 2.2, -12);
          ctx.stroke();
        }
        ctx.fillStyle = U.rgba('#ff5a2f', 0.25 + Math.sin(t * 3 + pr.seed) * 0.15);
        ctx.beginPath(); ctx.ellipse(0, -3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'corrupted_stone': {    // boulder veined with something alive
        ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-9, -16, 9, 0);
        g.addColorStop(0, '#4a3a4a'); g.addColorStop(1, '#241a26');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(-7, -12); ctx.lineTo(1, -16); ctx.lineTo(9, -10); ctx.lineTo(10, 0);
        ctx.closePath(); ctx.fill();
        const pulse = 0.4 + Math.sin(t * 1.9 + pr.seed) * 0.3;
        ctx.strokeStyle = U.rgba('#c07bff', pulse); ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-2, -9); ctx.lineTo(3, -6); ctx.lineTo(7, -12); ctx.stroke();
        break;
      }
    }
    ctx.restore();
    if (pr.kind === 'tree') this.drawTree(ctx, pr, t);
  },

  drawTree(ctx, pr, t) {
    const [sx, sy] = this.worldToScreen(pr.x, pr.y);
    const rng = makeRng(pr.seed);
    const sway = Math.sin(t * 0.9 + pr.seed) * 1.6;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(2, 2, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    const tg = ctx.createLinearGradient(-3, 0, 4, 0);
    tg.addColorStop(0, '#5a4630'); tg.addColorStop(1, '#3a2c1c');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-3.5, 0); ctx.quadraticCurveTo(-2, -18, -1 + sway * 0.4, -30);
    ctx.lineTo(2.5 + sway * 0.4, -30); ctx.quadraticCurveTo(3, -14, 4.5, 0);
    ctx.closePath(); ctx.fill();
    for (const [bx, by, r, f] of [[-8, -36, 11, 0.85], [7 + sway * 0.4, -38, 12, 1], [0 + sway * 0.5, -47, 10, 1.12]]) {
      const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.35, 1, bx, by, r);
      g.addColorStop(0, U.shade('#3f6a34', f * 1.25)); g.addColorStop(1, U.shade('#24421e', f * 0.85));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx + sway * 0.3, by, r + rng() * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawThing(ctx, th, t) {
    const [sx, sy] = this.worldToScreen(th.x, th.y);
    if (sx < -60 || sx > this.W + 60 || sy < -80 || sy > this.H + 60) return;
    ctx.save();
    ctx.translate(sx, sy);
    switch (th.kind) {
      case 'barrel': {
        if (th.hp <= 0) break;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(-8, 0, 8, 0);
        g.addColorStop(0, '#5a3f26'); g.addColorStop(0.5, '#7a5a38'); g.addColorStop(1, '#4a3220');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -9, 8, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = th.explosive ? '#c0392b' : '#3a2c1a'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, -13, 7.4, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -6, 7.9, 3.6, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'chest': {
        if (th.opened) { ctx.globalAlpha = 0.55; }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a5a2e'; ctx.fillRect(-10, -12, 20, 12);
        ctx.fillStyle = '#8a6a3e';
        ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(0, th.opened ? -26 : -19, 10, -12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd94f'; ctx.shadowColor = '#ffd94f'; ctx.shadowBlur = th.opened ? 0 : 5;
        ctx.fillRect(-1.6, -12, 3.2, 5);
        break;
      }
      case 'shrine': {
        const col = th.used ? '#55555e' : '#8fc8ff';
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a6a78';
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-4, -30); ctx.lineTo(4, -30); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col;
        if (!th.used) { ctx.shadowColor = col; ctx.shadowBlur = 12 + Math.sin(t * 4) * 5; }
        ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(5, -30); ctx.lineTo(0, -24); ctx.lineTo(-5, -30); ctx.closePath(); ctx.fill();
        break;
      }
      case 'goldpile': {
        if (th.taken) break;
        ctx.fillStyle = '#ffd94f'; ctx.shadowColor = '#ffd94f'; ctx.shadowBlur = 4;
        for (const [gx, gy] of [[-4, -1], [3, 0], [0, -4], [-1, 1], [5, -3]]) {
          ctx.beginPath(); ctx.ellipse(gx, gy, 3.2, 2, 0, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  },

  drawGroundItem(ctx, gi, t) {
    const [sx, sy] = this.worldToScreen(gi.x, gi.y);
    if (sx < -60 || sx > this.W + 60 || sy < -140 || sy > this.H + 60) return;
    gi.popZ = Math.max(0, (gi.popZ === undefined ? 20 : gi.popZ) - 60 * (1 / 60));
    // rarity light pillar rising from dropped treasure
    if (!gi.gold && gi.item.rarity !== 'common') {
      const rc = Items.rarityColor(gi.item.rarity);
      const big = gi.item.rarity === 'unique' || gi.item.rarity === 'set';
      const pulse = 0.7 + 0.3 * Math.sin(t * 2.2 + gi.x * 3.1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bh = big ? 130 : 95, bw = big ? 11 : 7;
      const g = ctx.createLinearGradient(sx, sy, sx, sy - bh);
      g.addColorStop(0, U.rgba(rc, (big ? 0.4 : 0.3) * pulse)); g.addColorStop(1, U.rgba(rc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx - bw / 2, sy - bh, bw, bh);
      ctx.fillStyle = U.rgba(rc, 0.22 * pulse);
      ctx.beginPath(); ctx.ellipse(sx, sy, 13, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (big && U.rand() < 0.06)
        FX.push({ x: gi.x, y: gi.y, z: U.rf(U.rand, 4, 34), vx: U.rf(U.rand, -0.2, 0.2), vy: U.rf(U.rand, -0.2, 0.2), vz: U.rf(U.rand, 3, 9), life: 0.9, maxLife: 0.9, color: rc, size: 1.3, add: true, grav: 0 });
    }
    ctx.save();
    if (gi.gold) {
      ctx.translate(sx, sy - gi.popZ);
      ctx.fillStyle = '#ffd94f';
      for (const [gx, gy] of [[-4, -1], [3, 0], [0, -3]]) { ctx.beginPath(); ctx.ellipse(gx, gy, 3, 1.9, 0, 0, Math.PI * 2); ctx.fill(); }
    } else {
      const icon = Sprites.itemIcon(gi.item, 26);
      ctx.drawImage(icon, sx - 13, sy - 20 - gi.popZ);
      // label
      const rc = Items.rarityColor(gi.item.rarity);
      ctx.font = '11.5px Palatino Linotype, serif';
      const wtxt = ctx.measureText(gi.item.name).width;
      gi._lw = wtxt;
      ctx.fillStyle = 'rgba(4,4,10,0.72)';
      ctx.fillRect(sx - wtxt / 2 - 4, sy - 40, wtxt + 8, 14);
      ctx.fillStyle = rc; ctx.textAlign = 'center';
      ctx.fillText(gi.item.name, sx, sy - 29);
    }
    ctx.restore();
  },

  drawPortal(ctx, portal, t) {
    const [sx, sy] = this.worldToScreen(portal.x, portal.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = t * 2.4 + i * 2.1;
      ctx.strokeStyle = U.rgba('#4f8fff', 0.5 - i * 0.12);
      ctx.lineWidth = 3 - i * 0.7;
      ctx.beginPath();
      ctx.ellipse(0, -22, 13 + Math.sin(ph) * 2.5, 26 + Math.cos(ph) * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, -22, 1, 0, -22, 20);
    g.addColorStop(0, 'rgba(150,190,255,0.6)'); g.addColorStop(1, 'rgba(30,60,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, -22, 12, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  drawWaypoint(ctx, wp, t) {
    const [sx, sy] = this.worldToScreen(wp.x, wp.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.strokeStyle = U.rgba('#8fc8ff', 0.7 + Math.sin(t * 3) * 0.2);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = U.rgba('#8fc8ff', 0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = t * 1.8 + i * Math.PI / 2;
      ctx.fillStyle = 'rgba(160,200,255,0.7)';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 18, Math.sin(a) * 9 - Math.abs(Math.sin(t * 2 + i)) * 14, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // ---------- minimap ----------
  drawMinimap() {
    const map = G.map, pl = G.player, m = this.mmCtx;
    const S = 220;
    m.clearRect(0, 0, S, S);
    const sc = S / Math.max(map.w, map.h);
    m.save();
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        if (!map.explored[i]) continue;
        const tl = map.t[i];
        if (tl === TILE.WALL) m.fillStyle = 'rgba(120,110,90,0.55)';
        else if (tl === TILE.EXIT) m.fillStyle = '#ff8a2f';
        else if (tl === TILE.ENTRY) m.fillStyle = '#8fc8ff';
        else if (map.haz[i] === HAZ.LAVA) m.fillStyle = 'rgba(200,70,10,0.8)';
        else if (map.haz[i] === HAZ.WATER) m.fillStyle = 'rgba(40,90,140,0.8)';
        else if (isVent(map.haz[i])) m.fillStyle = U.rgba(VENT_KINDS[map.haz[i]].color, 0.8);
        else m.fillStyle = 'rgba(52,48,40,0.8)';
        m.fillRect(x * sc, y * sc, Math.ceil(sc), Math.ceil(sc));
      }
    }
    // entities
    for (const mo of G.monsters) {
      if (mo.dead) continue;
      if (!map.explored[Math.floor(mo.y) * map.w + Math.floor(mo.x)]) continue;
      m.fillStyle = mo.ally ? '#6be26b' : mo.boss ? '#ff5a3c' : mo.rank === 'elite' ? '#ffd94f' : '#c0392b';
      m.fillRect(mo.x * sc - 1.5, mo.y * sc - 1.5, 3, 3);
    }
    for (const n of G.npcs) { m.fillStyle = '#ffe9a8'; m.fillRect(n.x * sc - 2, n.y * sc - 2, 4, 4); }
    const ppM = G.portalOnMap(map);
    if (ppM) { m.fillStyle = '#4f8fff'; m.fillRect(ppM.x * sc - 2.5, ppM.y * sc - 2.5, 5, 5); }
    if (map.waypoint) { m.fillStyle = '#8fc8ff'; m.fillRect(map.waypoint.x * sc - 2.5, map.waypoint.y * sc - 2.5, 5, 5); }
    m.fillStyle = '#fff';
    m.fillRect(pl.x * sc - 2, pl.y * sc - 2, 4, 4);
    m.restore();
  },
};
