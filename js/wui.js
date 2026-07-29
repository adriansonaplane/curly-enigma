// ============ DIABLOID: wui.js — WoW-style interface layer ============
// Programmable action bars, unit/party/target frames, combat text streams,
// DPS meter, chat, quest log, buff tray, deep settings (keybinds, macros,
// audio/video/gameplay) and a drag-anywhere frame layout editor.
'use strict';

const WUI = {
  // ---------------- persisted state ----------------
  SETK: 'wui_settings_v1', LAYK: 'wui_layout_v1',
  set: null, keymap: null, layout: {},
  DEF_SET: {
    vol: 0.5, mute: false,
    quality: 'auto', renderScale: 1, fpsLimit: 0, fog: true, shafts: true, ao: true, reflections: true, grade: true, fps: false,
    mood: 'spooky', heroLight: 42,
    nameplates: false, dmgNums: true, shake: true, autoGold: true,
    ctIn: true, ctOut: true, bubbles: true, physics: true,
    fPlayer: true, fParty: true, fTarget: true, fBuffs: true, fChat: true, fDps: true, fTracker: true,
    fFriends: true, fGuild: true,
  },
  DEF_KEYS: {
    moveU: 'w', moveL: 'a', moveD: 's', moveR: 'd',
    potHp: 'q', potMp: 'e', portal: 't', mute: 'n', interact: 'f',
    inv: 'i', char: 'c', skills: 'k', ladder: 'l', quests: 'j', settings: 'o', chat: 'enter',
    social: 'u', guildp: 'g',
    camPreset: 'v', camRotL: '[', camRotR: ']', camIn: '+', camOut: '-',
    targetNext: 'tab', targetClear: 'x',
    slot1: '1', slot2: '2', slot3: '3', slot4: '4', slot5: '5',
    slot6: '6', slot7: '7', slot8: '8', slot9: '9', slot10: '0',
  },
  KEYACTIONS: [
    ['moveU', 'Move up'], ['moveL', 'Move left'], ['moveD', 'Move down'], ['moveR', 'Move right'],
    ['potHp', 'Healing potion'], ['potMp', 'Mana potion'], ['portal', 'Town portal'], ['mute', 'Toggle sound'],
    ['interact', 'Light / snuff torch'],
    ['inv', 'Inventory'], ['char', 'Character'], ['skills', 'Skill trees'], ['ladder', 'Season ladder'],
    ['quests', 'Quest log'], ['settings', 'Settings'], ['chat', 'Focus chat'],
    ['social', 'Social (friends)'], ['guildp', 'Guild panel'],
    ['camPreset', 'Toggle camera preset'], ['camRotL', 'Rotate camera left'], ['camRotR', 'Rotate camera right'],
    ['camIn', 'Zoom in'], ['camOut', 'Zoom out'],
    ['targetNext', 'Target nearest enemy'], ['targetClear', 'Clear target'],
    ['slot1', 'Action slot 1'], ['slot2', 'Action slot 2'], ['slot3', 'Action slot 3'], ['slot4', 'Action slot 4'],
    ['slot5', 'Action slot 5'], ['slot6', 'Action slot 6'], ['slot7', 'Action slot 7'], ['slot8', 'Action slot 8'],
    ['slot9', 'Action slot 9'], ['slot10', 'Action slot 10'],
  ],

  frames: {}, editMode: false, pickup: null, listening: null,
  chatLines: [], chatTab: 'all', chatOpen: false,
  target: null, hover: null,
  playedT: 0, _t1: 0, _t2: 0, _t3: 0, _fpsN: 0, _fpsT: 0,
  settingsTab: 0,

  dps: {
    samples: [], inSamples: [], fight: null, lastOutT: -99,
    reset() { this.samples = []; this.inSamples = []; this.fight = null; this.lastOutT = -99; },
  },

  // ================= INIT =================
  init() {
    this.set = Object.assign({}, this.DEF_SET, this._load(this.SETK));
    const savedKeys = this._load(this.SETK + '_keys') || {};
    if (savedKeys.camMode && !savedKeys.camPreset) savedKeys.camPreset = savedKeys.camMode;
    delete savedKeys.camMode;
    this.keymap = Object.assign({}, this.DEF_KEYS, savedKeys);
    this.layout = this._load(this.LAYK) || {};

    // strip the legacy skill hotbar slots (potion counters stay, hidden)
    document.querySelectorAll('.hot-slot:not(.potion)').forEach(e => e.remove());

    this.buildDom();
    this.wrapEngine();
    this.applySettings();
    window.addEventListener('resize', () => this.clampFrames());
    document.addEventListener('mousemove', e => {
      const c = document.getElementById('wui-cursoritem');
      if (this.pickup) { c.style.left = (e.clientX - 20) + 'px'; c.style.top = (e.clientY - 20) + 'px'; }
    });
    document.addEventListener('mousedown', e => {
      // dropping a pickup on empty space cancels it
      if (this.pickup && !e.target.closest('.wab-slot') && !e.target.closest('.skill-row') && !e.target.closest('.wm-ico'))
        this.clearPickup();
    }, true);
  },

  _load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  _save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  saveSet() { this._save(this.SETK, this.set); this._save(this.SETK + '_keys', this.keymap); },

  key(a) { return this.keymap[a]; },
  keyLabel(a) {
    const k = this.keymap[a];
    if (!k) return '—';
    return { ' ': 'SPACE', 'enter': 'ENTER', 'escape': 'ESC', 'arrowup': '↑', 'arrowdown': '↓', 'arrowleft': '←', 'arrowright': '→' }[k] || k.toUpperCase();
  },

  // ================= DOM =================
  buildDom() {
    const hud = document.getElementById('hud');
    const mk = (id, cls, html) => {
      const d = document.createElement('div');
      d.id = id; if (cls) d.className = cls;
      if (html) d.innerHTML = html;
      hud.appendChild(d);
      return d;
    };

    // frames
    const player = mk('wui-player', 'wui-frame wui-unit', '');
    const party = mk('wui-party', 'wui-frame', '');
    const target = mk('wui-target', 'wui-frame wui-unit', '');
    const buffs = mk('wui-bufftray', 'wui-frame', '');
    const ctIn = mk('wui-ct-in', 'wui-frame wui-ct', '');
    const ctOut = mk('wui-ct-out', 'wui-frame wui-ct', '');
    const chat = mk('wui-chat', 'wui-frame', `
      <div class="wc-tabs"></div><div class="wc-log"></div>
      <input maxlength="120" placeholder="type /help for commands, ESC to close" spellcheck="false">`);
    const dps = mk('wui-dps', 'wui-frame', `
      <div class="wd-head"><span>⚔ DAMAGE METER</span><span class="wd-reset" title="Reset">↺</span></div>
      <div class="wd-stats"></div><div class="wd-rows"></div>`);
    const tracker = mk('wui-tracker', 'wui-frame', '');
    const friends = mk('wui-friends', 'wui-frame wui-social', '');
    const guildf = mk('wui-guildframe', 'wui-frame wui-social', '');
    const bar = mk('wui-actionbar', 'wui-frame', '');
    mk('wui-fps', '', '');
    const cur = document.createElement('div');
    cur.id = 'wui-cursoritem'; cur.innerHTML = '<canvas width="40" height="40"></canvas>';
    document.body.appendChild(cur);

    const W = innerWidth, H = innerHeight;
    this.regFrame('player', player, 'Player Frame', 14, 14);
    this.regFrame('party', party, 'Party (Minions)', 14, 122);
    this.regFrame('target', target, 'Target Frame', W / 2 - 130, 96);
    this.regFrame('buffs', buffs, 'Buffs & Auras', W - 250 - 350, 16);
    this.regFrame('ctin', ctIn, 'Incoming Combat Text', W / 2 - 350, H / 2 - 300);
    this.regFrame('ctout', ctOut, 'Outgoing Combat Text', W / 2 + 140, H / 2 - 300);
    this.regFrame('chat', chat, 'Chat', 12, H - 342);
    this.regFrame('dps', dps, 'Damage Meter', W - 306, H - 330);
    this.regFrame('tracker', tracker, 'Quest Tracker', W - 254, 252);
    this.regFrame('friends', friends, 'Friends', 14, 330);
    this.regFrame('guildf', guildf, 'Guild', 14, 470);
    this.regFrame('bar', bar, 'Action Bar', W / 2 - 372, H - 96);
    this.regFrame('minimap', document.getElementById('minimap'), 'Minimap', W - 236, 12);
    this.regFrame('mainhud', document.getElementById('bottom-hud'), 'Globes', null, null); // keeps its own CSS spot unless moved
    this.regFrame('hudbtns', document.getElementById('hud-buttons'), 'Panel Buttons', null, null);

    this.buildActionBar();
    this.buildChat();
    dps.querySelector('.wd-reset').addEventListener('click', () => { this.dps.reset(); sfx('ui'); });

    // extra HUD shortcut buttons
    const btns = document.getElementById('hud-buttons');
    const addBtn = (label, title, fn) => {
      const b = document.createElement('button');
      b.textContent = label; b.title = title;
      b.addEventListener('click', fn);
      btns.insertBefore(b, document.getElementById('btn-mute'));
    };
    addBtn('J', 'Quest Log (' + this.keyLabel('quests') + ')', () => UI.toggle('quests'));
    addBtn('U', 'Social (' + this.keyLabel('social') + ')', () => UI.toggle('social'));
    addBtn('G', 'Guild (' + this.keyLabel('guildp') + ')', () => UI.toggle('guild'));
    addBtn('⚙', 'Settings (' + this.keyLabel('settings') + ')', () => UI.toggle('settings'));

    // panels
    document.getElementById('panels').insertAdjacentHTML('beforeend',
      '<div id="panel-settings" class="panel wide hidden"></div><div id="panel-quests" class="panel hidden"></div>' +
      '<div id="panel-social" class="panel hidden"></div><div id="panel-guild" class="panel hidden"></div>');

    // edit banner
    const banner = document.createElement('div');
    banner.id = 'wui-editbanner';
    banner.innerHTML = 'INTERFACE EDIT MODE — drag any frame to move it' +
      '<button id="wui-edit-reset">Reset layout</button><button id="wui-edit-done">Done</button>';
    banner.style.display = 'none';
    document.body.appendChild(banner);
    document.getElementById('wui-edit-done').addEventListener('click', () => this.setEditMode(false));
    document.getElementById('wui-edit-reset').addEventListener('click', () => {
      this.layout = {}; this._save(this.LAYK, this.layout); location.reload();
    });
  },

  // ---------------- frame manager ----------------
  regFrame(id, el, label, defX, defY) {
    if (!el) return;
    el.dataset.label = label;
    el.classList.add('wui-frame');
    this.frames[id] = { el, defX, defY };
    const pos = this.layout[id];
    if (pos) this.placeFrame(id, pos.x, pos.y);
    else if (defX !== null && defX !== undefined) this.placeFrame(id, defX, defY, true);
    el.addEventListener('pointerdown', e => {
      if (!this.editMode) return;
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = ev => this.placeFrame(id, ev.clientX - ox, ev.clientY - oy);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const rr = el.getBoundingClientRect();
        this.layout[id] = { x: Math.round(rr.left), y: Math.round(rr.top) };
        this._save(this.LAYK, this.layout);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  placeFrame(id, x, y, isDefault) {
    const f = this.frames[id];
    if (!f) return;
    const el = f.el;
    const w = el.offsetWidth || 200, h = el.offsetHeight || 40;
    x = U.clamp(x, 0, Math.max(0, innerWidth - Math.min(w, 240)));
    y = U.clamp(y, 0, Math.max(0, innerHeight - 28));
    el.style.position = 'fixed';
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.transform = 'none';
  },

  clampFrames() {
    for (const id in this.frames) {
      const el = this.frames[id].el;
      if (!el.style.left) continue;
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth || r.bottom > innerHeight)
        this.placeFrame(id, Math.min(r.left, innerWidth - r.width), Math.min(r.top, innerHeight - r.height));
    }
  },

  setEditMode(on) {
    this.editMode = on;
    document.body.classList.toggle('wui-edit', on);
    document.getElementById('wui-editbanner').style.display = on ? 'block' : 'none';
    if (on) UI.closeAll();
    sfx('ui');
  },

  // ================= ACTION BAR =================
  BAR_DEFS: null, // [{key ('lmb'|'rmb'|0..9|'php'|'pmp'), label}]
  buildActionBar() {
    const bar = document.getElementById('wui-actionbar');
    bar.innerHTML = '';
    this.BAR_DEFS = [
      { k: 'lmb', label: 'LMB' }, { k: 'rmb', label: 'RMB' }, { gap: 1 },
      ...Array.from({ length: 10 }, (_, i) => ({ k: i, label: this.keyLabel('slot' + (i + 1)) })),
      { gap: 1 }, { k: 'php', label: this.keyLabel('potHp') }, { k: 'pmp', label: this.keyLabel('potMp') },
    ];
    for (const def of this.BAR_DEFS) {
      if (def.gap) { bar.insertAdjacentHTML('beforeend', '<div class="wab-gap"></div>'); continue; }
      const d = document.createElement('div');
      d.className = 'wab-slot';
      d.dataset.k = def.k;
      d.innerHTML = `<span class="wab-key">${def.label}</span><canvas width="42" height="42"></canvas><div class="wab-cd"></div><span class="wab-count"></span>`;
      d.addEventListener('mousedown', e => {
        e.stopPropagation();
        if (e.button === 0) this.slotClick(def.k);
        else if (e.button === 2) this.slotPickup(def.k);
      });
      d.addEventListener('contextmenu', e => e.preventDefault());
      d.addEventListener('mouseenter', () => this.slotTip(def.k));
      d.addEventListener('mouseleave', () => UI.hideTip());
      bar.appendChild(d);
    }
  },

  ensurePlayer(pl) {
    if (!pl.bars) {
      pl.bars = { lmb: pl.hotbar && pl.hotbar.lmb ? (pl.hotbar.lmb === 'atk' ? { t: 'atk' } : { t: 'skill', id: pl.hotbar.lmb }) : { t: 'atk' },
                  rmb: pl.hotbar && pl.hotbar.rmb ? { t: 'skill', id: pl.hotbar.rmb } : null,
                  slots: new Array(10).fill(null) };
      // migrate old s1..s4 binds
      ['s1', 's2', 's3', 's4'].forEach((s, i) => {
        if (pl.hotbar && pl.hotbar[s]) pl.bars.slots[i] = { t: 'skill', id: pl.hotbar[s] };
      });
    }
    if (!pl.macros) pl.macros = [];
    if (!pl.quests) pl.quests = { p: {}, done: {} };
    this.syncHotbar(pl);
  },

  syncHotbar(pl) {
    pl.hotbar.lmb = pl.bars.lmb && pl.bars.lmb.t === 'skill' ? pl.bars.lmb.id : 'atk';
    pl.hotbar.rmb = pl.bars.rmb && pl.bars.rmb.t === 'skill' ? pl.bars.rmb.id : null;
  },

  getSlot(k) {
    const pl = G.player;
    if (k === 'lmb') return pl.bars.lmb;
    if (k === 'rmb') return pl.bars.rmb;
    if (k === 'php') return { t: 'pot', id: 'hp' };
    if (k === 'pmp') return { t: 'pot', id: 'mp' };
    return pl.bars.slots[k];
  },

  setSlot(k, entry) {
    const pl = G.player;
    if (k === 'php' || k === 'pmp') return; // fixed potion slots
    if ((k === 'lmb' || k === 'rmb') && entry && entry.t !== 'skill' && entry.t !== 'atk') {
      UI.announce('Mouse buttons accept skills only', '#ff6a5a', 1400);
      return;
    }
    if (k === 'lmb') pl.bars.lmb = entry || { t: 'atk' };
    else if (k === 'rmb') pl.bars.rmb = entry;
    else pl.bars.slots[k] = entry;
    this.syncHotbar(pl);
    sfx('equip');
  },

  slotClick(k) {
    if (this.pickup) { // place / swap
      const old = (k === 'php' || k === 'pmp') ? null : this.getSlot(k);
      const put = this.pickup;
      this.clearPickup();
      this.setSlot(k, put);
      if (old && old.t !== 'atk') this.pickupEntry(old);
      return;
    }
    const s = this.getSlot(k);
    if (s) this.execEntry(s);
  },

  slotPickup(k) {
    if (this.pickup) { this.clearPickup(); return; }
    if (k === 'php' || k === 'pmp') return;
    const s = this.getSlot(k);
    if (!s || s.t === 'atk') return;
    this.setSlot(k, k === 'lmb' ? { t: 'atk' } : null);
    this.pickupEntry(s);
  },

  pickupEntry(entry) {
    this.pickup = entry;
    const c = document.getElementById('wui-cursoritem');
    const cv = c.querySelector('canvas'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 40, 40);
    this.drawEntryIcon(ctx, entry, 40);
    c.style.display = 'block';
  },
  clearPickup() {
    this.pickup = null;
    document.getElementById('wui-cursoritem').style.display = 'none';
  },

  drawEntryIcon(ctx, entry, S) {
    if (!entry) return;
    if (entry.t === 'skill') {
      const sk = SKILL_BY_ID[entry.id];
      if (sk) ctx.drawImage(Sprites.skillIcon(sk, S), 0, 0, S, S);
    } else if (entry.t === 'atk') {
      ctx.strokeStyle = '#cfcfcf'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(S * 0.22, S * 0.78); ctx.lineTo(S * 0.78, S * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S * 0.3, S * 0.28); ctx.lineTo(S * 0.44, S * 0.42); ctx.stroke();
    } else if (entry.t === 'pot') {
      ctx.fillStyle = entry.id === 'hp' ? '#c0301c' : '#2a52e0';
      ctx.beginPath(); ctx.arc(S / 2, S * 0.62, S * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(S / 2 - S * 0.09, S * 0.16, S * 0.18, S * 0.26);
    } else if (entry.t === 'macro') {
      const m = G.player.macros[entry.id];
      ctx.fillStyle = '#1c1408'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = '#c9a44f'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.fillStyle = '#ffd94f'; ctx.font = 'bold ' + (S * 0.44) + 'px serif'; ctx.textAlign = 'center';
      ctx.fillText(m ? (m.name[0] || 'M').toUpperCase() : '?', S / 2, S * 0.66);
    }
  },

  execEntry(s) {
    const pl = G.player;
    if (!pl || pl.dead) return false;
    if (s.t === 'skill') return Target.tryCast(s.id);
    if (s.t === 'atk') return Target.tryCast('atk');
    if (s.t === 'pot') { Game.drinkPotion(s.id); return true; }
    if (s.t === 'macro') return this.runMacro(s.id);
    return false;
  },

  runMacro(mi) {
    const pl = G.player;
    const m = pl.macros[mi];
    if (!m || !m.seq.length) return false;
    if (m.mode === 'seq') {
      const id = m.seq[(m.idx || 0) % m.seq.length];
      if (Target.tryCast(id)) {
        m.idx = ((m.idx || 0) + 1) % m.seq.length;
        return true;
      }
      return false;
    }
    for (const id of m.seq) // priority: first castable wins
      if (Target.tryCast(id)) return true;
    return false;
  },

  slotTip(k) {
    const s = this.getSlot(k);
    if (!s) return;
    const pl = G.player;
    if (s.t === 'skill') {
      const sk = SKILL_BY_ID[s.id];
      if (sk) UI.tip(UI.skillTip(sk, Math.max(1, Ent.skillLvl(pl, s.id))));
    } else if (s.t === 'atk') UI.tip('<div class="tt-name">Basic Attack</div><div class="tt-type">Weapon strike — costs nothing</div>');
    else if (s.t === 'pot') UI.tip(`<div class="tt-name" style="color:${s.id === 'hp' ? '#ff6b5e' : '#6fa8ff'}">${s.id === 'hp' ? 'Healing' : 'Mana'} Potion</div><div class="tt-type">${pl.potions[s.id]} remaining</div>`);
    else if (s.t === 'macro') {
      const m = pl.macros[s.id];
      if (m) UI.tip(`<div class="tt-name" style="color:#ffd94f">Macro: ${U.esc(m.name)}</div><div class="tt-type">${m.mode === 'seq' ? 'Cast sequence' : 'Priority cast'}</div><div>${m.seq.map(id => U.esc((SKILL_BY_ID[id] || {}).name || id)).join(' → ')}</div>`);
    }
  },

  updateActionBar() {
    const pl = G.player;
    document.querySelectorAll('#wui-actionbar .wab-slot').forEach(d => {
      const kRaw = d.dataset.k;
      const k = (kRaw === 'lmb' || kRaw === 'rmb' || kRaw === 'php' || kRaw === 'pmp') ? kRaw : +kRaw;
      const s = this.getSlot(k);
      const cv = d.querySelector('canvas'), ctx = cv.getContext('2d');
      const cdEl = d.querySelector('.wab-cd'), cntEl = d.querySelector('.wab-count');
      ctx.clearRect(0, 0, 42, 42);
      d.classList.toggle('wab-empty', !s);
      let cdTxt = '', dim = false, oom = false, count = '';
      if (s) {
        this.drawEntryIcon(ctx, s, 42);
        if (s.t === 'skill') {
          const sk = SKILL_BY_ID[s.id];
          const cd = pl.cds[s.id] || 0;
          if (cd > 0.05 && sk && sk.cd) {
            cdTxt = cd >= 10 ? Math.ceil(cd) : cd.toFixed(1);
            const frac = cd / sk.cd;
            ctx.save(); // radial cooldown sweep
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath(); ctx.moveTo(21, 21);
            ctx.arc(21, 21, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }
          const lvl = Ent.skillLvl(pl, s.id);
          if (sk && lvl > 0 && pl.mp < Ent.manaCost(sk, lvl)) oom = true;
          if (pl.gcd > 0.1) dim = true;
        } else if (s.t === 'pot') {
          count = pl.potions[s.id];
          if (Game.potCd > 0 || !pl.potions[s.id]) dim = true;
        }
      }
      cdEl.textContent = cdTxt;
      cntEl.textContent = count;
      d.classList.toggle('wab-dim', dim);
      d.classList.toggle('wab-oom', oom);
    });
  },

  // ================= UNIT FRAMES =================
  _portraits: {},
  portrait(key) {
    if (this._portraits[key]) return this._portraits[key];
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 40;
    const sheet = Sprites.getActor(key);
    cv.getContext('2d').drawImage(sheet.canvas, 0, 6 * sheet.cell, sheet.cell, sheet.cell, -5, -3, 50, 50);
    this._portraits[key] = cv;
    return cv;
  },

  bar(cls, frac, txt) {
    return `<div class="wui-bar ${cls}${frac < 0.3 && cls === 'wb-hp' ? ' low' : ''}">
      <div class="wb-fill" style="transform:scaleX(${U.clamp(frac, 0, 1)})"></div>
      <div class="wb-txt">${txt || ''}</div></div>`;
  },

  updatePlayerFrame() {
    const pl = G.player, d = pl.derived;
    const el = document.getElementById('wui-player');
    const xpPrev = XP_TABLE(pl.lvl), xpNext = XP_TABLE(pl.lvl + 1);
    const gtag = (typeof Social !== 'undefined' && Social.state && Social.state.guild)
      ? ` <span style="color:#5fd88a">⟨${Social.state.guild.tag}⟩</span>` : '';
    el.innerHTML = `<div class="wu-row">
      <div class="wu-portrait"></div>
      <div class="wu-body">
        <div class="wu-name">${U.esc(pl.name)}${gtag} <span class="wu-lvl">· ${pl.lvl}${pl.hardcore ? ' · HC' : ''}</span></div>
        ${this.bar('wb-hp', pl.hp / d.maxHp, Math.ceil(pl.hp) + ' / ' + d.maxHp)}
        ${this.bar('wb-mp', pl.mp / d.maxMp, Math.ceil(pl.mp) + ' / ' + d.maxMp)}
        ${this.bar('wb-xp', (pl.xp - xpPrev) / (xpNext - xpPrev), '')}
      </div></div>`;
    el.querySelector('.wu-portrait').appendChild(this.portrait(pl.cls));
  },

  updatePartyFrame() {
    const el = document.getElementById('wui-party');
    const minions = G.monsters.filter(m => m.ally && !m.dead);
    if (!minions.length) { el.innerHTML = ''; return; }
    let h = '<div id="wui-party-title">PARTY — YOUR SERVANTS</div>';
    for (const m of minions.slice(0, 6)) {
      h += `<div class="wui-unit" data-fam="${m.fam}"><div class="wu-row">
        <div class="wu-portrait"></div>
        <div class="wu-body">
          <div class="wu-name">${U.esc(m.name || m.fam)}</div>
          ${this.bar('wb-hp', m.hp / m.maxHp, Math.ceil(m.hp) + ' / ' + Math.ceil(m.maxHp))}
          ${m.ttl !== undefined ? this.bar('wb-ttl', m.ttl / (m.maxTtl || 60), '') : ''}
        </div></div></div>`;
    }
    if (minions.length > 6) h += `<div class="wui-mini-title">+${minions.length - 6} more…</div>`;
    el.innerHTML = h;
    const units = el.querySelectorAll('.wui-unit');
    minions.slice(0, 6).forEach((m, i) => units[i].querySelector('.wu-portrait').appendChild(this.portrait(m.fam)));
  },

  monsterStatus(m) {
    const out = [];
    if (m.stunT > 0) out.push({ s: '✦', c: '#ffd94f', t: m.stunT, n: 'Stunned' });
    if (m.debuffT > 0) {
      if (m.debuffs.slow) out.push({ s: '❄', c: '#7bdcff', t: m.debuffT, n: 'Slowed ' + Math.round(m.debuffs.slow * 100) + '%' });
      if (m.debuffs.dot) out.push({ s: '◉', c: ELEM[m.debuffs.dotElem || 'pois'].color, t: m.debuffT, n: Math.round(m.debuffs.dot) + ' damage/sec' });
      if (m.debuffs.dmgTaken) out.push({ s: '☠', c: '#c07bff', t: m.debuffT, n: '+' + Math.round(m.debuffs.dmgTaken * 100) + '% damage taken' });
      if (m.debuffs.weaken) out.push({ s: '▼', c: '#9a9a9a', t: m.debuffT, n: 'Weakened' });
    }
    return out;
  },

  updateTargetFrame() {
    const el = document.getElementById('wui-target');
    const t = Target.shown();
    if (!t) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    const kind = Target.kindOf(t);
    const focused = Target.current === t;
    const col = Target.colorOf(t);
    let bars = '', sub = '', icons = '';
    if (kind === 'monster' || kind === 'pet') {
      bars = this.bar('wb-hp', t.hp / t.maxHp, Math.ceil(t.hp) + ' / ' + Math.ceil(t.maxHp));
      const mods = (t.mods || []).map(k => ELITE_MODS[k].name).join(' · ');
      if (mods) sub = mods;
      for (const st of this.monsterStatus(t))
        icons += `<div class="wu-ico" style="border-color:${st.c};color:${st.c};background:${U.rgba(st.c, 0.15)}" title="${U.esc(st.n)}">${st.s}<span class="wi-t">${Math.ceil(st.t)}</span></div>`;
    } else if (kind === 'npc') {
      sub = '« ' + U.esc(t.def.role) + ' »';
    } else {
      sub = (t.guild ? '⟨' + t.guild.tag + '⟩ ' : '') + 'Level ' + t.lvl;
    }
    const lvl = kind === 'npc' ? '' : ` <span class="wu-lvl">· ${t.lvl}</span>`;
    const rangeTag = focused && Target.isHostile(t)
      ? `<span class="wt-range${Target.outOfRange ? ' oor' : ''}">${Target.outOfRange ? 'OUT OF RANGE' : 'in range'} · ${Target.dist.toFixed(1)}m</span>` : '';
    const rank = kind === 'monster' && t.rank !== 'normal' ? ` rk-${t.rank}` : '';
    el.innerHTML = `<div class="wu-row">
      <div class="wu-portrait"></div>
      <div class="wu-body">
        <div class="wu-name${rank}" style="${rank ? '' : `color:${col}`}">${U.esc(Target.nameOf(t))}${lvl}</div>
        ${bars}
        ${sub ? `<div class="wui-mini-title">${sub}</div>` : ''}
        ${rangeTag}
        ${icons ? `<div class="wu-status">${icons}</div>` : ''}
      </div></div>`;
    el.classList.toggle('wt-soft', !focused);
    try {
      const key = kind === 'npc' ? t.id : kind === 'player' ? t.cls : (t.boss ? t.bossKey : t.fam);
      el.querySelector('.wu-portrait').appendChild(this.portrait(key));
    } catch (e) {}
  },

  // ================= BUFF TRAY =================
  BUFF_SYMS: { fire: '🔥', cold: '❄', lite: '⚡', pois: '☠', holy: '✦', arc: '◈', phys: '⚔', shadow: '◐' },
  updateBuffTray() {
    const el = document.getElementById('wui-bufftray');
    const pl = G.player;
    let h = '';
    for (const b of pl.buffs) {
      const col = b.color || '#8fc8ff';
      h += `<div class="wbuff" data-n="${U.esc(b.name)}">
        <div class="wbf-ico" style="border-color:${col};color:${col};box-shadow:0 0 7px ${U.rgba(col, 0.4)}">✦</div>
        <div class="wbf-t">${b.t >= 60 ? Math.ceil(b.t / 60) + 'm' : Math.ceil(b.t) + 's'}</div>
        <div class="wbf-name">${U.esc(b.name)}</div></div>`;
    }
    el.innerHTML = h;
    el.querySelectorAll('.wbuff').forEach((d, i) => {
      const b = pl.buffs[i];
      if (!b) return;
      d.addEventListener('mouseenter', () => {
        let s = `<div class="tt-name" style="color:${b.color || '#8fc8ff'}">${U.esc(b.name)}</div><div class="tt-type">${Math.ceil(b.t)}s remaining</div>`;
        if (b.stats) for (const k in b.stats) s += `<div class="tt-stat">${Items.statLine(k, b.stats[k])}</div>`;
        UI.tip(s);
      });
      d.addEventListener('mouseleave', () => UI.hideTip());
    });
  },

  // ================= COMBAT TEXT =================
  ctLine(dir, txt, color, crit) {
    if (dir === 'in' ? !this.set.ctIn : !this.set.ctOut) return;
    const el = document.getElementById(dir === 'in' ? 'wui-ct-in' : 'wui-ct-out');
    if (!el || el.childElementCount > 26) return;
    const d = document.createElement('div');
    d.className = 'ct-line' + (crit ? ' crit' : '');
    d.style.color = color;
    d.style.top = (el.offsetHeight - 30 - Math.random() * 26) + 'px';
    d.textContent = txt;
    el.appendChild(d);
    setTimeout(() => d.remove(), crit ? 1900 : 1650);
  },

  // ================= DPS METER =================
  trackOut(dmg, srcName, crit) {
    const now = G.time;
    const D = this.dps;
    if (now - D.lastOutT > 6 || !D.fight) D.fight = { t0: now, total: 0, best: 0, bestSrc: '', by: {}, kills: 0 };
    D.lastOutT = now;
    D.fight.total += dmg;
    D.fight.by[srcName] = (D.fight.by[srcName] || 0) + dmg;
    if (dmg > D.fight.best) { D.fight.best = dmg; D.fight.bestSrc = srcName; }
    D.samples.push([now, dmg]);
  },
  trackIn(dmg) { this.dps.inSamples.push([G.time, dmg]); },

  rolling(samples, win) {
    const cut = G.time - win;
    while (samples.length && samples[0][0] < cut) samples.shift();
    let s = 0;
    for (const [, d] of samples) s += d;
    return s / win;
  },

  updateDps() {
    const el = document.getElementById('wui-dps');
    const D = this.dps;
    const dps = this.rolling(D.samples, 8), dtps = this.rolling(D.inSamples, 8);
    const f = D.fight;
    const dur = f ? Math.max(1, Math.min(G.time, D.lastOutT) - f.t0 + 0.5) : 0;
    el.querySelector('.wd-stats').innerHTML =
      `<div>DPS <b>${U.fmt(Math.round(dps))}</b></div><div>Taken/s <b>${U.fmt(Math.round(dtps))}</b></div>` +
      `<div>Fight <b>${f ? U.fmt(Math.round(f.total / dur)) + '/s' : '—'}</b></div><div>Dealt <b>${f ? U.fmt(Math.round(f.total)) : 0}</b></div>` +
      `<div>Best hit <b>${f && f.best ? U.fmt(Math.round(f.best)) : '—'}</b></div><div>Kills <b>${U.fmt(G.stats.kills)}</b></div>`;
    let rows = '';
    if (f) {
      const by = Object.entries(f.by).sort((a, b) => b[1] - a[1]).slice(0, 7);
      const max = by.length ? by[0][1] : 1;
      for (const [name, amt] of by)
        rows += `<div class="wd-row"><div class="wd-fill" style="width:${Math.round(amt / max * 100)}%"></div>
          <div class="wd-txt"><span>${U.esc(name)}</span><span>${U.fmt(Math.round(amt))} · ${Math.round(amt / f.total * 100)}%</span></div></div>`;
    }
    el.querySelector('.wd-rows').innerHTML = rows;
  },

  // ================= CHAT =================
  CHAT_TABS: [['all', 'ALL'], ['local', 'LOCAL'], ['guild', 'GUILD'], ['combat', 'COMBAT'], ['loot', 'LOOT'], ['sys', 'SYSTEM']],
  buildChat() {
    const el = document.getElementById('wui-chat');
    const tabs = el.querySelector('.wc-tabs');
    for (const [id, label] of this.CHAT_TABS) {
      const t = document.createElement('div');
      t.className = 'wc-tab' + (id === this.chatTab ? ' active' : '');
      t.dataset.tab = id;
      t.textContent = label;
      t.addEventListener('click', () => { this.chatTab = id; this.renderChat(); });
      tabs.appendChild(t);
    }
    const input = el.querySelector('input');
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = input.value.trim();
        input.value = '';
        this.closeChat();
        if (v) this.chatCommand(v);
      } else if (e.key === 'Escape') { input.value = ''; this.closeChat(); }
    });
    this.chat('sys', 'Welcome to DIABLOID. Type <span style="color:#ffd94f">/help</span> for commands.');
  },

  openChat() {
    this.chatOpen = true;
    const input = document.querySelector('#wui-chat input');
    input.classList.add('open');
    input.focus();
  },
  closeChat() {
    this.chatOpen = false;
    const input = document.querySelector('#wui-chat input');
    input.classList.remove('open');
    input.blur();
  },

  chat(tab, html, color) {
    const t = new Date();
    const ts = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    this.chatLines.push({ tab, html, color, ts });
    if (this.chatLines.length > 160) this.chatLines.shift();
    this.renderChat();
  },

  renderChat() {
    const el = document.getElementById('wui-chat');
    if (!el) return;
    el.querySelectorAll('.wc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this.chatTab));
    const log = el.querySelector('.wc-log');
    const lines = this.chatLines.filter(l => this.chatTab === 'all' || l.tab === this.chatTab);
    log.innerHTML = lines.slice(-90).map(l =>
      `<div style="color:${l.color || '#cfc4a8'}"><span class="wc-ts">${l.ts}</span>${l.html}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  },

  chatCommand(v) {
    if (!v.startsWith('/')) { Social.localSay(v); return; }
    const [cmd, ...rest] = v.slice(1).split(' ');
    if (Social.command(cmd.toLowerCase(), rest)) return;
    switch (cmd.toLowerCase()) {
      case 'help':
        this.chat('sys', 'Chat: <b>/w</b> name msg · <b>/r</b> · <b>/g</b> msg · <b>/who</b> · <b>/say</b>', '#ffd94f');
        this.chat('sys', 'Social: <b>/friend /unfriend /mute /unmute /block /unblock /social /guild /gquit /gmotd</b>', '#ffd94f');
        this.chat('sys', 'Emotes: <b>/emotes</b> for the list · <b>/dance</b> to dance', '#ffd94f');
        this.chat('sys', 'Misc: <b>/played /quests /dps /editui /resetui /macro</b>', '#ffd94f');
        break;
      case 'played': {
        const m = Math.floor(this.playedT / 60), s = Math.floor(this.playedT % 60);
        this.chat('sys', `Session time: ${m}m ${s}s · Level ${G.player.lvl} · ${U.fmt(G.stats.kills)} kills`);
        break;
      }
      case 'quests': UI.open('quests'); break;
      case 'dps': this.chat('sys', `Rolling DPS: ${U.fmt(Math.round(this.rolling(this.dps.samples, 8)))}`); break;
      case 'resetui': this.layout = {}; this._save(this.LAYK, this.layout); location.reload(); break;
      case 'editui': this.setEditMode(true); break;
      case 'macro': UI.open('settings'); this.settingsTab = this.SETTINGS_TABS.indexOf('MACROS'); this.renderSettings(); break;
      default: this.chat('sys', `Unknown command: /${U.esc(cmd)} — try /help`, '#ff6a5a');
    }
  },

  // ================= QUESTS =================
  QUESTS: null,
  buildQuests() {
    const q = [];
    ACTS.forEach((act, i) => {
      q.push({ id: 'cull' + i, name: 'Cull the Horde ' + U.roman(i + 1), type: 'kill', act: i, need: 30,
        desc: `Slay 30 monsters in ${act.name}.`, gold: 120 + i * 220, xp: 220 * Math.pow(3.1, i) });
      q.push({ id: 'boss' + i, name: BOSSES[act.boss].name.split(',')[0] + ' Must Fall', type: 'boss', act: i, need: 1,
        desc: `Destroy the master of ${act.name}.`, gold: 350 + i * 400, xp: 500 * Math.pow(3.1, i) });
    });
    for (const lv of [5, 15, 30, 50, 75]) q.push({ id: 'lvl' + lv, name: 'Rise to ' + lv, type: 'level', need: lv, desc: `Reach level ${lv}.`, gold: lv * 40, xp: 0 });
    for (const fl of [3, 10, 25]) q.push({ id: 'abyss' + fl, name: 'Abyss: Floor ' + fl, type: 'abyss', need: fl, desc: `Descend to floor ${fl} of the Endless Abyss.`, gold: fl * 300, xp: fl * 900 });
    q.push({ id: 'shrines', name: 'Kissed by Light', type: 'shrine', need: 3, desc: 'Receive blessings from 3 shrines.', gold: 250, xp: 300 });
    q.push({ id: 'chests', name: 'Treasure Hunter', type: 'chest', need: 5, desc: 'Loot 5 treasure chests.', gold: 400, xp: 500 });
    q.push({ id: 'rich', name: 'Filthy Rich', type: 'gold', need: 10000, desc: 'Hold 10,000 gold at once.', gold: 1000, xp: 800 });
    this.QUESTS = q;
  },

  questAvailable(q) {
    const pl = G.player;
    if (q.type === 'kill' || q.type === 'boss') return q.act <= pl.progress.actUnlocked;
    if (q.type === 'abyss') return pl.progress.actUnlocked >= 5 || pl.progress.bossKilled[4];
    return true;
  },
  questProg(q) {
    const pl = G.player;
    switch (q.type) {
      case 'kill': return pl.quests.p[q.id] || 0;
      case 'boss': return pl.progress.bossKilled[q.act] ? 1 : 0;
      case 'level': return pl.lvl;
      case 'abyss': return pl.progress.abyssBest || 0;
      case 'gold': return pl.gold;
      default: return pl.quests.p[q.id] || 0;
    }
  },

  bumpQuest(type, act, n = 1) {
    const pl = G.player;
    if (!pl || !pl.quests) return;
    for (const q of this.QUESTS) {
      if (q.type !== type || pl.quests.done[q.id] || !this.questAvailable(q)) continue;
      if ((type === 'kill' || type === 'boss') && q.act !== act) continue;
      if (type === 'kill' || type === 'shrine' || type === 'chest') pl.quests.p[q.id] = (pl.quests.p[q.id] || 0) + n;
    }
    this.checkQuests();
  },

  checkQuests() {
    const pl = G.player;
    if (!pl || !pl.quests || !this.QUESTS) return;
    for (const q of this.QUESTS) {
      if (pl.quests.done[q.id] || !this.questAvailable(q)) continue;
      if (this.questProg(q) >= q.need) {
        pl.quests.done[q.id] = true;
        pl.gold += q.gold;
        if (q.xp) G.awardXp(Math.round(q.xp));
        sfx('shrine');
        UI.announce(`Quest complete: ${q.name}`, '#6be26b', 3000);
        this.chat('combat', `Quest complete: <span style="color:#6be26b">${U.esc(q.name)}</span> — +${U.fmt(q.gold)}g${q.xp ? ', +' + U.fmt(Math.round(q.xp)) + ' xp' : ''}`, '#b8d8a0');
      }
    }
  },

  updateTracker() {
    const el = document.getElementById('wui-tracker');
    const pl = G.player;
    const active = this.QUESTS.filter(q => this.questAvailable(q) && !pl.quests.done[q.id]).slice(0, 3);
    if (!active.length) { el.innerHTML = ''; return; }
    let h = '<div class="qt-title">OBJECTIVES</div>';
    for (const q of active) {
      const p = Math.min(this.questProg(q), q.need);
      h += `<div class="qt-q"><div class="qt-name">◆ ${U.esc(q.name)}</div>
        <div class="qt-obj${p >= q.need ? ' done' : ''}">— ${U.esc(q.desc)} (${U.fmt(p)}/${U.fmt(q.need)})</div></div>`;
    }
    el.innerHTML = h;
  },

  renderQuests() {
    const p = UI.panel('quests');
    UI.head(p, 'QUEST LOG');
    const pl = G.player;
    const avail = this.QUESTS.filter(q => this.questAvailable(q));
    const open = avail.filter(q => !pl.quests.done[q.id]);
    const done = avail.filter(q => pl.quests.done[q.id]);
    let h = `<div class="npc-line">${open.length} active · ${done.length} completed</div>`;
    for (const q of open.concat(done)) {
      const isDone = pl.quests.done[q.id];
      const prog = Math.min(this.questProg(q), q.need);
      h += `<div class="q-item${isDone ? ' done' : ''}">
        <div class="q-name">${U.esc(q.name)}${isDone ? '<span class="q-tag">✓ COMPLETE</span>' : ''}</div>
        <div class="q-desc">${U.esc(q.desc)}</div>
        <div class="q-prog">${U.fmt(prog)} / ${U.fmt(q.need)}<span class="q-bar"><i style="width:${Math.round(prog / q.need * 100)}%"></i></span></div>
        <div class="q-gold">Reward: ${U.fmt(q.gold)} gold${q.xp ? ' · ' + U.fmt(Math.round(q.xp)) + ' xp' : ''}</div>
      </div>`;
    }
    p.insertAdjacentHTML('beforeend', h);
  },

  // ================= SETTINGS =================
  SETTINGS_TABS: ['GAMEPLAY', 'CAMERA', 'AUDIO', 'VIDEO', 'INTERFACE', 'KEYBINDS', 'MACROS'],
  renderSettings() {
    const p = UI.panel('settings');
    UI.head(p, 'SETTINGS');
    const tabs = document.createElement('div');
    tabs.className = 'ws-tabs';
    this.SETTINGS_TABS.forEach((t, i) => {
      const b = document.createElement('div');
      b.className = 'tree-tab' + (i === this.settingsTab ? ' active' : '');
      b.textContent = t;
      b.addEventListener('click', () => { this.settingsTab = i; this.renderSettings(); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs);
    const body = document.createElement('div');
    body.className = 'ws-body';
    p.appendChild(body);
    [this.tabGameplay, this.tabCamera, this.tabAudio, this.tabVideo, this.tabInterface, this.tabKeybinds, this.tabMacros][this.settingsTab].call(this, body);
  },

  wsToggle(body, label, hint, key, onChange) {
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = `<span class="ws-label">${label}${hint ? `<span class="ws-hint">${hint}</span>` : ''}</span>
      <div class="ws-toggle${this.set[key] ? ' on' : ''}"></div>`;
    row.querySelector('.ws-toggle').addEventListener('click', () => {
      this.set[key] = !this.set[key];
      row.querySelector('.ws-toggle').classList.toggle('on', this.set[key]);
      this.saveSet(); this.applySettings(); sfx('ui');
      if (onChange) onChange(this.set[key]);
    });
    body.appendChild(row);
  },

  tabGameplay(body) {
    this.wsToggle(body, 'Enemy nameplates', 'Always show health bars and names over enemies', 'nameplates');
    this.wsToggle(body, 'World damage numbers', 'Floating numbers over targets in the world', 'dmgNums');
    this.wsToggle(body, 'Screen shake', 'Camera kick on hits and explosions', 'shake');
    this.wsToggle(body, 'Incoming combat text', 'Scrolling damage-taken feed', 'ctIn');
    this.wsToggle(body, 'Outgoing combat text', 'Scrolling damage-dealt feed', 'ctOut');
  },

  tabCamera(body) {
    const row = (label, hint, build) => {
      const r = document.createElement('div');
      r.className = 'ws-row';
      r.innerHTML = `<span class="ws-label">${label}${hint ? `<span class="ws-hint">${hint}</span>` : ''}</span>`;
      build(r);
      body.appendChild(r);
      return r;
    };
    row('Camera preset', 'Elevated is a fixed overview; third person supports free orbit', r => {
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="elevated">Elevated</option><option value="third">Third person</option>';
      sel.value = Cam.mode;
      sel.addEventListener('change', () => { Cam.setMode(sel.value); this.renderSettings(); });
      r.appendChild(sel);
    });
    row('Zoom', 'Mouse wheel also zooms', r => {
      const i = document.createElement('input');
      i.type = 'range'; i.min = Cam.ZOOM_MIN * 100; i.max = Cam.ZOOM_MAX * 100;
      i.value = Math.round(Cam.prefs[Cam.mode].zoom * 100);
      i.addEventListener('input', () => Cam.setZoom(i.value / 100));
      r.appendChild(i);
    });
    row('Camera pitch', 'Low pitch shows more of the horizon', r => {
      const i = document.createElement('input');
      i.type = 'range'; i.min = Cam.PITCH_MIN * 100; i.max = Cam.PITCH_MAX * 100;
      i.value = Math.round(Cam.prefs[Cam.mode].pitch * 100);
      i.addEventListener('input', () => Cam.setPitch(i.value / 100));
      r.appendChild(i);
    });
    row('Orbit speed', 'How fast the rotate keys swing the camera around you', r => {
      const i = document.createElement('input');
      i.type = 'range'; i.min = 5; i.max = 60;
      i.value = Math.round(Cam.orbitSpeed * 10);
      i.addEventListener('input', () => { Cam.orbitSpeed = i.value / 10; Cam.save(); });
      r.appendChild(i);
    });
    this.wsToggle(body, 'Physics debris', 'Smashed props throw bouncing, rolling chunks', 'physics',
      v => { Physics.enabled = v; if (!v) Physics.clear(); });
    const r2 = document.createElement('div');
    r2.className = 'ws-row';
    r2.innerHTML = '<span class="ws-label">Reset camera to defaults</span>';
    const b = document.createElement('button');
    b.className = 'ws-btn';
    b.textContent = 'Reset';
    b.addEventListener('click', () => {
      Cam.prefs = { elevated: { zoom: 1.0, pitch: 0.72 }, third: { zoom: 1.6, pitch: 0.40 } };
      Cam.orbitSpeed = 2.2; Cam.yawTarget = 0; Cam.applyPrefs(false); Cam.save();
      this.renderSettings();
    });
    r2.appendChild(b);
    body.appendChild(r2);
  },

  tabAudio(body) {
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = `<span class="ws-label">Master volume</span>
      <input type="range" min="0" max="100" value="${Math.round(this.set.vol * 100)}">`;
    row.querySelector('input').addEventListener('input', e => {
      this.set.vol = e.target.value / 100;
      this.saveSet(); this.applySettings();
    });
    row.querySelector('input').addEventListener('change', () => sfx('gold'));
    body.appendChild(row);
    this.wsToggle(body, 'Mute all sound', '', 'mute');
  },

  tabVideo(body) {
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = `<span class="ws-label">Render quality<span class="ws-hint">Auto silently reduces effects if frame rate drops</span></span>
      <select><option value="auto">Auto</option><option value="ultra">Ultra (12 lights)</option><option value="high">High</option><option value="low">Low</option></select>`;
    const sel = row.querySelector('select');
    sel.value = this.set.quality;
    sel.addEventListener('change', () => { this.set.quality = sel.value; this.saveSet(); this.applySettings(); sfx('ui'); });
    body.appendChild(row);

    const scale = document.createElement('div');
    scale.className = 'ws-row';
    scale.innerHTML = `<span class="ws-label">3D render scale<span class="ws-hint">Lowers only the 3D scene; interface text remains native resolution</span></span>
      <select><option value="1">100%</option><option value="0.85">85%</option><option value="0.75">75%</option><option value="0.6">60%</option></select>`;
    const rsel = scale.querySelector('select');
    rsel.value = String(this.set.renderScale === undefined ? 1 : this.set.renderScale);
    rsel.addEventListener('change', () => {
      this.set.renderScale = +rsel.value;
      this.saveSet(); this.applySettings(); sfx('ui');
    });
    body.appendChild(scale);

    const frameLimit = document.createElement('div');
    frameLimit.className = 'ws-row';
    frameLimit.innerHTML = `<span class="ws-label">FPS limit<span class="ws-hint">Display uses every browser animation frame</span></span>
      <select><option value="0">Display / Uncapped</option><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="90">90 FPS</option><option value="120">120 FPS</option></select>`;
    const fsel = frameLimit.querySelector('select');
    fsel.value = String(this.set.fpsLimit || 0);
    fsel.addEventListener('change', () => {
      this.set.fpsLimit = +fsel.value;
      Render.targetFps = this.set.fpsLimit || 60;
      this.saveSet();
      // Start the newly selected cadence at the next browser frame.
      Game._last = 0;
      sfx('ui');
    });
    body.appendChild(frameLimit);

    const mood = document.createElement('div');
    mood.className = 'ws-row';
    mood.innerHTML = `<span class="ws-label">Lighting mood<span class="ws-hint">Spooky drops the ambient light and lets torches, fires and glowing growths do the work</span></span>
      <select><option value="spooky">Spooky — lit by props</option><option value="classic">Classic — lantern</option></select>`;
    const msel = mood.querySelector('select');
    msel.value = this.set.mood;
    msel.addEventListener('change', () => { this.set.mood = msel.value; this.saveSet(); this.applySettings(); sfx('ui'); });
    body.appendChild(mood);

    const hl = document.createElement('div');
    hl.className = 'ws-row';
    hl.innerHTML = `<span class="ws-label">Hero light<span class="ws-hint">How much of your own light you carry in spooky mode — 0 is pitch dark</span></span>`;
    const hi = document.createElement('input');
    hi.type = 'range'; hi.min = 0; hi.max = 100;
    hi.value = this.set.heroLight;
    hi.addEventListener('input', () => { this.set.heroLight = +hi.value; this.saveSet(); this.applySettings(); });
    hl.appendChild(hi);
    body.appendChild(hl);
    this.wsToggle(body, 'Atmospheric fog', 'Drifting fog banks', 'fog');
    this.wsToggle(body, 'Volumetric god rays', 'Light shafts from the ceiling', 'shafts');
    this.wsToggle(body, 'Ambient occlusion', 'Contact shading where floors meet walls', 'ao');
    this.wsToggle(body, 'Water reflections', 'Actors mirror in standing water', 'reflections');
    this.wsToggle(body, 'Color grading & vignette', 'Per-zone cinematic tinting', 'grade');
    this.wsToggle(body, 'FPS counter', '', 'fps');
  },

  tabInterface(body) {
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = `<span class="ws-label">Frame layout<span class="ws-hint">Unlock every frame and drag it anywhere. Layout is saved.</span></span><span></span>`;
    const btn = document.createElement('button');
    btn.className = 'ws-btn';
    btn.textContent = 'Enter Edit Mode';
    btn.addEventListener('click', () => { UI.closeAll(); this.setEditMode(true); });
    row.lastElementChild.replaceWith(btn);
    body.appendChild(row);
    const row2 = document.createElement('div');
    row2.className = 'ws-row';
    row2.innerHTML = '<span class="ws-label">Reset all frame positions</span>';
    const btn2 = document.createElement('button');
    btn2.className = 'ws-btn danger';
    btn2.textContent = 'Reset layout';
    btn2.addEventListener('click', () => { this.layout = {}; this._save(this.LAYK, this.layout); location.reload(); });
    row2.appendChild(btn2);
    body.appendChild(row2);
    this.wsToggle(body, 'Player frame', '', 'fPlayer');
    this.wsToggle(body, 'Party frame (minions)', '', 'fParty');
    this.wsToggle(body, 'Target frame', '', 'fTarget');
    this.wsToggle(body, 'Buff tray', 'Blessings and skill auras with timers', 'fBuffs');
    this.wsToggle(body, 'Chat window', '', 'fChat');
    this.wsToggle(body, 'Damage meter', '', 'fDps');
    this.wsToggle(body, 'Quest tracker', '', 'fTracker');
    this.wsToggle(body, 'Friends frame', 'Online friends at a glance', 'fFriends');
    this.wsToggle(body, 'Guild frame', 'Your guild and who\'s online', 'fGuild');
    this.wsToggle(body, 'Chat & emote bubbles', 'Speech bubbles over characters in the world', 'bubbles');
  },

  tabKeybinds(body) {
    const note = document.createElement('div');
    note.className = 'npc-line';
    note.textContent = 'Click a binding, then press the new key. Press ESC while listening to unbind.';
    body.appendChild(note);
    for (const [action, label] of this.KEYACTIONS) {
      const row = document.createElement('div');
      row.className = 'ws-row';
      row.innerHTML = `<span class="ws-label">${label}</span><span class="ws-key" data-a="${action}">${this.keyLabel(action)}</span>`;
      const kEl = row.querySelector('.ws-key');
      kEl.addEventListener('click', () => {
        document.querySelectorAll('.ws-key.listen').forEach(x => x.classList.remove('listen'));
        this.listening = action;
        kEl.classList.add('listen');
        kEl.textContent = 'press key…';
      });
      body.appendChild(row);
    }
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = '<span class="ws-label">Restore default bindings</span>';
    const btn = document.createElement('button');
    btn.className = 'ws-btn danger';
    btn.textContent = 'Reset keys';
    btn.addEventListener('click', () => { this.keymap = Object.assign({}, this.DEF_KEYS); this.saveSet(); this.buildActionBar(); this.renderSettings(); });
    row.appendChild(btn);
    body.appendChild(row);
  },

  captureBind(k) {
    const action = this.listening;
    this.listening = null;
    if (k !== 'escape') {
      // steal the key from any other action bound to it
      for (const a in this.keymap) if (this.keymap[a] === k && a !== action) this.keymap[a] = null;
      this.keymap[action] = k;
    } else this.keymap[action] = null;
    this.saveSet();
    this.buildActionBar();
    if (UI.openPanel === 'settings') this.renderSettings();
    sfx('equip');
  },

  tabMacros(body) {
    const pl = G.player;
    const note = document.createElement('div');
    note.className = 'npc-line';
    note.innerHTML = 'Macros chain skills onto one button. <b>Priority</b> casts the first ready skill; <b>Sequence</b> steps through the list. Drag the macro icon onto an action slot.';
    body.appendChild(note);
    pl.macros.forEach((m, mi) => {
      const box = document.createElement('div');
      box.className = 'ws-macro';
      box.innerHTML = `<div class="wm-head">
          <div class="wm-ico" title="Drag to an action slot">${(m.name[0] || 'M').toUpperCase()}</div>
          <span class="wm-name">${U.esc(m.name)}</span>
          <select class="wm-mode"><option value="prio">Priority</option><option value="seq">Sequence</option></select>
          <button class="ws-btn danger wm-del">✕</button>
        </div><div class="wm-seq"></div>`;
      box.querySelector('.wm-mode').value = m.mode || 'prio';
      box.querySelector('.wm-mode').addEventListener('change', e => { m.mode = e.target.value; m.idx = 0; });
      box.querySelector('.wm-del').addEventListener('click', () => { pl.macros.splice(mi, 1); this.renderSettings(); });
      box.querySelector('.wm-ico').addEventListener('mousedown', e => {
        e.preventDefault();
        this.pickupEntry({ t: 'macro', id: mi });
        UI.closeAll();
      });
      const seq = box.querySelector('.wm-seq');
      m.seq.forEach((id, si) => {
        const sk = SKILL_BY_ID[id];
        if (!sk) return;
        const cv = document.createElement('canvas');
        cv.width = 30; cv.height = 30;
        cv.getContext('2d').drawImage(Sprites.skillIcon(sk, 30), 0, 0, 30, 30);
        cv.title = sk.name + ' — click to remove';
        cv.addEventListener('click', () => { m.seq.splice(si, 1); this.renderSettings(); });
        seq.appendChild(cv);
      });
      // add-skill picker
      const learned = Object.keys(pl.skills).filter(id => pl.skills[id] > 0 && SKILL_BY_ID[id] && SKILL_BY_ID[id].arch !== 'passive');
      if (learned.length) {
        const add = document.createElement('div');
        add.className = 'ws-skillpick';
        for (const id of learned) {
          const sk = SKILL_BY_ID[id];
          const cv = document.createElement('canvas');
          cv.width = 32; cv.height = 32;
          cv.getContext('2d').drawImage(Sprites.skillIcon(sk, 32), 0, 0, 32, 32);
          cv.title = 'Add ' + sk.name;
          cv.addEventListener('click', () => { if (m.seq.length < 6) { m.seq.push(id); this.renderSettings(); } });
          add.appendChild(cv);
        }
        box.appendChild(add);
      }
      body.appendChild(box);
    });
    const row = document.createElement('div');
    row.className = 'ws-row';
    row.innerHTML = '<input type="text" maxlength="16" placeholder="New macro name…" style="background:#1a1208;border:1px solid #4a3a1c;color:#e8dcc0;font-family:inherit;padding:4px 8px">';
    const btn = document.createElement('button');
    btn.className = 'ws-btn';
    btn.textContent = '+ Create macro';
    btn.addEventListener('click', () => {
      const name = row.querySelector('input').value.trim() || 'Macro ' + (pl.macros.length + 1);
      if (pl.macros.length >= 8) return;
      pl.macros.push({ name, mode: 'prio', seq: [], idx: 0 });
      this.renderSettings();
    });
    row.appendChild(btn);
    body.appendChild(row);
  },

  // ================= SETTINGS APPLICATION =================
  applySettings() {
    const s = this.set;
    // audio
    AUDIO.vol = s.vol;
    AUDIO.muted = s.mute;
    if (AUDIO.master) AUDIO.master.gain.value = s.mute ? 0 : s.vol;
    // video
    Render.fx = {
      fog: s.fog, shafts: s.shafts, ao: s.ao, reflections: s.reflections,
      grade: s.grade, dmgNums: s.dmgNums, shake: s.shake, nameplates: s.nameplates,
      bubbles: s.bubbles,
    };
    Render.qualityMode = s.quality;
    Render.renderScale = U.clamp(Number(s.renderScale === undefined ? 1 : s.renderScale), 0.25, 1);
    Render.targetFps = Number(s.fpsLimit) || 60;
    Render.mood = s.mood || 'spooky';
    Render.heroLightMul = U.clamp((s.heroLight === undefined ? 42 : s.heroLight) / 100, 0, 1);
    Physics.enabled = s.physics !== false;
    if (s.quality !== 'auto') Render.quality = s.quality;
    else if (Render.quality) Render.quality = 'high'; // re-probe from high
    // frames
    const vis = { player: s.fPlayer, party: s.fParty, target: s.fTarget, buffs: s.fBuffs, chat: s.fChat, dps: s.fDps, tracker: s.fTracker, friends: s.fFriends, guildf: s.fGuild };
    for (const id in vis) {
      const f = this.frames[id];
      if (f) f.el.classList.toggle('wui-hidden', !vis[id]);
    }
    const fps = document.getElementById('wui-fps');
    if (fps) fps.style.display = s.fps ? 'block' : 'none';
  },

  // ================= ENGINE HOOKS =================
  wrapEngine() {
    const self = this;
    this.buildQuests();

    // outgoing damage → combat text + meter + sticky target
    const _dm = Ent.damageMonster.bind(Ent);
    Ent.damageMonster = function (m, amount, elem, opts = {}) {
      const dealt = _dm(m, amount, elem, opts);
      if (dealt && opts.from === G.player) {
        const src = opts.srcName || Ent._src || 'Attack';
        self.ctLine('out', (opts.crit ? '✹ ' : '') + U.fmt(Math.floor(dealt)), opts.crit ? '#ffd94f' : ELEM[elem].color, opts.crit);
        self.trackOut(dealt, src, opts.crit);
        if (!m.dead && !Target.current) Target.soft = m;
      }
      return dealt;
    };

    // incoming damage → combat text + meter
    const _dp = Ent.damagePlayer.bind(Ent);
    Ent.damagePlayer = function (amount, elem, src) {
      const before = G.player ? G.player.hp : 0;
      _dp(amount, elem, src);
      const dealt = G.player ? Math.max(0, before - G.player.hp) : 0;
      if (dealt >= 1) {
        const who = src && src.name ? src.name : 'the environment';
        self.ctLine('in', '-' + U.fmt(Math.floor(dealt)), '#ff6a5a');
        self.trackIn(dealt);
        if (dealt > G.player.derived.maxHp * 0.18)
          self.chat('combat', `${U.esc(who)} hits you for <span style="color:#ff6a5a">${U.fmt(Math.floor(dealt))}</span>.`);
      }
    };

    // kills → chat + quests
    const _km = Ent.killMonster.bind(Ent);
    Ent.killMonster = function (m, killer) {
      const wasDead = m.dead;
      _km(m, killer);
      if (wasDead || m.ally) return;
      if (self.dps.fight) self.dps.fight.kills++;
      if (m.rank === 'elite' || m.rank === 'boss')
        self.chat('combat', `You have slain <span style="color:${m.rank === 'boss' ? '#ff6a3c' : '#ffd94f'}">${U.esc(m.name)}</span>!`);
      if (typeof G.map.actIdx === 'number') self.bumpQuest('kill', G.map.actIdx);
      else if (G.map.actIdx === 'abyss') self.bumpQuest('kill', -1);
    };

    // loot drops → chat feed (rare and better)
    const _dl = G.dropLoot.bind(G);
    G.dropLoot = function (m) {
      const before = G.groundItems.length;
      _dl(m);
      for (let i = before; i < G.groundItems.length; i++) {
        const gi = G.groundItems[i];
        if (gi.item && ['rare', 'set', 'unique'].includes(gi.item.rarity))
          self.chat('loot', `Dropped: <span style="color:${Items.rarityColor(gi.item.rarity)}">[${U.esc(gi.item.name)}]</span>`);
      }
    };

    // pickups → chat feed
    const _gi = Game.giveItem.bind(Game);
    Game.giveItem = function (it) {
      const ok = _gi(it);
      if (ok) self.chat('loot', `You receive <span style="color:${Items.rarityColor(it.rarity)}">[${U.esc(it.name)}]</span>.`);
      return ok;
    };

    // shrines & chests → quests
    const _ut = Game.useThing.bind(Game);
    Game.useThing = function (th) {
      const kind = th.kind, was = kind === 'shrine' ? th.used : kind === 'chest' ? th.opened : true;
      _ut(th);
      if (kind === 'shrine' && !was && th.used) self.bumpQuest('shrine');
      if (kind === 'chest' && !was && th.opened) self.bumpQuest('chest');
    };

    // boss kills / abyss depth / level → quests
    const _ob = G.onBossKilled.bind(G);
    G.onBossKilled = function (m) {
      _ob(m);
      self.chat('combat', `<span style="color:#ff6a3c">${U.esc(m.name)} has fallen.</span>`, '#ffb08a');
      self.checkQuests();
    };

    // announcements mirror into chat
    const _an = UI.announce.bind(UI);
    UI.announce = function (txt, color, dur) {
      _an(txt, color, dur);
      self.chat('sys', U.esc(txt), color);
    };

    // world damage numbers toggle
    const _dn = UI.dmgNum.bind(UI);
    UI.dmgNum = function (x, y, txt, color, crit) {
      if (Render.fx && Render.fx.dmgNums === false) return;
      _dn(x, y, txt, color, crit);
    };

    // potion heal → green combat text
    const _pot = Game.drinkPotion.bind(Game);
    Game.drinkPotion = function (kind) {
      const pl = G.player;
      const b = kind === 'hp' ? pl.hp : pl.mp;
      _pot(kind);
      const gain = Math.round((kind === 'hp' ? pl.hp : pl.mp) - b);
      if (gain > 0) self.ctLine('in', '+' + U.fmt(gain), kind === 'hp' ? '#6be26b' : '#6fa8ff');
    };

    // panels this layer owns
    const _open = UI.open.bind(UI);
    UI.open = function (name) {
      _open(name);
      if (name === 'settings') self.renderSettings();
      if (name === 'quests') self.renderQuests();
    };
  },

  // ================= INPUT =================
  // Returns true when the key was consumed.
  handleKey(k, e) {
    if (this.listening) { this.captureBind(k); return true; }
    if (this.chatOpen) return false; // input element handles its own keys
    if (UI.openPanel === 'death') return true; // no hotkeys through the death screen
    if (k === 'escape') {
      if (this.pickup) { this.clearPickup(); return true; }
      if (this.editMode) { this.setEditMode(false); return true; }
      if (UI.openPanel && UI.openPanel !== 'death') { UI.closeAll(); return true; }
      if (!UI.openPanel) { UI.open('menu'); return true; }
      return false;
    }
    const m = this.keymap;
    if (k === m.chat) { this.openChat(); return true; }
    if (k === m.inv) { UI.toggle('inv'); return true; }
    if (k === m.char) { UI.toggle('char'); return true; }
    if (k === m.skills) { UI.toggle('skills'); return true; }
    if (k === m.ladder) { UI.toggle('ladder'); return true; }
    if (k === m.quests) { UI.toggle('quests'); return true; }
    if (k === m.settings) { UI.toggle('settings'); return true; }
    if (k === m.social) { UI.toggle('social'); return true; }
    if (k === m.guildp) { UI.toggle('guild'); return true; }
    if (k === m.interact) { Game.toggleLight(); return true; }
    if (k === m.targetNext) { Target.tabNext(); return true; }
    if (k === m.targetClear) { Target.clear(); return true; }
    if (k === m.camPreset) { Cam.cycleMode(); return true; }
    if (k === m.camIn) { Cam.adjustZoom(0.12); return true; }
    if (k === m.camOut) { Cam.adjustZoom(-0.12); return true; }
    if (k === m.potHp) { Game.drinkPotion('hp'); return true; }
    if (k === m.potMp) { Game.drinkPotion('mp'); return true; }
    if (k === m.portal) { Game.castPortal(); return true; }
    if (k === m.mute) {
      this.set.mute = !this.set.mute;
      this.saveSet(); this.applySettings();
      document.getElementById('btn-mute').textContent = this.set.mute ? '✕' : '♪';
      return true;
    }
    for (let i = 1; i <= 10; i++) {
      if (k === m['slot' + i]) {
        const s = this.getSlot(i - 1);
        if (s && !UI.openPanel) this.execEntry(s);
        return true;
      }
    }
    return false;
  },

  // ================= PER-FRAME =================
  update(dt) {
    const pl = G.player;
    if (!pl) return;
    this.ensurePlayer(pl);
    this.playedT += dt;

    // fps counter
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) {
      const el = document.getElementById('wui-fps');
      if (el && this.set.fps) {
        const cap = Number(this.set.fpsLimit) || 0;
        const diag = R3.stats(), gpu = diag.gpu;
        const gpuText = gpu.supported
          ? (gpu.ms === null ? 'GPU pending' : 'GPU ' + gpu.ms.toFixed(1) + ' ms')
          : 'GPU unsupported';
        el.textContent = Math.round(this._fpsN / this._fpsT) + ' fps · ' + (cap ? cap + ' cap' : 'display') + ' · ' +
          (Render.quality === 'low' ? 'low' : 'high') + ' quality · CPU update ' +
          Render.cpuUpdateMs.toFixed(1) + ' ms · CPU submit ' + Render.cpuRenderMs.toFixed(1) + ' ms · ' + gpuText;
      }
      this._fpsN = 0; this._fpsT = 0;
    }

    this.updateActionBar();

    this._t1 += dt;
    if (this._t1 >= 0.12) {
      this._t1 = 0;
      if (this.set.fPlayer) this.updatePlayerFrame();
      if (this.set.fTarget) this.updateTargetFrame();
      if (this.set.fParty) this.updatePartyFrame();
    }
    this._t2 += dt;
    if (this._t2 >= 0.25) {
      this._t2 = 0;
      if (this.set.fBuffs) this.updateBuffTray();
      if (this.set.fDps) this.updateDps();
    }
    this._t3 += dt;
    if (this._t3 >= 0.6) {
      this._t3 = 0;
      if (this.set.fTracker) this.updateTracker();
      this.checkQuests(); // catches level / gold / abyss quests
      this.refreshSocialFrames();
    }
  },

  // ---------------- friends & guild HUD frames ----------------
  refreshSocialFrames() {
    if (typeof Social === 'undefined' || !Social.state) return;
    const fr = document.getElementById('wui-friends');
    if (fr && this.set.fFriends) {
      const list = Social.state.friends
        .map(n => Social.sim(n)).filter(Boolean)
        .sort((a, b) => (Social.online.has(b.name) ? 1 : 0) - (Social.online.has(a.name) ? 1 : 0));
      const onN = list.filter(s => Social.online.has(s.name)).length;
      let h = `<div class="wui-mini-title">FRIENDS · ${onN}/${list.length} ONLINE</div>`;
      if (!list.length) h += '<div class="soc-empty">/friend a player to add them</div>';
      for (const s of list.slice(0, 7)) {
        const on = Social.online.has(s.name);
        h += `<div class="soc-mini${on ? '' : ' off'}"><span class="soc-dot" style="background:${on ? '#6be26b' : '#555'}"></span>${Social.nameHtml(s)}<span class="soc-sub"> ${s.lvl}</span></div>`;
      }
      fr.innerHTML = h;
    }
    const gf = document.getElementById('wui-guildframe');
    if (gf && this.set.fGuild) {
      const g = Social.state.guild;
      if (!g) {
        gf.innerHTML = `<div class="wui-mini-title">GUILD</div><div class="soc-empty">Guildless — press ${this.keyLabel('guildp')} to browse</div>`;
      } else {
        const on = g.members.filter(n => Social.online.has(n)).length;
        let h = `<div class="wui-mini-title">⟨${g.tag}⟩ ${U.esc(g.name).toUpperCase()}</div>
          <div class="soc-mini"><span class="soc-sub">${on + 1}/${g.members.length + 1} online · ${g.rank}</span></div>
          <div class="soc-motd">“${U.esc(g.motd)}”</div>`;
        gf.innerHTML = h;
      }
    }
  },
};
