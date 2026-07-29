// ============ DIABLOID: world3d.js — dungeon geometry & lighting ============
'use strict';

// Builds the level as real geometry once per map, then leaves it alone. A 92x92
// dungeon is ~8,500 tiles; drawing those as individual meshes would be ~8,500
// draw calls a frame. InstancedMesh collapses each category to one, so the
// whole level costs a handful when visible. Spatial chunks trade some calls
// for rejecting the large majority of off-camera tile and shadow instances.
//
// This also retires two hacks the 2D renderer needed:
//   - the painter's-algorithm depth sort, replaced by the z-buffer
//   - the punch-out darkness pass, replaced by actual point lights
// Both were workarounds for not having a GPU do the work.

const World3 = {
  group: null,
  map: null,
  lights: [],          // { light, src } — src is the map.lights entry
  hero: null,          // the hero's own lamp
  ambient: null,
  shafts: [],
  built: false,
  _lightSelection: null,
  LIGHT_RESELECT_D2: 0.75 * 0.75,
  CHUNK_SIZE: 16,
  batches: [],

  // Benchmark hook: 0 restores the old, single global batch per category.
  // Rebuilding is intentional so captures never mix two batching layouts.
  setChunkSize(size, rebuild) {
    const next = size === 0 ? 0 : Math.max(1, Math.floor(Number(size) || 16));
    if (next === this.CHUNK_SIZE) return false;
    this.CHUNK_SIZE = next;
    if (rebuild !== false && this.map) this.build(this.map);
    return true;
  },

  // Three r128 does not derive an InstancedMesh's culling volume from its
  // instance matrices.  Give every batch its own geometry (and therefore its
  // own bounds) and union the transformed primitive bounds explicitly.
  _finishBatch(im, matrices, category, chunk) {
    const box = new THREE.Box3(), one = new THREE.Box3();
    im.geometry.computeBoundingBox();
    for (const matrix of matrices) box.union(one.copy(im.geometry.boundingBox).applyMatrix4(matrix));
    im.geometry.boundingBox = box;
    im.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.count = matrices.length;
    im.userData.spatialBatch = { category, chunk, instances: matrices.length };
    this.batches.push(im);
  },

  batchStats(camera) {
    const totalInstances = this.batches.reduce((n, im) => n + im.count, 0);
    if (!camera) return { totalInstances, submittedVisibleInstances: totalInstances, calls: this.batches.length };
    camera.updateMatrixWorld();
    const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(pv);
    let submittedVisibleInstances = 0, calls = 0;
    for (const im of this.batches) {
      if (!im.visible || !frustum.intersectsObject(im)) continue;
      submittedVisibleInstances += im.count; calls++;
    }
    return { totalInstances, submittedVisibleInstances, calls };
  },

  // ---- materials ----
  _mat(theme) {
    const th = THEMES[theme];
    const mk = (hex, rough) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: rough === undefined ? 0.92 : rough, metalness: 0.02,
    });
    return {
      floor: mk(th.floor), floorAlt: mk(th.floorAlt),
      wall: mk(th.wall), wallTop: mk(th.wallTop, 0.85),
      door: mk('#4a3420', 0.8),
      lava: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ff5a1c'), emissive: new THREE.Color('#ff4a10'),
        emissiveIntensity: 1.4, roughness: 0.6,
      }),
      water: new THREE.MeshStandardMaterial({
        color: new THREE.Color(th.water || '#28455c'), roughness: 0.15, metalness: 0.35,
        transparent: true, opacity: 0.86,
      }),
      haz: mk('#3a2a18', 0.95),
    };
  },

  // ---- build ----
  build(map) {
    this.dispose();
    this.batches = [];
    this.map = map;
    this.built = false;
    const g = new THREE.Group();
    this.group = g;
    R3.scene.add(g);

    this.configureAtmosphere(map);

    const M = this._mat(map.theme);
    const { w, h } = map;

    const plane = new THREE.BoxGeometry(1, 0.12, 1);
    const wallGeo = new THREE.BoxGeometry(1, 1.9, 1);
    const doorGeo = new THREE.BoxGeometry(1, 0.12, 1);

    const mk = (geo, mat, entries, cast, receive, category, chunk) => {
      if (!entries.length) return null;
      const im = new THREE.InstancedMesh(geo.clone(), mat, entries.length);
      im.castShadow = !!cast; im.receiveShadow = receive !== false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(im);
      entries.forEach((e, i) => { im.setMatrixAt(i, e.matrix); if (e.color) im.setColorAt(i, e.color); });
      this._finishBatch(im, entries.map(e => e.matrix), category, chunk);
      return im;
    };
    const chunks = new Map(), totals = { floor: 0, wall: 0, door: 0, lava: 0, water: 0, haz: 0 };
    const put = (tx, ty, category, matrix, color) => {
      const key = this.CHUNK_SIZE
        ? Math.floor(tx / this.CHUNK_SIZE) + ',' + Math.floor(ty / this.CHUNK_SIZE)
        : 'global';
      if (!chunks.has(key)) chunks.set(key, { floor: [], wall: [], door: [], lava: [], water: [], haz: [] });
      chunks.get(key)[category].push({ matrix: matrix.clone(), color: color && color.clone() }); totals[category]++;
    };
    const m4 = new THREE.Matrix4(), col = new THREE.Color();

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const t = map.t[i], hz = map.haz[i];
        const x = tx + 0.5, z = ty + 0.5;
        if (t === TILE.WALL) {
          m4.makeTranslation(x, 0.95, z);
          // vary the wall tone a little so a long corridor is not one flat slab
          const v = 0.86 + (map.variant[i] % 6) * 0.045;
          col.set(THEMES[map.theme].wall).multiplyScalar(v);
          put(tx, ty, 'wall', m4, col);
          continue;
        }
        m4.makeTranslation(x, 0, z);
        if (t === TILE.DOOR) put(tx, ty, 'door', m4);
        if (hz === HAZ.LAVA) put(tx, ty, 'lava', m4);
        else if (hz === HAZ.WATER) put(tx, ty, 'water', m4);
        else if (hz) put(tx, ty, 'haz', m4);
        else if (t !== TILE.DOOR) {
          const v = 0.9 + (map.variant[i] % 6) * 0.035;
          col.set(map.variant[i] & 1 ? THEMES[map.theme].floorAlt : THEMES[map.theme].floor).multiplyScalar(v);
          put(tx, ty, 'floor', m4, col);
        } else {
          // A door still needs floor under it. Supply a colour as well: once
          // any sibling instance has a colour attribute, unset entries are
          // black rather than inheriting the material colour.
          col.set(THEMES[map.theme].floor);
          put(tx, ty, 'floor', m4, col);
        }
      }
    }
    for (const [chunk, bucket] of chunks) {
      mk(plane, M.floor, bucket.floor, false, true, 'floor', chunk);
      mk(wallGeo, M.wall, bucket.wall, true, true, 'wall', chunk);
      mk(doorGeo, M.door, bucket.door, false, true, 'door', chunk);
      mk(plane, M.lava, bucket.lava, false, true, 'lava', chunk);
      mk(plane, M.water, bucket.water, false, true, 'water', chunk);
      mk(plane, M.haz, bucket.haz, false, true, 'haz', chunk);
    }
    plane.dispose(); wallGeo.dispose(); doorGeo.dispose();

    this.buildLights(map);
    this.buildShafts(map);
    this.built = true;
    return { floors: totals.floor, walls: totals.wall, doors: totals.door, lava: totals.lava,
      water: totals.water, haz: totals.haz, batches: this.batches.length, lights: this.lights.length };
  },

  // Exponential fog density per unit of a theme's authored fog weight.
  FOG_MUL: 0.013,

  configureAtmosphere(map) {
    const th = THEMES[map.theme] || THEMES.crypt;
    R3.grade = th.grade || null;
    // Town keeps its long sight lines; dungeons use exponential fog so rooms
    // disappear gently without moving the camera's far plane.
    // The multiplier turns a theme's 0-1 fog weight into an exponential density.
    // At 0.022 it read as haze in every room rather than depth at distance, so
    // it is the one number to change if dungeons look too thick or too clear —
    // the per-theme weights stay as authored.
    const density = map.theme === 'town' ? 0.00035 : (th.fog ? th.fog[1] * this.FOG_MUL : 0.0015);
    this.fog = th.fog ? new THREE.FogExp2(new THREE.Color(th.fog[0]), density) : null;
    this.updateAtmosphere(true);
  },

  updateAtmosphere(enabled) {
    if (!R3.scene) return;
    R3.scene.fog = enabled === false ? null : this.fog;
  },

  buildShafts(map) {
    const th = THEMES[map.theme];
    this.shafts = [];
    if (!th.shaft) return;
    const geo = new THREE.ConeGeometry(1, 7, 12, 1, true);
    for (const src of map.shafts || []) {
      const mat = new THREE.MeshBasicMaterial({
        color: th.shaft, transparent: true, opacity: 0.075,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(src.x, 3.5, src.y);
      mesh.scale.set(src.w, 1, src.w);
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.shafts.push({ mesh, src });
    }
  },

  updateShafts(t, enabled) {
    const fx = R3.focus;
    for (const e of this.shafts) {
      const dx = e.src.x - fx.x, dz = e.src.y - fx.z;
      e.mesh.visible = !!enabled && dx * dx + dz * dz < 34 * 34;
      if (e.mesh.visible) e.mesh.material.opacity = 0.06 + Math.sin(t * 0.7 + e.src.phase) * 0.018;
    }
  },

  // ---- lighting ----
  // Keep the light and renderer switches together. This can be called whenever
  // the effective quality setting changes; repeated calls are deliberately a
  // no-op from Three.js's point of view.
  setShadows(enabled) {
    const on = !!enabled;
    R3.shadows = on;
    if (this.hero) this.hero.castShadow = on;
    if (R3.renderer && R3.renderer.shadowMap) R3.renderer.shadowMap.enabled = on;
  },

  // Real point lights, budgeted. Every torch in the level gets an entry, but
  // only the nearest `R3.maxLights` are switched on each frame: WebGL pays per
  // light per fragment, and a 40-torch crypt would tank the frame otherwise.
  buildLights(map) {
    const th = THEMES[map.theme];
    this.ambient = new THREE.AmbientLight(new THREE.Color(th.wallTop), 0.18);
    this.group.add(this.ambient);

    // a very dim directional fill so silhouettes read even in full dark
    const key = new THREE.DirectionalLight(new THREE.Color(th.wallTop), 0.08);
    key.position.set(0.4, 1, 0.25);
    this.group.add(key);
    this.keyLight = key;

    this.lights = [];
    for (const src of map.lights) {
      const l = new THREE.PointLight(new THREE.Color(src.color || th.torch), 0, src.r * 1.6, 1.8);
      l.position.set(src.x, 1.1, src.y);
      l.castShadow = false;          // per-light shadow maps are far too costly
      this.group.add(l);
      this.lights.push({ light: l, src });
    }

    // the hero's own lamp — dimmed hard in spooky, which is what makes the
    // props carry the level
    this.hero = new THREE.PointLight(new THREE.Color('#ffd9a0'), 1, 10, 1.9);
    if (this.hero.shadow) {
      this.hero.shadow.mapSize.width = 512;
      this.hero.shadow.mapSize.height = 512;
      this.hero.shadow.bias = -0.004;
    }
    this.group.add(this.hero);
    this._lightSelection = null;
    this.setShadows(R3.shadows);
  },

  // Rebuilding Three's light program is substantially more expensive than
  // updating a few intensities. Cull by each light's influence sphere against
  // the camera frustum, then keep that set until movement is meaningful.
  // The state stamp makes lighting/snuffing a sconce invalidate immediately.
  _selectLights(px, pz, budget) {
    const cam = R3.cam;
    // updateLights runs after lookAt but before render(), so refresh the rig
    // here before deriving the visibility volume.
    R3.updateCamera();
    const state = this.lights.map(e => e.src.lit === false ? '0' : '1').join('');
    const old = this._lightSelection;
    const cameraStamp = [R3.mode, R3.yaw.toFixed(2), R3.pitch.toFixed(2), R3.zoom.toFixed(2)].join(':');
    const moved = !old || (px - old.x) ** 2 + (pz - old.z) ** 2 >= this.LIGHT_RESELECT_D2;
    if (old && !moved && old.budget === budget && old.state === state && old.camera === cameraStamp) return old.selected;

    cam.updateMatrixWorld(true);
    const matrix = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
    const sphere = new THREE.Sphere();
    const candidates = [];
    // Frustum/sphere intersection alone admits lights deep inside the camera
    // pyramid even when their influence cannot reach the patch of ground the
    // player can see. Approximate that patch with a deliberately oversized
    // circle. Dividing by sin(pitch) accounts for the footprint stretching as
    // the camera approaches the horizon; the light radius is added below.
    const cameraDistance = R3.dist / R3.zoom;
    const halfFov = THREE.MathUtils.degToRad(cam.fov * 0.5);
    const halfHeight = cameraDistance * Math.tan(halfFov);
    // The bottom ray reaches much farther than the footprint at the focus in
    // the free camera. If it reaches the horizon, fall back to the camera far
    // plane rather than risk popping a visible light.
    const farGround = R3.pitch > halfFov
      ? cameraDistance * Math.sin(R3.pitch) / Math.tan(R3.pitch - halfFov)
        - cameraDistance * Math.cos(R3.pitch)
      : cam.far;
    const groundViewRadius = Math.max(halfHeight / Math.max(0.08, Math.sin(R3.pitch)), farGround)
      * Math.sqrt(1 + cam.aspect * cam.aspect);
    for (const e of this.lights) {
      if (e.src.lit === false) continue; // cold sconces never consume the budget
      const radius = e.light.distance || e.src.r * 1.6;
      const dx = e.src.x - px, dz = e.src.y - pz;
      e.d2 = dx * dx + dz * dz;
      const reach = groundViewRadius + radius;
      // This cheap ground-plane rejection also makes the effective influence
      // limit explicit instead of relying only on the 3D frustum test.
      if (e.d2 > reach * reach) continue;
      sphere.center.set(e.src.x, e.light.position.y, e.src.y);
      sphere.radius = radius;
      // A sphere test is deliberately conservative: off-screen sources remain
      // eligible when their illumination can still reach visible geometry.
      if (!frustum.intersectsSphere(sphere)) continue;
      candidates.push(e);
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    const selected = new Set(candidates.slice(0, budget));
    for (const e of this.lights) {
      const visible = selected.has(e);
      if (e.light.visible !== visible) e.light.visible = visible;
      if (!visible) e.light.intensity = 0;
    }
    this._lightSelection = { x: px, z: pz, budget, state, camera: cameraStamp, selected };
    return selected;
  },

  updateLights(t, px, pz) {
    if (!this.built) return 0;
    const spooky = R3.mood === 'spooky';
    if (this.ambient) this.ambient.intensity = spooky ? 0.055 : 0.18;
    if (this.keyLight) this.keyLight.intensity = spooky ? 0.03 : 0.08;

    const budget = R3.maxLights;
    const arr = this.lights;
    const selected = this._selectLights(px, pz, budget);
    let on = 0;
    for (const e of arr) {
      if (!selected.has(e)) continue;
      const s = e.src;
      let k = 1;
      if (s.flick) k = 0.82 + Math.sin(t * 11 + s.x * 7 + s.y * 13) * 0.18;
      if (s.vent !== undefined) {
        // vents only shine while the jet is out, same cycle the damage uses
        k *= ventJetting(s.vent, t)
          ? Math.sin(Math.min(1, ventPhase(s.vent, t) / VENT_JET) * Math.PI)
          : ventCharge(s.vent, t) * 0.25;
      }
      e.light.intensity = k * (spooky ? 2.6 : 1.9);
      if (k > 0.01) on++;
    }

    if (this.hero) {
      // Shadow quality can change at runtime under the governor/settings.
      this.hero.castShadow = R3.shadows;
      const pl = G.player;
      const rad = pl && pl.derived ? pl.derived.lightRad : 7;
      this.hero.position.set(px, 1.4, pz);
      this.hero.distance = rad * (spooky ? R3.heroLightMul : 1) * 1.5;
      this.hero.intensity = spooky ? 0.9 : 1.7;
    }
    return on;
  },

  dispose() {
    if (this.group && R3.scene) {
      R3.scene.remove(this.group);
      this.group.traverse(n => {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
          else n.material.dispose();
        }
      });
    }
    this.group = null; this.batches = []; this.lights = []; this._lightSelection = null; this.shafts = []; this.hero = null; this.fog = null; this.built = false;
    if (R3.scene) R3.scene.fog = null;
  },
};
