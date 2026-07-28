// ============ DIABLOID: fx3d.js — particles, blasts and projectiles ============
'use strict';

// The effect system already existed and worked: FX.spark, FX.explosion and the
// rest push plain objects onto G.parts / G.rings / G.flashes / G.bolts, and
// Render.updateParticles integrates them. None of that is 2D — only the
// drawing was. So the simulation is left exactly where it is and this module
// only reads the arrays and puts them on the GPU.
//
// One consequence worth stating: the effect arrays store `z` and `size` in
// PIXELS, because the isometric renderer measured everything in pixels and a
// tile was 32 of them. Converting on read (rather than changing the emitters)
// means every existing skill, hazard and death burst keeps the arc it was
// tuned to have.

// ---------------- the effect simulation ----------------
// Moved here from the 2D renderer, unchanged. None of it was ever 2D: the
// emitters push plain objects and the integrator advances them. They lived in
// render.js only because that is where the code that drew them lived, and
// keeping them there would have made deleting the 2D renderer delete the
// effects with it.

const FX = {
  push(p) { if (G.parts.length < 1500) G.parts.push(p); },
  ripple(x, y) {
    G.rings.push({ x, y, r: 0.08, maxR: U.rf(U.rand, 0.35, 0.65), color: '#9fc8e8', t: 0.5, maxT: 0.5, alpha: 0.35 });
  },
  spark(x, y, color, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 0.5, 3);
      this.push({ x, y, z: U.rf(U.rand, 4, 16), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 6, 22), life: 0.4, maxLife: 0.4, color, size: U.rf(U.rand, 1.5, 3), add: true, grav: 60, shape: 'spark', rot: U.rand() * 6.28, spin: 9 });
    }
  },
  trail(p) {
    if (U.rand() < 0.55) return;
    this.push({ x: p.x, y: p.y, z: 12, vx: U.rf(U.rand, -0.5, 0.5), vy: U.rf(U.rand, -0.5, 0.5), vz: U.rf(U.rand, -4, 8), life: 0.3, maxLife: 0.3, color: ELEM[p.elem].color, size: U.rf(U.rand, 1.5, 3.2), add: true, grav: 0 });
  },
  blood(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 1, 4);
      this.push({ x, y, z: U.rf(U.rand, 8, 22), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 10, 40), life: 0.55, maxLife: 0.55, color, size: U.rf(U.rand, 1.5, 3), add: false, grav: 130, shape: 'splash', rot: U.rand() * 6.28, spin: 4 });
    }
  },
  deathBurst(x, y, color, size) {
    for (let i = 0; i < 14 * size; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 1, 5) * size;
      this.push({ x, y, z: U.rf(U.rand, 4, 20), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 10, 50), life: 0.7, maxLife: 0.7, color: U.rand() < 0.5 ? color : '#6a0f0f', size: U.rf(U.rand, 2, 4), add: false, grav: 120, shape: 'shard', rot: U.rand() * 6.28, spin: 7 });
    }
  },
  explosion(x, y, r, color) {
    G.rings.push({ x, y, r: 0.2, maxR: r, color, t: 0.35, maxT: 0.35 });
    G.flashes.push({ x, y, r: r * 1.6, color, t: 0.25, maxT: 0.25 });
    for (let i = 0; i < 22; i++) {
      const a = U.rand() * Math.PI * 2, s = U.rf(U.rand, 2, 7);
      this.push({ x, y, z: U.rf(U.rand, 2, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rf(U.rand, 15, 55), life: 0.6, maxLife: 0.6, color, size: U.rf(U.rand, 2, 4.5), add: true, grav: 80, shape: 'ember' });
    }
  },
  ring(x, y, r, color, alpha) {
    G.rings.push({ x, y, r: 0.2, maxR: r, color, t: 0.3, maxT: 0.3, alpha: alpha || 0.9 });
  },
  slash(x, y, ang, range, color) {
    for (let i = 0; i < 7; i++) {
      const a = ang + U.rf(U.rand, -0.6, 0.6), rr = U.rf(U.rand, 0.4, range);
      this.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: 16, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 4, life: 0.22, maxLife: 0.22, color, size: 2.2, add: true, grav: 0 });
    }
  },
  strike(x, y, color) {
    G.bolts.push({ x, y, t: 0.22, maxT: 0.22, color });
    G.flashes.push({ x, y, r: 2.4, color, t: 0.22, maxT: 0.22 });
    this.spark(x, y, color, 6);
  },
  ember(x, y) {
    this.push({ x, y, z: 2, vx: U.rf(U.rand, -0.3, 0.3), vy: U.rf(U.rand, -0.3, 0.3), vz: U.rf(U.rand, 10, 22), life: 1.1, maxLife: 1.1, color: U.rand() < 0.5 ? '#ff8a2f' : '#ffd94f', size: U.rf(U.rand, 1.2, 2.4), add: true, grav: -8, shape: 'ember' });
  },
  gasPuff(x, y) {
    this.push({ x, y, z: 2, vx: U.rf(U.rand, -0.4, 0.4), vy: U.rf(U.rand, -0.4, 0.4), vz: U.rf(U.rand, 4, 9), life: 1.6, maxLife: 1.6, color: '#5a9a2f', size: U.rf(U.rand, 3, 6), add: false, grav: -4, shape: 'smoke' });
  },
  spikeBurst(x, y) {
    for (let i = 0; i < 6; i++)
      this.push({ x: x + U.rf(U.rand, -0.3, 0.3), y: y + U.rf(U.rand, -0.3, 0.3), z: 0, vx: 0, vy: 0, vz: U.rf(U.rand, 30, 60), life: 0.3, maxLife: 0.3, color: '#b8bcc4', size: 2.5, add: false, grav: 260 });
  },
  levelUp(x, y) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      this.push({ x: x + Math.cos(a) * 0.8, y: y + Math.sin(a) * 0.8, z: 0, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vz: U.rf(U.rand, 30, 70), life: 1.1, maxLife: 1.1, color: '#ffd94f', size: 2.6, add: true, grav: 20 });
    }
    G.flashes.push({ x, y, r: 5, color: '#ffd94f', t: 0.5, maxT: 0.5 });
  },
};

