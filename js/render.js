// ============ DIABLOID: render.js — isometric renderer, lighting, FX ============
'use strict';

const ISO_X = 32, ISO_Y = 16, WALL_PX = 40;

// ---------------- particle / effect helpers ----------------
const FX = {
  push(p) { if (G.parts.length < 900) G.parts.push(p); },
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

  frame(dt, t) {
    const ctx = this.ctx, map = G.map, pl = G.player;
    if (!map || !pl) return;
    this.updateParticles(dt);

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
    const lavaFrame = Math.floor(t * 3) % 2;
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
        else if (hz === HAZ.SPIKES) img = tiles.spikes;
        else if (hz === HAZ.GAS) img = tiles.gas;
        else img = tiles.floors[map.variant[i]];
        ctx.drawImage(img, sx - ISO_X, sy - ISO_Y);
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
          ctx.drawImage(tiles.wall, sx - ISO_X, sy - ISO_Y - tiles.wallH);
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

    // ---------- lighting overlay ----------
    this.drawLighting(t);

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

  // ---------- lights ----------
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

    const punch = (wx, wy, r, intensity) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const px = sx / 2, py = sy / 2, pr = r * ISO_X / 2;
      if (px < -pr || px > lw + pr || py < -pr || py > lh + pr) return;
      const g = lctx.createRadialGradient(px, py, 1, px, py, pr);
      g.addColorStop(0, `rgba(0,0,0,${intensity})`);
      g.addColorStop(0.55, `rgba(0,0,0,${intensity * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath(); lctx.arc(px, py, pr, 0, Math.PI * 2); lctx.fill();
    };

    punch(pl.x, pl.y, pl.derived.lightRad, 1);
    for (const l of map.lights) {
      const fl = l.flick ? 0.85 + Math.sin(t * 11 + l.x * 7 + l.y * 13) * 0.15 : 1;
      punch(l.x, l.y, l.r * fl, 0.95);
    }
    for (const p of G.projs) punch(p.x, p.y, 2.2, 0.8);
    for (const f of G.flashes) punch(f.x, f.y, f.r * 2, f.t / f.maxT);
    const ppL = G.portalOnMap(map);
    if (ppL) punch(ppL.x, ppL.y, 4, 1);

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
      if (sx < -200 || sx > this.W + 200 || sy < -200 || sy > this.H + 200) return;
      const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, r * ISO_X);
      g.addColorStop(0, U.rgba(color, a));
      g.addColorStop(1, U.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r * ISO_X, 0, Math.PI * 2); ctx.fill();
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

  drawShadow(ctx, x, y, size) {
    const [sx, sy] = this.worldToScreen(x, y);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 2, 11 * size, 5 * size, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  drawActor(ctx, m, t) {
    const [sx, sy] = this.worldToScreen(m.x, m.y);
    if (sx < -80 || sx > this.W + 80 || sy < -100 || sy > this.H + 100) return;
    const sheet = Sprites.getActor(m.boss ? m.bossKey : m.fam === 'trap' ? null : m.fam);
    if (!m.fly) this.drawShadow(ctx, m.x, m.y, m.size * 0.9);

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
    this.drawShadow(ctx, pl.x, pl.y, 1);
    const [sx, sy] = this.worldToScreen(pl.x, pl.y);
    const dir = this.dirIndex(pl.dir);
    let frame;
    if (pl.attackT > 0) frame = pl.attackT > 0.15 ? 4 : 5;
    else if (pl.moving) frame = Math.floor(t * 9) % 4;
    else frame = 0;
    const C = sheet.cell;
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
    }
    ctx.restore();
    // torch flames on wall torch lights are particles below
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
    if (sx < -60 || sx > this.W + 60 || sy < -60 || sy > this.H + 60) return;
    gi.popZ = Math.max(0, (gi.popZ === undefined ? 20 : gi.popZ) - 60 * (1 / 60));
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
