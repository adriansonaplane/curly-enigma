// ============ DIABLOID: render3d.js — three.js scene, camera, lighting ============
'use strict';

// The 2D isometric renderer baked its projection into a matrix, which is why
// "isometric" and "third person" were two different code paths that disagreed
// with each other. Here isometric is just an ORTHOGRAPHIC CAMERA AT A FIXED
// ANGLE — one camera rig, one set of maths, and the classic look is a preset
// rather than a cage. Free pitch comes for free because nothing is baked.
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
  MODE_ISO: 'iso', MODE_FREE: 'free',
  mode: 'iso',
  yaw: Math.PI * 0.25,      // classic 45° — the D2 look
  pitch: 0.615,             // ~35.26° is true isometric; this is close and reads better
  dist: 24,
  zoom: 1,
  ZOOM_MIN: 0.4, ZOOM_MAX: 3.2,
  PITCH_MIN: 0.12, PITCH_MAX: 1.45,
  focus: { x: 0, y: 0, z: 0 },

  // quality knobs, driven by the settings UI
  shadows: true,
  maxLights: 12,            // WebGL has a real cost per light; nearest-N wins
  mood: 'spooky',
  heroLightMul: 0.42,

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

    // Both cameras exist; the mode picks which one renders. Orthographic is
    // what makes the isometric preset genuinely isometric rather than a
    // perspective camera pretending.
    this.orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.perspCam = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.cam = this.orthoCam;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ready = true;
    return true;
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    this.updateOrtho();
  },

  // Orthographic frustum sized so `zoom` means the same thing it did in 2D:
  // roughly how many tiles fit across the screen.
  updateOrtho() {
    const tilesAcross = 26 / this.zoom;
    const halfW = tilesAcross / 2;
    const halfH = halfW * (this.H / Math.max(1, this.W));
    const c = this.orthoCam;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
  },

  setMode(m) {
    this.mode = m;
    this.cam = (m === this.MODE_ISO) ? this.orthoCam : this.perspCam;
    if (m === this.MODE_ISO) { this.yaw = Math.PI * 0.25; this.pitch = 0.615; }
  },
  cycleMode() { this.setMode(this.mode === this.MODE_ISO ? this.MODE_FREE : this.MODE_ISO); },

  // Free orbit. In iso mode the angles are pinned, so the classic look cannot
  // be knocked askew by a stray drag — that is the whole point of a preset.
  orbit(dYaw, dPitch) {
    if (this.mode === this.MODE_ISO) return false;
    this.yaw += dYaw;
    this.pitch = U.clamp(this.pitch + dPitch, this.PITCH_MIN, this.PITCH_MAX);
    return true;
  },
  adjustZoom(delta) {
    this.zoom = U.clamp(this.zoom * (1 + delta), this.ZOOM_MIN, this.ZOOM_MAX);
    this.updateOrtho();
  },
  setZoom(z) {
    this.zoom = U.clamp(z, this.ZOOM_MIN, this.ZOOM_MAX);
    this.updateOrtho();
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
    const d = this.mode === this.MODE_ISO ? 60 : this.dist / this.zoom;
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

  // Movement basis: which way is "up the screen" given the current yaw. The
  // 2D renderer got this wrong once and inverted the controls; deriving it
  // from the live camera instead of a constant means it cannot drift again.
  screenBasis() {
    const f = new THREE.Vector3();
    this.cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) return { fx: 0, fz: 1, rx: 1, rz: 0 };
    f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  },

  render() {
    if (!this.ready) return;
    this.updateCamera();
    this.renderer.render(this.scene, this.cam);
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
      zoom: +this.zoom.toFixed(2), ortho: this.cam === this.orthoCam,
      calls: r ? r.calls : 0, tris: r ? r.triangles : 0,
      objects: this.scene ? this.scene.children.length : 0,
    };
  },
};