const FX3 = {
  PX: 1 / 32,               // the old renderer's pixels-per-tile
  MAX: 1500,                // matches FX.push's own cap
  RINGS: 24, FLASHES: 16, BOLTS: 12, PROJS: 64,

  group: null,
  add: null, norm: null,    // two Points objects: additive and normal blending
  rings: [], flashes: [], bolts: [], projs: [],
  ready: false,

  // A soft radial dot, generated rather than loaded — the game ships no
  // external images and a bare gl.POINTS is a hard square.
  _dot(soft) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (soft) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.86, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  },

  _points(blending, soft) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAX * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.MAX * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(this.MAX), 1));
    geo.setDrawRange(0, 0);
    // PointsMaterial has one size for every point; per-particle size needs a
    // shader, and the whole reason particles are one draw call is that they
    // share a material.
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this._dot(soft) }, scale: { value: 600 }, ortho: { value: 1 } },
      vertexShader: `
        attribute float size;
        uniform float scale;
        uniform float ortho;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // An orthographic projection has no perspective divide, so dividing
          // by view depth here shrank every particle to a sub-pixel speck in
          // the game's default camera. Size is depth-independent under ortho.
          gl_PointSize = clamp(size * scale * mix(1.0 / max(0.001, -mv.z), 1.0, ortho), 1.0, 220.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vCol;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a < 0.02) discard;
          gl_FragColor = vec4(vCol, t.a);
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;    // the buffer is rewritten every frame anyway
    return p;
  },

  init() {
    this.dispose();
    const g = new THREE.Group();
    this.group = g;
    R3.scene.add(g);

    this.add = this._points(THREE.AdditiveBlending, true);
    this.norm = this._points(THREE.NormalBlending, false);
    g.add(this.add, this.norm);

    // Expanding shockwave rings and ground flashes lie flat on the floor, so
    // they read at any camera pitch instead of only from the fixed 2D angle.
    const ringGeo = new THREE.RingGeometry(0.72, 1, 32);
    const discGeo = new THREE.CircleGeometry(1, 28);
    const boltGeo = new THREE.CylinderGeometry(0.08, 0.02, 1, 7, 1, true);
    const mk = (geo, n, arr, y) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = y;
        m.visible = false;
        g.add(m);
        arr.push(m);
      }
    };
    mk(ringGeo, this.RINGS, this.rings, 0.09);
    mk(discGeo, this.FLASHES, this.flashes, 0.07);
    for (let i = 0; i < this.BOLTS; i++) {
      const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false;
      g.add(m);
      this.bolts.push(m);
    }

    // Projectiles: an arrow is a shaft, everything else is a glowing bead.
    const beadGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.62, 5);
    for (let i = 0; i < this.PROJS; i++) {
      const o = new THREE.Group();
      const bead = new THREE.Mesh(beadGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: 0xd8cba8 }));
      shaft.rotation.z = Math.PI / 2;   // lie along +X, then yaw to the heading
      shaft.visible = false;
      o.add(bead, shaft);
      o.visible = false;
      g.add(o);
      this.projs.push({ o, bead, shaft });
    }

    this.ready = true;
    return true;
  },

  // ---- per-frame upload ----
  // Reads the live arrays and refills the buffers. No allocation, no per-effect
  // objects: the pools above are the only meshes that ever exist.
  sync(t) {
    if (!this.ready) return null;
    const col = new THREE.Color();

    // Pixels-per-world-unit differs by projection: under ortho it is fixed by
    // the frustum width, under perspective it falls off with depth.
    const iso = R3.cam === R3.orthoCam;
    const px = iso
      ? R3.W * R3.zoom / 26 * R3.dpr
      : R3.H * R3.dpr / (2 * Math.tan(R3.perspCam.fov * Math.PI / 360));
    for (const pts of [this.add, this.norm]) {
      pts.material.uniforms.scale.value = px;
      pts.material.uniforms.ortho.value = iso ? 1 : 0;
    }

    // particles, split by blend mode
    let na = 0, nn = 0;
    const A = this.add.geometry.attributes, N = this.norm.geometry.attributes;
    for (const p of G.parts) {
      const dst = p.add ? A : N;
      const i = p.add ? na++ : nn++;
      if (i >= this.MAX) { if (p.add) na--; else nn--; continue; }
      dst.position.array[i * 3] = p.x;
      dst.position.array[i * 3 + 1] = Math.max(0, p.z) * this.PX;
      dst.position.array[i * 3 + 2] = p.y;
      // fade by burning the colour down rather than by alpha: additive
      // particles have no alpha to fade, and this dims both modes the same way
      const k = U.clamp(p.life / (p.maxLife || 1), 0, 1);
      col.set(p.color).multiplyScalar(p.add ? k : 1);
      dst.color.array[i * 3] = col.r;
      dst.color.array[i * 3 + 1] = col.g;
      dst.color.array[i * 3 + 2] = col.b;
      dst.size.array[i] = (p.size || 2) * this.PX * (p.add ? 1 : k * 0.6 + 0.4);
    }
    this.add.geometry.setDrawRange(0, na);
    this.norm.geometry.setDrawRange(0, nn);
    for (const a of [A, N]) { a.position.needsUpdate = true; a.color.needsUpdate = true; a.size.needsUpdate = true; }

    // expanding rings
    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i], r = G.rings[i];
      if (!r) { m.visible = false; continue; }
      const k = U.clamp(r.t / (r.maxT || 1), 0, 1);
      const rad = r.r + (r.maxR - r.r) * (1 - k);
      m.visible = true;
      m.position.set(r.x, 0.09, r.y);
      m.scale.set(rad, rad, 1);
      m.material.color.set(r.color);
      m.material.opacity = (r.alpha === undefined ? 0.9 : r.alpha) * k;
    }
    // ground flashes
    for (let i = 0; i < this.flashes.length; i++) {
      const m = this.flashes[i], f = G.flashes[i];
      if (!f) { m.visible = false; continue; }
      const k = U.clamp(f.t / (f.maxT || 1), 0, 1);
      m.visible = true;
      m.position.set(f.x, 0.07, f.y);
      m.scale.set(f.r * k, f.r * k, 1);
      m.material.color.set(f.color);
      m.material.opacity = 0.42 * k;
    }
    // strike bolts — a column of light where something was hit
    for (let i = 0; i < this.bolts.length; i++) {
      const m = this.bolts[i], bl = G.bolts[i];
      if (!bl) { m.visible = false; continue; }
      const k = U.clamp(bl.t / (bl.maxT || 1), 0, 1);
      m.visible = true;
      m.position.set(bl.x, 1.6, bl.y);
      m.scale.set(1, 3.2, 1);
      m.material.color.set(bl.color);
      m.material.opacity = 0.75 * k;
    }

    // projectiles
    for (let i = 0; i < this.projs.length; i++) {
      const e = this.projs[i], p = G.projs[i];
      if (!p) { e.o.visible = false; continue; }
      const c = (ELEM[p.elem] || ELEM.phys).color;
      e.o.visible = true;
      e.o.position.set(p.x, 0.55, p.y);
      const arrow = p.kind === 'arrow';
      e.shaft.visible = arrow;
      e.bead.visible = true;
      e.bead.scale.setScalar(arrow ? 0.5 : p.kind === 'orb' ? 1.25 : 1);
      e.bead.material.color.set(c);
      if (arrow) e.o.rotation.y = Math.atan2(-p.vy, p.vx);   // shaft lies along local +X
      else e.o.rotation.y = t * 3;
    }

    return { parts: na + nn, add: na, norm: nn,
      rings: Math.min(G.rings.length, this.RINGS),
      flashes: Math.min(G.flashes.length, this.FLASHES),
      bolts: Math.min(G.bolts.length, this.BOLTS),
      projs: Math.min(G.projs.length, this.PROJS) };
  },

  dispose() {
    if (this.group && R3.scene) {
      R3.scene.remove(this.group);
      this.group.traverse(n => {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (n.material.uniforms && n.material.uniforms.map) n.material.uniforms.map.value.dispose();
          n.material.dispose();
        }
      });
    }
    this.group = null; this.add = null; this.norm = null;
    this.rings = []; this.flashes = []; this.bolts = []; this.projs = [];
    this.ready = false;
  },
};

// Advance every effect. Called once per frame by the game loop, in place of
// the old Render.updateParticles.
FX3.update = function (dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vz -= p.grav * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; }
  }
  for (let i = G.rings.length - 1; i >= 0; i--) { const r = G.rings[i]; r.t -= dt; if (r.t <= 0) G.rings.splice(i, 1); }
  for (let i = G.flashes.length - 1; i >= 0; i--) { const f = G.flashes[i]; f.t -= dt; if (f.t <= 0) G.flashes.splice(i, 1); }
  for (let i = G.bolts.length - 1; i >= 0; i--) { const b = G.bolts[i]; b.t -= dt; if (b.t <= 0) G.bolts.splice(i, 1); }
  for (let i = G.dmgNums.length - 1; i >= 0; i--) { const d = G.dmgNums[i]; d.t -= dt; d.z += 34 * dt; if (d.t <= 0) G.dmgNums.splice(i, 1); }
};
