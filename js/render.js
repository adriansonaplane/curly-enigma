// ============ DIABLOID: render.js — isometric renderer, lighting, FX ============
'use strict';

const ISO_X = 32, ISO_Y = 16, WALL_PX = 40;

// ---------------- particle / effect helpers ----------------
const FX = {
  push(p) { if (G.parts.length < 1500) G.parts.push(p); },
  ripple(x, y) {
    G.rings.push({ x, y, r: 0.08, maxR: U.rf(U.rand, 0.35, 0.65), color: '#9fc8e8', t: 0.5, maxT: 0.5, alpha: 0.35 });
  },
  spark(x, y, color, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 0.5, 3);
      this.push({ x, y, z: U.rf(U.rand, 4, 16), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 6, 22), life: 0.4, maxLife: 0.4, color, size: U.rf(U.rand, 1.5, 3), add: true, grav: 60 });
    }
  },
  trail(p) {
    if (U.rand() < 0.55) return;
    this.push({ x: p.x, y: p.y, z: 12, vx: U.rf(U.rand, -0.5, 0.5), vy: U.rf(U.rand, -0.5, 0.5), vz: U.rf(U.rand, -4, 8), life: 0.3, maxLife: 0.3, color: ELEM[p.elem].color, size: U.rf(U.rand, 1.5, 3.2), add: true, grav: 0 });
  },
  blood(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 1, 4);
      this.push({ x, y, z: U.rf(U.rand, 8, 22), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 10, 40), life: 0.55, maxLife: 0.55, color, size: U.rf(U.rand, 1.5, 3), add: false, grav: 130 });
    }
  },
  deathBurst(x, y, color, size) {
    for (let i = 0; i < 14 * size; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 1, 5) * size;
      this.push({ x, y, z: U.rf(U.rand, 4, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 10, 50), life: 0.7, maxLife: 0.7, color: U.rand() < 0.5 ? color : '#6a0f0f', size: U.rf(U.rand, 2, 4), add: false, grav: 120 });
    }
  },
  explosion(x, y, r, color) {
    G.rings.push({ x, y, r: 0.2, maxR: r, color, t: 0.35, maxT: 0.35 });
    G.flashes.push({ x, y, r: r * 1.6, color, t: 0.25, maxT: 0.25 });
    for (let i = 0; i < 22; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 2, 7);
      this.push({ x, y, z: U.rf(U.rand, 2, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 15, 55), life: 0.6, maxLife: 0.6, color, size: U.rf(U.rand, 2, 4.5), add: true, grav: 80 });
    }
  },
  ring(x, y, r, color, alpha) {
    G.rings.push({ x, y, r: 0.2, maxR: r, color, t: 0.3, maxT: 0.3, alpha: alpha || 0.9 });
  },
  slash(x, y, ang, range, color) {
    for (let i = 0; i < 7; i++) {
      const a = ang + U.rf(U.rand, -0.6, 0.6), rr = U.rf(U.rand, 0.4, range);
      this.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: 16, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 4, life: 0.22, maxLife: 0.22, color, size: 2.2, add: true, grav: 0 });
    }
  },
  strike(x, y, color) {
    G.bolts.push({ x, y, t: 0.22, maxT: 0.22, color });
    G.flashes.push({ x, y, r: 2.4, color, t: 0.22, maxT: 0.22 });
    this.spark(x, y, color, 6);
  },
  ember(x, y) {
    this.push({ x, y, z: 2, vx: U.rf(U.rand, -0.3, 0.3), vy: U.rf(U.rand, -0.3, 0.3), vz: U.rf(U.rand, 10, 22), life: 1.1, maxLife: 1.1, color: U.rand() < 0.5 ? '#ff8a2f' : '#ffd94f', size: U.rf(U.rand, 1.2, 2.4), add: true, grav: -8 });
  },
  gasPuff(x, y) {
    this.push({ x, y, z: 2, vx: U.rf(U.rand, -0.4, 0.4), vy: U.rf(U.rand, -0.4, 0.4), vz: U.rf(U.rand, 4, 9), life: 1.6, maxLife: 1.6, color: '#5a9a2f', size: U.rf(U.rand, 3, 6), add: false, grav: -4 });
  },
  spikeBurst(x, y) {
    for (let i = 0; i < 6; i++)
      this.push({ x: x + U.rf(U.rand, -0.3, 0.3), y: y + U.rf(U.rand, -0.3, 0.3), z: 0, vx: 0, vy: 0, vz: U.rf(U.rand, 30, 60), life: 0.3, maxLife: 0.3, color: '#b8bcc4', size: 2.5, add: false, grav: 260 });
  },
  levelUp(x, y) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      this.push({ x: x + Math.cos(a) * 0.8, y: y + Math.sin(a) * 0.8, z: 0, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vz: U.rf(U.rand, 30, 70), life: 1.1, maxLife: 1.1, color: '#ffd94f', size: 2.6, add: true, grav: 20 });
    }
    G.flashes.push({ x, y, r: 5, color: '#ffd94f', t: 0.5, maxT: 0.5 });
  },
};

