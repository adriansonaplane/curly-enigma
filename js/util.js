// ============ DIABLOID: util.js — RNG, math, misc helpers ============
'use strict';

/** Deterministic seeded RNG (mulberry32). */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** String → 32-bit hash, for seeding. */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const U = {
  rand: Math.random,
  ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); },           // int in [a,b]
  rf(rng, a, b) { return a + rng() * (b - a); },                           // float in [a,b)
  pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; },
  chance(rng, p) { return rng() < p; },
  shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  },
  weighted(rng, entries) { // entries: [[value, weight], ...]
    let total = 0; for (const e of entries) total += e[1];
    let r = rng() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
  dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
  angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
  fmt(n) { // 12345 -> 12.3k
    n = Math.floor(n);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  },
  roman(n) {
    const R = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let s = '';
    for (const [v, sym] of R) while (n >= v) { s += sym; n -= v; }
    return s;
  },
  esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
  // Color helpers -------------------------------------------------------
  shade(hex, f) { // hex '#rrggbb', f<1 darker, f>1 lighter
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = U.clamp(Math.round(r * f), 0, 255); g = U.clamp(Math.round(g * f), 0, 255); b = U.clamp(Math.round(b * f), 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },
  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  },
};

// Global event/announce queue helpers get attached by ui.js / main.js.
