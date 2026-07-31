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
  options: { fog: true, shafts: true },
  configure(config) { this.options = { fog: config.fog !== false, shafts: config.shafts !== false }; },
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
    const M = {
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

    const useTex = typeof GraphicsConfig !== 'undefined' && GraphicsConfig.current.textures !== false;
    const tex = useTex && typeof DungeonTextures !== 'undefined' ? DungeonTextures.get(theme) : null;
    if (tex) {
      M.floor.color.set(0xffffff);
      M.floor.map = tex.floor;
      M.floor.normalMap = tex.floorN;
      M.floor.normalScale = new THREE.Vector2(1.2, 1.2);
      const fs = tex.floorScale.toFixed(6);
      M.floor.onBeforeCompile = s => {
        s.vertexShader = s.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_INSTANCING\nvUv=(modelMatrix*instanceMatrix*vec4(position,1.)).xz*' + fs + ';\n#else\nvUv=(modelMatrix*vec4(position,1.)).xz*' + fs + ';\n#endif');
      };
      M.floor.customProgramCacheKey = 'floor_' + fs;

      M.wall.color.set(0xffffff);
      M.wall.map = tex.wall;
      M.wall.normalMap = tex.wallN;
      M.wall.normalScale = new THREE.Vector2(1.0, 1.0);
      const ws = tex.wallScale.toFixed(6);
      M.wall.onBeforeCompile = s => {
        s.vertexShader = s.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_INSTANCING\nvec3 _wP=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;\n#else\nvec3 _wP=(modelMatrix*vec4(position,1.)).xyz;\n#endif\nif(abs(normal.y)>0.5)vUv=_wP.xz*' + ws + ';else vUv=vec2(_wP.x+_wP.z,_wP.y)*' + ws + ';');
      };
      M.wall.customProgramCacheKey = 'wall_' + ws;
      M._hasTex = true;
    }
    return M;
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

    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2); plane.translate(0, 0.06, 0);
    const wallGeo = new THREE.BoxGeometry(1, 1.9, 1);
    const doorGeo = new THREE.PlaneGeometry(1, 1);
    doorGeo.rotateX(-Math.PI / 2); doorGeo.translate(0, 0.06, 0);

    const mk = (geo, mat, entries, cast, receive, category, chunk) => {
      if (!entries.length) return null;
      const im = new THREE.InstancedMesh(geo.clone(), mat, entries.length);
      im.castShadow = !!cast; im.receiveShadow = receive !== false;
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
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

    const hasTex = !!M._hasTex;
    const _adjWalls = (tx, ty) => {
      let c = 0;
      if (tx > 0 && map.t[ty * w + tx - 1] === TILE.WALL) c++;
      if (tx < w - 1 && map.t[ty * w + tx + 1] === TILE.WALL) c++;
      if (ty > 0 && map.t[(ty - 1) * w + tx] === TILE.WALL) c++;
      if (ty < h - 1 && map.t[(ty + 1) * w + tx] === TILE.WALL) c++;
      return c;
    };
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        const t = map.t[i], hz = map.haz[i];
        const x = tx + 0.5, z = ty + 0.5;
        if (t === TILE.WALL) {
          m4.makeTranslation(x, 0.95, z);
          if (hasTex) {
            const v = 0.68 + (map.variant[i] % 8) * 0.05;
            col.setRGB(v, v, v);
          } else {
            const v = 0.80 + (map.variant[i] % 8) * 0.04;
            col.set(THEMES[map.theme].wall).multiplyScalar(v);
          }
          put(tx, ty, 'wall', m4, col);
          continue;
        }
        m4.makeTranslation(x, 0, z);
        if (t === TILE.DOOR) put(tx, ty, 'door', m4);
        if (hz === HAZ.LAVA) put(tx, ty, 'lava', m4);
        else if (hz === HAZ.WATER) put(tx, ty, 'water', m4);
        else if (hz) put(tx, ty, 'haz', m4);
        else if (t !== TILE.DOOR) {
          const aw = _adjWalls(tx, ty);
          const aoDim = 1 - aw * 0.12;
          if (hasTex) {
            const v = (0.78 + (map.variant[i] % 10) * 0.032) * aoDim;
            const warm = (map.variant[i] & 1) ? 1.04 : 0.96;
            col.setRGB(v * warm, v, v / warm);
          } else {
            const v = (0.85 + (map.variant[i] % 8) * 0.035) * aoDim;
            col.set(map.variant[i] & 1 ? THEMES[map.theme].floorAlt : THEMES[map.theme].floor).multiplyScalar(v);
          }
          put(tx, ty, 'floor', m4, col);
        } else {
          const aw = _adjWalls(tx, ty);
          const aoDim = 1 - aw * 0.10;
          if (hasTex) col.setRGB(0.88 * aoDim, 0.88 * aoDim, 0.88 * aoDim);
          else col.set(THEMES[map.theme].floor).multiplyScalar(aoDim);
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
    this.buildGroundFog(map);
    this.buildDecals(map);
    this.buildSmoke(map);
    this.built = true;
    return { floors: totals.floor, walls: totals.wall, doors: totals.door, lava: totals.lava,
      water: totals.water, haz: totals.haz, batches: this.batches.length, lights: this.lights.length };
  },

  // Exponential fog density per unit of a theme's authored fog weight.
  FOG_MUL: 0.013,

  configureAtmosphere(map) {
    const th = THEMES[map.theme] || THEMES.crypt;
    R3.grade = th.grade || null;
    const density = map.theme === 'town' ? 0.00035 : (th.fog ? th.fog[1] * this.FOG_MUL * 1.6 : 0.0012);
    this.fog = th.fog ? new THREE.FogExp2(new THREE.Color(th.fog[0]), density) : null;
    this.updateAtmosphere(this.options.fog);
    const useAmb = typeof GraphicsConfig !== 'undefined' && GraphicsConfig.current.ambientAudio !== false;
    if (useAmb && typeof AUDIO !== 'undefined' && AUDIO.startAmbient) AUDIO.startAmbient(map.theme);
  },

  updateAtmosphere(enabled) {
    if (!R3.scene) return;
    R3.scene.fog = enabled === false ? null : this.fog;
  },

  buildGroundFog(map) {
    this.fogPlanes = [];
    const th = THEMES[map.theme];
    if (!th.fog || !this.options.fog || map.theme === 'town') return;
    const size = 80;
    const fogCol = new THREE.Color(th.fog[0]);
    const baseAlpha = Math.min(0.38, th.fog[1] * 2.8);

    const layers = [
      { y: 0.12, alpha: baseAlpha, speed: [0.012, 0.007], scale: 0.06 },
      { y: 0.30, alpha: baseAlpha * 0.6, speed: [0.008, 0.013], scale: 0.045 },
      { y: 0.55, alpha: baseAlpha * 0.3, speed: [0.015, 0.005], scale: 0.035 },
    ];

    const fragSrc = [
      'uniform float time;uniform vec3 fogColor;uniform float fogAlpha;uniform float uScale;uniform vec2 uSpeed;',
      'varying vec2 vWP;',
      'float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
      '  return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);}',
      'float fbm2(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=noise2(p)*a;p*=2.0;a*=0.5;}return v;}',
      'void main(){',
      '  vec2 uv=vWP*uScale+time*uSpeed;',
      '  float n=fbm2(uv)*0.6+fbm2(uv*0.7+3.5)*0.4;',
      '  n=smoothstep(0.25,0.7,n);',
      '  float edge=1.0-smoothstep(28.0,40.0,length(vWP));',
      '  gl_FragColor=vec4(fogColor,n*fogAlpha*edge);',
      '}',
    ].join('\n');
    const vtxSrc = [
      'varying vec2 vWP;',
      'void main(){',
      '  vec4 wp=modelMatrix*vec4(position,1.0);',
      '  vWP=wp.xz;',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}',
    ].join('\n');

    for (const lay of layers) {
      const geo = new THREE.PlaneGeometry(size, size);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 }, fogColor: { value: fogCol },
          fogAlpha: { value: lay.alpha },
          uScale: { value: lay.scale },
          uSpeed: { value: new THREE.Vector2(lay.speed[0], lay.speed[1]) },
        },
        vertexShader: vtxSrc, fragmentShader: fragSrc,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = lay.y; mesh.renderOrder = 2;
      this.group.add(mesh);
      this.fogPlanes.push({ mesh, mat });
    }
    this.fogPlane = this.fogPlanes[0] || null;
  },

  updateGroundFog(t, px, pz) {
    for (const fp of this.fogPlanes || []) {
      fp.mesh.position.x = px;
      fp.mesh.position.z = pz;
      fp.mat.uniforms.time.value = t;
    }
  },

  buildDecals(map) {
    this.decalMeshes = [];
    if (map.theme === 'town') return;
    if (typeof DungeonTextures === 'undefined' || !DungeonTextures.getDecals) return;
    const textures = DungeonTextures.getDecals(map.theme);
    if (!textures || !textures.length) return;

    const { w, h } = map;
    const floors = [];
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx;
        if (map.t[i] === TILE.WALL || map.t[i] === TILE.DOOR) continue;
        if (map.haz[i]) continue;
        floors.push({ x: tx, y: ty });
      }
    }
    if (floors.length < 10) return;

    const rng = ((s) => { let v = s ^ 0xbeef1234; return () => { v = (Math.imul(v, 1664525) + 1013904223) | 0; return (v >>> 0) / 4294967296; }; })(floors.length);
    const decalGeo = new THREE.PlaneGeometry(0.9, 0.9);
    decalGeo.rotateX(-Math.PI / 2);

    const perType = 7 + Math.floor(rng() * 5);
    const m4 = new THREE.Matrix4();
    for (let ti = 0; ti < textures.length; ti++) {
      const entries = [];
      for (let i = 0; i < perType; i++) {
        const fi = Math.floor(rng() * floors.length);
        const f = floors[fi];
        const scale = 0.55 + rng() * 0.5;
        const rot = rng() * Math.PI * 2;
        m4.makeRotationY(rot);
        m4.scale(new THREE.Vector3(scale, 1, scale));
        m4.setPosition(f.x + 0.5 + (rng() - 0.5) * 0.3, 0.08, f.y + 0.5 + (rng() - 0.5) * 0.3);
        entries.push(m4.clone());
      }
      if (!entries.length) continue;
      const mat = new THREE.MeshBasicMaterial({
        map: textures[ti], transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.NormalBlending,
      });
      const im = new THREE.InstancedMesh(decalGeo.clone(), mat, entries.length);
      im.receiveShadow = true;
      im.renderOrder = 1;
      entries.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.instanceMatrix.needsUpdate = true;
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      this.group.add(im);
      this.decalMeshes.push(im);
    }
    decalGeo.dispose();
  },

  buildSmoke(map) {
    this.smokeParticles = null;
    if (map.theme === 'town') return;
    const sources = [];
    for (const src of map.lights) {
      if (src.flick) sources.push(src);
    }
    if (!sources.length) return;

    const pos = [], smokes = [];
    const pps = 6;
    for (const src of sources) {
      for (let i = 0; i < pps; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12;
        const bx = src.x + Math.cos(a) * r, bz = src.y + Math.sin(a) * r;
        const by = 1.25 + Math.random() * 0.2;
        pos.push(bx, by, bz);
        smokes.push({
          bx, by, bz, phase: Math.random() * Math.PI * 2,
          spd: 0.12 + Math.random() * 0.18,
          wobble: 0.06 + Math.random() * 0.10,
        });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9a9088, size: 0.10, transparent: true, opacity: 0.14,
      depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 3;
    this.group.add(pts);
    this.smokeParticles = { pts, smokes, attr: geo.getAttribute('position') };
  },

  updateSmoke(t) {
    if (!this.smokeParticles) return;
    const { smokes, attr, pts } = this.smokeParticles;
    const fx = R3.focus;
    const arr = attr.array;
    let anyVisible = false;
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i], j = i * 3;
      const dx = s.bx - fx.x, dz = s.bz - fx.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      anyVisible = true;
      const cycle = ((t * s.spd + s.phase) % 2.5) / 2.5;
      arr[j]     = s.bx + Math.sin(t * 0.7 + s.phase) * s.wobble * (1 + cycle);
      arr[j + 1] = s.by + cycle * 1.4;
      arr[j + 2] = s.bz + Math.cos(t * 0.5 + s.phase * 1.7) * s.wobble * (1 + cycle);
    }
    pts.visible = anyVisible;
    if (anyVisible) attr.needsUpdate = true;
  },

  buildShafts(map) {
    const th = THEMES[map.theme];
    this.shafts = [];
    this.dustMotes = null;
    if (!this.options.shafts || !th.shaft) return;
    const geo = new THREE.ConeGeometry(1.6, 7, 24, 1, true);
    for (const src of map.shafts || []) {
      const mat = new THREE.MeshBasicMaterial({
        color: th.shaft, transparent: true, opacity: 0.20,
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
    if (map.shafts && map.shafts.length) {
      const pos = [], sizes = [], motes = [];
      for (const src of map.shafts) {
        for (let i = 0; i < 35; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * src.w * 0.45;
          const bx = src.x + Math.cos(a) * r, bz = src.y + Math.sin(a) * r;
          const by = 0.3 + Math.random() * 6.0;
          pos.push(bx, by, bz);
          sizes.push(0.08 + Math.random() * 0.16);
          motes.push({
            bx, by, bz, phase: Math.random() * Math.PI * 2,
            spd: 0.08 + Math.random() * 0.18,
            drift: 0.02 + Math.random() * 0.04,
          });
        }
      }
      const dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const dMat = new THREE.PointsMaterial({
        color: new THREE.Color(th.shaft), size: 0.18,
        transparent: true, opacity: 0.45,
        depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(dGeo, dMat);
      this.group.add(pts);
      this.dustMotes = { pts, motes, attr: dGeo.getAttribute('position') };
    }
  },

  updateShafts(t, enabled) {
    const fx = R3.focus;
    for (const e of this.shafts) {
      const dx = e.src.x - fx.x, dz = e.src.y - fx.z;
      e.mesh.visible = this.options.shafts && !!enabled && dx * dx + dz * dz < 34 * 34;
      if (e.mesh.visible) e.mesh.material.opacity = 0.16 + Math.sin(t * 0.5 + e.src.phase) * 0.06;
    }
    if (this.dustMotes) {
      this.dustMotes.pts.visible = this.options.shafts && !!enabled;
      if (this.dustMotes.pts.visible) {
        const { motes, attr } = this.dustMotes;
        const arr = attr.array;
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i], j = i * 3;
          arr[j]     = m.bx + Math.sin(t * 0.2 + m.phase) * 0.4 + Math.sin(t * 0.7 + m.phase * 2.3) * 0.12;
          arr[j + 1] = m.by + Math.sin(t * m.spd + m.phase) * 0.5 + t * m.drift;
          arr[j + 2] = m.bz + Math.cos(t * 0.18 + m.phase * 1.3) * 0.4 + Math.cos(t * 0.55 + m.phase * 3.1) * 0.1;
          if (arr[j + 1] > m.by + 3.0) arr[j + 1] = m.by - 0.5;
        }
        attr.needsUpdate = true;
      }
    }
  },

  // ---- lighting ----
  // Keep the light and renderer switches together. This can be called whenever
  // the effective quality setting changes; repeated calls are deliberately a
  // no-op from Three.js's point of view.
  setShadows(enabled) {
    const on = !!enabled && (!R3.profile || R3.profile.pointLightShadows);
    R3.shadows = on;
    if (this.hero) this.hero.castShadow = on;
    if (R3.renderer && R3.renderer.shadowMap) R3.renderer.shadowMap.enabled = on;
  },

  // Real point lights, budgeted. Every torch in the level gets an entry, but
  // only the nearest `R3.maxLights` are switched on each frame: WebGL pays per
  // light per fragment, and a 40-torch crypt would tank the frame otherwise.
  buildLights(map) {
    const th = THEMES[map.theme];
    this.ambient = new THREE.AmbientLight(new THREE.Color(th.wallTop), 0.07);
    this.group.add(this.ambient);

    const key = new THREE.DirectionalLight(new THREE.Color(th.wallTop), 0.035);
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
    if (this.ambient) this.ambient.intensity = spooky ? 0.025 : 0.07;
    if (this.keyLight) this.keyLight.intensity = spooky ? 0.012 : 0.035;

    // The hero lamp is itself a visible point light and therefore consumes a
    // shader slot. Budget sconces from what remains so Three never generates a
    // program containing more point lights than the active profile allows.
    const budget = Math.max(0, R3.maxLights - (this.hero && this.hero.visible ? 1 : 0));
    const arr = this.lights;
    const selected = this._selectLights(px, pz, budget);
    let on = 0;
    for (const e of arr) {
      if (!selected.has(e)) continue;
      const s = e.src;
      let k = 1;
      if (s.flick) {
        k = 0.75 + Math.sin(t * 3.2 + s.x * 7) * 0.15 + Math.sin(t * 7.1 + s.y * 13) * 0.08;
        if (Math.sin(t * 1.1 + s.x * 3) > 0.85) k -= 0.25;
      }
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
      this.hero.castShadow = R3.shadows
        && (!R3.profile || R3.profile.pointLightShadows);
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
    this.group = null; this.batches = []; this.lights = []; this._lightSelection = null;
    this.shafts = []; this.dustMotes = null; this.fogPlane = null; this.fogPlanes = [];
    this.decalMeshes = []; this.smokeParticles = null;
    this.hero = null; this.fog = null; this.built = false;
    if (R3.scene) R3.scene.fog = null;
    if (typeof DungeonTextures !== 'undefined' && DungeonTextures.dispose) DungeonTextures.dispose();
    if (typeof AUDIO !== 'undefined' && AUDIO.stopAmbient) AUDIO.stopAmbient();
  },
};
