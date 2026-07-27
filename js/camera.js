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
  follow: 2.4,        // third-person: how far the focus leads ahead of the hero
  turnRate: 3.2,      // third-person yaw tracking speed
  snap: false,        // iso mode: keep yaw locked to 0

  KEY: 'cam_v1',

  init() {
    const s = this._load();
    if (s) {
      this.mode = s.mode || 'iso';
      if (s.prefs) this.prefs = Object.assign(this.prefs, s.prefs);
      this.follow = s.follow !== undefined ? s.follow : this.follow;
    }
    this.applyPrefs(true);
  },
  _load() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify({ mode: this.mode, prefs: this.prefs, follow: this.follow })); } catch (e) {}
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
  // manual yaw nudge — allowed in both modes; iso snaps back to axis-aligned
  rotate(dir) {
    if (this.mode === 'iso') {
      this.yawTarget = Math.round((this.yawTarget + dir * Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
    } else {
      this.yawTarget += dir * Math.PI / 4;
      this.manualT = 2.5; // pause auto-follow briefly after a manual turn
    }
  },
  manualT: 0,

  // ---------------- per-frame ----------------
  update(dt, pl) {
    if (!pl) return;
    // focus: hero, nudged forward in third person so more of the view is ahead
    let tfx = pl.x, tfy = pl.y;
    if (this.mode === 'third') {
      tfx += Math.cos(pl.dir) * this.follow * 0.35;
      tfy += Math.sin(pl.dir) * this.follow * 0.35;
      if (this.manualT > 0) this.manualT -= dt;
      else {
        // swing behind the hero: their facing should point up-screen
        this.yawTarget = 5 * Math.PI / 4 - pl.dir;
      }
    } else this.yawTarget = Math.round(this.yawTarget / (Math.PI / 2)) * (Math.PI / 2);

    // focus easing (snappier in iso so the classic view feels locked)
    const fk = this.mode === 'third' ? 1 - Math.pow(0.0006, dt) : 1;
    this.fx += (tfx - this.fx) * fk;
    this.fy += (tfy - this.fy) * fk;
    if (!isFinite(this.fx)) { this.fx = pl.x; this.fy = pl.y; }

    // yaw takes the short way round
    let dy = this.yawTarget - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * (this.mode === 'third' ? this.turnRate : 7));
    while (this.yaw > Math.PI * 2) { this.yaw -= Math.PI * 2; this.yawTarget -= Math.PI * 2; }
    while (this.yaw < -Math.PI * 2) { this.yaw += Math.PI * 2; this.yawTarget += Math.PI * 2; }

    const k = 1 - Math.pow(0.002, dt);
    this.zoom += (this.zoomTarget - this.zoom) * k;
    this.pitch += (this.pitchTarget - this.pitch) * k;

    // cached projection scalars
    this.cos = Math.cos(this.yaw); this.sin = Math.sin(this.yaw);
    this.ux = ISO_X * this.zoom;             // screen-x per rotated world unit
    this.uy = ISO_X * this.zoom * this.pitch; // screen-y per rotated world unit
    this.rotated = Math.abs(this.sin) > 0.0015 || Math.abs(this.cos - 1) > 0.0015;
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

  // Transform mapping a base-projected tile sprite into the current view.
  // Derived from  T = P(zoom,pitch)·R(yaw)·P(1,0.5)⁻¹  so pre-baked diamond
  // tiles stay pixel-correct under arbitrary rotation.
  tileMatrix() {
    const z = this.zoom, p = this.pitch, c = this.cos, s = this.sin;
    return [c * z, s * z * p * 2, -s * z * 2, c * z * p * 2];
  },

  // how far (in tiles) the visible frustum reaches from the focus
  // Half-extent of the visible region, in tiles. The screen maps to a box in
  // rotated space; unrotating it can grow the bound by at most sqrt(2).
  viewRadius(W, H) {
    const half = (W / (this.ux * 2) + H / (this.uy * 2)) * 0.5;
    return Math.min(52, Math.ceil(half * 1.415 + 3));
  },
};
