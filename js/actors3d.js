// ============ DIABLOID: actors3d.js — monsters & the hero as 3D rigs ============
'use strict';

// The catalogue covers a minority of the bestiary, so every body archetype is
// built here from primitives — the same technique the catalogue's own models
// use (fused spheres and cones), and the same six archetypes the 2D sprite
// baker already drove off. Each monster keeps the silhouette, palette and
// scale it has today; a mapped species swaps to its authored model as that
// lands, one at a time, without touching any of this.
//
// Geometry and materials are shared per monster kind. A room of twenty
// skeletons is twenty transforms over one set of buffers, not twenty rigs.

const Actors3 = {
  authoredModels: true,
  configure(config) { this.authoredModels = config.authoredModels !== false; },
  _geo: null,
  _mats: Object.create(null),     // kind -> { main, dark, eye }
  // Authored models replace the procedural rig for a species when the compiled
  // catalogue has one. Every entry is `animation: 'rigid'`: the model is a
  // single body driven by root motion, so species whose read depends on limb
  // or wing articulation — spiders, bats, serpents, fallen — stay procedural
  // until their compiled scenes carry a skeleton we can actually drive.
  //
  // `height` is the world height of a size-1.0 member of the family. `def.size`
  // and the boss multiplier scale from there, so a family's own proportions
  // still apply and a Slag Ogre stays larger than a Gutter Ratman.
  MODEL_MAP: {
    // humanoid
    zombie:    { slot: 'mon_zombie', slug: 'ragm-zombie', animation: 'rigid', height: 1.5 },
    ghoul:     { slug: 'ragm-ghoul',          animation: 'rigid', height: 1.5 },
    ratman:    { slug: 'ragm-ratman',         animation: 'rigid', height: 1.45 },
    mummy:     { slug: 'ragm-mummy',          animation: 'rigid', height: 1.5 },
    necro:     { slug: 'ragm-necromancer',    animation: 'rigid', height: 1.6 },
    lizardman: { slug: 'ragm-lizardman',      animation: 'rigid', height: 1.6 },
    imp:       { slug: 'ragm-volcanic-imp',   animation: 'rigid', height: 1.3 },
    // skeletal
    skeleton:  { slug: 'ragm-skeleton',       animation: 'rigid', height: 1.5 },
    skelmage:  { slug: 'ragm-skeletal-mage',  animation: 'rigid', height: 1.55 },
    lich:      { slug: 'ragm-lich-lord',      animation: 'rigid', height: 1.65 },
    // brute
    troll:     { slug: 'ragm-troll',          animation: 'rigid', height: 1.55 },
    ogre:      { slug: 'ragm-ogre',           animation: 'rigid', height: 1.55 },
    cyclops:   { slug: 'ragm-cyclops',        animation: 'rigid', height: 1.55 },
    ettin:     { slug: 'ragm-ettin',          animation: 'rigid', height: 1.6 },
    // incorporeal — `def.fly` keeps the hover; see the authored branch of animate()
    wraith:    { slug: 'ragm-wraith',         animation: 'rigid', height: 1.6 },
    // Absent from the compiled catalogue as of 2026-07-29. These three resolve
    // to a 404 and fall back to the procedural rig, which is correct behaviour
    // — but it went unnoticed for three PRs because the rejection was swallowed
    // by an empty catch. The slugs stay as the intended targets if the models
    // are ever pulled; the miss is now reported in stats().modelMisses.
    golem:     { slug: 'ragm-golem',          animation: 'rigid', height: 1.55 },
    exploder:  { slug: 'ragm-bloatling',      animation: 'rigid', height: 0.85 },
    karghul:   { slug: 'ragm-furnace-tyrant', animation: 'rigid', height: 1.55, boss: true },
  },
  _models: Object.create(null),   // slug -> Promise<immutable normalized template>
  _modelMisses: Object.create(null), // slug -> why the authored model never arrived
  _staticGeometry: Object.create(null), // archetype/variant -> material-key geometries
  pool: [],                       // live actor rigs
  crowd: [],                      // town NPCs and townsfolk, same rigs, no combat

  geo() {
    if (this._geo) return this._geo;
    this._geo = {
      sphere: new THREE.SphereGeometry(0.5, 10, 8),
      cone: new THREE.ConeGeometry(0.5, 1, 8),
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      // a squashed sphere reads as a joint far better than a cube at this size
      blob: new THREE.SphereGeometry(0.5, 12, 10),
    };
    return this._geo;
  },

  mats(kind, pal) {
    if (this._mats[kind]) return this._mats[kind];
    const mk = (hex, emissive, ei) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.78, metalness: 0.05,
      emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
      emissiveIntensity: ei || 0,
    });
    this._mats[kind] = {
      main: mk(pal.main), dark: mk(pal.dark),
      eye: mk(pal.eye, pal.eye, 1.6),
    };
    return this._mats[kind];
  },

  // Resolve from the public asset registry first, with the dedicated map as a
  // fallback for models which are not part of an act pack. Species lookup is
  // exclusively `fam`/`def`; `kind` is not a monster species identifier.
  modelSpec(m) {
    if (!R3.authoredModels) return null;
    let fam = m && m.fam;
    if (!fam && m && typeof m.def === 'string') fam = m.def;
    if (!fam && m && m.def) {
      for (const id in MONSTERS) if (MONSTERS[id] === m.def) { fam = id; break; }
      if (!fam) for (const id in BOSSES) if (BOSSES[id] === m.def) { fam = id; break; }
    }
    const own = fam && this.MODEL_MAP[fam];
    if (!own) return null;
    const manifest = own.slot && typeof Assets !== 'undefined' && Assets.MANIFEST[own.slot];
    const slug = manifest && manifest.slug || own.slug;
    return slug ? Object.assign({ fam }, own, { slug }) : null;
  },

  _material(d) {
    const p = d || {};
    const type = p.type && THREE[p.type] ? p.type : 'MeshStandardMaterial';
    const opts = {
      color: p.color === undefined ? 0xffffff : p.color,
      transparent: !!p.transparent, opacity: p.opacity === undefined ? 1 : p.opacity,
      side: p.side === undefined ? THREE.FrontSide : p.side,
    };
    if (type === 'MeshStandardMaterial') {
      opts.roughness = p.roughness === undefined ? 0.8 : p.roughness;
      opts.metalness = p.metalness || 0;
      opts.emissive = p.emissive || 0;
      opts.emissiveIntensity = p.emissiveIntensity === undefined ? 1 : p.emissiveIntensity;
      opts.flatShading = !!p.flatShading;
    }
    return new THREE[type](opts);
  },

  // Every geometry the model compiler is allowed to emit, and the constructor
  // argument order for each. This list used to carry six of the thirteen, so a
  // compiled scene using a lathe, a ring or a polyhedron threw
  // `unsupported geometry` at load and the monster silently reverted to its
  // procedural rig. Keep it in step with GEOMETRIES in tools/compile-models.js:
  // the two describe the same contract from opposite ends, and
  // tests/node/model-contract.js fails if they drift.
  GEOMETRY_ARGS: {
    BoxGeometry: ['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments'],
    SphereGeometry: ['radius', 'widthSegments', 'heightSegments', 'phiStart', 'phiLength', 'thetaStart', 'thetaLength'],
    CylinderGeometry: ['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
    ConeGeometry: ['radius', 'height', 'radialSegments', 'heightSegments', 'openEnded', 'thetaStart', 'thetaLength'],
    PlaneGeometry: ['width', 'height', 'widthSegments', 'heightSegments'],
    CircleGeometry: ['radius', 'segments', 'thetaStart', 'thetaLength'],
    RingGeometry: ['innerRadius', 'outerRadius', 'thetaSegments', 'phiSegments', 'thetaStart', 'thetaLength'],
    TorusGeometry: ['radius', 'tube', 'radialSegments', 'tubularSegments', 'arc'],
    IcosahedronGeometry: ['radius', 'detail'],
    OctahedronGeometry: ['radius', 'detail'],
    DodecahedronGeometry: ['radius', 'detail'],
    TetrahedronGeometry: ['radius', 'detail'],
    LatheGeometry: ['points', 'segments', 'phiStart', 'phiLength'],
  },

  _primitive(gd, slug) {
    const Ctor = gd && THREE[gd.type], order = gd && this.GEOMETRY_ARGS[gd.type];
    if (typeof Ctor !== 'function' || !order || !gd.parameters)
      throw new Error('unsupported geometry ' + ((gd && gd.type) || '?') + ' in ' + slug);
    const a = gd.parameters;
    // A missing key passes `undefined`, which is exactly how three.js reaches
    // its own default. The lathe profile is the one parameter the scene
    // contract stores structurally, as [x, y] pairs.
    return new Ctor(...order.map(k => k === 'points'
      ? (a.points || []).map(q => new THREE.Vector2(q[0], q[1]))
      : a[k]));
  },

  // Compiled scenes contain primitives only. Geometry and base materials are
  // created once per slug and never mutated or disposed by actor retirement.
  //
  // The parts are merged by material. Every authored actor is `rigid` — it
  // moves as one body under root motion — so all of its parts are static and
  // the whole model collapses to one draw call per material. That matters more
  // than it sounds: an authored model is 13-27 primitives, and build() already
  // merges the static parts of a procedural archetype. Cloning the parts
  // straight through would have traded a merged rig for two dozen loose meshes
  // and made draw calls worse on the very species we replaced to improve them.
  //
  // A mesh named in doc.animations is exempt and stays individually
  // addressable. Nothing drives those for actors today, but merging them away
  // would quietly delete the capability rather than leave it unused.
  _compileModel(doc, slug) {
    if (!doc || doc.format !== 'diabloid-primitive-scene' || !Array.isArray(doc.meshes) || !doc.meshes.length)
      throw new Error('invalid compiled monster model ' + slug);
    if (doc.coordinateSystem !== 'right-handed-y-up') throw new Error('unsupported coordinates for ' + slug);
    const materials = (doc.materials || []).map(d => this._material(d));
    const animated = new Set((doc.animations || []).map(a => a.mesh));
    const root = new THREE.Group();
    const add = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material || materials[0]);
      mesh.castShadow = true; mesh.receiveShadow = false;
      root.add(mesh); return mesh;
    };
    const buckets = new Map();
    doc.meshes.forEach((p, i) => {
      const geometry = this._primitive(p.geometry, slug);
      if (animated.has(i)) {
        const mesh = add(geometry, materials[p.material]);
        if (p.position) mesh.position.fromArray(p.position);
        if (p.rotation) mesh.rotation.fromArray(p.rotation);
        if (p.scale) mesh.scale.fromArray(p.scale);
        return;
      }
      const key = p.material || 0;
      if (!buckets.has(key)) buckets.set(key, []);
      // Baking the transform into the vertices is what lets the parts merge at
      // all; the merged mesh then sits at the identity and every part keeps the
      // place the compiler measured for it.
      buckets.get(key).push(this._transformGeometry(geometry, p));
      geometry.dispose();
    });
    for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
      const parts = buckets.get(key);
      try {
        add(this._mergeGeometries(parts), materials[key]);
        for (const g of parts) g.dispose();
      } catch (e) {
        // Mismatched attribute layouts are the only way this fails. Draw the
        // parts separately rather than lose the model: their transforms are
        // already baked, so they land in the right places either way.
        for (const g of parts) add(g, materials[key]);
        root.userData.unmergedMaterials = (root.userData.unmergedMaterials || 0) + 1;
      }
    }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), extent = new THREE.Vector3();
    box.getSize(extent);
    if (!Number.isFinite(extent.y) || extent.y <= 0 || extent.y > 1000) throw new Error('invalid bounds for ' + slug);
    // Source metadata is metres per unit. One metre/tile is one world unit;
    // the per-spec height then makes silhouette/targeting height explicit.
    const units = doc.unitsPerMetre || 1;
    root.userData.sourceHeight = extent.y / units;
    root.userData.minY = box.min.y;
    root.userData.unitsPerMetre = units;
    root.userData.sourceMeshes = doc.meshes.length;
    root.userData.drawMeshes = root.children.length;
    return root;
  },

  requestModel(spec) {
    if (!spec) return Promise.reject(new Error('unmapped monster model'));
    if (!this._models[spec.slug]) {
      const url = 'assets/models/baked/' + encodeURIComponent(spec.slug) + '.scene.json';
      this._models[spec.slug] = fetch(url).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + spec.slug);
        return r.json();
      }).then(doc => this._compileModel(doc, spec.slug));
    }
    return this._models[spec.slug];
  },

  // `size` is the caller's composed scale — def.size times the boss multiplier
  // — and must be the same value build() is given. Deriving it from def.size
  // alone here left an authored boss 1.3x smaller than the procedural rig it
  // replaced, which no boss had yet hit only because the one boss in MODEL_MAP
  // resolves to a slug the catalogue does not contain.
  instanceModel(template, spec, def, size) {
    // Object3D.clone creates only the mutable hierarchy; geometry and base
    // materials remain shared. No authored material is mutated per instance.
    const model = template.clone(true), rig = new THREE.Group();
    if (size === undefined) size = def.size || 1;
    const scale = spec.height * size / template.userData.sourceHeight;
    model.scale.setScalar(scale / template.userData.unitsPerMetre);
    model.position.y = -template.userData.minY * scale / template.userData.unitsPerMetre;
    // The compiled contract and game contract are both +Z forward. A future
    // source with a different authored forward axis declares a one-time yaw in
    // MODEL_MAP instead of compensating every frame.
    model.rotation.y = spec.yaw || 0;
    rig.add(model);
    rig.userData.authored = true;
    rig.userData.animation = spec.animation;
    rig.userData.modelSlug = spec.slug;
    rig.userData.targetHeight = spec.height * size;
    // Carried so the authored branch of animate() can keep a flier flying.
    rig.userData.fly = !!def.fly;
    return rig;
  },

  // Merge static primitive copies without depending on BufferGeometryUtils.
  // Inputs are made non-indexed consistently: that keeps the implementation
  // small, avoids invalid mixed index layouts, and preserves every triangle.
  _mergeGeometries(geometries) {
    if (!geometries.length) throw new Error('cannot merge an empty geometry list');
    const flat = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry.clone());
    const names = Object.keys(flat[0].attributes).sort();
    if (!names.includes('position')) throw new Error('merged geometry requires positions');
    for (const geometry of flat) {
      const own = Object.keys(geometry.attributes).sort();
      if (own.join('|') !== names.join('|')) throw new Error('mismatched geometry attributes');
      for (const name of names) {
        const a = flat[0].attributes[name], b = geometry.attributes[name];
        if (a.itemSize !== b.itemSize || a.normalized !== b.normalized || a.array.constructor !== b.array.constructor)
          throw new Error('mismatched ' + name + ' attribute layout');
        if (b.count !== geometry.attributes.position.count)
          throw new Error('mismatched ' + name + ' attribute count');
      }
    }
    const merged = new THREE.BufferGeometry();
    for (const name of names) {
      const sample = flat[0].attributes[name];
      let length = 0;
      for (const geometry of flat) length += geometry.attributes[name].array.length;
      const array = new sample.array.constructor(length);
      let offset = 0;
      for (const geometry of flat) {
        const source = geometry.attributes[name].array;
        array.set(source, offset); offset += source.length;
      }
      merged.setAttribute(name, new THREE.BufferAttribute(array, sample.itemSize, sample.normalized));
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    for (const geometry of flat) geometry.dispose();
    return merged;
  },

  _transformGeometry(source, transform) {
    const t = transform || {};
    const position = t.position || [0, 0, 0];
    const rotation = t.rotation || [0, 0, 0];
    const scale = t.scale || [1, 1, 1];
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])),
      new THREE.Vector3().fromArray(scale));
    const geometry = source.clone();
    // applyMatrix4 uses a normal matrix for normals, including non-uniform scale.
    geometry.applyMatrix4(matrix);
    return geometry;
  },

  _animatedPart(rig, role, geometry, material, transform) {
    const mesh = new THREE.Mesh(geometry, material), t = transform || {};
    mesh.position.fromArray(t.position || [0, 0, 0]);
    mesh.rotation.fromArray(t.rotation || [0, 0, 0]);
    mesh.scale.fromArray(t.scale || [1, 1, 1]);
    mesh.castShadow = true; mesh.receiveShadow = false;
    rig.add(mesh);
    if (role) {
      if (role.endsWith('[]')) (rig.userData[role.slice(0, -2)] || (rig.userData[role.slice(0, -2)] = [])).push(mesh);
      else rig.userData[role] = mesh;
    }
    return mesh;
  },

  // ---- archetypes ----
  // Static parts are baked into archetype-local geometry. Animated parts keep
  // their own meshes even when a particular pose happens not to move them.
  build(body, kind, pal, size) {
    const g = this.geo(), M = this.mats(kind, pal), rig = new THREE.Group();
    const buckets = Object.create(null), materialKeys = ['main', 'dark', 'eye'];
    const T = (x, y, z, sx, sy, sz, rotation) => ({
      position: [x, y, z], scale: [sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz],
      rotation: rotation || [0, 0, 0],
    });
    const animatedPart = (role, geometry, material, transform) =>
      this._animatedPart(rig, role, geometry, material, transform);
    const staticPart = (geometry, materialKey, transform) =>
      (buckets[materialKey] || (buckets[materialKey] = [])).push({ geometry, transform });

    switch (body) {
      case 'skeleton':
        animatedPart('legs[]', g.cyl, M.main, T(-0.13, .36, 0, .07, .72, .07));
        animatedPart('legs[]', g.cyl, M.main, T(.13, .36, 0, .07, .72, .07));
        animatedPart('torso', g.cyl, M.main, T(0, .95, 0, .2, .52, .14));
        for (let i = 0; i < 4; i++) staticPart(g.cyl, 'dark', T(0, .78 + i * .12, 0, .23, .03, .17));
        animatedPart('arms[]', g.cyl, M.main, T(-.28, .98, 0, .055, .5, .055));
        animatedPart('arms[]', g.cyl, M.main, T(.28, .98, 0, .055, .5, .055));
        staticPart(g.sphere, 'main', T(0, 1.36, 0, .19, .22, .19));
        staticPart(g.sphere, 'eye', T(-.07, 1.37, .15, .045)); staticPart(g.sphere, 'eye', T(.07, 1.37, .15, .045));
        break;
      case 'brute':
        animatedPart('legs[]', g.cyl, M.dark, T(-.22, .34, 0, .15, .7, .15)); animatedPart('legs[]', g.cyl, M.dark, T(.22, .34, 0, .15, .7, .15));
        animatedPart('torso', g.blob, M.main, T(0, 1.05, 0, .46, .5, .38));
        animatedPart('arms[]', g.cyl, M.main, T(-.5, 1, 0, .13, .62, .13)); animatedPart('arms[]', g.cyl, M.main, T(.5, 1, 0, .13, .62, .13));
        staticPart(g.blob, 'main', T(-.42, 1.32, 0, .2)); staticPart(g.blob, 'main', T(.42, 1.32, 0, .2)); staticPart(g.blob, 'main', T(0, 1.44, .06, .21, .19, .2));
        staticPart(g.sphere, 'eye', T(-.08, 1.46, .17, .05)); staticPart(g.sphere, 'eye', T(.08, 1.46, .17, .05));
        break;
      case 'blob':
        animatedPart('torso', g.blob, M.main, T(0, .42, 0, .55, .44, .55));
        staticPart(g.blob, 'dark', T(0, .66, 0, .34, .26, .34)); staticPart(g.sphere, 'eye', T(-.14, .6, .34, .07)); staticPart(g.sphere, 'eye', T(.14, .6, .34, .07));
        rig.userData.wobble = true; break;
      case 'spider':
        animatedPart('torso', g.blob, M.main, T(0, .42, -.1, .42, .3, .5)); staticPart(g.blob, 'dark', T(0, .4, .3, .26, .22, .26));
        for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1, k = i % 4; animatedPart('legs[]', g.cyl, M.dark, T(side * .34, .3, -.24 + k * .18, .04, .42, .04, [0, 0, side * .9])); }
        staticPart(g.sphere, 'eye', T(-.09, .46, .5, .05)); staticPart(g.sphere, 'eye', T(.09, .46, .5, .05)); rig.userData.skitter = true; break;
      case 'bat':
        animatedPart('torso', g.blob, M.main, T(0, .8, 0, .17, .22, .2));
        animatedPart('wings[]', g.box, M.dark, T(-.36, .86, 0, .5, .03, .3)); animatedPart('wings[]', g.box, M.dark, T(.36, .86, 0, .5, .03, .3));
        staticPart(g.cone, 'main', T(-.08, 1, 0, .06, .12, .06)); staticPart(g.cone, 'main', T(.08, 1, 0, .06, .12, .06));
        staticPart(g.sphere, 'eye', T(-.06, .84, .15, .04)); staticPart(g.sphere, 'eye', T(.06, .84, .15, .04)); rig.userData.fly = true; break;
      case 'serpent':
        for (let i = 0; i < 6; i++) animatedPart('segs[]', g.blob, i % 2 ? M.dark : M.main, T(0, .26, -i * .3, .3 - i * .03));
        staticPart(g.blob, 'main', T(0, .34, .28, .24, .2, .3)); staticPart(g.sphere, 'eye', T(-.09, .38, .46, .05)); staticPart(g.sphere, 'eye', T(.09, .38, .46, .05)); rig.userData.slither = true; break;
      case 'ghost':
        animatedPart('torso', g.blob, M.main, T(0, .85, 0, .34, .44, .3));
        staticPart(g.cone, 'main', T(0, .4, 0, .3, .6, .28, [Math.PI, 0, 0])); staticPart(g.sphere, 'eye', T(-.1, .98, .24, .055)); staticPart(g.sphere, 'eye', T(.1, .98, .24, .055));
        M.main.transparent = true; M.main.opacity = .62; M.main.emissive = new THREE.Color(pal.main); M.main.emissiveIntensity = .25;
        rig.userData.fly = true; rig.userData.ghost = true; break;
      default:
        animatedPart('legs[]', g.cyl, M.dark, T(-.14, .35, 0, .09, .7, .09)); animatedPart('legs[]', g.cyl, M.dark, T(.14, .35, 0, .09, .7, .09));
        animatedPart('torso', g.blob, M.main, T(0, .98, 0, .28, .36, .2)); animatedPart('arms[]', g.cyl, M.main, T(-.33, .96, 0, .07, .52, .07)); animatedPart('arms[]', g.cyl, M.main, T(.33, .96, 0, .07, .52, .07));
        staticPart(g.blob, 'main', T(0, 1.35, 0, .19, .21, .19)); staticPart(g.sphere, 'eye', T(-.07, 1.37, .16, .045)); staticPart(g.sphere, 'eye', T(.07, 1.37, .16, .045));
    }

    // `body` is currently the only geometry-affecting variant. Keep the key
    // explicit so future horns/sex/elite shapes cannot accidentally alias it.
    const cacheKey = body + '|base';
    let cached = this._staticGeometry[cacheKey];
    if (!cached) {
      cached = this._staticGeometry[cacheKey] = Object.create(null);
      for (const materialKey of materialKeys) if (buckets[materialKey])
        cached[materialKey] = this._mergeGeometries(buckets[materialKey].map(p => this._transformGeometry(p.geometry, p.transform)));
    }
    for (const materialKey of materialKeys) if (cached[materialKey]) {
      const mesh = new THREE.Mesh(cached[materialKey], M[materialKey]);
      mesh.castShadow = true; mesh.receiveShadow = false; rig.add(mesh);
    }
    rig.scale.setScalar(size || 1);
    return rig;
  },

  // ---- animation ----
  // Driven entirely off state the game already tracks — no new bookkeeping.
  animate(rig, a, t) {
    const d = rig.userData;
    const moving = a.moving;
    const w = t * 9 + (a._phase || 0);
    const swing = moving ? Math.sin(w) * 0.55 : Math.sin(t * 1.7 + (a._phase || 0)) * 0.05;

    // Rigid-authored models still communicate locomotion and attacks through
    // root motion; they are not substituted for limb-dependent species.
    if (d.authored) {
      const attack = a.attackT > 0 ? Math.sin((1 - a.attackT / 0.3) * Math.PI) : 0;
      // A flying species has to keep flying when it gets an authored body. The
      // procedural path hovers off `d.fly` further down; without the same term
      // here a wraith would swap to its model and settle onto the floor.
      rig.position.y = d.fly ? 0.55 + Math.sin(t * 2.2 + (a._phase || 0)) * 0.12
        : moving ? Math.abs(Math.sin(w)) * 0.035
        : Math.sin(t * 1.7 + (a._phase || 0)) * 0.012;
      rig.rotation.x = -attack * 0.12;
      return;
    }

    if (d.legs && !d.skitter) {
      d.legs[0].rotation.x = swing;
      if (d.legs[1]) d.legs[1].rotation.x = -swing;
    }
    if (d.legs && d.skitter) {
      for (let i = 0; i < d.legs.length; i++) {
        const side = i < 4 ? -1 : 1;
        d.legs[i].rotation.x = Math.sin(w * 1.6 + i * 0.8) * (moving ? 0.5 : 0.08);
        d.legs[i].rotation.z = side * (0.9 + Math.sin(w + i) * 0.08);
      }
    }
    if (d.arms) {
      const atk = a.attackT > 0 ? Math.sin((1 - a.attackT / 0.3) * Math.PI) : 0;
      d.arms[0].rotation.x = -swing * 0.7 - atk * 1.5;
      if (d.arms[1]) d.arms[1].rotation.x = swing * 0.7 - atk * 1.5;
    }
    if (d.wings) {
      const f = Math.sin(t * 15 + (a._phase || 0));
      d.wings[0].rotation.z = 0.5 + f * 0.7;
      d.wings[1].rotation.z = -0.5 - f * 0.7;
    }
    if (d.segs) {
      for (let i = 0; i < d.segs.length; i++)
        d.segs[i].position.x = Math.sin(w * 0.7 - i * 0.6) * (moving ? 0.16 : 0.05);
    }
    if (d.wobble && d.torso) {
      const s = 1 + Math.sin(t * 6 + (a._phase || 0)) * 0.08;
      d.torso.scale.set(0.55 * s, 0.44 / s, 0.55 * s);
    }
    // fliers hover; walkers get a small bob so idles are not statues
    const hover = d.fly ? 0.55 + Math.sin(t * 2.2 + (a._phase || 0)) * 0.12
                        : (moving ? Math.abs(Math.sin(w)) * 0.05 : 0);
    rig.position.y = hover;
    if (d.torso && !d.wobble) d.torso.rotation.z = moving ? Math.sin(w) * 0.06 : 0;
  },

  // Development-only snapshot for the ~40-monster draw-call/FPS runs.
  // Call after a rendered frame in both elevated and third-person modes; the
  // renderer counters come from the same R3.stats() panel used elsewhere.
  stats() {
    const out = R3.stats();
    let actorMeshes = 0, visibleActors = 0;
    for (const owner of this.pool.concat(this.crowd)) {
      if (!owner._rig || !owner._rig.visible) continue;
      visibleActors++;
      owner._rig.traverse(node => { if (node.isMesh && node.visible) actorMeshes++; });
    }
    let authoredActors = 0, authoredMeshes = 0;
    for (const owner of this.pool.concat(this.crowd)) {
      const rig = owner._rig;
      if (!rig || !rig.visible || !rig.userData.authored) continue;
      authoredActors++;
      rig.traverse(node => { if (node.isMesh && node.visible) authoredMeshes++; });
    }
    return Object.assign({}, out, {
      authoredModels: !!R3.authoredModels,
      visibleActors, actorMeshes,
      authoredActors, authoredMeshes,
      mergedArchetypes: Object.keys(this._staticGeometry).length,
      // Non-empty means a mapped species is silently wearing its fallback.
      modelMisses: Object.assign({}, this._modelMisses),
    });
  },

  // ---- pooling ----
  // One rig per live monster, kept between frames. Rebuilt only when the map
  // changes, so walking through a level is transforms, not allocations.
  // How far from the player a monster still gets a body. The camera shows
  // roughly 26 tiles across at default zoom, so anything past this is off
  // screen; the 2D renderer culled the same way, it just did it per blit.
  // Without this a 46-monster map pays ~320 draw calls for bodies nobody sees.
  VIEW: 30,

  sync(monsters, t) {
    const live = new Set();
    const pl = G.player;
    for (const m of monsters) {
      if (m.dead) continue;
      if (pl && Math.abs(m.x - pl.x) + Math.abs(m.y - pl.y) > this.VIEW) continue;
      live.add(m);
      if (!m._rig) {
        // A spawned monster carries its own definition and files its species
        // under `fam`, not `kind` — `kind` is only set for summoned traps.
        // Reading the def off the monster means the rig cannot disagree with
        // the stats, and the fallback lookup covers anything spawned by hand.
        const id = m.fam || (typeof m.def === 'string' ? m.def : null);
        const def = (m.def && typeof m.def === 'object' ? m.def : null) || MONSTERS[id] || BOSSES[id];
        if (!def || !id) continue;
        const spec = this.modelSpec(m);
        // Start the authored request before constructing the visible fallback.
        // Keeping that fallback during I/O avoids invisible/untargetable actors.
        const requested = this.authoredModels && spec && this.requestModel(spec);
        const size = (def.size || 1) * (m.boss ? 1.3 : 1);
        m._rig = this.build(def.body, id, def.pal, size);
        m._phase = (m.x * 7.3 + m.y * 3.1) % 6.28;
        R3.scene.add(m._rig);
        this.pool.push(m);
        if (requested) requested.then(template => {
          if (!R3.authoredModels || !m._rig || this.pool.indexOf(m) < 0) return;
          const authored = this.instanceModel(template, spec, def, size);
          authored.position.copy(m._rig.position); authored.rotation.copy(m._rig.rotation);
          R3.scene.remove(m._rig); m._rig = authored; R3.scene.add(authored);
        }).catch(err => {
          // The build() rig is the fallback and the game carries on, which is
          // right — but record WHY. Three MODEL_MAP entries pointed at slugs
          // that were never in the catalogue and survived three PRs precisely
          // because this catch was empty. A fallback is a decision; a silent
          // fallback is an absence of one.
          this._modelMisses[spec.slug] = (err && err.message) || String(err);
        });
      }
      const r = m._rig;
      r.position.x = m.x; r.position.z = m.y;
      // Monsters already track a heading; deriving one from velocity instead
      // would snap to zero the moment they stop, which is when they attack.
      r.rotation.y = Math.PI / 2 - (m.dir || 0);
      this.animate(r, m, t);
    }
    // retire rigs for anything that died or despawned
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const m = this.pool[i];
      if (live.has(m)) continue;
      if (m._rig) { R3.scene.remove(m._rig); m._rig = null; }
      this.pool.splice(i, 1);
    }
    return this.pool.length;
  },

  // Town NPCs and the walking townsfolk sim are humanoid and never fight, so
  // they reuse the same rigs with a palette derived from their clothing —
  // which is exactly what the 2D sprite baker did for them.
  syncCrowd(t, ...lists) {
    let n = 0;
    for (const list of lists) {
      for (const p of list || []) {
        if (!p._rig) {
          const pal = (p.def && p.def.pal) || p.pal || {};
          const cloth = pal.cloth || pal.main || '#6a5a44';
          p._rig = this.build('humanoid', 'crowd:' + cloth, {
            main: cloth, dark: U.shade(cloth, 0.55), eye: pal.skin || '#e8d0b0',
          }, 1);
          R3.scene.add(p._rig);
          this.crowd.push(p);
        }
        p._rig.position.set(p.x, 0, p.y);
        p._rig.rotation.y = Math.PI / 2 - (p.dir || 0);
        this.animate(p._rig, p, t);
        n++;
      }
    }
    // Retire rigs whose owner is gone. The town rebuilds G.npcs from scratch on
    // every entry, so without this the old bodies stay standing in the scene.
    for (let i = this.crowd.length - 1; i >= 0; i--) {
      const p = this.crowd[i];
      let live = false;
      for (const list of lists) if (list && list.indexOf(p) >= 0) { live = true; break; }
      if (live) continue;
      if (p._rig) { R3.scene.remove(p._rig); p._rig = null; }
      this.crowd.splice(i, 1);
    }
    return n;
  },

  clear() {
    for (const m of this.pool) if (m._rig) { R3.scene.remove(m._rig); m._rig = null; }
    this.pool.length = 0;
    for (const p of this.crowd) if (p._rig) { R3.scene.remove(p._rig); p._rig = null; }
    this.crowd.length = 0;
  },
};

