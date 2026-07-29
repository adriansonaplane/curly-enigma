// ============ DIABLOID: renderer.js — the frame, 3D world + 2D overlay ============
'use strict';

// This is `Render`: the same name the rest of the game already calls, because
// the renderer did not change identity, only technique. Everything that was a
// painter's-algorithm blit is now geometry (world3d / props3d / actors3d) and
// everything that was genuinely screen-space — nameplates, damage numbers,
// chat bubbles, the reticle, the minimap — stays 2D on a transparent canvas
// layered over the WebGL one, because that is what those things are.
//
// The split is the point. A nameplate wants to be crisp text at a fixed pixel
// size; a wall wants to be lit geometry. Trying to do both in one pipeline is
// what made the old renderer 2,300 lines.

const Render = {
  cv: null, gl: null,            // gl = the WebGL canvas, cv = the overlay
  ctx: null,
  W: 0, H: 0, dpr: 1,
  mmCv: null, mmCtx: null, mapCv: null, mapCtx: null,
  exploreT: 0,
  _minimapYaw: NaN, _minimapDir: NaN, _minimapX: NaN, _minimapY: NaN,

  // settings the UI writes into; forwarded to the 3D layer on each frame
  fx: {},
  quality: 'high', qualityMode: 'auto',
  mood: 'spooky',
  heroLightMul: 0.42,
  renderScale: 1, targetFps: 60,
  showFps: false,
  _fpsN: 0, _fpsT: 0, _qualityStep: 0, _headroomWindows: 0,
  _contextLossLevel: 0,
  _mapBuilt: null,
  _shadows: null,
  cpuUpdateMs: 0, cpuRenderMs: 0, activeLights: 0,
  sceneCounters: null, frameCounters: null,

  init() {
    this.gl = document.getElementById('game');
    if (!this.gl) { console.error('[Render] no #game canvas'); return false; }

    // The overlay sits on top and never clears the frame behind it — it has to
    // be its own canvas, not a 2D context on the WebGL one, because a canvas
    // has exactly one context type for its lifetime.
    let ov = document.getElementById('overlay');
    if (!ov) {
      ov = document.createElement('canvas');
      ov.id = 'overlay';
      ov.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2';
      this.gl.parentNode.insertBefore(ov, this.gl.nextSibling);
    }
    this.cv = ov;
    this.ctx = ov.getContext('2d');

    // Nothing below this point is safe without a working WebGL renderer. In
    // particular, these modules allocate objects against R3.scene.
    R3.onContextLost = losses => this.onContextLost(losses);
    R3.onContextRestoring = losses => this.onContextRestoring(losses);
    if (!R3.init(this.gl)) return false;
    // A failed context request can poison a canvas. R3 may therefore recover
    // with an equivalent replacement, which becomes the input/WebGL surface.
    this.gl = R3.canvas;
    const config = typeof GraphicsConfig !== 'undefined' ? GraphicsConfig.current : {};
    this.renderScale = config.renderScale === undefined ? this.renderScale : config.renderScale;
    this.fx.shadows = config.shadows !== false;
    this.fx.grade = config.grading !== false;
    this.fx.fog = config.fog !== false;
    this.fx.shafts = config.shafts !== false;
    World3.configure(config);
    Props3.configure(config);
    Actors3.configure(config);
    FX3.configure(config);
    FX3.init();
    Actors3.clear();
    Hero3.destroy();

    this.mmCv = document.getElementById('minimap');
    if (this.mmCv) { this.mmCv.width = 220; this.mmCv.height = 220; this.mmCtx = this.mmCv.getContext('2d'); }
    this.mapCv = document.getElementById('map-overlay-canvas');
    if (this.mapCv) this.mapCtx = this.mapCv.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    return true;
  },

  resize() {
    // R3 owns the WebGL backing store. This DPR is only for the native-resolution
    // 2D overlay, so render scaling never softens text or nameplates.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = this.W * this.dpr;
    this.cv.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  },

  // Rebuild the level geometry. Called when the map changes; guarded so a
  // repeated call on the same map does not throw away and rebuild ~9,000
  // instanced tiles for nothing.
  onMap(map) {
    if (!map || this._mapBuilt === map) return false;
    this._mapBuilt = map;
    World3.build(map);
    Props3.build(map);
    Actors3.clear();
    this.markers(map);
    return true;
  },

  // ---- world markers: exits, portals, waypoints, loot ----
  // Marker state is packed as x, z, r, g, b, height, radius, bead-height.
  // Two dynamic instance buffers replace the old 48 groups / 96 meshes.
  MARKERS: 48,
  _markerState: null, markerColumns: null, markerBeads: null,
  _markerObject: null, _markerColor: null, _markerColumnColor: null,
  markers(map) {
    if (this.markerColumns) return;
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true);
    const bead = new THREE.SphereGeometry(0.14, 8, 6);
    const material = opacity => new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.markerColumns = new THREE.InstancedMesh(geo, material(1), this.MARKERS);
    this.markerBeads = new THREE.InstancedMesh(bead, material(1), this.MARKERS);
    for (const mesh of [this.markerColumns, this.markerBeads]) {
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color());
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      R3.scene.add(mesh);
    }
    this._markerState = new Float32Array(this.MARKERS * 8);
    // syncMarkers runs every frame. Keep its upload scratch objects alongside
    // the compact state buffer rather than creating garbage for every marker.
    this._markerObject = new THREE.Object3D();
    this._markerColor = new THREE.Color();
    this._markerColumnColor = new THREE.Color();
  },

  syncMarkers(t) {
    const map = G.map;
    let n = 0;
    const use = (x, y, color, h, r, beadY) => {
      if (n >= this.MARKERS) return;
      const i = n++ * 8, c = this._markerColor.set(color), a = this._markerState;
      a[i] = x; a[i + 1] = y; a[i + 2] = c.r; a[i + 3] = c.g; a[i + 4] = c.b;
      a[i + 5] = h; a[i + 6] = r; a[i + 7] = beadY === undefined ? -1 : beadY;
    };

    if (map) {
      use(map.exit.x + 0.5, map.exit.y + 0.5, '#ff8a2f', 2.6, 0.55);
      use(map.entry.x + 0.5, map.entry.y + 0.5, '#8fc8ff', 2.0, 0.45);
      if (map.waypoint) use(map.waypoint.x, map.waypoint.y, '#8fc8ff', 2.8, 0.7, 1.1);
      const pp = G.portalOnMap && G.portalOnMap(map);
      if (pp) use(pp.x, pp.y, '#4f8fff', 3.4, 0.8, 1.3);
    }
    // loot: a bead in its rarity colour, close enough to read as a drop
    for (const gi of G.groundItems || []) {
      const c = gi.gold ? '#ffd94f'
        : (gi.item && Items.rarityColor ? Items.rarityColor(gi.item.rarity) : '#cfcfcf');
      use(gi.x, gi.y, c, 0.6, 0.34, 0.3);
    }
    const dummy = this._markerObject, col = this._markerColor;
    let nc = 0, nb = 0;
    for (let j = 0; j < n; j++) {
      const i = j * 8, a = this._markerState, x = a[i], y = a[i + 1];
      col.setRGB(a[i + 2], a[i + 3], a[i + 4]);
      if (a[i + 5] > 0) {
        dummy.position.set(x, a[i + 5] / 2, y); dummy.rotation.set(0, 0, 0);
        dummy.scale.set(a[i + 6], a[i + 5], a[i + 6]); dummy.updateMatrix();
        this.markerColumns.setMatrixAt(nc, dummy.matrix);
        // Preserve the old faint, pulsing column opacity through additive RGB.
        const pulse = 0.07 + Math.sin(t * 3 + x + y) * 0.025;
        this._markerColumnColor.copy(col).multiplyScalar(pulse);
        this.markerColumns.setColorAt(nc++, this._markerColumnColor);
      }
      if (a[i + 7] >= 0) {
        dummy.position.set(x, a[i + 7] + Math.sin(t * 2.4 + x * 3) * 0.06, y);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        this.markerBeads.setMatrixAt(nb, dummy.matrix); this.markerBeads.setColorAt(nb++, col);
      }
    }
    for (const [mesh, count] of [[this.markerColumns, nc], [this.markerBeads, nb]]) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    }
  },

  // ---- coordinate helpers, kept API-compatible ----
  // `z` stays in the old renderer's pixels so physics.js and target.js need no
  // change; 32 of them are one tile.
  worldToScreen(x, y, z = 0) {
    const [sx, sy] = R3.worldToScreen(x, y, z * FX3.PX);
    return [sx, sy];
  },
  screenToWorld(sx, sy) {
    return R3.screenToGround(sx, sy) || [G.player ? G.player.x : 0, G.player ? G.player.y : 0];
  },

  trackFps(dt) {
    if (this.qualityMode !== 'auto') {
      this.quality = this.qualityMode;
      this._qualityStep = 0; this._headroomWindows = 0;
      return;
    }
    this._fpsN++; this._fpsT += dt;
    // Six seconds smooths loading spikes and hysteresis keeps adjacent quality
    // levels from trading places around the target. Recovery deliberately needs
    // four good windows (24 seconds) because raising quality is less urgent.
    if (this._fpsT >= 6) {
      const avg = this._fpsN / this._fpsT;
      this._fpsN = 0; this._fpsT = 0;
      const target = this.targetFps || 60;
      const low = target * 0.90, high = target * 0.98;
      if (avg < low && G.time > 10) {
        this._qualityStep = Math.min(6, this._qualityStep + 1);
        this._headroomWindows = 0;
      } else if (avg > high && this._qualityStep > 0) {
        if (++this._headroomWindows >= 4) {
          this._qualityStep--;
          this._headroomWindows = 0;
        }
      } else {
        this._headroomWindows = 0;
      }
    }
    this.quality = this._qualityStep >= 4 ? 'low' : 'high';
  },

  // Context-loss degradation is a one-way safety rail for this page lifetime,
  // not another FPS-governor step. The governor may recover quality later, but
  // these caps remain in force after restoration and after subsequent frames.
  onContextLost(losses) {
    this._contextLossLevel = Math.min(2, Math.max(this._contextLossLevel, losses));
  },

  onContextRestoring(losses) {
    this.onContextLost(losses);
    this.applyContextLossCaps(false);
  },

  applyContextLossCaps(resize = true) {
    if (!this._contextLossLevel) return;
    R3.setRenderScale(Math.min(R3.renderScale, 0.75), resize);
    R3.maxLights = Math.min(R3.maxLights, 6);
    if (this._contextLossLevel >= 2) {
      R3.gradeEnabled = false;
      if (this._shadows !== false) {
        this._shadows = false;
        World3.setShadows(false);
      }
    }
  },

  // ---- the frame ----
  frame(dt, t) {
    const map = G.map, pl = G.player;
    if (!map || !pl) return;
    this.trackFps(dt);
    FX3.update(dt);
    this.onMap(map);

    // quality and mood are owned by the settings UI; push them through
    R3.mood = this.mood;
    R3.heroLightMul = this.heroLightMul;
    const step = this.qualityMode === 'auto' ? this._qualityStep : (this.quality === 'low' ? 6 : 0);
    const scaleCaps = [1, 0.85, 0.75, 0.75, 0.75, 0.75, 0.75];
    const lossScaleCap = this._contextLossLevel ? 0.75 : 1;
    R3.setRenderScale(Math.min(this.renderScale, scaleCaps[step], lossScaleCap));
    const shadows = this._contextLossLevel < 2 && step < 6 && this.fx.shadows !== false
      && (!R3.profile || R3.profile.pointLightShadows);
    if (this._shadows !== shadows) {
      this._shadows = shadows;
      World3.setShadows(shadows);
    }
    // Fragment lighting is a primary GPU cost, so the budget yields under the
    // governor — but it yields, it does not start yielded. Making eight the
    // permanent default (with twelve as opt-in) dimmed every scene at full
    // quality to buy headroom the governor is there to buy on demand. Full
    // quality is twelve again; the steps down are 8 and then 6.
    const configuredLights = typeof GraphicsConfig !== 'undefined' ? GraphicsConfig.current.lightBudget : 12;
    const requestedLights = Math.min(configuredLights, this.qualityMode === 'ultra' ? 12
      : (step >= 5 ? 6 : (step >= 3 ? 8 : 12)));
    const lossLightCap = this._contextLossLevel ? 6 : requestedLights;
    R3.maxLights = Math.min(requestedLights, lossLightCap,
      R3.profile ? R3.profile.maxLights : requestedLights);
    World3.updateAtmosphere(this.fx.fog !== false);
    // Expensive atmosphere yields before lights/readability under the governor.
    R3.gradeEnabled = this._contextLossLevel < 2 && step < 3 && this.fx.grade !== false
      && (!R3.profile || R3.profile.grading);

    // camera: the old rig's zoom/mode/shake, aimed at the same focus point
    G.shake = Math.max(0, G.shake - dt * 30);
    if (this.fx.shake === false) G.shake = 0;
    Cam.update(dt, pl);
    if ((Cam.mode === 'third') !== (R3.mode === R3.MODE_FREE)) {
      R3.setMode(Cam.mode === 'third' ? R3.MODE_FREE : R3.MODE_ELEVATED);
    }
    // Push the player's camera intent at the rig. Both calls refuse while a
    // preset is locked, so the preset's own yaw/pitch/zoom survive the frame
    // rather than being reassigned from Cam and re-corrected afterwards.
    R3.setZoom(Cam.zoom);
    R3.setOrientation(Cam.yaw, Cam.pitch || 0.6);
    const shx = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.02 : 0;
    const shz = G.shake ? U.rf(U.rand, -G.shake, G.shake) * 0.02 : 0;
    R3.lookAt(Cam.fx + shx, Cam.fy + shz);

    // explored fog for the minimap
    this.exploreT -= dt;
    let minimapDirty = this._minimapYaw !== R3.yaw || this._minimapDir !== pl.dir
      || this._minimapX !== pl.x || this._minimapY !== pl.y;
    if (this.exploreT <= 0) {
      this.exploreT = 0.25;
      const R = 9;
      for (let y = Math.max(0, Math.floor(pl.y - R)); y < Math.min(map.h, pl.y + R); y++)
        for (let x = Math.max(0, Math.floor(pl.x - R)); x < Math.min(map.w, pl.x + R); x++)
          if (U.dist(x + 0.5, y + 0.5, pl.x, pl.y) < R) map.explored[y * map.w + x] = 1;
      minimapDirty = true;
    }
    // Camera-up maps must respond in the same frame as an orbit or a turn.
    // Position is included so the player remains exactly centred while moving.
    if (minimapDirty) this.drawMinimap();
    if (typeof WUI !== 'undefined' && WUI.mapOpen) this.drawMapOverlay();

    // ---------- 3D pass ----------
    this.activeLights = World3.updateLights(t, pl.x, pl.y);
    World3.updateShafts(t, step < 4 && this.fx.shafts !== false);
    Actors3.sync(G.monsters, t);
    Actors3.syncCrowd(t, G.npcs, typeof Social !== 'undefined' ? Social.townSims : null);
    Hero3.sync(pl, t);
    FX3.sync(t);
    this.syncMarkers(t);
    const submitStart = performance.now();
    R3.render((pass, counters) => {
      if (pass === 'scene') this.sceneCounters = Object.assign({}, counters);
      else this.frameCounters = Object.assign({}, counters);
    });
    this.cpuRenderMs = performance.now() - submitStart;

    // ---------- 2D overlay ----------
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (Target && Target.draw) Target.draw(ctx, t);
    if (Physics && Physics.drawSmall) Physics.drawSmall(ctx);
    this.drawPlates(ctx, t);
    this.drawKindlePrompt(ctx, t);
    this.drawDamage(ctx);
    this.drawBubbles(ctx, t);
  },

  // A stable, allocation-safe entry point for before/after comparisons. It
  // deliberately reports configuration alongside workload so captures from
  // elevated/free, grade, shadow, and render-scale runs remain self-describing.
  diagnosticSnapshot() {
    const actors = Actors3.stats ? Actors3.stats() : null;
    const worldInstances = World3.batchStats ? World3.batchStats(R3.cam) : null;
    const propInstances = Props3.batchStats ? Props3.batchStats(R3.cam) : null;
    return Object.assign({}, R3.stats(), {
      activeLights: this.activeLights,
      counters: { scene: Object.assign({}, this.sceneCounters || {}),
        frame: Object.assign({}, this.frameCounters || {}) },
      cpu: { updateMs: +this.cpuUpdateMs.toFixed(3), renderSubmissionMs: +this.cpuRenderMs.toFixed(3) },
      actors,
      instances: {
        totalInstances: (worldInstances ? worldInstances.totalInstances : 0) +
          (propInstances ? propInstances.totalInstances : 0),
        submittedVisibleInstances: (worldInstances ? worldInstances.submittedVisibleInstances : 0) +
          (propInstances ? propInstances.submittedVisibleInstances : 0),
        calls: (worldInstances ? worldInstances.calls : 0) + (propInstances ? propInstances.calls : 0),
        world: worldInstances && Object.assign({ chunkSize: World3.CHUNK_SIZE }, worldInstances),
        props: propInstances && Object.assign({ chunkSize: Props3.CHUNK_SIZE,
          minChunkInstances: Props3.CHUNK_MIN_INSTANCES }, propInstances),
      },
      authoredModels: !!R3.authoredModels,
      effects: FX3.stats ? FX3.stats() : null,
      props: { authoredModels: !!R3.authoredModels,
        diagnostics: (Props3.diagnostics || []).map(d => Object.assign({}, d)) },
    });
  },

  // Switch layouts between captures. Call this, allow authored prop rebuilds
  // and the GPU timer to settle, then sample diagnosticSnapshot() in both
  // camera presets. `world: 0, props: 0` is the pre-chunking control.
  configureSpatialBatches(options) {
    options = options || {};
    const world = options.world === undefined ? World3.CHUNK_SIZE : options.world;
    const props = options.props === undefined ? Props3.CHUNK_SIZE : options.props;
    const minProps = options.minProps === undefined ? Props3.CHUNK_MIN_INSTANCES : options.minProps;
    // Defer both rebuilds until all knobs are set; otherwise the first rebuild
    // briefly combines the old prop layout with the new world layout.
    World3.setChunkSize(world, false);
    Props3.setChunking(props, minProps, false);
    if (G.map) { World3.build(G.map); Props3.build(G.map); }
    return this.diagnosticSnapshot();
  },

  // Nameplates and health bars: screen-space by nature, so they stay 2D and
  // stay crisp instead of being billboarded quads that fight the depth buffer.
  drawPlates(ctx, t) {
    const pl = G.player;
    const plates = this.fx.plates !== false;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '11px Palatino Linotype, serif';
    for (const m of G.monsters) {
      if (m.dead) continue;
      const d = U.dist(m.x, m.y, pl.x, pl.y);
      if (d > 22) continue;
      const [sx, sy, depth] = R3.worldToScreen(m.x, m.y, 1.5 * (m.size || 1));
      if (depth > 1 || sx < -60 || sx > this.W + 60 || sy < -40 || sy > this.H + 40) continue;
      const hurt = m.hp < m.maxHp;
      if (hurt || m.rank === 'elite' || m.boss) {
        const w = m.boss ? 74 : 38;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx - w / 2, sy - 6, w, 4);
        ctx.fillStyle = m.ally ? '#6be26b' : m.boss ? '#ff5a3c' : m.rank === 'elite' ? '#ffd94f' : '#c0392b';
        ctx.fillRect(sx - w / 2, sy - 6, w * U.clamp(m.hp / m.maxHp, 0, 1), 4);
      }
      // Summons and trap-spawned actors can carry no display name; drawing the
      // plate anyway printed a literal "undefined" over the fight.
      if (m.name && (m.rank === 'elite' || m.boss || (plates && !m.ally))) {
        ctx.fillStyle = m.boss ? '#ff8a6a' : m.rank === 'elite' ? '#ffd94f' : '#d8cdb0';
        ctx.fillText(m.name, sx, sy - 10);
      }
    }
    for (const n of G.npcs || []) {
      const [sx, sy, depth] = R3.worldToScreen(n.x, n.y, 2);
      if (depth > 1) continue;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(n.name || 'Villager', sx, sy - 6);
    }
    // loot labels — the drop itself is a bead in the 3D scene
    for (const gi of G.groundItems || []) {
      if (U.dist(gi.x, gi.y, pl.x, pl.y) > 9) continue;
      const [sx, sy, depth] = R3.worldToScreen(gi.x, gi.y, 0.9);
      if (depth > 1) continue;
      const label = gi.gold ? gi.gold + ' gold' : (gi.item && gi.item.name) || '';
      if (!label) continue;
      const c = gi.gold ? '#ffd94f' : Items.rarityColor(gi.item.rarity);
      ctx.font = '11px Palatino Linotype, serif';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(8,8,10,0.72)';
      ctx.fillRect(sx - w / 2, sy - 12, w, 15);
      ctx.strokeStyle = U.rgba(c, 0.6); ctx.lineWidth = 1;
      ctx.strokeRect(sx - w / 2, sy - 12, w, 15);
      ctx.fillStyle = c;
      ctx.fillText(label, sx, sy - 1);
    }
    ctx.restore();
  },

  // A deliberate action nobody is told about is a dead feature, so the sconce
  // in reach says what the key will do to it, over itself. G.nearLight is the
  // same object the key acts on, so the prompt cannot point at a different
  // torch than the one that flips — and it names the direction, because a
  // toggle whose label never changes is a toggle nobody knows is a toggle.
  drawKindlePrompt(ctx, t) {
    const l = G.nearLight;
    if (!l) return;
    const [sx, sy, depth] = R3.worldToScreen(l.x, l.y, 1.5);
    if (depth > 1) return;
    const key = (typeof WUI !== 'undefined' && WUI.keymap && WUI.keymap.interact) || 'f';
    const label = (l.lit ? 'Snuff  [' : 'Light  [') + key.toUpperCase() + ']';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px Palatino Linotype, serif';
    const w = ctx.measureText(label).width + 16;
    const pulse = 0.72 + Math.sin(t * 4) * 0.18;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(10,8,6,0.78)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx - w / 2, sy - 16, w, 19, 5);
    else ctx.rect(sx - w / 2, sy - 16, w, 19);
    ctx.fill();
    const tone = l.lit ? '#9fb4c8' : (l.color || '#ffb04f');
    ctx.strokeStyle = U.rgba(tone, 0.75); ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tone;
    ctx.fillText(label, sx, sy - 3);
    ctx.restore();
  },

  drawDamage(ctx) {
    if (this.fx.dmgNums === false) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const d of G.dmgNums) {
      const [sx, sy, depth] = R3.worldToScreen(d.x, d.y, 1.2 + d.z * FX3.PX);
      if (depth > 1) continue;
      const k = U.clamp(d.t / (d.maxT || 1), 0, 1);
      ctx.globalAlpha = k;
      ctx.font = (d.crit ? 'bold 19px' : '14px') + ' Palatino Linotype, serif';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(d.txt, sx + 1, sy + 1);
      ctx.fillStyle = d.color || '#fff';
      ctx.fillText(d.txt, sx, sy);
    }
    ctx.restore();
  },

  drawBubbles(ctx, t) {
    if (typeof Social === 'undefined' || !Social.bubbles) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px Palatino Linotype, serif';
    for (const b of Social.bubbles) {
      const src = b.from || b;
      const [sx, sy, depth] = R3.worldToScreen(src.x, src.y, 2.2);
      if (depth > 1) continue;
      if (!b.text) continue;
      const k = U.clamp(b.t / (b.maxT || 1), 0, 1);
      const w = ctx.measureText(b.text).width + 14;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(12,12,16,0.82)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx - w / 2, sy - 20, w, 18, 6);
      else ctx.rect(sx - w / 2, sy - 20, w, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,170,140,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = b.color || '#e8e0cc';
      ctx.fillText(b.text, sx, sy - 7);
    }
    ctx.restore();
  },

  // Build the marker list once for both map surfaces. Filters are applied by
  // drawMap, so exploration visibility and marker semantics cannot diverge.
  mapMarkers(map) {
    const out = [], exploredAt = (x, y) => {
      x = Math.floor(x); y = Math.floor(y);
      return x >= 0 && y >= 0 && x < map.w && y < map.h && map.explored[y * map.w + x];
    };
    for (const mo of G.monsters) if (!mo.dead && exploredAt(mo.x, mo.y))
      out.push({ x: mo.x, y: mo.y, kind: mo.ally ? 'allies' : 'enemies', color: mo.ally ? '#6be26b' : mo.boss ? '#ff5a3c' : mo.rank === 'elite' ? '#ffd94f' : '#c0392b', size: .48, entity: mo });
    for (const n of G.npcs) if (exploredAt(n.x, n.y)) out.push({ x: n.x, y: n.y, kind: 'npcs', color: '#ffe9a8', size: .52, entity: n });
    const portal = G.portalOnMap(map);
    if (portal && exploredAt(portal.x, portal.y)) out.push({ ...portal, kind: 'travel', color: '#4f8fff', size: .68 });
    if (map.waypoint && exploredAt(map.waypoint.x, map.waypoint.y)) out.push({ ...map.waypoint, kind: 'travel', color: '#8fc8ff', size: .68 });
    // A narrative marker is earned by inspecting the site. Merely exploring
    // its tile must not spoil an undiscovered clue on either map surface.
    for (const site of [...(map.clues || []), ...(map.encounters || [])])
      if (site.discovered && exploredAt(site.x, site.y))
        out.push({ x: site.x, y: site.y, kind: 'narrative', color: site.narrativeKind === 'clue' ? '#d8c18a' : '#8fc8ff', size: .5 });
    if (typeof QuestState !== 'undefined' && G.player && G.player.quests) {
      const active = new Set([QuestState.STATES.ACCEPTED, QuestState.STATES.OBJECTIVE_PROGRESS, QuestState.STATES.READY]);
      for (const q of QuestState.quests) {
        const state = QuestState.status(q, G.player);
        if (!active.has(state)) continue;
        if (state === QuestState.STATES.READY) {
          for (const n of G.npcs) if ((n.id || n.kind || n.name || '').toLowerCase().includes(q.turnInNpc) && exploredAt(n.x, n.y))
            out.push({ x:n.x, y:n.y, kind:'quests', color:'#ffd94f', size:.82 });
        } else for (const obj of QuestState.activeObjectives(q, G.player)) {
          if (obj.act !== undefined && map.actIdx !== obj.act) continue;
          if (obj.type === 'boss' || obj.type === 'kill') for (const mo of G.monsters)
            if (!mo.dead && !mo.ally && exploredAt(mo.x, mo.y) && (obj.type !== 'boss' || mo.boss))
              out.push({ x:mo.x, y:mo.y, kind:'quests', color:'#ffd94f', size:.72 });
        }
      }
    }
    return out;
  },

  // Shared explored-tile and marker renderer used by both minimap and overlay.
  drawMap(ctx, options = {}) {
    const map = G.map, pl = G.player;
    if (!ctx || !map || !pl) return;
    const W = options.width || ctx.canvas.width, H = options.height || ctx.canvas.height;
    const scale = options.scale || 9, yaw = options.northUp ? 0 : (Number.isFinite(R3.yaw) ? R3.yaw : (Cam.yaw || 0));
    const center = options.center || pl, filters = options.filters || {};
    ctx.clearRect(0, 0, W, H); ctx.save();
    if (options.clipCircle) { ctx.beginPath(); ctx.arc(W/2,H/2,Math.min(W,H)/2-6,0,Math.PI*2); ctx.clip(); }
    ctx.fillStyle = 'rgba(5,7,10,0.94)'; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(-yaw); ctx.scale(scale,scale); ctx.translate(-center.x,-center.y);
    for (let y=0;y<map.h;y++) for (let x=0;x<map.w;x++) {
      const i=y*map.w+x; if (!map.explored[i]) continue; const tl=map.t[i];
      ctx.fillStyle = tl===TILE.WALL ? 'rgba(120,110,90,.55)' : tl===TILE.EXIT ? '#ff8a2f' : tl===TILE.ENTRY ? '#8fc8ff' : map.haz[i]===HAZ.LAVA ? 'rgba(200,70,10,.8)' : map.haz[i]===HAZ.WATER ? 'rgba(40,90,140,.8)' : isVent(map.haz[i]) ? U.rgba(VENT_KINDS[map.haz[i]].color,.8) : 'rgba(52,48,40,.8)';
      ctx.fillRect(x,y,1.04,1.04);
    }
    for (const marker of this.mapMarkers(map)) {
      if (filters[marker.kind] === false) continue;
      ctx.fillStyle=marker.color; const z=marker.size;
      if (marker.kind === 'quests') { ctx.strokeStyle='#2a1900'; ctx.lineWidth=.14; ctx.beginPath(); ctx.arc(marker.x,marker.y,z*.62,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
      else ctx.fillRect(marker.x-z/2,marker.y-z/2,z,z);
    }
    ctx.restore();
    ctx.save(); ctx.translate(W/2+(pl.x-center.x)*scale, H/2+(pl.y-center.y)*scale); ctx.rotate((Number.isFinite(pl.dir)?pl.dir:0)-yaw);
    ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-6,-6); ctx.lineTo(-3,0); ctx.lineTo(-6,6); ctx.closePath(); ctx.fillStyle='#fff7cf'; ctx.shadowColor='#ffd36a'; ctx.shadowBlur=6; ctx.fill(); ctx.strokeStyle='#241500'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
    ctx.restore();
  },

  drawMinimap() {
    const pl=G.player; if (!pl || !this.mmCtx) return;
    const s=typeof WUI !== 'undefined' && WUI.set ? WUI.set : {};
    const yaw=Number.isFinite(R3.yaw)?R3.yaw:(Cam.yaw||0);
    this._minimapYaw=yaw; this._minimapDir=pl.dir; this._minimapX=pl.x; this._minimapY=pl.y;
    this.drawMap(this.mmCtx,{width:220,height:220,scale:U.clamp(Number(s.minimapScale)||9,5,18),northUp:s.minimapNorthUp===true,clipCircle:true,center:pl,
      filters:{enemies:s.minimapEnemies!==false,allies:s.minimapAllies!==false,npcs:s.minimapNpcs!==false,travel:s.minimapTravel!==false,quests:s.minimapQuests!==false}});
    const m=this.mmCtx,C=110,R=104,fade=m.createRadialGradient(C,C,R*.72,C,C,R); fade.addColorStop(0,'rgba(0,0,0,0)'); fade.addColorStop(1,'rgba(0,0,0,.78)');
    m.save(); m.beginPath(); m.arc(C,C,R,0,Math.PI*2); m.clip(); m.fillStyle=fade; m.fillRect(0,0,220,220); m.restore();
    m.beginPath(); m.arc(C,C,R,0,Math.PI*2); m.strokeStyle='rgba(151,126,72,.95)'; m.lineWidth=3; m.stroke();
  },

  drawMapOverlay() {
    if (!this.mapCv || !this.mapCtx || typeof WUI === 'undefined') return;
    const rect=this.mapCv.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.round(rect.width*dpr)), h=Math.max(1,Math.round(rect.height*dpr));
    if (this.mapCv.width!==w || this.mapCv.height!==h) { this.mapCv.width=w; this.mapCv.height=h; }
    this.mapCtx.setTransform(dpr,0,0,dpr,0,0);
    const s=WUI.set, pan=WUI.mapPan || {x:0,y:0};
    this.drawMap(this.mapCtx,{width:rect.width,height:rect.height,scale:Number(s.mapZoom)||12,northUp:s.mapNorthUp!==false,center:{x:G.player.x+pan.x,y:G.player.y+pan.y},filters:{enemies:s.mapEnemies,allies:s.mapAllies,npcs:s.mapNpcs,travel:s.mapTravel,quests:s.mapQuests}});
  },
};
