// ============ DIABLOID: actors3d.js — monsters & the hero as 3D rigs ============
'use strict';

// The catalogue gave us 17 monster models against 35 monsters and 5 bosses, so
// most of the bestiary has no art. Rather than let two thirds of it fall back
// to placeholders, every body archetype is built here from primitives — the
// same technique the catalogue's own models use (fused spheres and cones), and
// the same six archetypes the 2D sprite baker already drove off. Each monster
// keeps the silhouette, palette and scale it has today; the 17 mapped ones get
// swapped for real models as those land, one at a time, without touching this.
//
// Geometry and materials are shared per monster kind. A room of twenty
// skeletons is twenty transforms over one set of buffers, not twenty rigs.

const Actors3 = {
  _geo: null,
  _mats: Object.create(null),     // kind -> { main, dark, eye }
  pool: [],                       // live actor rigs

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

  // part(): one primitive, positioned and scaled in local space
  _part(geo, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    m.castShadow = true; m.receiveShadow = false;
    return m;
  },

  // ---- archetypes ----
  // Each returns a group whose named children the animator drives. Origin is
  // at the feet, +Z forward, so a facing is just group.rotation.y.
  build(body, kind, pal, size) {
    const g = this.geo(), M = this.mats(kind, pal);
    const rig = new THREE.Group();
    const P = (geo, mat, ...a) => { const m = this._part(geo, mat, ...a); rig.add(m); return m; };
    const s = size || 1;

    switch (body) {
      case 'skeleton': {
        rig.userData.legs = [
          P(g.cyl, M.main, -0.13, 0.36, 0, 0.07, 0.72, 0.07),
          P(g.cyl, M.main, 0.13, 0.36, 0, 0.07, 0.72, 0.07)];
        const torso = P(g.cyl, M.main, 0, 0.95, 0, 0.2, 0.52, 0.14);
        // ribs — the read that says "skeleton" at a glance
        for (let i = 0; i < 4; i++)
          P(g.cyl, M.dark, 0, 0.78 + i * 0.12, 0, 0.23, 0.03, 0.17);
        rig.userData.arms = [
          P(g.cyl, M.main, -0.28, 0.98, 0, 0.055, 0.5, 0.055),
          P(g.cyl, M.main, 0.28, 0.98, 0, 0.055, 0.5, 0.055)];
        const head = P(g.sphere, M.main, 0, 1.36, 0, 0.19, 0.22, 0.19);
        P(g.sphere, M.eye, -0.07, 1.37, 0.15, 0.045);
        P(g.sphere, M.eye, 0.07, 1.37, 0.15, 0.045);
        rig.userData.head = head; rig.userData.torso = torso;
        break;
      }
      case 'brute': {
        rig.userData.legs = [
          P(g.cyl, M.dark, -0.22, 0.34, 0, 0.15, 0.7, 0.15),
          P(g.cyl, M.dark, 0.22, 0.34, 0, 0.15, 0.7, 0.15)];
        const torso = P(g.blob, M.main, 0, 1.05, 0, 0.46, 0.5, 0.38);
        rig.userData.arms = [
          P(g.cyl, M.main, -0.5, 1.0, 0, 0.13, 0.62, 0.13),
          P(g.cyl, M.main, 0.5, 1.0, 0, 0.13, 0.62, 0.13)];
        // hunched, small head, huge shoulders
        P(g.blob, M.main, -0.42, 1.32, 0, 0.2);
        P(g.blob, M.main, 0.42, 1.32, 0, 0.2);
        const head = P(g.blob, M.main, 0, 1.44, 0.06, 0.21, 0.19, 0.2);
        P(g.sphere, M.eye, -0.08, 1.46, 0.17, 0.05);
        P(g.sphere, M.eye, 0.08, 1.46, 0.17, 0.05);
        rig.userData.head = head; rig.userData.torso = torso;
        break;
      }
      case 'blob': {
        const torso = P(g.blob, M.main, 0, 0.42, 0, 0.55, 0.44, 0.55);
        P(g.blob, M.dark, 0, 0.66, 0, 0.34, 0.26, 0.34);
        P(g.sphere, M.eye, -0.14, 0.6, 0.34, 0.07);
        P(g.sphere, M.eye, 0.14, 0.6, 0.34, 0.07);
        rig.userData.torso = torso; rig.userData.wobble = true;
        break;
      }
      case 'spider': {
        const torso = P(g.blob, M.main, 0, 0.42, -0.1, 0.42, 0.3, 0.5);
        P(g.blob, M.dark, 0, 0.4, 0.3, 0.26, 0.22, 0.26);
        const legs = [];
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? -1 : 1, k = i % 4;
          const l = P(g.cyl, M.dark, side * 0.34, 0.3, -0.24 + k * 0.18, 0.04, 0.42, 0.04);
          l.rotation.z = side * 0.9;
          legs.push(l);
        }
        rig.userData.legs = legs; rig.userData.torso = torso; rig.userData.skitter = true;
        P(g.sphere, M.eye, -0.09, 0.46, 0.5, 0.05);
        P(g.sphere, M.eye, 0.09, 0.46, 0.5, 0.05);
        break;
      }
      case 'bat': {
        const torso = P(g.blob, M.main, 0, 0.8, 0, 0.17, 0.22, 0.2);
        rig.userData.wings = [
          P(g.box, M.dark, -0.36, 0.86, 0, 0.5, 0.03, 0.3),
          P(g.box, M.dark, 0.36, 0.86, 0, 0.5, 0.03, 0.3)];
        P(g.cone, M.main, -0.08, 1.0, 0, 0.06, 0.12, 0.06);
        P(g.cone, M.main, 0.08, 1.0, 0, 0.06, 0.12, 0.06);
        P(g.sphere, M.eye, -0.06, 0.84, 0.15, 0.04);
        P(g.sphere, M.eye, 0.06, 0.84, 0.15, 0.04);
        rig.userData.torso = torso; rig.userData.fly = true;
        break;
      }
      case 'serpent': {
        const seg = [];
        for (let i = 0; i < 6; i++)
          seg.push(P(g.blob, i % 2 ? M.dark : M.main, 0, 0.26, -i * 0.3, 0.3 - i * 0.03));
        const head = P(g.blob, M.main, 0, 0.34, 0.28, 0.24, 0.2, 0.3);
        P(g.sphere, M.eye, -0.09, 0.38, 0.46, 0.05);
        P(g.sphere, M.eye, 0.09, 0.38, 0.46, 0.05);
        rig.userData.segs = seg; rig.userData.head = head; rig.userData.slither = true;
        break;
      }
      case 'ghost': {
        const torso = P(g.blob, M.main, 0, 0.85, 0, 0.34, 0.44, 0.3);
        const tail = P(g.cone, M.main, 0, 0.4, 0, 0.3, 0.6, 0.28);
        tail.rotation.x = Math.PI;
        P(g.sphere, M.eye, -0.1, 0.98, 0.24, 0.055);
        P(g.sphere, M.eye, 0.1, 0.98, 0.24, 0.055);
        // Ghosts read as translucent. Materials are shared per monster kind and
        // every ghost-bodied kind wants this, so setting it on the shared
        // material is correct rather than a leak — it cannot reach a kind that
        // is not a ghost.
        M.main.transparent = true; M.main.opacity = 0.62;
        M.main.emissive = new THREE.Color(pal.main);
        M.main.emissiveIntensity = 0.25;
        rig.userData.torso = torso; rig.userData.tail = tail;
        rig.userData.fly = true; rig.userData.ghost = true;
        break;
      }
      default: {  // humanoid
        rig.userData.legs = [
          P(g.cyl, M.dark, -0.14, 0.35, 0, 0.09, 0.7, 0.09),
          P(g.cyl, M.dark, 0.14, 0.35, 0, 0.09, 0.7, 0.09)];
        const torso = P(g.blob, M.main, 0, 0.98, 0, 0.28, 0.36, 0.2);
        rig.userData.arms = [
          P(g.cyl, M.main, -0.33, 0.96, 0, 0.07, 0.52, 0.07),
          P(g.cyl, M.main, 0.33, 0.96, 0, 0.07, 0.52, 0.07)];
        const head = P(g.blob, M.main, 0, 1.35, 0, 0.19, 0.21, 0.19);
        P(g.sphere, M.eye, -0.07, 1.37, 0.16, 0.045);
        P(g.sphere, M.eye, 0.07, 1.37, 0.16, 0.045);
        rig.userData.head = head; rig.userData.torso = torso;
        break;
      }
    }
    rig.scale.setScalar(s);
    return rig;
  },

  // ---- animation ----
  // Driven entirely off state the game already tracks — no new bookkeeping.
  animate(rig, a, t) {
    const d = rig.userData;
    const moving = a.moving;
    const w = t * 9 + (a._phase || 0);
    const swing = moving ? Math.sin(w) * 0.55 : Math.sin(t * 1.7 + (a._phase || 0)) * 0.05;

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

  // ---- pooling ----
  // One rig per live monster, kept between frames. Rebuilt only when the map
  // changes, so walking through a level is transforms, not allocations.
  sync(monsters, t) {
    const live = new Set();
    for (const m of monsters) {
      if (m.dead) continue;
      live.add(m);
      if (!m._rig) {
        const def = MONSTERS[m.kind] || BOSSES[m.kind];
        if (!def) continue;
        m._rig = this.build(def.body, m.kind, def.pal, (def.size || 1) * (m.rank === 'boss' ? 1.3 : 1));
        m._phase = (m.x * 7.3 + m.y * 3.1) % 6.28;
        R3.scene.add(m._rig);
        this.pool.push(m);
      }
      const r = m._rig;
      r.position.x = m.x; r.position.z = m.y;
      r.rotation.y = Math.atan2(m.vx || 0, m.vy || 0) || r.rotation.y;
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

  clear() {
    for (const m of this.pool) if (m._rig) { R3.scene.remove(m._rig); m._rig = null; }
    this.pool.length = 0;
  },
};
