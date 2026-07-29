// ============ DIABLOID: ui.js — HUD, panels, menu, ladder ============
'use strict';

const UI = {
  els: {}, openPanel: null, treeTab: 0, ladderTab: 0, menuFxT: null,

  init() {
    const ids = ['hud', 'zone-label', 'announce', 'hp-fill', 'mp-fill', 'hp-text', 'mp-text', 'xp-fill',
      'hp-pot-n', 'mp-pot-n', 'boss-bar', 'boss-name', 'boss-fill', 'buff-bar', 'tooltip', 'menu-screen'];
    for (const id of ids) this.els[id] = document.getElementById(id);
    document.querySelectorAll('#hud-buttons button[data-panel]').forEach(b =>
      b.addEventListener('click', () => this.toggle(b.dataset.panel)));
    document.getElementById('btn-mute').addEventListener('click', () => {
      const m = AUDIO.toggleMute();
      document.getElementById('btn-mute').textContent = m ? '✕' : '♪';
    });
    document.querySelectorAll('.hot-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const s = slot.dataset.slot;
        if (s === 'php') Game.drinkPotion('hp');
        else if (s === 'pmp') Game.drinkPotion('mp');
        else this.toggle('skills');
      });
    });
    document.addEventListener('mousemove', e => { this._mx = e.clientX; this._my = e.clientY; this.moveTip(e.clientX, e.clientY); });
  },

  // ---------------- tooltip ----------------
  tip(html, x, y) {
    const t = this.els.tooltip;
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.moveTip(x !== undefined ? x : this._mx, y !== undefined ? y : this._my);
  },
  moveTip(x, y) {
    const t = this.els.tooltip;
    if (t.classList.contains('hidden')) return;
    const r = t.getBoundingClientRect();
    let tx = x + 18, ty = y + 14;
    if (tx + r.width > innerWidth - 8) tx = x - r.width - 14;
    if (ty + r.height > innerHeight - 8) ty = innerHeight - r.height - 8;
    t.style.left = tx + 'px'; t.style.top = Math.max(6, ty) + 'px';
  },
  hideTip() { this.els.tooltip.classList.add('hidden'); },

  hookTip(el, htmlFn) {
    el.addEventListener('mouseenter', e => this.tip(htmlFn(), e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => this.hideTip());
  },

  // ---------------- announcements / floating text ----------------
  dmgNum(x, y, txt, color, crit) {
    if (G.dmgNums.length > 70) G.dmgNums.shift();
    G.dmgNums.push({ x, y, z: 0, txt: String(txt), color, t: 0.9, crit });
  },
  _annT: null,
  announce(txt, color = '#ffd77a', dur = 2600) {
    const a = this.els.announce;
    a.textContent = txt; a.style.color = color;
    a.classList.add('show');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => a.classList.remove('show'), dur);
  },
  flashMana() {
    this.els['mp-text'].style.color = '#ff6a5a';
    setTimeout(() => this.els['mp-text'].style.color = '', 300);
    sfx('nope');
  },

  // ---------------- HUD ----------------
  updateHUD() {
    const pl = G.player;
    if (!pl) return;
    const d = pl.derived;
    this.els['hp-fill'].style.height = U.clamp(pl.hp / d.maxHp * 100, 0, 100) + '%';
    this.els['mp-fill'].style.height = U.clamp(pl.mp / d.maxMp * 100, 0, 100) + '%';
    this.els['hp-text'].textContent = Math.ceil(pl.hp) + ' / ' + d.maxHp;
    this.els['mp-text'].textContent = Math.ceil(pl.mp) + ' / ' + d.maxMp;
    const xpPrev = XP_TABLE(pl.lvl), xpNext = XP_TABLE(pl.lvl + 1);
    this.els['xp-fill'].style.width = U.clamp((pl.xp - xpPrev) / (xpNext - xpPrev) * 100, 0, 100) + '%';
    this.els['hp-pot-n'].textContent = pl.potions.hp;
    this.els['mp-pot-n'].textContent = pl.potions.mp;
    this.els['zone-label'].textContent = G.map ? G.map.name + (G.map.town ? '' : `  ·  Monster Lvl ${G.map.mlvl}`) : '';

    // hotbar icons + cooldowns
    document.querySelectorAll('.hot-slot').forEach(slot => {
      const s = slot.dataset.slot;
      if (s === 'php' || s === 'pmp') return;
      const skId = pl.hotbar[s];
      const cvs = slot.querySelector('canvas');
      const c = cvs.getContext('2d');
      c.clearRect(0, 0, 44, 44);
      if (skId && skId !== 'atk') {
        const sk = SKILL_BY_ID[skId];
        c.drawImage(Sprites.skillIcon(sk, 44), 0, 0);
        const cd = pl.cds[skId] || 0;
        slot.classList.toggle('cooldown', cd > 0.05);
      } else if (skId === 'atk') {
        c.strokeStyle = '#cfcfcf'; c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(10, 34); c.lineTo(34, 10); c.stroke();
        c.beginPath(); c.moveTo(14, 12); c.lineTo(20, 18); c.stroke();
        slot.classList.remove('cooldown');
      } else slot.classList.remove('cooldown');
    });

    // buffs
    let bh = '';
    for (const b of pl.buffs) bh += `<div class="buff-ico" style="border-color:${b.color};background:${U.rgba(b.color, 0.18)}" title="${U.esc(b.name)}">${Math.ceil(b.t)}</div>`;
    this.els['buff-bar'].innerHTML = bh;

    // boss bar
    const boss = G.monsters.find(m => m.boss && !m.dead && m.aggro);
    this.els['boss-bar'].classList.toggle('hidden', !boss);
    if (boss) {
      this.els['boss-name'].textContent = boss.name;
      this.els['boss-fill'].style.width = U.clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%';
    }
  },

  // ---------------- panels ----------------
  panel(name) { return document.getElementById('panel-' + name); },
  closeAll() {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    this.openPanel = null;
    this.hideTip();
  },
  toggle(name) {
    if (this.openPanel === name) { this.closeAll(); return; }
    this.open(name);
  },
  open(name) {
    this.closeAll();
    this.openPanel = name;
    sfx('ui');
    const p = this.panel(name);
    p.classList.remove('hidden');
    switch (name) {
      case 'inv': this.renderInv(); break;
      case 'char': this.renderChar(); break;
      case 'skills': this.renderSkills(); break;
      case 'ladder': this.renderLadder(); break;
      case 'vendor': this.renderVendor(); break;
      case 'stash': this.renderStash(); break;
      case 'gamble': this.renderGamble(); break;
      case 'waypoint': this.renderWaypoint(); break;
      case 'menu': this.renderPauseMenu(); break;
    }
  },
  head(p, title) {
    p.innerHTML = `<span class="close-x">✕</span><h2>${title}</h2>`;
    p.querySelector('.close-x').addEventListener('click', () => this.closeAll());
  },

  // ---------------- inventory ----------------
  renderInv() {
    const p = this.panel('inv'), pl = G.player;
    this.head(p, 'INVENTORY');
    const eq = document.createElement('div');
    eq.className = 'equip-grid';
    const slots = [['helm', 'Helm'], ['amulet', 'Amulet'], ['weapon', 'Weapon'], ['chest', 'Chest'], ['offhand', 'Off-hand'],
                   ['gloves', 'Gloves'], ['belt', 'Belt'], ['ring1', 'Ring'], ['ring2', 'Ring'], ['boots', 'Boots']];
    for (const [slot, label] of slots) {
      const cell = document.createElement('div');
      cell.className = 'eq-slot';
      cell.innerHTML = `<span class="eq-label">${label}</span>`;
      const it = pl.equip[slot];
      if (it) {
        const cv = Sprites.itemIcon(it, 52);
        cell.appendChild(cv);
        cell.style.borderColor = Items.rarityColor(it.rarity);
        this.hookTip(cell, () => Items.tooltip(it, pl));
        cell.addEventListener('click', () => { Game.unequip(slot); this.renderInv(); });
      }
      eq.appendChild(cell);
    }
    p.appendChild(eq);
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    for (let i = 0; i < 48; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      const it = pl.inv[i];
      if (it) {
        cell.appendChild(Sprites.itemIcon(it, 44));
        cell.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
        this.hookTip(cell, () => Items.tooltip(it, pl) +
          `<div style="color:#847252;margin-top:4px;font-size:11px">${this.openPanel === 'vendor' ? 'Click: SELL' : 'Click: equip · Right-click: sell later'}</div>`);
        cell.addEventListener('click', () => { Game.equipFromInv(i); this.renderInv(); });
      }
      grid.appendChild(cell);
    }
    p.appendChild(grid);
    const gold = document.createElement('div');
    gold.className = 'gold-row';
    gold.innerHTML = `⛁ ${U.fmt(pl.gold)} gold`;
    p.appendChild(gold);
  },

  // ---------------- character ----------------
  // Gear score is deliberately based only on persisted item fields so the same
  // equipment always produces the same score:
  //   item level + (5 * (tier + 1)) + rarity bonus, summed for all slots.
  // Rarity bonuses: common 0, magic 5, rare 10, set 15, unique 20.
  gearScore(equip) {
    const rarityBonus = { common: 0, magic: 5, rare: 10, set: 15, unique: 20 };
    return Object.values(equip || {}).reduce((total, item) => {
      if (!item) return total;
      const ilvl = Number.isFinite(+item.ilvl) ? +item.ilvl : 0;
      const tier = Number.isFinite(+item.tier) ? +item.tier : 0;
      return total + Math.max(0, Math.round(ilvl + 5 * (tier + 1) + (rarityBonus[item.rarity] || 0)));
    }, 0);
  },

  renderChar() {
    const p = this.panel('char'), pl = G.player;
    const d = pl.derived;
    this.head(p, pl.name.toUpperCase());
    const cls = CLASSES.find(c => c.id === pl.cls);
    const wd = Ent.weaponDmg(pl);
    const rows = [
      ['Class', cls.name + (pl.hardcore ? ' <span class="hc-tag">HARDCORE</span>' : '')],
      ['Level', pl.lvl + '  <span style="color:#847252">(' + U.fmt(pl.xp) + ' xp)</span>'],
      ['Deepest Abyss', pl.progress.abyssBest || '—'],
      ['Monsters slain', U.fmt(G.stats.kills)],
      ['hr'],
      ['Strength', d.str], ['Dexterity', d.dex], ['Vitality', d.vit], ['Energy', d.ene],
      ['hr'],
      ['Damage', `${Math.floor(wd[0] * d.physMult)}–${Math.floor(wd[1] * d.physMult)}`],
      ['Spell power', '×' + d.spellPower.toFixed(2)],
      ['Attack rate', d.atkRate.toFixed(2) + '/s'],
      ['Crit', d.critCh.toFixed(1) + '% / ×' + d.critDmg.toFixed(2)],
      ['Armor', d.armor],
      ['Move speed', d.moveSpd.toFixed(1)],
      ['hr'],
      ['Fire / Cold res', d.fireRes + '% / ' + d.coldRes + '%'],
      ['Lightning / Poison', d.liteRes + '% / ' + d.poisRes + '%'],
      ['Arcane res', d.arcRes + '%'],
      ['Magic find', d.mf + '%'], ['Gold find', d.goldFind + '%'],
    ];
    let h = '';
    if (pl.statPts > 0) h += `<div class="pts-banner">✦ ${pl.statPts} stat points to spend</div>`;
    h += '<div class="paperdoll-wrap"><div class="paperdoll"><div class="pd-silhouette"></div></div><div class="char-stats">';
    h += `<div class="gear-score"><span class="gs-num">${this.gearScore(pl.equip)}</span><span class="gs-label">GEAR SCORE</span></div>`;
    h += '<table class="stat-table">';
    for (const r of rows) {
      if (r[0] === 'hr') { h += '<tr><td colspan="2" style="border-color:#45351a"></td></tr>'; continue; }
      const statKey = { Strength: 'str', Dexterity: 'dex', Vitality: 'vit', Energy: 'ene' }[r[0]];
      const btn = statKey && pl.statPts > 0 ? `<button class="stat-btn" data-stat="${statKey}">+</button>` : '';
      h += `<tr><td>${r[0]}</td><td>${r[1]}${btn}</td></tr>`;
    }
    h += '</table></div></div>';
    p.insertAdjacentHTML('beforeend', h);

    // Use the actual equipment object as the source of truth, rather than a
    // shortened display list, so new equipment slots cannot silently disappear.
    const paperdoll = p.querySelector('.paperdoll');
    const slotMeta = {
      helm: ['Helm', 82, 9], amulet: ['Amulet', 151, 26],
      weapon: ['Weapon', 12, 67], chest: ['Chest', 82, 67], offhand: ['Off-hand', 151, 84],
      gloves: ['Gloves', 12, 142], belt: ['Belt', 82, 142],
      ring1: ['Ring 1', 12, 217], ring2: ['Ring 2', 151, 217], boots: ['Boots', 82, 234],
    };
    Object.keys(pl.equip).forEach((slot, index) => {
      const meta = slotMeta[slot] || [slot.replace(/([A-Z])/g, ' $1'), 12 + (index % 3) * 69, 9 + Math.floor(index / 3) * 75];
      const cell = document.createElement('div');
      cell.className = 'pd-slot';
      cell.dataset.slot = slot;
      cell.style.left = meta[1] + 'px';
      cell.style.top = meta[2] + 'px';
      cell.innerHTML = `<span class="pd-label">${U.esc(meta[0])}</span>`;
      const item = pl.equip[slot];
      if (item) {
        cell.appendChild(Sprites.itemIcon(item, 42));
        cell.style.borderColor = Items.rarityColor(item.rarity);
        cell.setAttribute('aria-label', `Inspect ${item.name}`);
        this.hookTip(cell, () => Items.tooltip(item, pl) +
          '<div style="color:#847252;margin-top:4px;font-size:11px">Inspect item · Use × to unequip</div>');

        const unequip = document.createElement('button');
        unequip.className = 'pd-unequip';
        unequip.type = 'button';
        unequip.textContent = '×';
        unequip.title = `Unequip ${item.name}`;
        unequip.setAttribute('aria-label', `Unequip ${item.name}`);
        unequip.addEventListener('click', e => {
          e.stopPropagation();
          this.hideTip();
          Game.unequip(slot);
          this.renderChar();
        });
        cell.appendChild(unequip);
      }
      paperdoll.appendChild(cell);
    });

    this.hookTip(p.querySelector('.gear-score'), () =>
      '<div class="tt-compare-label">GEAR SCORE FORMULA</div>' +
      '<div class="tt-formula">Σ [item level + 5 × (tier + 1) + rarity bonus]\n' +
      'Common 0 · Magic 5 · Rare 10 · Set 15 · Unique 20</div>');
    p.querySelectorAll('.stat-btn').forEach(b => b.addEventListener('click', () => {
      if (G.player.statPts > 0) {
        G.player.stats[b.dataset.stat] = (G.player.stats[b.dataset.stat] || 0) + 1;
        G.player.statPts--;
        Ent.computeDerived(G.player);
        sfx('ui');
        this.renderChar();
      }
    }));
  },

  // ---------------- skills ----------------
  renderSkills() {
    const p = this.panel('skills'), pl = G.player;
    const cls = CLASSES.find(c => c.id === pl.cls);
    this.head(p, cls.name + ' — SKILLS');
    if (pl.skillPts > 0) p.insertAdjacentHTML('beforeend', `<div class="pts-banner">✦ ${pl.skillPts} skill points available</div>`);
    const tabs = document.createElement('div');
    tabs.className = 'tree-tabs';
    cls.trees.forEach((tr, i) => {
      const b = document.createElement('div');
      b.className = 'tree-tab' + (i === this.treeTab ? ' active' : '');
      b.textContent = tr.name;
      b.addEventListener('click', () => { this.treeTab = i; this.renderSkills(); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs);
    const grid = document.createElement('div');
    grid.className = 'skill-grid';
    const tree = cls.trees[this.treeTab];
    tree.skills.forEach((sk, i) => {
      const req = skillReqLvl(i);
      const lvl = pl.skills[sk.id] || 0;
      const locked = pl.lvl < req;
      const row = document.createElement('div');
      row.className = 'skill-row' + (locked ? ' locked' : '');
      const icon = Sprites.skillIcon(sk, 40);
      row.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'skill-info';
      info.innerHTML = `<div class="skill-name">${sk.name} <span class="skill-lvl">${lvl}/${sk.maxLvl}</span></div>
        <div class="skill-desc">${U.esc(sk.desc)} ${locked ? `<span style="color:#c96a52">(requires level ${req})</span>` : ''}</div>
        <div class="skill-desc" style="color:#6f8a5a">${this.bindLabel(sk.id)}</div>`;
      row.appendChild(info);
      const plus = document.createElement('button');
      plus.className = 'skill-plus';
      plus.textContent = '+';
      plus.disabled = locked || pl.skillPts <= 0 || lvl >= sk.maxLvl;
      plus.addEventListener('click', e => {
        e.stopPropagation();
        if (pl.skillPts > 0 && lvl < sk.maxLvl) {
          pl.skills[sk.id] = lvl + 1;
          pl.skillPts--;
          if (lvl === 0 && sk.arch !== 'passive') WUI.ensurePlayer(pl), this.autoBind(sk.id);
          Ent.computeDerived(pl);
          sfx('levelup');
          this.renderSkills();
        }
      });
      row.appendChild(plus);
      this.hookTip(row, () => this.skillTip(sk, Math.max(1, Ent.skillLvl(pl, sk.id))));
      if (sk.arch !== 'passive') {
        // pick the skill up onto the cursor, WoW-style, then drop it on an action slot
        row.addEventListener('mousedown', e => {
          if (e.button !== 0 || lvl <= 0) return;
          if (e.target.classList.contains('skill-plus')) return;
          WUI.pickupEntry({ t: 'skill', id: sk.id });
          this.closeAll();
        });
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (lvl > 0) { WUI.setSlot('rmb', { t: 'skill', id: sk.id }); this.renderSkills(); }
        });
      }
      grid.appendChild(row);
    });
    p.appendChild(grid);
    p.insertAdjacentHTML('beforeend', '<div style="text-align:center;color:#5f5237;font-size:11px;margin-top:10px">Click a learned skill to pick it up, then drop it on an action bar slot · right-click binds to RMB</div>');
  },

  autoBind(skId) {
    const pl = G.player;
    const bound = (pl.bars.lmb && pl.bars.lmb.id === skId) || (pl.bars.rmb && pl.bars.rmb.id === skId) ||
      pl.bars.slots.some(s => s && s.t === 'skill' && s.id === skId);
    if (bound) return;
    if (!pl.bars.rmb) { WUI.setSlot('rmb', { t: 'skill', id: skId }); return; }
    for (let i = 0; i < 10; i++) if (!pl.bars.slots[i]) { WUI.setSlot(i, { t: 'skill', id: skId }); return; }
  },

  bindLabel(skId) {
    const pl = G.player;
    if (!pl.bars) return '';
    const binds = [];
    if (pl.bars.lmb && pl.bars.lmb.id === skId) binds.push('LMB');
    if (pl.bars.rmb && pl.bars.rmb.id === skId) binds.push('RMB');
    pl.bars.slots.forEach((s, i) => { if (s && s.t === 'skill' && s.id === skId) binds.push(WUI.keyLabel('slot' + (i + 1))); });
    return binds.length ? '⌨ bound to: ' + binds.join(', ') : '';
  },

  skillTip(sk, lvl) {
    const pl = G.player;
    let h = `<div class="tt-name" style="color:${ELEM[sk.elem].color}">${sk.name}</div>`;
    h += `<div class="tt-type">${sk.arch.toUpperCase()} · ${ELEM[sk.elem].name} · Level ${lvl}</div>`;
    h += `<div>${U.esc(sk.desc)}</div><div style="margin-top:5px">`;
    if (sk.wd) h += `<div class="tt-stat">${Math.round(sk.wd + (sk.wdLvl || 0) * (lvl - 1))}% weapon damage</div>`;
    if (sk.dmg) {
      const g = 1 + (sk.dmgLvl || 0.3) * (lvl - 1);
      const sp = pl.derived ? pl.derived.spellPower : 1;
      h += `<div class="tt-stat">${Math.floor(sk.dmg[0] * g * sp)}–${Math.floor(sk.dmg[1] * g * sp)} ${ELEM[sk.elem].name.toLowerCase()} damage</div>`;
    }
    if (sk.count) h += `<div class="tt-stat">${sk.count + Math.floor((sk.countLvl || 0) * (lvl - 1))} projectiles</div>`;
    if (sk.buff) { for (const k in sk.buff) h += `<div class="tt-stat">${Items.statLine(k, Math.round(sk.buff[k] * (1 + 0.14 * (lvl - 1)) * 10) / 10)}</div>`; }
    if (sk.passive) { for (const k in sk.passive) h += `<div class="tt-stat">${Items.statLine(k, Math.round(sk.passive[k] * lvl * 10) / 10)} (total)</div>`; }
    if (sk.debuff) {
      if (sk.debuff.slow) h += `<div class="tt-stat">Slows by ${Math.round(sk.debuff.slow * 100)}%</div>`;
      if (sk.debuff.dmgTaken) h += `<div class="tt-stat">+${Math.round(sk.debuff.dmgTaken * 100)}% damage taken</div>`;
      if (sk.debuff.weaken) h += `<div class="tt-stat">-${Math.round(sk.debuff.weaken * 100)}% enemy damage</div>`;
      if (sk.debuff.dot) h += `<div class="tt-stat">${Math.round(sk.debuff.dot)} damage/sec</div>`;
    }
    if (sk.heal) h += `<div class="tt-stat">Heals ${Math.round(sk.heal + (sk.healLvl || 0) * (lvl - 1))}</div>`;
    if (sk.arch !== 'passive') h += `<div style="color:#6a8aff">Mana: ${Ent.manaCost(sk, lvl)}</div>`;
    if (sk.cd) h += `<div style="color:#847252">Cooldown: ${sk.cd}s</div>`;
    h += '</div>';
    return h;
  },

  // ---------------- vendor / gamble / stash / healer ----------------
  renderVendor() {
    const p = this.panel('vendor'), pl = G.player;
    this.head(p, 'KORGA\'S FORGE');
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">“${U.esc(U.pick(U.rand, NPCS.find(n => n.id === 'smith').lines))}”</div>
      <div class="gold-row">⛁ ${U.fmt(pl.gold)} gold</div>
      <h2 style="font-size:14px;margin-top:8px">FOR SALE</h2>`);
    const list = document.createElement('div');
    list.className = 'shop-list';
    G.shopStock.forEach((it, i) => {
      if (!it) return;
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.style.width = '54px'; cell.style.height = '54px';
      cell.appendChild(Sprites.itemIcon(it, 50));
      cell.style.borderColor = Items.rarityColor(it.rarity);
      this.hookTip(cell, () => Items.tooltip(it, pl) + `<div class="q-gold">Buy for ${U.fmt(it.price)} gold</div>`);
      cell.addEventListener('click', () => {
        if (pl.gold >= it.price && pl.inv.filter(Boolean).length < 48) {
          pl.gold -= it.price; Game.giveItem(it); G.shopStock[i] = null;
          sfx('gold'); this.renderVendor();
        } else sfx('nope');
      });
      list.appendChild(cell);
    });
    p.appendChild(list);
    p.insertAdjacentHTML('beforeend', '<h2 style="font-size:14px;margin-top:12px">YOUR GOODS — click to sell</h2>');
    const inv = document.createElement('div');
    inv.className = 'shop-list';
    pl.inv.forEach((it, i) => {
      if (!it) return;
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.appendChild(Sprites.itemIcon(it, 44));
      cell.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
      this.hookTip(cell, () => Items.tooltip(it, pl) + `<div class="q-gold">Sell for ${U.fmt(Items.sellPrice(it))} gold</div>`);
      cell.addEventListener('click', () => {
        pl.gold += Items.sellPrice(it);
        pl.inv[i] = null;
        sfx('gold');
        this.renderVendor();
      });
      inv.appendChild(cell);
    });
    p.appendChild(inv);
  },

  renderGamble() {
    const p = this.panel('gamble'), pl = G.player;
    this.head(p, 'VEX\'S GAME OF CHANCE');
    const cost = 60 + pl.lvl * 14;
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">“${U.esc(U.pick(U.rand, NPCS.find(n => n.id === 'gambler').lines))}”</div>
      <div class="gold-row">⛁ ${U.fmt(pl.gold)} gold</div>`);
    const opts = document.createElement('div');
    opts.className = 'npc-opts';
    const slots = [['weapon', 'A mystery weapon'], ['helm', 'A mystery helm'], ['chest', 'Mystery armor'], ['ring', 'A mystery ring'], ['amulet', 'A mystery amulet']];
    for (const [type, label] of slots) {
      const b = document.createElement('button');
      b.textContent = `${label} — ${U.fmt(cost)} gold`;
      b.addEventListener('click', () => {
        if (pl.gold < cost) { sfx('nope'); return; }
        if (pl.inv.filter(Boolean).length >= 48) { this.announce('Inventory full!', '#ff6a5a'); return; }
        pl.gold -= cost;
        let ftype = type;
        if (type === 'weapon') ftype = U.pick(U.rand, WEAPON_TYPES).id;
        const rarity = U.weighted(U.rand, [['unique', 4], ['set', 5], ['rare', 34], ['magic', 57]]);
        const it = Items.generate(pl.lvl + U.ri(U.rand, 0, 4), { forceRarity: rarity, forceType: ftype, classId: pl.cls });
        Game.giveItem(it);
        sfx(rarity === 'unique' || rarity === 'set' ? 'unique' : rarity === 'rare' ? 'rare' : 'gold');
        this.announce(`Gambled: ${it.name}`, Items.rarityColor(it.rarity));
        this.renderGamble();
      });
      opts.appendChild(b);
    }
    p.appendChild(opts);
  },

  renderStash() {
    const p = this.panel('stash'), pl = G.player;
    this.head(p, 'SHARED VAULT');
    p.insertAdjacentHTML('beforeend', '<div class="npc-line">Items placed here are shared between all your heroes.</div>');
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    for (let i = 0; i < 48; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      const it = G.stash[i];
      if (it) {
        cell.appendChild(Sprites.itemIcon(it, 44));
        cell.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
        this.hookTip(cell, () => Items.tooltip(it, pl) + '<div style="color:#847252;font-size:11px">Click: take</div>');
        cell.addEventListener('click', () => {
          if (pl.inv.filter(Boolean).length < 48) { G.stash[i] = null; Game.giveItem(it); Save.saveStash(); this.renderStash(); }
        });
      }
      grid.appendChild(cell);
    }
    p.appendChild(grid);
    p.insertAdjacentHTML('beforeend', '<h2 style="font-size:14px;margin-top:10px">YOUR PACK — click to deposit</h2>');
    const inv = document.createElement('div');
    inv.className = 'shop-list';
    pl.inv.forEach((it, i) => {
      if (!it) return;
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.appendChild(Sprites.itemIcon(it, 44));
      this.hookTip(cell, () => Items.tooltip(it, pl));
      cell.addEventListener('click', () => {
        for (let s = 0; s < 48; s++) if (!G.stash[s]) { G.stash[s] = it; pl.inv[i] = null; break; }
        Save.saveStash(); this.renderStash();
      });
      inv.appendChild(cell);
    });
    p.appendChild(inv);
  },

  npcDialog(npc, nodeId) {
    const p = this.panel('npc');
    this.closeAll();
    this.openPanel = 'npc';
    p.classList.remove('hidden');
    this.head(p, npc.def.name.toUpperCase());
    const pl = G.player;
    pl.dialogue = Dialogue.migrate(pl.dialogue);
    const graph = Dialogue.graphs[npc.id];
    const currentId = graph && graph.nodes[nodeId] ? nodeId : graph && graph.start;
    const node = graph && graph.nodes[currentId];
    if (node) {
      Dialogue.visit(pl.dialogue, npc.id, currentId);
      Save.saveChar(pl);
    }
    const line = node ? node.text : U.pick(U.rand, npc.def.lines);
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">“${U.esc(line)}”</div>`);
    const opts = document.createElement('div');
    opts.className = 'npc-opts';
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      opts.appendChild(b);
    };
    if (node) for (const choice of node.choices || []) {
      const consequenceId = `${npc.id}.${choice.id}`;
      if (!Dialogue.meets(choice.condition, pl, pl.dialogue, npc.id)) continue;
      if (choice.once && pl.dialogue.consequences[consequenceId]) continue;
      add(choice.text, () => {
        // Re-resolve and revalidate mutable requirements to prevent stale UI
        // state from spending or granting only part of a consequence.
        if (!Dialogue.meets(choice.condition, pl, pl.dialogue, npc.id)) { sfx('nope'); return; }
        const passed = !choice.skillCheck || Dialogue.stat(pl, choice.skillCheck.stat) >= choice.skillCheck.dc;
        const effects = choice.effects && !Array.isArray(choice.effects)
          ? choice.effects[passed ? 'success' : 'failure'] : choice.effects;
        if (!Dialogue.applyEffects(effects, pl, pl.dialogue)) { sfx('nope'); return; }
        if (choice.once || (effects && effects.length)) pl.dialogue.consequences[consequenceId] = true;
        Save.saveChar(pl);
        this.npcDialog(npc, passed ? (choice.success || choice.next) : (choice.failure || choice.next));
      });
    }
    switch (npc.id) {
      case 'healer': {
        add('Heal my wounds (free)', () => {
          pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
          sfx('shrine'); this.announce('You feel whole again.', '#6be26b'); this.closeAll();
        });
        const hpCost = 20 + pl.lvl * 6, mpCost = 20 + pl.lvl * 6;
        add(`Buy healing potion — ${hpCost}g`, () => { if (pl.gold >= hpCost && pl.potions.hp < 20) { pl.gold -= hpCost; pl.potions.hp++; sfx('gold'); this.npcDialog(npc); } else sfx('nope'); });
        add(`Buy mana potion — ${mpCost}g`, () => { if (pl.gold >= mpCost && pl.potions.mp < 20) { pl.gold -= mpCost; pl.potions.mp++; sfx('gold'); this.npcDialog(npc); } else sfx('nope'); });
        break;
      }
      case 'smith': add('Trade', () => { Game.restock(); this.open('vendor'); }); break;
      case 'gambler': add('Gamble', () => this.open('gamble')); break;
      case 'stash': add('Open the vault', () => this.open('stash')); break;
    }
    add('Farewell', () => this.closeAll());
    p.appendChild(opts);
  },

  // ---------------- waypoint ----------------
  renderWaypoint() {
    const p = this.panel('waypoint'), pl = G.player;
    this.head(p, 'WAYPOINT');
    p.insertAdjacentHTML('beforeend', '<div class="npc-line">The old stones hum. They remember every road.</div>');
    const opts = document.createElement('div');
    opts.className = 'npc-opts';
    ACTS.forEach((act, i) => {
      const b = document.createElement('button');
      const locked = i > pl.progress.actUnlocked;
      b.innerHTML = `Act ${U.roman(i + 1)} — ${act.name} ${locked ? '🔒' : ''}<div style="font-size:11px;color:#8a7444">Monster level ${act.mlvl}+ ${pl.progress.bossKilled[i] ? '· boss slain ✓' : ''}</div>`;
      if (locked) { b.style.opacity = 0.4; }
      else b.addEventListener('click', () => { this.closeAll(); Game.enterDungeon(i, 1); });
      opts.appendChild(b);
    });
    if (pl.progress.actUnlocked > 4 || pl.progress.bossKilled[4]) {
      const next = (pl.progress.abyssBest || 0) + 1;
      const b = document.createElement('button');
      b.innerHTML = `⚫ THE ENDLESS ABYSS — descend to floor ${next}<div style="font-size:11px;color:#8a7444">Monster level ${ABYSS.mlvl0 + (next - 1) * 2} · ladder ranking</div>`;
      b.style.borderColor = '#7a1408';
      b.addEventListener('click', () => { this.closeAll(); Game.enterDungeon('abyss', 1, next); });
      opts.appendChild(b);
      if (next > 1) {
        const b1 = document.createElement('button');
        b1.textContent = 'The Endless Abyss — floor 1';
        b1.addEventListener('click', () => { this.closeAll(); Game.enterDungeon('abyss', 1, 1); });
        opts.appendChild(b1);
      }
    }
    p.appendChild(opts);
  },

  // ---------------- ladder / seasons ----------------
  genRivals(seasonNum) {
    const rng = makeRng(hashStr('season' + seasonNum));
    const s = SEASON.current();
    const prog = Math.min(1, s.day / SEASON.lengthDays + 0.08);
    const out = [];
    const N = 2500;
    for (let i = 0; i < N; i++) {
      const name = U.pick(rng, RIVAL_TAGS) + U.pick(rng, RIVAL_SYL_A) + U.pick(rng, RIVAL_SYL_B) + (U.chance(rng, 0.16) ? U.ri(rng, 2, 99) : '');
      const skill = Math.pow(rng(), 1.8);          // most players are casual
      const lvl = Math.max(1, Math.min(99, Math.floor(skill * 99 * (0.25 + prog * 0.85) + rng() * 6)));
      const hardcore = U.chance(rng, 0.28);
      out.push({
        name, cls: U.pick(rng, CLASSES).id, lvl,
        xp: XP_TABLE(lvl) + Math.floor(rng() * (XP_TABLE(lvl + 1) - XP_TABLE(lvl))),
        abyss: lvl > 55 ? Math.floor((lvl - 52) * skill * 1.6 * (0.4 + prog)) : 0,
        hardcore, dead: hardcore && U.chance(rng, 0.35), rival: true,
      });
    }
    return out;
  },

  renderLadder() {
    const p = this.panel('ladder');
    const s = SEASON.current();
    this.head(p, `SEASON ${s.num} LADDER — ${s.name.toUpperCase()}`);
    p.insertAdjacentHTML('beforeend', `<div style="text-align:center;color:#8a7444;font-size:12px;margin-bottom:8px">Day ${s.day} of ${SEASON.lengthDays} · resets in ${s.daysLeft} days · ${(2500 + Save.listChars().length).toLocaleString()} competitors</div>`);
    const tabs = document.createElement('div');
    tabs.className = 'ladder-tabs';
    ['OVERALL', 'ABYSS DEPTH', 'HARDCORE'].forEach((t, i) => {
      const b = document.createElement('div');
      b.className = 'tree-tab' + (i === this.ladderTab ? ' active' : '');
      b.textContent = t;
      b.addEventListener('click', () => { this.ladderTab = i; this.renderLadder(); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs);

    let entries = this.genRivals(s.num);
    for (const c of Save.listChars()) {
      entries.push({ name: c.name, cls: c.cls, lvl: c.lvl, xp: c.xp, abyss: c.progress.abyssBest || 0, hardcore: c.hardcore, dead: c.dead, me: true });
    }
    if (this.ladderTab === 1) { entries = entries.filter(e => e.abyss > 0 || e.me); entries.sort((a, b) => b.abyss - a.abyss || b.lvl - a.lvl); }
    else if (this.ladderTab === 2) { entries = entries.filter(e => e.hardcore); entries.sort((a, b) => b.lvl - a.lvl || b.xp - a.xp); }
    else entries.sort((a, b) => b.lvl - a.lvl || b.xp - a.xp);

    let h = '<table class="ladder-table"><tr><th>RANK</th><th>HERO</th><th>CLASS</th><th>LEVEL</th><th>ABYSS</th><th></th></tr>';
    const myRows = [];
    entries.forEach((e, i) => { e.rank = i + 1; if (e.me) myRows.push(e); });
    const top = entries.slice(0, 60);
    for (const e of top) h += this.ladderRow(e);
    for (const e of myRows) if (e.rank > 60) h += '<tr><td colspan="6" style="text-align:center;color:#5f5237">···</td></tr>' + this.ladderRow(e);
    h += '</table>';
    p.insertAdjacentHTML('beforeend', h);
  },

  ladderRow(e) {
    const cls = CLASSES.find(c => c.id === e.cls);
    const rankCls = e.rank <= 3 ? ' class="rank-' + e.rank + '"' : '';
    return `<tr class="${e.me ? 'me' : ''}${e.dead ? ' rip' : ''}">
      <td${rankCls}>#${e.rank}</td>
      <td>${U.esc(e.name)}${e.me ? ' ✦' : ''}${e.dead ? ' ☠' : ''}</td>
      <td>${cls ? cls.name : '?'}</td><td>${e.lvl}</td><td>${e.abyss || '—'}</td>
      <td>${e.hardcore ? '<span class="hc-tag">HC</span>' : ''}</td></tr>`;
  },

  // ---------------- death & pause ----------------
  showDeath(hardcore) {
    this.closeAll();
    const p = this.panel('death');
    this.openPanel = 'death';
    p.classList.remove('hidden');
    p.innerHTML = `<h2>YOU HAVE DIED</h2>`;
    if (hardcore) {
      p.insertAdjacentHTML('beforeend', `<div class="npc-line">Hardcore death is forever. ${U.esc(G.player.name)} joins the long silence.<br>Level ${G.player.lvl} · ${U.fmt(G.stats.kills)} monsters slain</div>`);
      const b = document.createElement('button');
      b.className = 'big-btn';
      b.textContent = 'ASHES TO ASHES';
      b.addEventListener('click', () => location.reload()); // the fallen hero stays on the ladder, marked ☠
      p.appendChild(b);
    } else {
      p.insertAdjacentHTML('beforeend', `<div class="npc-line">Death takes its tithe: 10% of your gold.<br>The town shrine rekindles your flame.</div>`);
      const b = document.createElement('button');
      b.className = 'big-btn';
      b.textContent = 'RISE AGAIN';
      b.addEventListener('click', () => { this.closeAll(); Game.respawn(); });
      p.appendChild(b);
    }
  },

  renderPauseMenu() {
    const p = this.panel('menu');
    this.head(p, 'CATCH YOUR BREATH');
    const list = document.createElement('div');
    list.className = 'menu-list';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); list.appendChild(b); };
    add('Resume', () => this.closeAll());
    add('Settings', () => this.open('settings'));
    add('Quest log', () => this.open('quests'));
    add('Edit interface layout', () => { this.closeAll(); WUI.setEditMode(true); });
    add('Return to town', () => { this.closeAll(); Game.toTown(); });
    add('Save & quit to menu', () => { Save.saveChar(G.player); location.reload(); });
    p.appendChild(list);
    p.insertAdjacentHTML('beforeend', `<div style="margin-top:12px;text-align:center;color:#5f5237;font-size:11px;line-height:1.7">
      Move — ${WUI.keyLabel('moveU')}${WUI.keyLabel('moveL')}${WUI.keyLabel('moveD')}${WUI.keyLabel('moveR')} · LMB/RMB + slots 1-0 — action bar<br>
      ${WUI.keyLabel('potHp')}/${WUI.keyLabel('potMp')} — potions · ${WUI.keyLabel('quests')} — quests · ${WUI.keyLabel('settings')} — settings · ${WUI.keyLabel('chat')} — chat<br>
      All keys rebindable in Settings → Keybinds</div>`);
  },

  // ---------------- main menu (character select) ----------------
  selClass: null,
  initMenu() {
    const s = SEASON.current();
    document.getElementById('season-banner').textContent =
      `❖ SEASON ${s.num}: ${s.name.toUpperCase()} — day ${s.day}, resets in ${s.daysLeft} days ❖`;
    this.refreshCharList();
    document.getElementById('btn-new').addEventListener('click', () => {
      document.getElementById('create-panel').classList.remove('hidden');
      document.getElementById('menu-buttons').classList.add('hidden');
      document.getElementById('char-list').classList.add('hidden');
      this.buildClassCards();
    });
    document.getElementById('btn-back').addEventListener('click', () => {
      document.getElementById('create-panel').classList.add('hidden');
      document.getElementById('menu-buttons').classList.remove('hidden');
      document.getElementById('char-list').classList.remove('hidden');
    });
    document.getElementById('btn-ladder-menu').addEventListener('click', () => {
      document.getElementById('menu-screen').style.zIndex = 20;
      this.open('ladder');
    });
    document.getElementById('btn-create').addEventListener('click', () => {
      const name = document.getElementById('char-name').value.trim();
      if (!name) { document.getElementById('char-name').style.borderColor = '#ff5a3c'; return; }
      if (!this.selClass) { return; }
      if (Save.listChars().some(c => c.name.toLowerCase() === name.toLowerCase())) {
        document.getElementById('char-name').value = '';
        document.getElementById('char-name').placeholder = 'That name is taken...';
        return;
      }
      const hc = document.getElementById('hc-check').checked;
      Game.newGame(name, this.selClass, hc);
    });
    this.menuFx();
  },

  refreshCharList() {
    const wrap = document.getElementById('char-list');
    wrap.innerHTML = '';
    const chars = Save.listChars();
    for (const c of chars) {
      const cls = CLASSES.find(x => x.id === c.cls);
      const div = document.createElement('div');
      div.className = 'char-slot' + (c.dead ? ' dead' : '');
      const face = document.createElement('canvas');
      face.width = 48; face.height = 48;
      const sheet = Sprites.getActor(c.cls);
      face.getContext('2d').drawImage(sheet.canvas, 0, 6 * sheet.cell, sheet.cell, sheet.cell, -6, -4, 60, 60);
      div.appendChild(face);
      div.insertAdjacentHTML('beforeend', `<div><div class="cs-name">${U.esc(c.name)} ${c.hardcore ? '<span class="hc-tag">HARDCORE</span>' : ''} ${c.dead ? '☠' : ''}</div>
        <div class="cs-sub">Level ${c.lvl} ${cls.name} · Act ${U.roman((c.progress.actUnlocked || 0) + 1)}${c.progress.abyssBest ? ' · Abyss ' + c.progress.abyssBest : ''}</div></div>
        <div class="cs-del" title="Delete hero">✕</div>`);
      div.querySelector('.cs-del').addEventListener('click', e => {
        e.stopPropagation();
        if (div.dataset.confirm) { Save.deleteChar(c.name, false); this.refreshCharList(); }
        else { div.dataset.confirm = '1'; div.querySelector('.cs-del').textContent = 'sure?'; }
      });
      if (!c.dead) div.addEventListener('click', () => Game.loadGame(c.name));
      wrap.appendChild(div);
    }
  },

  buildClassCards() {
    const wrap = document.getElementById('class-cards');
    if (wrap.childElementCount) return;
    for (const cls of CLASSES) {
      const card = document.createElement('div');
      card.className = 'class-card';
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const sheet = Sprites.getActor(cls.id);
      cv.getContext('2d').drawImage(sheet.canvas, 0, 6 * sheet.cell, sheet.cell, sheet.cell, -4, -6, 76, 76);
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<div class="cc-name">${cls.name}</div><div class="cc-desc">${cls.desc}</div>
        <div class="cc-desc" style="color:#6f8a5a">${cls.trees.map(t => t.name).join(' · ')}</div>`);
      card.addEventListener('click', () => {
        document.querySelectorAll('.class-card').forEach(c => c.classList.remove('sel'));
        card.classList.add('sel');
        this.selClass = cls.id;
        sfx('ui');
      });
      wrap.appendChild(card);
    }
  },

  menuFx() {
    const cv = document.getElementById('menu-fx');
    const ctx = cv.getContext('2d');
    const embers = [];
    const tick = () => {
      if (document.getElementById('menu-screen').classList.contains('hidden')) return;
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      if (embers.length < 60 && Math.random() < 0.4)
        embers.push({ x: Math.random() * cv.width, y: cv.height + 10, vy: -(20 + Math.random() * 50) / 60, vx: (Math.random() - 0.5) * 0.6, r: 1 + Math.random() * 2.2, a: 0.5 + Math.random() * 0.5 });
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.y += e.vy; e.x += e.vx + Math.sin(e.y * 0.02) * 0.4; e.a -= 0.0016;
        if (e.y < -10 || e.a <= 0) { embers.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 80)},40,${e.a})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      }
      this.menuFxT = requestAnimationFrame(tick);
    };
    tick();
  },
};
