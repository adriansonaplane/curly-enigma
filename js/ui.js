// ============ DIABLOID: ui.js — HUD, panels, menu, ladder ============
'use strict';

// Owns inventory view state and all item transfers.
// Supports a 10-column x 6-row grid with variable-size item footprints.
// Items store their anchor position as _gx, _gy (top-left cell).
// An occupancy grid tracks which cells are taken by which item id.
class InventoryGridController {
  constructor() {
    this.query = ''; this.filter = 'all'; this.sort = 'position';
    this.COLS = 10; this.ROWS = 6;
  }

  dimensions(item) {
    const size = Items.sizeOf(item);
    return Array.isArray(size) && size.length === 2 && size.every(Number.isInteger) && size.every(value => value > 0)
      ? size : null;
  }

  matches(item) {
    if (!item) return true;
    const q = this.query.trim().toLowerCase();
    if (q && ![Items.displayName(item), item.baseName, item.type, item.slot, item.rarity, item.kind, item.form,
      Items.isCharmRecord(item) ? 'charm carried talisman' : '',
      Items.isIdentifyScroll(item) ? 'scroll identification utility' : '']
      .some(value => String(value || '').toLowerCase().includes(q))) return false;
    const component = !!(item.component || item.kind === 'gem' || item.kind === 'rune' || Items.isIdentifyScroll(item));
    const charm = Items.isCharmRecord(item);
    return this.filter === 'all' || item.rarity === this.filter ||
      (this.filter === 'equipment' && !item.potion && !component && !charm && !!item.slot) ||
      (this.filter === 'charms' && charm) ||
      (this.filter === 'components' && component);
  }

  // Build an occupancy grid from a flat inventory array.
  // Returns a 2D array [row][col] = exact item object or null. Object identity
  // prevents a duplicate id from being mistaken for the item being moved.
  buildOccupancy(inv, ignoreItem = null) {
    const occ = [];
    for (let r = 0; r < this.ROWS; r++) { occ[r] = []; for (let c = 0; c < this.COLS; c++) occ[r][c] = null; }
    for (const item of Array.isArray(inv) ? inv : []) {
      if (!item || item === ignoreItem || !Number.isInteger(item._gx) || !Number.isInteger(item._gy)) continue;
      const size = this.dimensions(item);
      if (!size) continue;
      const [w, h] = size;
      if (item._gx < 0 || item._gy < 0 || item._gx + w > this.COLS || item._gy + h > this.ROWS) continue;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const r = item._gy + dy, c = item._gx + dx;
        if (!occ[r][c]) occ[r][c] = item;
      }
    }
    return occ;
  }

  // Check if item with given size can be placed at (col, row).
  canPlace(item, col, row, inv, ignoreItem = null) {
    const size = this.dimensions(item);
    if (!size || !Number.isInteger(col) || !Number.isInteger(row)) return false;
    const [w, h] = size;
    if (col < 0 || row < 0 || col + w > this.COLS || row + h > this.ROWS) return false;
    const occ = this.buildOccupancy(inv, ignoreItem);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const cell = occ[row + dy][col + dx];
      if (cell) return false;
    }
    return true;
  }

  // Find first available position for an item in the grid. Returns {col, row} or null.
  findSpace(item, inv, ignoreItem = null) {
    const size = this.dimensions(item);
    if (!size) return null;
    const [w, h] = size;
    const occ = this.buildOccupancy(inv, ignoreItem);
    for (let r = 0; r <= this.ROWS - h; r++) {
      for (let c = 0; c <= this.COLS - w; c++) {
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) {
          const cell = occ[r + dy][c + dx];
          if (cell) ok = false;
        }
        if (ok) return { col: c, row: r };
      }
    }
    return null;
  }

  // Place item into inventory at (col, row). Modifies item._gx, _gy and adds to inv array.
  placeItem(item, col, row, inv) {
    item._gx = col; item._gy = row;
    // Add to flat inv if not already there
    if (!inv.includes(item)) inv.push(item);
  }

  // Remove item from inventory array.
  removeItem(item, inv) {
    const idx = inv.indexOf(item);
    if (idx >= 0) inv.splice(idx, 1);
  }

  // Get unique items (each item once, based on id).
  uniqueItems(inv) {
    const objects = new Set(), ids = new Set();
    return (Array.isArray(inv) ? inv : []).filter(item => {
      if (!item || objects.has(item) || (typeof item.id === 'string' && ids.has(item.id))) return false;
      objects.add(item); if (typeof item.id === 'string') ids.add(item.id); return true;
    });
  }

  // Migrate a legacy flat 48-slot inventory to the grid system.
  // Items without _gx/_gy get auto-placed. Items that don't fit remain as-is
  // (they'll need manual arrangement).
  migrateInv(inv) {
    // Already an object-based inv (array of items without nulls for empty slots)
    // or legacy 48-slot with positional nulls.
    const items = (Array.isArray(inv) ? inv : []).filter(it =>
      it !== null && typeof it === 'object' && !Array.isArray(it));
    const placed = [];
    for (const item of items) {
      let anchorIsLegal = false;
      try {
        anchorIsLegal = Number.isInteger(item._gx) && Number.isInteger(item._gy) &&
          this.canPlace(item, item._gx, item._gy, placed);
      } catch (_error) { continue; }
      if (!anchorIsLegal) {
        let pos = null;
        try { pos = this.findSpace(item, placed); } catch (_error) { continue; }
        if (pos) {
          try {
            item._gx = pos.col; item._gy = pos.row;
            if (item._gx !== pos.col || item._gy !== pos.row) continue;
          } catch (_error) { continue; }
        } else {
          // An item that cannot currently fit remains fail-closed and unplaced.
          // Immutable invalid anchors cannot be repaired, so prune them rather
          // than letting a later strict-mode assignment crash every panel.
          try {
            delete item._gx; delete item._gy;
            if ('_gx' in item || '_gy' in item) continue;
          } catch (_error) { continue; }
        }
      }
      placed.push(item);
    }
    return placed;
  }

  // Ensure player inventory is migrated to grid format.
  ensureGrid(pl) {
    pl.inv = this.migrateInv(pl.inv);
    pl._invMigrated = true;
  }

  source(event) {
    try { return JSON.parse(event.dataTransfer.getData('application/x-diabloid-item')); }
    catch (e) { return null; }
  }
  begin(event, source) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-diabloid-item', JSON.stringify(source));
  }
  itemAt(source) {
    if (!source) return null;
    if (source.kind === 'equip') return G.player.equip[source.slot];
    // Grid-based: find by item id
    if (source.itemId) return G.player.inv.find(it => it && it.id === source.itemId) || null;
    // Legacy position-based
    return G.player.inv[source.position] || null;
  }
  accepts(item, slot) {
    return !!item && !item.potion && !item.component && !Items.isIdentifyScroll(item) && !Items.isCharmRecord(item) && !Items.needsIdentification(item) &&
      item.kind !== 'gem' && item.kind !== 'rune' && (item.slot === slot ||
      (item.slot === 'ring' && (slot === 'ring1' || slot === 'ring2')));
  }

  // Move an item to grid position (col, row).
  moveToGrid(source, col, row) {
    const pl = G.player, item = this.itemAt(source);
    if (!item) return false;
    if (source.kind === 'inv' || source.itemId) {
      // Moving within inventory
      if (!this.canPlace(item, col, row, pl.inv, item)) return false;
      item._gx = col; item._gy = row;
    } else {
      // Moving from equipment to inventory
      if (!this.canPlace(item, col, row, pl.inv)) return false;
      pl.equip[source.slot] = null;
      item._gx = col; item._gy = row;
      pl.inv.push(item);
      Ent.refreshDerived(pl);
    }
    Save.saveChar(pl); return true;
  }

  // Legacy moveToPosition for backward compat
  moveToPosition(source, position) {
    // Convert flat position to grid coords
    const col = position % this.COLS, row = Math.floor(position / this.COLS);
    return this.moveToGrid(source, col, row);
  }

  equip(source, slot) {
    const pl = G.player, item = this.itemAt(source);
    if (!item || item.potion || (item.reqLvl || 1) > pl.lvl) return false;
    if (Items.isCharmRecord(item)) { UI.announce('Charms are active only while carried in the inventory grid.', '#8fc8ff'); return false; }
    if (Items.needsIdentification(item)) { UI.announce('Identify this item before equipping it.', '#d8b9ff'); return false; }
    if (!this.accepts(item, slot)) { UI.announce(`That item cannot be equipped as ${slot}`, '#ff6a5a'); return false; }
    if (source.kind === 'equip') {
      if (source.slot === slot) return false;
      if (pl.equip[slot] && !this.accepts(pl.equip[slot], source.slot)) {
        UI.announce('Those equipment slots cannot be swapped', '#ff6a5a'); return false;
      }
      [pl.equip[source.slot], pl.equip[slot]] = [pl.equip[slot], pl.equip[source.slot]];
    } else {
      const old = pl.equip[slot];
      let oldPlace = null;
      if (old) {
        const remaining = pl.inv.slice();
        const sourceIndex = remaining.indexOf(item);
        if (sourceIndex >= 0) remaining.splice(sourceIndex, 1);
        if (this.canPlace(old, item._gx, item._gy, remaining)) oldPlace = { col: item._gx, row: item._gy };
        else oldPlace = this.findSpace(old, remaining);
        if (!oldPlace) {
          UI.announce('Make room for the displaced equipment first.', '#ff6a5a');
          sfx('nope'); return false;
        }
      }
      // Remove from inv
      this.removeItem(item, pl.inv);
      pl.equip[slot] = item;
      if (old) {
        old._gx = oldPlace.col; old._gy = oldPlace.row; pl.inv.push(old);
      }
    }
    Ent.refreshDerived(pl);
    Save.saveChar(pl); sfx('equip'); return true;
  }
  dropToWorld(source) {
    const pl = G.player, item = this.itemAt(source);
    if (!item) return false;
    if (source.kind === 'inv' || source.itemId) this.removeItem(item, pl.inv);
    else { pl.equip[source.slot] = null; }
    G.groundItems.push({ x: pl.x, y: pl.y, item });
    Ent.refreshDerived(pl);
    Save.saveChar(pl); UI.announce(`Dropped ${Items.displayName(item)}`, '#d8c9a3'); return true;
  }
}

