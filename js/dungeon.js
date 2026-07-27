// ============ DIABLOID: dungeon.js — procedural dungeon generation ============
'use strict';

const TILE = { WALL: 0, FLOOR: 1, EXIT: 2, ENTRY: 3, DOOR: 4 };
const HAZ = { NONE: 0, LAVA: 1, SPIKES: 2, GAS: 3, WATER: 4, VENT: 5 };

// Steam vents fire on a cycle instead of burning constantly: a visible
// build-up, then a scalding jet, then a lull you can walk through. The phase
// is derived from the tile index and the clock rather than stored per tile,
// so the renderer and the damage code agree without sharing state.
const VENT_PERIOD = 3.6;   // seconds for a full charge/erupt/lull cycle
const VENT_JET = 0.85;     // how long the jet is actually out (and lethal)
const VENT_TELL = 0.75;    // warning window before the jet
function ventPhase(i, t) {
  // cheap integer hash so neighbouring vents don't fire in lockstep
  const off = (((i * 2654435761) >>> 0) % 997) / 997 * VENT_PERIOD;
  // JS % keeps the sign of the dividend, so a negative clock would hand back a
  // negative phase — which reads as "jetting" and drives the jet envelope
  // negative, down into negative canvas radii. Normalise into [0, PERIOD).
  const p = (t + off) % VENT_PERIOD;
  return p < 0 ? p + VENT_PERIOD : p;
}
function ventJetting(i, t) { return ventPhase(i, t) < VENT_JET; }
// 0 while dormant, ramping to 1 the instant before the jet fires
function ventCharge(i, t) {
  const p = ventPhase(i, t);
  const lead = VENT_PERIOD - p;
  return lead <= VENT_TELL ? 1 - lead / VENT_TELL : 0;
}

