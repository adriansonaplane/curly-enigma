// ============ DIABLOID: sprites.js — pre-rendered sprite sheet baker ============
// All actors, tiles and icons are procedurally painted ONCE into offscreen
// canvases at load time ("pre-rendered"), then blitted every frame.
'use strict';

const Sprites = {
  actors: {},   // key -> {canvas, cell, dirs, frames}
  tiles: {},    // theme -> {floors:[], wall, lava:[2], water}
  icons: {},    // skill id -> canvas
  itemIcons: new Map(),

  CELL: 72, DIRS: 8, FRAMES: 6,

  // ======================= ACTORS =======================
  getActor(key) {
    if (!this.actors[key]) this.actors[key] = this.bakeActor(key);
    return this.actors[key];
  },

  bakeActor(key) {
    let def, hero = null;
    const cls = CLASSES.find(c => c.id === key);
    if (cls) { hero = cls; def = { body: 'humanoid', pal: { main: cls.pal.cloth, dark: U.shade(cls.pal.cloth, 0.5), eye: '#fff' }, size: 1 }; }
    else if (MONSTERS[key]) def = MONSTERS[key];
    else if (BOSSES[key]) def = BOSSES[key];
    else if (NPCS.find(n => n.id === key)) { const n = NPCS.find(x => x.id === key); hero = n; def = { body: 'humanoid', pal: { main: n.pal.cloth, dark: U.shade(n.pal.cloth, 0.5), eye: '#fff' }, size: 1 }; }
    else def = { body: 'blob', pal: { main: '#f0f', dark: '#a0a', eye: '#fff' }, size: 1 };

    const C = this.CELL;
    const cv = document.createElement('canvas');
    cv.width = C * this.FRAMES; cv.height = C * this.DIRS;
    const ctx = cv.getContext('2d');
    for (let d = 0; d < this.DIRS; d++) {
      const ang = d * Math.PI / 4;
      for (let f = 0; f < this.FRAMES; f++) {
        ctx.save();
        ctx.translate(f * C + C / 2, d * C + C * 0.62);
        const walk = f < 4 ? f / 4 : 0;
        const atk = f >= 4 ? (f === 4 ? 0.35 : 0.85) : -1;
        this.drawBody(ctx, def, hero, ang, walk, atk);
        ctx.restore();
      }
    }
    return { canvas: cv, cell: C };
  },

  drawBody(ctx, def, hero, ang, walk, atk) {
    const p = def.pal;
    const s = 16; // base scale in px
    switch (def.body) {
      case 'humanoid': case 'skeleton': case 'brute': this.drawHumanoid(ctx, def, hero, ang, walk, atk, s); break;
      case 'blob': this.drawBlob(ctx, p, ang, walk, s); break;
      case 'spider': this.drawSpider(ctx, p, ang, walk, s, def.quad); break;
      case 'bat': this.drawBat(ctx, p, ang, walk, s); break;
      case 'serpent': this.drawSerpent(ctx, p, ang, walk, s); break;
      case 'ghost': this.drawGhost(ctx, p, ang, walk, s); break;
    }
  },

  drawHumanoid(ctx, def, hero, ang, walk, atk, s) {
    const p = def.pal;
    const thin = def.body === 'skeleton';
    const brute = def.body === 'brute';
    const bw = brute ? 1.45 : thin ? 0.7 : 1.0;      // width factor
    const swing = Math.sin(walk * Math.PI * 2);
    const dx = Math.cos(ang), dy = Math.sin(ang) * 0.5;

    // legs
    ctx.strokeStyle = thin ? p.main : U.shade(p.dark || p.main, 0.8);
    ctx.lineWidth = thin ? 2.5 : 4.5 * bw;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const ph = swing * side * 4;
      ctx.beginPath();
      ctx.moveTo(side * 4 * bw, -6);
      ctx.lineTo(side * 4.5 * bw + dx * ph, 8 + Math.abs(ph) * -0.3);
      ctx.stroke();
    }
    // torso
    const armor = hero ? (hero.pal ? hero.pal.armor : p.main) : p.main;
    const grd = ctx.createLinearGradient(-8, -22, 8, 0);
    grd.addColorStop(0, U.shade(armor, 1.25)); grd.addColorStop(1, U.shade(armor, 0.6));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, -13, (thin ? 4.5 : 7.5) * bw, 10.5 * (brute ? 1.15 : 1), 0, 0, Math.PI * 2);
    ctx.fill();
    if (thin) { // ribs
      ctx.strokeStyle = U.shade(p.main, 0.75); ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-4, -17 + i * 4); ctx.lineTo(4, -17 + i * 4); ctx.stroke(); }
    }
    if (brute) { // shoulders
      ctx.fillStyle = U.shade(armor, 0.85);
      ctx.beginPath(); ctx.ellipse(-9 * bw, -20, 5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9 * bw, -20, 5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // head
    const skin = hero && hero.pal ? hero.pal.skin : (thin ? p.main : U.shade(p.main, 1.15));
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(dx * 2.5, -27 - (brute ? 2 : 0), thin ? 4.5 : 5.5, 0, Math.PI * 2); ctx.fill();
    if (hero && hero.pal && hero.pal.hair) {
      ctx.fillStyle = hero.pal.hair;
      ctx.beginPath(); ctx.arc(dx * 2.5, -29, 5.2, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    }
    // eyes (monsters glow)
    if (!hero) {
      ctx.fillStyle = p.eye;
      ctx.shadowColor = p.eye; ctx.shadowBlur = 4;
      ctx.fillRect(dx * 3 - 3, -29, 2, 2); ctx.fillRect(dx * 3 + 1.5, -29, 2, 2);
      ctx.shadowBlur = 0;
    }
    // weapon arm
    const wAng = atk >= 0 ? ang + (atk - 0.5) * 2.4 : ang + swing * 0.25;
    const hx = Math.cos(wAng), hy = Math.sin(wAng) * 0.55;
    ctx.strokeStyle = skin; ctx.lineWidth = thin ? 2.2 : 3.4 * bw;
    ctx.beginPath(); ctx.moveTo(hx * 5, -16); ctx.lineTo(hx * 12, -13 + hy * 6); ctx.stroke();
    this.drawHeldWeapon(ctx, hero, def, hx * 12, -13 + hy * 6, wAng, atk);
    // trim glow for heroes
    if (hero && hero.pal && hero.pal.trim) {
      ctx.strokeStyle = U.rgba(hero.pal.trim, 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, -13, 7.5, 10.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
  },

  drawHeldWeapon(ctx, hero, def, x, y, ang, atk) {
    const wtype = hero && hero.weapon ? hero.weapon : (def.ai === 'ranged' ? 'bow' : 'sword');
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    switch (wtype) {
      case 'staff': case 'wand':
        ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, -14); ctx.stroke();
        ctx.fillStyle = hero && hero.pal ? hero.pal.trim : '#c07bff';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(4, -14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; break;
      case 'bow': case 'crossbow':
        ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(0, 0, 8, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#d8d2be'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(8 * Math.cos(-1.2), 8 * Math.sin(-1.2)); ctx.lineTo(8 * Math.cos(1.2), 8 * Math.sin(1.2)); ctx.stroke();
        break;
      case 'dagger': case 'claw':
        ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -2); ctx.stroke(); break;
      case 'axe':
        ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(8, -8); ctx.stroke();
        ctx.fillStyle = '#b8bcc4';
        ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(13, -4); ctx.lineTo(6, -1); ctx.closePath(); ctx.fill(); break;
      case 'mace':
        ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(7, -7); ctx.stroke();
        ctx.fillStyle = '#9ba0a8'; ctx.beginPath(); ctx.arc(8, -8, 3.5, 0, Math.PI * 2); ctx.fill(); break;
      default: // sword/spear
        ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -4); ctx.stroke();
        ctx.strokeStyle = '#8a6b31'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(4, -3); ctx.stroke();
    }
    ctx.restore();
  },

  drawBlob(ctx, p, ang, walk, s) {
    const sq = 1 + Math.sin(walk * Math.PI * 2) * 0.12;
    const grd = ctx.createRadialGradient(-3, -10, 2, 0, -8, 14);
    grd.addColorStop(0, U.shade(p.main, 1.3)); grd.addColorStop(1, p.dark);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(0, -8, 11 / sq, 10 * sq, 0, 0, Math.PI * 2); ctx.fill();
    // warts
    ctx.fillStyle = U.shade(p.main, 0.8);
    ctx.beginPath(); ctx.arc(-5, -13, 2.2, 0, Math.PI * 2); ctx.arc(4, -6, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(-3, -11, 1.6, 0, Math.PI * 2); ctx.arc(3, -11, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  drawSpider(ctx, p, ang, walk, s, quad) {
    ctx.rotate(ang + Math.PI / 2);
    const legN = quad ? 2 : 4;
    ctx.strokeStyle = p.dark; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < legN; i++) {
      const t = (i / (legN - 1) - 0.5) * 1.6;
      const ph = Math.sin(walk * Math.PI * 2 + i * 1.7) * 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 4, t * 8 - 6);
        ctx.quadraticCurveTo(side * 12, t * 8 - 9 + ph, side * 15, t * 8 - 2 + ph);
        ctx.stroke();
      }
    }
    const grd = ctx.createRadialGradient(-2, -8, 1, 0, -6, 12);
    grd.addColorStop(0, U.shade(p.main, 1.35)); grd.addColorStop(1, p.dark);
    ctx.fillStyle = grd;
    if (quad) { // wolf-ish: elongated
      ctx.beginPath(); ctx.ellipse(0, -4, 6.5, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -15, 4.5, 0, Math.PI * 2); ctx.fill(); // head
      // ears
      ctx.beginPath(); ctx.moveTo(-3, -18); ctx.lineTo(-4.5, -23); ctx.lineTo(-1, -19.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, -18); ctx.lineTo(4.5, -23); ctx.lineTo(1, -19.5); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(0, -2, 8, 9.5, 0, 0, Math.PI * 2); ctx.fill();     // abdomen
      ctx.beginPath(); ctx.arc(0, -12, 5, 0, Math.PI * 2); ctx.fill();                // head
    }
    ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(-2, -14, 1.3, 0, Math.PI * 2); ctx.arc(2, -14, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  drawBat(ctx, p, ang, walk, s) {
    const flap = Math.sin(walk * Math.PI * 4) * 0.8;
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = p.main;
    for (const side of [-1, 1]) {  // wings
      ctx.save(); ctx.rotate(side * (0.4 + flap * 0.5));
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(side * 16, -16, side * 18, -2);
      ctx.quadraticCurveTo(side * 10, -4, 0, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = p.dark;
    ctx.beginPath(); ctx.ellipse(0, -5, 4.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(-1.5, -8, 1.2, 0, Math.PI * 2); ctx.arc(1.5, -8, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  drawSerpent(ctx, p, ang, walk, s) {
    ctx.rotate(ang + Math.PI / 2);
    const wig = Math.sin(walk * Math.PI * 2) * 4;
    ctx.strokeStyle = p.main; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wig, 10);
    ctx.quadraticCurveTo(-wig, 2, wig * 0.5, -4);
    ctx.quadraticCurveTo(-wig * 0.4, -10, 0, -14);
    ctx.stroke();
    ctx.strokeStyle = p.dark; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(wig, 10); ctx.quadraticCurveTo(-wig, 2, wig * 0.5, -4); ctx.stroke();
    // head + hood
    ctx.fillStyle = p.main;
    ctx.beginPath(); ctx.ellipse(0, -16, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(-2.2, -17, 1.3, 0, Math.PI * 2); ctx.arc(2.2, -17, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  drawGhost(ctx, p, ang, walk, s) {
    const bob = Math.sin(walk * Math.PI * 2) * 2;
    ctx.globalAlpha = 0.82;
    const grd = ctx.createLinearGradient(0, -28, 0, 6);
    grd.addColorStop(0, U.shade(p.main, 1.2)); grd.addColorStop(1, U.rgba(p.dark, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-9, 4 + bob);
    ctx.quadraticCurveTo(-11, -14 + bob, 0, -24 + bob);
    ctx.quadraticCurveTo(11, -14 + bob, 9, 4 + bob);
    // wavy hem
    for (let i = 3; i >= -3; i--) ctx.quadraticCurveTo(i * 3 + 1.5, 8 + bob + (i % 2 ? -3 : 0), i * 3, 4 + bob);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(-3, -16 + bob, 1.8, 0, Math.PI * 2); ctx.arc(3, -16 + bob, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  },

  // ======================= TILES =======================
  getTiles(theme) {
    if (!this.tiles[theme]) this.tiles[theme] = this.bakeTiles(theme);
    return this.tiles[theme];
  },

  bakeTiles(theme) {
    const th = THEMES[theme];
    const rng = makeRng(hashStr(theme));
    const W = 64, H = 32, WALL_H = 40;
    const out = { floors: [], wall: null, lava: [], gas: null, spikes: null };

    for (let v = 0; v < 4; v++) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      this.diamond(ctx, W, H);
      const base = v % 2 ? th.floorAlt : th.floor;
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, U.shade(base, 1.12)); grd.addColorStop(1, U.shade(base, 0.88));
      ctx.fillStyle = grd; ctx.fill();
      ctx.save(); ctx.clip();
      for (let i = 0; i < 26; i++) { // speckle texture
        ctx.fillStyle = U.rgba(U.shade(base, rng() < 0.5 ? 0.72 : 1.3), 0.5);
        ctx.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 1.5);
      }
      // cracks
      if (rng() < 0.7) {
        ctx.strokeStyle = U.rgba(U.shade(base, 0.55), 0.8); ctx.lineWidth = 0.8;
        ctx.beginPath();
        let x = rng() * W, y = rng() * H; ctx.moveTo(x, y);
        for (let i = 0; i < 3; i++) { x += (rng() - 0.5) * 18; y += (rng() - 0.5) * 9; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
      this.diamond(ctx, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 1; ctx.stroke();
      out.floors.push(cv);
    }

    { // wall block: top diamond + two faces
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H + WALL_H;
      const ctx = cv.getContext('2d');
      // left face
      ctx.fillStyle = U.shade(th.wall, 0.8);
      ctx.beginPath(); ctx.moveTo(0, H / 2 + WALL_H); ctx.lineTo(0, H / 2); ctx.lineTo(W / 2, H); ctx.lineTo(W / 2, H + WALL_H); ctx.closePath(); ctx.fill();
      // right face
      ctx.fillStyle = U.shade(th.wall, 0.55);
      ctx.beginPath(); ctx.moveTo(W, H / 2 + WALL_H); ctx.lineTo(W, H / 2); ctx.lineTo(W / 2, H); ctx.lineTo(W / 2, H + WALL_H); ctx.closePath(); ctx.fill();
      // brick lines on faces
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const yy = H / 2 + i * WALL_H / 4;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W / 2, yy + H / 2); ctx.lineTo(W, yy); ctx.stroke();
      }
      // top
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, U.shade(th.wallTop, 1.15)); grd.addColorStop(1, U.shade(th.wallTop, 0.8));
      this.diamond(ctx, W, H);
      ctx.fillStyle = grd; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
      out.wall = cv;
      out.wallH = WALL_H;
    }

    // lava (2 animation frames)
    for (let f = 0; f < 2; f++) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      this.diamond(ctx, W, H);
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#ff9a2f'); grd.addColorStop(0.5, '#e04808'); grd.addColorStop(1, '#7a1400');
      ctx.fillStyle = grd; ctx.fill();
      ctx.save(); ctx.clip();
      const lrng = makeRng(900 + f * 7);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = U.rgba(f ? '#ffd94f' : '#ff7a2f', 0.75);
        const x = lrng() * W, y = lrng() * H;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + lrng() * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(30,4,0,0.55)';
      for (let i = 0; i < 4; i++) { // dark crust
        const x = lrng() * W, y = lrng() * H;
        ctx.beginPath(); ctx.ellipse(x, y, 5 + lrng() * 6, 2.5 + lrng() * 3, lrng(), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      out.lava.push(cv);
    }

    { // spike trap plate
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      this.diamond(ctx, W, H);
      ctx.fillStyle = U.shade(th.floor, 0.6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      ctx.fillStyle = U.shade(th.floor, 0.4);
      for (const [hx, hy] of [[0.5, 0.28], [0.32, 0.5], [0.68, 0.5], [0.5, 0.72]]) {
        ctx.beginPath(); ctx.ellipse(hx * W, hy * H, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      out.spikes = cv;
    }

    { // gas vent
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      this.diamond(ctx, W, H);
      ctx.fillStyle = U.shade(th.floor, 0.7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      ctx.fillStyle = '#0c1206';
      ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = U.rgba('#8ef04a', 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      out.gas = cv;
    }
    return out;
  },

  diamond(ctx, W, H) {
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W, H / 2); ctx.lineTo(W / 2, H); ctx.lineTo(0, H / 2);
    ctx.closePath();
  },

  // ======================= SKILL ICONS =======================
  skillIcon(sk, size = 44) {
    const key = sk.id + '_' + size;
    if (this.icons[key]) return this.icons[key];
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const col = ELEM[sk.elem] ? ELEM[sk.elem].color : '#cfcfcf';
    const grd = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size * 0.7);
    grd.addColorStop(0, U.shade('#221a10', 1.6)); grd.addColorStop(1, '#0a0704');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = U.rgba(col, 0.9); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.fillStyle = U.rgba(col, 0.85);
    ctx.shadowColor = col; ctx.shadowBlur = 6;
    const c = size / 2, r = size * 0.3;
    ctx.save(); ctx.translate(c, c);
    switch (sk.arch) {
      case 'strike': ctx.beginPath(); ctx.moveTo(-r, r * 0.7); ctx.lineTo(r, -r); ctx.moveTo(-r * 0.5, r); ctx.lineTo(r * 0.9, -r * 0.3); ctx.stroke(); break;
      case 'slam': for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(0, 0, r * i * 0.55, 0, Math.PI * 2); ctx.stroke(); } break;
      case 'proj': ctx.beginPath(); ctx.moveTo(-r, r * 0.6); ctx.lineTo(r * 0.8, -r * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r, -r * 0.75); ctx.lineTo(r * 0.15, -r * 0.65); ctx.lineTo(r * 0.9, 0); ctx.closePath(); ctx.fill(); break;
      case 'nova': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); } break;
      case 'beam': ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-r, r * 0.8); ctx.lineTo(r, -r * 0.8); ctx.stroke(); break;
      case 'meteor': ctx.beginPath(); ctx.arc(r * 0.3, r * 0.35, r * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r + i * 4, -r + i * 2); ctx.lineTo(r * 0.1 + i * 4, r * 0.1 + i * 2); ctx.stroke(); } break;
      case 'chain': ctx.beginPath(); ctx.moveTo(-r, -r * 0.5); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(-r * 0.5, r * 0.15); ctx.lineTo(r * 0.4, r * 0.05); ctx.lineTo(r * 0.1, r * 0.5); ctx.lineTo(r, r * 0.3); ctx.stroke(); break;
      case 'summon': ctx.beginPath(); ctx.arc(0, -r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0a0704'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.3, r * 0.14, 0, Math.PI * 2); ctx.arc(r * 0.22, -r * 0.3, r * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.rgba(col, 0.85);
        ctx.fillRect(-r * 0.4, r * 0.3, r * 0.8, r * 0.16); ctx.fillRect(-r * 0.08, r * 0.1, r * 0.16, r * 0.55); break;
      case 'trap': ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.7); ctx.lineTo(-r * 0.9, r * 0.7); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.18, 0, Math.PI * 2); ctx.fill(); break;
      case 'storm': ctx.beginPath(); ctx.ellipse(0, -r * 0.4, r * 0.85, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.3, 0); ctx.lineTo(0, r * 0.35); ctx.lineTo(-r * 0.15, r * 0.4); ctx.lineTo(r * 0.25, r * 0.95); ctx.stroke(); break;
      case 'buff': ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(0, -r * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.15); ctx.lineTo(0, -r); ctx.lineTo(r * 0.55, -r * 0.15); ctx.stroke(); break;
      case 'curse': ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.45); ctx.lineTo(r * 0.45, r * 0.45); ctx.moveTo(r * 0.45, -r * 0.45); ctx.lineTo(-r * 0.45, r * 0.45); ctx.stroke(); break;
      case 'dash': for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r + i * r * 0.55, -r * 0.5); ctx.lineTo(-r * 0.45 + i * r * 0.55, 0); ctx.lineTo(-r + i * r * 0.55, r * 0.5); ctx.stroke(); } break;
      case 'passive': ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill(); break;
      case 'heal': ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.8, 0); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // frame
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#4a3a1c'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
    this.icons[key] = cv;
    return cv;
  },

  // ======================= ITEM ICONS =======================
  itemIcon(item, size = 44) {
    const key = (item.iconKey || (item.type + '_' + item.rarity)) + '_' + size;
    if (this.itemIcons.has(key)) return this.itemIcons.get(key);
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    const rc = Items.rarityColor(item.rarity);
    ctx.save(); ctx.translate(size / 2, size / 2);
    const s = size / 44;
    ctx.scale(s, s); ctx.lineCap = 'round';
    const metal = '#b8bcc4', wood = '#7a5a34', glowIf = (item.rarity !== 'common');
    if (glowIf) { ctx.shadowColor = rc; ctx.shadowBlur = 7; }
    switch (item.type) {
      case 'sword': ctx.strokeStyle = metal; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(10, -12); ctx.stroke();
        ctx.strokeStyle = '#8a6b31'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-11, 5); ctx.lineTo(-4, 12); ctx.stroke(); break;
      case 'axe': ctx.strokeStyle = wood; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-9, 13); ctx.lineTo(7, -9); ctx.stroke();
        ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(4, -13); ctx.lineTo(15, -4); ctx.lineTo(2, -1); ctx.closePath(); ctx.fill(); break;
      case 'mace': ctx.strokeStyle = wood; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-8, 13); ctx.lineTo(5, -6); ctx.stroke();
        ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(8, -9, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7c8088'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.arc(8 + Math.cos(a) * 7.5, -9 + Math.sin(a) * 7.5, 1.5, 0, Math.PI * 2); ctx.fill(); } break;
      case 'dagger': ctx.strokeStyle = metal; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-5, 7); ctx.lineTo(8, -9); ctx.stroke();
        ctx.strokeStyle = '#8a6b31'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-2, 9); ctx.stroke(); break;
      case 'spear': ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 13); ctx.lineTo(8, -8); ctx.stroke();
        ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(13, -13); ctx.lineTo(11, -4); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill(); break;
      case 'claw': ctx.strokeStyle = metal; ctx.lineWidth = 2.5;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 5 - 3, 10); ctx.quadraticCurveTo(i * 5 + 2, -2, i * 5, -11); ctx.stroke(); } break;
      case 'bow': ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-2, 0, 13, -1.25, 1.25); ctx.stroke();
        ctx.strokeStyle = '#d8d2be'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2 + 13 * Math.cos(-1.25), 13 * Math.sin(-1.25)); ctx.lineTo(-2 + 13 * Math.cos(1.25), 13 * Math.sin(1.25)); ctx.stroke(); break;
      case 'crossbow': ctx.strokeStyle = wood; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(0, -8); ctx.stroke();
        ctx.strokeStyle = metal; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -9, 11, Math.PI * 0.15, Math.PI * 0.85, false); ctx.stroke(); break;
      case 'wand': ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 11); ctx.lineTo(6, -8); ctx.stroke();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(7, -10, 4, 0, Math.PI * 2); ctx.fill(); break;
      case 'staff': ctx.strokeStyle = wood; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-8, 14); ctx.lineTo(6, -10); ctx.stroke();
        ctx.strokeStyle = rc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, -12, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(7, -12, 2.4, 0, Math.PI * 2); ctx.fill(); break;
      case 'helm': ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(0, -1, 11, Math.PI, 0); ctx.lineTo(11, 8); ctx.lineTo(-11, 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3a3e46'; ctx.fillRect(-8, 1, 16, 4); break;
      case 'chest': ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(-11, -10); ctx.lineTo(11, -10); ctx.lineTo(13, -2); ctx.lineTo(9, 13); ctx.lineTo(-9, 13); ctx.lineTo(-13, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7c8088'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 13); ctx.stroke(); break;
      case 'gloves': ctx.fillStyle = metal;
        ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(-3, -6); ctx.quadraticCurveTo(0, -13, 6, -9); ctx.lineTo(8, 13); ctx.closePath(); ctx.fill();
        ctx.fillRect(-10, -4, 6, 8); break;
      case 'boots': ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(3, -12); ctx.lineTo(3, 4); ctx.lineTo(12, 8); ctx.lineTo(12, 13); ctx.lineTo(-6, 13); ctx.closePath(); ctx.fill(); break;
      case 'belt': ctx.strokeStyle = '#6a4a26'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-14, 3); ctx.quadraticCurveTo(0, -4, 14, 3); ctx.stroke();
        ctx.fillStyle = '#c9a44f'; ctx.fillRect(-4, -5, 9, 9); ctx.fillStyle = '#0a0704'; ctx.fillRect(-1.5, -2.5, 4, 4); break;
      case 'shield': ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(11, -8); ctx.lineTo(9, 5); ctx.quadraticCurveTo(5, 12, 0, 14); ctx.quadraticCurveTo(-5, 12, -9, 5); ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rc; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); break;
      case 'orb': ctx.fillStyle = rc; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-3.5, -4, 3.2, 0, Math.PI * 2); ctx.fill(); break;
      case 'ring': ctx.strokeStyle = '#c9a44f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(0, -7, 3.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'amulet': ctx.strokeStyle = '#c9a44f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -6, 9, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
        ctx.fillStyle = rc; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 7); ctx.lineTo(0, 14); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); break;
      case 'potion_hp': case 'potion_mp':
        ctx.fillStyle = item.type === 'potion_hp' ? '#c0301c' : '#2a52e0';
        ctx.beginPath(); ctx.arc(0, 4, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-3, -10, 6, 8); ctx.fillStyle = '#7a5a34'; ctx.fillRect(-3.5, -12, 7, 3); break;
      case 'gold': ctx.fillStyle = '#ffd94f';
        for (const [gx, gy] of [[-5, 4], [4, 5], [0, -1], [-2, 8], [6, -2]]) { ctx.beginPath(); ctx.ellipse(gx, gy, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#a08018'; ctx.lineWidth = 0.8; ctx.stroke(); } break;
      default: ctx.fillStyle = rc; ctx.fillRect(-8, -8, 16, 16);
    }
    ctx.restore();
    this.itemIcons.set(key, cv);
    return cv;
  },
};
