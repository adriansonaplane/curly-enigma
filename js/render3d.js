// ============ DIABLOID: render3d.js — three.js scene, camera, lighting ============
'use strict';

// The 2D isometric renderer baked its projection into a matrix, which is why
// "isometric" and "third person" were two different code paths that disagreed
// with each other. Both retained presets now use this single perspective rig:
// elevated is a fixed, readable overview and free is the orbitable close view.
//
// World axes: X east, Z south, Y up. One world unit = one dungeon tile, so a
// tile at (tx, ty) sits at (tx + 0.5, 0, ty + 0.5) and every existing game
// coordinate maps straight across with y -> z.

const R3 = {
  PROFILE_SESSION_KEY: 'diabloid.rendererProfile',
  AUTHORED_MODELS_KEY: 'diabloid.authoredModels',
  PROFILES: {
    default: { antialias: true, dprCap: 2, renderScaleCap: 1,
      grading: true, maxLights: 12, reducedLighting: false, pointLightShadows: true, authoredModels: true },
    conservative: { antialias: false, dprCap: 1, renderScaleCap: 0.75,
      grading: false, maxLights: 6, reducedLighting: true, pointLightShadows: false, authoredModels: false },
  },
  profileName: 'default',
  profile: null,
  authoredModels: true,
  setAuthoredModels(enabled) {
    this.authoredModels = enabled !== false;
    try { localStorage.setItem(this.AUTHORED_MODELS_KEY, JSON.stringify(this.authoredModels)); } catch (_) {}
    return this.authoredModels;
  },
  selectProfile(name) {
    this.profileName = this.PROFILES[name] ? name : 'default';
    this.profile = this.PROFILES[this.profileName];
    this.dprCap = this.profile.dprCap;
    this.renderScale = Math.min(this.renderScale, this.profile.renderScaleCap);
    this.maxLights = Math.min(this.maxLights, this.profile.maxLights);
    this.gradeEnabled = this.profile.grading && this.gradeEnabled;
    this.shadows = this.profile.pointLightShadows && this.shadows;
    return this.profile;
  },
  // ---- lifecycle ----
  renderer: null, scene: null, cam: null, canvas: null,
  // W/H are CSS coordinates (and remain aliases for callers doing picking).
  // renderW/renderH are the actual WebGL backing dimensions.
  W: 0, H: 0, cssW: 0, cssH: 0, renderW: 0, renderH: 0,
  dprCap: 2, renderScale: 1, effectivePixelRatio: 1,
  ready: false,
  initializationStatus: { ok: false, status: 'not-initialized', code: 'not-initialized', phase: 'renderer' },

  // camera state, kept compatible with the old Cam prefs so saved settings
  // and the existing keybinds keep working
  MODE_ELEVATED: 'elevated', MODE_FREE: 'free',
  mode: 'elevated',
  yaw: Math.PI * 0.25,      // classic 45° — the D2 look
  pitch: 0.615,
  dist: 24,
  zoom: 1,
  fov: 48,

  // ---- the two presets ----
  //
  // There is ONE camera. A preset is nothing but a set of values written into
  // it — yaw, pitch, distance, zoom and lens. `locked` means the player's orbit
  // and zoom inputs are refused while it is active, so the view cannot drift
  // off the preset and does not have to be dragged back to it every frame.
  //
  // ELEVATED mocks isometric with a LONG LENS. A perspective projection
  // converges toward a parallel one as the field of view narrows and the camera
  // pulls back; holding 2·dist·tan(fov/2) constant keeps the framing identical
  // while the divergence collapses. At 48° from 30 units a near object images
  // three times the size of an equally sized far one across the visible depth;
  // at 14° from 109 that ratio falls to about 1.3, which reads as isometric
  // without a second projection, a second camera, or a second render path.
  //
  // True isometric elevation is atan(1/sqrt(2)) — 35.26° — which is what the
  // pitch below is, rather than a number picked by eye.
  PRESETS: {
    elevated: {
      yaw: Math.PI * 0.25,
      pitch: Math.atan(1 / Math.SQRT2),
      dist: 108.8,
      zoom: 1,
      fov: 14,
      locked: true,
    },
    free: { dist: 24, fov: 48, locked: false },
  },

  locked() { return !!(this.PRESETS[this.mode] || {}).locked; },
  ZOOM_MIN: 0.4, ZOOM_MAX: 3.2,
  PITCH_MIN: 0.12, PITCH_MAX: 1.45,
  focus: { x: 0, y: 0, z: 0 },

  // quality knobs, driven by the settings UI
  shadows: true,
  maxLights: 8,             // profiled high default; 12 is reserved for ultra
  mood: 'spooky',
  heroLightMul: 0.42,
  gradeEnabled: true,
  grade: null,
  _target: null, _postScene: null, _postCam: null, _postMat: null,
  _sceneCounters: null, _frameCounters: null,
  _gpu: { supported: false, status: 'unsupported', ms: null, ext: null, active: null, pending: [] },
  _contextLost: false,
  _contextLosses: 0,
  onContextLost: null,
  onContextRestoring: null,

  init(canvas) {
    if (typeof THREE === 'undefined') {
      this.initializationStatus = { ok: false, status: 'initialization-error', code: 'three-unavailable', phase: 'renderer' };
      console.error('[R3] three.js not loaded');
      return false;
    }
    this.canvas = canvas;
    const config = typeof GraphicsConfig !== 'undefined' ? GraphicsConfig.current : {};
    let storedProfile = config.profile || 'default';
    // Retain the old session escape hatch for links/bookmarks from older builds.
    try { storedProfile = sessionStorage.getItem(this.PROFILE_SESSION_KEY) || storedProfile; } catch (_) {}
    const profile = this.selectProfile(storedProfile);
    this.dprCap = config.dprCap === undefined ? profile.dprCap : config.dprCap;
    this.renderScale = Math.min(config.renderScale === undefined ? 1 : config.renderScale, profile.renderScaleCap);
    this.shadows = config.shadows !== false && profile.pointLightShadows;
    this.maxLights = Math.min(config.lightBudget === undefined ? profile.maxLights : config.lightBudget, profile.maxLights);
    this.gradeEnabled = config.grading !== false && profile.grading;
    this.gpuTimersEnabled = config.gpuTimers !== false;
    this.authoredModels = profile.authoredModels !== false;
    try {
      const storedModels = localStorage.getItem(this.AUTHORED_MODELS_KEY);
      if (storedModels !== null) this.authoredModels = JSON.parse(storedModels) !== false;
    } catch (_) {}
    const attempts = this.profileName === 'default' ? [
      { antialias: config.antialias === undefined ? profile.antialias : config.antialias,
        powerPreference: config.powerPreference || 'high-performance' },
      { antialias: false, powerPreference: null },
      { antialias: false, powerPreference: 'low-power' },
    ] : [
      { antialias: false, powerPreference: null },
      { antialias: false, powerPreference: 'low-power' },
    ];
    const failures = [];
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      if (i) {
        // Browsers may permanently associate a canvas with the context type
        // requested by a constructor even when that constructor throws.
        const replacement = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(replacement, canvas);
        canvas = replacement;
      }
      const options = { canvas, antialias: attempt.antialias, alpha: false };
      if (attempt.powerPreference) options.powerPreference = attempt.powerPreference;
      try {
        if (config.webglVersion === 1 || config.webglVersion === 2) {
          const contextName = config.webglVersion === 2 ? 'webgl2' : 'webgl';
          const contextOptions = Object.assign({}, options); delete contextOptions.canvas;
          const context = canvas.getContext(contextName, contextOptions);
          if (!context) throw new Error('Requested ' + contextName + ' context is unavailable');
          options.context = context;
        }
        this.renderer = new THREE.WebGLRenderer(options);
        this.canvas = canvas;
        const webglVersion = this.renderer.capabilities && this.renderer.capabilities.isWebGL2 ? 2 : 1;
        this.initializationStatus = {
          ok: true, status: 'ready', code: 'ready', phase: 'renderer',
          requestedProfile: this.profileName,
          antialias: attempt.antialias,
          powerPreference: attempt.powerPreference || 'default',
          webglVersion,
        };
        break;
      } catch (error) {
        failures.push({
          antialias: attempt.antialias,
          powerPreference: attempt.powerPreference || 'default',
          error: error && error.message ? error.message : String(error),
        });
      }
    }
    if (!this.renderer) {
      // A failed constructor may have touched the canvas before throwing. Do
      // not leave any of our state looking usable to callers or recovery code.
      this.renderer = null;
      this.scene = this.cam = this.canvas = null;
      this._target = this._postScene = this._postCam = this._postMat = null;
      this.ready = false;
      this.initializationStatus = {
        ok: false, status: 'initialization-error',
        code: 'webgl-renderer-construction-failed', phase: 'renderer',
        requestedProfile: this.profileName, attempts: failures,
      };
      console.error('[R3] WebGL renderer initialization failed', failures);
      return false;
    }
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    // Keep the counters across the world and grade renders so callers can
    // snapshot both boundaries. We reset explicitly once per frame.
    this.renderer.info.autoReset = false;
    this._bindContextEvents();
    this._initGpuTimer();

    this.scene = new THREE.Scene();

    // One texture lookup is enough for the deliberately restrained grade.
    // Keeping it here (rather than tinting hundreds of materials) also makes
    // the setting instant and leaves the sRGB output conversion intact.
    this._target = this.gradeEnabled ? new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true,
    }) : null;
    this._postScene = this.gradeEnabled ? new THREE.Scene() : null;
    this._postCam = this.gradeEnabled ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) : null;
    this._postMat = this.gradeEnabled ? new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this._target.texture }, top: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() }, amount: { value: 0 }, vignette: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `uniform sampler2D map; uniform vec3 top; uniform vec3 bottom;
        uniform float amount; uniform float vignette; varying vec2 vUv;
        void main(){ vec4 c=texture2D(map,vUv); vec3 tint=mix(bottom,top,vUv.y);
          c.rgb=mix(c.rgb,c.rgb*tint*1.45,amount);
          float edge=smoothstep(0.82,0.25,length(vUv-0.5));
          c.rgb*=mix(1.0,edge,vignette); gl_FragColor=c; }`,
      depthTest: false, depthWrite: false,
    }) : null;
    if (this._postScene) this._postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._postMat));

    this.perspCam = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.cam = this.perspCam;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ready = true;
    return true;
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.renderScale;
    this.W = this.cssW = w; this.H = this.cssH = h;
    this.effectivePixelRatio = ratio;
    this.renderW = Math.max(1, Math.floor(w * ratio));
    this.renderH = Math.max(1, Math.floor(h * ratio));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    if (this._target) this._target.setSize(this.renderW, this.renderH);
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
  },

  setRenderScale(scale, resize = true) {
    const cap = this.profile ? this.profile.renderScaleCap : 1;
    const next = Math.max(0.25, Math.min(cap, Number(scale) || 1));
    if (Math.abs(next - this.renderScale) < 0.001) return;
    this.renderScale = next;
    if (resize && this.renderer) this.resize();
  },

  // Apply a preset to the one camera. The lens is a camera property, not a
  // second camera: swapping it is exactly what changing lenses is.
  setMode(m) {
    this.mode = m;
    this.cam = this.perspCam;
    const p = this.PRESETS[m] || this.PRESETS.free;
    this.dist = p.dist;
    this.fov = p.fov;
    if (this.perspCam.fov !== p.fov) {
      this.perspCam.fov = p.fov;
      this.perspCam.updateProjectionMatrix();
    }
    if (p.locked) { this.yaw = p.yaw; this.pitch = p.pitch; this.zoom = p.zoom; }
  },
  cycleMode() { this.setMode(this.mode === this.MODE_ELEVATED ? this.MODE_FREE : this.MODE_ELEVATED); },

  // Every way the rig can be moved refuses while a preset is locked. Refusing
  // at the input boundary is the point: the previous arrangement let input
  // through and re-pinned the yaw once a frame, so a drag visibly shoved the
  // camera and it sprang back.
  orbit(dYaw, dPitch) {
    if (this.locked()) return false;
    this.yaw += dYaw;
    this.pitch = U.clamp(this.pitch + dPitch, this.PITCH_MIN, this.PITCH_MAX);
    return true;
  },
  adjustZoom(delta) {
    if (this.locked()) return false;
    this.zoom = U.clamp(this.zoom * (1 + delta), this.ZOOM_MIN, this.ZOOM_MAX);
    return true;
  },
  setZoom(z) {
    if (this.locked()) return false;
    this.zoom = U.clamp(z, this.ZOOM_MIN, this.ZOOM_MAX);
    return true;
  },
  // The frame loop pushes the player's camera intent in here each tick; a
  // locked preset owns the rig and ignores it.
  setOrientation(yaw, pitch) {
    if (this.locked()) return false;
    this.yaw = yaw;
    this.pitch = U.clamp(pitch, this.PITCH_MIN, this.PITCH_MAX);
    return true;
  },

  // Point the rig at a world position (game x/y -> world x/z).
  lookAt(x, y, lerp) {
    const tx = x, tz = y;
    if (lerp) {
      this.focus.x += (tx - this.focus.x) * lerp;
      this.focus.z += (tz - this.focus.z) * lerp;
    } else { this.focus.x = tx; this.focus.z = tz; }
  },

  updateCamera() {
    // No mode branch: both presets are the same rig reading the same fields.
    const d = this.dist / this.zoom;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const c = this.cam;
    c.position.set(
      this.focus.x + cp * cy * d,
      this.focus.y + sp * d,
      this.focus.z + cp * sy * d,
    );
    c.up.set(0, 1, 0);
    c.lookAt(this.focus.x, this.focus.y, this.focus.z);
  },

  // Screen -> world on the ground plane (y = 0). Replaces the hand-rolled
  // inverse projection the 2D renderer needed for mouse picking.
  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return [hit.x, hit.z];
  },

  // World -> screen, for nameplates, damage numbers and the target reticle,
  // all of which stay as DOM/2D overlays.
  worldToScreen(x, y, h) {
    const v = new THREE.Vector3(x, h || 0, y);
    v.project(this.cam);
    return [(v.x * 0.5 + 0.5) * this.W, (-v.y * 0.5 + 0.5) * this.H, v.z];
  },

  // Movement basis: which way is "up the screen", and which way is right.
  //
  // Derived from `yaw` rather than read off the camera's world matrix. That
  // matrix is only refreshed inside render(), and input is sampled before the
  // frame is drawn — so reading it gave a basis that was either a frame stale
  // or, on the very first update, the identity, which is a movement direction
  // of nothing at all.
  //
  // updateCamera() places the camera at focus + (cos·cosYaw, sin, cos·sinYaw)·d
  // looking back at focus, so its horizontal forward is exactly -(cosYaw, sinYaw)
  // and right is forward × up. No matrix, nothing to fall behind.
  screenBasis() {
    const fx = -Math.cos(this.yaw), fz = -Math.sin(this.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  },

  _counterSnapshot() {
    const r = this.renderer && this.renderer.info.render;
    return {
      calls: r ? r.calls : 0, triangles: r ? r.triangles : 0,
      points: r ? r.points : 0, lines: r ? r.lines : 0,
    };
  },

  // A WebGL context can be lost and restored at any time, and every GL object
  // made against the old one dies with it. Nothing here handled that, and the
  // GPU timer is the part that notices hardest: it holds an extension object
  // and a queue of query objects across frames.
  //
  // The symptom was a permanently white world. After a loss, `_pollGpuTimer`
  // kept asking the NEW context about the OLD extension and the OLD queries —
  // `INVALID_ENUM: EXT_disjoint_timer_query_webgl2 not enabled` and
  // `INVALID_OPERATION: getQueryParameter: object does not belong to this
  // context` — every frame, forever. A sustained GL error flood is itself
  // enough to lose the context again, so the game never recovered: lost,
  // restored, immediately faulted, lost.
  //
  // three.js calls preventDefault() on the loss event, so restoration is
  // already possible and it re-uploads scene resources itself. What was
  // missing is dropping OUR stale handles, which must happen without touching
  // the dead context.
  _bindContextEvents() {
    const canvas = this.renderer && this.renderer.domElement;
    if (!canvas || this._contextBound) return;
    this._contextBound = true;
    canvas.addEventListener('webglcontextlost', () => {
      // The next page load must start cheaply rather than immediately asking
      // the same GPU/driver for the configuration that it just failed to run.
      try { sessionStorage.setItem(this.PROFILE_SESSION_KEY, 'conservative'); } catch (_) {}
      this._contextLost = true;
      this._contextLosses++;
      if (this.onContextLost) this.onContextLost(this._contextLosses);
      // Discard, never delete: the objects belong to a context that is gone,
      // and calling deleteQuery on them is one more invalid operation.
      this._gpu = { supported: false, status: 'context-lost', ms: null,
        ext: null, active: null, pending: [] };
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // Keep submission paused while Render reapplies its independent context-
      // loss caps. Resizing after that callback recreates both the renderer
      // backing store and the post target at the degraded dimensions.
      if (this.onContextRestoring) this.onContextRestoring(this._contextLosses);
      this.resize();
      // three.js normally rebuilds programs on restoration. Mark every scene
      // material explicitly as well, including the post material, so custom
      // shaders cannot retain a program compiled against the dead context.
      if (this.scene) this.scene.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material) material.needsUpdate = true;
      });
      if (this._postMat) this._postMat.needsUpdate = true;
      // If the context has died repeatedly, stop timing. GPU timer queries are
      // a diagnostic; they are not worth a chance of taking the renderer down
      // with them, and a machine that has lost the context twice has told us
      // something about its driver.
      if (this._contextLosses >= 2) {
        this._gpu = { supported: false, status: 'disabled-after-context-loss',
          ms: null, ext: null, active: null, pending: [] };
      } else {
        this._initGpuTimer();
      }
      // This is deliberately last: render() refuses to submit until sizing,
      // post-processing, and material invalidation have all completed.
      this._contextLost = false;
    });
  },

  _lost() {
    if (this._contextLost) return true;
    const gl = this.renderer && this.renderer.getContext();
    return !gl || gl.isContextLost();
  },

  _initGpuTimer() {
    if (this.gpuTimersEnabled === false) {
      this._gpu = { supported: false, status: 'disabled', ms: null, ext: null, active: null, pending: [] };
      return;
    }
    const gl = this.renderer && this.renderer.getContext();
    if (!gl || gl.isContextLost()) {
      this._gpu = { supported: false, status: 'context-lost', ms: null, ext: null, active: null, pending: [] };
      return;
    }
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this._gpu = { supported: !!ext, status: ext ? 'pending' : 'unsupported',
      ms: null, ext, active: null, pending: [] };
  },

  _pollGpuTimer() {
    const gpu = this._gpu;
    if (!gpu.supported || !gpu.ext || this._lost()) return;
    const gl = this.renderer.getContext();
    if (gl.getParameter(gpu.ext.GPU_DISJOINT_EXT)) {
      for (const q of gpu.pending) gl.deleteQuery(q);
      gpu.pending.length = 0; gpu.ms = null; gpu.status = 'disjoint';
      return;
    }
    // Availability polling is explicitly asynchronous. Never substitute
    // gl.finish(), readPixels(), or a blocking QUERY_RESULT request.
    while (gpu.pending.length && gl.getQueryParameter(gpu.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = gpu.pending.shift();
      gpu.ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gpu.status = 'available';
      gl.deleteQuery(q);
    }
  },

  render(onBoundary) {
    if (!this.ready) return;
    // Drawing into a dead context produces nothing but errors, and the errors
    // are what keep killing it. Skip the frame; the restore handler will bring
    // the renderer back.
    if (this._lost()) return;
    this.updateCamera();
    this._pollGpuTimer();
    const gl = this.renderer.getContext(), gpu = this._gpu;
    if (gpu.supported && gpu.ext && !gpu.active && gpu.pending.length < 2) {
      gpu.active = gl.createQuery();
      gl.beginQuery(gpu.ext.TIME_ELAPSED_EXT, gpu.active);
    }
    this.renderer.info.reset();
    const gradeActive = !!(this.gradeEnabled && this.grade && this._postMat);
    if (gradeActive) {
      const u = this._postMat.uniforms;
      u.top.value.set(this.grade[0]); u.bottom.value.set(this.grade[1]);
      u.amount.value = this.grade[2]; u.vignette.value = Math.min(0.22, this.grade[2] * 1.15);
      this.renderer.setRenderTarget(this._target);
      this.renderer.render(this.scene, this.cam);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.cam);
    }
    this._sceneCounters = this._counterSnapshot();
    if (onBoundary) onBoundary('scene', this._sceneCounters);
    if (gradeActive) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this._postScene, this._postCam);
    }
    this._frameCounters = this._counterSnapshot();
    if (onBoundary) onBoundary('frame', this._frameCounters);
    if (gpu.active && gpu.ext && !this._lost()) {
      gl.endQuery(gpu.ext.TIME_ELAPSED_EXT);
      gpu.pending.push(gpu.active); gpu.active = null;
    }
  },

  // ---- scene helpers ----
  clear() {
    if (!this.scene) return;
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const o = this.scene.children[i];
      this.scene.remove(o);
      o.traverse && o.traverse(n => {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
          else n.material.dispose();
        }
      });
    }
  },

  stats() {
    const frame = this._frameCounters || this._counterSnapshot();
    const scene = this._sceneCounters || frame;
    const gradeActive = !!(this.gradeEnabled && this.grade && this._postMat);
    return {
      profile: this.profileName,
      authoredModels: this.authoredModels,
      reducedLighting: !!(this.profile && this.profile.reducedLighting),
      pointLightShadows: !!(this.profile && this.profile.pointLightShadows),
      mode: this.mode, yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3),
      zoom: +this.zoom.toFixed(2), ortho: false,
      framebuffer: { width: this.renderW, height: this.renderH },
      effectiveDpr: +this.effectivePixelRatio.toFixed(3),
      dpr: +this.effectivePixelRatio.toFixed(3), renderScale: this.renderScale,
      calls: frame.calls, triangles: frame.triangles, tris: frame.triangles,
      points: frame.points, lines: frame.lines,
      scene: Object.assign({}, scene), frame: Object.assign({}, frame),
      shadows: !!(this.shadows && this.renderer && this.renderer.shadowMap.enabled),
      grade: gradeActive,
      lightBudget: this.maxLights,
      gpu: { supported: this._gpu.supported, status: this._gpu.status,
        ms: this._gpu.ms === null ? null : +this._gpu.ms.toFixed(3),
        contextLosses: this._contextLosses },
      objects: this.scene ? this.scene.children.length : 0,
    };
  },
};
