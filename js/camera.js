// ============ DIABLOID: camera.js — perspective, zoom, yaw, pitch ============
// Two presets share one perspective projection:
//   ELEVATED      — a fixed high-angle dungeon overview
//   THIRD PERSON  — camera swings in behind the hero, follows their facing,
//                   pulls closer and drops its pitch toward the horizon
// Projection: screen = P(pitch,zoom) · R(yaw) · (world - focus)
'use strict';

const Cam = {
  MODES: ['elevated', 'third'],
  mode: 'elevated',

  yaw: 0, yawTarget: 0,          // radians, world rotation about the focus
  zoom: 1, zoomTarget: 1,        // 1 = classic scale
  pitch: 0.5, pitchTarget: 0.5,  // screenY/screenX unit ratio; 0.5 = classic dimetric
  fx: 0, fy: 0,                  // focus point in world space (smoothed)
  shx: 0, shy: 0,                // screen shake offset

  // per-mode saved preferences
  prefs: {
    elevated: { zoom: 1.0, pitch: 0.72 },
    third: { zoom: 1.6, pitch: 0.40 },
  },
  ZOOM_MIN: 0.55, ZOOM_MAX: 2.8,
  PITCH_MIN: 0.22, PITCH_MAX: 0.85,
  orbitSpeed: 2.2,    // radians/second while a rotate key is held

  KEY: 'cam_v1',

  init() {
    const s = this._load();
    if (s) {
      // cam_v1 formerly persisted `iso`; deliberately migrate it rather than
      // leaving a removed mode (or its orthographic pitch) active.
      this.mode = s.mode === 'third' ? 'third' : 'elevated';
      if (s.prefs) {
        if (s.prefs.third) this.prefs.third = Object.assign(this.prefs.third, s.prefs.third);
        if (s.prefs.elevated) this.prefs.elevated = Object.assign(this.prefs.elevated, s.prefs.elevated);
      }
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
    if (this.mode === 'elevated') this.yawTarget = Math.PI * 0.25;
    if (instant) { this.zoom = this.zoomTarget; this.pitch = this.pitchTarget; this.yaw = this.yawTarget; }
  },

  setMode(m) {
    if (!this.MODES.includes(m) || m === this.mode) return;
    this.mode = m;
    this.applyPrefs(false);
    this.save();
    if (typeof UI !== 'undefined')
      UI.announce(m === 'third' ? 'Third-person camera' : 'Elevated camera', '#8fc8ff', 1600);
  },
  cycleMode() { this.setMode(this.mode === 'elevated' ? 'third' : 'elevated'); },

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
  // The elevated preset is fixed; third person turns freely.
  rotate(dir) {
    if (this.mode === 'third') {
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
    if (this.mode === 'elevated') this.yawTarget = Math.PI * 0.25;

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
    // Retained for the pre-WebGL input fallback below; these are not a world
    // projection and carry no pixel-unit contract.
    this.cos = Math.cos(this.yaw); this.sin = Math.sin(this.yaw);
  },

};
