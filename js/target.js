// ============ DIABLOID: target.js — unit targeting ============
// A modern targeting layer over the whole cast: hostile monsters, your own
// summoned pets, town NPCs and the simulated players who walk Haven's Rest are
// all selectable. Click to focus, click again to cast, Tab to cycle the
// nearest enemies, and every ability respects its own range.
'use strict';

const Target = {
  current: null,      // the focused unit, or null
  hover: null,        // unit under the cursor this frame
  soft: null,         // last thing you hit, shown when nothing is focused
  TAB_RANGE: 14,      // tab only reaches enemies this close
  DROP_RANGE: 34,     // focus is released past here
  outOfRange: false,  // is `current` beyond the primary ability's reach?
  dist: 0,
  _warnT: 0,
  _tabT: 0,

  // ---------------- unit taxonomy ----------------
  // Units come from four different collections and none of them share a base
  // type, so kind is inferred from the shape of the object.
  kindOf(u) {
    if (!u) return null;
    if (u.partyMember) return 'player';
    if (u.sim) return 'player';
    if (u.def && u.def.role) return 'npc';
    if (u.ally) return 'pet';
    return 'monster';
  },
  isHostile(u) { return this.kindOf(u) === 'monster'; },
  isAlive(u) {
    if (!u) return false;
    const k = this.kindOf(u);
    if (k === 'npc') return true;
    if (k === 'player') return u.online !== false && !u.dead;
    return !u.dead;
  },
  nameOf(u) {
    if (!u) return '';
    const k = this.kindOf(u);
    if (k === 'npc') return u.def.name;
    return u.name || u.fam || 'unknown';
  },
  // reticle / frame colour by allegiance
  colorOf(u) {
    return { monster: '#e0402c', pet: '#5fd88a', npc: '#ffd94f', player: '#6aa8ff' }[this.kindOf(u)] || '#cfcfcf';
  },
  // sprite footprint, for hit testing and reticle size
  sizeOf(u) {
    const k = this.kindOf(u);
    if (k === 'monster' || k === 'pet') return u.size || 1;
    return 1;
  },

  // every unit that can currently be focused
  each(fn) {
    for (const m of G.monsters) if (!m.trap) fn(m);
    for (const n of G.npcs) fn(n);
    if (G.map && G.map.town && typeof Social !== 'undefined')
      for (const sp of Social.townSims) fn(sp);
  },

  // ---------------- picking ----------------
  // Screen-space hit test so it stays accurate at any zoom, pitch or orbit.
  pick(sx, sy) {
    let best = null, bd = 1e9;
    this.each(u => {
      if (!this.isAlive(u)) return;
      const [ux, uy] = Render.worldToScreen(u.x, u.y);
      const s = this.sizeOf(u) * Cam.zoom;
      const halfW = 20 * s, top = 52 * s, bottom = 8 * s;
      if (sx < ux - halfW || sx > ux + halfW || sy < uy - top || sy > uy + bottom) return;
      const d = (sx - ux) * (sx - ux) + (sy - uy) * (sy - uy) * 0.4;
      if (d < bd) { bd = d; best = u; }
    });
    return best;
  },

  // ---------------- selection ----------------
  set(u) {
    if (!u || !this.isAlive(u)) return false;
    if (this.current === u) return true;
    this.current = u;
    this.soft = null;
    sfx('ui');
    return true;
  },
  clear() {
    if (this.current) sfx('ui');
    this.current = null;
  },
  // what the target frame should display
  shown() { return this.current || this.soft || this.hover || null; },

  // Tab cycles the nearest enemies in range, in distance order, with line of
  // sight — no reaching through walls.
  tabNext() {
    const pl = G.player;
    if (!pl || this._tabT > 0) return;   // guard against key auto-repeat
    this._tabT = 0.14;
    const list = [];
    this.each(u => {
      if (!this.isHostile(u) || !this.isAlive(u)) return;
      const d = U.dist(pl.x, pl.y, u.x, u.y);
      if (d > this.TAB_RANGE) return;
      if (!Ent.los(pl.x, pl.y, u.x, u.y)) return;
      list.push({ u, d });
    });
    if (!list.length) {
      this.clear();
      UI.announce('No enemies in range', '#8a7444', 900);
      return;
    }
    list.sort((a, b) => a.d - b.d);
    let idx = 0;
    if (this.current) {
      const at = list.findIndex(e => e.u === this.current);
      if (at >= 0) idx = (at + 1) % list.length;   // cycle onward
    }
    this.current = list[idx].u;
    this.soft = null;
    sfx('ui');
  },

  // ---------------- ranges ----------------
  // The point an ability should be aimed at: the focused unit if there is one,
  // otherwise wherever the cursor is pointing.
  aimPoint() {
    const u = this.current;
    if (u && this.isAlive(u)) return [u.x, u.y];
    return [G.mouseWorld[0], G.mouseWorld[1]];
  },

  rangeTo(u) {
    const pl = G.player;
    return u ? U.dist(pl.x, pl.y, u.x, u.y) - this.sizeOf(u) * 0.3 : 0;
  },

  inRangeOf(skId, u) {
    if (!u) return true;
    const r = Ent.skillRange(skId === 'atk' ? null : SKILL_BY_ID[skId], G.player);
    return this.rangeTo(u) <= r;
  },

  warnOutOfRange(skId) {
    if (this._warnT > 0) return;
    this._warnT = 0.55;
    const pl = G.player;
    sfx('nope');
    UI.announce('Out of range', '#ff6a5a', 900);
    UI.dmgNum(pl.x, pl.y, 'out of range', '#ff6a5a');
    const el = document.getElementById('wui-target');
    if (el) { el.classList.add('wt-oor-flash'); setTimeout(() => el.classList.remove('wt-oor-flash'), 320); }
  },

  // Single entry point for every target-aware cast: hotkeys, macros, mouse
  // buttons. Returns true if the ability actually went off.
  tryCast(skId) {
    const pl = G.player;
    if (!pl || pl.dead || !skId) return false;
    const u = this.current;
    if (u && this.isAlive(u)) {
      if (!this.inRangeOf(skId, u)) { this.warnOutOfRange(skId); return false; }
      return Ent.castSkill(pl, skId, u.x, u.y);
    }
    return Ent.castSkill(pl, skId, G.mouseWorld[0], G.mouseWorld[1]);
  },

  // ---------------- per-frame ----------------
  update(dt) {
    const pl = G.player;
    if (!pl) return;
    if (this._warnT > 0) this._warnT -= dt;
    if (this._tabT > 0) this._tabT -= dt;

    // release a focus that died, despawned, or wandered too far
    if (this.current) {
      const gone = !this.isAlive(this.current) ||
        U.dist(pl.x, pl.y, this.current.x, this.current.y) > this.DROP_RANGE ||
        (this.kindOf(this.current) === 'npc' && !G.npcs.includes(this.current)) ||
        (this.kindOf(this.current) === 'player' && (!G.map.town || !Social.townSims.includes(this.current))) ||
        ((this.kindOf(this.current) === 'monster' || this.kindOf(this.current) === 'pet') && !G.monsters.includes(this.current));
      if (gone) this.current = null;
    }
    if (this.soft && !this.isAlive(this.soft)) this.soft = null;

    this.hover = UI.openPanel ? null : this.pick(Game.mouse.x, Game.mouse.y);

    // continuous range readout for the frame and the reticle
    const shown = this.current;
    if (shown) {
      this.dist = Math.max(0, this.rangeTo(shown));
      const primary = pl.bars && pl.bars.lmb && pl.bars.lmb.t === 'skill' ? pl.bars.lmb.id : 'atk';
      this.outOfRange = this.isHostile(shown) && !this.inRangeOf(primary, shown);
    } else { this.dist = 0; this.outOfRange = false; }
  },

  // ---------------- reticle ----------------
  // Drawn between the floor and the entity pass, so it reads as painted on the
  // ground beneath the unit.
  draw(ctx, t) {
    const drawRing = (u, strong) => {
      if (!u || !this.isAlive(u)) return;
      const [sx, sy] = Render.worldToScreen(u.x, u.y);
      if (sx < -80 || sx > Render.W + 80 || sy < -60 || sy > Render.H + 80) return;
      const s = this.sizeOf(u);
      const rx = 15 * s * Cam.zoom, ry = rx * Cam.pitch;
      const col = this.outOfRange && strong && this.isHostile(u) ? '#8a7060' : this.colorOf(u);
      ctx.save();
      ctx.translate(sx, sy + 1);
      if (strong) {
        // filled disc + rotating tick marks
        ctx.globalAlpha = 0.20 + Math.sin(t * 3) * 0.05;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        if (this.outOfRange && this.isHostile(u)) ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const spin = t * 0.9;
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 4; i++) {
          const a0 = spin + i * Math.PI / 2 - 0.22, a1 = a0 + 0.44;
          ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.16, ry * 1.16, 0, a0, a1); ctx.stroke();
        }
      } else {
        // faint hover ring
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.96, ry * 0.96, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    };
    if (this.hover && this.hover !== this.current) drawRing(this.hover, false);
    drawRing(this.current, true);
  },
};