const Dungeon = {

  // opts: { actIdx (0-4 or 'abyss'), depth (level within act, 1-based), abyssFloor, seed }
  generate(opts) {
    const rng = makeRng(opts.seed >>> 0);
    const isAbyss = opts.actIdx === 'abyss';
    const act = isAbyss ? ABYSS : ACTS[opts.actIdx];
    const theme = isAbyss ? ABYSS.themes[(opts.abyssFloor - 1) % ABYSS.themes.length] : act.theme;
    const isBoss = !isAbyss && opts.depth === 3;
    const size = U.clamp(52 + (isAbyss ? 10 : opts.actIdx * 8) + opts.depth * 4, 48, 92);
    const w = size, h = size;

    const map = {
      w, h, theme, isBoss,
      actIdx: opts.actIdx, depth: opts.depth, abyssFloor: opts.abyssFloor || 0,
      t: new Uint8Array(w * h),
      haz: new Uint8Array(w * h),
      variant: new Uint8Array(w * h),
      explored: new Uint8Array(w * h),
      lights: [], props: [], packs: [], things: [], rooms: [], doors: [],
      mlvl: isAbyss ? ABYSS.mlvl0 + (opts.abyssFloor - 1) * 2 : act.mlvl + (opts.depth - 1) * 3,
      pool: act.pool,
      name: isAbyss
        ? `The Endless Abyss — Floor ${opts.abyssFloor}`
        : `${act.name} — ${isBoss ? 'Sanctum' : 'Depth ' + opts.depth}`,
    };

    const cavey = theme === 'cavern' || theme === 'fane';
    if (cavey) this.carveCaves(map, rng); else this.carveRooms(map, rng, isBoss);
    this.ensureConnectivity(map, rng);
    this.placeEntryExit(map, rng, isBoss);
    if (!cavey) this.placeDoors(map, rng);   // caves have no masonry to hang a door on
    for (let i = 0; i < w * h; i++) map.variant[i] = Math.floor(rng() * 6);
    this.decorate(map, rng);
    this.placeHazards(map, rng);
    this.placeSpawns(map, rng);
    this.placeThings(map, rng);
    this.computeAO(map);
    return map;
  },

  // Per-tile ambient occlusion mask: which of the 4 neighbors are walls.
  // Bit 1 = N (x,y-1), 2 = E (x+1,y), 4 = S (x,y+1), 8 = W (x-1,y).
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

  idx(map, x, y) { return y * map.w + x; },
  isWall(map, x, y) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    return map.t[y * map.w + x] === TILE.WALL;
  },

  // ---------- room & corridor layout ----------
  carveRooms(map, rng, isBoss) {
    const { w, h } = map;
    const nRooms = isBoss ? 6 : U.ri(rng, 9, 13);
    const rooms = [];
    let tries = 0;
    while (rooms.length < nRooms && tries++ < 400) {
      const rw = U.ri(rng, 5, 11), rh = U.ri(rng, 5, 11);
      const rx = U.ri(rng, 2, w - rw - 3), ry = U.ri(rng, 2, h - rh - 3);
      const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
      if (rooms.some(r => rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y)) continue;
      rooms.push(room);
    }
    // boss lair: enlarge the room farthest from the first
    if (isBoss && rooms.length > 1) {
      let far = rooms[1], fd = 0;
      for (let i = 1; i < rooms.length; i++) {
        const d = U.dist2(rooms[0].cx, rooms[0].cy, rooms[i].cx, rooms[i].cy);
        if (d > fd) { fd = d; far = rooms[i]; }
      }
      far.x = U.clamp(far.x - 3, 2, map.w - 4); far.y = U.clamp(far.y - 3, 2, map.h - 4);
      far.w = Math.min(17, map.w - far.x - 3); far.h = Math.min(17, map.h - far.y - 3);
      far.cx = far.x + (far.w >> 1); far.cy = far.y + (far.h >> 1);
      far.boss = true;
    }
    for (const r of rooms)
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          map.t[this.idx(map, x, y)] = TILE.FLOOR;
    // connect with L-corridors
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      this.corridor(map, rng, a.cx, a.cy, b.cx, b.cy);
    }
    // a couple of loops for less linearity
    for (let i = 0; i < 3 && rooms.length > 3; i++) {
      const a = U.pick(rng, rooms), b = U.pick(rng, rooms);
      if (a !== b) this.corridor(map, rng, a.cx, a.cy, b.cx, b.cy);
    }
    map.rooms = rooms;
  },

  corridor(map, rng, x1, y1, x2, y2) {
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

  // ---------- cave layout (drunkard's walk) ----------
  carveCaves(map, rng) {
    const { w, h } = map;
    let x = w >> 1, y = h >> 1;
    const target = Math.floor(w * h * 0.42);
    let carved = 0, dir = 0;
    while (carved < target) {
      const i = this.idx(map, x, y);
      if (map.t[i] === TILE.WALL) { map.t[i] = TILE.FLOOR; carved++; }
      if (U.chance(rng, 0.6)) dir = U.ri(rng, 0, 3);
      x = U.clamp(x + [1, -1, 0, 0][dir], 2, w - 3);
      y = U.clamp(y + [0, 0, 1, -1][dir], 2, h - 3);
      if (U.chance(rng, 0.004)) { x = U.ri(rng, 4, w - 5); y = U.ri(rng, 4, h - 5); } // jump: extra pockets
    }
    // smooth: open single-wall pillars, fill single-floor pockets
    for (let pass = 0; pass < 2; pass++) {
      for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
          if (!(dx === 0 && dy === 0) && map.t[this.idx(map, xx + dx, yy + dy)] !== TILE.WALL) n++;
        const i = this.idx(map, xx, yy);
        if (map.t[i] === TILE.WALL && n >= 6) map.t[i] = TILE.FLOOR;
        else if (map.t[i] !== TILE.WALL && n <= 2) map.t[i] = TILE.WALL;
      }
    }
    // synthesize "rooms" = open pockets, for spawn placement
    map.rooms = [];
    for (let i = 0; i < 14; i++) {
      const rx = U.ri(rng, 4, w - 5), ry = U.ri(rng, 4, h - 5);
      if (map.t[this.idx(map, rx, ry)] !== TILE.WALL) map.rooms.push({ x: rx - 2, y: ry - 2, w: 5, h: 5, cx: rx, cy: ry });
    }
  },

  // ---------- connectivity ----------
  // Cave carving can strand pockets (the drunkard's-walk "jump" teleports).
  // Keep the LARGEST connected component — picking the first-found one could
  // keep a stranded closet and wall off the whole map.
  ensureConnectivity(map, rng) {
    const { w, h } = map;
    const comp = new Int32Array(w * h).fill(-1);
    const sizes = [];
    for (let s = 0; s < w * h; s++) {
      if (map.t[s] === TILE.WALL || comp[s] >= 0) continue;
      const c = sizes.length;
      const stack = [s]; comp[s] = c;
      let size = 0;
      while (stack.length) {
        const i = stack.pop(); size++;
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (comp[j] < 0 && map.t[j] !== TILE.WALL) { comp[j] = c; stack.push(j); }
        }
      }
      sizes.push(size);
    }
    if (!sizes.length) { // degenerate map: carve an emergency room
      for (let y = h / 2 - 3 | 0; y < h / 2 + 3; y++) for (let x = w / 2 - 3 | 0; x < w / 2 + 3; x++) {
        map.t[this.idx(map, x, y)] = TILE.FLOOR;
        comp[this.idx(map, x, y)] = 0;
      }
      sizes.push(36);
    }
    let big = 0;
    for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[big]) big = c;
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (map.t[i] === TILE.WALL) continue;
      if (comp[i] === big) seen[i] = 1;
      else map.t[i] = TILE.WALL; // wall off stranded pockets
    }
    map._reach = seen;
  },

  placeEntryExit(map, rng, isBoss) {
    const { w, h } = map;
    const floors = [];
    for (let i = 0; i < w * h; i++) if (map.t[i] !== TILE.WALL) floors.push(i);
    // entry: prefer first room center, else random floor
    let entryI;
    if (map.rooms.length && !map.rooms[0].boss) entryI = this.idx(map, map.rooms[0].cx, map.rooms[0].cy);
    else entryI = U.pick(rng, floors);
    if (map.t[entryI] === TILE.WALL) entryI = U.pick(rng, floors);
    // exit: farthest floor tile (BFS distance), or boss room center
    let exitI = entryI;
    const bossRoom = map.rooms.find(r => r.boss);
    if (bossRoom) exitI = this.idx(map, bossRoom.cx, bossRoom.cy);
    else {
      const dist = new Int32Array(w * h).fill(-1);
      const q = [entryI]; dist[entryI] = 0; let qi = 0, best = 0;
      while (qi < q.length) {
        const i = q[qi++]; const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (map.t[j] !== TILE.WALL && dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); if (dist[j] > best) { best = dist[j]; exitI = j; } }
        }
      }
    }
    map.t[entryI] = TILE.ENTRY;
    map.t[exitI] = TILE.EXIT;
    map.entry = { x: entryI % w + 0.5, y: ((entryI / w) | 0) + 0.5 };
    map.exit = { x: exitI % w + 0.5, y: ((exitI / w) | 0) + 0.5 };
    if (bossRoom) map.bossSpot = { x: bossRoom.cx + 0.5, y: bossRoom.cy - 2 + 0.5 };
  },

  // ---------- decoration: torches, props, god rays ----------
  decorate(map, rng) {
    const { w, h } = map;
    const th = THEMES[map.theme];
    // torch sconces on wall tiles that border floor (light + visible prop)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (map.t[this.idx(map, x, y)] !== TILE.WALL) continue;
      const openBelow = map.t[this.idx(map, x, y + 1)] !== TILE.WALL || map.t[this.idx(map, x + 1, y)] !== TILE.WALL;
      if (openBelow && U.chance(rng, 0.058)) {
        map.lights.push({ x: x + 0.5, y: y + 0.5, r: 4.5, color: th.torch, flick: true, torch: true });
        map.props.push({ kind: 'torch', x: x + 0.5, y: y + 0.5, seed: x * 31 + y, color: th.torch });
      }
    }
    // guarantee lights at entry/exit
    map.lights.push({ x: map.entry.x, y: map.entry.y, r: 5, color: '#8fc8ff', flick: false });
    map.lights.push({ x: map.exit.x, y: map.exit.y, r: 5, color: '#ff8a2f', flick: true });
    // props on floor — denser scatter, plus interactive fixtures
    const props = th.props || [];
    const SMASHABLE = { crate: 'wood', pot: 'clay', urn: 'clay', sack: 'cloth', barrelprop: 'wood', sarcophagus: 'stone' };
    const LOOSE = { pot: 1, sack: 1, chair: 1, crate: 1, urn: 1 };
    if (props.length) {
      const n = Math.floor(w * h * 0.022);
      for (let i = 0; i < n; i++) {
        const x = U.ri(rng, 2, w - 3), y = U.ri(rng, 2, h - 3);
        const t = map.t[this.idx(map, x, y)];
        if (t !== TILE.FLOOR) continue;
        if (Math.abs(x - map.entry.x) < 3 && Math.abs(y - map.entry.y) < 3) continue;
        let kind = U.pick(rng, props);
        // cobwebs cling to walls: only keep them next to one
        if (kind === 'cobweb' && !(this.isWall(map, x, y - 1) || this.isWall(map, x - 1, y))) kind = 'rubble';
        const pr = { kind, x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 9999) };
        if (SMASHABLE[kind]) { pr.hp = 1; pr.mat = SMASHABLE[kind]; pr.smashable = true; }
        if (LOOSE[kind]) pr.loose = true;
        map.props.push(pr);
        // emissive props bring their own dim light
        if (kind === 'crystal') map.lights.push({ x: pr.x, y: pr.y, r: 2.6, color: '#7bdcff', flick: false });
        else if (kind === 'mushroom') map.lights.push({ x: pr.x, y: pr.y, r: 2.2, color: '#6ae8a0', flick: false });
        else if (kind === 'candles') map.lights.push({ x: pr.x, y: pr.y, r: 2.4, color: '#ffcf6f', flick: true });
        else if (kind === 'lantern') map.lights.push({ x: pr.x, y: pr.y, r: 3.2, color: '#ffcf8f', flick: true });
        else if (kind === 'chandelier') map.lights.push({ x: pr.x, y: pr.y, r: 4.2, color: '#ffc98f', flick: true });
        else if (kind === 'orevein') map.lights.push({ x: pr.x, y: pr.y, r: 1.8, color: '#ffd94f', flick: false });
      }
    }

    // interactive fixtures — each one does something when you click it
    const fixtures = th.fixtures || [];
    if (fixtures.length) {
      const nf = U.ri(rng, 3, 6);
      for (let i = 0; i < nf; i++) {
        const kind = U.pick(rng, fixtures);
        let x, y, ok = false;
        for (let tries = 0; tries < 40 && !ok; tries++) {
          x = U.ri(rng, 2, w - 3); y = U.ri(rng, 2, h - 3);
          const ix = this.idx(map, x, y);
          if (map.t[ix] !== TILE.FLOOR || map.haz[ix]) continue;
          if (Math.abs(x - map.entry.x) < 4 && Math.abs(y - map.entry.y) < 4) continue;
          if (map.props.some(p2 => Math.abs(p2.x - x - 0.5) < 1.2 && Math.abs(p2.y - y - 0.5) < 1.2)) continue;
          ok = true;
        }
        if (!ok) continue;
        const pr = { kind, x: x + 0.5, y: y + 0.5, seed: U.ri(rng, 0, 9999), fixture: true, used: false };
        if (kind === 'lever') {
          pr.on = false;
          // wire the lever to a nearby cache of treasure it unseals
          pr.cache = { x: pr.x + U.rf(rng, -2.5, 2.5), y: pr.y + U.rf(rng, -2.5, 2.5) };
        } else if (kind === 'brazier_unlit') {
          pr.lit = false;
        } else if (kind === 'orevein') {
          pr.ore = U.ri(rng, 2, 4);
        } else if (kind === 'bookshelf') {
          pr.searched = false;
        } else if (kind === 'fountain') {
          pr.charges = U.ri(rng, 1, 2);
          map.lights.push({ x: pr.x, y: pr.y, r: 3, color: '#8fd8ff', flick: false });
        }
        map.props.push(pr);
      }
    }
    // volumetric god-ray shafts falling from cracks in the unseen ceiling
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

  // ---------- doors ----------
  // Rooms and corridors were previously indistinguishable: a corridor simply
  // punched a hole in a room's wall and the two floors ran together. A door
  // marks that threshold. Every breach in a room's surrounding wall ring gets
  // one, so "leaving the room" becomes a thing you can see.
  //
  // Doors never block movement — they are thresholds, not gates — so
  // pathfinding, projectiles and connectivity are all untouched. The closed
  // ones swing open as you approach.
  placeDoors(map, rng) {
    const { w, h } = map;
    const kinds = THEMES[map.theme].doors || ['arch', 'wood'];
    const seen = new Uint8Array(w * h);
    for (const r of map.rooms) {
      // walk the ring of tiles immediately outside the room rectangle
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          const onRing = (x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h);
          if (!onRing || x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const i = this.idx(map, x, y);
          if (seen[i] || map.t[i] !== TILE.FLOOR) continue;   // wall, or already a door
          // must actually touch the room interior — corner diagonals don't count
          const touches =
            (x >= r.x && x < r.x + r.w && (y === r.y - 1 || y === r.y + r.h)) ||
            (y >= r.y && y < r.y + r.h && (x === r.x - 1 || x === r.x + r.w));
          if (!touches) continue;
          // orientation from which pair of neighbours is solid
          const wx = this.isWall(map, x - 1, y) && this.isWall(map, x + 1, y);
          const wy = this.isWall(map, x, y - 1) && this.isWall(map, x, y + 1);
          if (!wx && !wy) continue;      // a wide-open breach, not a doorway
          seen[i] = 1;
          map.t[i] = TILE.DOOR;
          map.doors.push({
            x: x + 0.5, y: y + 0.5, i,
            ori: wx ? 'v' : 'h',          // 'v' = passage runs north-south
            kind: U.pick(rng, kinds),
            open: 0, swing: U.chance(rng, 0.5) ? 1 : -1,
            seed: U.ri(rng, 0, 9999),
          });
        }
      }
    }
  },

  // ---------- environmental hazards ----------
  placeHazards(map, rng) {
    const th = THEMES[map.theme];
    const kinds = th.hazards || [];
    if (!kinds.length) return;
    const { w, h } = map;
    const clearOf = (x, y, pt, r) => Math.abs(x - pt.x) > r || Math.abs(y - pt.y) > r;

    for (const kind of kinds) {
      if (kind === 'lava' || kind === 'water') {
        // blobby liquid pools — molten lakes or still, reflective water
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
        // spike traps, gas pockets and steam vents: sprinkled singles
        const density = { spikes: 0.004, gas: 0.0025, vent: 0.003 }[kind];
        if (density === undefined) continue;   // unknown hazard: place nothing
        const type = { spikes: HAZ.SPIKES, gas: HAZ.GAS, vent: HAZ.VENT }[kind];
        const n = Math.floor(w * h * density);
        for (let i = 0; i < n; i++) {
          const x = U.ri(rng, 2, w - 3), y = U.ri(rng, 2, h - 3);
          const ix = this.idx(map, x, y);
          if (map.t[ix] !== TILE.FLOOR || map.haz[ix]) continue;
          if (!clearOf(x, y, map.entry, 4)) continue;
          map.haz[ix] = type;
          // the jet throws its own light when it fires; the renderer scales
          // this by the live cycle so a dormant vent stays dark
          if (type === HAZ.VENT) map.lights.push({ x: x + 0.5, y: y + 0.5, r: 3.4, color: '#ff9a3f', vent: ix });
        }
      }
    }
  },

  // ---------- monster packs ----------
  placeSpawns(map, rng) {
    const isAbyss = map.actIdx === 'abyss';
    const densityMult = isAbyss ? 1 + map.abyssFloor * 0.04 : 1;
    for (const room of map.rooms) {
      if (room === map.rooms[0] && !room.boss) continue;    // entry room stays safe
      if (room.boss) continue;                              // boss handles his own guests
      if (!U.chance(rng, 0.78)) continue;
      const fam = U.pick(rng, map.pool);
      const n = Math.round(U.ri(rng, 2, 5) * densityMult) + ((map.depth || 1) > 2 ? 1 : 0);
      map.packs.push({
        x: room.cx + 0.5, y: room.cy + 0.5, fam, n,
        elite: U.chance(rng, 0.16), champion: U.chance(rng, 0.22),
      });
      if (U.chance(rng, 0.3)) { // second pack in big rooms
        const fam2 = U.pick(rng, map.pool);
        map.packs.push({ x: room.x + 1.5, y: room.y + 1.5, fam: fam2, n: Math.max(2, n - 1), elite: U.chance(rng, 0.1), champion: false });
      }
    }
    // cave maps also scatter loose packs
    if (map.rooms.length < 8) {
      const extra = 8 - map.rooms.length + 4;
      for (let i = 0; i < extra; i++) {
        const x = U.ri(rng, 3, map.w - 4), y = U.ri(rng, 3, map.h - 4);
        const ix = this.idx(map, x, y);
        if (map.t[ix] !== TILE.FLOOR) continue;
        if (Math.abs(x - map.entry.x) < 8 && Math.abs(y - map.entry.y) < 8) continue;
        map.packs.push({ x: x + 0.5, y: y + 0.5, fam: U.pick(rng, map.pool), n: U.ri(rng, 3, 6), elite: U.chance(rng, 0.15), champion: U.chance(rng, 0.2) });
      }
    }
  },

  // ---------- interactables: barrels, chests, shrines ----------
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
    const nChest = U.ri(rng, 1, 3);
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
    // gold piles
    const nGold = U.ri(rng, 2, 5);
    for (let i = 0; i < nGold && si < spots.length; i++) {
      const s = take();
      map.things.push({ kind: 'goldpile', x: s.x, y: s.y, taken: false });
    }
  },

  // ---------- town ----------
  generateTown() {
    const w = 28, h = 28;
    const map = {
      w, h, theme: 'town', isBoss: false, actIdx: -1, depth: 0, mlvl: 1,
      t: new Uint8Array(w * h), haz: new Uint8Array(w * h), variant: new Uint8Array(w * h),
      explored: new Uint8Array(w * h).fill(1),
      lights: [], props: [], packs: [], things: [], rooms: [], doors: [],
      name: 'Haven\'s Rest', town: true, pool: [],
    };
    const rng = makeRng(777);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      map.t[y * w + x] = border ? TILE.WALL : TILE.FLOOR;
      map.variant[y * w + x] = Math.floor(rng() * 4);
    }
    // gate to the dungeons (north corner) + waypoint plaza
    map.t[2 * w + 14] = TILE.EXIT;
    map.exit = { x: 14.5, y: 2.5 };
    map.entry = { x: 14.5, y: 20.5 };
    map.waypoint = { x: 11.5, y: 14.5 };
    map.portalSpot = { x: 17.5, y: 14.5 };
    map.npcSpots = { healer: { x: 7.5, y: 8.5 }, smith: { x: 21.5, y: 8.5 }, gambler: { x: 6.5, y: 19.5 }, stash: { x: 21.5, y: 19.5 }, elder: { x: 14.5, y: 11.5 } };
    // cozy lighting
    map.lights.push({ x: 14.5, y: 2.5, r: 5, color: '#ff8a2f', flick: true });
    map.lights.push({ x: map.waypoint.x, y: map.waypoint.y, r: 4.5, color: '#8fc8ff', flick: false });
    for (const k in map.npcSpots) map.lights.push({ x: map.npcSpots[k].x, y: map.npcSpots[k].y - 1, r: 3.6, color: '#ffb04f', flick: true });
    for (const [px, py] of [[3, 3], [25, 3], [3, 24], [25, 24], [10, 24], [19, 24]]) {
      map.lights.push({ x: px + 0.5, y: py + 0.5, r: 4, color: '#ffb04f', flick: true, torch: true });
      map.props.push({ kind: 'brazier', x: px + 0.5, y: py + 0.5, seed: px * 7 + py, color: '#ffb04f' });
    }
    // props: braziers/pillars around plaza
    for (const [px, py] of [[11, 12], [17, 12], [11, 17], [17, 17]])
      map.props.push({ kind: 'brazier', x: px + 0.5, y: py + 0.5, seed: px * 31 + py, color: '#ffb04f' });
    // a still pond by the west wall, ringed with reeds
    for (const [px, py] of [[3, 12], [4, 12], [5, 12], [3, 13], [4, 13], [5, 13], [4, 14], [5, 14], [3, 14]])
      map.haz[py * w + px] = HAZ.WATER;
    // trees + greenery around the edges of the square
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
