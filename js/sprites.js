// ============ DIABLOID: sprites.js — pre-rendered sprite sheet baker ============
// All actors, tiles and icons are procedurally painted ONCE into offscreen
// canvases at load time ("pre-rendered"), then blitted every frame.
'use strict';

const Sprites = {
  actors: {},   // key -> {canvas, cell, dirs, frames}
  tiles: {},    // theme -> {floors:[], wall, lava:[2], water}
  icons: {},    // skill id -> canvas
  itemIcons: new Map(),

  CELL: 72, DIRS: 8, FRAMES: 10,

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
        const walk = f < 6 ? f / 6 : 0;                  // 6-frame gait cycle
        const atk = f >= 6 ? (f - 6) / 3 : -1;            // 4-frame attack arc
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

  // Humanoids bake through the shared jointed Figure so monsters, NPCs and
  // heroes all move on the same skeleton.
  drawHumanoid(ctx, def, hero, ang, walk, atk, s) {
    const p = def.pal;
    const build = def.body === 'skeleton' ? 'thin' : def.body === 'brute' ? 'brute' : 'normal';
    const dirIdx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const st = atk >= 0
      ? { anim: 'attack', phase: atk }
      : { anim: 'walk', phase: walk };
    const pal = {
      skin: hero && hero.pal ? hero.pal.skin : (build === 'thin' ? p.main : U.shade(p.main, 1.15)),
      cloth: hero && hero.pal ? hero.pal.cloth : p.main,
      armor: hero && hero.pal ? hero.pal.armor : p.main,
      trim: hero && hero.pal ? hero.pal.trim : null,
      hair: hero && hero.pal ? hero.pal.hair : null,
      eye: p.eye,
    };
    const wtype = hero && hero.weapon ? hero.weapon : (def.ai === 'ranged' ? 'bow' : def.ai === 'caster' || def.ai === 'summoner' ? 'staff' : 'sword');
    const eq = {
      weapon: wtype,
      wMetal: build === 'thin' ? '#b0aa98' : '#c8ccd4',
      wOrb: hero && hero.pal ? hero.pal.trim : (p.eye || '#c07bff'),
      helm: !!(def.helm || build === 'brute'),
      helmCol: U.shade(p.main, 0.85),
      helmHorns: build === 'brute',
      chestPlate: !!hero,
      glowEyes: !hero,
    };
    Figure.draw(ctx, { pose: Figure.pose(st), pal, eq, dir: dirIdx, build });
    // monsters get glowing eyes on top of the head
    if (!hero) {
      const P = Figure.P;
      const fxc = Math.cos(dirIdx * Math.PI / 4);
      if (Math.sin(dirIdx * Math.PI / 4) <= 0.35) {
        ctx.save();
        ctx.fillStyle = p.eye; ctx.shadowColor = p.eye; ctx.shadowBlur = 5;
        ctx.fillRect(fxc * 1.6 - 2.4 + fxc * 1.2, P.headY - 1.2, 1.6, 1.6);
        ctx.fillRect(fxc * 1.6 + 1.0 + fxc * 1.2, P.headY - 1.2, 1.6, 1.6);
        ctx.restore();
      }
    }
  },

  drawHumanoidLegacy(ctx, def, hero, ang, walk, atk, s) {
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
  // Baked at SSx supersample ("high-resolution textures") and blitted back at
  // logical 64x32, so the dpr-scaled main canvas gets genuine subpixel detail.
  // On dpr=1 displays the extra pixels can't be seen anyway, so bake at 1x and
  // keep the fast unscaled-blit path.
  SS: (typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.5) ? 2 : 1,
  getTiles(theme) {
    if (!this.tiles[theme]) this.tiles[theme] = this.bakeTiles(theme);
    return this.tiles[theme];
  },

  mkTile(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w * this.SS; cv.height = h * this.SS;
    const ctx = cv.getContext('2d');
    ctx.scale(this.SS, this.SS);
    return [cv, ctx];
  },

  // soft organic mottling (call inside a clip)
  mottle(ctx, rng, W, H, base, n) {
    for (let i = 0; i < n; i++) {
      const x = rng() * W, y = rng() * H, r = 3 + rng() * 9;
      const f = rng() < 0.35 ? U.rf(rng, 1.08, 1.28) : U.rf(rng, 0.6, 0.92);
      const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
      g.addColorStop(0, U.rgba(U.shade(base, f), 0.32));
      g.addColorStop(1, U.rgba(U.shade(base, f), 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  },

  // masonry seams per theme, drawn clipped inside the floor diamond
  floorPattern(ctx, rng, W, H, base, pattern) {
    const seam = U.rgba(U.shade(base, 0.45), 0.7);
    const lite = U.rgba(U.shade(base, 1.35), 0.28);
    ctx.lineWidth = 1;
    if (pattern === 'slab') {
      // four sub-slabs: seams connecting edge midpoints, lightly jittered
      const j = () => U.rf(rng, -1.5, 1.5);
      ctx.strokeStyle = seam;
      ctx.beginPath(); ctx.moveTo(16 + j(), 8 + j() / 2); ctx.lineTo(48 + j(), 24 + j() / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(48 + j(), 8 + j() / 2); ctx.lineTo(16 + j(), 24 + j() / 2); ctx.stroke();
      ctx.strokeStyle = lite;
      ctx.beginPath(); ctx.moveTo(17, 9.2); ctx.lineTo(49, 25.2); ctx.stroke();
    } else if (pattern === 'brick') {
      ctx.strokeStyle = seam;
      for (const y0 of [-8, 0, 8, 16]) { // courses parallel to the NE edge
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(64, y0 + 32); ctx.stroke();
      }
      for (let k = 0; k < 5; k++) {      // staggered head joints
        const tt = U.rf(rng, 0.15, 0.85);
        const y0 = U.pick(rng, [-8, 0, 8, 16]);
        const x = tt * 64, y = y0 + tt * 32;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4.5, y - 2.25); ctx.stroke();
      }
    } else if (pattern === 'cobble') {
      for (let i = 0; i < 11; i++) {
        const x = U.rf(rng, 6, W - 6), y = U.rf(rng, 4, H - 4);
        const rx = U.rf(rng, 3, 6), ry = rx * 0.55;
        const f = U.rf(rng, 0.85, 1.2);
        const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 0.5, x, y, rx);
        g.addColorStop(0, U.shade(base, f * 1.18)); g.addColorStop(1, U.shade(base, f * 0.78));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, U.rf(rng, -0.4, 0.4), 0, Math.PI * 2); ctx.fill();
      }
    } else if (pattern === 'cracked') {
      const j = () => U.rf(rng, -1.5, 1.5);
      ctx.strokeStyle = seam;
      ctx.beginPath(); ctx.moveTo(16 + j(), 8 + j() / 2); ctx.lineTo(48 + j(), 24 + j() / 2); ctx.stroke();
      for (let c = 0; c < 2; c++) {      // jagged fissures with heat underglow
        let x = U.rf(rng, 12, 52), y = U.rf(rng, 6, 26);
        ctx.save();
        ctx.strokeStyle = 'rgba(8,2,0,0.8)'; ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ff5a1c'; ctx.shadowBlur = 3;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 0; i < 4; i++) { x += U.rf(rng, -9, 9); y += U.rf(rng, -4.5, 4.5); ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.restore();
      }
    }
    // 'rough' = mottling only
  },

  bakeTiles(theme) {
    const th = THEMES[theme];
    const rng = makeRng(hashStr(theme));
    const W = 64, H = 32, WALL_H = 40;
    const out = { floors: [], wall: null, lava: [], water: [], gas: null, spikes: null,
                  vent: null, spore: null, ember: null };

    // ---- floors: 6 hi-res variants with per-theme masonry + moss ----
    for (let v = 0; v < 6; v++) {
      const [cv, ctx] = this.mkTile(W, H);
      this.diamond(ctx, W, H);
      const base = v % 2 ? th.floorAlt : th.floor;
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, U.shade(base, 1.12)); grd.addColorStop(1, U.shade(base, 0.88));
      ctx.fillStyle = grd; ctx.fill();
      ctx.save(); ctx.clip();
      this.mottle(ctx, rng, W, H, base, 7);
      this.floorPattern(ctx, rng, W, H, base, th.pattern);
      for (let i = 0; i < 30; i++) { // fine grit
        ctx.fillStyle = U.rgba(U.shade(base, rng() < 0.5 ? 0.65 : 1.35), 0.45);
        ctx.fillRect(rng() * W, rng() * H, 0.7 + rng() * 1.4, 0.6 + rng() * 1.1);
      }
      if (rng() < 0.6) { // hairline crack
        ctx.strokeStyle = U.rgba(U.shade(base, 0.5), 0.75); ctx.lineWidth = 0.7;
        ctx.beginPath();
        let x = rng() * W, y = rng() * H; ctx.moveTo(x, y);
        for (let i = 0; i < 3; i++) { x += (rng() - 0.5) * 18; y += (rng() - 0.5) * 9; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      if (th.moss && v >= 3) { // creeping growth on the later variants
        for (let i = 0; i < 3; i++) {
          const x = rng() * W, y = rng() * H, r = U.rf(rng, 3, 8);
          const g = ctx.createRadialGradient(x, y, 0.5, x, y, r);
          g.addColorStop(0, U.rgba(th.moss, 0.4)); g.addColorStop(1, U.rgba(th.moss, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
      // beveled edges: light catches the top faces, dark falls off the bottom
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W / 2, 0); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.moveTo(W, H / 2); ctx.lineTo(W / 2, H); ctx.lineTo(0, H / 2); ctx.stroke();
      out.floors.push(cv);
    }

    // ---- wall block: stone courses, per-block tint, moss & theme veins ----
    {
      const [cv, ctx] = this.mkTile(W, H + WALL_H);
      const faces = [
        { pts: [[0, H / 2], [W / 2, H], [W / 2, H + WALL_H], [0, H / 2 + WALL_H]], shade: 0.82, sx: 0 },
        { pts: [[W / 2, H], [W, H / 2], [W, H / 2 + WALL_H], [W / 2, H + WALL_H]], shade: 0.55, sx: 1 },
      ];
      for (const face of faces) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(face.pts[0][0], face.pts[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(face.pts[i][0], face.pts[i][1]);
        ctx.closePath();
        const fg = ctx.createLinearGradient(0, H / 2, 0, H + WALL_H);
        fg.addColorStop(0, U.shade(th.wall, face.shade * 1.25));
        fg.addColorStop(1, U.shade(th.wall, face.shade * 0.72));
        ctx.fillStyle = fg; ctx.fill();
        ctx.clip();
        // stone blocks: 4 courses x 2 blocks, individually tinted
        const x0 = face.sx * W / 2, slope = face.sx ? -H / 2 : H / 2;
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 2; col++) {
            const bx = x0 + col * W / 4, by = (face.sx ? H : H / 2) + row * WALL_H / 4 + (face.sx ? 0 : 0);
            const f = U.rf(rng, 0.88, 1.12) * face.shade;
            ctx.fillStyle = U.rgba(U.shade(th.wall, f), 0.35);
            ctx.beginPath();
            ctx.moveTo(bx, by + col * slope / 2);
            ctx.lineTo(bx + W / 4, by + (col + 1) * slope / 2);
            ctx.lineTo(bx + W / 4, by + (col + 1) * slope / 2 + WALL_H / 4);
            ctx.lineTo(bx, by + col * slope / 2 + WALL_H / 4);
            ctx.closePath(); ctx.fill();
          }
        }
        // mortar seams
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const yy = (face.sx ? H : H / 2) + i * WALL_H / 4;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + W / 2, yy + slope); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x0 + W / 4, face.sx ? H * 0.75 : H * 0.75); ctx.lineTo(x0 + W / 4, H + WALL_H); ctx.stroke();
        // theme accents
        if (theme === 'hell') { // magma veins
          ctx.save(); ctx.strokeStyle = 'rgba(255,90,28,0.5)'; ctx.lineWidth = 0.9;
          ctx.shadowColor = '#ff5a1c'; ctx.shadowBlur = 4;
          let x = x0 + rng() * W / 2, y = H / 2 + 8 + rng() * 20;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let i = 0; i < 4; i++) { x += U.rf(rng, -7, 7); y += U.rf(rng, 2, 8); ctx.lineTo(x, y); }
          ctx.stroke(); ctx.restore();
        } else if (theme === 'cavern') { // mineral glints
          for (let i = 0; i < 5; i++) {
            ctx.fillStyle = U.rgba('#ffcf8f', U.rf(rng, 0.2, 0.5));
            ctx.fillRect(x0 + rng() * W / 2, H / 2 + rng() * (H / 2 + WALL_H), 1, 1);
          }
        }
        if (th.moss) { // damp growth creeping up from the floor line
          for (let i = 0; i < 4; i++) {
            const x = x0 + rng() * W / 2, y = H + WALL_H - rng() * 12;
            const g = ctx.createRadialGradient(x, y, 0.5, x, y, 5 + rng() * 5);
            g.addColorStop(0, U.rgba(th.moss, 0.32)); g.addColorStop(1, U.rgba(th.moss, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, 5 + rng() * 5, 0, Math.PI * 2); ctx.fill();
          }
        }
        // baked contact shadow at the base of the face
        const ag = ctx.createLinearGradient(0, H + WALL_H - 9, 0, H + WALL_H);
        ag.addColorStop(0, 'rgba(0,0,0,0)'); ag.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = ag; ctx.fillRect(0, H + WALL_H - 9, W, 9);
        ctx.restore();
      }
      // top slab
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, U.shade(th.wallTop, 1.15)); grd.addColorStop(1, U.shade(th.wallTop, 0.8));
      this.diamond(ctx, W, H);
      ctx.fillStyle = grd; ctx.fill();
      ctx.save(); this.diamond(ctx, W, H); ctx.clip();
      this.mottle(ctx, rng, W, H, th.wallTop, 6);
      ctx.restore();
      // rim light on the sky-facing edges
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W / 2, 0); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(W, H / 2); ctx.lineTo(W / 2, H); ctx.lineTo(0, H / 2); ctx.stroke();
      out.wall = cv;
      out.wallH = WALL_H;
    }

    // ---- rectangular side-face + top textures for the rotated camera path ----
    {
      const FW = 40, FH = 48;
      out.faceW = FW; out.faceH = FH;
      for (const side of ['L', 'R']) {
        const shade = side === 'L' ? 0.82 : 0.55;
        const c2 = document.createElement('canvas');
        c2.width = FW * this.SS; c2.height = FH * this.SS;
        const fx = c2.getContext('2d');
        fx.scale(this.SS, this.SS);
        const fg = fx.createLinearGradient(0, 0, 0, FH);
        fg.addColorStop(0, U.shade(th.wall, shade * 1.25));
        fg.addColorStop(1, U.shade(th.wall, shade * 0.72));
        fx.fillStyle = fg; fx.fillRect(0, 0, FW, FH);
        const frng = makeRng(hashStr(theme + side));
        for (let row = 0; row < 4; row++) {          // individually tinted blocks
          for (let col = 0; col < 2; col++) {
            fx.fillStyle = U.rgba(U.shade(th.wall, U.rf(frng, 0.88, 1.12) * shade), 0.35);
            fx.fillRect(col * FW / 2, row * FH / 4, FW / 2, FH / 4);
          }
        }
        fx.strokeStyle = 'rgba(0,0,0,0.35)'; fx.lineWidth = 1;
        for (let i = 1; i < 4; i++) { fx.beginPath(); fx.moveTo(0, i * FH / 4); fx.lineTo(FW, i * FH / 4); fx.stroke(); }
        fx.beginPath(); fx.moveTo(FW / 2, 0); fx.lineTo(FW / 2, FH); fx.stroke();
        if (theme === 'hell') {
          fx.save(); fx.strokeStyle = 'rgba(255,90,28,0.5)'; fx.lineWidth = 0.9;
          fx.shadowColor = '#ff5a1c'; fx.shadowBlur = 4;
          let x = frng() * FW, y = 6;
          fx.beginPath(); fx.moveTo(x, y);
          for (let i = 0; i < 4; i++) { x += U.rf(frng, -7, 7); y += U.rf(frng, 4, 11); fx.lineTo(x, y); }
          fx.stroke(); fx.restore();
        } else if (theme === 'cavern') {
          for (let i = 0; i < 6; i++) { fx.fillStyle = U.rgba('#ffcf8f', U.rf(frng, 0.2, 0.5)); fx.fillRect(frng() * FW, frng() * FH, 1, 1); }
        }
        if (th.moss) {
          for (let i = 0; i < 4; i++) {
            const x = frng() * FW, y = FH - frng() * 14, r = 5 + frng() * 5;
            const mg = fx.createRadialGradient(x, y, 0.5, x, y, r);
            mg.addColorStop(0, U.rgba(th.moss, 0.32)); mg.addColorStop(1, U.rgba(th.moss, 0));
            fx.fillStyle = mg;
            fx.beginPath(); fx.arc(x, y, r, 0, Math.PI * 2); fx.fill();
          }
        }
        const ag = fx.createLinearGradient(0, FH - 10, 0, FH);
        ag.addColorStop(0, 'rgba(0,0,0,0)'); ag.addColorStop(1, 'rgba(0,0,0,0.4)');
        fx.fillStyle = ag; fx.fillRect(0, FH - 10, FW, 10);
        out['face' + side] = c2;
      }
      const [tcv, tctx] = this.mkTile(W, H);
      const tg = tctx.createLinearGradient(0, 0, W, H);
      tg.addColorStop(0, U.shade(th.wallTop, 1.15)); tg.addColorStop(1, U.shade(th.wallTop, 0.8));
      this.diamond(tctx, W, H);
      tctx.fillStyle = tg; tctx.fill();
      tctx.save(); this.diamond(tctx, W, H); tctx.clip();
      this.mottle(tctx, rng, W, H, th.wallTop, 6);
      tctx.restore();
      tctx.lineWidth = 1.4;
      tctx.strokeStyle = 'rgba(255,255,255,0.16)';
      tctx.beginPath(); tctx.moveTo(0, H / 2); tctx.lineTo(W / 2, 0); tctx.lineTo(W, H / 2); tctx.stroke();
      tctx.strokeStyle = 'rgba(0,0,0,0.5)';
      tctx.beginPath(); tctx.moveTo(W, H / 2); tctx.lineTo(W / 2, H); tctx.lineTo(0, H / 2); tctx.stroke();
      out.wallTop = tcv;
      out.topFlat = U.shade(th.wallTop, 0.98);
    }

    // ---- lava: 4 frames of churning molten rock ----
    for (let f = 0; f < 4; f++) {
      const [cv, ctx] = this.mkTile(W, H);
      const ph = (f / 4) * Math.PI * 2;
      this.diamond(ctx, W, H);
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#ff9a2f'); grd.addColorStop(0.5, '#e04808'); grd.addColorStop(1, '#7a1400');
      ctx.fillStyle = grd; ctx.fill();
      ctx.save(); ctx.clip();
      const lrng = makeRng(900);
      for (let i = 0; i < 9; i++) { // convection cells that drift in a slow orbit
        const bx = lrng() * W, by = lrng() * H, orb = 2 + lrng() * 2.5;
        const x = bx + Math.cos(ph + i) * orb, y = by + Math.sin(ph + i * 1.7) * orb * 0.5;
        const r = 2 + lrng() * 3.5;
        const g = ctx.createRadialGradient(x, y, 0.3, x, y, r);
        g.addColorStop(0, U.rgba('#ffe98f', 0.95));
        g.addColorStop(0.5, U.rgba('#ff9a2f', 0.7));
        g.addColorStop(1, U.rgba('#ff9a2f', 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(30,4,0,0.55)';
      for (let i = 0; i < 4; i++) { // floating crust plates
        const bx = lrng() * W, by = lrng() * H;
        const x = bx + Math.cos(ph * 0.5 + i * 2) * 1.5, y = by + Math.sin(ph * 0.5 + i) * 0.8;
        ctx.beginPath(); ctx.ellipse(x, y, 5 + lrng() * 6, 2.5 + lrng() * 3, lrng(), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      out.lava.push(cv);
    }

    // ---- water: 3 frames of still, reflective liquid ----
    {
      const wcol = th.water || '#2c4a62';
      for (let f = 0; f < 3; f++) {
        const [cv, ctx] = this.mkTile(W, H);
        const ph = (f / 3) * Math.PI * 2;
        this.diamond(ctx, W, H);
        const grd = ctx.createLinearGradient(0, 0, W, H);
        grd.addColorStop(0, U.shade(wcol, 1.25)); grd.addColorStop(0.55, wcol); grd.addColorStop(1, U.shade(wcol, 0.5));
        ctx.fillStyle = grd; ctx.fill();
        ctx.save(); ctx.clip();
        // sheen where "light" strikes the surface
        const sg = ctx.createRadialGradient(W * 0.35, H * 0.3, 1, W * 0.35, H * 0.3, W * 0.4);
        sg.addColorStop(0, U.rgba(U.shade(wcol, 1.9), 0.35)); sg.addColorStop(1, U.rgba(wcol, 0));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(W * 0.35, H * 0.3, W * 0.4, 0, Math.PI * 2); ctx.fill();
        // slow ripple lines parallel to the iso grid
        ctx.strokeStyle = U.rgba(U.shade(wcol, 1.8), 0.4); ctx.lineWidth = 0.8;
        for (let k = 0; k < 3; k++) {
          const off = -6 + k * 10 + Math.sin(ph + k * 2) * 2.4;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 4) {
            const y = off + x / 2 + Math.sin(x * 0.25 + ph + k) * 1.1;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // glints
        const wr = makeRng(300 + f * 11);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 4; i++) ctx.fillRect(wr() * W, wr() * H, 1.6, 0.8);
        ctx.restore();
        // dark waterline edge
        this.diamond(ctx, W, H);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
        out.water.push(cv);
      }
    }

    { // spike trap plate
      const [cv, ctx] = this.mkTile(W, H);
      this.diamond(ctx, W, H);
      ctx.fillStyle = U.shade(th.floor, 0.6); ctx.fill();
      ctx.save(); ctx.clip();
      this.mottle(ctx, rng, W, H, U.shade(th.floor, 0.6), 4);
      ctx.restore();
      this.diamond(ctx, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = U.shade(th.floor, 0.38);
      for (const [hx, hy] of [[0.5, 0.28], [0.32, 0.5], [0.68, 0.5], [0.5, 0.72]]) {
        ctx.beginPath(); ctx.ellipse(hx * W, hy * H, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = U.shade(th.floor, 0.3);
      }
      out.spikes = cv;
    }

    { // gas vent
      const [cv, ctx] = this.mkTile(W, H);
      this.diamond(ctx, W, H);
      ctx.fillStyle = U.shade(th.floor, 0.7); ctx.fill();
      ctx.save(); ctx.clip();
      this.mottle(ctx, rng, W, H, U.shade(th.floor, 0.7), 4);
      ctx.restore();
      this.diamond(ctx, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      const vg = ctx.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, 10);
      vg.addColorStop(0, '#060a02'); vg.addColorStop(0.7, '#0c1206'); vg.addColorStop(1, U.shade(th.floor, 0.55));
      ctx.fillStyle = vg;
      ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = U.rgba('#8ef04a', 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 9, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      out.gas = cv;
    }

    // The three cycling vents share one plate: a cracked fissure with a
    // scorch halo, tinted per kind. Baked here rather than at draw time so a
    // level full of vents still costs one blit each.
    for (const [key, lip, halo] of [['vent', '#ff9a3f', '60,30,10'],
                                    ['spore', '#8ae8a0', '30,60,34'],
                                    ['ember', '#ff5a2f', '70,24,8']]) {
      const [cv, ctx] = this.mkTile(W, H);
      this.diamond(ctx, W, H);
      ctx.fillStyle = U.shade(th.floor, 0.72); ctx.fill();
      ctx.save(); ctx.clip();
      this.mottle(ctx, rng, W, H, U.shade(th.floor, 0.72), 5);
      const sg = ctx.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, 16);
      sg.addColorStop(0, 'rgba(' + halo + ',0.55)'); sg.addColorStop(1, 'rgba(' + halo + ',0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      this.diamond(ctx, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      const vr = makeRng(717);
      ctx.strokeStyle = '#0a0604'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 9, H / 2 + 2);
      for (let s2 = 1; s2 <= 3; s2++)
        ctx.lineTo(W / 2 - 9 + s2 * 6, H / 2 + 2 - 1.5 + (vr() - 0.5) * 3);
      ctx.stroke();
      ctx.strokeStyle = U.rgba(lip, 0.42); ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = U.rgba(lip, 0.35);
      for (let i = 0; i < 7; i++) {
        const a = vr() * Math.PI * 2, rr = 7 + vr() * 6;
        ctx.fillRect(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr * 0.5, 1.5, 1);
      }
      out[key] = cv;
    }
    return out;
  },

  // ---- particle atlas ----
  // Every particle in the game used to be ctx.arc() — a hard-edged flat disc.
  // These are proper shapes with soft falloff, baked once as white masks and
  // tinted on demand. Tinted variants are cached per shape+colour, because the
  // palette is small (element colours plus a handful of literals) and a cache
  // hit is just a drawImage.
  partCache: Object.create(null),
  PART_SIZE: 32,

  bakePartMask(shape) {
    const S = this.PART_SIZE, h = S / 2;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    switch (shape) {
      case 'dot': {           // soft round mote — the default
        const g = c.createRadialGradient(h, h, 0, h, h, h);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, S, S);
        break;
      }
      case 'ember': {         // hot core, rapid falloff, faint halo
        const g = c.createRadialGradient(h, h, 0, h, h, h);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, S, S);
        break;
      }
      case 'spark': {         // four-point star with a bright centre
        const g = c.createRadialGradient(h, h, 0, h, h, h * 0.5);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(h, h, h * 0.5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          c.lineWidth = 2.4;
          c.beginPath();
          c.moveTo(h, h);
          c.lineTo(h + Math.cos(a) * h * 0.95, h + Math.sin(a) * h * 0.95);
          c.stroke();
        }
        break;
      }
      case 'smoke': {         // lumpy puff, several overlapping soft blobs
        const r = makeRng(91);
        for (let i = 0; i < 5; i++) {
          const bx = h + (r() - 0.5) * h * 0.7, by = h + (r() - 0.5) * h * 0.7;
          const br = h * (0.4 + r() * 0.42);
          const g = c.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, 'rgba(255,255,255,0.42)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.fillRect(0, 0, S, S);
        }
        break;
      }
      case 'shard': {         // angular sliver — debris, ash, ice
        c.beginPath();
        c.moveTo(h, 2); c.lineTo(h + h * 0.42, h * 1.15);
        c.lineTo(h, S - 3); c.lineTo(h - h * 0.34, h * 1.05);
        c.closePath();
        c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill();
        break;
      }
      case 'splash': {        // teardrop, heavier at the base
        c.beginPath();
        c.moveTo(h, 3);
        c.quadraticCurveTo(h + h * 0.62, h, h, S - 3);
        c.quadraticCurveTo(h - h * 0.62, h, h, 3);
        c.closePath();
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill();
        break;
      }
      case 'rune': {          // small glyph ring for arcane work
        c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2;
        c.beginPath(); c.arc(h, h, h * 0.6, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          c.beginPath();
          c.moveTo(h + Math.cos(a) * h * 0.6, h + Math.sin(a) * h * 0.6);
          c.lineTo(h + Math.cos(a + 2.1) * h * 0.6, h + Math.sin(a + 2.1) * h * 0.6);
          c.stroke();
        }
        break;
      }
      default: {
        c.beginPath(); c.arc(h, h, h * 0.8, 0, Math.PI * 2); c.fill();
      }
    }
    return cv;
  },

  getParticle(shape, color) {
    const key = shape + '|' + color;
    const hit = this.partCache[key];
    if (hit) return hit;
    const mask = this.bakePartMask(shape);
    const S = this.PART_SIZE;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-in';   // keep the mask's alpha, swap the hue
    c.fillStyle = color;
    c.fillRect(0, 0, S, S);
    this.partCache[key] = cv;
    return cv;
  },

  // ---- ambient occlusion overlays: 16 masks of wall-adjacent edge shading ----
  aoTiles: null,
  getAO() {
    if (this.aoTiles) return this.aoTiles;
    const W = 64, H = 32, LEN = 13, A = 0.36;
    // per bit: edge midpoint + inward normal (N=upper-right edge, E=lower-right, S=lower-left, W=upper-left)
    const edges = [
      { bit: 1, mx: 48, my: 8, nx: -0.894, ny: 0.447 },
      { bit: 2, mx: 48, my: 24, nx: -0.894, ny: -0.447 },
      { bit: 4, mx: 16, my: 24, nx: 0.894, ny: -0.447 },
      { bit: 8, mx: 16, my: 8, nx: 0.894, ny: 0.447 },
    ];
    this.aoTiles = [null];
    for (let mask = 1; mask < 16; mask++) {
      const [cv, ctx] = this.mkTile(W, H);
      this.diamond(ctx, W, H);
      ctx.clip();
      for (const e of edges) {
        if (!(mask & e.bit)) continue;
        const g = ctx.createLinearGradient(e.mx, e.my, e.mx + e.nx * LEN, e.my + e.ny * LEN);
        g.addColorStop(0, `rgba(0,0,0,${A})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      this.aoTiles.push(cv);
    }
    return this.aoTiles;
  },

  // ---- fog puffs: soft cloud sprites tinted per theme ----
  fogs: {},
  getFog(theme) {
    if (this.fogs[theme]) return this.fogs[theme];
    const col = (THEMES[theme].fog || ['#9aa8b8'])[0];
    const rng = makeRng(hashStr(theme) ^ 0xf06);
    const set = [];
    for (let v = 0; v < 3; v++) {
      const S = 256;
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d');
      const blob = (x, y, r, a) => {
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      };
      blob(S / 2, S / 2, S * 0.42, 0.5);
      for (let i = 0; i < 6; i++)
        blob(S * 0.5 + U.rf(rng, -0.22, 0.22) * S, S * 0.5 + U.rf(rng, -0.16, 0.16) * S, S * U.rf(rng, 0.13, 0.26), U.rf(rng, 0.25, 0.45));
      // tint the white cloud with the theme's fog color
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, S, S);
      set.push(cv);
    }
    this.fogs[theme] = set;
    return set;
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
