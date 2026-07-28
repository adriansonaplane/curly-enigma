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
  // ---- lifecycle ----
  renderer: null, scene: null, cam: null, canvas: null,
  W: 0, H: 0, dpr: 1,
  ready: false,

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
  maxLights: 12,            // WebGL has a real cost per light; nearest-N wins
  mood: 'spooky',
  heroLightMul: 0.42,
  gradeEnabled: true,
  grade: null,
  _target: null, _postScene: null, _postCam: null, _postMat: null,

  init(canvas) {
    if (typeof THREE === 'undefined') {
      console.error('[R3] three.js not loaded');
      return false;
    }
    this.canvas = canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();

    // One texture lookup is enough for the deliberately restrained grade.
    // Keeping it here (rather than tinting hundreds of materials) also makes
    // the setting instant and leaves the sRGB output conversion intact.
    this._target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true,
    });
    this._postScene = new THREE.Scene();
    this._postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._postMat = new THREE.ShaderMaterial({
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
    });
    this._postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._postMat));

    this.perspCam = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.cam = this.perspCam;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ready = true;
    return true;
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    if (this._target) this._target.setSize(Math.floor(w * this.dpr), Math.floor(h * this.dpr));
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
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

  render() {
    if (!this.ready) return;
    this.updateCamera();
    if (this.gradeEnabled && this.grade && this._postMat) {
      const u = this._postMat.uniforms;
      u.top.value.set(this.grade[0]); u.bottom.value.set(this.grade[1]);
      u.amount.value = this.grade[2]; u.vignette.value = Math.min(0.22, this.grade[2] * 1.15);
      this.renderer.setRenderTarget(this._target);
      this.renderer.render(this.scene, this.cam);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this._postScene, this._postCam);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.cam);
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
    const r = this.renderer ? this.renderer.info.render : null;
    return {
      mode: this.mode, yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3),
      zoom: +this.zoom.toFixed(2), ortho: false,
      calls: r ? r.calls : 0, tris: r ? r.triangles : 0,
      objects: this.scene ? this.scene.children.length : 0,
    };
  },
};
