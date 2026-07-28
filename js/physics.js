// ============ DIABLOID: physics.js — debris, ragdolls, impulses ============
// A light rigid-body layer: chunks fly, tumble, bounce off floors and walls,
// skid to a stop under friction, splash in water and burn up in lava. Corpses
// ragdoll along the blow that killed them, and explosions shove everything.
'use strict';

const Physics = {
  debris: [],
  MAX: 300,
  GRAV: 340,          // px/s² on the vertical axis
  enabled: true,

  // ---------------- spawning ----------------
  MATS: {
    wood:  { col: ['#7a5a34', '#5a3f26', '#8a6a44'], rest: 0.34, fric: 3.6, sfx: null },
    stone: { col: ['#6a655c', '#4c4740', '#807a70'], rest: 0.22, fric: 5.0, sfx: null },
    clay:  { col: ['#8a6a4a', '#6a4a2e', '#a08464'], rest: 0.26, fric: 4.4, sfx: null },
    bone:  { col: ['#cfc8b0', '#a8a28f', '#e0dac4'], rest: 0.3, fric: 4.0, sfx: null },
    metal: { col: ['#b8bcc4', '#8a8f98', '#d8dce4'], rest: 0.42, fric: 3.0, sfx: null },
    glass: { col: ['#9fd8e8', '#6aa8c0', '#d8f4ff'], rest: 0.5, fric: 2.4, sfx: null },
    cloth: { col: ['#7a1f1f', '#5a1414', '#9a3030'], rest: 0.05, fric: 8.0, sfx: null },
    gore:  { col: ['#8a1414', '#5a0c0c', '#b02020'], rest: 0.12, fric: 6.5, sfx: null },
  },

  spawn(x, y, z, mat, opts = {}) {
    if (!this.enabled || this.debris.length >= this.MAX) return null;
    const M = this.MATS[mat] || this.MATS.stone;
    const a = opts.ang !== undefined ? opts.ang : U.rand() * Math.PI * 2;
    const s = opts.speed !== undefined ? opts.speed : U.rf(U.rand, 1.2, 4.2);
    const d = {
      x, y, z,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      vz: opts.vz !== undefined ? opts.vz : U.rf(U.rand, 30, 105),
      ang: U.rand() * Math.PI * 2,
      spin: U.rf(U.rand, -13, 13),
      size: opts.size || U.rf(U.rand, 2.2, 5),
      col: U.pick(U.rand, M.col),
      rest: M.rest, fric: M.fric,
      shape: opts.shape || (mat === 'wood' ? 'plank' : mat === 'glass' ? 'shard' : 'chunk'),
      life: opts.life || U.rf(U.rand, 9, 15),
      big: !!opts.big,
      settled: false,
    };
    this.debris.push(d);
    return d;
  },

  burst(x, y, mat, n, opts = {}) {
    for (let i = 0; i < n; i++) this.spawn(x, y, opts.z || U.rf(U.rand, 4, 16), mat, opts);
  },

  // radial shove applied to debris, ragdolling corpses and loose props
  impulse(x, y, r, power) {
    for (const d of this.debris) {
      const dist = U.dist(d.x, d.y, x, y);
      if (dist > r) continue;
      const f = (1 - dist / r) * power;
      const a = U.angleTo(x, y, d.x, d.y);
      d.vx += Math.cos(a) * f; d.vy += Math.sin(a) * f;
      d.vz += f * 16; d.spin += U.rf(U.rand, -1, 1) * f * 3;
      d.settled = false;
    }
    for (const m of G.monsters) {
      if (!m.rag) continue;
      const dist = U.dist(m.x, m.y, x, y);
      if (dist > r) continue;
      const f = (1 - dist / r) * power;
      const a = U.angleTo(x, y, m.x, m.y);
      m.rag.vx += Math.cos(a) * f * 0.6; m.rag.vy += Math.sin(a) * f * 0.6;
      m.rag.vz += f * 14; m.rag.spin += U.rf(U.rand, -1, 1) * f * 0.5;
    }
    if (G.map) for (const pr of G.map.props) {
      if (!pr.loose) continue;
      const dist = U.dist(pr.x, pr.y, x, y);
      if (dist > r) continue;
      const f = (1 - dist / r) * power;
      const a = U.angleTo(x, y, pr.x, pr.y);
      pr.vx = (pr.vx || 0) + Math.cos(a) * f * 0.5;
      pr.vy = (pr.vy || 0) + Math.sin(a) * f * 0.5;
      pr.vz = (pr.vz || 0) + f * 10;
      pr.spin = (pr.spin || 0) + U.rf(U.rand, -1, 1) * f;
    }
  },

  // corpses fall along the blow that felled them
  ragdoll(m, ang, power) {
    if (!this.enabled) { return; }
    m.rag = {
      ang: 0, spin: U.rf(U.rand, -5, 5) + power * 0.35,
      z: 0, vz: U.rf(U.rand, 24, 62) * (0.6 + power * 0.12),
      vx: Math.cos(ang) * power * 0.5, vy: Math.sin(ang) * power * 0.5,
      fall: U.rand() < 0.5 ? -1 : 1, rest: 0.2,
    };
  },

  // ---------------- integration ----------------
  blocked(x, y) {
    const map = G.map;
    if (!map) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return map.t[ty * map.w + tx] === TILE.WALL;
  },
  hazAt(x, y) {
    const map = G.map;
    if (!map) return 0;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
    return map.haz[ty * map.w + tx];
  },

  // shared body integrator: gravity, ground bounce, wall reflection, friction
  integrate(b, dt, opts = {}) {
    b.vz -= this.GRAV * dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (this.blocked(nx, b.y)) { b.vx *= -0.42; b.spin = (b.spin || 0) * -0.5; } else b.x = nx;
    if (this.blocked(b.x, ny)) { b.vy *= -0.42; b.spin = (b.spin || 0) * -0.5; } else b.y = ny;
    b.z += b.vz * dt;
    if (b.ang !== undefined) b.ang += (b.spin || 0) * dt;

    if (b.z <= 0) {
      b.z = 0;
      const hz = this.hazAt(b.x, b.y);
      const impact = -b.vz;
      if (hz === HAZ.WATER && impact > 40 && !b.splashed) {
        b.splashed = true;
        FX.ripple(b.x, b.y);
        for (let i = 0; i < 4; i++)
          FX.push({ x: b.x, y: b.y, z: 2, vx: U.rf(U.rand, -0.8, 0.8), vy: U.rf(U.rand, -0.8, 0.8), vz: U.rf(U.rand, 20, 46), life: 0.5, maxLife: 0.5, color: '#9fc8e8', size: 1.6, add: true, grav: 190 });
        b.vx *= 0.25; b.vy *= 0.25; b.vz = 0;
        b.life = Math.min(b.life !== undefined ? b.life : 2, 1.2);
        return;
      }
      if (hz === HAZ.LAVA) {
        FX.spark(b.x, b.y, '#ff8a2f', 4);
        b.life = 0;
        return;
      }
      if (impact > 24) {
        b.vz = impact * (b.rest !== undefined ? b.rest : 0.25);
        b.vx *= 0.72; b.vy *= 0.72;
        b.spin = (b.spin || 0) * 0.55;
      } else {
        b.vz = 0;
        // rolling friction until it settles
        const f = Math.max(0, 1 - (b.fric || 4) * dt);
        b.vx *= f; b.vy *= f;
        b.spin = (b.spin || 0) * f;
        if (Math.abs(b.vx) + Math.abs(b.vy) < 0.05 && Math.abs(b.spin || 0) < 0.3) {
          b.vx = 0; b.vy = 0; b.spin = 0; b.settled = true;
        }
      }
    }
  },

  step(dt) {
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      if (!d.settled) this.integrate(d, dt);
    }
    // ragdolling corpses
    for (const m of G.monsters) {
      if (!m.rag || !m.dead) continue;
      const r = m.rag;
      const bx = m.x, by = m.y;
      r.x = bx; r.y = by;
      this.integrate(r, dt);
      m.x = r.x; m.y = r.y;
      r.ang = U.clamp(r.ang, -Math.PI / 2, Math.PI / 2);
    }
    // loose props knocked around
    if (G.map) for (const pr of G.map.props) {
      if (!pr.loose || (!pr.vx && !pr.vy && !pr.vz && !pr.z)) continue;
      pr.z = pr.z || 0; pr.vz = pr.vz || 0;
      this.integrate(pr, dt);
      if (pr.settled) { pr.vx = 0; pr.vy = 0; pr.vz = 0; }
    }
  },

  // ---------------- drawing ----------------
  // Small debris is an intentional screen-space overlay. Large pieces are not
  // drawn here; the former legacy painter for them had no runtime caller.
  drawSmall(ctx) {
    for (const d of this.debris) {
      if (d.big) continue;
      const [sx, sy] = Render.worldToScreen(d.x, d.y, d.z);
      if (sx < -30 || sx > Render.W + 30 || sy < -30 || sy > Render.H + 30) continue;
      const fade = d.life < 1.5 ? d.life / 1.5 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(sx, sy);
      ctx.rotate(d.ang);
      ctx.fillStyle = d.col;
      const s = d.size * Cam.zoom;
      if (d.shape === 'plank') ctx.fillRect(-s, -s * 0.34, s * 2, s * 0.68);
      else if (d.shape === 'shard') {
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, s * 0.7); ctx.lineTo(-s * 0.5, s * 0.5); ctx.closePath(); ctx.fill();
      } else ctx.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 1.2);
      ctx.restore();
    }
  },

  clear() { this.debris.length = 0; },
};