// ============ the hero ============
// figure.js already owns what the hero looks like: a proper articulated body
// posed by an animation state machine, with equipment read off the gear the
// player has actually equipped. None of that was 2D — only the drawing was.
// So the pose machine and the equipment reader are reused verbatim here and
// only the rendering changes: canvas strokes become jointed groups.
//
// Nothing gets rebuilt per frame. The rig is rebuilt only when the equipment
// signature changes — i.e. when the player equips something — so swinging a
// sword is eight rotations, not a scene graph rebuild.

const Hero3 = {
  // figure.js measures in pixels (head crown at -43); this puts the hero at
  // ~1.75 m, matching the catalogue's "1 unit = 1 metre" model scale.
  U2W: 1 / 28,

  rig: null, J: null, sig: '', mats: null, _geo: null, _P: null,

  prop() {
    if (this._P) return this._P;
    const k = this.U2W, F = Figure.P;
    const thigh = F.thigh * k, shin = F.shin * k;
    const ankle = 0.03;                       // the boot sits under the shin, not through it
    this._P = {
      thigh, shin, ankle,
      hipY: thigh + shin + ankle,             // hips sit a leg plus a foot up, so boots land on 0
      chestUp: (F.pelvisY - F.chestY) * k,    // pelvis -> chest
      headUp: (F.chestY - F.headY) * k,       // chest -> head
      headR: F.headR * k,
      shoulderX: F.shoulderX * k, hipX: F.hipX * k,
      // arms hang OUTSIDE the ribcage; the 2D figure could overlap them onto
      // the torso and let the silhouette sort it out, geometry cannot
      armX: F.chestW * k * 1.18,
      upperArm: F.upperArm * k, foreArm: F.foreArm * k,
      chestW: F.chestW * k, chestH: F.chestH * k, waistW: F.waistW * k,
    };
    // How high a hand sits with the arm hanging straight — the lowest it ever
    // gets, and therefore the budget a held weapon has before it hits the
    // floor. Derived, not guessed, so changing the proportions above cannot
    // silently start burying blades in the ground.
    this._P.handRest = this._P.hipY + this._P.chestUp - this.U2W
      - this._P.upperArm - this._P.foreArm;
    return this._P;
  },

  geo() {
    if (this._geo) return this._geo;
    this._geo = {
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
      torso: new THREE.CylinderGeometry(0.5, 0.34, 1, 12),   // broad at the shoulders
      sphere: new THREE.SphereGeometry(0.5, 12, 10),
      box: new THREE.BoxGeometry(1, 1, 1),
      cone: new THREE.ConeGeometry(0.5, 1, 10),
      // an open dome, so a helm sits ON the head instead of swallowing it
      dome: new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      plane: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.TorusGeometry(0.5, 0.045, 6, 20),
    };
    return this._geo;
  },

  // ---- materials ----
  // Rebuilt with the rig, because every colour here comes from equipped gear.
  mkMats(pal, eq) {
    const S = (hex, rough, metal, emis, ei) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: rough === undefined ? 0.72 : rough,
      metalness: metal === undefined ? 0.05 : metal,
      emissive: new THREE.Color(emis || 0x000000),
      emissiveIntensity: ei || 0,
    });
    const cloth = pal.cloth || '#5a4a3a';
    const armorC = eq.chestCol || pal.armor || cloth;
    const trim = pal.trim || '#c9a44f';
    return {
      skin: S(pal.skin || '#c99a6a', 0.86, 0),
      cloth: S(cloth, 0.92, 0),
      clothDark: S(U.shade(cloth, 0.78), 0.92, 0),
      armor: S(armorC, 0.42, 0.55),
      armorLit: S(U.shade(armorC, 1.22), 0.36, 0.6),
      armorDark: S(U.shade(armorC, 0.68), 0.5, 0.5),
      trim: S(trim, 0.32, 0.85),
      hair: S(pal.hair || '#3a2414', 0.95, 0),
      eye: S(pal.eye || '#2a1a10', 0.5, 0),
      boot: S(eq.bootCol || U.shade(cloth, 0.65), 0.8, 0.1),
      glove: S(eq.gloveCol || U.shade(cloth, 0.8), 0.8, 0.1),
      belt: S(eq.beltCol || U.shade(cloth, 0.5), 0.8, 0.1),
      helm: S(eq.helmCol || U.shade(armorC, 1.05), 0.34, 0.75),
      crest: S(eq.crestCol || trim, 0.6, 0.2),
      horn: S('#d8d0bc', 0.7, 0.05),
      shield: S(eq.shieldCol || '#8a8f98', 0.4, 0.6),
      shieldTrim: S(eq.shieldTrim || trim, 0.32, 0.85),
      metal: S(eq.wMetal || '#c8ccd4', 0.24, 0.92, eq.wGlow, eq.wGlow ? 0.55 : 0),
      guard: S(eq.wGuard || '#8a6b31', 0.35, 0.8),
      wood: S(eq.wWood || '#7a5a34', 0.92, 0),
      orb: S(eq.wOrb || '#c07bff', 0.2, 0, eq.wOrb || '#c07bff', 1.9),
      cape: new THREE.MeshStandardMaterial({
        color: new THREE.Color(eq.capeCol || '#6a1420'),
        roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
      }),
      aura: new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd94f'), transparent: true, opacity: 0.35,
      }),
    };
  },

  disposeMats() {
    if (!this.mats) return;
    for (const k in this.mats) this.mats[k].dispose();
    this.mats = null;
  },

  // Rebuild only when the *appearance* changes. Comparing the fixture values
  // rather than the item objects means picking up an identical-looking sword
  // does not churn the scene graph.
  sigOf(pl, eq) {
    return [pl.cls, eq.weapon, eq.wLen, eq.wMetal, eq.wOrb, eq.wGuard, eq.wGlow,
      eq.shield, eq.shieldCol, eq.shieldTrim, eq.helm, eq.helmCol, eq.helmFull,
      eq.helmCrest, eq.helmHorns, eq.crestCol, eq.chestCol, eq.chestPlate,
      eq.gloveCol, eq.bootCol, eq.bootTrim, eq.beltCol, eq.beltBuckle,
      eq.cape, eq.capeCol].join('|');
  },

  _put(parent, geo, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    m.castShadow = true; m.receiveShadow = false;
    parent.add(m);
    return m;
  },

  // A two-bone limb. Pivot groups sit AT the joints and the meshes hang below
  // them, so posing is `pivot.rotation.x = angle` and nothing has to be
  // recomputed by hand — which is exactly the arithmetic the 2D limb() did
  // every frame for every segment.
  _limb(parent, ox, oy, oz, len1, len2, r1, r2, mUp, mLo, mJoint) {
    const g = this.geo();
    const up = new THREE.Group();
    up.position.set(ox, oy, oz);
    parent.add(up);
    this._put(up, g.cyl, mUp, 0, -len1 / 2, 0, r1 * 2, len1, r1 * 2);
    this._put(up, g.sphere, mJoint || mUp, 0, 0, 0, r1 * 2.1);

    const lo = new THREE.Group();
    lo.position.y = -len1;
    up.add(lo);
    this._put(lo, g.cyl, mLo, 0, -len2 / 2, 0, r2 * 2, len2, r2 * 2);
    this._put(lo, g.sphere, mJoint || mLo, 0, 0, 0, r2 * 2.1);

    const end = new THREE.Group();
    end.position.y = -len2;
    lo.add(end);
    return { up, lo, end };
  },

  // ---- build ----
  make(pal, eq) {
    this.destroy();
    const P = this.prop(), g = this.geo(), M = this.mkMats(pal, eq);
    this.mats = M;

    const root = new THREE.Group();
    const body = new THREE.Group();  root.add(body);                       // bob + death tip
    const pelvis = new THREE.Group(); pelvis.position.y = P.hipY; body.add(pelvis);
    const chest = new THREE.Group();  chest.position.y = P.chestUp; pelvis.add(chest);
    const neck = new THREE.Group();   neck.position.y = P.headUp; chest.add(neck);

    // torso: wide at the shoulders, narrow at the waist
    const torsoH = P.chestUp + P.chestH * 0.72;
    this._put(chest, g.torso, M.armor, 0, -P.chestUp + torsoH / 2, 0,
      P.chestW * 1.92, torsoH, P.chestW * 1.3);
    // hips, so the waist does not end in a flat disc
    this._put(pelvis, g.sphere, M.clothDark, 0, 0.02, 0, P.waistW * 2, P.waistW * 1.5, P.waistW * 1.6);

    // legs
    const legL = this._limb(pelvis, -P.hipX, 0, 0, P.thigh, P.shin,
      0.064, 0.053, M.clothDark, M.cloth, M.clothDark);
    const legR = this._limb(pelvis, P.hipX, 0, 0, P.thigh, P.shin,
      0.064, 0.053, M.clothDark, M.cloth, M.clothDark);
    for (const L of [legL, legR]) {
      // boot fixture — the foot itself, always present; gear only recolours it
      this._put(L.end, g.box, M.boot, 0, 0, 0.035, 0.105, P.ankle * 2, 0.2);
      if (eq.bootTrim) this._put(L.end, g.box, M.trim, 0, P.ankle, 0.01, 0.115, 0.02, 0.155);
    }

    // arms
    const armY = -1 * this.U2W;
    const armL = this._limb(chest, -P.armX, armY, 0, P.upperArm, P.foreArm,
      0.052, 0.042, M.armorDark, M.skin, M.armorDark);
    const armR = this._limb(chest, P.armX, armY, 0, P.upperArm, P.foreArm,
      0.052, 0.042, M.armorDark, M.skin, M.armorDark);
    armL.up.rotation.z = 0.13; armR.up.rotation.z = -0.13;   // splay, so arms clear the torso
    for (const A of [armL, armR]) this._put(A.end, g.sphere, M.glove, 0, -0.01, 0.01, 0.078);
    this._put(chest, g.sphere, M.armor, -P.armX, armY + 0.01, 0, 0.15, 0.12, 0.14);
    this._put(chest, g.sphere, M.armor, P.armX, armY + 0.01, 0, 0.15, 0.12, 0.14);

    // head
    this._put(chest, g.cyl, M.skin, 0, P.headUp * 0.45, 0, 0.075, P.headUp * 0.5, 0.075);  // neck
    this._put(neck, g.sphere, M.skin, 0, 0, 0, P.headR * 1.76, P.headR * 2.0, P.headR * 1.8);
    if (pal.hair && !eq.helm) {
      this._put(neck, g.dome, M.hair, 0, 0.012, -0.008, P.headR * 1.92, P.headR * 1.72, P.headR * 1.96);
    }
    if (!eq.helmFull) {
      this._put(neck, g.sphere, M.eye, -0.05, 0.01, P.headR * 0.82, 0.03, 0.024, 0.02);
      this._put(neck, g.sphere, M.eye, 0.05, 0.01, P.headR * 0.82, 0.03, 0.024, 0.02);
    }

    // ---- equipment fixtures ----
    if (eq.chestPlate) {
      // a breastplate that follows the ribcage, plus pauldrons over the joints
      this._put(chest, g.torso, M.armorLit, 0, -P.chestUp + torsoH / 2, 0,
        P.chestW * 1.98, torsoH * 0.78, P.chestW * 1.36);
      this._put(chest, g.box, M.trim, 0, -P.chestUp * 0.4, P.chestW * 0.66, 0.03, torsoH * 0.6, 0.02);
      this._put(chest, g.sphere, M.armorDark, -P.armX, armY + 0.02, 0, 0.2, 0.15, 0.19);
      this._put(chest, g.sphere, M.armorDark, P.armX, armY + 0.02, 0, 0.2, 0.15, 0.19);
    }
    this._put(pelvis, g.cyl, M.belt, 0, 0.03, 0, P.waistW * 2.15, 0.06, P.waistW * 1.75);
    if (eq.beltBuckle) this._put(pelvis, g.box, M.trim, 0, 0.03, P.waistW * 0.9, 0.07, 0.055, 0.02);

    let cape = null;
    if (eq.cape) {
      cape = new THREE.Group();
      cape.position.set(0, armY, -P.chestW * 0.6);
      chest.add(cape);
      const cl = this._put(cape, g.plane, M.cape, 0, -0.34, 0, 0.44, 0.72, 1);
      cl.castShadow = true;
      cl.rotation.y = Math.PI;   // face the plane outward
    }

    if (eq.helm) {
      this._put(neck, g.dome, M.helm, 0, 0.01, 0, P.headR * 2.02, P.headR * 2.24, P.headR * 2.06);
      if (eq.helmFull) {
        // a faceplate that follows the skull; a flat slab across the front
        // reads as a signboard bolted to the head
        this._put(neck, g.sphere, M.helm, 0, -0.03, P.headR * 0.26,
          P.headR * 1.66, P.headR * 1.62, P.headR * 1.5);
        this._put(neck, g.box, M.eye, 0, 0.012, P.headR * 0.84, P.headR * 1.05, 0.024, 0.02);  // visor slit
      }
      if (eq.helmCrest) {
        const cr = this._put(neck, g.box, M.crest, 0, P.headR * 1.25, -0.01, 0.022, 0.1, 0.24);
        cr.rotation.x = 0.22;
      }
      if (eq.helmHorns) for (const s of [-1, 1]) {
        const hn = this._put(neck, g.cone, M.horn, s * P.headR * 0.95, P.headR * 0.75, 0, 0.045, 0.17, 0.045);
        hn.rotation.z = -s * 0.85;
      }
    }

    // shield rides the off-hand; weapon the main hand
    if (eq.shield) {
      const sh = new THREE.Group();
      sh.position.set(-0.05, -0.02, 0.04);
      sh.rotation.x = Math.PI / 2;
      armL.end.add(sh);
      this._put(sh, g.cyl, M.shield, 0, 0, 0, 0.38, 0.045, 0.34);
      this._put(sh, g.ring, M.shieldTrim, 0, 0.03, 0, 0.38, 0.38, 0.34).rotation.x = Math.PI / 2;
      this._put(sh, g.sphere, M.shieldTrim, 0, 0.05, 0, 0.09, 0.06, 0.09);   // boss
    }
    const weapon = this.makeWeapon(armR.end, eq, M, g);

    // buff aura, hidden until a buff is up
    const aura = this._put(root, g.ring, M.aura, 0, 0.03, 0, 1.0, 1.0, 1.0);
    aura.rotation.x = Math.PI / 2;
    aura.castShadow = false;
    aura.visible = false;

    this.rig = root;
    this.J = { body, pelvis, chest, neck, legL, legR, armL, armR, cape, weapon, aura };
    R3.scene.add(root);
    return root;
  },

  // ---- weapon fixtures ----
  // Built in the hand's own frame, where -Y continues the forearm. Blades hang
  // down that axis; hafted things are carried upright instead, because a
  // caster resting an orb on the floor looks like a broken rig.
  //
  // Every builder declares `drop`: how far the weapon reaches below the grip.
  // The carry angle is then derived from that against the resting hand height,
  // so a tier-10 greatsword tilts further than a shortsword instead of being
  // driven through the floor. The 2D renderer never had to care — a sprite
  // has no floor to clip through — which is exactly why this is derived
  // rather than a per-weapon constant somebody has to remember to retune.
  makeWeapon(hand, eq, M, g) {
    const w = eq.weapon || 'sword';
    // tier lengthens a weapon, but only so far; past this it stops reading as
    // the same weapon and starts reading as a pike
    const L = Math.min(eq.wLen || 1, 1.5);
    const grip = new THREE.Group();
    hand.add(grip);
    const P = (geo, mat, ...a) => this._put(grip, geo, mat, ...a);
    // how far the fixture reaches below and above the grip, along its own axis
    let drop = 0, rise = 0.04, rest = -0.34;

    switch (w) {
      case 'sword': {
        const bl = 0.62 * L;
        P(g.cyl, M.wood, 0, -0.06, 0, 0.036, 0.13, 0.036);
        P(g.box, M.guard, 0, -0.135, 0, 0.2, 0.028, 0.05);
        P(g.box, M.metal, 0, -0.15 - bl / 2, 0, 0.078, bl, 0.024);
        P(g.cone, M.metal, 0, -0.15 - bl - 0.035, 0, 0.078, 0.09, 0.024).rotation.x = Math.PI;
        P(g.sphere, M.guard, 0, 0.01, 0, 0.055);          // pommel
        drop = 0.15 + bl + 0.08; rise = 0.05;
        break;
      }
      case 'axe': {
        const hl = 0.5 * L;
        P(g.cyl, M.wood, 0, -hl / 2, 0, 0.042, hl, 0.042);
        P(g.box, M.metal, 0.005, -hl + 0.06, 0, 0.09, 0.2, 0.03);
        P(g.cone, M.metal, 0.12, -hl + 0.06, 0, 0.24, 0.2, 0.03).rotation.z = -Math.PI / 2;
        drop = hl + 0.06;
        break;
      }
      case 'mace': {
        const hl = 0.44 * L;
        P(g.cyl, M.wood, 0, -hl / 2, 0, 0.04, hl, 0.04);
        P(g.sphere, M.metal, 0, -hl - 0.06, 0, 0.15);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const sp = P(g.cone, M.guard, Math.cos(a) * 0.085, -hl - 0.06, Math.sin(a) * 0.085, 0.05, 0.09, 0.05);
          sp.rotation.z = -Math.cos(a) * 1.4; sp.rotation.x = Math.sin(a) * 1.4;
        }
        drop = hl + 0.06 + 0.13;
        break;
      }
      case 'dagger': case 'claw': {
        P(g.cyl, M.wood, 0, -0.05, 0, 0.03, 0.1, 0.03);
        P(g.box, M.guard, 0, -0.105, 0, 0.11, 0.02, 0.04);
        P(g.box, M.metal, 0, -0.105 - 0.13 * L, 0, 0.05, 0.26 * L, 0.018);
        P(g.cone, M.metal, 0, -0.115 - 0.26 * L, 0, 0.05, 0.06, 0.018).rotation.x = Math.PI;
        drop = 0.115 + 0.26 * L + 0.05;
        break;
      }
      case 'spear': {
        const sl = 1.5 * L;
        P(g.cyl, M.wood, 0, sl * 0.22, 0, 0.032, sl, 0.032);
        P(g.cone, M.metal, 0, sl * 0.72 + 0.09, 0, 0.075, 0.2, 0.03);
        P(g.box, M.guard, 0, sl * 0.72 - 0.03, 0, 0.05, 0.02, 0.05);
        drop = sl * 0.28; rise = sl * 0.72 + 0.19; rest = 0.14;
        break;
      }
      case 'staff': case 'wand': {
        const staff = w === 'staff';
        const sl = (staff ? 1.55 : 0.6) * L;
        P(g.cyl, M.wood, 0, sl * 0.22, 0, staff ? 0.036 : 0.026, sl, staff ? 0.036 : 0.026);
        const orbY = sl * 0.72 + (staff ? 0.07 : 0.05);
        P(g.sphere, M.orb, 0, orbY, 0, staff ? 0.14 : 0.1);
        if (staff) for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          const cl = P(g.cone, M.wood, Math.cos(a) * 0.07, orbY - 0.09, Math.sin(a) * 0.07, 0.03, 0.14, 0.03);
          cl.rotation.z = -Math.cos(a) * 0.5; cl.rotation.x = Math.sin(a) * 0.5;
        }
        drop = sl * 0.28; rise = orbY + (staff ? 0.14 : 0.1); rest = 0.14;
        break;
      }
      case 'bow': {
        const r = 0.42 * L;
        for (const s of [-1, 1]) {
          const arm = P(g.cyl, M.wood, 0, s * r * 0.5, s * 0.03, 0.026, r, 0.026);
          arm.rotation.x = -s * 0.22;
        }
        P(g.cyl, M.metal, 0, 0, 0.005, 0.032, 0.16, 0.032);              // riser
        P(g.cyl, M.guard, 0, 0, -r * 0.24, 0.008, r * 1.92, 0.008);      // string
        drop = r + 0.03; rise = r + 0.03; rest = 0.14;
        break;
      }
      case 'crossbow': {
        grip.rotation.x = -Math.PI / 2;            // levelled, pointing forward
        P(g.box, M.wood, 0, -0.24 * L, 0, 0.05, 0.5 * L, 0.06);
        P(g.box, M.metal, 0, -0.4 * L, 0, 0.5, 0.05, 0.03);
        P(g.cyl, M.guard, 0, -0.34 * L, 0, 0.008, 0.46, 0.008).rotation.z = Math.PI / 2;
        drop = 0.5 * L; rest = -Math.PI / 2;      // levelled, pointing forward
        break;
      }
      case 'orb': {
        P(g.sphere, M.orb, 0, -0.09, 0.04, 0.17);
        drop = 0.18; rise = 0.09;
        break;
      }
      default: {
        P(g.cyl, M.metal, 0, -0.22 * L, 0, 0.035, 0.44 * L, 0.035);
        drop = 0.44 * L + 0.02;
      }
    }

    // The carry angle cannot be baked in here: the grip hangs off the hand, and
    // the hand's own angle changes every frame, so a constant that clears the
    // floor at rest drives the blade straight through it mid-stride. What the
    // fixture records is its reach and its preferred carry; apply() resolves
    // the actual angle against the pose.
    grip.userData = { drop, rise, rest };
    grip.rotation.x = rest;
    return grip;
  },

  // Angle the held weapon so it stays above the floor in whatever pose the
  // animation has put the arm in. Angles here are measured from straight-down
  // about the X axis, positive leaning forward, and the weapon inherits the
  // arm's accumulated rotation before its own.
  //
  // BOTH ends matter. Clearing only the far end is what let a caster swing a
  // two-metre staff overhead and drive its head through the floor behind them.
  carryAngle(bodyY) {
    const J = this.J, W = J.weapon;
    if (!W || !W.userData) return;
    const { drop, rise, rest } = W.userData;

    // Walk the chain off the rig rather than re-deriving it from the pose.
    // Deriving it separately is how the spine's own lean went missing from
    // the sum, which quietly cost a quarter of a metre of clearance.
    const P = this.prop();
    const c = J.chest.rotation.x;
    const t1 = c + J.armR.up.rotation.x;
    const t2 = t1 + J.armR.lo.rotation.x;
    const handY = bodyY + P.hipY + P.chestUp - this.U2W * Math.cos(c)
      - P.upperArm * Math.cos(t1) - P.foreArm * Math.cos(t2);
    const arm = t2;                               // the hand frame's own tilt
    const h = handY - 0.035;

    // With the weapon at world angle T: the low end sits at handY - drop*cos T
    // and the high end at handY + rise*cos T, so cos T is fenced on both sides
    // and |T| has to land inside [lo, hi].
    const lo = drop > 0 ? Math.acos(U.clamp(h / drop, -1, 1)) : 0;
    const hi = rise > 0 ? Math.acos(U.clamp(-h / rise, -1, 1)) : Math.PI;
    let T = arm + rest;
    T = Math.atan2(Math.sin(T), Math.cos(T));     // into [-pi, pi]
    if (lo > hi) T = T < 0 ? -Math.PI / 2 : Math.PI / 2;   // longer than the hand is high: lie it flat
    else {
      const s = T < 0 ? -1 : 1;
      T = s * U.clamp(Math.abs(T), lo, hi);
    }
    W.rotation.x = T - arm;
  },

  // ---- animation ----
  // Straight port of the 2D selector; it reads player state the game already
  // keeps, so the 3D hero and the 2D hero were never going to disagree.
  anim(pl, t) {
    if (pl.dead) return { anim: 'dead', phase: U.clamp(1 - (pl.deathT === undefined ? 0 : pl.deathT), 0, 1) };
    if (pl.danceT > 0) return { anim: 'dance', phase: (t * 1.6) % 1 };
    if (pl.attackT > 0) {
      const casting = pl.lastCastArch && !['strike', 'slam', 'dash'].includes(pl.lastCastArch);
      return { anim: casting ? 'cast' : 'attack', phase: U.clamp(1 - pl.attackT / 0.32, 0, 1) };
    }
    if (pl.hurtT > 0.14) return { anim: 'hurt', phase: 0 };
    if (pl.moving) {
      const fast = pl.derived && pl.derived.moveSpd > 4.6;
      return { anim: fast ? 'run' : 'walk', phase: (pl.gait || 0) % 1 };
    }
    return { anim: 'idle', phase: (t * 0.42) % 1 };
  },

  // Pose angles are measured from straight-down with positive swinging
  // forward. A limb hanging along -Y swings toward -Z under a positive
  // rotation about X, and forward is +Z, so every joint takes the negated
  // angle. That single sign is the whole of the 2D-to-3D translation.
  apply(pose, st, pl, t) {
    const J = this.J, k = this.U2W;
    // The 2D bob was free to sink the sprite below its own feet; here that
    // would push the boots through the floor, so a downward bob is capped.
    J.body.position.y = Math.max(-pose.bob * k, st.anim === 'dead' ? -1 : -0.02);
    J.chest.rotation.x = -pose.spine * 0.5;
    J.chest.rotation.y = pose.twist;
    J.neck.rotation.x = -pose.head * 0.5;

    J.legL.up.rotation.x = -pose.legL;  J.legL.lo.rotation.x = -pose.legLF;
    J.legR.up.rotation.x = -pose.legR;  J.legR.lo.rotation.x = -pose.legRF;
    J.armL.up.rotation.x = -pose.armL;  J.armL.lo.rotation.x = -pose.armLF;
    J.armR.up.rotation.x = -pose.armR;  J.armR.lo.rotation.x = -pose.armRF;

    // The 2D death pose only slumped, because a flat sprite cannot fall over.
    // With a real rig it can, so it does.
    const dying = st.anim === 'dead' ? U.clamp(st.phase, 0, 1) : 0;
    J.body.rotation.x = -dying * Math.PI * 0.46;
    J.body.position.y -= dying * 0.12;
    if (!dying) this.carryAngle(J.body.position.y);

    if (J.cape) {
      const drag = pl.moving ? 0.55 : 0.12;
      J.cape.rotation.x = drag + Math.sin(t * 3.1) * 0.07 + pose.spine * 0.3;
      J.cape.rotation.z = pose.twist * 0.6;
    }

    // hit flash and buff aura, both carried over from the 2D renderer
    const flash = pl.hurtT > 0 ? U.clamp(pl.hurtT / 0.25, 0, 1) : 0;
    for (const key of ['skin', 'armor', 'cloth', 'clothDark', 'armorDark']) {
      const m = this.mats[key];
      m.emissive.setRGB(flash, flash * 0.35, flash * 0.3);
      m.emissiveIntensity = flash * 1.6;
    }
    const buff = pl.buffs && pl.buffs.length ? pl.buffs[0] : null;
    J.aura.visible = !!buff;
    if (buff) {
      this.mats.aura.color.set(buff.color || '#ffd94f');
      this.mats.aura.opacity = 0.28 + Math.sin(t * 6) * 0.12;
      const s = 0.9 + Math.sin(t * 2.4) * 0.06;
      J.aura.scale.set(s, s, 1);
    }
  },

  sync(pl, t) {
    if (!pl) return null;
    const cls = (typeof CLASSES !== 'undefined' && CLASSES.find(c => c.id === pl.cls)) || { pal: {} };
    const eq = Figure.equipOf(pl);
    const sig = this.sigOf(pl, eq);
    if (!this.rig || sig !== this.sig) { this.make(cls.pal, eq); this.sig = sig; }

    const st = this.anim(pl, t);
    this.apply(Figure.pose(st), st, pl, t);

    const r = this.rig;
    r.position.set(pl.x, 0, pl.y);
    // game angles are atan2(dy, dx) on the ground plane; the rig faces +Z
    const heading = Number.isFinite(pl.dir) ? pl.dir : 0;
    r.rotation.y = Math.PI / 2 - heading;
    return r;
  },

  destroy() {
    // Geometry is shared across every rig this session, so only the materials
    // — which carry the gear colours — are per-rig and need disposing.
    if (this.rig && R3.scene) R3.scene.remove(this.rig);
    this.disposeMats();
    this.rig = null; this.J = null; this.sig = '';
  },
};
