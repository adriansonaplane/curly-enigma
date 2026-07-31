// ============ DIABLOID: props3d.js — dungeon dressing as real geometry ============
'use strict';

// Sixty-odd prop kinds, and a big map scatters a couple of hundred of them. As
// individual meshes that is a couple of thousand draw calls before a single
// monster is on screen, so props are INSTANCED: each kind is described once as
// a small template of primitives, and every prop of that kind is one transform
// into the same buffers. Twenty kinds at four parts each is eighty draw calls
// for ordinary groups. Exceptionally dense kinds are split spatially so the
// camera does not submit every copy merely because one copy is visible.
//
// The cost of instancing is that a prop cannot animate its own geometry. That
// turns out not to matter: the things that moved in 2D were flames, and flames
// now read through the point lights the dungeon already places and flickers
// per-light. A shared material pulsing in lockstep across forty torches looked
// far worse than letting the lights do it.

const Props3 = {
  authoredModels: true,
  configure(config) { this.authoredModels = config.authoredModels !== false; },
  group: null,
  sets: [],                 // { kind, meshes: [InstancedMesh], count }
  slot: new WeakMap(),      // prop object -> { set, i, base }
  _geo: null,
  _mats: new Map(),         // "geo|colour|emissive" -> material
  _authored: new Map(),     // slug -> compiled instancing template or rejection
  _requests: new Map(),     // slug -> in-flight fetch
  diagnostics: [],
  batches: [],
  CHUNK_SIZE: 16,
  CHUNK_MIN_INSTANCES: 48, // splitting sparse kinds only buys draw-call overhead
  _buildToken: 0,
  built: false,

  // Use from the diagnostics console to compare 0 (the original global
  // batches), 12, and 16 without changing the production default.
  setChunking(size, minInstances, rebuild) {
    const nextSize = size === 0 ? 0 : Math.max(1, Math.floor(Number(size) || 16));
    const nextMin = Math.max(1, Math.floor(Number(minInstances) || this.CHUNK_MIN_INSTANCES));
    if (nextSize === this.CHUNK_SIZE && nextMin === this.CHUNK_MIN_INSTANCES) return false;
    this.CHUNK_SIZE = nextSize; this.CHUNK_MIN_INSTANCES = nextMin;
    if (rebuild !== false && this.map) this.build(this.map);
    return true;
  },

  // Authored replacements are intentionally a short, quality-reviewed list.
  // `parts` indices refer to the source scene before compatible meshes are
  // bucketed. ATTACHMENTS provides the same contract to procedural fallbacks.
  MODEL_MAP: {
    wood: { slot: 'door_wood', height: 1.6, maxDraws: 8, parts: { doorLeaves: '*', destructible: '*', collision: [0.8, 0.12], promptHeight: 1.15 } },
    pillar: { slot: 'pillar', height: 2.3, maxDraws: 14, parts: { destructible: '*', collision: [0.8, 0.8], promptHeight: 1.5 } },
    soul_cage: { slot: 'soul_cage', height: 1.25, maxDraws: 12, parts: { emissive: 'auto', destructible: '*', lightOrigin: [0, 0.8, 0], promptHeight: 1.05 } },
  },
  ATTACHMENTS: {
    wood: { doorLeaves: '*', collision: [0.8, 0.12], promptHeight: 1.15 },
    barred: { doorLeaves: [0], collision: [0.8, 0.12], promptHeight: 1.15 },
    arch: { collision: [1, 0.3], promptHeight: 1.3 },
    torch: { flame: [2], emissive: [2], lightOrigin: [0, 1.35, 0.1], promptHeight: 1.1 },
    brazier: { flame: [3], emissive: [3], lightOrigin: [0, 0.95, 0], promptHeight: 0.8 },
    candles: { flame: [2, 3], emissive: [2, 3], lightOrigin: [0, 0.4, 0], promptHeight: 0.35 },
    crate: { destructible: '*', collision: [0.65, 0.65], promptHeight: 0.65 },
    barrel: { destructible: '*', collision: [0.55, 0.55], promptHeight: 0.7 },
    barrelprop: { destructible: '*', collision: [0.55, 0.55], promptHeight: 0.7 },
    chest: { doorLeaves: [1], destructible: '*', emissive: [2], collision: [0.8, 0.56], promptHeight: 0.7 },
  },

  geo() {
    if (this._geo) return this._geo;
    this._geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      taper: new THREE.CylinderGeometry(0.34, 0.5, 1, 10),
      flare: new THREE.CylinderGeometry(0.5, 0.3, 1, 10),
      sphere: new THREE.SphereGeometry(0.5, 10, 8),
      cone: new THREE.ConeGeometry(0.5, 1, 8),
      plane: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.TorusGeometry(0.5, 0.09, 6, 14),
      disc: new THREE.CircleGeometry(0.5, 18),
    };
    return this._geo;
  },

  // Emissive values in the tables above are RELATIVE brightness, not final.
  // The renderer encodes to sRGB on the way out, which lifts midtones hard: an
  // emissive of 1.0 on a saturated green comes out as near-white, and every
  // glowing prop in the dungeon ends up the same pale blob regardless of what
  // colour it is meant to be. Scaling here keeps the hues and keeps the tables
  // readable as "how bright relative to each other".
  EMIT: 0.45,

  mat(geoKey, col, emit, alpha) {
    const key = geoKey + '|' + col + '|' + (emit || 0) + '|' + (alpha || 1);
    let m = this._mats.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      // a glowing part's diffuse is dimmed too, or a torch standing in the
      // hero's own light goes white from the lit side as well
      color: new THREE.Color(col).multiplyScalar(emit ? 0.34 : 1),
      roughness: emit ? 0.4 : 0.9, metalness: 0.04,
      emissive: new THREE.Color(emit ? col : 0x000000),
      emissiveIntensity: (emit || 0) * this.EMIT,
      transparent: alpha !== undefined && alpha < 1,
      opacity: alpha === undefined ? 1 : alpha,
      side: alpha !== undefined && alpha < 1 ? THREE.DoubleSide : THREE.FrontSide,
    });
    this._mats.set(key, m);
    return m;
  },

  // ---- template DSL ----
  // b(geo, colour, [x,y,z], [sx,sy,sz], [rx,ry,rz], emissiveIntensity, alpha)
  // Positions are in tiles, origin at the prop's floor point, +Y up.
  // ============================================================================

  ARCH: {
    crate: (c) => [
      b('box', c, [0, 0.3, 0], [0.62, 0.6, 0.62]),
      b('box', '#3e3530', [0, 0.3, 0], [0.66, 0.08, 0.66]),
      b('box', '#3e3530', [0, 0.55, 0], [0.64, 0.06, 0.64]),
    ],
    barrel: (c) => [
      b('taper', c, [0, 0.36, 0], [0.5, 0.72, 0.5]),
      b('cyl', '#5a5860', [0, 0.2, 0], [0.53, 0.07, 0.53]),
      b('cyl', '#5a5860', [0, 0.55, 0], [0.48, 0.07, 0.48]),
    ],
    pot: (c) => [
      b('sphere', c, [0, 0.22, 0], [0.44, 0.44, 0.44]),
      b('cyl', sh(c, 0.8), [0, 0.44, 0], [0.2, 0.14, 0.2]),
      b('cyl', sh(c, 1.15), [0, 0.5, 0], [0.26, 0.05, 0.26]),
    ],
    sack: (c) => [
      b('sphere', c, [0, 0.24, 0], [0.5, 0.48, 0.42]),
      b('cyl', sh(c, 0.75), [0, 0.5, 0], [0.16, 0.16, 0.16]),
    ],
    table: (c) => [
      b('box', c, [0, 0.56, 0], [0.95, 0.08, 0.7]),
      b('box', sh(c, 0.7), [-0.4, 0.28, -0.28], [0.08, 0.56, 0.08]),
      b('box', sh(c, 0.7), [0.4, 0.28, -0.28], [0.08, 0.56, 0.08]),
      b('box', sh(c, 0.7), [-0.4, 0.28, 0.28], [0.08, 0.56, 0.08]),
      b('box', sh(c, 0.7), [0.4, 0.28, 0.28], [0.08, 0.56, 0.08]),
    ],
    chair: (c) => [
      b('box', c, [0, 0.4, 0], [0.42, 0.07, 0.42]),
      b('box', sh(c, 0.85), [0, 0.66, -0.18], [0.4, 0.46, 0.06]),
      b('box', sh(c, 0.7), [-0.16, 0.2, -0.16], [0.06, 0.4, 0.06]),
      b('box', sh(c, 0.7), [0.16, 0.2, 0.16], [0.06, 0.4, 0.06]),
    ],
    pillar: (c) => [
      b('box', sh(c, 0.8), [0, 0.09, 0], [0.9, 0.18, 0.9]),
      b('cyl', c, [0, 1.15, 0], [0.56, 2.0, 0.56]),
      b('box', sh(c, 1.12), [0, 2.22, 0], [0.86, 0.16, 0.86]),
    ],
    statue: (c) => [
      b('box', sh(c, 0.78), [0, 0.14, 0], [0.8, 0.28, 0.8]),
      b('taper', c, [0, 0.78, 0], [0.44, 1.0, 0.36]),
      b('sphere', c, [0, 1.42, 0], [0.3, 0.34, 0.3]),
      b('cyl', sh(c, 0.9), [-0.28, 0.95, 0.1], [0.12, 0.62, 0.12], [0.4, 0, 0.25]),
      b('cyl', sh(c, 0.9), [0.28, 0.95, 0.1], [0.12, 0.62, 0.12], [0.4, 0, -0.25]),
    ],
    torch: (c, gl) => [
      b('box', '#3a2c1e', [0, 0.9, 0], [0.09, 0.5, 0.09], [0.35, 0, 0]),
      b('cyl', '#2a2018', [0, 1.16, 0.1], [0.16, 0.12, 0.16]),
      b('cone', gl, [0, 1.36, 0.1], [0.24, 0.42, 0.24], null, 2.4),
    ],
    brazier: (c, gl) => [
      b('cyl', '#3a3028', [0, 0.3, 0], [0.1, 0.6, 0.1], [0.18, 0, 0.1]),
      b('cyl', '#3a3028', [0.1, 0.3, -0.08], [0.1, 0.6, 0.1], [-0.14, 0, -0.18]),
      b('flare', '#4a4038', [0, 0.66, 0], [0.62, 0.26, 0.62]),
      b('cone', gl, [0, 0.98, 0], [0.42, 0.55, 0.42], null, 2.6),
    ],
    brazier_cold: (c) => [
      b('cyl', '#3a3028', [0, 0.3, 0], [0.1, 0.6, 0.1], [0.18, 0, 0.1]),
      b('cyl', '#3a3028', [0.1, 0.3, -0.08], [0.1, 0.6, 0.1], [-0.14, 0, -0.18]),
      b('flare', '#4a4038', [0, 0.66, 0], [0.62, 0.26, 0.62]),
      b('sphere', '#1a1614', [0, 0.76, 0], [0.42, 0.12, 0.42]),
    ],
    candles: (c, gl) => [
      b('cyl', '#e8dcc0', [-0.1, 0.14, 0.04], [0.07, 0.28, 0.07]),
      b('cyl', '#e8dcc0', [0.08, 0.19, -0.06], [0.07, 0.38, 0.07]),
      b('cone', gl, [-0.1, 0.33, 0.04], [0.07, 0.14, 0.07], null, 2.6),
      b('cone', gl, [0.08, 0.44, -0.06], [0.07, 0.14, 0.07], null, 2.6),
    ],
    lantern: (c, gl) => [
      b('cyl', '#33291e', [0, 0.42, 0], [0.07, 0.84, 0.07]),
      b('box', '#3f3428', [0, 0.94, 0], [0.26, 0.3, 0.26]),
      b('sphere', gl, [0, 0.94, 0], [0.18, 0.2, 0.18], null, 2.2),
    ],
    chandelier: (c, gl) => [
      b('cyl', '#2a2118', [0, 2.35, 0], [0.04, 0.7, 0.04]),
      b('ring', '#4a3c28', [0, 1.98, 0], [1.0, 1.0, 1.0], [Math.PI / 2, 0, 0]),
      b('cone', gl, [0.44, 2.1, 0], [0.14, 0.26, 0.14], null, 2.4),
      b('cone', gl, [-0.44, 2.1, 0], [0.14, 0.26, 0.14], null, 2.4),
      b('cone', gl, [0, 2.1, 0.44], [0.14, 0.26, 0.14], null, 2.4),
      b('cone', gl, [0, 2.1, -0.44], [0.14, 0.26, 0.14], null, 2.4),
    ],
    crystal: (c, gl) => [
      b('cone', gl, [0, 0.42, 0], [0.28, 0.85, 0.28], null, 1.5),
      b('cone', gl, [0.2, 0.26, 0.12], [0.18, 0.52, 0.18], [0.3, 0, 0.35], 1.5),
      b('cone', gl, [-0.16, 0.22, -0.1], [0.15, 0.45, 0.15], [-0.25, 0, -0.3], 1.5),
    ],
    orevein: (c, gl) => [
      b('sphere', c, [0, 0.24, 0], [0.66, 0.48, 0.6]),
      b('sphere', gl, [0.12, 0.36, 0.16], [0.16, 0.12, 0.14], null, 1.8),
      b('sphere', gl, [-0.16, 0.28, -0.1], [0.13, 0.1, 0.12], null, 1.8),
    ],
    mushroom: (c, gl) => [
      b('cyl', '#c8c0a8', [0, 0.16, 0], [0.1, 0.32, 0.1]),
      b('sphere', gl, [0, 0.34, 0], [0.4, 0.24, 0.4], null, 1.3),
      b('cyl', '#c8c0a8', [0.18, 0.1, 0.12], [0.07, 0.2, 0.07]),
      b('sphere', gl, [0.18, 0.22, 0.12], [0.26, 0.16, 0.26], null, 1.3),
    ],
    bones: (c) => [
      b('cyl', c, [-0.12, 0.05, 0.06], [0.07, 0.42, 0.07], [0, 0.6, Math.PI / 2]),
      b('cyl', c, [0.14, 0.05, -0.08], [0.06, 0.36, 0.06], [0, -0.9, Math.PI / 2]),
      b('sphere', c, [-0.02, 0.1, -0.16], [0.2, 0.19, 0.2]),
    ],
    skullpile: (c) => [
      b('sphere', c, [-0.14, 0.11, 0.06], [0.22, 0.21, 0.22]),
      b('sphere', c, [0.14, 0.1, -0.04], [0.2, 0.19, 0.2]),
      b('sphere', c, [0, 0.28, 0.02], [0.21, 0.2, 0.21]),
      b('cyl', sh(c, 0.85), [0.2, 0.05, 0.18], [0.06, 0.3, 0.06], [0, 0.4, Math.PI / 2]),
    ],
    rubble: (c) => [
      b('box', c, [-0.14, 0.08, 0.1], [0.28, 0.16, 0.24], [0, 0.5, 0.1]),
      b('box', sh(c, 0.85), [0.16, 0.06, -0.06], [0.22, 0.13, 0.2], [0, -0.7, -0.12]),
      b('box', sh(c, 1.1), [0.02, 0.05, 0.22], [0.18, 0.1, 0.16], [0, 1.1, 0]),
    ],
    rock: (c) => [
      b('sphere', c, [0, 0.26, 0], [0.78, 0.52, 0.7]),
      b('sphere', sh(c, 1.12), [0.2, 0.44, 0.08], [0.3, 0.24, 0.28]),
    ],
    stalagmite: (c) => [b('cone', c, [0, 0.55, 0], [0.42, 1.1, 0.42])],
    stalactite: (c) => [b('cone', c, [0, 2.2, 0], [0.36, 1.1, 0.36], [Math.PI, 0, 0])],
    spike: (c) => [
      b('cone', c, [0, 0.34, 0], [0.16, 0.68, 0.16]),
      b('cone', sh(c, 0.8), [0.14, 0.22, 0.1], [0.11, 0.44, 0.11], [0.2, 0, 0.25]),
    ],
    cobweb: (c) => [
      b('plane', c, [0, 1.45, -0.42], [1.1, 1.1, 1], [0.5, 0, 0], 0, 0.42),
    ],
    sigil: (c, gl) => [
      b('disc', gl, [0, 0.075, 0], [1.5, 1.5, 1], [-Math.PI / 2, 0, 0], 1.4, 0.75),
    ],
    grave: (c) => [
      b('box', sh(c, 1.05), [0, 0.34, -0.24], [0.6, 0.62, 0.1], [-0.12, 0, 0]),
      b('sphere', sh(c, 0.7), [0, 0.1, 0.1], [0.8, 0.2, 0.7]),
    ],
    sarcophagus: (c) => [
      b('box', c, [0, 0.28, 0], [0.78, 0.56, 1.5]),
      b('box', sh(c, 1.15), [0, 0.6, 0], [0.86, 0.12, 1.58]),
      b('sphere', '#6a6458', [0, 0.68, -0.44], [0.26, 0.2, 0.26]),
      b('box', '#4a4640', [0, 0.38, 0.68], [0.24, 0.16, 0.06]),
    ],
    bookshelf: (c) => [
      b('box', c, [0, 0.85, -0.18], [1.0, 1.7, 0.16]),
      b('box', sh(c, 0.8), [-0.46, 0.85, 0], [0.1, 1.7, 0.36]),
      b('box', sh(c, 0.8), [0.46, 0.85, 0], [0.1, 1.7, 0.36]),
      b('box', sh(c, 1.2), [0, 0.62, -0.02], [0.86, 0.07, 0.32]),
      b('box', sh(c, 1.2), [0, 1.22, -0.02], [0.86, 0.07, 0.32]),
      b('box', '#3a2420', [-0.15, 0.42, 0.02], [0.52, 0.42, 0.18]),
      b('box', '#242e28', [0.05, 0.92, 0.02], [0.56, 0.42, 0.17]),
    ],
    weaponrack: (c) => [
      b('box', c, [0, 0.9, -0.1], [1.0, 0.1, 0.12]),
      b('box', sh(c, 0.8), [-0.44, 0.45, -0.1], [0.1, 0.9, 0.1]),
      b('box', sh(c, 0.8), [0.44, 0.45, -0.1], [0.1, 0.9, 0.1]),
      b('cyl', '#8a8f98', [-0.2, 0.6, 0], [0.05, 1.0, 0.05], [0.16, 0, 0.12]),
      b('cyl', '#8a8f98', [0.22, 0.6, 0], [0.05, 1.0, 0.05], [0.16, 0, -0.16]),
    ],
    anvil: (c) => [
      b('box', '#3a2c1e', [0, 0.16, 0], [0.5, 0.32, 0.42]),
      b('box', c, [0, 0.44, 0], [0.72, 0.24, 0.34]),
      b('cone', c, [0.5, 0.44, 0], [0.2, 0.36, 0.2], [0, 0, -Math.PI / 2]),
    ],
    cauldron: (c, gl) => [
      b('cyl', '#2a2620', [-0.18, 0.14, 0.1], [0.07, 0.28, 0.07], [0.2, 0, 0.22]),
      b('cyl', '#2a2620', [0.18, 0.14, -0.1], [0.07, 0.28, 0.07], [-0.2, 0, -0.22]),
      b('sphere', c, [0, 0.44, 0], [0.72, 0.6, 0.72]),
      b('disc', gl, [0, 0.62, 0], [0.56, 0.56, 1], [-Math.PI / 2, 0, 0], 1.6),
    ],
    wellhead: (c) => [
      b('cyl', c, [0, 0.28, 0], [1.1, 0.56, 1.1]),
      b('cyl', '#101014', [0, 0.56, 0], [0.86, 0.04, 0.86]),
      b('box', sh(c, 0.7), [-0.44, 0.95, 0], [0.1, 0.8, 0.1]),
      b('box', sh(c, 0.7), [0.44, 0.95, 0], [0.1, 0.8, 0.1]),
      b('box', sh(c, 0.85), [0, 1.4, 0], [1.2, 0.12, 0.8], [0, 0, 0]),
    ],
    fountain: (c, gl) => [
      b('cyl', c, [0, 0.2, 0], [1.5, 0.4, 1.5]),
      b('disc', gl, [0, 0.42, 0], [1.28, 1.28, 1], [-Math.PI / 2, 0, 0], 0.5, 0.8),
      b('cyl', sh(c, 1.1), [0, 0.62, 0], [0.3, 0.85, 0.3]),
      b('sphere', gl, [0, 1.1, 0], [0.34, 0.34, 0.34], null, 1.1),
    ],
    banner: (c) => [
      b('cyl', '#3a2c1e', [0, 1.2, -0.4], [0.06, 2.4, 0.06]),
      b('plane', c, [0, 1.35, -0.34], [0.7, 1.3, 1], [0, 0, 0], 0, 0.95),
    ],
    cage: (c, gl) => [
      b('cyl', '#2a2620', [0, 2.2, 0], [0.04, 0.6, 0.04]),
      b('ring', '#3a342c', [0, 1.86, 0], [0.7, 0.7, 0.7], [Math.PI / 2, 0, 0]),
      b('ring', '#3a342c', [0, 1.24, 0], [0.7, 0.7, 0.7], [Math.PI / 2, 0, 0]),
      b('cyl', '#3a342c', [0.3, 1.55, 0], [0.04, 0.7, 0.04]),
      b('cyl', '#3a342c', [-0.3, 1.55, 0], [0.04, 0.7, 0.04]),
      b('sphere', gl, [0, 1.55, 0], [0.28, 0.28, 0.28], null, 1.8),
    ],
    tree: (c) => [
      b('taper', '#3f3020', [0, 0.9, 0], [0.4, 1.8, 0.4]),
      b('sphere', c, [0, 2.1, 0], [1.6, 1.2, 1.6]),
      b('sphere', sh(c, 0.85), [0.5, 1.75, 0.35], [0.9, 0.75, 0.9]),
    ],
    deadtree: (c) => [
      b('taper', c, [0, 0.95, 0], [0.34, 1.9, 0.34], [0.08, 0, 0.06]),
      b('cyl', c, [0.42, 1.7, 0.1], [0.12, 0.9, 0.12], [0.2, 0, -0.9]),
      b('cyl', c, [-0.38, 1.9, -0.1], [0.1, 0.8, 0.1], [-0.2, 0, 0.95]),
    ],
    reeds: (c) => [
      b('cone', c, [-0.1, 0.3, 0.06], [0.06, 0.6, 0.06], [0.12, 0, 0.18]),
      b('cone', c, [0.08, 0.36, -0.04], [0.06, 0.72, 0.06], [-0.1, 0, -0.14]),
      b('cone', c, [0.02, 0.26, 0.16], [0.05, 0.52, 0.05], [0.16, 0, 0.05]),
    ],
    vine: (c, gl) => [
      b('cyl', c, [0, 0.55, -0.3], [0.07, 1.1, 0.07], [0.2, 0, 0.12]),
      b('sphere', gl || c, [0.1, 0.85, -0.24], [0.22, 0.26, 0.22], null, gl ? 0.8 : 0),
      b('sphere', gl || c, [-0.08, 0.45, -0.32], [0.18, 0.21, 0.18], null, gl ? 0.8 : 0),
    ],
    shroud: (c) => [
      b('sphere', c, [0, 0.13, 0], [0.44, 0.26, 1.2]),
      b('sphere', sh(c, 1.1), [0, 0.19, -0.42], [0.34, 0.3, 0.34]),
    ],
    doll: (c) => [
      b('sphere', c, [0, 0.34, 0], [0.2, 0.22, 0.2]),
      b('taper', sh(c, 0.85), [0, 0.16, 0], [0.24, 0.34, 0.2]),
      b('cyl', sh(c, 0.7), [-0.14, 0.18, 0.06], [0.05, 0.24, 0.05], [0, 0, 0.5]),
      b('cyl', sh(c, 0.7), [0.14, 0.18, 0.06], [0.05, 0.24, 0.05], [0, 0, -0.5]),
    ],
    shrinebox: (c, gl) => [
      b('box', sh(c, 0.7), [0, 0.2, 0], [0.6, 0.4, 0.5]),
      b('box', c, [0, 0.56, 0], [0.44, 0.34, 0.36]),
      b('cone', gl, [0, 0.82, 0], [0.3, 0.24, 0.26], null, 1.2),
    ],
    cellfront: (c) => [
      b('box', c, [0, 1.1, -0.44], [1.4, 2.2, 0.12]),
      b('cyl', '#3a342c', [-0.3, 1.0, -0.3], [0.07, 2.0, 0.07]),
      b('cyl', '#3a342c', [0, 1.0, -0.3], [0.07, 2.0, 0.07]),
      b('cyl', '#3a342c', [0.3, 1.0, -0.3], [0.07, 2.0, 0.07]),
    ],
    eggsac: (c) => [
      b('sphere', c, [0, 0.85, -0.3], [0.6, 0.72, 0.55], null, 0, 0.85),
      b('cyl', sh(c, 1.1), [0, 1.5, -0.3], [0.05, 0.6, 0.05]),
    ],
    vat: (c, gl) => [
      b('taper', c, [0, 0.42, 0], [0.66, 0.84, 0.66]),
      b('cyl', sh(c, 0.6), [0, 0.24, 0], [0.7, 0.08, 0.7]),
      b('disc', gl, [0, 0.82, 0], [0.6, 0.6, 1], [-Math.PI / 2, 0, 0], 1.3),
    ],
    dynamite: (c) => [
      b('cyl', '#8a3a2a', [-0.06, 0.14, 0], [0.14, 0.28, 0.14]),
      b('cyl', '#8a3a2a', [0.08, 0.14, 0.05], [0.14, 0.28, 0.14]),
      b('cyl', '#3a3028', [0, 0.3, 0], [0.32, 0.06, 0.32]),
    ],
    beam: (c) => [
      b('box', c, [-0.5, 1.1, 0], [0.18, 2.2, 0.18]),
      b('box', c, [0.5, 1.1, 0], [0.18, 2.2, 0.18]),
      b('box', sh(c, 1.1), [0, 2.24, 0], [1.3, 0.18, 0.2]),
    ],
    clam: (c) => [
      b('sphere', c, [0, 0.18, 0], [0.85, 0.34, 0.7]),
      b('sphere', sh(c, 1.15), [0, 0.34, -0.1], [0.8, 0.3, 0.62], [-0.35, 0, 0]),
      b('sphere', '#ffe9d8', [0, 0.22, 0.08], [0.16, 0.16, 0.16], null, 0.9),
    ],
    coral: (c) => [
      b('taper', c, [0, 0.75, 0], [0.34, 1.5, 0.34]),
      b('cyl', sh(c, 1.15), [0.28, 1.2, 0.1], [0.14, 0.7, 0.14], [0.2, 0, -0.7]),
      b('cyl', sh(c, 0.9), [-0.24, 1.0, -0.12], [0.12, 0.6, 0.12], [-0.2, 0, 0.6]),
      b('sphere', sh(c, 1.2), [0, 1.55, 0], [0.3, 0.26, 0.3]),
    ],
    idol: (c, gl) => [
      b('box', sh(c, 0.75), [0, 0.1, 0], [0.5, 0.2, 0.5]),
      b('taper', c, [0, 0.48, 0], [0.34, 0.6, 0.3]),
      b('sphere', c, [0, 0.88, 0], [0.28, 0.3, 0.28]),
      b('sphere', gl, [0, 0.9, 0.13], [0.09, 0.07, 0.06], null, 2.0),
    ],
    lever: (c) => [
      b('box', sh(c, 0.7), [0, 0.14, 0], [0.4, 0.28, 0.34]),
      b('cyl', c, [0, 0.5, 0.14], [0.08, 0.6, 0.08], [0.5, 0, 0]),
      b('sphere', '#b03a2a', [0, 0.76, 0.28], [0.16, 0.16, 0.16]),
    ],
    goldpile: (c, gl) => [
      b('sphere', gl, [0, 0.09, 0], [0.62, 0.2, 0.55], null, 0.7),
      b('sphere', gl, [0.16, 0.15, 0.08], [0.28, 0.16, 0.26], null, 0.7),
    ],
    chest: (c, gl) => [
      b('box', c, [0, 0.24, 0], [0.8, 0.48, 0.56]),
      b('sphere', sh(c, 1.2), [0, 0.5, 0], [0.8, 0.34, 0.56]),
      b('box', gl, [0, 0.3, 0.29], [0.14, 0.16, 0.04], null, 0.9),
    ],
    door: (c) => [
      b('box', c, [0, 0.8, 0], [0.8, 1.6, 0.1], null, 0, 1, 'doorLeaf'),
      b('box', '#2d2924', [-0.43, 0.82, 0], [0.07, 1.72, 0.16]),
      b('box', '#2d2924', [0.43, 0.82, 0], [0.07, 1.72, 0.16]),
    ],
    archway: (c) => [
      b('box', c, [-0.48, 0.9, 0], [0.18, 1.8, 0.3]),
      b('box', c, [0.48, 0.9, 0], [0.18, 1.8, 0.3]),
      b('box', sh(c, 1.08), [0, 1.76, 0], [1.12, 0.18, 0.3]),
    ],
  },

  // kind -> { arch, c: base colour, g: glow colour }
  // Anything not listed falls back to a rubble pile in the theme's wall tone,
  // so a new prop kind added to a theme is dull rather than invisible.
  KIND: {
    crate: { a: 'crate', c: '#6a4f30' }, barrelprop: { a: 'barrel', c: '#5f4326' },
    pot: { a: 'pot', c: '#7a5540' }, urn: { a: 'pot', c: '#6a5a4a' },
    sack: { a: 'sack', c: '#8a7a58' }, table: { a: 'table', c: '#5a422a' },
    chair: { a: 'chair', c: '#5a422a' }, pillar: { a: 'pillar', c: '#6a6458' },
    statue: { a: 'statue', c: '#7a7468' }, torch: { a: 'torch', c: '#3a2c1e', g: '#ffb04f', onWall: 1 },
    brazier: { a: 'brazier', c: '#4a4038', g: '#ffb04f' },
    brazier_unlit: { a: 'brazier_cold', c: '#4a4038' },
    candles: { a: 'candles', c: '#e8dcc0', g: '#ffcf6f' },
    lantern: { a: 'lantern', c: '#3f3428', g: '#ffcf8f' },
    chandelier: { a: 'chandelier', c: '#4a3c28', g: '#ffc98f' },
    crystal: { a: 'crystal', c: '#7bdcff', g: '#7bdcff' },
    echo_crystal: { a: 'crystal', c: '#9fb8ff', g: '#9fb8ff' },
    fel_crystal: { a: 'crystal', c: '#7cf05a', g: '#7cf05a' },
    orevein: { a: 'orevein', c: '#4a4038', g: '#ffd94f' },
    mushroom: { a: 'mushroom', c: '#6ae8a0', g: '#6ae8a0' },
    bones: { a: 'bones', c: '#cfc4a8' }, charred_bones: { a: 'bones', c: '#4a4038' },
    bog_skeleton: { a: 'bones', c: '#8a9078' }, ogre_bonepile: { a: 'skullpile', c: '#bdb08e' },
    skullpile: { a: 'skullpile', c: '#cfc4a8' },
    rubble: { a: 'rubble', c: '#5a544a' }, rock: { a: 'rock', c: '#4f463c' },
    corrupted_stone: { a: 'rock', c: '#5a4260' },
    stalagmite: { a: 'stalagmite', c: '#4a4038' },
    stalactite: { a: 'stalactite', c: '#4a4038' },
    spike: { a: 'spike', c: '#8a8f98' },
    cobweb: { a: 'cobweb', c: '#c8ccd4', nearWall: 1 },
    ritual_circle: { a: 'sigil', c: '#b04ad8', g: '#b04ad8' },
    demonic_sigil: { a: 'sigil', c: '#ff5a2a', g: '#ff5a2a' },
    grave: { a: 'grave', c: '#6a6458' }, grave_marker: { a: 'grave', c: '#5f5a50' },
    sarcophagus: { a: 'sarcophagus', c: '#6f6a5e' },
    bookshelf: { a: 'bookshelf', c: '#4f3a24' },
    weaponrack: { a: 'weaponrack', c: '#4f3a24' },
    anvil: { a: 'anvil', c: '#43474e' },
    cauldron: { a: 'cauldron', c: '#33302a', g: '#8ef04a' },
    wellhead: { a: 'wellhead', c: '#6a6458' },
    fountain: { a: 'fountain', c: '#7a7468', g: '#8fd8ff' },
    banner: { a: 'banner', c: '#8a2a2a', nearWall: 1 },
    soul_cage: { a: 'cage', c: '#3a342c', g: '#9fd8ff' },
    tree: { a: 'tree', c: '#3f6a34' }, twisted_tree: { a: 'deadtree', c: '#4a3c2c' },
    marsh_grass: { a: 'reeds', c: '#6a7a3a' },
    poison_vine: { a: 'vine', c: '#4a6a2a', g: '#9ef04a' },
    corpse_shroud: { a: 'shroud', c: '#b0a890' },
    haunted_doll: { a: 'doll', c: '#a89078' },
    reliquary: { a: 'shrinebox', c: '#8a7a48', g: '#ffd98f' },
    prison_cell: { a: 'cellfront', c: '#3f3a34', nearWall: 1 },
    spider_eggsac: { a: 'eggsac', c: '#d8d0c0', nearWall: 1 },
    plague_vat: { a: 'vat', c: '#4a4230', g: '#8ef04a' },
    dynamite: { a: 'dynamite', c: '#8a3a2a' },
    mining_beam: { a: 'beam', c: '#5a422a' },
    giant_clam: { a: 'clam', c: '#8a8a98' },
    coral_pillar: { a: 'coral', c: '#c86a8a' },
    idol: { a: 'idol', c: '#6a6458', g: '#ff5a2a' },
    lever: { a: 'lever', c: '#4a4038' },
    // map.things share the pipeline; they are props that answer back
    barrel: { a: 'barrel', c: '#5f4326' },
    chest: { a: 'chest', c: '#5a3a20', g: '#ffd94f' },
    goldpile: { a: 'goldpile', c: '#ffd94f', g: '#ffd94f' },
    shrine: { a: 'shrinebox', c: '#6a6458', g: '#8fd8ff' },
    // Doors also pass through this pipeline. These remain the guaranteed
    // fallback when an authored door is absent or rejected by the budget.
    wood: { a: 'door', c: '#6a4f30' },
    barred: { a: 'door', c: '#454038' },
    arch: { a: 'archway', c: '#686258' },
  },

  // ---- build ----
  _material(d) {
    d = d || {};
    const Ctor = THREE[d.type] || THREE.MeshStandardMaterial;
    const o = { color: d.color === undefined ? 0xffffff : d.color, transparent: !!d.transparent,
      opacity: d.opacity === undefined ? 1 : d.opacity, side: d.side === undefined ? THREE.FrontSide : d.side };
    if (Ctor === THREE.MeshStandardMaterial) Object.assign(o, { roughness: d.roughness === undefined ? 0.8 : d.roughness,
      metalness: d.metalness || 0, emissive: d.emissive || 0,
      emissiveIntensity: (d.emissiveIntensity === undefined ? 1 : d.emissiveIntensity) * this.EMIT,
      flatShading: !!d.flatShading });
    return new Ctor(o);
  },

  _geometry(d) {
    const Ctor = d && THREE[d.type], a = d && d.parameters;
    const order = {
      BoxGeometry: ['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments'],
      SphereGeometry: ['radius', 'widthSegments', 'heightSegments', 'phiStart', 'phiLength', 'thetaStart', 'thetaLength'],
      CylinderGeometry: ['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
      ConeGeometry: ['radius', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
      PlaneGeometry: ['width', 'height', 'widthSegments', 'heightSegments'],
      TorusGeometry: ['radius', 'tube', 'radialSegments', 'tubularSegments', 'arc'],
      IcosahedronGeometry: ['radius', 'detail'], CircleGeometry: ['radius', 'segments', 'thetaStart', 'thetaLength'],
    }[d && d.type];
    if (typeof Ctor !== 'function' || !a || !order) throw new Error('unsupported geometry ' + (d && d.type));
    return new Ctor(...order.map(k => a[k]));
  },

  _compileAuthored(doc, slug, spec, fallbackDraws) {
    if (!doc || doc.format !== 'diabloid-primitive-scene' || doc.version !== 1 ||
        doc.coordinateSystem !== 'right-handed-y-up' || !Array.isArray(doc.meshes) || !doc.meshes.length)
      throw new Error('malformed compiled template');
    const mats = (doc.materials || []).map(d => this._material(d));
    const groups = new Map(); let triangles = 0;
    doc.meshes.forEach((m, sourceIndex) => {
      const geometry = this._geometry(m.geometry), pos = geometry.getAttribute('position');
      triangles += geometry.index ? geometry.index.count / 3 : (pos ? pos.count / 3 : 0);
      const key = JSON.stringify(m.geometry) + '|' + m.material;
      if (!groups.has(key)) groups.set(key, { geometry, material: mats[m.material] || mats[0], locals: [] });
      else geometry.dispose();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(m.rotation || [0, 0, 0])));
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...(m.position || [0, 0, 0])), q,
        new THREE.Vector3(...(m.scale || [1, 1, 1])));
      const md = doc.materials[m.material] || {};
      groups.get(key).locals.push({ matrix, sourceIndex, emissive: !!md.emissive });
    });
    const draws = groups.size, allowed = spec.maxDraws === undefined ? fallbackDraws + 4 : spec.maxDraws;
    if (draws > allowed) {
      const error = new Error('draw budget ' + draws + '/' + allowed);
      error.meshCount = doc.meshes.length; error.triangles = Math.round(triangles);
      throw error;
    }
    return { slug, groups: [...groups.values()], meshCount: doc.meshes.length, triangles: Math.round(triangles),
      sourceHeight: spec.height || 1, unitsPerMetre: doc.unitsPerMetre || 1, metadata: spec.parts || {} };
  },

  _modelSpec(kind) {
    if (!R3.authoredModels) return null;
    const own = this.MODEL_MAP[kind];
    if (!own) return null;
    const manifest = typeof Assets !== 'undefined' && Assets.MANIFEST[own.slot];
    const slug = manifest && manifest.slug;
    return slug && (!manifest.fit || manifest.fit === 'good') ? Object.assign({}, own, { slug }) : null;
  },

  _requestAuthored(kind, spec, fallbackDraws, token) {
    if (!this.authoredModels) return;
    if (!R3.authoredModels) return;
    if (this._authored.has(spec.slug) || this._requests.has(spec.slug)) return;
    const url = 'assets/models/baked/' + encodeURIComponent(spec.slug) + '.scene.json';
    const p = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(doc => this._compileAuthored(doc, spec.slug, spec, fallbackDraws))
      .then(t => this._authored.set(spec.slug, { template: t }))
      .catch(e => this._authored.set(spec.slug, { reason: e.message || String(e),
        meshCount: e.meshCount || 0, triangles: e.triangles || 0 }))
      .finally(() => {
        this._requests.delete(spec.slug);
        if (this.map && this._buildToken === token) this.build(this.map);
      });
    this._requests.set(spec.slug, p);
  },

  _diagnose(kind, slug, reason, meshCount, triangles, count) {
    const d = { kind, slug: slug || null, fallbackReason: reason || null, meshCount: meshCount || 0,
      triangleCount: triangles || 0, instantiatedCount: count, authoredModels: !!R3.authoredModels };
    this.diagnostics.push(d);
    if (typeof location !== 'undefined' && (location.hostname === 'localhost' || /[?&]props3diag\b/.test(location.search)))
      console.info('[Props3]', d);
  },

  _chunkLists(list) {
    if (!this.CHUNK_SIZE || list.length < this.CHUNK_MIN_INSTANCES) return [list];
    const chunks = new Map();
    for (const pr of list) {
      const key = Math.floor(pr.x / this.CHUNK_SIZE) + ',' + Math.floor(pr.y / this.CHUNK_SIZE);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(pr);
    }
    return chunks.size > 1 ? [...chunks.values()] : [list];
  },

  _finishMesh(im) {
    const base = im.geometry.boundingBox || (im.geometry.computeBoundingBox(), im.geometry.boundingBox);
    const box = new THREE.Box3(), one = new THREE.Box3(), matrix = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, matrix); box.union(one.copy(base).applyMatrix4(matrix)); }
    // Authored geometry can be shared with another part, so clone before
    // attaching batch-specific bounds.
    im.geometry = im.geometry.clone();
    im.geometry.boundingBox = box;
    im.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    im.userData.spatialBatch = { category: 'prop:' + im.userData.kind, instances: im.count };
    this.batches.push(im);
  },

  batchStats(camera) {
    const totalInstances = this.batches.reduce((n, im) => n + im.count, 0);
    const pv = camera && new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = pv && new THREE.Frustum().setFromProjectionMatrix(pv);
    let submittedVisibleInstances = 0, calls = 0;
    for (const im of this.batches) {
      if (!im.visible || (frustum && !frustum.intersectsObject(im))) continue;
      submittedVisibleInstances += im.count; calls++;
    }
    return { totalInstances, submittedVisibleInstances, calls };
  },

  // One pass to bucket by kind, one to size the instance buffers, one to fill
  // them. Props never move, so this happens once per map and then nothing
  // touches it until something is smashed.
  build(map) {
    this.dispose();
    const token = ++this._buildToken;
    this.diagnostics = [];
    this.batches = [];
    this.map = map;
    const g = new THREE.Group();
    this.group = g;
    R3.scene.add(g);

    const all = [];
    for (const pr of map.props || []) all.push(pr);
    for (const th of map.things || []) all.push(th);
    for (const door of map.doors || []) all.push(door);

    const byKind = new Map();
    for (const pr of all) {
      const k = pr.kind;
      if (!byKind.has(k)) byKind.set(k, []);
      byKind.get(k).push(pr);
    }

    const wallCol = (THEMES[map.theme] || {}).wall || '#5a544a';
    const geo = this.geo();
    let parts = 0;

    for (const [kind, wholeList] of byKind) {
      const def = this.KIND[kind] || { a: 'rubble', c: wallCol };
      const make = this.ARCH[def.a] || this.ARCH.rubble;
      let tmpl = make(def.c, def.g || def.c);
      const spec = R3.authoredModels ? this._modelSpec(kind) : null;
      const cached = spec && this._authored.get(spec.slug);
      let authored = cached && cached.template;
      if (spec && !cached) this._requestAuthored(kind, spec, tmpl.length, token);
      if (authored) {
        tmpl = authored.groups.map(group => ({ authored: true, group, locals: group.locals,
          e: group.locals.some(p => p.emissive) ? 1 : 0 }));
      }
      for (const list of this._chunkLists(wholeList)) {
        const meshes = [];
        for (const part of tmpl) {
          const im = new THREE.InstancedMesh(
            authored ? part.group.geometry : geo[part.g],
            authored ? part.group.material : this.mat(part.g, part.c, part.e, part.alpha),
            list.length * (part.locals ? part.locals.length : 1));
          im.castShadow = !part.e;         // a light source casting its own shadow reads as a hole
          im.receiveShadow = !part.e;
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.userData.kind = kind;
          g.add(im);
          meshes.push(im);
          parts++;
        }
        const set = { kind, meshes, tmpl, list, def, authored,
          metadata: authored ? authored.metadata : (this.ATTACHMENTS[kind] || {}) };
        set.face = list.map(pr => this._facing(map, pr, def));
        this.sets.push(set);

        list.forEach((pr, i) => {
          this.slot.set(pr, { set, i });
          this._place(set, i, pr);
        });
        for (const im of meshes) {
          im.instanceMatrix.needsUpdate = true;
          this._finishMesh(im);
        }
      }
      this._diagnose(kind, spec && spec.slug,
        authored ? null : (cached && cached.reason || (spec ? 'loading authored template' : 'no suitable authored mapping')),
        authored ? authored.meshCount : cached && cached.meshCount,
        authored ? authored.triangles : cached && cached.triangles, wholeList.length);
    }

    this.built = true;
    return { kinds: byKind.size, props: all.length, draws: parts };
  },

  // Which way a wall-relative prop should look.
  //
  // The generator puts a torch sconce ON the wall tile, because a 2D renderer
  // drew it against the wall face and the tile it belonged to was just a
  // sorting key. Geometry is less forgiving: a wall is a solid 1.9-unit box,
  // so a sconce at the tile centre is inside it and invisible. Wall-mounted
  // props get pushed out to the face they light, and wall-hugging ones get
  // turned so their backs are against the stone.
  _facing(map, pr, def) {
    if (!map || (!def.onWall && !def.nearWall)) return null;
    const tx = Math.floor(pr.x), ty = Math.floor(pr.y);
    const wantWall = !!def.nearWall;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dx, dz] of dirs) {
      const nx = tx + dx, nz = ty + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const isWall = map.t[nz * map.w + nx] === TILE.WALL;
      if (isWall !== wantWall) continue;
      // +Z points away from the stone in both cases; only the push differs
      const fx = wantWall ? -dx : dx, fz = wantWall ? -dz : dz;
      // 0.5 is the wall face exactly; go slightly proud so the sconce is
      // outside the wall box rather than coplanar with it
      const push = wantWall ? 0.3 : 0.56;
      return { yaw: Math.atan2(fx, fz), ox: fx * push, oz: fz * push };
    }
    return null;
  },

  // Per-prop variation is a yaw and a small scale off the generator's own seed,
  // which keeps every instance sharing one buffer while stopping a row of
  // crates from looking stamped.
  _place(set, i, pr) {
    const s = (pr.seed || 0);
    const f = set.face && set.face[i];
    const yaw = f ? f.yaw : (pr.ori ? 0 : ((s * 37) % 628) / 100);
    const ox = f ? f.ox : 0, oz = f ? f.oz : 0;
    const sc = pr.smashed || pr.taken || pr.destroyed ? 0 : 0.9 + ((s * 13) % 25) / 100;
    // An unlit fire source keeps its bracket and bowl and loses its flame.
    // Instancing means a part cannot be hidden on its own, but it can be
    // scaled to nothing, which is the same thing to the rasteriser.
    const cold = pr.lit === false;
    const S = this._scratch || (this._scratch = {
      m4: new THREE.Matrix4(), pm: new THREE.Matrix4(), q: new THREE.Quaternion(),
      e: new THREE.Euler(), v: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(),
    });
    for (let p = 0; p < set.tmpl.length; p++) {
      const part = set.tmpl[p];
      if (part.authored) {
        const hideEmissive = cold && part.e > 0;
        for (let j = 0; j < part.locals.length; j++) {
          const local = part.locals[j], hidden = hideEmissive || pr.smashed || pr.taken || pr.destroyed;
          S.e.set(0, yaw + (pr.ori === 'h' ? Math.PI / 2 : 0), 0); S.q.setFromEuler(S.e);
          const visibleScale = hidden ? 0 : sc;
          S.m4.compose(S.v3.set(pr.x + ox, 0, pr.y + oz), S.q, S.v.set(visibleScale, visibleScale, visibleScale));
          if (pr.open && set.metadata && set.metadata.doorLeaves) {
            S.e.set(0, (pr.swing || 1) * pr.open * Math.PI * 0.48, 0);
            S.pm.makeRotationFromEuler(S.e).multiply(local.matrix);
            S.m4.multiply(S.pm);
          } else S.m4.multiply(local.matrix);
          set.meshes[p].setMatrixAt(i * part.locals.length + j, S.m4);
        }
        continue;
      }
      if (part.r) { S.e.set(part.r[0], part.r[1], part.r[2]); S.q.setFromEuler(S.e); }
      else S.q.identity();
      S.pm.compose(S.v.set(part.p[0], part.p[1], part.p[2]), S.q,
        S.v2.set(part.s[0], part.s[1], part.s[2]));
      if (part.role === 'doorLeaf' && pr.open) {
        S.e.set(part.r ? part.r[0] : 0, (part.r ? part.r[1] : 0) + (pr.swing || 1) * pr.open * Math.PI * 0.48,
          part.r ? part.r[2] : 0); S.q.setFromEuler(S.e);
        S.pm.compose(S.v.set(part.p[0], part.p[1], part.p[2]), S.q, S.v2.set(part.s[0], part.s[1], part.s[2]));
      }
      S.e.set(0, yaw + (pr.ori === 'h' ? Math.PI / 2 : 0), 0); S.q.setFromEuler(S.e);
      const ps = (cold && part.e > 0) ? 0 : sc;
      S.m4.compose(S.v3.set(pr.x + ox, 0, pr.y + oz), S.q, S.v.set(ps, ps, ps));
      S.m4.multiply(S.pm);
      set.meshes[p].setMatrixAt(i, S.m4);
    }
  },

  // A prop that gets smashed, looted or lit changes state, not geometry: its
  // instance is rewritten in place.
  refresh(pr) {
    const s = this.slot.get(pr);
    if (!s) return false;
    this._place(s.set, s.i, pr);
    for (const im of s.set.meshes) im.instanceMatrix.needsUpdate = true;
    return true;
  },

  // Free what this build owns, and nothing that outlives it.
  //
  // This used to call only InstancedMesh.dispose(), which frees the instance
  // matrix buffer and NOTHING else — not the geometry, not the material, even
  // though the condition tested for geometry before ignoring it. build() reruns
  // every time an authored template resolves, so a map load rebuilt the prop
  // scene repeatedly and leaked every geometry and material each time. That is
  // GPU memory, and exhausting it is how a WebGL context gets lost.
  //
  // The reason it was written defensively is real: compiled templates live in
  // `_authored`, keyed by slug, and are reused by every subsequent build. Their
  // geometry and materials must survive this group being torn down, so they are
  // collected into a keep set first. Everything else was made for this build.
  //
  // Disposing a cached template's geometry would produce a blank world just as
  // surely as leaking it — in the other direction, and one frame sooner.
  dispose() {
    if (this.group && R3.scene) {
      R3.scene.remove(this.group);
      const keep = new Set();
      for (const template of this._authored.values())
        for (const g of (template && template.groups) || []) { keep.add(g.geometry); keep.add(g.material); }
      this.group.traverse(n => {
        if (n.isInstancedMesh) n.dispose();
        if (n.geometry && !keep.has(n.geometry)) n.geometry.dispose();
        const mat = n.material;
        if (mat) for (const one of (Array.isArray(mat) ? mat : [mat])) if (one && !keep.has(one)) one.dispose();
      });
    }
    this.group = null; this.sets = []; this.batches = []; this.slot = new WeakMap(); this.built = false;
  },
};

// template helpers, kept out of the object so the tables above stay readable
function b(g, c, p, s, r, e, alpha, role) {
  return { g, c, p, s: s || [1, 1, 1], r: r || null, e: e || 0, alpha, role };
}
function sh(c, f) { return U.shade(c, f); }
