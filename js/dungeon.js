// ============ DIABLOID: dungeon.js — procedural dungeon generation ============
// Graph-based topology: scatter → separate → Delaunay → MST + loops → semantics
// → carve → rasterize + BFS → decorate → instanced gameplay
'use strict';

const TILE = { WALL: 0, FLOOR: 1, EXIT: 2, ENTRY: 3, DOOR: 4 };
const HAZ = { NONE: 0, LAVA: 1, SPIKES: 2, GAS: 3, WATER: 4, VENT: 5, SPORE: 6, EMBER: 7 };

const VENT_KINDS = {
  5: { tile: 'vent',  color: '#ff9a3f', hot: '#ffd9a0', elem: 'fire', dmg: 0.055, mul: 1.8, name: 'steam vent',   sheet: 'geothermalsteam-3d' },
  6: { tile: 'spore', color: '#8ae8a0', hot: '#d8ffe0', elem: 'pois', dmg: 0.040, mul: 1.2, name: 'spore vent',   sheet: 'swampgas-3d' },
  7: { tile: 'ember', color: '#ff5a2f', hot: '#ffc060', elem: 'fire', dmg: 0.070, mul: 2.2, name: 'ember geyser', sheet: 'flamejet-3d' },
};
function isVent(hz) { return hz === HAZ.VENT || hz === HAZ.SPORE || hz === HAZ.EMBER; }

const VENT_PERIOD = 3.6;
const VENT_JET = 0.85;
const VENT_TELL = 0.75;
function ventPhase(i, t) {
  const off = (((i * 2654435761) >>> 0) % 997) / 997 * VENT_PERIOD;
  const p = (t + off) % VENT_PERIOD;
  return p < 0 ? p + VENT_PERIOD : p;
}
function ventJetting(i, t) { return ventPhase(i, t) < VENT_JET; }
function ventCharge(i, t) {
  const p = ventPhase(i, t);
  const lead = VENT_PERIOD - p;
  return lead <= VENT_TELL ? 1 - lead / VENT_TELL : 0;
}

// ========== Bowyer-Watson Delaunay triangulation ==========
function delaunayEdges(pts) {
  const n = pts.length;
  if (n < 2) return [];
  if (n === 2) return [[0, 1]];
  const P = pts.map((p, i) => ({
    x: p.x + ((i * 0.618033) % 1) * 1e-3,
    y: p.y + ((i * 0.414213) % 1) * 1e-3, i
  }));
  let mnX = 1e18, mnY = 1e18, mxX = -1e18, mxY = -1e18;
  for (const p of P) { if (p.x < mnX) mnX = p.x; if (p.y < mnY) mnY = p.y; if (p.x > mxX) mxX = p.x; if (p.y > mxY) mxY = p.y; }
  const dm = Math.max(mxX - mnX, mxY - mnY, 1), mx = (mnX + mxX) / 2, my = (mnY + mxY) / 2;
  const s1 = { x: mx - 30 * dm, y: my - dm, i: -1 };
  const s2 = { x: mx, y: my + 30 * dm, i: -2 };
  const s3 = { x: mx + 30 * dm, y: my - dm, i: -3 };
  const mkTri = (a, b, c) => {
    const t = [a, b, c];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) { t.ccx = 0; t.ccy = 0; t.r2 = Infinity; return t; }
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    t.ccx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    t.ccy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    t.r2 = (a.x - t.ccx) ** 2 + (a.y - t.ccy) ** 2;
    return t;
  };
  let tris = [mkTri(s1, s2, s3)];
  for (const p of P) {
    const bad = [], edg = [];
    for (const t of tris) if ((p.x - t.ccx) ** 2 + (p.y - t.ccy) ** 2 < t.r2) bad.push(t);
    for (const t of bad) for (let e = 0; e < 3; e++) edg.push([t[e], t[(e + 1) % 3]]);
    const poly = [];
    for (let i = 0; i < edg.length; i++) {
      let shared = false;
      for (let j = 0; j < edg.length; j++) {
        if (i === j) continue;
        if ((edg[i][0] === edg[j][0] && edg[i][1] === edg[j][1]) ||
            (edg[i][0] === edg[j][1] && edg[i][1] === edg[j][0])) { shared = true; break; }
      }
      if (!shared) poly.push(edg[i]);
    }
    tris = tris.filter(t => !bad.includes(t));
    for (const e of poly) tris.push(mkTri(e[0], e[1], p));
  }
  tris = tris.filter(t => t[0].i >= 0 && t[1].i >= 0 && t[2].i >= 0);
  const seen = new Set(), out = [];
  for (const t of tris) for (let e = 0; e < 3; e++) {
    const a = t[e].i, b = t[(e + 1) % 3].i;
    const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * 4096 + hi;
    if (!seen.has(k)) { seen.add(k); out.push([lo, hi]); }
  }
  return out;
}

// ========== Dungeon affix system (abyss modifiers) ==========
const DUNGEON_AFFIXES = [
  { id: 'dense',      name: 'Teeming',     spawnMult: 1.6 },
  { id: 'fortified',  name: 'Fortified',   champBoost: 0.35 },
  { id: 'burning',    name: 'Scorched',     hazReplace: ['lava', 'ember'] },
  { id: 'cursed',     name: 'Accursed',     eliteBoost: 0.3 },
  { id: 'labyrinth',  name: 'Labyrinthine', roomMult: 1.5, loopMult: 0.4 },
  { id: 'barren',     name: 'Desolate',     propMult: 0.3 },
  { id: 'haunted',    name: 'Haunted',      extraFam: 'wraith' },
  { id: 'toxic',      name: 'Pestilent',    hazReplace: ['gas', 'spore'] },
  { id: 'thorned',    name: 'Impaling',     hazReplace: ['spikes'], spikeMult: 3 },
  { id: 'volcanic',   name: 'Volcanic',     hazReplace: ['lava', 'vent', 'ember'] },
];