const UI = {
  els: {}, openPanel: null, treeTab: 0, ladderTab: 0, menuFxT: null,
  inventoryGrid: new InventoryGridController(),
  socketSelection: null, identificationSelection: null, cubeSelection: [], cubeRecipesOpen: true,

  init() {
    const ids = ['hud', 'zone-label', 'announce', 'hp-fill', 'mp-fill', 'hp-text', 'mp-text', 'xp-fill',
      'hp-pot-n', 'mp-pot-n', 'boss-bar', 'boss-name', 'boss-fill', 'buff-bar', 'tooltip', 'menu-screen'];
    for (const id of ids) this.els[id] = document.getElementById(id);
    document.querySelectorAll('#hud-buttons button[data-panel]').forEach(b =>
      b.addEventListener('click', () => this.toggle(b.dataset.panel)));
    // Kept dynamic so older saves/pages do not need a markup migration.
    if (!this.panel('cube')) {
      const cube = document.createElement('div'); cube.id = 'panel-cube'; cube.className = 'panel wide hidden';
      document.getElementById('panels').appendChild(cube);
    }
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
    tx = U.clamp(tx, 8, Math.max(8, innerWidth - r.width - 8));
    ty = U.clamp(ty, 6, Math.max(6, innerHeight - r.height - 8));

    // Inventory status surfaces carry the current power state/next action and must remain readable while
    // a keyboard-focused item keeps its tooltip open. Prefer the free space
    // above/below those surfaces instead of merely clamping to the
    // viewport (which can place a tall phone tooltip directly over that bar).
    const statusSurfaces = Array.from(document.querySelectorAll(
      '#panel-inv:not(.hidden) [data-testid="charm-summary"], #panel-inv:not(.hidden) [data-testid="identify-status"]'
    )).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    for (const statusSurface of statusSurfaces) {
      const blocked = statusSurface.getBoundingClientRect();
      const gap = 8;
      const overlapsX = tx < blocked.right + gap && tx + r.width > blocked.left - gap;
      const overlapsY = ty < blocked.bottom + gap && ty + r.height > blocked.top - gap;
      if (overlapsX && overlapsY) {
        const above = blocked.top - r.height - gap;
        const below = blocked.bottom + gap;
        if (above >= 6) ty = above;
        else if (below + r.height <= innerHeight - 8) ty = below;
      }
    }

    ty = U.clamp(ty, 6, Math.max(6, innerHeight - r.height - 8));
    t.style.left = tx + 'px'; t.style.top = ty + 'px';
  },
  hideTip() { this.els.tooltip.classList.add('hidden'); },

  hookTip(el, htmlFn) {
    el.addEventListener('mouseenter', e => this.tip(htmlFn(), e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => this.hideTip());
    el.setAttribute('aria-describedby', 'tooltip');
    el.addEventListener('focus', () => {
      const rect = el.getBoundingClientRect();
      this.tip(htmlFn(), rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    el.addEventListener('blur', () => this.hideTip());
  },

  itemBroken(item) {
    return !Items.needsIdentification(item) && typeof ItemCondition !== 'undefined' && ItemCondition.isBroken(item);
  },
  itemLow(item) {
    if (!item || Items.needsIdentification(item) || typeof ItemCondition === 'undefined') return false;
    const state = ItemCondition.condition(item);
    return state.maxDurability > 0 && state.durability > 0 && state.durability / state.maxDurability <= 0.2;
  },
  itemConditionLabel(item) {
    if (!item || Items.needsIdentification(item) || typeof ItemCondition === 'undefined') return '';
    const state = ItemCondition.condition(item);
    if (!state.maxDurability) return '';
    if (state.durability === 0) return ' (broken)';
    return state.durability / state.maxDurability <= 0.2
      ? ` (low durability, ${state.durability} of ${state.maxDurability})` : '';
  },

  charmCarriedState(item, player = G.player) {
    if (!Items.isCharmRecord(item)) return { active: false, label: '' };
    const aggregate = player && player.charmState;
    const active = !!(aggregate && aggregate.ok && aggregate.activeIds.includes(item.id));
    if (active) return { active: true, label: 'active while carried' };
    if (Items.needsIdentification(item)) return { active: false, label: 'inactive until identified' };
    if (aggregate && !aggregate.ok) return { active: false, label: 'inactive because the inventory grid is invalid' };
    if (player && player.lvl < (item.reqLvl || 1))
      return { active: false, label: `inactive until level ${item.reqLvl}` };
    return { active: false, label: 'inactive while carried' };
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
    this.els['zone-label'].textContent = G.map ? `${G.map.name}${G.map.town ? '' : `  ·  Monster Lvl ${G.map.mlvl + difficultyByIdx(pl.difficultyIdx).mlvlAdd}`}  ·  ${difficultyByIdx(pl.difficultyIdx).name}` : '';
    const equipped = Object.values(pl.equip || {}).filter(Boolean);
    const brokenGear = equipped.filter(item => this.itemBroken(item)).length;
    const lowGear = equipped.filter(item => this.itemLow(item)).length;
    const inventoryButton = this._conditionButton || (this._conditionButton = document.querySelector('#hud-buttons [data-panel="inv"]'));
    if (inventoryButton) {
      inventoryButton.classList.toggle('condition-broken', brokenGear > 0);
      inventoryButton.classList.toggle('condition-low', !brokenGear && lowGear > 0);
      const warning = brokenGear ? ` — ${brokenGear} broken equipped item${brokenGear === 1 ? '' : 's'}`
        : lowGear ? ` — ${lowGear} low-durability equipped item${lowGear === 1 ? '' : 's'}` : '';
      inventoryButton.title = `Inventory (I)${warning}`;
      inventoryButton.setAttribute('aria-label', `Inventory${warning}`);
    }

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
    this.identificationSelection = null;
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
      case 'cube': this.renderCube(); break;
      case 'char': this.renderChar(); break;
      case 'skills': this.renderSkills(); break;
      case 'mercenary': this.renderMercenary(); break;
      case 'ladder': this.renderLadder(); break;
      case 'vendor': this.renderVendor(); break;
      case 'stash': this.renderStash(); break;
      case 'gamble': this.renderGamble(); break;
      case 'waypoint': this.renderWaypoint(); break;
      case 'menu': this.renderPauseMenu(); break;
    }
  },

  renderMercenary() {
    const p = this.panel('mercenary'), pl = G.player, state = pl.mercenary;
    this.head(p, 'MERCENARY COMPANY');
    if (!state) {
      p.insertAdjacentHTML('beforeend', '<div class="npc-line">Hire one permanent retainer. Mercenaries level with you, cross zones, and are separate from temporary summons.</div>');
      for (const def of MERCENARY_ARCHETYPES) {
        const row = document.createElement('div'); row.className = 'vendor-row';
        row.innerHTML = `<div><b>${U.esc(def.name)}</b> — ${U.esc(def.title)} <span class="rarity-magic">${def.role}</span><br><small>${U.esc(def.desc)}</small></div><button>Hire · ${def.hireCost}g</button>`;
        row.querySelector('button').addEventListener('click', () => {
          if (pl.gold < def.hireCost) return this.announce('Not enough gold', '#ff6a5a');
          pl.gold -= def.hireCost; pl.mercenary = { archetypeId: def.id, level: Math.max(1, pl.lvl - 1), xp: 0, equipment: {}, dead: false };
          Ent.syncMercenary(); Save.saveChar(pl); this.renderMercenary();
        }); p.appendChild(row);
      } return;
    }
    const def = MERCENARY_BY_ID[state.archetypeId], d = Ent.mercDerived(state);
    const rez = def.resurrectionBase + state.level * 35;
    p.insertAdjacentHTML('beforeend', `<div class="npc-line"><b>${U.esc(def.name)}, ${U.esc(def.title)}</b> · Level ${state.level} · ${state.dead ? '<span style="color:#ff6a5a">FALLEN</span>' : 'ACTIVE'}<br>Life ${d.maxHp} · Damage ${Math.floor(d.dmgLo)}–${Math.floor(d.dmgHi)} · Armor ${d.armor}<br>Experience ${state.xp}/${Ent.mercXpForLevel(state.level)}</div>`);
    if (state.dead) {
      const b = document.createElement('button'); b.className = 'big-btn'; b.textContent = `Resurrect · ${rez} gold`;
      b.addEventListener('click', () => { if (pl.gold < rez) return this.announce('Not enough gold', '#ff6a5a'); pl.gold -= rez; state.dead = false; Ent.syncMercenary(); Save.saveChar(pl); this.renderMercenary(); }); p.appendChild(b);
    }
    p.insertAdjacentHTML('beforeend', '<h3>EQUIPMENT</h3>');
    for (const slot of def.slots) {
      const item = state.equipment[slot], row = document.createElement('div'); row.className = 'vendor-row';
      const visibleName = item ? Items.displayName(item) : '';
      const unidentified = Items.needsIdentification(item);
      const broken = this.itemBroken(item);
      row.classList.toggle('item-unidentified', unidentified);
      row.classList.toggle('item-broken', broken);
      row.classList.toggle('item-low', this.itemLow(item));
      if (item) {
        row.dataset.testid = `mercenary-item-${item.id}`;
        row.tabIndex = 0;
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', `Mercenary ${slot}: ${visibleName}${this.itemConditionLabel(item)}`);
      }
      row.innerHTML = `<span><b>${slot.toUpperCase()}</b> · ${item ? U.esc(visibleName) : 'Empty'}${unidentified ? ' · <strong class="unidentified-label">UNIDENTIFIED</strong>' : ''}${broken ? ' · <strong class="broken-label">BROKEN</strong>' : ''}</span><button>${item ? 'Unequip' : 'Equip from inventory'}</button>`;
      row.querySelector('button').setAttribute('aria-label', item
        ? `Unequip ${visibleName}${this.itemConditionLabel(item)} from mercenary`
        : `Equip ${slot} from inventory on mercenary`);
      if (item) this.hookTip(row, () => Items.tooltip(item, pl));
      row.querySelector('button').addEventListener('click', () => {
        if (item) { if (!Game.giveItem(item)) return; state.equipment[slot] = null; }
        else {
          const controller = this.inventoryGrid;
          controller.ensureGrid(pl);
          const found = pl.inv.find(it => it && !it.potion && !Items.isCharmRecord(it) && !Items.needsIdentification(it) &&
            (it.slot === slot || (slot === 'offhand' && it.slot === 'offhand')) && (it.reqLvl || 1) <= state.level);
          if (!found) return this.announce(`No level-appropriate ${slot} in inventory`, '#ff6a5a');
          state.equipment[slot] = found; controller.removeItem(found, pl.inv);
        }
        const live = G.monsters.find(m => m.mercenary && !m.dead); if (live) { live.dead = true; live.deathT = 0; } Ent.syncMercenary(); Save.saveChar(pl); this.renderMercenary();
      }); p.appendChild(row);
    }
    const dismiss = document.createElement('button'); dismiss.className = 'merc-dismiss'; dismiss.textContent = 'Dismiss mercenary'; dismiss.addEventListener('click', () => {
      const controller = this.inventoryGrid;
      controller.ensureGrid(pl);
      const gear = Object.values(state.equipment).filter(Boolean);
      // Check if all gear pieces can fit
      let canFit = true;
      const testInv = pl.inv.slice();
      for (const g of gear) {
        const pos = controller.findSpace(g, testInv);
        if (!pos) { canFit = false; break; }
        g._gx = pos.col; g._gy = pos.row; testInv.push(g);
      }
      if (!canFit) return this.announce('Make room for their equipment first', '#ff6a5a');
      gear.forEach(it => Game.giveItem(it)); pl.mercenary = null; const live = G.monsters.find(m => m.mercenary); if (live) live.dead = true; Save.saveChar(pl); this.renderMercenary();
    }); p.appendChild(dismiss);
  },
  head(p, title) {
    p.innerHTML = '<button type="button" class="close-x" aria-label="Close panel">✕</button><h2></h2>';
    p.querySelector('h2').textContent = title;
    p.querySelector('.close-x').addEventListener('click', () => this.closeAll());
  },

  // ---------------- inventory (10x6 variable-size grid) ----------------
  renderInv() {
    const p = this.panel('inv'), pl = G.player;
    this.head(p, 'INVENTORY');
    const controller = this.inventoryGrid;
    controller.ensureGrid(pl);
    if (typeof InventoryCharms !== 'undefined' && typeof Ent.refreshDerived === 'function') Ent.refreshDerived(pl);
    const selectedIdentifyScroll = pl.inv.find(item => item && item.id === this.identificationSelection);
    if (!Items.isIdentifyScroll(selectedIdentifyScroll)) this.identificationSelection = null;

    // --- equipment paperdoll ---
    const eq = document.createElement('div');
    eq.className = 'equip-grid';
    const slots = [['helm', 'Helm'], ['amulet', 'Amulet'], ['weapon', 'Weapon'], ['chest', 'Chest'], ['offhand', 'Off-hand'],
                   ['gloves', 'Gloves'], ['belt', 'Belt'], ['ring1', 'Ring'], ['ring2', 'Ring'], ['boots', 'Boots']];
    for (const [slot, label] of slots) {
      const cell = document.createElement('div');
      cell.className = 'eq-slot';
      cell.dataset.slot = slot;
      cell.innerHTML = `<span class="eq-label">${label}</span>`;
      const it = pl.equip[slot];
      const eligible = this.socketSelection && this.socketEligible(it);
      const unidentified = Items.needsIdentification(it);
      const broken = this.itemBroken(it);
      cell.classList.toggle('socket-target', !!eligible);
      cell.classList.toggle('item-unidentified', unidentified);
      cell.classList.toggle('item-broken', broken);
      cell.classList.toggle('item-low', this.itemLow(it));
      cell.dataset.testid = `socket-target-equip-${slot}`;
      if (it) {
        const cv = Sprites.itemIcon(it, 52);
        cv.draggable = true;
        cv.addEventListener('dragstart', e => controller.begin(e, { kind: 'equip', slot }));
        cell.appendChild(cv);
        cell.style.borderColor = Items.rarityColor(it.rarity);
        this.hookTip(cell, () => Items.tooltip(it, pl));
        cell.tabIndex = 0; cell.setAttribute('role', 'button');
        const visibleName = Items.displayName(it);
        cell.setAttribute('aria-label', (eligible ? `Socket into equipped ${visibleName}` : `Unequip ${visibleName}`) + this.itemConditionLabel(it));
        const activate = () => {
          if (this.socketSelection) {
            if (eligible) return this.socketInto(it.id);
            return this.announce('That item cannot accept the selected component.', '#ff6a5a');
          }
          Game.unequip(slot); this.renderInv();
        };
        cell.addEventListener('click', activate);
        cell.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault(); activate();
        });
      }
      cell.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      cell.addEventListener('drop', e => { e.preventDefault(); if (controller.equip(controller.source(e), slot)) this.renderInv(); });
      eq.appendChild(cell);
    }
    p.appendChild(eq);

    // --- toolbar ---
    const toolbar = document.createElement('div');
    toolbar.className = 'inv-toolbar';
    toolbar.innerHTML = `<input class="inv-search" type="text" aria-label="Search inventory" placeholder="Search inventory" value="${U.esc(controller.query)}">
      ${['all', 'equipment', 'charms', 'components', 'common', 'magic', 'rare', 'set', 'unique'].map(filter => `<button type="button" class="inv-filter-chip${controller.filter === filter ? ' active' : ''}" data-filter="${filter}" aria-pressed="${controller.filter === filter}">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}
      <button type="button" class="inv-cube-open" data-testid="open-cube" aria-label="Open Horadric Cube">Horadric Cube</button>`;
    toolbar.querySelector('.inv-search').addEventListener('input', e => { controller.query = e.target.value; this.renderInv(); const input = p.querySelector('.inv-search'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    toolbar.querySelectorAll('.inv-filter-chip').forEach(button => button.addEventListener('click', () => { controller.filter = button.dataset.filter; this.renderInv(); }));
    toolbar.querySelector('.inv-cube-open').addEventListener('click', () => this.open('cube'));
    p.appendChild(toolbar);

    // --- 10x6 grid with variable-size items ---
    const GAP = 2;
    const COLS = controller.COLS, ROWS = controller.ROWS;
    const panelStyle = getComputedStyle(p);
    const usableWidth = p.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
    const CELL = Math.min(44, Math.max(30, Math.floor((usableWidth - GAP * (COLS - 1)) / COLS)));
    const grid = document.createElement('div');
    grid.className = 'inv-grid inv-grid-var';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
    grid.style.gridTemplateRows = `repeat(${ROWS}, ${CELL}px)`;
    grid.style.gap = GAP + 'px';
    grid.style.justifyContent = 'center';
    grid.style.marginTop = '8px';
    grid.style.position = 'relative';

    // Build occupancy map for drop targets
    const occ = controller.buildOccupancy(pl.inv);

    // Render each cell as a drop target
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell inv-bg-cell';
        cell.dataset.col = c;
        cell.dataset.row = r;
        cell.style.gridColumn = `${c + 1}`;
        cell.style.gridRow = `${r + 1}`;
        // Drop handling on every cell
        cell.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          cell.classList.add('inv-drop-hi');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('inv-drop-hi'));
        cell.addEventListener('drop', e => {
          e.preventDefault();
          cell.classList.remove('inv-drop-hi');
          const src = controller.source(e);
          if (controller.moveToGrid(src, c, r)) this.renderInv();
          else UI.announce('Cannot place item there', '#ff6a5a');
        });
        grid.appendChild(cell);
      }
    }

    // Render items spanning their footprint
    const items = controller.uniqueItems(pl.inv);
    for (const it of items) {
      if (it._gx == null || it._gy == null) continue;
      const [w, h] = Items.sizeOf(it);
      const visibleName = Items.displayName(it);
      const identifyScroll = Items.isIdentifyScroll(it);
      const charm = Items.isCharmRecord(it);
      const unidentified = Items.needsIdentification(it);
      const identifyTarget = !!(this.identificationSelection && unidentified);
      const itemEl = document.createElement('div');
      itemEl.className = 'inv-item-var';
      itemEl.dataset.testid = `inventory-item-${it.id}`;
      itemEl.style.gridColumn = `${it._gx + 1} / span ${w}`;
      itemEl.style.gridRow = `${it._gy + 1} / span ${h}`;
      itemEl.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
      itemEl.classList.toggle('filtered-out', !controller.matches(it));
      itemEl.classList.toggle('socket-component-selected', this.socketSelection === it.id);
      itemEl.classList.toggle('socket-target', !!(this.socketSelection && this.socketEligible(it)));
      itemEl.classList.toggle('identify-scroll-selected', this.identificationSelection === it.id);
      itemEl.classList.toggle('identify-target', identifyTarget);
      itemEl.classList.toggle('item-unidentified', unidentified);
      itemEl.classList.toggle('item-charm', charm);
      const activeCharm = !!(charm && pl.charmState && pl.charmState.ok && pl.charmState.activeIds.includes(it.id));
      itemEl.classList.toggle('charm-active', activeCharm);
      itemEl.classList.toggle('charm-inactive', charm && !activeCharm);
      const broken = this.itemBroken(it);
      itemEl.classList.toggle('item-broken', broken);
      itemEl.classList.toggle('item-low', this.itemLow(it));
      itemEl.tabIndex = 0; itemEl.setAttribute('role', 'button');
      if (identifyScroll) itemEl.setAttribute('aria-pressed', String(this.identificationSelection === it.id));
      const charmAction = activeCharm ? 'Active while carried; drag to rearrange'
        : pl.charmState && !pl.charmState.ok ? 'Inactive because the inventory grid is invalid; drag to rearrange'
          : pl.lvl < (it.reqLvl || 1) ? `Inactive until level ${it.reqLvl}; drag to rearrange`
            : 'Inactive while carried; drag to rearrange';
      const actionLabel = identifyScroll
        ? `${this.identificationSelection === it.id ? 'Selected' : 'Select'} ${visibleName} for identification`
        : identifyTarget ? `Identify ${visibleName}`
          : unidentified ? `${visibleName}. Identify before ${charm ? 'its magic becomes active' : 'equipping'}`
            : charm ? `${visibleName}. ${charmAction}`
            : it.component ? `Select ${visibleName} for socketing` : `Equip ${visibleName}`;
      itemEl.setAttribute('aria-label', actionLabel + this.itemConditionLabel(it));
      itemEl.draggable = true;
      itemEl.addEventListener('dragstart', e => controller.begin(e, { kind: 'inv', itemId: it.id }));
      // Render item icon scaled to fit the cell footprint
      const iconW = w * CELL + (w - 1) * GAP - 4;
      const iconH = h * CELL + (h - 1) * GAP - 4;
      const icon = Sprites.itemIcon(it, Math.min(iconW, iconH));
      icon.style.width = iconW + 'px';
      icon.style.height = iconH + 'px';
      icon.style.objectFit = 'contain';
      itemEl.appendChild(icon);
      this.hookTip(itemEl, () => Items.tooltip(it, pl) + (it.component || identifyScroll || charm ? '' : Items.compareTooltip(it, pl)) +
        `<div style="color:#847252;margin-top:4px;font-size:11px">${identifyScroll ? 'Enter/click: select this scroll' : identifyTarget ? 'Enter/click: identify with the selected scroll' : unidentified ? 'Identification required before use' : charm ? `Drag to rearrange · ${activeCharm ? 'active while carried' : 'currently inactive'}` : it.component ? 'Enter/click: select for socketing' : 'Enter/click: equip'}</div>`);
      const activate = () => {
        if (this.identificationSelection) {
          if (identifyScroll && this.identificationSelection === it.id) {
            this.identificationSelection = null; this.renderInv(); return;
          }
          if (unidentified) return this.identifyWithScroll(it.id);
          this.announce('Choose a glowing unidentified item, or cancel identification.', '#d8b9ff');
          return;
        }
        if (identifyScroll) {
          this.identificationSelection = it.id;
          this.socketSelection = null;
          this.renderInv();
          const replacement = Array.from(this.panel('inv').querySelectorAll('.inv-item-var'))
            .find(element => element.dataset.testid === `inventory-item-${it.id}`);
          if (replacement) replacement.focus();
          return;
        }
        if (this.socketSelection && this.socketEligible(it)) return this.socketInto(it.id);
        if (it.component) { this.socketSelection = this.socketSelection === it.id ? null : it.id; this.renderInv(); return; }
        if (unidentified) { this.announce(charm ? 'Identify this charm before its magic can awaken.' : 'Identify this item before equipping it.', '#d8b9ff'); sfx('nope'); return; }
        if (charm) { this.announce(activeCharm ? 'This charm is active while it remains in your carried grid.' : 'This charm is currently inactive.', activeCharm ? '#8fc8ff' : '#b7a4c7'); return; }
        Game.equipFromInv(it.id); this.renderInv();
      };
      itemEl.addEventListener('click', activate);
      itemEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); activate();
      });
      grid.appendChild(itemEl);
    }

    p.appendChild(grid);

    const charmState = typeof InventoryCharms !== 'undefined'
      ? InventoryCharms.aggregate(pl, Items.sizeOf.bind(Items)) : { ok: true, stats: {}, activeIds: [], inactive: [] };
    pl.charmState = charmState;
    const charmSummary = document.createElement('div');
    charmSummary.className = 'charm-summary' + (charmState.ok ? '' : ' invalid');
    charmSummary.dataset.testid = 'charm-summary';
    charmSummary.setAttribute('role', 'status');
    if (!charmState.ok) {
      charmSummary.innerHTML = '<b>CHARMS INACTIVE</b><span>Resolve the invalid or overlapping inventory layout before any charm grants power.</span>';
    } else {
      const lines = Object.keys(charmState.stats).map(key => Items.statLine(key, charmState.stats[key]));
      const inactiveCount = charmState.inactive.length;
      charmSummary.innerHTML = `<b>${charmState.activeIds.length} ACTIVE CHARM${charmState.activeIds.length === 1 ? '' : 'S'}</b>` +
        `<span>${lines.length ? U.esc(lines.join(' · ')) : 'Carry identified, level-eligible charms in this grid to awaken their magic.'}${inactiveCount ? ` · ${inactiveCount} inactive` : ''}</span>`;
    }
    p.appendChild(charmSummary);

    const socketBar = document.createElement('div'); socketBar.className = 'socket-bar'; socketBar.setAttribute('role', 'status');
    const selected = pl.inv.find(item => item && item.id === this.socketSelection);
    const socketTargets = selected ? Object.values(pl.equip || {}).concat(pl.inv || []).filter(item => this.socketEligible(item)).length : 0;
    socketBar.innerHTML = selected ? `<span>Socketing: <b>${U.esc(Items.displayName(selected))}</b>. ${socketTargets ? `Choose one of ${socketTargets} glowing target${socketTargets === 1 ? '' : 's'}.` : 'No eligible empty socket is available.'}</span><button type="button" data-testid="socket-cancel" aria-label="Cancel socketing">Cancel</button>` : '<span>Select a gem or rune to socket it into an empty-socket item.</span>';
    const cancel = socketBar.querySelector('button'); if (cancel) cancel.addEventListener('click', () => { this.socketSelection = null; this.renderInv(); });
    p.appendChild(socketBar);

    const identifyBar = document.createElement('div');
    identifyBar.className = 'identify-bar';
    identifyBar.dataset.testid = 'identify-status';
    identifyBar.setAttribute('role', 'status');
    const identifyScrollItem = pl.inv.find(item => item && item.id === this.identificationSelection && Items.isIdentifyScroll(item));
    const veiledCount = pl.inv.filter(item => Items.needsIdentification(item)).length;
    identifyBar.innerHTML = identifyScrollItem
      ? `<span><b>IDENTIFICATION READY</b> · ${veiledCount ? `Choose one of ${veiledCount} glowing unidentified item${veiledCount === 1 ? '' : 's'}.` : 'No unidentified target is currently carried.'}</span><button type="button" data-testid="identify-cancel" aria-label="Cancel identification">Cancel</button>`
      : `<span><b>${veiledCount} UNIDENTIFIED</b> · Select a Scroll of Identification, or visit Old Maras in town.</span>`;
    const identifyCancel = identifyBar.querySelector('button');
    if (identifyCancel) identifyCancel.addEventListener('click', () => { this.identificationSelection = null; this.renderInv(); });
    p.appendChild(identifyBar);

    // --- world drop zone ---
    const worldDrop = document.createElement('div');
    worldDrop.className = 'world-drop';
    worldDrop.textContent = 'Drag here to drop in the world';
    worldDrop.addEventListener('dragover', e => { e.preventDefault(); worldDrop.classList.add('ready'); });
    worldDrop.addEventListener('dragleave', () => worldDrop.classList.remove('ready'));
    worldDrop.addEventListener('drop', e => { e.preventDefault(); if (controller.dropToWorld(controller.source(e))) this.renderInv(); });
    p.appendChild(worldDrop);
    const gold = document.createElement('div');
    gold.className = 'gold-row';
    gold.innerHTML = `⛁ ${U.fmt(pl.gold)} gold`;
    p.appendChild(gold);
  },

  socketEligible(item) {
    if (!item || item.component || Items.needsIdentification(item) || !Array.isArray(item.gems) || !item.gems.includes(null)) return false;
    const component = G.player && G.player.inv && G.player.inv.find(entry => entry && entry.id === this.socketSelection);
    return !!component && typeof Items.insertSocket === 'function' &&
      // Probe a clone, preserving the live target until the atomic Game helper acts.
      Items.insertSocket({ ...item, gems: item.gems.slice(), stats: { ...(item.stats || {}) } }, { ...component }, G.player.lvl);
  },

  socketInto(targetId) {
    const sourceId = this.socketSelection;
    if (!sourceId) return;
    const result = typeof Game.insertSocket === 'function'
      ? Game.insertSocket(sourceId, targetId)
      : { ok: false, reason: 'Socketing is unavailable.' };
    if (!result || !result.ok) { this.announce((result && result.reason) || 'Cannot socket that component there.', '#ff6a5a'); return; }
    this.socketSelection = null;
    this.renderInv();
  },

  identifyWithScroll(targetId) {
    const scrollId = this.identificationSelection;
    if (!scrollId) return;
    const result = Game.identifyItem(scrollId, targetId);
    if (!result || !result.ok) {
      if (!G.player.inv.some(item => item && item.id === scrollId && Items.isIdentifyScroll(item))) this.identificationSelection = null;
      this.renderInv();
      return;
    }
    this.identificationSelection = null;
    this.renderInv();
    const revealed = Array.from(this.panel('inv').querySelectorAll('.inv-item-var'))
      .find(element => element.dataset.testid === `inventory-item-${targetId}`);
    if (revealed) revealed.focus();
  },

  renderCube() {
    const p = this.panel('cube'), pl = G.player;
    this.head(p, 'HORADRIC CUBE');
    const controller = this.inventoryGrid; controller.ensureGrid(pl); Ent.refreshDerived(pl);
    this.cubeSelection = this.cubeSelection.filter(id => pl.inv.some(item => item && item.id === id));
    const preview = typeof Cube !== 'undefined' ? Cube.preview(pl, this.cubeSelection) : { ok: false, reason: 'The Cube is unavailable.' };
    p.insertAdjacentHTML('beforeend', '<div class="cube-intro">Select the exact inventory instances to transmute. The preview is pure; only Transmute changes your inventory.</div>');
    const guide = document.createElement('details'); guide.className = 'cube-recipes'; guide.open = this.cubeRecipesOpen; guide.dataset.testid = 'cube-recipes';
    guide.innerHTML = `<summary>Known recipes (${Cube.recipes.length})</summary><div class="cube-recipe-grid">${Cube.recipes.map(recipe => `<div class="cube-recipe"><b>${U.esc(recipe.name)}</b><span>${U.esc(recipe.desc)}</span></div>`).join('')}</div>`;
    guide.addEventListener('toggle', () => { this.cubeRecipesOpen = guide.open; });
    p.appendChild(guide);
    const list = document.createElement('div'); list.className = 'cube-inputs'; list.setAttribute('aria-label', 'Cube inventory inputs');
    for (const item of pl.inv) {
      if (!item) continue;
      const selected = this.cubeSelection.includes(item.id);
      const unidentified = Items.needsIdentification(item);
      const charm = Items.isCharmRecord(item);
      const charmState = this.charmCarriedState(item, pl);
      const visibleName = Items.displayName(item);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cube-input' + (selected ? ' selected' : '');
      button.classList.toggle('item-unidentified', unidentified);
      button.classList.toggle('item-charm', charm);
      button.classList.toggle('charm-active', charm && charmState.active);
      button.classList.toggle('charm-inactive', charm && !charmState.active);
      button.dataset.testid = `cube-input-${item.id}`; button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', unidentified ? `${visibleName}. Identify before using in the Cube`
        : charm ? `${visibleName}. Charms have no Cube recipe` : `Cube input ${visibleName}`);
      button.disabled = unidentified || charm;
      button.appendChild(Sprites.itemIcon(item, 38));
      const text = document.createElement('span'); text.textContent = unidentified ? `${visibleName} · IDENTIFY FIRST`
        : charm ? `${visibleName} · NO CHARM RECIPE` : visibleName; button.appendChild(text);
      button.addEventListener('click', () => {
        this.cubeSelection = selected ? this.cubeSelection.filter(id => id !== item.id) : this.cubeSelection.concat(item.id);
        this.renderCube();
        const replacement = Array.from(p.querySelectorAll('.cube-input')).find(entry => entry.dataset.testid === `cube-input-${item.id}`);
        if (replacement) replacement.focus();
      });
      list.appendChild(button);
    }
    p.appendChild(list);
    const result = document.createElement('div'); result.className = 'cube-preview'; result.dataset.testid = 'cube-preview'; result.setAttribute('role', 'status');
    if (preview.ok) {
      const recipe = Cube.recipes.find(entry => entry.id === preview.recipeId);
      const outputLabel = output => {
        const name = output.name || output.baseName || output.type || 'Transmuted item';
        const sockets = output.sockets && typeof output.sockets === 'object' ? ` (${output.sockets.min}–${output.sockets.max} sockets)` : '';
        return U.esc(name + sockets);
      };
      result.innerHTML = `<b>Ready: ${U.esc(recipe ? recipe.name : preview.recipeId)}</b> · Cost: <span class="q-gold">${U.fmt(preview.cost)} gold</span><div class="cube-output">${preview.outputs.map(outputLabel).join(' + ')}</div>`;
    } else result.textContent = preview.reason || 'Select Cube inputs.';
    p.appendChild(result);
    const controls = document.createElement('div'); controls.className = 'cube-controls';
    const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear'; clear.dataset.testid = 'cube-clear'; clear.addEventListener('click', () => { this.cubeSelection = []; this.renderCube(); p.querySelector('[data-testid="cube-clear"]').focus(); });
    const transmute = document.createElement('button'); transmute.type = 'button'; transmute.className = 'big-btn'; transmute.textContent = 'Transmute'; transmute.dataset.testid = 'cube-transmute'; transmute.disabled = !preview.ok;
    transmute.addEventListener('click', () => {
      const check = Cube.preview(pl, this.cubeSelection);
      if (!check.ok) { this.announce(check.reason, '#ff6a5a'); this.renderCube(); return; }
      const outcome = Cube.transmute(pl, this.cubeSelection, U.rand);
      if (!outcome.ok) { this.announce(outcome.reason, '#ff6a5a'); this.renderCube(); return; }
      Ent.refreshDerived(pl); Save.saveChar(pl);
      this.cubeSelection = []; this.announce(`Cube transmutation complete: ${outcome.outputs.map(o => o.name).join(', ')}`, '#ffd77a'); this.renderCube();
    });
    controls.append(clear, transmute); p.appendChild(controls);
  },

  // ---------------- character ----------------
  // Gear score is deliberately based only on persisted item fields so the same
  // equipment always produces the same score:
  //   item level + (5 * (tier + 1)) + rarity bonus, summed for all slots.
  // Rarity bonuses: common 0, magic 5, rare 10, set 15, unique 20.
  gearScore(equip) {
    const rarityBonus = { common: 0, magic: 5, rare: 10, set: 15, unique: 20 };
    return Object.values(equip || {}).reduce((total, item) => {
      if (!item || Items.needsIdentification(item) || Items.isCharmRecord(item)) return total;
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
      ['Difficulty', `<span class="difficulty-text difficulty-text-${pl.difficultyIdx}">${difficultyByIdx(pl.difficultyIdx).name}</span>`],
      ['Campaign', this.difficultySummary(pl.difficulty.campaigns[pl.difficultyIdx])],
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
        const visibleName = Items.displayName(item);
        const unidentified = Items.needsIdentification(item);
        const broken = this.itemBroken(item);
        cell.classList.toggle('item-unidentified', unidentified);
        cell.classList.toggle('item-broken', broken);
        cell.classList.toggle('item-low', this.itemLow(item));
        cell.tabIndex = 0;
        cell.setAttribute('role', 'group');
        cell.appendChild(Sprites.itemIcon(item, 42));
        cell.style.borderColor = Items.rarityColor(item.rarity);
        cell.setAttribute('aria-label', `Inspect ${visibleName}${this.itemConditionLabel(item)}`);
        this.hookTip(cell, () => Items.tooltip(item, pl) +
          '<div style="color:#847252;margin-top:4px;font-size:11px">Inspect item · Use × to unequip</div>');

        const unequip = document.createElement('button');
        unequip.className = 'pd-unequip';
        unequip.type = 'button';
        unequip.textContent = '×';
        unequip.title = `Unequip ${visibleName}${this.itemConditionLabel(item)}`;
        unequip.setAttribute('aria-label', `Unequip ${visibleName}${this.itemConditionLabel(item)}`);
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
    grid.className = 'skill-tree';
    const tree = cls.trees[this.treeTab];
    const connectors = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectors.classList.add('skill-connectors');
    connectors.setAttribute('viewBox', '0 0 100 100');
    connectors.setAttribute('preserveAspectRatio', 'none');
    tree.skills.forEach(sk => sk.prereqIds.forEach(prereqId => {
      const from = SKILL_BY_ID[prereqId];
      if (!from) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 25 + from.x * 50); line.setAttribute('y1', 10 + from.y * 20);
      line.setAttribute('x2', 25 + sk.x * 50); line.setAttribute('y2', 10 + sk.y * 20);
      if ((pl.skills[prereqId] || 0) > 0) line.classList.add('active');
      connectors.appendChild(line);
    }));
    grid.appendChild(connectors);
    tree.skills.forEach(sk => {
      const req = sk.reqLvl;
      const lvl = pl.skills[sk.id] || 0;
      const unmetPrereqs = sk.prereqIds.filter(id => !(pl.skills[id] > 0));
      const locked = pl.lvl < req || unmetPrereqs.length > 0;
      const row = document.createElement('div');
      row.className = 'skill-node' + (locked ? ' locked' : '') + (lvl ? ' learned' : '');
      row.style.gridColumn = String(sk.x + 1);
      row.style.gridRow = String(sk.y + 1);
      const icon = Sprites.skillIcon(sk, 40);
      row.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'skill-info';
      info.innerHTML = `<div class="skill-name">${sk.name} <span class="skill-lvl">${lvl}/${sk.maxLvl}</span></div>
        <div class="skill-desc">Tier ${sk.tier}${locked ? ' · locked' : ''}</div>
        <div class="skill-desc" style="color:#6f8a5a">${this.bindLabel(sk.id)}</div>`;
      row.appendChild(info);
      const plus = document.createElement('button');
      plus.className = 'skill-plus';
      plus.textContent = '+';
      plus.disabled = locked || pl.skillPts <= 0 || lvl >= sk.maxLvl;
      plus.addEventListener('click', e => {
        e.stopPropagation();
        const current = pl.skills[sk.id] || 0;
        const canAllocate = pl.skillPts > 0 && current < sk.maxLvl && pl.lvl >= sk.reqLvl &&
          sk.prereqIds.every(id => (pl.skills[id] || 0) > 0);
        if (canAllocate) {
          pl.skills[sk.id] = current + 1;
          pl.skillPts--;
          if (current === 0 && sk.arch !== 'passive') WUI.ensurePlayer(pl), this.autoBind(sk.id);
          Ent.computeDerived(pl);
          sfx('levelup');
          this.renderSkills();
        }
      });
      row.appendChild(plus);
      this.hookTip(row, () => this.skillTip(sk, Ent.skillLvl(pl, sk.id)));
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
    h += `<div class="tt-type">${sk.arch.toUpperCase()} · ${ELEM[sk.elem].name} · Tier ${sk.tier} · Rank ${lvl}/${sk.maxLvl}</div>`;
    h += `<div>${U.esc(sk.desc)}</div>`;

    const rankStats = rank => {
      let out = '';
      if (sk.wd) out += `<div class="tt-stat">${Math.round(sk.wd + (sk.wdLvl || 0) * (rank - 1))}% weapon damage</div>`;
      if (sk.dmg) {
        const g = 1 + (sk.dmgLvl || 0.3) * (rank - 1);
        const sp = pl.derived ? pl.derived.spellPower : 1;
        out += `<div class="tt-stat">${Math.floor(sk.dmg[0] * g * sp)}–${Math.floor(sk.dmg[1] * g * sp)} ${ELEM[sk.elem].name.toLowerCase()} damage</div>`;
      }
      if (sk.count) out += `<div class="tt-stat">${sk.count + Math.floor((sk.countLvl || 0) * (rank - 1))} projectiles</div>`;
      if (sk.buff) for (const k in sk.buff) out += `<div class="tt-stat">${Items.statLine(k, Math.round(sk.buff[k] * (1 + 0.14 * (rank - 1)) * 10) / 10)}</div>`;
      if (sk.passive) for (const k in sk.passive) out += `<div class="tt-stat">${Items.statLine(k, Math.round(sk.passive[k] * rank * 10) / 10)} (total)</div>`;
      if (sk.debuff) {
        if (sk.debuff.slow) out += `<div class="tt-stat">Slows by ${Math.round(sk.debuff.slow * 100)}%</div>`;
        if (sk.debuff.dmgTaken) out += `<div class="tt-stat">+${Math.round(sk.debuff.dmgTaken * 100)}% damage taken</div>`;
        if (sk.debuff.weaken) out += `<div class="tt-stat">-${Math.round(sk.debuff.weaken * 100)}% enemy damage</div>`;
        if (sk.debuff.dot) out += `<div class="tt-stat">${Math.round(sk.debuff.dot)} damage/sec</div>`;
      }
      if (sk.heal) out += `<div class="tt-stat">Heals ${Math.round(sk.heal + (sk.healLvl || 0) * (rank - 1))}</div>`;
      if (sk.arch !== 'passive') out += `<div style="color:#6a8aff">Mana: ${Ent.manaCost(sk, rank)}</div>`;
      if (sk.cd) out += `<div style="color:#847252">Cooldown: ${sk.cd}s</div>`;
      return out;
    };
    if (lvl > 0) h += `<div class="tt-rank"><b>Rank ${lvl}</b>${rankStats(lvl)}</div>`;
    if (lvl < sk.maxLvl) h += `<div class="tt-rank tt-next"><b>${lvl ? 'Next rank' : 'Rank 1'}</b>${rankStats(lvl + 1)}</div>`;

    h += '<div class="tt-requirements"><b>Requirements</b>';
    const requirements = [
      { met: pl.lvl >= sk.reqLvl, text: `Character level ${sk.reqLvl}` },
      ...sk.prereqIds.map(id => ({ met: (pl.skills[id] || 0) > 0, text: `${SKILL_BY_ID[id].name} rank 1` })),
      { met: pl.skillPts > 0, text: '1 available skill point' },
      { met: lvl < sk.maxLvl, text: `Below maximum rank ${sk.maxLvl}` },
    ];
    h += requirements.map(r => `<div class="${r.met ? 'tt-met' : 'tt-unmet'}">${r.met ? '✓' : '✕'} ${U.esc(r.text)}</div>`).join('') + '</div>';
    if (sk.synergies.length) h += '<div class="tt-synergy"><b>Synergies</b>' + sk.synergies.map(s =>
      `<div>+${s.bonusPerRank}% ${s.bonus} per rank of ${SKILL_BY_ID[s.skillId].name}</div>`).join('') + '</div>';
    return h;
  },

  // ---------------- vendor / gamble / stash / healer ----------------
  smithRepairCatalog(pl = G.player) {
    if (typeof ItemCondition === 'undefined') return { ok: false, cost: 0, entries: [], ownedById: new Map() };
    const stash = Array.isArray(G.stash) ? G.stash : [];
    // The condition core intentionally knows about corpse gear for persistence,
    // but the town smith may never repair equipment the hero has not recovered.
    const quote = ItemCondition.quoteAll(pl, stash);
    const entries = (quote.entries || []).filter(entry => !String(entry.location || '').startsWith('corpses.'));
    const owned = ItemCondition.owned(pl, stash).filter(record => !String(record.location || '').startsWith('corpses.'));
    return {
      ok: quote.ok !== false,
      cost: entries.reduce((sum, entry) => sum + entry.cost, 0),
      entries,
      ownedById: new Map(owned.map(record => [record.id, record])),
    };
  },

  smithRepairLocation(location) {
    const slotName = value => {
      const raw = String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, ch => ch.toUpperCase());
      return raw === 'Offhand' ? 'Off-hand' : raw;
    };
    if (String(location).startsWith('equip.')) return `Hero · ${slotName(String(location).slice(6))}`;
    if (String(location).startsWith('inv.')) return 'Hero inventory';
    if (String(location).startsWith('mercenary.equipment.')) return `Mercenary · ${slotName(String(location).slice(20))}`;
    if (String(location).startsWith('stash.')) return 'Shared stash';
    return 'Owned gear';
  },

  smithRepairFailure(reason) {
    const messages = {
      'insufficient-gold': 'Not enough gold for that repair. Nothing was changed.',
      'stale-ownership': 'That item moved before the repair. No gold was spent.',
      'stale-condition': 'That item\'s condition changed. Review Korga\'s new quote; no gold was spent.',
      'stale-quote': 'Korga\'s repair quote changed. Review the new price; no gold was spent.',
      'invalid-plan': 'That repair could not be verified. Nothing was changed.',
    };
    this.announce(messages[reason] || 'The repair could not be completed. Nothing was changed.', '#ff6a5a', 3800);
  },

  refreshRepairDerived(pl) {
    Ent.computeDerived(pl);
    pl.hp = Math.min(pl.hp, pl.derived.maxHp);
    pl.mp = Math.min(pl.mp, pl.derived.maxMp);
    const state = pl.mercenary;
    const live = state && G.monsters.find(monster => monster.mercenary && !monster.dead);
    if (state && live) {
      const derived = Ent.mercDerived(state);
      live.maxHp = derived.maxHp;
      live.hp = Math.min(live.hp, live.maxHp);
      live.dmgLo = derived.dmgLo;
      live.dmgHi = derived.dmgHi;
      live.armor = derived.armor;
      live.resist = derived.resist;
    }
  },

  repairAtSmith(expectedEntries, repairAll = false) {
    const pl = G.player;
    const expected = expectedEntries.slice().sort((a, b) => a.id.localeCompare(b.id));
    const fresh = this.smithRepairCatalog(pl);
    const expectedIds = new Set(expected.map(entry => entry.id));
    const selected = fresh.entries.filter(entry => expectedIds.has(entry.id)).sort((a, b) => a.id.localeCompare(b.id));
    const sameEntry = (left, right) => left && right && left.id === right.id && left.cost === right.cost &&
      left.durability === right.durability && left.maxDurability === right.maxDurability;
    const stale = !fresh.ok || selected.length !== expected.length || expected.some((entry, index) => !sameEntry(entry, selected[index])) ||
      (repairAll && fresh.entries.length !== expected.length);
    if (stale) {
      this.smithRepairFailure('stale-quote');
      this.renderVendor();
      return;
    }

    // Recompute from the freshly filtered entries; this is the exact atomic
    // plan passed into the condition core.
    const plan = { ok: true, entries: selected, cost: selected.reduce((sum, entry) => sum + entry.cost, 0) };
    const names = selected.map(entry => {
      const record = fresh.ownedById.get(entry.id);
      return record && record.item ? Items.displayName(record.item) : 'item';
    });
    const result = ItemCondition.commit(pl, plan, Array.isArray(G.stash) ? G.stash : []);
    if (!result.ok) {
      this.smithRepairFailure(result.reason);
      this.renderVendor();
      return;
    }

    this.refreshRepairDerived(pl);
    Save.saveChar(pl);
    Save.saveStash();
    sfx('gold');
    this.announce(result.repaired.length === 1
      ? `Repaired ${names[0]} for ${U.fmt(result.cost)} gold.`
      : `Repaired ${result.repaired.length} items for ${U.fmt(result.cost)} gold.`, '#ffd77a');
    this.renderVendor();
  },

  renderSmithRepairs(p, pl) {
    const section = document.createElement('section');
    section.className = 'smith-repairs';
    section.dataset.testid = 'smith-repairs';
    section.setAttribute('aria-labelledby', 'smith-repairs-title');
    section.innerHTML = '<h2 id="smith-repairs-title" class="smith-repair-heading">REPAIRS</h2>' +
      '<div class="smith-repair-note">Only identified, damaged, repairable equipment appears here. Full-condition and non-durable items need no service. Ethereal items can wear and break, but cannot be repaired.</div>';
    p.appendChild(section);
    if (typeof ItemCondition === 'undefined') {
      section.insertAdjacentHTML('beforeend', '<div class="smith-repair-empty" role="status">Korga\'s repair bench is unavailable.</div>');
      return;
    }

    const catalog = this.smithRepairCatalog(pl);
    if (!catalog.entries.length) {
      section.insertAdjacentHTML('beforeend', '<div class="smith-repair-empty" role="status">No repairable equipment is damaged.</div>');
      return;
    }

    const controls = document.createElement('div');
    controls.className = 'smith-repair-controls';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'smith-repair-all';
    all.dataset.testid = 'repair-all';
    all.dataset.repairCost = String(catalog.cost);
    all.textContent = `Repair All · ${U.fmt(catalog.cost)} gold`;
    all.setAttribute('aria-label', `Repair all ${catalog.entries.length} damaged items for ${U.fmt(catalog.cost)} gold`);
    all.disabled = pl.gold < catalog.cost;
    if (all.disabled) all.title = `Need ${U.fmt(catalog.cost - pl.gold)} more gold`;
    all.addEventListener('click', () => this.repairAtSmith(catalog.entries, true));
    controls.appendChild(all);
    if (all.disabled) {
      const shortfall = document.createElement('span');
      shortfall.className = 'smith-repair-shortfall';
      shortfall.dataset.testid = 'repair-all-shortfall';
      shortfall.setAttribute('role', 'status');
      shortfall.textContent = `Need ${U.fmt(catalog.cost - pl.gold)} more gold for Repair All. Unaffordable repairs are disabled.`;
      controls.appendChild(shortfall);
    }
    section.appendChild(controls);

    const list = document.createElement('div');
    list.className = 'smith-repair-list';
    for (const entry of catalog.entries) {
      const record = catalog.ownedById.get(entry.id);
      if (!record || !record.item) continue;
      const item = record.item;
      const visibleName = Items.displayName(item);
      const row = document.createElement('div');
      row.className = 'smith-repair-row';
      row.dataset.itemId = entry.id;
      row.dataset.testid = `repair-row-${entry.id}`;
      row.appendChild(Sprites.itemIcon(item, 38));
      const detail = document.createElement('div');
      detail.className = 'smith-repair-detail';
      detail.innerHTML = `<b class="smith-repair-name">${U.esc(visibleName)}</b><span class="smith-repair-location">${U.esc(this.smithRepairLocation(entry.location))}</span>` +
        `<span class="smith-repair-condition">Condition ${entry.durability} / ${entry.maxDurability}</span>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smith-repair-one';
      button.dataset.testid = `repair-item-${entry.id}`;
      button.dataset.repairCost = String(entry.cost);
      button.textContent = `Repair · ${U.fmt(entry.cost)} gold`;
      button.setAttribute('aria-label', `Repair ${visibleName}, condition ${entry.durability} of ${entry.maxDurability}, for ${U.fmt(entry.cost)} gold`);
      button.disabled = pl.gold < entry.cost;
      if (button.disabled) button.title = `Need ${U.fmt(entry.cost - pl.gold)} more gold`;
      button.addEventListener('click', () => this.repairAtSmith([entry]));
      row.append(detail, button);
      list.appendChild(row);
    }
    section.appendChild(list);
  },

  renderVendor() {
    const p = this.panel('vendor'), pl = G.player;
    this.head(p, 'KORGA\'S FORGE');
    if (Factions.isHostile(pl.reputation, 'ironsong')) { p.insertAdjacentHTML('beforeend', '<div class="npc-line">“The Compact does not trade with its enemies.”</div>'); return; }
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">“${U.esc(U.pick(U.rand, NPCS.find(n => n.id === 'smith').lines))}”</div>
      <div class="gold-row">⛁ ${U.fmt(pl.gold)} gold</div>`);
    this.renderSmithRepairs(p, pl);
    p.insertAdjacentHTML('beforeend', '<h2 style="font-size:14px;margin-top:8px">FOR SALE</h2>');
    const list = document.createElement('div');
    list.className = 'shop-list';
    G.shopStock.forEach((it, i) => {
      if (!it) return;
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      cell.style.width = '54px'; cell.style.height = '54px';
      cell.dataset.testid = `vendor-stock-item-${it.id}`;
      cell.appendChild(Sprites.itemIcon(it, 50));
      cell.style.borderColor = Items.rarityColor(it.rarity);
      const buyPrice = Factions.price(it.price, pl.reputation, 'ironsong');
      this.hookTip(cell, () => Items.tooltip(it, pl) + `<div class="q-gold">Buy for ${U.fmt(buyPrice)} gold</div>`);
      cell.addEventListener('click', () => {
        if (pl.gold >= buyPrice) {
          const controller = this.inventoryGrid;
          controller.ensureGrid(pl);
          if (controller.findSpace(it, pl.inv)) {
            pl.gold -= buyPrice; Game.giveItem(it); G.shopStock[i] = null;
            Ent.refreshDerived(pl); Save.saveChar(pl);
            sfx('gold'); this.renderVendor();
          } else { this.announce('Inventory full!', '#ff6a5a'); sfx('nope'); }
        } else sfx('nope');
      });
      list.appendChild(cell);
    });
    p.appendChild(list);
    p.insertAdjacentHTML('beforeend', '<h2 style="font-size:14px;margin-top:12px">YOUR GOODS — click to sell</h2>');
    const inv = document.createElement('div');
    inv.className = 'shop-list';
    const controller = this.inventoryGrid;
    controller.ensureGrid(pl);
    Ent.refreshDerived(pl);
    for (const it of controller.uniqueItems(pl.inv)) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      const visibleName = Items.displayName(it);
      const unidentified = Items.needsIdentification(it);
      const broken = this.itemBroken(it);
      const charm = Items.isCharmRecord(it);
      const charmState = this.charmCarriedState(it, pl);
      cell.classList.toggle('item-unidentified', unidentified);
      cell.classList.toggle('item-charm', charm);
      cell.classList.toggle('charm-active', charm && charmState.active);
      cell.classList.toggle('charm-inactive', charm && !charmState.active);
      cell.classList.toggle('item-broken', broken);
      cell.classList.toggle('item-low', this.itemLow(it));
      cell.dataset.testid = `vendor-pack-item-${it.id}`;
      cell.tabIndex = 0;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-disabled', String(unidentified));
      cell.setAttribute('aria-label', unidentified ? `${visibleName}. Identify before selling`
        : `Sell ${visibleName}${this.itemConditionLabel(it)}${charm ? `. ${charmState.label}` : ''}`);
      cell.appendChild(Sprites.itemIcon(it, 44));
      cell.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
      this.hookTip(cell, () => Items.tooltip(it, pl) + (unidentified
        ? '<div class="tt-unidentified-action">Identify before selling.</div>'
        : `<div class="q-gold">Sell for ${U.fmt(Items.sellPrice(it))} gold</div>`));
      cell.addEventListener('click', () => {
        if (Items.needsIdentification(it)) { this.announce('Identify this item before selling it.', '#d8b9ff'); sfx('nope'); return; }
        pl.gold += Items.sellPrice(it);
        controller.removeItem(it, pl.inv);
        Ent.refreshDerived(pl);
        Save.saveChar(pl);
        sfx('gold');
        this.renderVendor();
      });
      cell.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); cell.click();
      });
      inv.appendChild(cell);
    }
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
        pl.gold -= cost;
        let ftype = type;
        if (type === 'weapon') ftype = U.pick(U.rand, WEAPON_TYPES).id;
        const rarity = U.weighted(U.rand, [['unique', 4], ['set', 5], ['rare', 34], ['magic', 57]]);
        const it = Items.generate(pl.lvl + U.ri(U.rand, 0, 4), { forceRarity: rarity, forceType: ftype, classId: pl.cls });
        if (!Game.giveItem(it)) G.groundItems.push({ x: pl.x, y: pl.y, item: it });
        Save.saveChar(pl);
        sfx(rarity === 'unique' || rarity === 'set' ? 'unique' : rarity === 'rare' ? 'rare' : 'gold');
        this.announce(`Gambled: ${Items.displayName(it)}`, Items.rarityColor(it.rarity));
        this.renderGamble();
      });
      opts.appendChild(b);
    }
    p.appendChild(opts);
  },

  // Migrate stash to grid format (same 10x6 grid).
  _migrateStash() {
    const controller = this.inventoryGrid;
    G.stash = controller.migrateInv(G.stash);
    G._stashMigrated = true;
  },

  renderStash() {
    const p = this.panel('stash'), pl = G.player;
    this.head(p, 'SHARED VAULT');
    p.insertAdjacentHTML('beforeend', '<div class="npc-line">Items placed here are shared between all your heroes.</div>');
    const controller = this.inventoryGrid;
    controller.ensureGrid(pl);
    Ent.refreshDerived(pl);
    this._migrateStash();

    // --- Stash grid (10x6, same as inventory) ---
    const GAP = 2;
    const COLS = controller.COLS, ROWS = controller.ROWS;
    const panelStyle = getComputedStyle(p);
    const usableWidth = p.clientWidth - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight);
    const CELL = Math.min(44, Math.max(30, Math.floor((usableWidth - GAP * (COLS - 1)) / COLS)));
    const grid = document.createElement('div');
    grid.className = 'inv-grid inv-grid-var';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
    grid.style.gridTemplateRows = `repeat(${ROWS}, ${CELL}px)`;
    grid.style.gap = GAP + 'px';
    grid.style.justifyContent = 'center';
    grid.style.marginTop = '8px';

    // Background cells (drop targets)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell inv-bg-cell';
        cell.style.gridColumn = `${c + 1}`;
        cell.style.gridRow = `${r + 1}`;
        grid.appendChild(cell);
      }
    }

    // Item overlays
    for (const it of controller.uniqueItems(G.stash)) {
      if (it._gx == null || it._gy == null) continue;
      const [w, h] = Items.sizeOf(it);
      const itemEl = document.createElement('div');
      itemEl.className = 'inv-item-var';
      const visibleName = Items.displayName(it);
      const unidentified = Items.needsIdentification(it);
      const broken = this.itemBroken(it);
      const charm = Items.isCharmRecord(it);
      itemEl.classList.toggle('item-unidentified', unidentified);
      itemEl.classList.toggle('item-charm', charm);
      itemEl.classList.toggle('charm-inactive', charm);
      itemEl.classList.toggle('item-broken', broken);
      itemEl.classList.toggle('item-low', this.itemLow(it));
      itemEl.dataset.testid = `stash-item-${it.id}`;
      itemEl.tabIndex = 0; itemEl.setAttribute('role', 'button');
      itemEl.setAttribute('aria-label', `Take ${visibleName}${this.itemConditionLabel(it)} from shared stash${charm ? '. inactive in shared stash' : ''}`);
      itemEl.style.gridColumn = `${it._gx + 1} / span ${w}`;
      itemEl.style.gridRow = `${it._gy + 1} / span ${h}`;
      itemEl.style.borderColor = U.rgba(Items.rarityColor(it.rarity), 0.7);
      const iconW = w * CELL + (w - 1) * GAP - 4;
      const iconH = h * CELL + (h - 1) * GAP - 4;
      const icon = Sprites.itemIcon(it, Math.min(iconW, iconH));
      icon.style.width = iconW + 'px';
      icon.style.height = iconH + 'px';
      icon.style.objectFit = 'contain';
      itemEl.appendChild(icon);
      this.hookTip(itemEl, () => Items.tooltip(it, pl) + (charm ? '<div class="tt-charm-state inactive">INACTIVE IN STASH</div>' : '') + '<div style="color:#847252;font-size:11px">Click: take</div>');
      const take = () => {
        const outcome = Game.takeStashItem(it.id);
        if (!outcome.ok) {
          const message = outcome.reason === 'inventory-full' ? 'Inventory full!'
            : outcome.reason === 'storage-failure' ? 'Storage write failed; the item remains safely in the shared stash.'
              : 'That stash item could not be moved.';
          this.announce(message, '#ff6a5a'); sfx('nope'); this.renderStash(); return;
        }
        if (outcome.warning) this.announce('Item taken safely. A stale stash copy will be repaired on the next successful save.', '#e8d089', 3600);
        this.renderStash();
      };
      itemEl.addEventListener('click', take);
      itemEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); take();
      });
      grid.appendChild(itemEl);
    }
    p.appendChild(grid);

    // --- Player pack: deposit items ---
    p.insertAdjacentHTML('beforeend', '<h2 style="font-size:14px;margin-top:10px">YOUR PACK — click to deposit</h2>');
    const inv = document.createElement('div');
    inv.className = 'shop-list';
    for (const it of controller.uniqueItems(pl.inv)) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      const visibleName = Items.displayName(it);
      const unidentified = Items.needsIdentification(it);
      const broken = this.itemBroken(it);
      const charm = Items.isCharmRecord(it);
      const charmState = this.charmCarriedState(it, pl);
      cell.classList.toggle('item-unidentified', unidentified);
      cell.classList.toggle('item-charm', charm);
      cell.classList.toggle('charm-active', charm && charmState.active);
      cell.classList.toggle('charm-inactive', charm && !charmState.active);
      cell.classList.toggle('item-broken', broken);
      cell.classList.toggle('item-low', this.itemLow(it));
      cell.dataset.testid = `stash-pack-item-${it.id}`;
      cell.tabIndex = 0; cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `Deposit ${visibleName}${this.itemConditionLabel(it)} in shared stash${charm ? `. ${charmState.label}` : ''}`);
      cell.appendChild(Sprites.itemIcon(it, 44));
      this.hookTip(cell, () => Items.tooltip(it, pl));
      const deposit = () => {
        const outcome = Game.depositStashItem(it.id);
        if (!outcome.ok) {
          const message = outcome.reason === 'stash-full' ? 'Stash full!'
            : outcome.reason === 'storage-failure' ? 'Storage write failed; the item remains safely in your pack.'
              : 'That pack item could not be moved.';
          this.announce(message, '#ff6a5a'); sfx('nope'); this.renderStash(); return;
        }
        this.renderStash();
      };
      cell.addEventListener('click', deposit);
      cell.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); deposit();
      });
      inv.appendChild(cell);
    }
    p.appendChild(inv);
  },

  renderIdentificationService(p, pl, refresh) {
    const section = document.createElement('section');
    section.className = 'identification-service';
    section.dataset.testid = 'identification-service';
    section.setAttribute('aria-labelledby', 'identification-service-title');
    const quote = typeof ItemIdentification !== 'undefined' ? ItemIdentification.quoteAll(pl) : { ok: false, count: 0, targetIds: [] };
    section.innerHTML = '<h2 id="identification-service-title" class="identification-heading">IDENTIFICATION · FREE</h2>' +
      '<div class="identification-note">Old Maras reveals every veiled item in your carried inventory. Equipped, stashed, mercenary, and corpse gear remain untouched.</div>';
    if (!quote.ok) {
      section.insertAdjacentHTML('beforeend', '<div class="identification-empty" role="status">Your carried items could not be inspected safely.</div>');
      p.appendChild(section); return;
    }
    const targets = quote.targetIds.map(id => pl.inv.find(item => item && item.id === id)).filter(Boolean);
    if (targets.length) {
      const list = document.createElement('div'); list.className = 'identification-list';
      for (const item of targets) {
        const row = document.createElement('div'); row.className = 'identification-row item-unidentified';
        row.innerHTML = `<span class="identification-sigil" aria-hidden="true">?</span><span>${U.esc(Items.displayName(item))}</span><b>UNIDENTIFIED</b>`;
        list.appendChild(row);
      }
      section.appendChild(list);
    } else section.insertAdjacentHTML('beforeend', '<div class="identification-empty" role="status">You carry nothing veiled.</div>');
    const all = document.createElement('button');
    all.type = 'button'; all.className = 'identify-all'; all.dataset.testid = 'identify-all';
    all.textContent = targets.length ? `Identify All · ${targets.length} item${targets.length === 1 ? '' : 's'}` : 'Identify All · Nothing veiled';
    all.setAttribute('aria-label', targets.length ? `Identify all ${targets.length} carried unidentified items for free` : 'No carried unidentified items');
    all.disabled = !targets.length;
    all.addEventListener('click', () => {
      const result = Game.identifyAllCarried();
      if (result && result.ok && typeof refresh === 'function') refresh();
    });
    section.appendChild(all); p.appendChild(section);
  },

  npcDialog(npc, nodeId) {
    const p = this.panel('npc');
    this.closeAll();
    this.openPanel = 'npc';
    p.classList.remove('hidden');
    this.head(p, npc.def.name.toUpperCase());
    const pl = G.player;
  
    const npcFaction = { elder: 'haven', healer: 'light', smith: 'ironsong', gambler: 'haven' }[npc.id];
    if (npcFaction && Factions.isHostile(pl.reputation, npcFaction)) {
      p.insertAdjacentHTML('beforeend', `<div class="npc-line">“You are an enemy of ${U.esc(Factions.byId[npcFaction].name)}. Leave.”</div>`);
      return;
    }
    pl.dialogue = Dialogue.migrate(pl.dialogue);
    const graph = Dialogue.graphs[npc.id];
    const currentId = graph && graph.nodes[nodeId] ? nodeId : graph && graph.start;
    const node = graph && graph.nodes[currentId];
    if (node) {
      Dialogue.visit(pl.dialogue, npc.id, currentId);
      if (typeof WUI !== 'undefined') WUI.discoverLoreSource('dialogue', npc.id, { node: currentId, location: G.map.name });
      Save.saveChar(pl);
    }
    const line = node ? node.text : U.pick(U.rand, npc.def.lines);
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">“${U.esc(line)}”</div>`);
    if (npc.id === 'elder') this.renderIdentificationService(p, pl, () => this.npcDialog(npc, nodeId));
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
    const difficulty = difficultyByIdx(pl.difficultyIdx);
    this.head(p, `WAYPOINT · ${difficulty.name.toUpperCase()}`);
    const tierRules = difficulty.resPenalty ? `Monster levels +${difficulty.mlvlAdd} · Hero resistances −${difficulty.resPenalty} percentage points` :
      'Baseline monster levels · No hero resistance penalty';
    p.insertAdjacentHTML('beforeend', `<div class="npc-line">The old stones hum. They remember every road.<br><small>${tierRules}</small></div>`);
    const opts = document.createElement('div');
    opts.className = 'npc-opts';
    ACTS.forEach((act, i) => {
      const b = document.createElement('button');
      const locked = i > pl.progress.actUnlocked;
      b.innerHTML = `Act ${U.roman(i + 1)} — ${act.name} ${locked ? '🔒' : ''}<div style="font-size:11px;color:#8a7444">Monster level ${act.mlvl + difficulty.mlvlAdd}+ ${pl.progress.bossKilled[i] ? '· boss slain ✓' : ''}</div>`;
      if (locked) { b.style.opacity = 0.4; }
      else b.addEventListener('click', () => { this.closeAll(); Game.enterDungeon(i, 1); });
      opts.appendChild(b);
    });
    if (pl.progress.actUnlocked > 4 || pl.progress.bossKilled[4]) {
      const next = (pl.progress.abyssBest || 0) + 1;
      const b = document.createElement('button');
      b.innerHTML = `⚫ THE ENDLESS ABYSS — descend to floor ${next}<div style="font-size:11px;color:#8a7444">Monster level ${ABYSS.mlvl0 + (next - 1) * 2 + difficulty.mlvlAdd} · ladder ranking</div>`;
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
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-labelledby', 'death-title');
    p.innerHTML = `<h2 id="death-title">YOU HAVE DIED</h2>`;
    if (hardcore) {
      p.insertAdjacentHTML('beforeend', `<div class="npc-line">Hardcore death is forever. ${U.esc(G.player.name)} joins the long silence.<br>Level ${G.player.lvl} · ${U.fmt(G.stats.kills)} monsters slain</div>`);
      const b = document.createElement('button');
      b.className = 'big-btn';
      b.textContent = 'ASHES TO ASHES';
      b.addEventListener('click', () => location.reload()); // the fallen hero stays on the ladder, marked ☠
      p.appendChild(b);
      requestAnimationFrame(() => b.focus());
    } else {
      const corpse = (G.player.corpses || []).find(entry => entry.id === G.lastDeathCorpseId);
      const gear = corpse ? corpse.gear.length : 0;
      p.insertAdjacentHTML('beforeend', `<div class="npc-line">Death takes its tithe: 10% of your gold.<br>${gear
        ? `Your corpse guards ${gear} equipped item${gear === 1 ? '' : 's'}. Rise in town, take the blood-red portal, and recover it.`
        : 'You carried no equipped gear. The town shrine rekindles your flame.'}<br><span class="death-safety">If the route closes or you leave the game, unresolved gear returns safely to the town recovery shrine.</span></div>`);
      const b = document.createElement('button');
      b.className = 'big-btn';
      b.textContent = 'RISE AGAIN';
      b.addEventListener('click', () => { this.closeAll(); Game.respawn(); });
      p.appendChild(b);
      requestAnimationFrame(() => b.focus());
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
  difficultySummary(campaign) {
    const progress = campaign.progress;
    const act = Math.min(4, progress.actUnlocked || 0);
    const complete = progress.bossKilled[4];
    return `${complete ? 'Campaign complete' : 'Act ' + U.roman(act + 1)}` +
      (progress.abyssBest ? ` · Abyss ${progress.abyssBest}` : '');
  },

  showMenuRoot(returnDifficultyFocus = false) {
    document.getElementById('create-panel').classList.add('hidden');
    document.getElementById('difficulty-panel').classList.add('hidden');
    document.getElementById('menu-buttons').classList.remove('hidden');
    document.getElementById('char-list').classList.remove('hidden');
    if (returnDifficultyFocus) {
      const origin = this.difficultyOrigin;
      const scrollTop = this.difficultyOriginScroll;
      this.difficultyOrigin = null;
      this.difficultyOriginScroll = null;
      if (Number.isFinite(scrollTop)) document.getElementById('menu-screen').scrollTop = scrollTop;
      if (origin && origin.isConnected && !origin.disabled) origin.focus({ preventScroll: true });
    }
  },

  showDifficultyPicker(character, origin) {
    const state = DifficultyState.migrate(character.difficulty, character);
    const cls = CLASSES.find(entry => entry.id === character.cls);
    this.difficultyOrigin = origin && origin.isConnected ? origin : null;
    this.difficultyOriginScroll = document.getElementById('menu-screen').scrollTop;
    document.getElementById('char-list').classList.add('hidden');
    document.getElementById('menu-buttons').classList.add('hidden');
    document.getElementById('create-panel').classList.add('hidden');
    document.getElementById('difficulty-panel').classList.remove('hidden');
    const heroSummary = document.getElementById('difficulty-hero');
    heroSummary.innerHTML = `<span class="dh-copy"><strong>${U.esc(character.name)}</strong>
      <span>Level ${character.lvl} ${U.esc(cls.name)} · gear, levels, and inventory carry across every tier</span></span>`;
    const portrait = document.createElement('canvas');
    portrait.width = 52; portrait.height = 52;
    portrait.setAttribute('aria-hidden', 'true');
    const portraitSheet = Sprites.getActor(character.cls);
    portrait.getContext('2d').drawImage(portraitSheet.canvas, 0, 6 * portraitSheet.cell,
      portraitSheet.cell, portraitSheet.cell, -6, -4, 64, 64);
    heroSummary.prepend(portrait);

    const options = document.getElementById('difficulty-options');
    options.innerHTML = '';
    const flavor = [
      'Face the five Acts and awaken the Endless Abyss.',
      'Empowered foes test a battle-hardened hero.',
      'The final pilgrimage. Mercy has left this world.',
    ];
    DIFFICULTIES.forEach((difficulty, index) => {
      const locked = !DifficultyState.canSelect(state, index);
      const previous = index ? DIFFICULTIES[index - 1].name : '';
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `difficulty-card difficulty-${index}` + (state.selected === index ? ' selected' : '') +
        (locked ? ' locked' : '');
      card.dataset.difficulty = index;
      if (locked) card.setAttribute('aria-disabled', 'true');
      if (state.selected === index) card.setAttribute('aria-current', 'true');
      const levelModifier = difficulty.mlvlAdd ? `Monster levels +${difficulty.mlvlAdd}` : 'Baseline monster levels';
      const heroResistance = difficulty.resPenalty ? `Hero resistances −${difficulty.resPenalty} percentage points` : 'No hero resistance penalty';
      const enemyResistance = difficulty.monsterResAdd ? `Enemy resistances +${Math.round(difficulty.monsterResAdd * 100)} percentage points` : 'No enemy resistance bonus';
      card.innerHTML = `<span class="dc-top"><span class="dc-sigil">${['Ⅰ', 'Ⅱ', 'Ⅲ'][index]}</span><span class="dc-state">${locked ? '◇ SEALED' : state.selected === index ? '◆ CURRENT' : 'AVAILABLE'}</span></span>
        <span class="dc-name">${difficulty.name.toUpperCase()}</span>
        <span class="dc-flavor">${flavor[index]}</span>
        <span class="dc-mods">${levelModifier}<br>Enemy life ×${difficulty.hpMult} · Enemy damage ×${difficulty.dmgMult}<br>${heroResistance}<br>${enemyResistance}</span>
        <span class="dc-progress">${locked ? `Defeat Act V on ${previous} to unlock` : this.difficultySummary(state.campaigns[index])}</span>
        <span class="dc-action">${locked ? 'COMPLETE THE PRIOR TIER' : 'ENTER CAMPAIGN →'}</span>`;
      card.addEventListener('click', () => {
        if (locked) { sfx('nope'); return; }
        sfx('ui'); Game.loadGame(character.name, index);
      });
      options.appendChild(card);
    });
    const preferred = options.querySelector(`[data-difficulty="${state.selected}"]:not(.locked)`) ||
      options.querySelector('.difficulty-card:not(.locked)');
    if (preferred) preferred.focus({ preventScroll: true });
  },

  initMenu() {
    const s = SEASON.current();
    document.getElementById('season-banner').textContent =
      `❖ SEASON ${s.num}: ${s.name.toUpperCase()} — day ${s.day}, resets in ${s.daysLeft} days ❖`;
    this.refreshCharList();
    document.getElementById('btn-new').addEventListener('click', () => {
      document.getElementById('create-panel').classList.remove('hidden');
      document.getElementById('difficulty-panel').classList.add('hidden');
      document.getElementById('menu-buttons').classList.add('hidden');
      document.getElementById('char-list').classList.add('hidden');
      this.buildClassCards();
    });
    document.getElementById('btn-back').addEventListener('click', () => this.showMenuRoot());
    document.getElementById('btn-difficulty-back').addEventListener('click', () => this.showMenuRoot(true));
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
      const difficulty = DifficultyState.migrate(c.difficulty, c);
      const campaign = difficulty.campaigns[difficulty.selected];
      const row = document.createElement('div');
      row.className = 'char-slot-row';
      const hero = document.createElement('button');
      hero.type = 'button';
      hero.className = 'char-slot' + (c.dead ? ' dead' : '');
      hero.disabled = !!c.dead;
      hero.setAttribute('aria-label', c.dead ? `${c.name}, fallen hero` : `Choose difficulty for ${c.name}`);
      const face = document.createElement('canvas');
      face.width = 48; face.height = 48;
      const sheet = Sprites.getActor(c.cls);
      face.getContext('2d').drawImage(sheet.canvas, 0, 6 * sheet.cell, sheet.cell, sheet.cell, -6, -4, 60, 60);
      hero.appendChild(face);
      hero.insertAdjacentHTML('beforeend', `<span class="cs-copy"><span class="cs-name">${U.esc(c.name)} ${c.hardcore ? '<span class="hc-tag">HARDCORE</span>' : ''} ${c.dead ? '☠' : ''}</span>
        <span class="cs-sub">Level ${c.lvl} ${cls.name} · <span class="cs-difficulty">${DIFFICULTIES[difficulty.selected].name}</span> · ${this.difficultySummary(campaign)}</span></span>`);
      if (!c.dead) hero.addEventListener('click', () => this.showDifficultyPicker(c, hero));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cs-del';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Delete ${c.name}`);
      remove.addEventListener('click', () => {
        if (remove.dataset.confirm) { Save.deleteChar(c.name, false); this.refreshCharList(); }
        else {
          remove.dataset.confirm = '1';
          remove.textContent = 'SURE?';
          remove.setAttribute('aria-label', `Confirm delete ${c.name}`);
        }
      });
      row.append(hero, remove);
      wrap.appendChild(row);
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