// ---------------- renderer ----------------
const Render = {
  cv: null, ctx: null, lightCv: null, lctx: null,
  W: 0, H: 0, dpr: 1, mmCv: null, mmCtx: null,
  exploreT: 0,

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
  worldToScreen(x, y, z = 0) {
    return [
      (x - y) * ISO_X - this.camSX + this.W / 2,
      (x + y) * ISO_Y - this.camSY + this.H / 2 - z,
    ];
  },
  screenToWorld(sx, sy) {
    const rx = sx - this.W / 2 + this.camSX, ry = sy - this.H / 2 + this.camSY;
    const wx = (rx / ISO_X + ry / ISO_Y) / 2, wy = (ry / ISO_Y - rx / ISO_X) / 2;
    return [wx, wy];
  },

  updateParticles(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.life -= dt;
      if (p.life <= 0) { G.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.grav * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; }
    }
    for (let i = G.rings.length - 1; i >= 0; i--) { const r = G.rings[i]; r.t -= dt; if (r.t <= 0) G.rings.splice(i, 1); }
    for (let i = G.flashes.length - 1; i >= 0; i--) { const f = G.flashes[i]; f.t -= dt; if (f.t <= 0) G.flashes.splice(i, 1); }
    for (let i = G.bolts.length - 1; i >= 0; i--) { const b = G.bolts[i]; b.t -= dt; if (b.t <= 0) G.bolts.splice(i, 1); }
    for (let i = G.dmgNums.length - 1; i >= 0; i--) { const d = G.dmgNums[i]; d.t -= dt; d.z += 34 * dt; if (d.t <= 0) G.dmgNums.splice(i, 1); }
  },

  // Auto quality: if a machine can't hold frame rate with the full effect
  // stack, quietly shed the most fill-hungry layers (fog, god rays, AO,
  // directional shadows). Degrade-only, re-evaluated over 2.5s windows.
  quality: 'high', _fpsN: 0, _fpsT: 0,
  trackFps(dt) {
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
    this.updateParticles(dt);
    this.updateFog(dt);
    this.updateAmbient(dt);

    // camera + shake
    G.shake = Math.max(0, G.shake - dt * 30);
    const shx = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.5 : 0;
    const shy = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.5 : 0;
    this.camSX = (pl.x - pl.y) * ISO_X + shx;
    this.camSY = (pl.x + pl.y) * ISO_Y + shy;

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
    const R = Math.ceil(this.W / (ISO_X * 2) + this.H / (ISO_Y * 2) / 2) + 6;
    const cx = Math.floor(pl.x), cy = Math.floor(pl.y);
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(map.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(map.h - 1, Math.ceil(cy + R));

    // ---------- floor pass ----------
    const lavaFrame = Math.floor(t * 5) % 4;
    const waterFrame = Math.floor(t * 2.4) % 3;
    const aoTiles = Sprites.getAO();
    const hiQ = this.quality === 'high';
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * map.w + tx;
        const tile = map.t[i];
        if (tile === TILE.WALL) continue;
        const [sx, sy] = this.worldToScreen(tx + 0.5, ty + 0.5);
        if (sx < -48 || sx > this.W + 48 || sy < -48 || sy > this.H + 64) continue;
        const hz = map.haz[i];
        let img;
        if (hz === HAZ.LAVA) img = tiles.lava[lavaFrame];
        else if (hz === HAZ.WATER) img = tiles.water[waterFrame];
        else if (hz === HAZ.SPIKES) img = tiles.spikes;
        else if (hz === HAZ.GAS) img = tiles.gas;
        else img = tiles.floors[map.variant[i] % tiles.floors.length];
        ctx.drawImage(img, sx - ISO_X, sy - ISO_Y, ISO_X * 2, ISO_Y * 2);
        // baked ambient occlusion where floor meets walls
        const ao = hiQ && map.ao ? map.ao[i] : 0;
        if (ao) ctx.drawImage(aoTiles[ao], sx - ISO_X, sy - ISO_Y, ISO_X * 2, ISO_Y * 2);
        // travelling specular glint on water
        if (hz === HAZ.WATER && hiQ) {
          const gl = 0.5 + 0.5 * Math.sin(t * 1.7 + tx * 2.6 + ty * 4.1);
          if (gl > 0.55) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (gl - 0.55) * 0.35;
            ctx.fillStyle = '#cfe8ff';
            ctx.beginPath(); ctx.ellipse(sx + Math.sin(t + tx) * 8, sy + Math.cos(t * 0.8 + ty) * 3, 10, 3.2, -0.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
        if (tile === TILE.EXIT || tile === TILE.ENTRY) {
          const glow = tile === TILE.EXIT ? '#ff8a2f' : '#8fc8ff';
          ctx.save();
          ctx.globalAlpha = 0.55 + Math.sin(t * 4) * 0.2;
          ctx.strokeStyle = glow; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx, sy - ISO_Y * 0.7); ctx.lineTo(sx + ISO_X * 0.7, sy);
          ctx.lineTo(sx, sy + ISO_Y * 0.7); ctx.lineTo(sx - ISO_X * 0.7, sy);
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = U.rgba(glow, 0.18); ctx.fill();
          ctx.restore();
        }
      }
    }

    // ground effect zones
    for (const gr of G.grounds) {
      const [sx, sy] = this.worldToScreen(gr.x, gr.y);
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(t * 6) * 0.05;
      ctx.fillStyle = ELEM[gr.elem].color;
      ctx.beginPath(); ctx.ellipse(sx, sy, gr.r * ISO_X, gr.r * ISO_Y, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // meteor telegraphs
    for (const pd of G.pending) {
      const [sx, sy] = this.worldToScreen(pd.x, pd.y);
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 12) * 0.25;
      ctx.strokeStyle = pd.ally ? U.rgba(ELEM[pd.elem].color, 0.8) : '#ff3c2f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, pd.radius * ISO_X, pd.radius * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx, sy, pd.radius * ISO_X * (1 - pd.t), pd.radius * ISO_Y * (1 - pd.t), 0, 0, Math.PI * 2); ctx.stroke();
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
      ctx.beginPath(); ctx.ellipse(sx, sy, rr * ISO_X, rr * ISO_Y, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

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
        list.push({ d: tx + ty, kind: 'wall', tx, ty });
      }
    }
    for (const pr of map.props) list.push({ d: pr.x + pr.y, kind: 'prop', pr });
    for (const th of map.things) list.push({ d: th.x + th.y, kind: 'thing', th });
    for (const gi of G.groundItems) list.push({ d: gi.x + gi.y, kind: 'gitem', gi });
    for (const m of G.monsters) list.push({ d: m.x + m.y, kind: 'mon', m });
    for (const n of G.npcs) list.push({ d: n.x + n.y, kind: 'npc', n });
    const pp = G.portalOnMap(map);
    if (pp) list.push({ d: pp.x + pp.y, kind: 'portal', pp });
    if (map.waypoint) list.push({ d: map.waypoint.x + map.waypoint.y, kind: 'waypoint' });
    if (!pl.dead) list.push({ d: pl.x + pl.y, kind: 'player' });
    for (const p of G.projs) list.push({ d: p.x + p.y, kind: 'proj', p });
    list.sort((a, b) => a.d - b.d);

    for (const it of list) {
      switch (it.kind) {
        case 'wall': {
          const [sx, sy] = this.worldToScreen(it.tx + 0.5, it.ty + 0.5);
          if (sx < -48 || sx > this.W + 48 || sy < -80 || sy > this.H + 90) break;
          ctx.drawImage(tiles.wall, sx - ISO_X, sy - ISO_Y - tiles.wallH, ISO_X * 2, ISO_Y * 2 + tiles.wallH);
          break;
        }
        case 'prop': this.drawProp(ctx, it.pr, t); break;
        case 'thing': this.drawThing(ctx, it.th, t); break;
        case 'gitem': this.drawGroundItem(ctx, it.gi, t); break;
        case 'mon': this.drawActor(ctx, it.m, t); break;
        case 'npc': this.drawNpc(ctx, it.n, t); break;
        case 'player': this.drawPlayer(ctx, pl, t); break;
        case 'proj': this.drawProj(ctx, it.p, t); break;
        case 'portal': this.drawPortal(ctx, it.pp, t); break;
        case 'waypoint': this.drawWaypoint(ctx, map.waypoint, t); break;
      }
    }

    // ---------- particles ----------
    for (const p of G.parts) {
      const [sx, sy] = this.worldToScreen(p.x, p.y, p.z);
      if (sx < -20 || sx > this.W + 20 || sy < -20 || sy > this.H + 20) continue;
      ctx.save();
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, Math.PI * 2); ctx.fill();
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

  // ---------- atmosphere: fog, god rays, grading, ambient particles ----------
  fogMap: null, fogPuffs: [],

  updateFog(dt) {
    const map = G.map, pl = G.player, th = THEMES[map.theme];
    if (!th.fog) { this.fogPuffs = []; this.fogMap = null; return; }
    if (this.fogMap !== map) {
      this.fogMap = map;
      this.fogPuffs = [];
      const imgs = Sprites.getFog(map.theme);
      for (let i = 0; i < 24; i++) {
        this.fogPuffs.push({
          x: pl.x + U.rf(U.rand, -20, 20), y: pl.y + U.rf(U.rand, -20, 20),
          vx: U.rf(U.rand, -0.16, 0.16), vy: U.rf(U.rand, -0.16, 0.16),
          s: U.rf(U.rand, 3.5, 8), a: U.rf(U.rand, 0.5, 1),
          ph: U.rand() * 7, img: U.pick(U.rand, imgs),
        });
      }
    }
    for (const p of this.fogPuffs) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      // drifted out of range: mirror it across the camera so cover never thins
      if (U.dist(p.x, p.y, pl.x, pl.y) > 25) {
        p.x = pl.x - (p.x - pl.x) * 0.9; p.y = pl.y - (p.y - pl.y) * 0.9;
      }
    }
  },

  // Fog renders into a quarter-res buffer once per frame (mult === 1), then
  // both passes just blit it — huge fill-rate savings on soft alpha blends.
  drawFog(ctx, t, mult) {
    if (this.quality === 'low') return;
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
        const w = p.s * ISO_X * 2;
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
    if (this.quality === 'low') return;
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
    if (U.rand() >= dt * rate) return;
    const R = 12;
    const x = pl.x + U.rf(U.rand, -R, R), y = pl.y + U.rf(U.rand, -R, R);
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
    if (map.t[ty * map.w + tx] === TILE.WALL && th.amb !== 'ash') return;
    switch (th.amb) {
      case 'dust':
        FX.push({ x, y, z: U.rf(U.rand, 6, 44), vx: U.rf(U.rand, -0.25, 0.25), vy: U.rf(U.rand, -0.25, 0.25), vz: U.rf(U.rand, -2, 2), life: 4, maxLife: 4, color: '#b8b4a8', size: U.rf(U.rand, 0.7, 1.4), add: true, grav: 0 });
        break;
      case 'ember':
        FX.push({ x, y, z: U.rf(U.rand, 0, 12), vx: U.rf(U.rand, -0.3, 0.3), vy: U.rf(U.rand, -0.3, 0.3), vz: U.rf(U.rand, 5, 13), life: 2.4, maxLife: 2.4, color: U.rand() < 0.5 ? '#ff8a2f' : '#ffc94f', size: U.rf(U.rand, 0.9, 1.8), add: true, grav: -7 });
        break;
      case 'spore':
        FX.push({ x, y, z: U.rf(U.rand, 4, 32), vx: U.rf(U.rand, -0.2, 0.2), vy: U.rf(U.rand, -0.2, 0.2), vz: U.rf(U.rand, -1.5, 3), life: 3.6, maxLife: 3.6, color: U.rand() < 0.7 ? '#8ae8a0' : '#c8ffd8', size: U.rf(U.rand, 0.8, 1.7), add: true, grav: 0 });
        break;
      case 'ash':
        FX.push({ x, y, z: U.rf(U.rand, 55, 80), vx: U.rf(U.rand, -0.4, 0.1), vy: U.rf(U.rand, -0.1, 0.4), vz: U.rf(U.rand, -11, -7), life: 6, maxLife: 6, color: U.rand() < 0.75 ? '#9a8880' : '#e06840', size: U.rf(U.rand, 0.8, 1.6), add: false, grav: 0 });
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
    lctx.fillStyle = `rgba(2,2,6,${th.ambient})`;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'destination-out';

    const punchImg = this.getPunch();
    const punch = (wx, wy, r, intensity) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const px = sx / 2, py = sy / 2, pr = r * ISO_X / 2;
      if (px < -pr || px > lw + pr || py < -pr || py > lh + pr) return;
      lctx.globalAlpha = intensity;
      lctx.drawImage(punchImg, px - pr, py - pr, pr * 2, pr * 2);
    };

    punch(pl.x, pl.y, pl.derived.lightRad, 1);
    punch(pl.x, pl.y, pl.derived.lightRad * 2.1, 0.32); // soft fill so midtones survive
    for (const l of map.lights) {
      const fl = l.flick ? 0.85 + Math.sin(t * 11 + l.x * 7 + l.y * 13) * 0.15 : 1;
      punch(l.x, l.y, l.r * fl, 0.95);
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
      const pr = r * ISO_X;
      if (sx < -pr || sx > this.W + pr || sy < -pr || sy > this.H + pr) return;
      ctx.globalAlpha = a;
      ctx.drawImage(this.getGlow(color), sx - pr, sy - pr, pr * 2, pr * 2);
    };
    for (const l of map.lights) {
      const fl = l.flick ? 0.8 + Math.sin(t * 11 + l.x * 7 + l.y * 13) * 0.2 : 1;
      glow(l.x, l.y, l.r * 0.8 * fl, l.color, 0.10);
    }
    for (const p of G.projs) glow(p.x, p.y, 1.6, ELEM[p.elem].color, 0.16);
    for (const f of G.flashes) glow(f.x, f.y, f.r, f.color, 0.25 * f.t / f.maxT);
    ctx.restore();
  },

  // ---------- actors ----------
  dirIndex(ang) { return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8; },

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
      const vx = (wx - wy) * ISO_X, vy = (wx + wy) * ISO_Y; // world dir -> screen dir
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
    else if (m.attackT > 0) frame = m.attackT > 0.15 ? 4 : 5;
    else frame = Math.floor(m.anim) % 4;
    const C = sheet.cell;
    const scale = m.size;
    const bob = m.fly ? Math.sin(t * 4 + m.x) * 4 : 0;
    if (wet && !m.dead) this.drawReflection(ctx, sheet, frame, dir, sx, sy, C, scale);

    ctx.save();
    ctx.translate(sx, sy + bob);
    if (m.dead) { ctx.globalAlpha = Math.max(0, m.deathT / 0.9); ctx.translate(0, (0.9 - m.deathT) * 8); ctx.rotate((0.9 - m.deathT) * 0.9); }
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

    // health bar + debuff tint
    if (!m.dead && !m.ally && m.hp < m.maxHp) {
      const w = 30 * Math.min(2, m.size);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(sx - w / 2, sy - 48 * m.size - 6, w, 4);
      ctx.fillStyle = m.rank === 'elite' ? '#ffd94f' : m.rank === 'champion' ? '#7b9bff' : '#c0392b';
      ctx.fillRect(sx - w / 2, sy - 48 * m.size - 6, w * Math.max(0, m.hp / m.maxHp), 4);
      ctx.restore();
    }
    if (!m.dead && m.rank === 'elite') {
      ctx.save();
      ctx.font = '11px Palatino Linotype, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd94f';
      ctx.fillText(m.name, sx, sy - 48 * m.size - 12);
      ctx.restore();
    }
  },

  drawPlayer(ctx, pl, t) {
    const sheet = Sprites.getActor(pl.cls);
    const wet = this.onWater(pl.x, pl.y);
    if (!wet) this.drawShadow(ctx, pl.x, pl.y, 1);
    const [sx, sy] = this.worldToScreen(pl.x, pl.y);
    const dir = this.dirIndex(pl.dir);
    let frame;
    if (pl.attackT > 0) frame = pl.attackT > 0.15 ? 4 : 5;
    else if (pl.moving) frame = Math.floor(t * 9) % 4;
    else frame = 0;
    const C = sheet.cell;
    if (wet) this.drawReflection(ctx, sheet, frame, dir, sx, sy, C, 1);
    ctx.save();
    ctx.translate(sx, sy);
    // buff aura
    if (pl.buffs.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = U.rgba(pl.buffs[0].color || '#ffd94f', 0.12 + Math.sin(t * 6) * 0.05);
      ctx.beginPath(); ctx.ellipse(0, 2, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(sheet.canvas, frame * C, dir * C, C, C, -C / 2, -C * 0.78, C, C);
    ctx.restore();
  },

  drawNpc(ctx, n, t) {
    const sheet = Sprites.getActor(n.id);
    this.drawShadow(ctx, n.x, n.y, 1);
    const [sx, sy] = this.worldToScreen(n.x, n.y);
    const C = sheet.cell;
    const frame = Math.floor(t * 2 + n.x) % 4;
    ctx.drawImage(sheet.canvas, frame * C, 6 * C, C, C, sx - C / 2, sy - C * 0.78, C, C);
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
    const [sx, sy] = this.worldToScreen(pr.x, pr.y);
    if (sx < -60 || sx > this.W + 60 || sy < -90 || sy > this.H + 60) return;
    const rng = makeRng(pr.seed);
    ctx.save();
    ctx.translate(sx, sy);
    switch (pr.kind) {
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
