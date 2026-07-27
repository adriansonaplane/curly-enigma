// ============ DIABLOID: camera.js — perspective, zoom, yaw, pitch ============
// Two perspectives share one projection:
//   ISO           — the classic fixed dimetric view (yaw locked to 0)
//   THIRD PERSON  — camera swings in behind the hero, follows their facing,
//                   pulls closer and drops its pitch toward the horizon
// Projection: screen = P(pitch,zoom) · R(yaw) · (world - focus)
'use strict';

const Cam = {
  MODES: ['iso', 'third'],
  mode: 'iso',

  yaw: 0, yawTarget: 0,          // radians, world rotation about the focus
  zoom: 1, zoomTarget: 1,        // 1 = classic scale
  pitch: 0.5, pitchTarget: 0.5,  // screenY/screenX unit ratio; 0.5 = classic dimetric
  fx: 0, fy: 0,                  // focus point in world space (smoothed)
  shx: 0, shy: 0,                // screen shake offset

  // per-mode saved preferences
  prefs: {
    iso:   { zoom: 1.0, pitch: 0.50 },
    third: { zoom: 1.6, pitch: 0.40 },
  },
  ZOOM_MIN: 0.55, ZOOM_MAX: 2.8,
  PITCH_MIN: 0.22, PITCH_MAX: 0.85,
  orbitSpeed: 2.2,    // radians/second while a rotate key is held

  KEY: 'cam_v1',

  init() {
    const s = this._load();
    if (s) {
      this.mode = s.mode || 'iso';
      if (s.prefs) this.prefs = Object.assign(this.prefs, s.prefs);
      this.orbitSpeed = s.orbitSpeed !== undefined ? s.orbitSpeed : this.orbitSpeed;
    }
    this.applyPrefs(true);
  },
  _load() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify({ mode: this.mode, prefs: this.prefs, orbitSpeed: this.orbitSpeed })); } catch (e) {}
  },

  applyPrefs(instant) {
    const p = this.prefs[this.mode];
    this.zoomTarget = p.zoom;
    this.pitchTarget = p.pitch;
    if (this.mode === 'iso') this.yawTarget = 0;
    if (instant) { this.zoom = this.zoomTarget; this.pitch = this.pitchTarget; this.yaw = this.yawTarget; }
  },

  setMode(m) {
    if (!this.MODES.includes(m) || m === this.mode) return;
    this.mode = m;
    this.applyPrefs(false);
    this.save();
    if (typeof UI !== 'undefined')
      UI.announce(m === 'third' ? 'Third-person camera' : 'Isometric camera', '#8fc8ff', 1600);
  },
  cycleMode() { this.setMode(this.mode === 'iso' ? 'third' : 'iso'); },

  adjustZoom(delta) {
    const p = this.prefs[this.mode];
    p.zoom = U.clamp(p.zoom * (1 + delta), this.ZOOM_MIN, this.ZOOM_MAX);
    this.zoomTarget = p.zoom;
    this.save();
  },
  setZoom(z) {
    const p = this.prefs[this.mode];
    p.zoom = U.clamp(z, this.ZOOM_MIN, this.ZOOM_MAX);
    this.zoomTarget = p.zoom;
    this.save();
  },
  setPitch(v) {
    const p = this.prefs[this.mode];
    p.pitch = U.clamp(v, this.PITCH_MIN, this.PITCH_MAX);
    this.pitchTarget = p.pitch;
    this.save();
  },
  // Free orbit around the hero — the camera moves, the world does not.
  orbit(dYaw, dPitch) {
    this.yawTarget += dYaw;
    if (dPitch) this.setPitch(this.prefs[this.mode].pitch + dPitch);
    if (dYaw) this.save();
  },
  // discrete nudge: iso keeps its axis-aligned snap, third person turns freely
  rotate(dir) {
    if (this.mode === 'iso') {
      this.yawTarget = Math.round((this.yawTarget + dir * Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
    } else {
      this.yawTarget += dir * Math.PI / 4;
    }
  },

  // ---------------- per-frame ----------------
  update(dt, pl) {
    if (!pl) return;
    // The orbit is centred on the hero in both modes. Nothing leads ahead of
    // them and nothing tracks their facing, so the world only appears to turn
    // when the player actually asks the camera to turn.
    const tfx = pl.x, tfy = pl.y;
    if (this.mode === 'iso')
      this.yawTarget = Math.round(this.yawTarget / (Math.PI / 2)) * (Math.PI / 2);

    // focus easing — third person lags a touch so movement feels weighty
    const fk = this.mode === 'third' ? 1 - Math.pow(0.0000004, dt) : 1;
    this.fx += (tfx - this.fx) * fk;
    this.fy += (tfy - this.fy) * fk;
    if (!isFinite(this.fx) || !isFinite(this.fy)) { this.fx = pl.x; this.fy = pl.y; }

    // yaw takes the short way round
    let dy = this.yawTarget - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 9);
    while (this.yaw > Math.PI * 2) { this.yaw -= Math.PI * 2; this.yawTarget -= Math.PI * 2; }
    while (this.yaw < -Math.PI * 2) { this.yaw += Math.PI * 2; this.yawTarget += Math.PI * 2; }

    const k = 1 - Math.pow(0.002, dt);
    this.zoom += (this.zoomTarget - this.zoom) * k;
    this.pitch += (this.pitchTarget - this.pitch) * k;

    // cached projection scalars
    this.cos = Math.cos(this.yaw); this.sin = Math.sin(this.yaw);
    this.ux = ISO_X * this.zoom;              // screen-x per rotated world unit
    this.uy = ISO_X * this.zoom * this.pitch; // screen-y per rotated world unit
    this.rotated = Math.abs(this.sin) > 0.0015 || Math.abs(this.cos - 1) > 0.0015;
  },

  // Screen-relative input -> world direction. Undoes the camera yaw so "up
  // the screen" is always away from the viewer, whatever the orbit angle.
  screenToWorldDir(mx, my) {
    const wx = mx + my, wy = my - mx;          // classic iso basis (yaw 0)
    const c = this.cos, s = this.sin;
    return [wx * c + wy * s, -wx * s + wy * c]; // R(-yaw)
  },

  // world -> rotated frame (relative to focus)
  rot(x, y) {
    const dx = x - this.fx, dy = y - this.fy;
    return [dx * this.cos - dy * this.sin, dx * this.sin + dy * this.cos];
  },

  // depth key for painter's-algorithm sorting (screen-Y order)
  depth(x, y) {
    const dx = x - this.fx, dy = y - this.fy;
    return (dx * this.sin + dy * this.cos) + (dx * this.cos - dy * this.sin);
  },

  // Transform mapping a base-projected tile sprite into the current view:
  //   T = P(zoom,pitch) · R(yaw) · P(1, 0.5)⁻¹
  // With ISO_Y = ISO_X/2 this works out to
  //   [ z·cos     -2z·sin  ]
  //   [ z·p·sin    2z·p·cos]
  // returned column-major as [a, b, c, d] for setTransform(a,b,c,d,e,f).
  // Every term must agree exactly with worldToScreen or the floor slides out
  // from under the entities standing on it — see the regression test.
  tileMatrix() {
    const z = this.zoom, p = this.pitch, c = this.cos, s = this.sin;
    return [c * z, s * z * p, -s * z * 2, c * z * p * 2];
  },

  // how far (in tiles) the visible frustum reaches from the focus
  // Half-extent of the visible region, in tiles. The screen maps to a box in
  // rotated space; unrotating it can grow the bound by at most sqrt(2).
  // The cap has to sit above the true visible extent at minimum zoom, or the
  // tile loop stops short of the frustum and the screen corners render empty.
  // Culling inside the loop keeps the cost of the headroom negligible.
  viewRadius(W, H) {
    const half = (W / (this.ux * 2) + H / (this.uy * 2)) * 0.5;
    return Math.min(84, Math.ceil(half * 1.415 + 3));
  },
};
