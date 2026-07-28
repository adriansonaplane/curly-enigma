// ============ DIABLOID: world3d.js — dungeon geometry & lighting ============
'use strict';

// Builds the level as real geometry once per map, then leaves it alone. A 92x92
// dungeon is ~8,500 tiles; drawing those as individual meshes would be ~8,500
// draw calls a frame. InstancedMesh collapses each category to one, so the
// whole level costs a handful regardless of size.
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
    this.map = map;
    this.built = false;
    const g = new THREE.Group();
    this.group = g;
    R3.scene.add(g);

    this.configureAtmosphere(map);

    const M = this._mat(map.theme);
    const { w, h } = map;

    // Count first so each InstancedMesh is sized exactly — an oversized
    // instance buffer costs memory and an undersized one silently drops tiles.
    let nFloor = 0, nWall = 0, nDoor = 0, nLava = 0, nWater = 0, nHaz = 0;
    for (let i = 0; i < w * h; i++) {
      const t = map.t[i], hz = map.haz[i];
      if (t === TILE.WALL) { nWall++; continue; }
      if (t === TILE.DOOR) nDoor++;
      if (hz === HAZ.LAVA) nLava++;
      else if (hz === HAZ.WATER) nWater++;
      else if (hz) nHaz++;
      else nFloor++;
    }

    const plane = new THREE.BoxGeometry(1, 0.12, 1);
    const wallGeo = new THREE.BoxGeometry(1, 1.9, 1);
    const doorGeo = new THREE.BoxGeometry(1, 0.12, 1);

    const mk = (geo, mat, n, cast, receive) => {
      if (!n) return null;
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = !!cast; im.receiveShadow = receive !== false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(im);
      return im;
    };

    const floors = mk(plane, M.floor, nFloor);
    const walls = mk(wallGeo, M.wall, nWall, true);
    const doors = mk(doorGeo, M.door, nDoor);
    const lava = mk(plane, M.lava, nLava, false);
    const water = mk(plane, M.water, nWater, false);
    const hazm = mk(plane, M.haz, nHaz);

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let fi = 0, wi = 0, di = 0, li = 0, ai = 0, hi = 0;

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const t = map.t[i], hz = map.haz[i];
        const x = tx + 0.5, z = ty + 0.5;
        if (t === TILE.WALL) {
          m4.makeTranslation(x, 0.95, z);
          walls.setMatrixAt(wi, m4);
          // vary the wall tone a little so a long corridor is not one flat slab
          const v = 0.86 + (map.variant[i] % 6) * 0.045;
          col.set(THEMES[map.theme].wall).multiplyScalar(v);
          walls.setColorAt(wi, col);
          wi++;
          continue;
        }
        m4.makeTranslation(x, 0, z);
        if (t === TILE.DOOR) { doors.setMatrixAt(di++, m4); }
        if (hz === HAZ.LAVA) lava.setMatrixAt(li++, m4);
        else if (hz === HAZ.WATER) water.setMatrixAt(ai++, m4);
        else if (hz) hazm.setMatrixAt(hi++, m4);
        else if (t !== TILE.DOOR) {
          floors.setMatrixAt(fi, m4);
          const v = 0.9 + (map.variant[i] % 6) * 0.035;
          col.set(map.variant[i] & 1 ? THEMES[map.theme].floorAlt : THEMES[map.theme].floor).multiplyScalar(v);
          floors.setColorAt(fi, col);
          fi++;
        } else {
          floors.setMatrixAt(fi, m4); fi++;   // a door still needs floor under it
        }
      }
    }
    for (const im of [floors, walls, doors, lava, water, hazm]) {
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.count = im === floors ? fi : im === walls ? wi : im === doors ? di
               : im === lava ? li : im === water ? ai : hi;
    }

    this.buildLights(map);
    this.buildShafts(map);
    this.built = true;
    return { floors: fi, walls: wi, doors: di, lava: li, water: ai, haz: hi, lights: this.lights.length };
  },

  configureAtmosphere(map) {
    const th = THEMES[map.theme] || THEMES.crypt;
    R3.grade = th.grade || null;
    // Town keeps its long sight lines; dungeons use exponential fog so rooms
    // disappear gently without moving the camera's far plane.
    const density = map.theme === 'town' ? 0.00035 : (th.fog ? th.fog[1] * 0.022 : 0.0015);
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
    this.hero.castShadow = R3.shadows;
    if (this.hero.shadow) {
      this.hero.shadow.mapSize.width = 512;
      this.hero.shadow.mapSize.height = 512;
      this.hero.shadow.bias = -0.004;
    }
    this.group.add(this.hero);
  },

  updateLights(t, px, pz) {
    if (!this.built) return 0;
    const spooky = R3.mood === 'spooky';
    if (this.ambient) this.ambient.intensity = spooky ? 0.055 : 0.18;
    if (this.keyLight) this.keyLight.intensity = spooky ? 0.03 : 0.08;

    // nearest-N: sort by distance to the player, light those, mute the rest
    const budget = R3.maxLights;
    const arr = this.lights;
    for (const e of arr) {
      const dx = e.src.x - px, dz = e.src.y - pz;
      // A cold sconce is sorted to the back, not just set to zero intensity:
      // otherwise standing next to an unlit torch spends one of the twelve
      // light slots on darkness and dims the room you are actually in.
      e.d2 = e.src.lit === false ? Infinity : dx * dx + dz * dz;
    }
    arr.sort((a, b) => a.d2 - b.d2);
    let on = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (i >= budget || e.src.lit === false) { e.light.intensity = 0; continue; }
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
    this.group = null; this.lights = []; this.shafts = []; this.hero = null; this.fog = null; this.built = false;
    if (R3.scene) R3.scene.fog = null;
  },
};
