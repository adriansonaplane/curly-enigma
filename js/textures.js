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

    const wallCv = this._cv(S);
    const wCtx = wallCv.getContext('2d');
    this._drawPat(wCtx, S, pat, th.wall, th.wallTop, seed + 100);
    this._moss(wCtx, S, th.moss, this._lcg(seed + 101), true);
    this._stains(wCtx, S, this._lcg(seed + 102));

    const mk = cv => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      return t;
    };
    return {
      floor: mk(floorCv), wall: mk(wallCv),
      floorN: mk(this._normalMap(floorCv)), wallN: mk(this._normalMap(wallCv)),
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

  // ---- Voronoi cobblestones ----
  _cobble(d, S, base, alt, rng) {
    const N = 48, pts = [];
    for (let i = 0; i < N; i++)
      pts.push({ x: rng() * S, y: rng() * S, s: 0.78 + rng() * 0.26, ci: i % 3 });

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
        if (edge < 3.5) {
          const f = 0.30 + (edge / 3.5) * 0.20;
          d[idx] = base.r * f; d[idx + 1] = base.g * f; d[idx + 2] = base.b * f;
        } else {
          const p = pts[ni], c = p.ci === 1 ? alt : base;
          const nv = this._fbm(px * 0.06, py * 0.06, 3, Math.round(S * 0.06)) * 0.12;
          const round = 1 - Math.min(0.16, d1 / (d1 + d2) * 0.38);
          const v = Math.max(0.5, Math.min(1.18, p.s + nv)) * round;
          d[idx] = Math.min(255, c.r * v); d[idx + 1] = Math.min(255, c.g * v); d[idx + 2] = Math.min(255, c.b * v);
        }
        d[idx + 3] = 255;
      }
    }
  },

  // ---- rectangular slabs ----
  _slab(d, S, base, alt, rng) {
    const cx = [0, 82, 170, S], cy = [0, 62, 130, 192, S];
    const nC = cx.length - 1, nR = cy.length - 1;
    const sh = []; for (let i = 0; i < nC * nR; i++) sh.push(0.80 + rng() * 0.24);
    const M = 2;

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
          d[idx] = base.r * 0.35; d[idx + 1] = base.g * 0.35; d[idx + 2] = base.b * 0.35;
        } else {
          let ci = 0, ri = 0;
          for (let i = 0; i < nC; i++) if (px >= cx[i]) ci = i;
          for (let i = 0; i < nR; i++) if (py >= cy[i]) ri = i;
          const si = ri * nC + ci;
          const c = si % 3 === 0 ? alt : base;
          const nv = this._fbm(px * 0.04, py * 0.04, 2, Math.round(S * 0.04)) * 0.1;
          const v = sh[si] + nv;
          d[idx] = Math.min(255, c.r * v); d[idx + 1] = Math.min(255, c.g * v); d[idx + 2] = Math.min(255, c.b * v);
        }
        d[idx + 3] = 255;
      }
    }
  },

  // ---- running-bond bricks ----
  _brick(d, S, base, alt, rng) {
    const bw = 64, bh = 28, mort = 3;
    const sh = []; for (let i = 0; i < 200; i++) sh.push(0.80 + rng() * 0.24);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const row = Math.floor(py / bh);
        const off = (row & 1) * (bw >> 1);
        const bx = ((px + off) % bw + bw) % bw;
        const by = ((py % bh) + bh) % bh;
        const col = Math.floor(((px + off) % S + S) % S / bw);
        const idx = (py * S + px) * 4;
        if (bx < mort || by < mort) {
          d[idx] = base.r * 0.32; d[idx + 1] = base.g * 0.32; d[idx + 2] = base.b * 0.32;
        } else {
          const si = (row * 7 + col * 13) & 0x7f;
          const c = si % 4 === 0 ? alt : base;
          const nv = this._noise2d(px * 0.1, py * 0.1, Math.round(S * 0.1)) * 0.1;
          const v = sh[si % sh.length] + nv;
          d[idx] = Math.min(255, c.r * v); d[idx + 1] = Math.min(255, c.g * v); d[idx + 2] = Math.min(255, c.b * v);
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
        const n1 = this._fbm(px * 0.03 + offX, py * 0.03 + offY, 5, Math.round(S * 0.03));
        const n2 = this._fbm(px * 0.07 + 50, py * 0.07 + 50, 3, Math.round(S * 0.07));
        const v = 0.62 + n1 * 0.38 + n2 * 0.12;
        const c = n1 > 0.52 ? alt : base;
        const idx = (py * S + px) * 4;
        d[idx] = Math.min(255, c.r * v); d[idx + 1] = Math.min(255, c.g * v); d[idx + 2] = Math.min(255, c.b * v);
        d[idx + 3] = 255;
      }
    }
  },

  // ---- cracked stone ----
  _cracked(d, S, base, alt, rng) {
    this._slab(d, S, base, alt, rng);
    for (let c = 0; c < 7; c++) {
      let x = rng() * S, y = rng() * S, dir = rng() * Math.PI * 2;
      const steps = 18 + Math.floor(rng() * 40);
      for (let i = 0; i < steps; i++) {
        dir += (rng() - 0.5) * 1.0;
        x = ((x + Math.cos(dir) * 2.5) % S + S) % S;
        y = ((y + Math.sin(dir) * 2.5) % S + S) % S;
        const qx = Math.floor(x), qy = Math.floor(y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const tx = ((qx + dx) % S + S) % S, ty = ((qy + dy) % S + S) % S;
          const idx = (ty * S + tx) * 4;
          const f = (dx === 0 && dy === 0) ? 0.22 : 0.48;
          d[idx] = Math.floor(d[idx] * f);
          d[idx + 1] = Math.floor(d[idx + 1] * f);
          d[idx + 2] = Math.floor(d[idx + 2] * f);
          if (dx === 0 && dy === 0) d[idx] = Math.min(255, d[idx] + 22);
        }
      }
    }
  },

  // ---- overlays ----
  _moss(ctx, S, mossHex, rng, isWall) {
    if (!mossHex) return;
    ctx.save();
    const draw = (cx, cy, r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
    ctx.fillStyle = mossHex;
    for (let i = 0; i < 45; i++) {
      const x = rng() * S, y = rng() * S;
      const n = this._fbm(x / S * 5, y / S * 5, 3, 5);
      if (n < 0.36) continue;
      if (isWall && y < S * 0.45) continue;
      const r = 2 + rng() * 8;
      ctx.globalAlpha = 0.18 + n * 0.32;
      draw(x, y, r);
      if (x < r) draw(x + S, y, r);
      if (x > S - r) draw(x - S, y, r);
      if (y < r) draw(x, y + S, r);
      if (y > S - r) draw(x, y - S, r);
    }
    ctx.restore();
  },

  _cracks(ctx, S, dark, rng) {
    ctx.save();
    ctx.strokeStyle = 'rgb(' + dark.r + ',' + dark.g + ',' + dark.b + ')';
    ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
    for (let c = 0; c < 3; c++) {
      let x = rng() * S, y = rng() * S, dir = rng() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0, steps = 10 + Math.floor(rng() * 22); i < steps; i++) {
        dir += (rng() - 0.5) * 1.1;
        const nx = x + Math.cos(dir) * (2 + rng() * 3);
        const ny = y + Math.sin(dir) * (2 + rng() * 3);
        if (nx < 0 || nx >= S || ny < 0 || ny >= S) {
          ctx.stroke();
          x = ((nx % S) + S) % S; y = ((ny % S) + S) % S;
          ctx.beginPath(); ctx.moveTo(x, y);
        } else { x = nx; y = ny; ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  _stains(ctx, S, rng) {
    ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#000';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.arc(rng() * S, rng() * S, 6 + rng() * 18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // ---- normal map from luminance ----
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
    const str = 2.5;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * str;
        const dy = (h(x, y + 1) - h(x, y - 1)) * str;
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