// ========================================================================
const Dungeon = {

  idx(map, x, y) { return y * map.w + x; },
  isWall(map, x, y) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    return map.t[y * map.w + x] === TILE.WALL;
  },
  inRoom(map, x, y) {
    if (map._roomId) {
      const i = y * map.w + x;
      return i >= 0 && i < map._roomId.length && map._roomId[i] >= 0;
    }
    for (const r of map.rooms || [])
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
    return false;
  },

  computeAO(map) {
    const { w, h } = map;
    map.ao = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (map.t[i] === TILE.WALL) continue;
      let m = 0;
      if (this.isWall(map, x, y - 1)) m |= 1;
      if (this.isWall(map, x + 1, y)) m |= 2;
      if (this.isWall(map, x, y + 1)) m |= 4;
      if (this.isWall(map, x - 1, y)) m |= 8;
      map.ao[i] = m;
    }
  },

  // ========== Sconce interaction ==========
  REACH: 2.2,
  nearestSconce(map, x, y, rad) {
    if (!map || !map.lights || map.town) return null;
    const r2 = (rad || this.REACH) ** 2;
    let best = null, bd = Infinity;
    for (const l of map.lights) {
      if (!l.kindle) continue;
      const dx = l.x - x, dy = l.y - y, d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 >= bd) continue;
      best = l; bd = d2;
    }
    return best;
  },
  toggleLight(l) {
    if (!l || !l.kindle) return null;
    l.lit = !l.lit;
    if (l.prop) l.prop.lit = l.lit;
    return l.lit;
  },

  // ========== Graph-based topology ==========
  buildGraph(rng, nRooms, w, h, affix) {
    const rooms = [];
    const scatterR = Math.min(w, h) / 2 - 12;
    const loopChance = (affix && affix.loopMult) ? 0.3 * affix.loopMult : 0.3;

    for (let i = 0; i < nRooms; i++) {
      const t = rng();
      let rw, rh;
      if (t < 0.38)      { rw = U.ri(rng, 5, 8);  rh = U.ri(rng, 5, 8); }
      else if (t < 0.78) { rw = U.ri(rng, 8, 13); rh = U.ri(rng, 8, 13); }
      else               { rw = U.ri(rng, 13, 18); rh = U.ri(rng, 13, 18); }
      const st = rng();
      let shape;
      if (st < 0.48)      shape = 'rect';
      else if (st < 0.66) shape = 'ellipse';
      else if (st < 0.78) shape = 'oct';
      else if (st < 0.88) shape = 'L';
      else if (st < 0.95) shape = 'cross';
      else { shape = 'gallery'; rw = U.ri(rng, 3, 5); rh = U.ri(rng, 14, 20);
             if (U.chance(rng, 0.5)) { const tmp = rw; rw = rh; rh = tmp; } }
      const ang = rng() * Math.PI * 2;
      const rad = scatterR * Math.sqrt(rng());
      rooms.push({
        id: i, cx: w / 2 + Math.cos(ang) * rad, cy: h / 2 + Math.sin(ang) * rad,
        w: rw, h: rh, shape, lRot: U.ri(rng, 0, 3), degree: 0,
        archetype: 'combat', depth: 0, difficulty: 0.2,
      });
    }

    let lc = rooms.filter(r => r.w >= 13 && r.h >= 13).length;
    while (lc < 2) {
      const j = U.ri(rng, 0, nRooms - 1);
      if (rooms[j].w < 13) { rooms[j].w = U.ri(rng, 13, 18); rooms[j].h = U.ri(rng, 13, 18); rooms[j].shape = 'rect'; lc++; }
    }

    // Physics-based separation
    for (let iter = 0; iter < 300; iter++) {
      let moved = false;
      for (let i = 0; i < nRooms; i++) for (let j = i + 1; j < nRooms; j++) {
        const pad = 3;
        const hwi = rooms[i].w / 2 + pad / 2, hhi = rooms[i].h / 2 + pad / 2;
        const hwj = rooms[j].w / 2 + pad / 2, hhj = rooms[j].h / 2 + pad / 2;
        const ox = hwi + hwj - Math.abs(rooms[i].cx - rooms[j].cx);
        if (ox <= 0) continue;
        const oy = hhi + hhj - Math.abs(rooms[i].cy - rooms[j].cy);
        if (oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const s = rooms[i].cx <= rooms[j].cx ? -1 : 1;
          rooms[i].cx += s * ox / 2; rooms[j].cx -= s * ox / 2;
        } else {
          const s = rooms[i].cy <= rooms[j].cy ? -1 : 1;
          rooms[i].cy += s * oy / 2; rooms[j].cy -= s * oy / 2;
        }
      }
      if (!moved) break;
    }

    for (const r of rooms) {
      r.cx = U.clamp(Math.round(r.cx), Math.ceil(r.w / 2) + 2, w - Math.ceil(r.w / 2) - 2);
      r.cy = U.clamp(Math.round(r.cy), Math.ceil(r.h / 2) + 2, h - Math.ceil(r.h / 2) - 2);
    }

    // Delaunay → MST + loops
    const centers = rooms.map(r => ({ x: r.cx, y: r.cy }));
    let delEdges = delaunayEdges(centers);
    if (!delEdges.length) { for (let i = 0; i < nRooms - 1; i++) delEdges.push([i, i + 1]); }

    const elen = e => Math.hypot(centers[e[0]].x - centers[e[1]].x, centers[e[0]].y - centers[e[1]].y);
    const adj = Array.from({ length: nRooms }, () => []);
    delEdges.forEach((e, idx) => { const wt = elen(e); adj[e[0]].push({ b: e[1], wt, idx }); adj[e[1]].push({ b: e[0], wt, idx }); });

    const inTree = new Uint8Array(nRooms); inTree[0] = 1; let inCount = 1;
    const mstIdx = new Set();
    while (inCount < nRooms) {
      let best = null;
      for (let a = 0; a < nRooms; a++) if (inTree[a])
        for (const e of adj[a]) if (!inTree[e.b] && (!best || e.wt < best.wt)) best = e;
      if (!best) break;
      inTree[best.b] = 1; inCount++; mstIdx.add(best.idx);
    }
    if (inCount < nRooms) return null;

    let mstLen = 0; for (const i of mstIdx) mstLen += elen(delEdges[i]);
    const mstMean = mstLen / Math.max(1, mstIdx.size);

    const edges = [];
    delEdges.forEach((e, idx) => {
      if (mstIdx.has(idx)) edges.push({ a: e[0], b: e[1], isLoop: false, isCritical: false });
      else if (elen(e) < mstMean * 2.2 && U.chance(rng, loopChance))
        edges.push({ a: e[0], b: e[1], isLoop: true, isCritical: false });
    });
    for (const e of edges) { rooms[e.a].degree++; rooms[e.b].degree++; }

    // Leaf guard
    if (nRooms >= 12) {
      let leafCount = rooms.filter(r => r.degree === 1).length;
      while (leafCount < 3) {
        let bi = -1, bs = -1;
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i]; if (!e.isLoop) continue;
          const s = (rooms[e.a].degree === 2 ? 1 : 0) + (rooms[e.b].degree === 2 ? 1 : 0);
          const score = s * 10000 + elen(delEdges.find(d => (d[0] === e.a && d[1] === e.b) || (d[0] === e.b && d[1] === e.a)) || [e.a, e.b]);
          if (score > bs) { bs = score; bi = i; }
        }
        if (bi < 0) break;
        const e = edges[bi];
        if (--rooms[e.a].degree === 1) leafCount++;
        if (--rooms[e.b].degree === 1) leafCount++;
        edges.splice(bi, 1);
      }
    }

    // BFS semantics
    const gAdj = Array.from({ length: nRooms }, () => []);
    edges.forEach((e, i) => { gAdj[e.a].push({ b: e.b, i }); gAdj[e.b].push({ b: e.a, i }); });

    let bossIdx = 0;
    for (let i = 1; i < nRooms; i++) if (rooms[i].w * rooms[i].h > rooms[bossIdx].w * rooms[bossIdx].h) bossIdx = i;

    const bfsFrom = src => {
      const D = new Int32Array(nRooms).fill(-1); D[src] = 0; const q = [src];
      for (let h = 0; h < q.length; h++) { const a = q[h]; for (const e of gAdj[a]) if (D[e.b] < 0) { D[e.b] = D[a] + 1; q.push(e.b); } }
      return D;
    };
    const dB = bfsFrom(bossIdx);
    let entranceIdx = -1, bestD = -1;
    for (let i = 0; i < nRooms; i++) if (i !== bossIdx && rooms[i].degree === 1 && dB[i] > bestD) { bestD = dB[i]; entranceIdx = i; }
    if (entranceIdx < 0) for (let i = 0; i < nRooms; i++) if (i !== bossIdx && dB[i] > bestD) { bestD = dB[i]; entranceIdx = i; }

    const dE = bfsFrom(entranceIdx);
    let maxDepth = 1;
    for (let i = 0; i < nRooms; i++) if (dE[i] > maxDepth) maxDepth = dE[i];
    rooms.forEach((r, i) => { r.depth = Math.max(0, dE[i]); r.difficulty = Math.min(1, 0.1 + 0.9 * (r.depth / maxDepth)); });

    // Critical path
    const par = new Int32Array(nRooms).fill(-1), pe = new Int32Array(nRooms).fill(-1);
    { const q = [entranceIdx], vis = new Uint8Array(nRooms); vis[entranceIdx] = 1;
      for (let h = 0; h < q.length; h++) { const a = q[h]; for (const e of gAdj[a]) if (!vis[e.b]) { vis[e.b] = 1; par[e.b] = a; pe[e.b] = e.i; q.push(e.b); } } }
    const critRooms = new Set();
    for (let c = bossIdx; c !== -1; c = par[c]) { critRooms.add(c); if (pe[c] >= 0) edges[pe[c]].isCritical = true; if (c === entranceIdx) break; }

    // Archetype assignment
    rooms[entranceIdx].archetype = 'entrance'; rooms[entranceIdx].difficulty = 0;
    rooms[bossIdx].archetype = 'boss_lair'; rooms[bossIdx].difficulty = 1; rooms[bossIdx].boss = true;
    if (par[bossIdx] >= 0 && par[bossIdx] !== entranceIdx) rooms[par[bossIdx]].archetype = 'antechamber';

    const leaves = [];
    for (let i = 0; i < nRooms; i++) if (i !== entranceIdx && i !== bossIdx && rooms[i].degree === 1) leaves.push(i);
    leaves.sort((a, b) => rooms[b].depth - rooms[a].depth);
    for (let k = 0; k < Math.min(3, leaves.length); k++)
      if (rooms[leaves[k]].archetype === 'combat') rooms[leaves[k]].archetype = 'treasure';

    const shrC = [];
    for (let i = 0; i < nRooms; i++) {
      const r = rooms[i];
      if (r.archetype === 'combat' && !critRooms.has(i) && r.depth > maxDepth * 0.25 && r.depth < maxDepth * 0.85) shrC.push(i);
    }
    for (let k = 0; k < 2 && shrC.length; k++) rooms[shrC.splice(U.ri(rng, 0, shrC.length - 1), 1)[0]].archetype = 'shrine';

    const eltC = [];
    for (const i of critRooms) if (rooms[i].archetype === 'combat' && rooms[i].depth >= maxDepth * 0.5 && rooms[i].depth <= maxDepth * 0.85) eltC.push(i);
    eltC.sort((a, b) => rooms[b].depth - rooms[a].depth);
    for (let k = 0; k < Math.min(2, eltC.length); k++) rooms[eltC[k]].archetype = 'elite';

    for (const i of critRooms) if (rooms[i].archetype === 'combat' && rooms[i].w * rooms[i].h >= 130) rooms[i].archetype = 'hall';

    for (const r of rooms) {
      if (r.archetype !== 'combat') continue;
      const area = r.w * r.h;
      if (r.degree === 1 && area < 50) { r.archetype = U.chance(rng, 0.5) ? 'study' : 'prison'; continue; }
      if (area >= 150 && !critRooms.has(r.id)) { r.archetype = 'arena'; continue; }
      if (area >= 80 && U.chance(rng, 0.35)) { r.archetype = U.pick(rng, ['crypt', 'ritual']); }
    }

    for (const e of edges) {
      e.width = e.isCritical ? 3 : 2;
      if (e.isLoop) e.width = 2;
      const ta = rooms[e.a].archetype, tb = rooms[e.b].archetype;
      if ((ta === 'treasure' || tb === 'treasure' || ta === 'study' || tb === 'study' || ta === 'prison' || tb === 'prison') && U.chance(rng, 0.5)) e.width = 1;
    }

    for (const r of rooms) { r.x = Math.floor(r.cx - r.w / 2); r.y = Math.floor(r.cy - r.h / 2); }

    return { rooms, edges, entranceIdx, bossIdx, critRooms, maxDepth };
  },

  // ========== Room shape rasterization ==========
  carveShape(map, r) {
    const rx = r.w / 2, ry = r.h / 2;
    const irx2 = 1 / (rx * rx), iry2 = 1 / (ry * ry);
    const octCh = Math.min(rx, ry) * 0.45;
    const y0 = Math.max(1, Math.floor(r.cy - ry)), y1 = Math.min(map.h - 2, Math.ceil(r.cy + ry));
    const x0 = Math.max(1, Math.floor(r.cx - rx)), x1 = Math.min(map.w - 2, Math.ceil(r.cx + rx));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - r.cx, dy = y - r.cy, adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx > rx || ady > ry) continue;
      let ok = false;
      switch (r.shape) {
        case 'rect': case 'gallery': ok = true; break;
        case 'ellipse': ok = dx * dx * irx2 + dy * dy * iry2 <= 1; break;
        case 'oct': ok = adx <= rx - octCh || ady <= ry - octCh ||
          (adx - (rx - octCh)) + (ady - (ry - octCh)) <= octCh; break;
        case 'L': {
          const aw = r.w * 0.45, ah = r.h * 0.45;
          switch (r.lRot & 3) {
            case 0: ok = (dx + rx <= aw) || (ry - dy <= ah); break;
            case 1: ok = (rx - dx <= aw) || (ry - dy <= ah); break;
            case 2: ok = (rx - dx <= aw) || (dy + ry <= ah); break;
            case 3: ok = (dx + rx <= aw) || (dy + ry <= ah); break;
          }
          break;
        }
        case 'cross': ok = (adx <= rx * 0.42 && ady <= ry) || (adx <= rx && ady <= ry * 0.42); break;
      }
      if (ok) { const i = y * map.w + x; map.t[i] = TILE.FLOOR; map._roomId[i] = r.id; }
    }
  },

  // ========== Graph-based room + corridor layout ==========
  carveGraphLayout(map, rng, graph) {
    const { rooms, edges } = graph;
    map._roomId = new Int16Array(map.w * map.h).fill(-1);
    for (const r of rooms) this.carveShape(map, r);

    const hLine = (x0, x1, y, w) => {
      const offs = w === 1 ? [0] : w === 2 ? [0, 1] : [-1, 0, 1];
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (const k of offs) {
          const yy = U.clamp(y + k, 1, map.h - 2), xx = U.clamp(x, 1, map.w - 2);
          if (map.t[yy * map.w + xx] !== TILE.FLOOR) map.t[yy * map.w + xx] = TILE.FLOOR;
        }
    };
    const vLine = (y0, y1, x, w) => {
      const offs = w === 1 ? [0] : w === 2 ? [0, 1] : [-1, 0, 1];
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (const k of offs) {
          const xx = U.clamp(x + k, 1, map.w - 2), yy = U.clamp(y, 1, map.h - 2);
          if (map.t[yy * map.w + xx] !== TILE.FLOOR) map.t[yy * map.w + xx] = TILE.FLOOR;
        }
    };
    for (const e of edges) {
      const A = rooms[e.a], B = rooms[e.b];
      if (U.chance(rng, 0.5)) { hLine(A.cx, B.cx, A.cy, e.width); vLine(A.cy, B.cy, B.cx, e.width); }
      else { vLine(A.cy, B.cy, A.cx, e.width); hLine(A.cx, B.cx, B.cy, e.width); }
    }
    map.rooms = rooms;
  },

  // ========== Enhanced cave layout ==========
  carveCaveLayout(map, rng, graph) {
    const { rooms, edges } = graph;
    map._roomId = new Int16Array(map.w * map.h).fill(-1);
    const { w, h } = map;

    for (const r of rooms) {
      const radius = Math.max(r.w, r.h) / 2;
      let x = r.cx, y = r.cy, carved = 0;
      const target = Math.floor(Math.PI * radius * radius * 0.4);
      let steps = 0;
      while (carved < target && steps++ < target * 10) {
        const ix = Math.round(x), iy = Math.round(y);
        if (ix > 1 && ix < w - 2 && iy > 1 && iy < h - 2) {
          const i = iy * w + ix;
          if (map.t[i] === TILE.WALL) { map.t[i] = TILE.FLOOR; map._roomId[i] = r.id; carved++; }
        }
        if (U.chance(rng, 0.55)) {
          const dir = U.ri(rng, 0, 3);
          x += [1, -1, 0, 0][dir]; y += [0, 0, 1, -1][dir];
        } else { x += U.rf(rng, -1.5, 1.5); y += U.rf(rng, -1.5, 1.5); }
        x = U.clamp(x, r.cx - radius - 2, r.cx + radius + 2);
        y = U.clamp(y, r.cy - radius - 2, r.cy + radius + 2);
        if (U.chance(rng, 0.01)) { x = r.cx + U.rf(rng, -radius * 0.4, radius * 0.4); y = r.cy + U.rf(rng, -radius * 0.4, radius * 0.4); }
      }
    }

    for (const e of edges) {
      const A = rooms[e.a], B = rooms[e.b];
      let x = A.cx, y = A.cy, steps = 0;
      while ((Math.abs(x - B.cx) > 1 || Math.abs(y - B.cy) > 1) && steps++ < 400) {
        const dx = B.cx - x, dy = B.cy - y;
        if (U.chance(rng, 0.65)) { if (Math.abs(dx) > Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy); }
        else { x += [1, -1, 0, 0][U.ri(rng, 0, 3)]; y += [0, 0, 1, -1][U.ri(rng, 0, 3)]; }
        x = U.clamp(Math.round(x), 2, w - 3); y = U.clamp(Math.round(y), 2, h - 3);
        if (map.t[y * w + x] === TILE.WALL) map.t[y * w + x] = TILE.FLOOR;
        if (U.chance(rng, 0.5)) {
          const nx = U.clamp(x + [1, -1, 0, 0][U.ri(rng, 0, 3)], 2, w - 3);
          const ny = U.clamp(y + [0, 0, 1, -1][U.ri(rng, 0, 3)], 2, h - 3);
          if (map.t[ny * w + nx] === TILE.WALL) map.t[ny * w + nx] = TILE.FLOOR;
        }
      }
    }

    for (let pass = 0; pass < 2; pass++)
      for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
          if (!(dx === 0 && dy === 0) && map.t[(yy + dy) * w + (xx + dx)] !== TILE.WALL) n++;
        const i = yy * w + xx;
        if (map.t[i] === TILE.WALL && n >= 6) map.t[i] = TILE.FLOOR;
        else if (map.t[i] !== TILE.WALL && n <= 2) map.t[i] = TILE.WALL;
      }

    for (const r of rooms) {
      let mnX = w, mnY = h, mxX = 0, mxY = 0, cnt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (map._roomId[y * w + x] === r.id && map.t[y * w + x] !== TILE.WALL) {
          if (x < mnX) mnX = x; if (x > mxX) mxX = x; if (y < mnY) mnY = y; if (y > mxY) mxY = y; cnt++;
        }
      }
      if (cnt > 0) { r.x = mnX; r.y = mnY; r.w = mxX - mnX + 1; r.h = mxY - mnY + 1; r.cx = Math.round((mnX + mxX) / 2); r.cy = Math.round((mnY + mxY) / 2); }
      else { r.x = Math.floor(r.cx - 2); r.y = Math.floor(r.cy - 2); r.w = 5; r.h = 5; }
    }
    map.rooms = rooms;
  },

  // ========== Secret rooms (hidden behind breakable walls) ==========
  placeSecretRooms(map, rng, graph) {
    const { w, h } = map;
    const nSecrets = U.ri(rng, 1, 3);
    let placed = 0;

    for (let attempt = 0; attempt < 60 && placed < nSecrets; attempt++) {
      const rw = U.ri(rng, 4, 6), rh = U.ri(rng, 4, 6);
      const rx = U.ri(rng, 3, w - rw - 3), ry = U.ri(rng, 3, h - rh - 3);

      let allWall = true;
      for (let y = ry - 1; y <= ry + rh && allWall; y++)
        for (let x = rx - 1; x <= rx + rw && allWall; x++)
          if (map.t[y * w + x] !== TILE.WALL) allWall = false;
      if (!allWall) continue;

      let doorX = -1, doorY = -1;
      const edges = [];
      for (let x = rx; x < rx + rw; x++) { edges.push([x, ry - 1]); edges.push([x, ry + rh]); }
      for (let y = ry; y < ry + rh; y++) { edges.push([rx - 1, y]); edges.push([rx + rw, y]); }
      U.shuffle(rng, edges);
      for (const [ex, ey] of edges) {
        let adjFloor = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ex + dx, ny = ey + dy;
          if (nx >= rx && nx < rx + rw && ny >= ry && ny < ry + rh) continue;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && map.t[ny * w + nx] !== TILE.WALL) { adjFloor = true; break; }
        }
        if (adjFloor) { doorX = ex; doorY = ey; break; }
      }
      if (doorX < 0) continue;

      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++)
          map.t[y * w + x] = TILE.FLOOR;
      map.t[doorY * w + doorX] = TILE.FLOOR;

      const sr = {
        x: rx, y: ry, w: rw, h: rh,
        cx: rx + (rw >> 1), cy: ry + (rh >> 1),
        archetype: 'secret', depth: 99, difficulty: 0.8,
        secret: true, id: map.rooms.length,
      };
      map.rooms.push(sr);

      map.props.push({
        kind: 'cracked_wall', x: doorX + 0.5, y: doorY + 0.5,
        seed: doorX * 31 + doorY, hp: 3, smashable: true, mat: 'stone',
        secret: true,
      });

      placed++;
    }
  },

  // ========== Environmental storytelling ==========
  placeEnvironmental(map, rng) {
    const { w, h } = map;
    const occ = new Set();
    for (const p of map.props) occ.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
    for (const t of map.things) occ.add(`${Math.floor(t.x)},${Math.floor(t.y)}`);

    const tryPlace = (x, y) => {
      const k = `${x},${y}`;
      if (occ.has(k)) return false;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
      if (map.t[y * w + x] !== TILE.FLOOR) return false;
      occ.add(k);
      return true;
    };

    const SETPIECES = {
      crypt: [
        (r, rng) => {
          const cx = r.cx, cy = r.cy;
          for (let i = 0; i < 4; i++) {
            const dx = U.ri(rng, -3, 3), dy = U.ri(rng, -3, 3);
            if (tryPlace(cx + dx, cy + dy))
              map.props.push({ kind: 'bloodstain', x: cx + dx + 0.5, y: cy + dy + 0.5, seed: U.ri(rng, 0, 999) });
          }
        },
        (r, rng) => {
          for (let i = 0; i < 2; i++) {
            const x = U.ri(rng, r.x + 1, r.x + r.w - 2), y = U.ri(rng, r.y + 1, r.y + r.h - 2);
            if (tryPlace(x, y))
              map.props.push({ kind: 'corpse', x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 999) });
          }
        },
      ],
      prison: [
        (r, rng) => {
          const x = U.ri(rng, r.x + 1, r.x + r.w - 2), y = U.ri(rng, r.y + 1, r.y + r.h - 2);
          if (tryPlace(x, y))
            map.props.push({ kind: 'chains', x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 999) });
          for (let i = 0; i < 3; i++) {
            const bx = U.ri(rng, r.x, r.x + r.w - 1), by = U.ri(rng, r.y, r.y + r.h - 1);
            if (tryPlace(bx, by))
              map.props.push({ kind: 'bloodstain', x: bx + 0.5, y: by + 0.5, seed: U.ri(rng, 0, 999) });
          }
        },
      ],
      ritual: [
        (r, rng) => {
          const cx = r.cx, cy = r.cy;
          for (let k = 0; k < 5; k++) {
            const a = k * Math.PI * 2 / 5;
            const px = Math.round(cx + Math.cos(a) * 3), py = Math.round(cy + Math.sin(a) * 3);
            if (tryPlace(px, py))
              map.props.push({ kind: 'bloodstain', x: px + 0.5, y: py + 0.5, seed: U.ri(rng, 0, 999) });
          }
          if (tryPlace(cx, cy + 1))
            map.props.push({ kind: 'corpse', x: cx + 0.5, y: cy + 1.5, seed: U.ri(rng, 0, 999) });
        },
      ],
      combat: [
        (r, rng) => {
          if (r.difficulty < 0.4 || !U.chance(rng, 0.25)) return;
          const x = U.ri(rng, r.x + 1, r.x + r.w - 2), y = U.ri(rng, r.y + 1, r.y + r.h - 2);
          if (tryPlace(x, y)) {
            map.props.push({ kind: 'campfire', x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 999) });
            map.lights.push({ x: x + 0.5, y: y + 0.5, r: 3.2, color: '#ff8a3f', flick: true });
          }
        },
      ],
      boss_lair: [
        (r, rng) => {
          const n = U.ri(rng, 3, 6);
          for (let i = 0; i < n; i++) {
            const x = U.ri(rng, r.x + 2, r.x + r.w - 3), y = U.ri(rng, r.y + 2, r.y + r.h - 3);
            if (tryPlace(x, y))
              map.props.push({ kind: U.pick(rng, ['corpse', 'bloodstain', 'bones']), x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 999) });
          }
        },
      ],
      secret: [
        (r, rng) => {
          if (tryPlace(r.cx, r.cy))
            map.props.push({ kind: 'treasure_pile', x: r.cx + 0.5, y: r.cy + 0.5, seed: U.ri(rng, 0, 999) });
          map.lights.push({ x: r.cx + 0.5, y: r.cy + 0.5, r: 3.5, color: '#ffd94f', flick: true });
        },
      ],
    };

    for (const room of map.rooms) {
      const pieces = SETPIECES[room.archetype];
      if (!pieces) continue;
      const fn = U.pick(rng, pieces);
      fn(room, rng);
    }

    // Blood trails between connected rooms with high difficulty
    for (const room of map.rooms) {
      if (room.difficulty < 0.6 || !U.chance(rng, 0.18)) continue;
      const x1 = room.cx, y1 = room.cy;
      const dx = U.ri(rng, -6, 6), dy = U.ri(rng, -6, 6);
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let s = 0; s < steps; s++) {
        const t = s / Math.max(1, steps);
        const bx = Math.round(x1 + dx * t), by = Math.round(y1 + dy * t);
        if (U.chance(rng, 0.6) && tryPlace(bx, by))
          map.props.push({ kind: 'bloodstain', x: bx + 0.5, y: by + 0.5, seed: U.ri(rng, 0, 999) });
      }
    }
  },

  // ========== Trap corridors (spike strips and arrow traps in hallways) ==========
  placeTrapCorridors(map, rng) {
    const { w, h } = map;
    const depth = map.depth || 1;
    if (depth < 2 && map.actIdx !== 'abyss') return;

    const isCorr = (x, y) => {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
      if (map.t[y * w + x] !== TILE.FLOOR) return false;
      return !this.inRoom(map, x, y);
    };

    const nTraps = U.ri(rng, 2, 5 + depth);
    let placed = 0;
    for (let attempt = 0; attempt < 100 && placed < nTraps; attempt++) {
      const x = U.ri(rng, 3, w - 4), y = U.ri(rng, 3, h - 4);
      if (!isCorr(x, y)) continue;
      if (Math.abs(x - map.entry.x) < 6 && Math.abs(y - map.entry.y) < 6) continue;
      if (map.haz[y * w + x]) continue;

      if (U.chance(rng, 0.6)) {
        map.haz[y * w + x] = HAZ.SPIKES;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (isCorr(nx, ny) && !map.haz[ny * w + nx] && U.chance(rng, 0.5))
            map.haz[ny * w + nx] = HAZ.SPIKES;
        }
      } else {
        map.props.push({
          kind: 'arrow_trap', x: x + 0.5, y: y + 0.5,
          seed: U.ri(rng, 0, 9999), trap: true,
          dmg: 5 + (map.mlvl || 1) * 2, elem: 'phys',
        });
      }
      placed++;
    }

    // Pressure plates near traps (cosmetic markers for spike traps)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        if (map.haz[y * w + x] !== HAZ.SPIKES) continue;
        if (!isCorr(x, y)) continue;
        if (U.chance(rng, 0.3))
          map.props.push({ kind: 'pressure_plate', x: x + 0.5, y: y + 0.5, seed: x * 17 + y });
      }
  },

  // ========== Main generation pipeline ==========
  generate(opts) {
    const rng = makeRng(opts.seed >>> 0);
    const isAbyss = opts.actIdx === 'abyss';
    const act = isAbyss ? ABYSS : ACTS[opts.actIdx];
    const theme = isAbyss ? ABYSS.themes[(opts.abyssFloor - 1) % ABYSS.themes.length] : act.theme;
    const isBoss = !isAbyss && opts.depth === 3;
    const size = U.clamp(52 + (isAbyss ? 10 : opts.actIdx * 8) + opts.depth * 4, 48, 92);
    const w = size, h = size;

    let affix = null;
    if (isAbyss && opts.abyssFloor >= 3) affix = U.pick(rng, DUNGEON_AFFIXES);

    const map = {
      w, h, theme, isBoss,
      actIdx: opts.actIdx, depth: opts.depth, abyssFloor: opts.abyssFloor || 0,
      t: new Uint8Array(w * h), haz: new Uint8Array(w * h),
      variant: new Uint8Array(w * h), explored: new Uint8Array(w * h),
      lights: [], props: [], packs: [], things: [], clues: [], encounters: [], rooms: [], doors: [],
      mlvl: isAbyss ? ABYSS.mlvl0 + (opts.abyssFloor - 1) * 2 : act.mlvl + (opts.depth - 1) * 3,
      pool: act.pool,
      name: isAbyss ? `The Endless Abyss — Floor ${opts.abyssFloor}`
        : `${act.name} — ${isBoss ? 'Sanctum' : 'Depth ' + opts.depth}`,
      affix,
    };
    if (affix) map.name += ` [${affix.name}]`;

    const cavey = theme === 'cavern' || theme === 'fane';
    let nRooms = isBoss ? U.ri(rng, 6, 8) : U.ri(rng, 10 + (isAbyss ? 2 : opts.actIdx), 15 + (isAbyss ? 5 : opts.actIdx * 2));
    if (affix && affix.roomMult) nRooms = Math.round(nRooms * affix.roomMult);
    nRooms = U.clamp(nRooms, 6, 24);

    let graph = null;
    for (let attempt = 0; attempt < 5 && !graph; attempt++)
      graph = this.buildGraph(rng, nRooms, w, h, affix);

    if (!graph) {
      this._fallbackRooms(map, rng, isBoss);
    } else if (cavey) {
      this.carveCaveLayout(map, rng, graph);
    } else {
      this.carveGraphLayout(map, rng, graph);
    }

    if (graph && nRooms >= 10) this.placeSecretRooms(map, rng, graph);
    this.ensureConnectivity(map, rng);
    if (graph) this._graphEntryExit(map, rng, graph, isBoss);
    else this.placeEntryExit(map, rng, isBoss);
    if (!cavey) this.placeDoors(map, rng);
    for (let i = 0; i < w * h; i++) map.variant[i] = Math.floor(rng() * 6);
    this.decorate(map, rng);
    this.placeEnvironmental(map, rng);
    this.placeHazards(map, rng);
    this.placeTrapCorridors(map, rng);
    this.placeSpawns(map, rng);
    this.placeThings(map, rng);
    this.placeNarrative(map, rng, opts.seed >>> 0, opts.narrativeState);
    this.computeAO(map);
    return map;
  },

  _fallbackRooms(map, rng, isBoss) {
    const { w, h } = map;
    const nRooms = isBoss ? 6 : U.ri(rng, 9, 13);
    const rooms = [];
    let tries = 0;
    while (rooms.length < nRooms && tries++ < 400) {
      const rw = U.ri(rng, 5, 11), rh = U.ri(rng, 5, 11);
      const rx = U.ri(rng, 2, w - rw - 3), ry = U.ri(rng, 2, h - rh - 3);
      const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1), archetype: 'combat', depth: 0, difficulty: 0.2 };
      if (rooms.some(r => rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y)) continue;
      rooms.push(room);
    }
    if (isBoss && rooms.length > 1) {
      let far = rooms[1], fd = 0;
      for (let i = 1; i < rooms.length; i++) {
        const d = U.dist2(rooms[0].cx, rooms[0].cy, rooms[i].cx, rooms[i].cy);
        if (d > fd) { fd = d; far = rooms[i]; }
      }
      far.x = U.clamp(far.x - 3, 2, map.w - 4); far.y = U.clamp(far.y - 3, 2, map.h - 4);
      far.w = Math.min(17, map.w - far.x - 3); far.h = Math.min(17, map.h - far.y - 3);
      far.cx = far.x + (far.w >> 1); far.cy = far.y + (far.h >> 1); far.boss = true;
    }
    for (const r of rooms)
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          map.t[this.idx(map, x, y)] = TILE.FLOOR;
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      this._corridor(map, rng, a.cx, a.cy, b.cx, b.cy);
    }
    for (let i = 0; i < 3 && rooms.length > 3; i++) {
      const a = U.pick(rng, rooms), b = U.pick(rng, rooms);
      if (a !== b) this._corridor(map, rng, a.cx, a.cy, b.cx, b.cy);
    }
    map.rooms = rooms;
  },

  _corridor(map, rng, x1, y1, x2, y2) {
    const wide = U.chance(rng, 0.5) ? 1 : 0;
    const horizFirst = U.chance(rng, 0.5);
    const dig = (x, y) => {
      for (let dy = 0; dy <= wide; dy++) for (let dx = 0; dx <= wide; dx++) {
        const xx = U.clamp(x + dx, 1, map.w - 2), yy = U.clamp(y + dy, 1, map.h - 2);
        map.t[this.idx(map, xx, yy)] = TILE.FLOOR;
      }
    };
    let x = x1, y = y1;
    if (horizFirst) { while (x !== x2) { dig(x, y); x += Math.sign(x2 - x); } while (y !== y2) { dig(x, y); y += Math.sign(y2 - y); } }
    else { while (y !== y2) { dig(x, y); y += Math.sign(y2 - y); } while (x !== x2) { dig(x, y); x += Math.sign(x2 - x); } }
    dig(x2, y2);
  },

  // ========== Connectivity ==========
  ensureConnectivity(map, rng) {
    const { w, h } = map;
    const comp = new Int32Array(w * h).fill(-1);
    const sizes = [];
    for (let s = 0; s < w * h; s++) {
      if (map.t[s] === TILE.WALL || comp[s] >= 0) continue;
      const c = sizes.length, stack = [s]; comp[s] = c; let sz = 0;
      while (stack.length) {
        const i = stack.pop(); sz++;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (comp[j] < 0 && map.t[j] !== TILE.WALL) { comp[j] = c; stack.push(j); }
        }
      }
      sizes.push(sz);
    }
    if (!sizes.length) {
      for (let y = h / 2 - 3 | 0; y < h / 2 + 3; y++) for (let x = w / 2 - 3 | 0; x < w / 2 + 3; x++) {
        map.t[this.idx(map, x, y)] = TILE.FLOOR; comp[this.idx(map, x, y)] = 0;
      }
      sizes.push(36);
    }
    let big = 0;
    for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[big]) big = c;
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (map.t[i] === TILE.WALL) continue;
      if (comp[i] === big) seen[i] = 1;
      else map.t[i] = TILE.WALL;
    }
    map._reach = seen;
  },

  // ========== Entry/exit placement ==========
  _graphEntryExit(map, rng, graph, isBoss) {
    const { rooms, entranceIdx, bossIdx } = graph;
    const eRoom = rooms[entranceIdx], bRoom = rooms[bossIdx];

    let entryI = this.idx(map, eRoom.cx, eRoom.cy);
    if (map.t[entryI] === TILE.WALL) {
      const floors = [];
      for (let i = 0; i < map.w * map.h; i++) if (map.t[i] !== TILE.WALL) floors.push(i);
      entryI = U.pick(rng, floors);
    }

    const bfsFarthest = from => {
      const dist = new Int32Array(map.w * map.h).fill(-1);
      const q = [from]; dist[from] = 0; let qi = 0, best = 0, far = from;
      while (qi < q.length) {
        const i = q[qi++], x = i % map.w, y = (i / map.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= map.w || yy >= map.h) continue;
          const j = yy * map.w + xx;
          if (map.t[j] !== TILE.WALL && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); if (dist[j] > best) { best = dist[j]; far = j; } }
        }
      }
      return far;
    };

    let exitI;
    if (isBoss) {
      exitI = this.idx(map, bRoom.cx, bRoom.cy);
      if (map.t[exitI] === TILE.WALL) exitI = bfsFarthest(entryI);
    } else {
      exitI = bfsFarthest(entryI);
    }

    map.t[exitI] = TILE.EXIT;
    map.t[entryI] = TILE.ENTRY;
    map.entry = { x: entryI % map.w + 0.5, y: ((entryI / map.w) | 0) + 0.5 };
    map.exit = { x: exitI % map.w + 0.5, y: ((exitI / map.w) | 0) + 0.5 };
    if (isBoss) map.bossSpot = { x: bRoom.cx + 0.5, y: bRoom.cy - 2 + 0.5 };
  },

  placeEntryExit(map, rng, isBoss) {
    const { w, h } = map;
    const floors = [];
    for (let i = 0; i < w * h; i++) if (map.t[i] !== TILE.WALL) floors.push(i);
    let entryI;
    if (map.rooms.length && !map.rooms[0].boss) entryI = this.idx(map, map.rooms[0].cx, map.rooms[0].cy);
    else entryI = U.pick(rng, floors);
    if (map.t[entryI] === TILE.WALL) entryI = U.pick(rng, floors);
    let exitI = entryI;
    const bossRoom = map.rooms.find(r => r.boss);
    if (bossRoom) exitI = this.idx(map, bossRoom.cx, bossRoom.cy);
    else {
      const dist = new Int32Array(w * h).fill(-1);
      const q = [entryI]; dist[entryI] = 0; let qi = 0, best = 0;
      while (qi < q.length) {
        const i = q[qi++], x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (map.t[j] !== TILE.WALL && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); if (dist[j] > best) { best = dist[j]; exitI = j; } }
        }
      }
    }
    map.t[entryI] = TILE.ENTRY; map.t[exitI] = TILE.EXIT;
    map.entry = { x: entryI % w + 0.5, y: ((entryI / w) | 0) + 0.5 };
    map.exit = { x: exitI % w + 0.5, y: ((exitI / w) | 0) + 0.5 };
    if (bossRoom) map.bossSpot = { x: bossRoom.cx + 0.5, y: bossRoom.cy - 2 + 0.5 };
  },

  // ========== Doors ==========
  placeDoors(map, rng) {
    const { w, h } = map;
    const kinds = THEMES[map.theme].doors || ['arch', 'wood'];
    const seen = new Uint8Array(w * h);
    for (const r of map.rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const onRing = (x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h);
        if (!onRing || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = this.idx(map, x, y);
        if (seen[i] || map.t[i] !== TILE.FLOOR) continue;
        const touches = (x >= r.x && x < r.x + r.w && (y === r.y - 1 || y === r.y + r.h)) ||
          (y >= r.y && y < r.y + r.h && (x === r.x - 1 || x === r.x + r.w));
        if (!touches) continue;
        const wx = this.isWall(map, x - 1, y) && this.isWall(map, x + 1, y);
        const wy = this.isWall(map, x, y - 1) && this.isWall(map, x, y + 1);
        if (!wx && !wy) continue;
        seen[i] = 1;
        map.t[i] = TILE.DOOR;
        const door = {
          x: x + 0.5, y: y + 0.5, i,
          ori: wx ? 'v' : 'h',
          kind: U.pick(rng, kinds),
          open: 0, swing: U.chance(rng, 0.5) ? 1 : -1,
          seed: U.ri(rng, 0, 9999),
        };
        if ((r.archetype === 'treasure' || r.archetype === 'secret') && U.chance(rng, 0.35)) {
          door.locked = true;
          door.kind = 'barred';
        }
        map.doors.push(door);
      }
    }
  },

  // ========== Decoration (massively enhanced) ==========
  decorate(map, rng) {
    const { w, h } = map;
    const th = THEMES[map.theme];
    const occ = new Uint8Array(w * h);
    const propMult = (map.affix && map.affix.propMult) || 1;

    // Mark entry/exit as occupied
    occ[this.idx(map, Math.floor(map.entry.x), Math.floor(map.entry.y))] = 1;
    occ[this.idx(map, Math.floor(map.exit.x), Math.floor(map.exit.y))] = 1;

    const isFloor = (x, y) => x >= 0 && y >= 0 && x < w && y < h && map.t[y * w + x] === TILE.FLOOR;
    const nearWall = (x, y) => this.isWall(map, x - 1, y) || this.isWall(map, x + 1, y) || this.isWall(map, x, y - 1) || this.isWall(map, x, y + 1);
    const place = (kind, x, y, extra) => {
      const i = y * w + x;
      if (occ[i]) return null;
      occ[i] = 1;
      const pr = { kind, x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 9999), ...extra };
      map.props.push(pr);
      return pr;
    };

    // --- Per-archetype room decoration ---
    for (const room of map.rooms) {
      const arch = room.archetype || 'combat';
      const rc = room.cx, rcy = room.cy;

      if (arch === 'hall' && Math.min(room.w, room.h) >= 10) {
        const step = Math.min(room.w, room.h) >= 14 ? 4 : 3;
        for (let y = room.y + 2; y < room.y + room.h - 2; y += step)
          for (let x = room.x + 2; x < room.x + room.w - 2; x += step) {
            if (x === rc && y === rcy) continue;
            if (isFloor(x, y) && !occ[y * w + x]) place('pillar', x, y);
          }
      }

      if (arch === 'crypt') {
        if (isFloor(rc, rcy) && !occ[rcy * w + rc])
          place('sarcophagus', rc, rcy, { hp: 1, mat: 'stone', smashable: true });
        for (let y = room.y + 1; y < room.y + room.h - 1; y += 2)
          for (let x = room.x + 1; x < room.x + room.w - 1; x += 2) {
            if (!isFloor(x, y) || occ[y * w + x]) continue;
            if (nearWall(x, y) && U.chance(rng, 0.2))
              place('grave', x, y);
          }
      }

      if (arch === 'shrine') {
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3;
          const px = Math.round(rc + Math.cos(a) * 2.5), py = Math.round(rcy + Math.sin(a) * 2.5);
          if (isFloor(px, py) && !occ[py * w + px]) {
            const pr = place('candles', px, py, { lit: false });
            if (pr) map.lights.push({ x: pr.x, y: pr.y, r: 2.4, color: '#ffcf6f', flick: true, lit: false, kindle: true, prop: pr });
          }
        }
      }

      if (arch === 'boss_lair') {
        const bR = Math.max(3, Math.min(room.w, room.h) / 2 - 2);
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3 + rng() * 0.3;
          const px = Math.round(rc + Math.cos(a) * bR), py = Math.round(rcy + Math.sin(a) * bR);
          if (isFloor(px, py) && !occ[py * w + px]) place('pillar', px, py);
        }
        const bR2 = bR + 2;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          const px = Math.round(rc + Math.cos(a) * bR2), py = Math.round(rcy + Math.sin(a) * bR2);
          if (isFloor(px, py) && !occ[py * w + px]) {
            const pr = place('brazier_unlit', px, py, { fixture: true, lit: false });
            if (pr) map.lights.push({ x: pr.x, y: pr.y, r: 3.5, color: th.torch, flick: true, lit: false, kindle: true, prop: pr });
          }
        }
      }

      if (arch === 'elite') {
        for (let y = room.y; y < room.y + room.h; y++)
          for (let x = room.x; x < room.x + room.w; x++) {
            if (!isFloor(x, y) || occ[y * w + x]) continue;
            if (nearWall(x, y) && U.chance(rng, 0.1))
              place(U.pick(rng, ['weaponrack', 'banner']), x, y);
          }
      }

      if (arch === 'study') {
        if (isFloor(rc, rcy) && !occ[rcy * w + rc]) place('table', rc, rcy);
        for (let y = room.y; y < room.y + room.h; y++)
          for (let x = room.x; x < room.x + room.w; x++) {
            if (!isFloor(x, y) || occ[y * w + x]) continue;
            if (nearWall(x, y) && U.chance(rng, 0.22)) place('bookshelf', x, y);
          }
      }

      if (arch === 'prison') {
        for (let k = 0; k < 3; k++) {
          const px = U.ri(rng, room.x + 1, room.x + room.w - 2);
          const py = U.ri(rng, room.y + 1, room.y + room.h - 2);
          if (isFloor(px, py) && !occ[py * w + px]) place('bones', px, py);
        }
      }

      if (arch === 'ritual') {
        if (isFloor(rc, rcy) && !occ[rcy * w + rc]) place('idol', rc, rcy);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          const px = Math.round(rc + Math.cos(a) * 2), py = Math.round(rcy + Math.sin(a) * 2);
          if (isFloor(px, py) && !occ[py * w + px]) {
            const pr = place('candles', px, py, { lit: false });
            if (pr) map.lights.push({ x: pr.x, y: pr.y, r: 2.4, color: '#ffcf6f', flick: true, lit: false, kindle: true, prop: pr });
          }
        }
      }

      if (arch === 'arena') {
        const corners = [
          [room.x + 2, room.y + 2], [room.x + room.w - 3, room.y + 2],
          [room.x + 2, room.y + room.h - 3], [room.x + room.w - 3, room.y + room.h - 3],
        ];
        for (const [px, py] of corners)
          if (isFloor(px, py) && !occ[py * w + px]) place('pillar', px, py);
      }

      if (arch === 'antechamber') {
        for (let y = room.y; y < room.y + room.h; y++)
          for (let x = room.x; x < room.x + room.w; x++) {
            if (!isFloor(x, y) || occ[y * w + x]) continue;
            if (nearWall(x, y) && U.chance(rng, 0.12))
              place(U.pick(rng, ['weaponrack', 'banner', 'statue']), x, y);
          }
      }

      if (arch === 'entrance') {
        const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2]];
        for (const [dx, dy] of offsets) {
          const px = rc + dx, py = rcy + dy;
          if (isFloor(px, py) && !occ[py * w + px]) {
            const pr = place('candles', px, py, { lit: false });
            if (pr) map.lights.push({ x: pr.x, y: pr.y, r: 3.0, color: '#8fc8ff', flick: false, lit: false, kindle: true, prop: pr });
          }
        }
      }
    }

    // --- Corridor sconces (start cold) ---
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (map.t[this.idx(map, x, y)] !== TILE.WALL) continue;
      let hall = false;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (map.t[this.idx(map, nx, ny)] === TILE.WALL) continue;
        if (!this.inRoom(map, nx, ny)) { hall = true; break; }
      }
      if (hall && U.chance(rng, 0.16)) {
        const pr = { kind: 'torch', x: x + 0.5, y: y + 0.5, seed: x * 31 + y, color: th.torch, lit: false };
        map.props.push(pr);
        map.lights.push({ x: x + 0.5, y: y + 0.5, r: 4.5, color: th.torch, flick: true, torch: true, lit: false, kindle: true, prop: pr });
      }
    }

    // --- Entry/exit lights ---
    map.lights.push({ x: map.entry.x, y: map.entry.y, r: 5, color: '#8fc8ff', flick: false });
    map.lights.push({ x: map.exit.x, y: map.exit.y, r: 5, color: '#ff8a2f', flick: true });

    // --- Floor prop scatter ---
    const props = th.props || [];
    const SMASHABLE = {
      crate: 'wood', pot: 'clay', urn: 'clay', sack: 'cloth', barrelprop: 'wood', sarcophagus: 'stone',
      spider_eggsac: 'cloth', plague_vat: 'wood', dynamite: 'wood', soul_cage: 'stone',
      haunted_doll: 'cloth', corrupted_stone: 'stone', charred_bones: 'stone', giant_clam: 'stone'
    };
    const LOOSE = { pot: 1, sack: 1, chair: 1, crate: 1, urn: 1 };
    if (props.length) {
      const n = Math.floor(w * h * 0.025 * propMult);
      for (let i = 0; i < n; i++) {
        const x = U.ri(rng, 2, w - 3), y = U.ri(rng, 2, h - 3);
        const t = map.t[this.idx(map, x, y)];
        if (t !== TILE.FLOOR || occ[y * w + x]) continue;
        if (Math.abs(x - map.entry.x) < 3 && Math.abs(y - map.entry.y) < 3) continue;
        let kind = U.pick(rng, props);
        if (kind === 'cobweb' && !(this.isWall(map, x, y - 1) || this.isWall(map, x - 1, y))) kind = 'rubble';
        const pr = { kind, x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 9999) };
        if (SMASHABLE[kind]) { pr.hp = 1; pr.mat = SMASHABLE[kind]; pr.smashable = true; }
        if (LOOSE[kind]) pr.loose = true;
        map.props.push(pr);
        occ[y * w + x] = 1;
        const fire = (col, rad) => {
          pr.lit = false;
          map.lights.push({ x: pr.x, y: pr.y, r: rad, color: col, flick: true, lit: false, kindle: true, prop: pr });
        };
        if (kind === 'crystal') map.lights.push({ x: pr.x, y: pr.y, r: 2.6, color: '#7bdcff', flick: false });
        else if (kind === 'mushroom') map.lights.push({ x: pr.x, y: pr.y, r: 2.2, color: '#6ae8a0', flick: false });
        else if (kind === 'orevein') map.lights.push({ x: pr.x, y: pr.y, r: 1.8, color: '#ffd94f', flick: false });
        else if (kind === 'candles') fire('#ffcf6f', 2.4);
        else if (kind === 'lantern') fire('#ffcf8f', 3.2);
        else if (kind === 'chandelier') fire('#ffc98f', 4.2);
      }
    }

    // --- Interactive fixtures ---
    const fixtures = th.fixtures || [];
    if (fixtures.length) {
      const nf = U.ri(rng, 3, 7);
      for (let i = 0; i < nf; i++) {
        const kind = U.pick(rng, fixtures);
        let x, y, ok = false;
        for (let tries = 0; tries < 40 && !ok; tries++) {
          x = U.ri(rng, 2, w - 3); y = U.ri(rng, 2, h - 3);
          const ix = this.idx(map, x, y);
          if (map.t[ix] !== TILE.FLOOR || map.haz[ix] || occ[y * w + x]) continue;
          if (Math.abs(x - map.entry.x) < 4 && Math.abs(y - map.entry.y) < 4) continue;
          ok = true;
        }
        if (!ok) continue;
        occ[y * w + x] = 1;
        const pr = { kind, x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 9999), fixture: true, used: false };
        if (kind === 'lever') { pr.on = false; pr.cache = { x: pr.x + U.rf(rng, -2.5, 2.5), y: pr.y + U.rf(rng, -2.5, 2.5) }; }
        else if (kind === 'brazier_unlit') { pr.lit = false; }
        else if (kind === 'orevein') { pr.ore = U.ri(rng, 2, 4); }
        else if (kind === 'bookshelf') { pr.searched = false; }
        else if (kind === 'fountain') { pr.charges = U.ri(rng, 1, 2); map.lights.push({ x: pr.x, y: pr.y, r: 3, color: '#8fd8ff', flick: false }); }
        map.props.push(pr);
      }
    }

    // --- God-ray shafts ---
    map.shafts = [];
    if (th.shaft) {
      const n = U.ri(rng, 4, 7);
      let tries = 0;
      while (map.shafts.length < n && tries++ < 200) {
        const x = U.ri(rng, 4, w - 5), y = U.ri(rng, 4, h - 5);
        if (map.t[this.idx(map, x, y)] !== TILE.FLOOR) continue;
        if (Math.abs(x - map.entry.x) < 6 && Math.abs(y - map.entry.y) < 6) continue;
        if (map.shafts.some(s => Math.abs(s.x - x) < 9 && Math.abs(s.y - y) < 9)) continue;
        map.shafts.push({ x: x + 0.5, y: y + 0.5, phase: rng() * Math.PI * 2, w: U.rf(rng, 0.8, 1.5) });
        map.lights.push({ x: x + 0.5, y: y + 0.5, r: 3.4, color: th.shaft, flick: false });
      }
    }
  },

  // ========== Environmental hazards ==========
  placeHazards(map, rng) {
    const th = THEMES[map.theme];
    let kinds = th.hazards || [];
    if (map.affix && map.affix.hazReplace) kinds = map.affix.hazReplace;
    if (!kinds.length) return;
    const { w, h } = map;
    const clearOf = (x, y, pt, r) => Math.abs(x - pt.x) > r || Math.abs(y - pt.y) > r;
    const spikeMult = (map.affix && map.affix.spikeMult) || 1;

    for (const kind of kinds) {
      if (kind === 'lava' || kind === 'water') {
        const lakes = kind === 'lava' ? U.ri(rng, 3, 6) : U.ri(rng, 2, 4);
        for (let l = 0; l < lakes; l++) {
          const cx = U.ri(rng, 4, w - 5), cy = U.ri(rng, 4, h - 5);
          if (map.t[this.idx(map, cx, cy)] !== TILE.FLOOR) continue;
          if (!clearOf(cx, cy, map.entry, 5) || !clearOf(cx, cy, map.exit, 4)) continue;
          const r = kind === 'lava' ? U.rf(rng, 1.5, 3.2) : U.rf(rng, 1.3, 2.6);
          for (let y = Math.max(1, cy - 4); y <= Math.min(h - 2, cy + 4); y++)
            for (let x = Math.max(1, cx - 4); x <= Math.min(w - 2, cx + 4); x++) {
              const d = U.dist(x, y, cx, cy) + U.rf(rng, -0.6, 0.6);
              const i = this.idx(map, x, y);
              if (d < r && map.t[i] === TILE.FLOOR && !map.haz[i]) map.haz[i] = kind === 'lava' ? HAZ.LAVA : HAZ.WATER;
            }
          if (kind === 'lava') map.lights.push({ x: cx + 0.5, y: cy + 0.5, r: 4 + r, color: '#ff5a1c', flick: true });
        }
      } else {
        const baseDensity = { spikes: 0.004, gas: 0.0025, vent: 0.003, spore: 0.003, ember: 0.0028 }[kind];
        if (baseDensity === undefined) continue;
        const density = baseDensity * (kind === 'spikes' ? spikeMult : 1);
        const type = { spikes: HAZ.SPIKES, gas: HAZ.GAS, vent: HAZ.VENT, spore: HAZ.SPORE, ember: HAZ.EMBER }[kind];
        const n = Math.floor(w * h * density);
        for (let i = 0; i < n; i++) {
          const x = U.ri(rng, 2, w - 3), y = U.ri(rng, 2, h - 3);
          const ix = this.idx(map, x, y);
          if (map.t[ix] !== TILE.FLOOR || map.haz[ix]) continue;
          if (!clearOf(x, y, map.entry, 4)) continue;
          map.haz[ix] = type;
          if (isVent(type))
            map.lights.push({ x: x + 0.5, y: y + 0.5, r: 3.4, color: VENT_KINDS[type].color, vent: ix });
        }
      }
    }
  },

  // ========== Monster packs (encounter budgets) ==========
  placeSpawns(map, rng) {
    const isAbyss = map.actIdx === 'abyss';
    const densityMult = isAbyss ? 1 + map.abyssFloor * 0.04 : 1;
    const spawnMult = (map.affix && map.affix.spawnMult) || 1;
    const eliteBoost = (map.affix && map.affix.eliteBoost) || 0;
    const champBoost = (map.affix && map.affix.champBoost) || 0;
    const extraFam = map.affix && map.affix.extraFam;

    for (const room of map.rooms) {
      if (room.archetype === 'entrance') continue;
      if (room.boss) continue;
      if (!U.chance(rng, 0.82)) continue;

      const area = room.w * room.h;
      const diff = room.difficulty || 0.2;
      const budget = area * (0.3 + diff * 0.7);
      const n = Math.round(U.clamp(budget / 12, 2, 8) * densityMult * spawnMult) + ((map.depth || 1) > 2 ? 1 : 0);

      const fam = U.pick(rng, map.pool);
      const elite = room.archetype === 'elite' ? true : U.chance(rng, diff * 0.2 + eliteBoost);
      const champion = U.chance(rng, diff * 0.28 + champBoost);

      map.packs.push({ x: room.cx + 0.5, y: room.cy + 0.5, fam, n, elite, champion });

      if (area >= 100 && U.chance(rng, 0.35 + diff * 0.2)) {
        const fam2 = (extraFam && U.chance(rng, 0.3)) ? extraFam : U.pick(rng, map.pool);
        map.packs.push({
          x: room.x + 1.5, y: room.y + 1.5, fam: fam2,
          n: Math.max(2, n - 1), elite: U.chance(rng, 0.1 + eliteBoost), champion: false,
        });
      }
    }

    // Arena rooms get a guaranteed champion pack
    for (const room of map.rooms) {
      if (room.archetype !== 'arena') continue;
      const fam = U.pick(rng, map.pool);
      map.packs.push({
        x: room.cx + 0.5, y: room.cy + 0.5, fam,
        n: U.ri(rng, 4, 7), elite: true, champion: true,
      });
    }

    // Secret room guards
    for (const room of map.rooms) {
      if (!room.secret) continue;
      const fam = U.pick(rng, map.pool);
      map.packs.push({
        x: room.cx + 0.5, y: room.cy + 0.5, fam,
        n: U.ri(rng, 2, 4), elite: U.chance(rng, 0.5), champion: false,
      });
    }

    // Cave scatter for sparse maps
    if (map.rooms.length < 8) {
      const extra = 8 - map.rooms.length + 4;
      for (let i = 0; i < extra; i++) {
        const x = U.ri(rng, 3, map.w - 4), y = U.ri(rng, 3, map.h - 4);
        if (map.t[this.idx(map, x, y)] !== TILE.FLOOR) continue;
        if (Math.abs(x - map.entry.x) < 8 && Math.abs(y - map.entry.y) < 8) continue;
        const fam = (extraFam && U.chance(rng, 0.25)) ? extraFam : U.pick(rng, map.pool);
        map.packs.push({
          x: x + 0.5, y: y + 0.5, fam, n: U.ri(rng, 3, 6),
          elite: U.chance(rng, 0.15 + eliteBoost), champion: U.chance(rng, 0.2 + champBoost),
        });
      }
    }
  },

  // ========== Interactables: barrels, chests, shrines ==========
  placeThings(map, rng) {
    const { w, h } = map;
    const spots = [];
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = this.idx(map, x, y);
      if (map.t[i] === TILE.FLOOR && !map.haz[i]) spots.push({ x: x + 0.5, y: y + 0.5 });
    }
    U.shuffle(rng, spots);
    let si = 0;
    const take = () => spots[si++ % spots.length];

    const nBarrel = Math.floor(w * h * 0.005);
    for (let i = 0; i < nBarrel && si < spots.length; i++) {
      const s = take();
      map.things.push({ kind: 'barrel', x: s.x, y: s.y, hp: 1, explosive: map.theme === 'cavern' || map.theme === 'hell' ? U.chance(rng, 0.3) : false });
    }

    // Extra chests in treasure rooms
    let nChest = U.ri(rng, 1, 3);
    for (const room of map.rooms) if (room.archetype === 'treasure') nChest += U.ri(rng, 1, 2);
    for (let i = 0; i < nChest && si < spots.length; i++) {
      const s = take();
      map.things.push({ kind: 'chest', x: s.x, y: s.y, opened: false });
    }

    if (U.chance(rng, 0.65)) {
      const s = take();
      const sh = U.pick(rng, SHRINE_TYPES);
      map.things.push({ kind: 'shrine', x: s.x, y: s.y, shrine: sh, used: false });
      map.lights.push({ x: s.x, y: s.y, r: 3.5, color: '#8fc8ff', flick: false });
    }

    // Extra shrine in shrine rooms
    for (const room of map.rooms) {
      if (room.archetype !== 'shrine') continue;
      const sh = U.pick(rng, SHRINE_TYPES);
      map.things.push({ kind: 'shrine', x: room.cx + 0.5, y: room.cy + 0.5, shrine: sh, used: false });
      map.lights.push({ x: room.cx + 0.5, y: room.cy + 0.5, r: 3.5, color: '#8fc8ff', flick: false });
    }

    const nGold = U.ri(rng, 2, 5);
    for (let i = 0; i < nGold && si < spots.length; i++) {
      const s = take();
      map.things.push({ kind: 'goldpile', x: s.x, y: s.y, taken: false });
    }

    // Secret room loot: guaranteed chest + gold piles
    for (const room of map.rooms) {
      if (!room.secret) continue;
      map.things.push({ kind: 'chest', x: room.cx + 0.5, y: room.cy + 0.5, opened: false });
      for (let i = 0; i < U.ri(rng, 1, 3); i++) {
        const gx = U.ri(rng, room.x, room.x + room.w - 1);
        const gy = U.ri(rng, room.y, room.y + room.h - 1);
        if (map.t[gy * w + gx] === TILE.FLOOR)
          map.things.push({ kind: 'goldpile', x: gx + 0.5, y: gy + 0.5, taken: false });
      }
    }
  },

  // ========== Narrative ==========
  placeNarrative(map, rng, seed, state) {
    if (typeof Narrative === 'undefined') return;
    const occupied = [...map.things, ...map.props];
    const distance = (a, b) => U.dist(a.x, a.y, b.x, b.y);
    const candidates = def => {
      const p = def.placement || {}, out = [];
      for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) {
        const i = this.idx(map, x, y), pt = { x: x + .5, y: y + .5 };
        if (map.t[i] !== TILE.FLOOR || map.haz[i]) continue;
        if (distance(pt, map.entry) < (p.entryDistance || 0) || distance(pt, map.exit) < (p.exitDistance || 0)) continue;
        if (occupied.some(o => distance(pt, o) < 1.5)) continue;
        if (p.wall && !this.isWall(map, x - 1, y) && !this.isWall(map, x + 1, y) && !this.isWall(map, x, y - 1) && !this.isWall(map, x, y + 1)) continue;
        if (p.room && !map.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
        if (p.hazardDistance && map.haz.some((h, j) => h && distance(pt, { x: j % map.w + .5, y: (j / map.w | 0) + .5 }) < p.hazardDistance)) continue;
        if (p.isolated && occupied.some(o => distance(pt, o) < 4)) continue;
        out.push(pt);
      }
      return out;
    };
    for (const def of Narrative.definitions) {
      if (!def.acts.includes(map.actIdx) || !U.chance(rng, def.kind === 'clue' ? .8 : .45)) continue;
      const spots = candidates(def); if (!spots.length) continue;
      const pt = U.pick(rng, spots);
      const site = { ...pt, id: `${seed.toString(16)}:${def.id}:0`, definitionId: def.id,
        narrativeKind: def.kind, title: def.title, prompt: def.prompt };
      Narrative.applyState(site, state);
      map[def.kind === 'clue' ? 'clues' : 'encounters'].push(site);
      occupied.push(site);
    }
  },

  // ========== Town ==========
  generateTown() {
    const w = 28, h = 28;
    const map = {
      w, h, theme: 'town', isBoss: false, actIdx: -1, depth: 0, mlvl: 1,
      t: new Uint8Array(w * h), haz: new Uint8Array(w * h), variant: new Uint8Array(w * h),
      explored: new Uint8Array(w * h).fill(1),
      lights: [], props: [], packs: [], things: [], clues: [], encounters: [], rooms: [], doors: [],
      name: 'Haven\'s Rest', town: true, pool: [],
    };
    const rng = makeRng(777);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      map.t[y * w + x] = border ? TILE.WALL : TILE.FLOOR;
      map.variant[y * w + x] = Math.floor(rng() * 4);
    }
    map.t[2 * w + 14] = TILE.EXIT;
    map.exit = { x: 14.5, y: 2.5 };
    map.entry = { x: 14.5, y: 20.5 };
    map.waypoint = { x: 11.5, y: 14.5 };
    map.portalSpot = { x: 17.5, y: 14.5 };
    map.npcSpots = { healer: { x: 7.5, y: 8.5 }, smith: { x: 21.5, y: 8.5 }, gambler: { x: 6.5, y: 19.5 }, stash: { x: 21.5, y: 19.5 }, elder: { x: 14.5, y: 11.5 } };
    map.lights.push({ x: 14.5, y: 2.5, r: 5, color: '#ff8a2f', flick: true });
    map.lights.push({ x: map.waypoint.x, y: map.waypoint.y, r: 4.5, color: '#8fc8ff', flick: false });
    for (const k in map.npcSpots) map.lights.push({ x: map.npcSpots[k].x, y: map.npcSpots[k].y - 1, r: 3.6, color: '#ffb04f', flick: true });
    for (const [px, py] of [[3, 3], [25, 3], [3, 24], [25, 24], [10, 24], [19, 24]]) {
      map.lights.push({ x: px + 0.5, y: py + 0.5, r: 4, color: '#ffb04f', flick: true, torch: true });
      map.props.push({ kind: 'brazier', x: px + 0.5, y: py + 0.5, seed: px * 7 + py, color: '#ffb04f' });
    }
    for (const [px, py] of [[11, 12], [17, 12], [11, 17], [17, 17]])
      map.props.push({ kind: 'brazier', x: px + 0.5, y: py + 0.5, seed: px * 31 + py, color: '#ffb04f' });
    for (const [px, py] of [[3, 12], [4, 12], [5, 12], [3, 13], [4, 13], [5, 13], [4, 14], [5, 14], [3, 14]])
      map.haz[py * w + px] = HAZ.WATER;
    for (const [px, py] of [[3, 5], [8, 3], [20, 3], [24, 6], [24, 16], [8, 24], [16, 24], [23, 23], [3, 20]])
      map.props.push({ kind: 'tree', x: px + 0.5, y: py + 0.5, seed: px * 13 + py * 7 });
    for (let i = 0; i < 26; i++) {
      const kind = U.pick(rng, ['rock', 'urn', 'rubble', 'candles', 'crate', 'pot', 'sack', 'table', 'chair', 'lantern', 'anvil', 'weaponrack', 'bookshelf']);
      const pr = { kind, x: U.rf(rng, 2, w - 2), y: U.rf(rng, 2, h - 2), seed: i * 77 };
      if (['crate', 'pot', 'urn', 'sack'].includes(kind)) { pr.hp = 1; pr.smashable = true; pr.loose = true; pr.mat = kind === 'pot' || kind === 'urn' ? 'clay' : kind === 'sack' ? 'cloth' : 'wood'; }
      map.props.push(pr);
      if (kind === 'lantern') map.lights.push({ x: pr.x, y: pr.y, r: 3, color: '#ffcf8f', flick: true });
    }
    map.props.push({ kind: 'fountain', x: 14.5, y: 15.5, seed: 5, fixture: true, charges: 99 });
    map.lights.push({ x: 14.5, y: 15.5, r: 3.4, color: '#8fd8ff', flick: false });
    map.shafts = [];
    this.computeAO(map);
    return map;
  },
};
