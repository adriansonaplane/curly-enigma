// ============ DIABLOID: textures.js — procedural dungeon textures ============
'use strict';

const DungeonTextures = {
  cache: new Map(),
  SIZE: 256,
  SCALES: { cobble: 0.50, slab: 0.25, brick: 0.50, rough: 0.35, cracked: 0.30 },

  get(themeName) {
    if (this.cache.has(themeName)) return this.cache.get(themeName);
    const th = typeof THEMES !== 'undefined' ? THEMES[themeName] : null;
    if (!th || typeof THREE === 'undefined') return null;
    const r = this._generate(themeName, th);
    this.cache.set(themeName, r);
    return r;
  },

  _generate(themeName, th) {
    const S = this.SIZE, pat = th.pattern || 'slab', seed = this._strHash(themeName);

    const floorCv = this._cv(S);
    const fCtx = floorCv.getContext('2d');
    this._drawPat(fCtx, S, pat, th.floor, th.floorAlt, seed);
    this._moss(fCtx, S, th.moss, this._lcg(seed + 1));
    this._cracks(fCtx, S, this._shade(this._col(th.floor), 0.3), this._lcg(seed + 2));
    this._stains(fCtx, S, this._lcg(seed + 3));

    const wallCv = this._cv(S);
    const wCtx = wallCv.getContext('2d');
    this._drawPat(wCtx, S, pat, th.wall, th.wallTop, seed + 100);
    this._moss(wCtx, S, th.moss, this._lcg(seed + 101), true);
    this._stains(wCtx, S, this._lcg(seed + 102));
    this._waterStains(wCtx, S, this._lcg(seed + 103));

    const floorNcv = this._normalMap(floorCv);
    const wallNcv = this._normalMap(wallCv);

    const mk = cv => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      cv.width = cv.height = 0;
      return t;
    };
    return {
      floor: mk(floorCv), wall: mk(wallCv),
      floorN: mk(floorNcv), wallN: mk(wallNcv),
      floorScale: this.SCALES[pat] || 0.25, wallScale: 0.50,
    };
  },

  // ---- pattern dispatch ----
  _drawPat(ctx, S, pat, baseHex, altHex, seed) {
    const img = ctx.createImageData(S, S), d = img.data;
    const base = this._col(baseHex), alt = this._col(altHex);
    const rng = this._lcg(seed);
    switch (pat) {
      case 'cobble':  this._cobble(d, S, base, alt, rng); break;
      case 'slab':    this._slab(d, S, base, alt, rng); break;
      case 'brick':   this._brick(d, S, base, alt, rng); break;
      case 'rough':   this._rough(d, S, base, alt, rng); break;
      case 'cracked': this._cracked(d, S, base, alt, rng); break;
      default:        this._slab(d, S, base, alt, rng); break;
    }
    ctx.putImageData(img, 0, 0);
  },

  _lerpCol(a, b, t) {
    return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
  },

  // ---- Voronoi cobblestones ----
  _cobble(d, S, base, alt, rng) {
    const N = 64, pts = [];
    for (let i = 0; i < N; i++) {
      const hueShift = (rng() - 0.5) * 16;
      pts.push({ x: rng() * S, y: rng() * S, s: 0.72 + rng() * 0.36, ci: i % 5, hue: hueShift });
    }

    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        let d1 = 1e9, d2 = 1e9, ni = 0;
        for (let i = 0; i < N; i++) {
          let dx = Math.abs(px - pts[i].x), dy = Math.abs(py - pts[i].y);
          if (dx > S / 2) dx = S - dx;
          if (dy > S / 2) dy = S - dy;
          const dd = dx * dx + dy * dy;
          if (dd < d1) { d2 = d1; d1 = dd; ni = i; }
          else if (dd < d2) d2 = dd;
        }
        d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
        const edge = d2 - d1;
        const idx = (py * S + px) * 4;
        if (edge < 4.0) {
          const f = 0.20 + (edge / 4.0) * 0.22;
          d[idx] = base.r * f; d[idx + 1] = base.g * f; d[idx + 2] = base.b * f;
        } else {
          const p = pts[ni], c = this._lerpCol(base, alt, (p.ci % 3) / 2);
          const nv = this._fbm(px * 0.06, py * 0.06, 4, Math.round(S * 0.06)) * 0.22;
          const round = 1 - Math.min(0.20, d1 / (d1 + d2) * 0.42);
          const v = Math.max(0.45, Math.min(1.2, p.s + nv)) * round;
          d[idx] = Math.min(255, (c.r + p.hue) * v);
          d[idx + 1] = Math.min(255, c.g * v);
          d[idx + 2] = Math.min(255, (c.b - p.hue * 0.5) * v);
        }
        d[idx + 3] = 255;
      }
    }
  },

  // ---- rectangular slabs ----
  _slab(d, S, base, alt, rng) {
    const cx = [0, 78, 166, S], cy = [0, 58, 124, 188, S];
    const nC = cx.length - 1, nR = cy.length - 1;
    const sh = [];
    for (let i = 0; i < nC * nR; i++) sh.push({ v: 0.65 + rng() * 0.40, hue: (rng() - 0.5) * 14 });
    const M = 4;

    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        let nearEdge = false;
        for (let i = 0; i <= nC && !nearEdge; i++) {
          let dd = Math.abs(px - cx[i]); if (dd > S / 2) dd = S - dd;
          if (dd < M) nearEdge = true;
        }
        for (let i = 0; i <= nR && !nearEdge; i++) {
          let dd = Math.abs(py - cy[i]); if (dd > S / 2) dd = S - dd;
          if (dd < M) nearEdge = true;
        }
        const idx = (py * S + px) * 4;
        if (nearEdge) {
          const mNoise = this._noise2d(px * 0.15, py * 0.15, Math.round(S * 0.15)) * 0.08;
          const mf = 0.22 + mNoise;
          d[idx] = base.r * mf + 8; d[idx + 1] = base.g * mf + 6; d[idx + 2] = base.b * mf + 4;
        } else {
          let ci = 0, ri = 0;
          for (let i = 0; i < nC; i++) if (px >= cx[i]) ci = i;
          for (let i = 0; i < nR; i++) if (py >= cy[i]) ri = i;
          const si = ri * nC + ci;
          const c = this._lerpCol(base, alt, (si % 4) / 3);
          const nv = this._fbm(px * 0.05, py * 0.05, 3, Math.round(S * 0.05)) * 0.20;
          const v = sh[si].v + nv;
          const h = sh[si].hue;
          d[idx] = Math.min(255, Math.max(0, (c.r + h) * v));
          d[idx + 1] = Math.min(255, Math.max(0, c.g * v));
          d[idx + 2] = Math.min(255, Math.max(0, (c.b - h * 0.4) * v));
        }
        d[idx + 3] = 255;
      }
    }
  },

  // ---- running-bond bricks ----
  _brick(d, S, base, alt, rng) {
    const bw = 64, bh = 28, mort = 4;
    const sh = [];
    for (let i = 0; i < 200; i++) sh.push({ v: 0.68 + rng() * 0.38, hue: (rng() - 0.5) * 12 });
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const row = Math.floor(py / bh);
        const off = (row & 1) * (bw >> 1);
        const bx = ((px + off) % bw + bw) % bw;
        const by = ((py % bh) + bh) % bh;
        const col = Math.floor(((px + off) % S + S) % S / bw);
        const idx = (py * S + px) * 4;
        if (bx < mort || by < mort) {
          const mNoise = this._noise2d(px * 0.12, py * 0.12, Math.round(S * 0.12)) * 0.06;
          d[idx] = base.r * (0.24 + mNoise) + 6;
          d[idx + 1] = base.g * (0.24 + mNoise) + 4;
          d[idx + 2] = base.b * (0.24 + mNoise) + 3;
        } else {
          const si = (row * 7 + col * 13) & 0x7f;
          const c = this._lerpCol(base, alt, (si % 5) / 4);
          const nv = this._noise2d(px * 0.1, py * 0.1, Math.round(S * 0.1)) * 0.18;
          const v = sh[si % sh.length].v + nv;
          const h = sh[si % sh.length].hue;
          d[idx] = Math.min(255, Math.max(0, (c.r + h) * v));
          d[idx + 1] = Math.min(255, Math.max(0, c.g * v));
          d[idx + 2] = Math.min(255, Math.max(0, (c.b - h * 0.3) * v));
        }
        d[idx + 3] = 255;
      }
    }
  },

  // ---- rough rock ----
  _rough(d, S, base, alt, rng) {
    const offX = rng() * 100, offY = rng() * 100;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const n1 = this._fbm(px * 0.03 + offX, py * 0.03 + offY, 6, Math.round(S * 0.03));
        const n2 = this._fbm(px * 0.08 + 50, py * 0.08 + 50, 3, Math.round(S * 0.08));
        const n3 = this._fbm(px * 0.15 + 25, py * 0.15 + 25, 2, Math.round(S * 0.15));
        const v = 0.50 + n1 * 0.42 + n2 * 0.18 + n3 * 0.08;
        const t = Math.max(0, Math.min(1, (n1 - 0.35) * 2.5));
        const c = this._lerpCol(base, alt, t);
        const hueShift = (n2 - 0.5) * 12;
        const idx = (py * S + px) * 4;
        d[idx] = Math.min(255, Math.max(0, (c.r + hueShift) * v));
        d[idx + 1] = Math.min(255, Math.max(0, c.g * v));
        d[idx + 2] = Math.min(255, Math.max(0, (c.b - hueShift * 0.4) * v));
        d[idx + 3] = 255;
      }
    }
  },

  // ---- cracked stone ----
  _cracked(d, S, base, alt, rng) {
    this._slab(d, S, base, alt, rng);
    for (let c = 0; c < 12; c++) {
      let x = rng() * S, y = rng() * S, dir = rng() * Math.PI * 2;
      const steps = 22 + Math.floor(rng() * 50);
      const w = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < steps; i++) {
        dir += (rng() - 0.5) * 0.9;
        x = ((x + Math.cos(dir) * 2.5) % S + S) % S;
        y = ((y + Math.sin(dir) * 2.5) % S + S) % S;
        const qx = Math.floor(x), qy = Math.floor(y);
        for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
          const tx = ((qx + dx) % S + S) % S, ty = ((qy + dy) % S + S) % S;
          const idx = (ty * S + tx) * 4;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const f = dist < 0.5 ? 0.18 : 0.35 + dist * 0.12;
          d[idx] = Math.floor(d[idx] * f);
          d[idx + 1] = Math.floor(d[idx + 1] * f);
          d[idx + 2] = Math.floor(d[idx + 2] * f);
          if (dist < 0.5) d[idx] = Math.min(255, d[idx] + 28);
        }
      }
    }
  },

  // ---- overlays ----
  _moss(ctx, S, mossHex, rng, isWall) {
    if (!mossHex) return;
    ctx.save();
    const mc = this._col(mossHex);
    for (let i = 0; i < 55; i++) {
      const x = rng() * S, y = rng() * S;
      const n = this._fbm(x / S * 5, y / S * 5, 3, 5);
      if (n < 0.32) continue;
      if (isWall && y < S * 0.40) continue;
      const r = 3 + rng() * 12;
      const alpha = 0.22 + n * 0.38;
      const hShift = (rng() - 0.5) * 18;
      ctx.fillStyle = 'rgba(' + Math.max(0, Math.min(255, mc.r + hShift)) + ',' +
        Math.max(0, Math.min(255, mc.g + (rng() - 0.5) * 10)) + ',' +
        Math.max(0, Math.min(255, mc.b - hShift * 0.3)) + ',' + alpha.toFixed(3) + ')';
      // irregular blob instead of circle
      ctx.beginPath();
      const pts = 6 + Math.floor(rng() * 5);
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const rr = r * (0.5 + rng() * 0.7);
        const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr;
        p === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
      }
      ctx.closePath(); ctx.fill();
      if (x < r * 1.2) { ctx.save(); ctx.translate(S, 0); ctx.fill(); ctx.restore(); }
      if (x > S - r * 1.2) { ctx.save(); ctx.translate(-S, 0); ctx.fill(); ctx.restore(); }
      if (y < r * 1.2) { ctx.save(); ctx.translate(0, S); ctx.fill(); ctx.restore(); }
      if (y > S - r * 1.2) { ctx.save(); ctx.translate(0, -S); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  },

  _cracks(ctx, S, dark, rng) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let c = 0; c < 8; c++) {
      let x = rng() * S, y = rng() * S, dir = rng() * Math.PI * 2;
      const w = 1 + rng() * 2;
      ctx.lineWidth = w;
      ctx.strokeStyle = 'rgba(' + dark.r + ',' + dark.g + ',' + dark.b + ',' + (0.35 + rng() * 0.25).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0, steps = 12 + Math.floor(rng() * 28); i < steps; i++) {
        dir += (rng() - 0.5) * 1.1;
        const nx = x + Math.cos(dir) * (2 + rng() * 4);
        const ny = y + Math.sin(dir) * (2 + rng() * 4);
        if (nx < 0 || nx >= S || ny < 0 || ny >= S) {
          ctx.stroke();
          x = ((nx % S) + S) % S; y = ((ny % S) + S) % S;
          ctx.beginPath(); ctx.moveTo(x, y);
        } else { x = nx; y = ny; ctx.lineTo(x, y); }
        if (rng() < 0.15) {
          ctx.stroke();
          const bd = dir + (rng() > 0.5 ? 0.6 : -0.6);
          let bx = x, by = y;
          ctx.lineWidth = w * 0.6;
          ctx.beginPath(); ctx.moveTo(bx, by);
          for (let j = 0; j < 4 + Math.floor(rng() * 6); j++) {
            bx += Math.cos(bd) * (1.5 + rng() * 2); by += Math.sin(bd) * (1.5 + rng() * 2);
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  _stains(ctx, S, rng) {
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const x = rng() * S, y = rng() * S;
      const r = 8 + rng() * 22;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.18)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  },

  _waterStains(ctx, S, rng) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#8a9aaa';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = rng() * S;
      let y = rng() * S * 0.3;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 20 + Math.floor(rng() * 30); j++) {
        y += 1.5 + rng() * 2;
        const nx = x + (rng() - 0.5) * 3;
        ctx.lineTo(nx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  // ---- normal map from luminance (3x3 Sobel kernel) ----
  _normalMap(cv) {
    const S = cv.width;
    const src = cv.getContext('2d').getImageData(0, 0, S, S).data;
    const out = this._cv(S), oCtx = out.getContext('2d');
    const img = oCtx.createImageData(S, S), dd = img.data;
    const h = (x, y) => {
      x = ((x % S) + S) % S; y = ((y % S) + S) % S;
      const i = (y * S + x) * 4;
      return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
    };
    const str = 5.0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Sobel 3x3 kernel
        const tl = h(x-1,y-1), tc = h(x,y-1), tr = h(x+1,y-1);
        const ml = h(x-1,y),                    mr = h(x+1,y);
        const bl = h(x-1,y+1), bc = h(x,y+1), br = h(x+1,y+1);
        const dx = (tr + 2*mr + br - tl - 2*ml - bl) * str;
        const dy = (bl + 2*bc + br - tl - 2*tc - tr) * str;
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const i = (y * S + x) * 4;
        dd[i] = ((-dx / len) * 0.5 + 0.5) * 255;
        dd[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
        dd[i + 2] = (1 / len) * 255;
        dd[i + 3] = 255;
      }
    }
    oCtx.putImageData(img, 0, 0);
    return out;
  },

  // ---- utility ----
  _cv(S) { const c = document.createElement('canvas'); c.width = c.height = S; return c; },
  _col(hex) { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }; },
  _shade(c, f) { return { r: Math.min(255, c.r * f) | 0, g: Math.min(255, c.g * f) | 0, b: Math.min(255, c.b * f) | 0 }; },
  _hash(x, y) { let n = (x * 73856093) ^ (y * 19349669); n = ((n >> 13) ^ n) * 362437; return ((n >> 16) ^ n) & 0xff; },
  _noise2d(x, y, period) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = period ? (v => ((v % period) + period) % period) : (v => v);
    const a = this._hash(w(ix), w(iy)), b = this._hash(w(ix + 1), w(iy));
    const c = this._hash(w(ix), w(iy + 1)), dd = this._hash(w(ix + 1), w(iy + 1));
    return ((a + (b - a) * sx) + ((c + (dd - c) * sx) - (a + (b - a) * sx)) * sy) / 255;
  },
  _fbm(x, y, oct, period) {
    let v = 0, a = 1, f = 1, m = 0;
    for (let i = 0; i < oct; i++) {
      v += this._noise2d(x * f, y * f, period ? Math.round(period * f) : undefined) * a;
      m += a; a *= 0.5; f *= 2;
    }
    return v / m;
  },
  _lcg(seed) { let s = seed ^ 0xdeadbeef; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; }; },
  _strHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h; },

  dispose() {
    for (const [, t] of this.cache) {
      if (t.floor) t.floor.dispose();
      if (t.wall) t.wall.dispose();
      if (t.floorN) t.floorN.dispose();
      if (t.wallN) t.wallN.dispose();
    }
    this.cache.clear();
  },
};
