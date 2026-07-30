// ============ DIABLOID: main.js — game state, loop, input, saves ============
'use strict';

// ---------------- global game state ----------------
const G = {
  state: 'menu',
  map: null, town: null, player: null,
  monsters: [], projs: [], parts: [], rings: [], flashes: [], bolts: [], dmgNums: [],
  pending: [], storms: [], grounds: [], groundItems: [], npcs: [],
  portal: null, dungeonSave: null,
  stash: [], shopStock: [],
  time: 0, shake: 0, stats: { kills: 0 },
  stairsCd: 0, autosaveT: 20,
  mouseWorld: [0, 0],

  portalOnMap(map) {
    if (!this.portal) return null;
    if (this.portal.mapRef === map) return { x: this.portal.x, y: this.portal.y };
    if (map.town) return { x: map.portalSpot.x, y: map.portalSpot.y };
    return null;
  },

  awardXp(n) {
    const pl = this.player;
    if (pl.dead || pl.lvl >= MAX_LVL) return;
    n = Math.floor(n * (1 + pl.derived.xpGain / 100));
    pl.xp += n;
    while (pl.lvl < MAX_LVL && pl.xp >= XP_TABLE(pl.lvl + 1)) {
      pl.lvl++;
      pl.statPts += 5;
      pl.skillPts += 1;
      Ent.computeDerived(pl);
      pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
      sfx('levelup');
      FX.levelUp(pl.x, pl.y);
      UI.announce(`LEVEL ${pl.lvl}!  +5 stats, +1 skill point`, '#ffd94f');
      Save.saveChar(pl);
    }
  },

  dropLoot(m) {
    const pl = this.player, d = pl.derived;
    const scatter = () => ({ x: m.x + U.rf(U.rand, -0.9, 0.9), y: m.y + U.rf(U.rand, -0.9, 0.9) });
    // gold
    if (U.chance(U.rand, 0.5)) {
      const amt = Math.ceil((4 + m.lvl * 2.6) * U.rf(U.rand, 0.6, 1.7) * (1 + d.goldFind / 100) * (m.rank === 'boss' ? 8 : m.rank === 'elite' ? 3 : 1));
      this.groundItems.push({ ...scatter(), gold: amt });
    }
    // potion
    if (U.chance(U.rand, 0.11)) {
      const kind = U.chance(U.rand, 0.6) ? 'hp' : 'mp';
      this.groundItems.push({ ...scatter(), item: { type: 'potion_' + kind, potion: kind, name: kind === 'hp' ? 'Healing Potion' : 'Mana Potion', rarity: 'common' } });
    }
    // items
    let rolls = 0;
    if (m.rank === 'boss') rolls = 4;
    else if (m.rank === 'elite') rolls = 2;
    else if (m.rank === 'champion') rolls = 1 + (U.chance(U.rand, 0.6) ? 1 : 0);
    else if (U.chance(U.rand, 0.2)) rolls = 1;
    for (let i = 0; i < rolls; i++) {
      const opts = { classId: pl.cls, mf: d.mf, unidentified: true };
      if (m.rank === 'boss' && i === 0)
        opts.forceRarity = U.weighted(U.rand, [['unique', 22], ['set', 22], ['rare', 56]]);
      const it = Items.generate(m.lvl + (m.rank === 'boss' ? 2 : 0), opts);
      this.groundItems.push({ ...scatter(), item: it });
      sfx(it.rarity === 'unique' || it.rarity === 'set' ? 'unique' : it.rarity === 'rare' ? 'rare' : 'drop');
      if (it.rarity === 'unique') UI.announce(`✧ ${Items.displayName(it)} ✧`, Items.rarityColor('unique'));
    }
    // Components are a separate progression stream. The item API determines
    // their level/difficulty eligibility; ranks control how often players see
    // them, with bosses guaranteeing an opportunity.
    const componentChance = m.rank === 'boss' ? 1 : m.rank === 'elite' ? .28 : m.rank === 'champion' ? .13 : .035;
    if (U.chance(U.rand, componentChance)) this.dropComponent(m.x, m.y, m.lvl + (m.rank === 'boss' ? 3 : 0));
    const identifyChance = m.rank === 'boss' ? 1 : m.rank === 'elite' ? .18 : m.rank === 'champion' ? .09 : .035;
    if (U.chance(U.rand, identifyChance)) this.dropIdentifyScroll(m.x, m.y);
    const charmChance = typeof InventoryCharms !== 'undefined' && InventoryCharms.DROP_CHANCE
      ? InventoryCharms.DROP_CHANCE[m.rank] || 0 : 0;
    if (U.chance(U.rand, charmChance)) this.dropCharm(m.x, m.y, m.lvl + (m.rank === 'boss' ? 2 : 0));
  },

  dropComponent(x, y, ilvl) {
    const pl = this.player;
    if (!pl || typeof Items === 'undefined' || typeof Items.rollComponent !== 'function') return null;
    const difficulty = Number(pl.difficultyIdx ?? (pl.difficulty && pl.difficulty.selected) ?? 0) || 0;
    const item = Items.rollComponent(ilvl, difficulty, U.rand);
    if (!item) return null;
    G.groundItems.push({ x, y, item });
    sfx('drop');
    if (item.kind === 'rune') UI.announce(`Rune found: ${item.name}`, '#ffff77', 1800);
    return item;
  },

  dropIdentifyScroll(x, y) {
    if (typeof Items === 'undefined' || typeof Items.makeIdentifyScroll !== 'function') return null;
    const pl = G.player || {};
    const records = (pl.inv || []).concat(Object.values(pl.equip || {}), G.stash || [],
      Object.values(pl.mercenary && pl.mercenary.equipment || {}),
      (pl.corpses || []).flatMap(corpse => (corpse.gear || []).map(entry => entry && entry.item)),
      (G.groundItems || []).map(ground => ground && ground.item),
      (G.dungeonSave && G.dungeonSave.groundItems || []).map(ground => ground && ground.item));
    const used = new Set(records.filter(Boolean).map(record => record.id));
    let item = null;
    do item = Items.makeIdentifyScroll(); while (item && used.has(item.id));
    if (!item) return null;
    G.groundItems.push({ x: x + U.rf(U.rand, -0.45, 0.45), y: y + U.rf(U.rand, -0.45, 0.45), item });
    sfx('drop');
    return item;
  },

  dropCharm(x, y, ilvl) {
    if (typeof Items === 'undefined' || typeof Items.makeCharm !== 'function') return null;
    const item = Items.makeCharm(ilvl);
    if (!item) return null;
    G.groundItems.push({ x: x + U.rf(U.rand, -0.6, 0.6), y: y + U.rf(U.rand, -0.6, 0.6), item });
    sfx('drop');
    return item;
  },

  onBossKilled(m) {
    const pl = this.player;
    const actIdx = this.map.actIdx;
    let unlockedDifficulty = null;
    UI.announce(`${BOSSES[this.map.bossKey || ACTS[actIdx].boss].name.split(',')[0]} HAS FALLEN`, '#ff8a5a', 4200);
    this.map.bossDead = true;
    if (typeof actIdx === 'number') {
      pl.progress.bossKilled[actIdx] = true;
      if (actIdx < 4) {
        pl.progress.actUnlocked = Math.max(pl.progress.actUnlocked, actIdx + 1);
        setTimeout(() => UI.announce(`Act ${U.roman(actIdx + 2)} unlocked: ${ACTS[actIdx + 1].name}`, '#8fc8ff', 4000), 4400);
      } else {
        pl.progress.actUnlocked = 5;
        unlockedDifficulty = DifficultyState.unlockNext(pl.difficulty, pl.difficultyIdx);
        setTimeout(() => UI.announce('THE ENDLESS ABYSS AWAITS', '#c07bff', 5000), 4400);
      }
    }
    if (unlockedDifficulty !== null) {
      const name = DIFFICULTIES[unlockedDifficulty].name.toUpperCase();
      setTimeout(() => UI.announce(`${name} DIFFICULTY UNLOCKED`, unlockedDifficulty === 2 ? '#ff765e' : '#b9a8ff', 5200), 7000);
    }
    G.shake += 14;
    Save.saveChar(pl);
  },

  onPlayerDeath(src) {
    const pl = this.player;
    if (pl.dead) return;
    pl.dead = true;
    sfx('bigdie');
    FX.deathBurst(pl.x, pl.y, '#a01414', 1.4);
    this.shake += 12;
    if (pl.hardcore) {
      pl.deadForever = true;
      Save.saveChar(pl);   // preserved as a fallen hero on the ladder
    } else {
      const captured = CorpseState.capture(pl, Game.corpseLocation(this.map, pl.x, pl.y));
      this.lastDeathCorpseId = captured.ok ? captured.corpse.id : null;
      pl.gold = Math.floor(pl.gold * 0.9);
      Ent.computeDerived(pl);
      pl.mp = Math.min(pl.mp, pl.derived.maxMp);
      Save.saveChar(pl);
    }
    setTimeout(() => UI.showDeath(pl.hardcore), 900);
  },
};

// ---------------- persistence ----------------
const Save = {
  CHARS: 'diabloid_chars_v1', STASH: 'diabloid_stash_v1',
  _all() {
    try { return JSON.parse(localStorage.getItem(this.CHARS) || '{}'); } catch (e) { return {}; }
  },
  listChars() {
    const all = this._all();
    return Object.values(all).sort((a, b) => b.lvl - a.lvl);
  },
  saveChar(pl) {
    DifficultyState.capture(pl);
    this.normalizeItems(pl, G.stash);
    const all = this._all();
    all[pl.name.toLowerCase()] = {
      name: pl.name, cls: pl.cls, hardcore: pl.hardcore, dead: !!pl.deadForever,
      lvl: pl.lvl, xp: pl.xp, stats: pl.stats, statPts: pl.statPts, skillPts: pl.skillPts,
      skills: pl.skills, hotbar: pl.hotbar, equip: pl.equip, inv: pl.inv, corpses: pl.corpses,
      gold: pl.gold, potions: pl.potions, progress: pl.progress, difficultyIdx: pl.difficultyIdx || 0,
      difficulty: pl.difficulty,
      bars: pl.bars, macros: pl.macros, quests: pl.quests, dialogue: Dialogue.migrate(pl.dialogue), lore: Lore.migrate(pl.lore), narrative: Narrative.migrate(pl.narrative), reputation: Factions.migrate(pl.reputation),
      mercenary: this.migrateMercenary(pl.mercenary),
      kills: G.stats.kills, season: SEASON.current().num,
    };
    try {
      localStorage.setItem(this.CHARS, JSON.stringify(all));
      return true;
    } catch (e) {
      return false;
    }
  },
  migrateMercenary(raw) {
    if (!raw) return null;
    // Early prototypes used `merc`, `type`, `level`, `gear`, and `isDead`.
    const id = raw.archetypeId || raw.type || raw.id;
    if (!MERCENARY_BY_ID[id]) return null;
    const equipment = raw.equipment || raw.gear || {};
    return {
      archetypeId: id, level: Math.max(1, +(raw.level || raw.lvl) || 1), xp: Math.max(0, +raw.xp || 0),
      equipment: Object.assign({}, equipment), dead: !!(raw.dead || raw.isDead),
    };
  },
  _normalizeCharmOwnership(pl, stash) {
    if (typeof InventoryCharms === 'undefined' || !InventoryCharms || typeof InventoryCharms.isCharmRecord !== 'function') return 0;
    const locators = [];
    const arrayEntries = (scope, list, itemOf = value => value) => {
      (Array.isArray(list) ? list : []).forEach((value, index) => locators.push({
        scope, item: itemOf(value), clear() { if (scope === 'ground' || scope === 'dungeon-ground') { if (list[index]) list[index].item = null; } else list[index] = null; },
      }));
    };
    // Valid-owner precedence is deterministic. Invalid equipment locations
    // are visited last so they can never displace a legitimate carried copy.
    arrayEntries('inventory', pl.inv);
    arrayEntries('stash', stash);
    arrayEntries('ground', G.groundItems, entry => entry && entry.item);
    const dungeonGround = G.dungeonSave && G.dungeonSave.groundItems;
    // Returning through a portal deliberately restores the saved ground array
    // by reference. Do not scan that one physical owner twice: the duplicate
    // locator would otherwise clear the live item as an alias of itself.
    if (dungeonGround !== G.groundItems)
      arrayEntries('dungeon-ground', dungeonGround, entry => entry && entry.item);
    for (const corpse of pl.corpses || []) for (const entry of corpse.gear || [])
      locators.push({ scope: 'corpse', item: entry && entry.item, clear() { if (entry) entry.item = null; } });
    for (const slot of Object.keys(pl.equip || {}))
      locators.push({ scope: 'equipment', item: pl.equip[slot], clear() { pl.equip[slot] = null; } });
    for (const slot of Object.keys(pl.mercenary && pl.mercenary.equipment || {}))
      locators.push({ scope: 'mercenary', item: pl.mercenary.equipment[slot], clear() { pl.mercenary.equipment[slot] = null; } });

    const seenObjects = new Set(), seenIds = new Set();
    // Reserve every already-valid top-level id before assigning legacy charm
    // ids. Without this prepass, an earlier missing-id record could claim the
    // id of a later valid charm and make normalization delete that valid item.
    const reservedIds = new Set();
    for (const locator of locators) {
      try {
        const id = locator.item && locator.item.id;
        if (typeof id === 'string' && id.trim() && id.trim() === id) reservedIds.add(id);
      } catch (_error) { /* hostile legacy getter is discarded below */ }
    }
    let removed = 0, serial = 0;
    const discard = locator => {
      try { locator.clear(); } catch (_error) { /* malformed immutable owner */ }
      removed++;
    };
    for (const locator of locators) {
      const item = locator.item;
      if (!item) continue;
      let charmRecord = false;
      try { charmRecord = InventoryCharms.isCharmRecord(item); }
      catch (_error) { discard(locator); continue; }
      if (!charmRecord) continue;
      try {
        if (locator.scope === 'equipment' || locator.scope === 'mercenary' || seenObjects.has(item)) {
          discard(locator); continue;
        }
        if (typeof item.id !== 'string' || !item.id.trim() || item.id.trim() !== item.id) {
          let id;
          do id = `legacy-charm-${locator.scope}-${++serial}`; while (reservedIds.has(id));
          item.id = id;
          if (item.id !== id) { discard(locator); continue; }
          reservedIds.add(id);
        }
        if (seenIds.has(item.id) || !InventoryCharms.normalize(item)) {
          discard(locator); continue;
        }
        seenObjects.add(item); seenIds.add(item.id);
      } catch (_error) {
        discard(locator); continue;
      }
    }

    const compact = list => {
      if (!Array.isArray(list)) return;
      for (let index = list.length - 1; index >= 0; index--) if (!list[index]) list.splice(index, 1);
    };
    compact(pl.inv); compact(stash);
    const compactGround = list => {
      if (!Array.isArray(list)) return;
      for (let index = list.length - 1; index >= 0; index--) {
        const entry = list[index];
        if (!entry || (!entry.item && !entry.gold)) list.splice(index, 1);
      }
    };
    compactGround(G.groundItems);
    compactGround(G.dungeonSave && G.dungeonSave.groundItems);
    for (const corpse of pl.corpses || []) corpse.gear = (corpse.gear || []).filter(entry => entry && entry.item);
    pl.corpses = (pl.corpses || []).filter(corpse => corpse.gear && corpse.gear.length);
    return removed;
  },
  normalizeItems(pl) {
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return;
    if (!Array.isArray(pl.inv)) pl.inv = [];
    if (!pl.equip || typeof pl.equip !== 'object' || Array.isArray(pl.equip)) pl.equip = {};
    if (pl.mercenary && (typeof pl.mercenary !== 'object' || Array.isArray(pl.mercenary))) pl.mercenary = null;
    if (pl.mercenary && (!pl.mercenary.equipment || typeof pl.mercenary.equipment !== 'object' ||
        Array.isArray(pl.mercenary.equipment))) pl.mercenary.equipment = {};
    if (!Array.isArray(G.groundItems)) G.groundItems = [];
    if (G.dungeonSave && !Array.isArray(G.dungeonSave.groundItems)) G.dungeonSave.groundItems = [];
    if (typeof CorpseState !== 'undefined') pl.corpses = CorpseState.migrate(pl.corpses);
    const seen = new Set(), seenObjects = new Set();
    const invalid = new Set();
    let stash = arguments.length > 1 ? arguments[1] : G.stash;
    if (!Array.isArray(stash)) {
      if (stash === G.stash || arguments.length < 2) G.stash = [];
      stash = [];
    }
    this._normalizeCharmOwnership(pl, stash);
    const corpseGear = (pl.corpses || []).flatMap((corpse, corpseIndex) =>
      (corpse.gear || []).map((entry, gearIndex) =>
        [`corpse-${corpseIndex}-${gearIndex}-${entry.slot}`, entry.item]));
    const locations = Object.keys(pl.equip || {}).map(slot => ['equip-' + slot, pl.equip[slot]])
      .concat((pl.inv || []).map((item, i) => ['inv-' + i, item]))
      .concat(Object.entries(pl.mercenary && pl.mercenary.equipment || {})
        .map(([slot, item]) => ['merc-' + slot, item]))
      .concat(corpseGear)
      .concat((stash || []).map((item, i) => ['stash-' + i, item]))
      .concat((G.groundItems || []).map((ground, i) => ['ground-' + i, ground && ground.item]))
      .concat((G.dungeonSave && G.dungeonSave.groundItems || []).map((ground, i) => ['dungeon-ground-' + i, ground && ground.item]));
    // Reserve every already-present identity before assigning any legacy id.
    // Location order must never let an earlier missing-id generic item steal a
    // later canonical charm/component id.
    const reservedIds = new Set(), reservedObjects = new Set();
    const reserveIds = item => {
      if (!item || typeof item !== 'object' || reservedObjects.has(item)) return;
      reservedObjects.add(item);
      try {
        const id = item.id;
        if (typeof id === 'string' && id.trim() && id.trim() === id) reservedIds.add(id);
        if (Array.isArray(item.gems)) for (const component of item.gems) reserveIds(component);
      } catch (_error) { /* hostile records are pruned in the main pass */ }
    };
    for (const [, item] of locations) reserveIds(item);
    for (const [location, item] of locations) {
      if (!item) continue;
      if (typeof item !== 'object' || Array.isArray(item)) {
        invalid.add(item);
        continue;
      }
      if (seenObjects.has(item)) continue;
      seenObjects.add(item);
      const candidateSeen = new Set(seen);
      const candidateReserved = new Set(reservedIds);
      try {
        const isComponent = item.component || item.kind === 'gem' || item.kind === 'rune';
        if (isComponent && !this._normalizeComponent(item, location)) {
          invalid.add(item);
          continue;
        }
        const charmRecord = typeof InventoryCharms !== 'undefined' && InventoryCharms.isCharmRecord(item);
        if (charmRecord && typeof item.id === 'string' && seen.has(item.id)) {
          invalid.add(item);
          continue;
        }
        if (!this._normalizeItemId(item, location, candidateSeen, candidateReserved)) {
          invalid.add(item);
          continue;
        }
        if (charmRecord && !InventoryCharms.normalize(item)) {
          invalid.add(item);
          continue;
        }
        if (typeof ItemIdentification !== 'undefined' && ItemIdentification && typeof ItemIdentification.normalize === 'function')
          ItemIdentification.normalize(item);
        // Durability belongs only to top-level equipment. Socket fillers and
        // standalone components retain their own authoritative component data.
        if (!isComponent && typeof ItemCondition !== 'undefined' && ItemCondition && typeof ItemCondition.normalize === 'function')
          ItemCondition.normalize(item);
        this._normalizeSocketState(item, location, candidateSeen, candidateReserved);
      } catch (_error) {
        // Immutable/accessor-backed legacy records cannot be made canonical.
        // Fail closed by pruning that exact owner instead of aborting the save.
        invalid.add(item);
        continue;
      }
      // Identity claims become authoritative only after this exact record and
      // its surviving socket fillers finish canonicalization successfully.
      for (const id of candidateSeen) seen.add(id);
      for (const id of candidateReserved) reservedIds.add(id);
    }
    // Malformed standalone component records cannot be made safe to use. Drop
    // them deterministically instead of leaving an unequippable ghost item in
    // a save. Malformed nested fillers are already cleared above.
    for (let i = (pl.inv || []).length - 1; i >= 0; i--) if (invalid.has(pl.inv[i])) pl.inv.splice(i, 1);
    for (const slot of Object.keys(pl.equip || {})) if (invalid.has(pl.equip[slot])) pl.equip[slot] = null;
    for (const slot of Object.keys(pl.mercenary && pl.mercenary.equipment || {}))
      if (invalid.has(pl.mercenary.equipment[slot])) pl.mercenary.equipment[slot] = null;
    for (const corpse of pl.corpses || [])
      corpse.gear = (corpse.gear || []).filter(entry => entry.item && !invalid.has(entry.item));
    pl.corpses = (pl.corpses || []).filter(corpse => corpse.gear.length);
    for (let i = (stash || []).length - 1; i >= 0; i--) if (invalid.has(stash[i])) stash.splice(i, 1);
    for (let i = (G.groundItems || []).length - 1; i >= 0; i--)
      if (G.groundItems[i] && invalid.has(G.groundItems[i].item)) G.groundItems.splice(i, 1);
    const dungeonGround = G.dungeonSave && G.dungeonSave.groundItems || [];
    for (let i = dungeonGround.length - 1; i >= 0; i--)
      if (dungeonGround[i] && invalid.has(dungeonGround[i].item)) dungeonGround.splice(i, 1);
    // Normalization can remove an active charm or repair an invalid/duplicate
    // grid into one active owner. Keep live derived resources truthful before
    // any caller serializes or renders the repaired state; refresh never heals.
    if (pl === G.player && typeof Ent !== 'undefined' && Ent && typeof Ent.refreshDerived === 'function')
      Ent.refreshDerived(pl);
  },
  _normalizeItemId(item, location, seen, reserved = new Set()) {
    try {
      let id = typeof item.id === 'string' && item.id.trim() && item.id.trim() === item.id ? item.id : '';
      if (!id || seen.has(id)) {
        const stem = String(item.type || item.kind || item.potion || 'item').replace(/[^a-z0-9_-]/gi, '-');
        id = `legacy-${stem}-${location}`;
        let suffix = 2;
        while (seen.has(id) || reserved.has(id)) id = `legacy-${stem}-${location}-${suffix++}`;
        item.id = id;
        if (item.id !== id) return false;
      }
      seen.add(id); reserved.add(id);
      return true;
    } catch (_error) {
      return false;
    }
  },
  _normalizeSocketState(item, location, seen, reserved) {
    if (!item || !Array.isArray(item.gems)) return;
    const sockets = Math.max(0, Math.floor(Number(item.sockets) || 0));
    item.sockets = sockets;
    // Old saves occasionally have a short/long gem array. Keep valid fillers
    // and make the capacity explicit before reconciling the word overlay.
    item.gems = item.gems.slice(0, sockets);
    while (item.gems.length < sockets) item.gems.push(null);
    item.gems.forEach((component, index) => {
      if (!component) return;
      try {
        const normalized = this._normalizeComponent(component, `${location}-socket-${index}`);
        if (!normalized) { item.gems[index] = null; return; }
        item.gems[index] = normalized;
        if (!this._normalizeItemId(normalized, `${location}-socket-${index}`, seen, reserved)) item.gems[index] = null;
      } catch (_error) {
        // A corrupt/immutable filler must not destroy its otherwise valid host.
        item.gems[index] = null;
      }
    });
    // New socket stats are derived at use time. This removes one legacy word
    // overlay exactly once and is idempotent on all subsequent saves/loads.
    if (typeof Items !== 'undefined' && typeof Items.applyRuneword === 'function') Items.applyRuneword(item);
  },
  _normalizeComponent(raw, location) {
    if (typeof Items !== 'undefined' && typeof Items.normalizeComponent === 'function') {
      const normalized = Items.normalizeComponent(raw);
      if (normalized) return normalized;
    }
    const kind = raw.kind === 'gem' || raw.gemType ? 'gem'
      : raw.kind === 'rune' || (typeof raw.name === 'string' && typeof RUNE_BY_NAME !== 'undefined' && RUNE_BY_NAME[raw.name.replace(/ Rune$/, '')]) ? 'rune' : null;
    let made = null;
    if (kind === 'gem' && typeof Items.makeGem === 'function') made = Items.makeGem(raw.gemType || raw.type, raw.quality || raw.tier || 'chipped');
    if (kind === 'rune' && typeof Items.makeRune === 'function') made = Items.makeRune(String(raw.name || raw.rune || '').replace(/ Rune$/, ''));
    if (!made) return null;
    // Preserve save identity/placement metadata, but regenerate every gameplay
    // field from the authoritative component definition.
    const identity = { id: raw.id, _gx: raw._gx, _gy: raw._gy };
    Object.assign(raw, made, identity, { kind, component: true });
    if (kind === 'gem') { raw.gemType = made.gemType; raw.quality = made.quality; }
    if (kind === 'rune') { raw.name = made.name; raw.ord = made.ord; }
    return raw;
  },
  loadChar(name) { return this._all()[name.toLowerCase()] || null; },
  deleteChar(name, permanent) {
    const all = this._all();
    delete all[name.toLowerCase()];
    localStorage.setItem(this.CHARS, JSON.stringify(all));
  },
  saveStash() {
    this.normalizeItems(G.player || {}, G.stash);
    try {
      localStorage.setItem(this.STASH, JSON.stringify(G.stash));
      return true;
    } catch (e) {
      return false;
    }
  },
  loadStash() {
    try { G.stash = JSON.parse(localStorage.getItem(this.STASH) || '[]'); } catch (e) { G.stash = []; }
    // Migration: filter nulls from legacy 48-slot array format
    G.stash = (Array.isArray(G.stash) ? G.stash : []).filter(it => it != null);
    this.normalizeItems(G.player || {}, G.stash);
    // Ownership normalization may prune a stale copy whose canonical owner is
    // the active character. Persist that repair now so selling or dropping the
    // winning copy cannot resurrect the stale stash record on the next load.
    try { localStorage.setItem(this.STASH, JSON.stringify(G.stash)); } catch (e) { /* storage full */ }
  },
};

// ---------------- game controller ----------------
const Game = {
  keys: {}, mouse: { x: 0, y: 0, lmb: false, rmb: false }, lmbCasting: false,
  potCd: 0,

  mapKey(map) {
    if (!map || map.town) return 'town';
    if (!map._corpseKey) {
      const difficulty = Number(G.player && G.player.difficultyIdx) || 0;
      map._corpseKey = `d${difficulty}:a${map.actIdx}:f${map.depth || 0}:b${map.abyssFloor || 0}:s${map.seed ?? 'live'}`;
    }
    return map._corpseKey;
  },

  corpseLocation(map, x, y) {
    if (!map || map.town) return Object.assign(this.townCorpseLocation(), { x, y });
    return { kind: 'dungeon', dungeon: this.mapKey(map), area: map.name || 'Unknown depths',
      act: Number.isFinite(Number(map.actIdx)) ? Number(map.actIdx) : undefined,
      floor: Number(map.abyssFloor || map.depth) || 0, x, y };
  },

  townCorpseLocation() {
    return { kind: 'town', town: "Haven's Rest", area: 'Recovery shrine', x: 14.5, y: 18.5 };
  },

  arrangeTownCorpses(pl = G.player) {
    const offsets = [[0,0],[-1.1,0],[1.1,0],[-.55,.95],[.55,.95],[-.55,-.95],[.55,-.95]];
    (pl && pl.corpses || []).filter(corpse => corpse.location && corpse.location.kind === 'town')
      .forEach((corpse, index) => {
        const offset = offsets[index % offsets.length];
        corpse.location.x = 14.5 + offset[0]; corpse.location.y = 18.5 + offset[1];
        corpse.location.town = "Haven's Rest"; corpse.location.area = 'Recovery shrine';
      });
  },

  relocateCorpsesToTown(isAccessible) {
    const pl = G.player;
    if (!pl || typeof CorpseState === 'undefined') return 0;
    const count = CorpseState.relocateInaccessible(pl, isAccessible, this.townCorpseLocation());
    this.arrangeTownCorpses(pl);
    return count;
  },

  corpsesOnMap(map = G.map) {
    const corpses = G.player && G.player.corpses || [];
    if (!map) return [];
    if (map.town) return corpses.filter(corpse => corpse.location && corpse.location.kind === 'town');
    const key = this.mapKey(map);
    return corpses.filter(corpse => corpse.location && corpse.location.kind === 'dungeon' && corpse.location.dungeon === key);
  },

  newGame(name, clsId, hardcore) {
    const cls = CLASSES.find(c => c.id === clsId);
    const pl = {
      name, cls: clsId, hardcore, dead: false, deadForever: false,
      lvl: 1, xp: 0, stats: { str: 0, dex: 0, vit: 0, ene: 0 }, statPts: 0, skillPts: 0,
      skills: {}, cds: {}, buffs: [],
      hotbar: { lmb: 'atk', rmb: null, s1: null, s2: null, s3: null, s4: null },
      equip: { weapon: null, offhand: null, helm: null, chest: null, gloves: null, boots: null, belt: null, amulet: null, ring1: null, ring2: null },
      inv: [], corpses: [],
      gold: 120, potions: { hp: 3, mp: 2 },
      dialogue: DialogueState.create(),
      lore: Lore.create(),
      narrative: Narrative.create(),
      quests: QuestState.create(),
      difficulty: DifficultyState.create(),
      mercenary: null,
      x: 0, y: 0, dir: 0, hp: 1, mp: 1, gcd: 0, attackT: 0, hurtT: 0, moving: false,
    };
    // starter kit: class weapon + first skill of first tree
    const wbase = WEAPON_TYPES.find(w => w.id === cls.weapon);
    pl.equip.weapon = Items.makeBaseItem(makeRng(1), wbase, 0, 1);
    const firstSkill = cls.trees[0].skills[0];
    pl.skills[firstSkill.id] = 1;
    pl.hotbar.rmb = firstSkill.id;
    DifficultyState.activate(pl, pl.difficulty, 0);
    G.stats.kills = 0;
    this.start(pl);
  },

  loadGame(name, requestedDifficulty) {
    const c = Save.loadChar(name);
    if (!c || c.dead) return false;
    const difficulty = DifficultyState.migrate(c.difficulty, c);
    const selected = requestedDifficulty === undefined ? difficulty.selected : Number(requestedDifficulty);
    if (!DifficultyState.canSelect(difficulty, selected)) return false;
    const pl = {
      name: c.name, cls: c.cls, hardcore: c.hardcore, dead: false, deadForever: false,
      lvl: c.lvl, xp: c.xp, stats: c.stats, statPts: c.statPts, skillPts: c.skillPts,
      skills: c.skills || {}, cds: {}, buffs: [],
      hotbar: c.hotbar, equip: c.equip, inv: (Array.isArray(c.inv) ? c.inv : []).filter(it => it != null),
      corpses: CorpseState.migrate(c.corpses),
      bars: c.bars || null, macros: c.macros || [], dialogue: Dialogue.migrate(c.dialogue), lore: Lore.migrate(c.lore), narrative: Narrative.migrate(c.narrative), reputation: Factions.migrate(c.reputation || c.factions),
      gold: c.gold, potions: c.potions, difficulty,
      mercenary: Save.migrateMercenary(c.mercenary || c.merc),
      x: 0, y: 0, dir: 0, hp: 1, mp: 1, gcd: 0, attackT: 0, hurtT: 0, moving: false,
    };
    DifficultyState.activate(pl, difficulty, selected);
    Save.normalizeItems(pl);
    G.stats.kills = c.kills || 0;
    this.start(pl);
    return true;
  },

  start(pl) {
    pl.difficulty = DifficultyState.migrate(pl.difficulty, pl);
    DifficultyState.activate(pl, pl.difficulty, pl.difficulty.selected);
    pl.dialogue = Dialogue.migrate(pl.dialogue);
    pl.lore = Lore.migrate(pl.lore);
    pl.narrative = Narrative.migrate(pl.narrative);
    pl.reputation = Factions.migrate(pl.reputation);
    G.player = pl;
    Save.loadStash();
    Ent.computeDerived(pl);
    pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
    G.town = Dungeon.generateTown();
    // Dungeon maps are intentionally session-local. A saved corpse from an
    // interrupted session returns beside the town recovery shrine instead of
    // stranding equipment in a map that no longer exists.
    this.relocateCorpsesToTown(() => false);
    this.restock();
    G.state = 'game';
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.toTown();
    Save.saveChar(pl);
    UI.announce(`Welcome to Haven's Rest, ${pl.name}`, '#e8d089', 3400);
    const s = SEASON.current();
    setTimeout(() => UI.announce(`Season ${s.num}: ${s.name} — day ${s.day}`, '#c99a4f', 3000), 3600);
  },

  clearWorld() {
    Physics.clear();
    G.monsters = []; G.projs = []; G.pending = []; G.storms = []; G.grounds = [];
    G.groundItems = []; G.parts = []; G.rings = []; G.flashes = []; G.bolts = []; G.dmgNums = [];
    G.npcs = [];
  },

  toTown(keepDungeon) {
    if (!keepDungeon) {
      this.relocateCorpsesToTown(() => false);
      G.dungeonSave = null; G.portal = null;
    }
    this.clearWorld();
    G.map = G.town;
    const pl = G.player;
    pl.x = G.town.entry.x; pl.y = G.town.entry.y;
    G.npcs = NPCS.map(def => ({ id: def.id, def, x: G.town.npcSpots[def.id].x, y: G.town.npcSpots[def.id].y }));
    pl.buffs = pl.buffs.filter(b => b.persistent);
    Ent.computeDerived(pl);
    pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
    G.stairsCd = 1.2;
    Ent.syncMercenary();
    Save.saveChar(pl);
    Render.drawMinimap();
  },

  enterDungeon(actIdx, depth, abyssFloor) {
    // Entering another generated map closes the previous recovery route. Move
    // any unresolved gear home before invalidating that route.
    this.relocateCorpsesToTown(() => false);
    this.clearWorld();
    G.portal = null; G.dungeonSave = null;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const map = Dungeon.generate({ actIdx, depth, abyssFloor, seed, narrativeState: G.player.narrative });
    map.seed = seed;
    this.loadMap(map);
    if (actIdx === 'abyss') {
      const pl = G.player;
      if (abyssFloor > (pl.progress.abyssBest || 0)) {
        pl.progress.abyssBest = abyssFloor;
        UI.announce(`ABYSS FLOOR ${abyssFloor} — new personal depth!`, '#c07bff', 3200);
        Save.saveChar(pl);
      } else UI.announce(map.name, '#c07bff', 2600);
    } else if (depth === 1) UI.announce(`Act ${U.roman(actIdx + 1)}: ${ACTS[actIdx].name}`, '#e8d089', 3400);
    else UI.announce(map.name, '#e8d089', 2400);
    if (depth === 1 && typeof actIdx === 'number')
      setTimeout(() => UI.announce(ACTS[actIdx].intro, '#8a7444', 4200), 3500);
  },

  loadMap(map) {
    G.map = map;
    const pl = G.player;
    pl.x = map.entry.x; pl.y = map.entry.y;
    G.stairsCd = 1.5;
    for (const pack of map.packs) Ent.spawnPack(pack, map);
    Ent.syncMercenary();
    if (map.isBoss && map.bossSpot) {
      const bossKey = ACTS[map.actIdx].boss;
      map.bossKey = bossKey;
      const boss = Ent.makeBoss(bossKey, map.bossSpot.x, map.bossSpot.y, map.mlvl + 2);
      // honor guard
      for (let i = 0; i < 4; i++)
        Ent.makeMonster(U.pick(U.rand, map.pool), map.bossSpot.x + U.rf(U.rand, -3, 3), map.bossSpot.y + U.rf(U.rand, -3, 3), { mlvl: map.mlvl });
      boss.aggro = false;
    }
    sfx('stairs');
    Render.drawMinimap();
  },

  descend() {
    const map = G.map, pl = G.player;
    if (map.town) { UI.open('waypoint'); G.stairsCd = 1.5; return; }
    if (map.isBoss && !map.bossDead) {
      const bossName = BOSSES[ACTS[map.actIdx].boss].name.split(',')[0];
      UI.announce(`The way is sealed by ${bossName}`, '#ff6a5a');
      G.stairsCd = 1.5;
      return;
    }
    if (map.actIdx === 'abyss') this.enterDungeon('abyss', 1, map.abyssFloor + 1);
    else if (map.isBoss) {
      if (map.actIdx < 4) this.enterDungeon(map.actIdx + 1, 1);
      else this.enterDungeon('abyss', 1, (pl.progress.abyssBest || 0) + 1);
    } else this.enterDungeon(map.actIdx, map.depth + 1, 0);
  },

  respawn() {
    const pl = G.player;
    pl.dead = false;
    if (G.map && !G.map.town) {
      G.dungeonSave = { monsters: G.monsters, groundItems: G.groundItems };
      G.portal = { x: pl.x, y: pl.y, mapRef: G.map, deathReturn: true };
      this.toTown(true);
      UI.announce('A blood-red portal leads back to your corpse.', '#ff7a5f', 3200);
    } else this.toTown();
  },

  recoverCorpse(corpseId) {
    const pl = G.player;
    UI.inventoryGrid.ensureGrid(pl);
    const outcome = CorpseState.recover(pl, corpseId);
    if (!outcome.ok) {
      const message = outcome.reason === 'inventory-full'
        ? 'Recovery blocked: clear inventory space or empty the occupied gear slot.'
        : 'That corpse can no longer be recovered.';
      UI.announce(message, '#ff6a5a', 3000);
      return outcome;
    }
    Ent.refreshDerived(pl);
    Save.saveChar(pl);
    sfx('equip'); FX.ring(pl.x, pl.y, 1.8, '#ff715b', .7);
    UI.announce(`Corpse recovered: ${outcome.restored} equipped, ${outcome.spilled} moved to inventory.`, '#ffd79a', 3200);
    Render.drawMinimap();
    return outcome;
  },

  castPortal() {
    const pl = G.player;
    if (G.map.town) { UI.announce('You are already home.', '#8a7444'); return; }
    sfx('portal');
    G.portal = { x: pl.x, y: pl.y, mapRef: G.map };
    UI.announce('A portal tears open...', '#8fc8ff');
  },

  usePortal() {
    const pl = G.player;
    if (!G.portal) return;
    sfx('portal');
    if (G.map.town) {
      // return to the dungeon
      const savedMonsters = G.dungeonSave ? G.dungeonSave.monsters : [];
      const savedItems = G.dungeonSave ? G.dungeonSave.groundItems : [];
      const map = G.portal.mapRef;
      this.clearWorld();
      G.map = map;
      G.monsters = savedMonsters;
      G.groundItems = savedItems;
      pl.x = G.portal.x; pl.y = G.portal.y;
      Ent.syncMercenary();
      Render.drawMinimap();
    } else {
      G.dungeonSave = { monsters: G.monsters, groundItems: G.groundItems };
      const portal = G.portal;
      this.clearWorld();
      G.portal = portal;
      G.map = G.town;
      pl.x = G.town.portalSpot.x + 1; pl.y = G.town.portalSpot.y + 1;
      G.npcs = NPCS.map(def => ({ id: def.id, def, x: G.town.npcSpots[def.id].x, y: G.town.npcSpots[def.id].y }));
      Ent.syncMercenary();
      pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
      Save.saveChar(pl);
      Render.drawMinimap();
    }
    G.stairsCd = 1;
  },

  // ---------------- items (grid-aware) ----------------
  giveItem(it) {
    const pl = G.player;
    const controller = UI.inventoryGrid;
    controller.ensureGrid(pl);
    const pos = controller.findSpace(it, pl.inv);
    if (pos) {
      it._gx = pos.col; it._gy = pos.row;
      pl.inv.push(it);
      if (typeof Ent.refreshDerived === 'function') Ent.refreshDerived(pl);
      return true;
    }
    UI.announce('Inventory full!', '#ff6a5a');
    return false;
  },

  // Shared stash spans two localStorage keys, so moves persist the destination
  // before clearing the source. Any failed write rolls the live move back, and
  // a compensating write restores the first key when the second key failed.
  // If both the write and compensation fail, ownership normalization still
  // deterministically repairs the resulting durable duplicate on next load.
  depositStashItem(itemId) {
    const pl = G.player, controller = UI.inventoryGrid;
    if (!pl || !Array.isArray(pl.inv) || !Array.isArray(G.stash))
      return { ok: false, reason: 'invalid-container' };
    controller.ensureGrid(pl);
    const item = pl.inv.find(entry => entry && entry.id === itemId);
    if (!item) return { ok: false, reason: 'missing-item' };
    const position = controller.findSpace(item, G.stash);
    if (!position) return { ok: false, reason: 'stash-full' };
    const sourceIndex = pl.inv.indexOf(item);
    const xDescriptor = Object.getOwnPropertyDescriptor(item, '_gx');
    const yDescriptor = Object.getOwnPropertyDescriptor(item, '_gy');
    const restoreAnchor = () => {
      try {
        if (xDescriptor) Object.defineProperty(item, '_gx', xDescriptor); else delete item._gx;
        if (yDescriptor) Object.defineProperty(item, '_gy', yDescriptor); else delete item._gy;
      } catch (_error) { /* valid live items have writable placement metadata */ }
    };
    const rollback = () => {
      const stashIndex = G.stash.indexOf(item);
      if (stashIndex >= 0) G.stash.splice(stashIndex, 1);
      restoreAnchor();
      if (!pl.inv.includes(item)) pl.inv.splice(Math.min(sourceIndex, pl.inv.length), 0, item);
      Ent.refreshDerived(pl);
    };

    pl.inv.splice(sourceIndex, 1);
    try {
      item._gx = position.col; item._gy = position.row;
      if (item._gx !== position.col || item._gy !== position.row) throw new TypeError('immutable placement');
      G.stash.push(item);
    } catch (_error) {
      rollback();
      return { ok: false, reason: 'immutable-item' };
    }
    Ent.refreshDerived(pl);
    if (!Save.saveStash() || !G.stash.includes(item)) {
      rollback();
      return { ok: false, reason: 'storage-failure', failedKey: 'stash' };
    }
    if (!Save.saveChar(pl)) {
      rollback();
      const compensated = Save.saveStash();
      return { ok: false, reason: 'storage-failure', failedKey: 'character', durableDuplicate: !compensated };
    }
    return { ok: true, item };
  },

  takeStashItem(itemId) {
    const pl = G.player, controller = UI.inventoryGrid;
    if (!pl || !Array.isArray(pl.inv) || !Array.isArray(G.stash))
      return { ok: false, reason: 'invalid-container' };
    controller.ensureGrid(pl);
    const item = G.stash.find(entry => entry && entry.id === itemId);
    if (!item) return { ok: false, reason: 'missing-item' };
    const position = controller.findSpace(item, pl.inv);
    if (!position) return { ok: false, reason: 'inventory-full' };
    const sourceIndex = G.stash.indexOf(item);
    const xDescriptor = Object.getOwnPropertyDescriptor(item, '_gx');
    const yDescriptor = Object.getOwnPropertyDescriptor(item, '_gy');
    const restoreAnchor = () => {
      try {
        if (xDescriptor) Object.defineProperty(item, '_gx', xDescriptor); else delete item._gx;
        if (yDescriptor) Object.defineProperty(item, '_gy', yDescriptor); else delete item._gy;
      } catch (_error) { /* valid live items have writable placement metadata */ }
    };
    const rollback = () => {
      const inventoryIndex = pl.inv.indexOf(item);
      if (inventoryIndex >= 0) pl.inv.splice(inventoryIndex, 1);
      restoreAnchor();
      if (!G.stash.includes(item)) G.stash.splice(Math.min(sourceIndex, G.stash.length), 0, item);
      Ent.refreshDerived(pl);
    };

    G.stash.splice(sourceIndex, 1);
    try {
      item._gx = position.col; item._gy = position.row;
      if (item._gx !== position.col || item._gy !== position.row) throw new TypeError('immutable placement');
      pl.inv.push(item);
    } catch (_error) {
      rollback();
      return { ok: false, reason: 'immutable-item' };
    }
    Ent.refreshDerived(pl);
    if (!Save.saveChar(pl) || !pl.inv.includes(item)) {
      rollback();
      return { ok: false, reason: 'storage-failure', failedKey: 'character' };
    }
    if (!Save.saveStash()) {
      rollback();
      const compensated = Save.saveChar(pl);
      return { ok: false, reason: 'storage-failure', failedKey: 'stash', durableDuplicate: !compensated };
    }
    return { ok: true, item };
  },

  // Single transaction shared by inventory UI and keyboard/controller paths.
  // The component remains in inventory unless the item API accepts it, so a
  // failed level/capacity check cannot consume or partially move anything.
  insertSocket(componentId, targetId) {
    const pl = G.player;
    if (!pl || !componentId || !targetId || componentId === targetId) return { ok: false, reason: 'Select a component and a different socketed item.' };
    const component = pl.inv && pl.inv.find(item => item && item.id === componentId);
    const targets = Object.values(pl.equip || {}).concat(pl.inv || [], Object.values(pl.mercenary && pl.mercenary.equipment || {}));
    const target = targets.find(item => item && item.id === targetId);
    if (!component || !component.component || !target) return { ok: false, reason: 'That socket transaction is no longer valid.' };
    if (Items.isCharmRecord(target)) return { ok: false, reason: 'Charms cannot hold socket components.' };
    if (Items.needsIdentification(target)) return { ok: false, reason: 'Identify that item before socketing it.' };
    if (typeof Items.insertSocket !== 'function' || !Items.insertSocket(target, component, pl.lvl))
      return { ok: false, reason: 'Cannot socket that component there.' };
    // `component` came from this exact array, so this splice cannot target a
    // different record. Keep the state commit independent of view helpers.
    pl.inv.splice(pl.inv.indexOf(component), 1);
    Ent.refreshDerived(pl);
    Save.saveChar(pl);
    UI.announce(`${component.name} socketed into ${target.name || target.baseName || 'item'}.`, component.kind === 'rune' ? '#ffff77' : '#8fc8ff', 2200);
    sfx('equip');
    return { ok: true, target, component };
  },

  identificationFailure(reason) {
    const messages = {
      'missing-scroll': 'That Scroll of Identification is no longer in your inventory.',
      'wrong-utility': 'Select a valid Scroll of Identification.',
      'missing-target': 'That item is no longer in your inventory.',
      'ineligible-target': 'That item does not need identification.',
      'already-identified': 'That item is already identified.',
      'duplicate-item-id': 'Identification stopped because the inventory contains conflicting item records.',
      'stale-scroll': 'The selected scroll changed. Nothing was consumed.',
      'stale-target': 'The selected item changed. Nothing was consumed.',
      'stale-membership': 'Your inventory changed. No items were identified.',
      'stale-replacement': 'An inventory item changed. No items were identified.',
      'stale-state': 'The identification state changed. Nothing was consumed.',
      'town-only': 'Old Maras can identify carried items only while you are in town.',
    };
    return messages[reason] || 'Identification could not be completed. Nothing was consumed.';
  },

  identifyItem(scrollId, targetId) {
    const pl = G.player;
    if (!pl || typeof ItemIdentification === 'undefined') return { ok: false, reason: 'unavailable' };
    const plan = ItemIdentification.quote(pl, scrollId, targetId);
    const result = ItemIdentification.commit(pl, plan);
    if (!result.ok) {
      UI.announce(this.identificationFailure(result.reason), '#ff6a5a', 3200);
      return result;
    }
    const target = pl.inv.find(item => item && item.id === targetId);
    Ent.refreshDerived(pl);
    Save.saveChar(pl);
    sfx('unique');
    UI.announce(`Identified: ${Items.displayName(target)}`, Items.rarityColor(target && target.rarity), 3000);
    return Object.assign({}, result, { target });
  },

  identifyAllCarried() {
    const pl = G.player;
    if (!pl || typeof ItemIdentification === 'undefined') return { ok: false, reason: 'unavailable' };
    if (!G.map || !G.map.town) {
      const result = { ok: false, reason: 'town-only', count: 0, identified: [] };
      UI.announce(this.identificationFailure(result.reason), '#ff6a5a', 3200);
      return result;
    }
    const plan = ItemIdentification.quoteAll(pl);
    const result = ItemIdentification.commitAll(pl, plan);
    if (!result.ok) {
      UI.announce(this.identificationFailure(result.reason), '#ff6a5a', 3200);
      return result;
    }
    Ent.refreshDerived(pl);
    Save.saveChar(pl);
    if (result.count) {
      sfx('unique');
      UI.announce(`Old Maras identified ${result.count} carried item${result.count === 1 ? '' : 's'}.`, '#d8b9ff', 3400);
    } else UI.announce('You carry nothing veiled.', '#8a7444', 2200);
    return result;
  },

  slotFor(item) {
    if (item.slot === 'ring') {
      if (!G.player.equip.ring1) return 'ring1';
      if (!G.player.equip.ring2) return 'ring2';
      return 'ring1';
    }
    return item.slot;
  },

  // Accept either a numeric index (legacy) or an item id string (grid).
  equipFromInv(idOrIndex) {
    const pl = G.player;
    const controller = UI.inventoryGrid;
    controller.ensureGrid(pl);
    let it;
    if (typeof idOrIndex === 'string') {
      it = pl.inv.find(x => x && x.id === idOrIndex);
    } else {
      it = pl.inv[idOrIndex];
    }
    if (!it) return;
    if (UI.openPanel === 'vendor') return;
    if (Items.isIdentifyScroll(it)) { UI.announce('Select the scroll in your inventory, then choose an unidentified item.', '#d8b9ff'); return; }
    if (Items.isCharmRecord(it)) {
      UI.announce(Items.needsIdentification(it) ? 'Identify this charm before its magic can awaken.' : 'Charms grant bonuses while legally placed in your carried inventory.', Items.needsIdentification(it) ? '#d8b9ff' : '#8fc8ff');
      return;
    }
    if (it.potion) {
      pl.potions[it.potion] = Math.min(20, pl.potions[it.potion] + 1);
      controller.removeItem(it, pl.inv);
      return;
    }
    if (Items.needsIdentification(it)) { UI.announce('Identify this item before equipping it.', '#d8b9ff'); sfx('nope'); return; }
    if ((it.reqLvl || 1) > pl.lvl) { UI.announce(`Requires level ${it.reqLvl}`, '#ff6a5a'); sfx('nope'); return; }
    const slot = this.slotFor(it);
    if (!(slot in pl.equip)) return;
    const old = pl.equip[slot];
    let oldPlace = null;
    if (old) {
      const remaining = pl.inv.slice();
      const sourceIndex = remaining.indexOf(it);
      if (sourceIndex >= 0) remaining.splice(sourceIndex, 1);
      if (controller.canPlace(old, it._gx, it._gy, remaining)) oldPlace = { col: it._gx, row: it._gy };
      else oldPlace = controller.findSpace(old, remaining);
      if (!oldPlace) {
        UI.announce('Make room for the displaced equipment first.', '#ff6a5a');
        sfx('nope'); return;
      }
    }
    // Remove item from inventory
    controller.removeItem(it, pl.inv);
    pl.equip[slot] = it;
    if (old) {
      old._gx = oldPlace.col; old._gy = oldPlace.row; pl.inv.push(old);
    }
    sfx('equip');
    Ent.refreshDerived(pl);
    Save.saveChar(pl);
  },

  unequip(slot) {
    const pl = G.player;
    const it = pl.equip[slot];
    if (!it) return;
    const controller = UI.inventoryGrid;
    controller.ensureGrid(pl);
    const pos = controller.findSpace(it, pl.inv);
    if (pos) {
      it._gx = pos.col; it._gy = pos.row;
      pl.inv.push(it);
      pl.equip[slot] = null;
      sfx('equip');
      Ent.refreshDerived(pl);
      Save.saveChar(pl);
      return;
    }
    UI.announce('Inventory full!', '#ff6a5a');
  },

  drinkPotion(kind) {
    const pl = G.player;
    if (this.potCd > 0 || pl.dead) return;
    if (pl.potions[kind] <= 0) { sfx('nope'); return; }
    pl.potions[kind]--;
    this.potCd = 0.6;
    sfx('potion');
    if (kind === 'hp') { pl.hp = Math.min(pl.derived.maxHp, pl.hp + pl.derived.maxHp * 0.38 + 20); FX.ring(pl.x, pl.y, 1, '#ff6b5e'); }
    else { pl.mp = Math.min(pl.derived.maxMp, pl.mp + pl.derived.maxMp * 0.45 + 15); FX.ring(pl.x, pl.y, 1, '#6fa8ff'); }
  },

  restock() {
    const pl = G.player;
    G.shopStock = [];
    for (let i = 0; i < 8; i++) {
      const rarity = U.weighted(U.rand, [['rare', 12], ['magic', 55], ['common', 33]]);
      G.shopStock.push(Items.generate(Math.max(1, pl.lvl + U.ri(U.rand, -2, 3)), { forceRarity: rarity, classId: pl.cls }));
    }
  },

  // ---------------- interaction ----------------
  interactables() {
    const list = [];
    for (const site of [...(G.map.clues || []), ...(G.map.encounters || [])])
      list.push({ kind: 'narrative', x: site.x, y: site.y, site,
        label: site.changed ? (Narrative.byId[site.definitionId].changedTitle || 'Inspect again') : site.prompt });
    for (const th of G.map.things) {
      if (th.kind === 'barrel' && th.hp <= 0) continue;
      if (th.kind === 'chest' && th.opened) continue;
      if (th.kind === 'shrine' && th.used) continue;
      if (th.kind === 'goldpile' && th.taken) continue;
      list.push({ kind: 'thing', x: th.x, y: th.y, th, label: th.kind === 'shrine' ? th.shrine.name : th.kind });
    }
    for (const pr of G.map.props) {
      if (pr.fixture) {
        if (pr.kind === 'bookshelf' && pr.searched) continue;
        if (pr.kind === 'orevein' && pr.ore <= 0) continue;
        if (pr.kind === 'fountain' && pr.charges <= 0) continue;
        if (pr.kind === 'brazier_unlit' && pr.lit) continue;
        list.push({ kind: 'prop', x: pr.x, y: pr.y, pr, label: this.propLabel(pr) });
      } else if (pr.smashable && pr.hp > 0) {
        list.push({ kind: 'prop', x: pr.x, y: pr.y, pr, label: 'Smash ' + pr.kind });
      }
    }
    for (const gi of G.groundItems) if (!gi.gold) list.push({ kind: 'gitem', x: gi.x, y: gi.y, gi, label: Items.displayName(gi.item) });
    for (const n of G.npcs) list.push({ kind: 'npc', x: n.x, y: n.y, npc: n, label: n.def.name });
    if (G.map.waypoint) list.push({ kind: 'waypoint', x: G.map.waypoint.x, y: G.map.waypoint.y, label: 'Waypoint' });
    const pp = G.portalOnMap(G.map);
    if (pp) list.push({ kind: 'portal', x: pp.x, y: pp.y, label: G.portal && G.portal.deathReturn ? 'Return to your corpse' : 'Town Portal' });
    for (const corpse of this.corpsesOnMap()) list.push({ kind: 'corpse', x: corpse.location.x, y: corpse.location.y,
      corpse, label: `Recover corpse (${corpse.gear.length} item${corpse.gear.length === 1 ? '' : 's'})` });
    return list;
  },

  hoverInteractable() {
    const [wx, wy] = G.mouseWorld;
    let best = null, bd = 1.1 * 1.1;
    for (const it of this.interactables()) {
      const d2 = U.dist2(wx, wy, it.x, it.y);
      if (d2 < bd) { bd = d2; best = it; }
    }
    return best;
  },

  // Lighting a sconce is a decision, not something that happens to you: the
  // player walks up and chooses to trade their position away for a landmark —
  // and can take that trade back, because the same key puts it out again.
  toggleLight() {
    const l = G.nearLight;
    const lit = Dungeon.toggleLight(l);
    if (lit === null) return false;
    if (l.prop && typeof Props3 !== 'undefined') Props3.refresh(l.prop);
    if (lit) {
      FX.ring(l.x, l.y, 1.6, l.color, 0.75);
      FX.spark(l.x, l.y, l.color, 9);
      sfx('torchup');
    } else {
      // the flame collapsing: a small dark puff instead of a bloom
      FX.ring(l.x, l.y, 0.9, l.color, 0.3);
      for (let i = 0; i < 5; i++) {
        FX.push({ x: l.x, y: l.y, z: U.rf(U.rand, 30, 44),
          vx: U.rf(U.rand, -0.4, 0.4), vy: U.rf(U.rand, -0.4, 0.4), vz: U.rf(U.rand, 4, 10),
          life: 0.9, maxLife: 0.9, color: '#6a5f52', size: U.rf(U.rand, 2, 4),
          add: false, grav: -3, shape: 'smoke' });
      }
      sfx('torchdn');
    }
    return true;
  },

  interact(it) {
    const pl = G.player;
    if (U.dist(pl.x, pl.y, it.x, it.y) > 2.6) { UI.announce('Too far away', '#8a7444', 900); return; }
    switch (it.kind) {
      case 'npc': UI.npcDialog(it.npc); break;
      case 'waypoint': UI.open('waypoint'); break;
      case 'portal': this.usePortal(); break;
      case 'corpse': this.recoverCorpse(it.corpse.id); break;
      case 'gitem': {
        const gi = it.gi;
        if (gi.item.potion) {
          pl.potions[gi.item.potion] = Math.min(20, pl.potions[gi.item.potion] + 1);
          sfx('potion');
        } else if (!this.giveItem(gi.item)) return;
        else sfx('drop');
        G.groundItems.splice(G.groundItems.indexOf(gi), 1);
        Ent.refreshDerived(pl);
        Save.saveChar(pl);
        break;
      }
      case 'thing': this.useThing(it.th); break;
      case 'prop': this.useProp(it.pr); break;
      case 'narrative': this.useNarrative(it.site); break;
    }
  },

  useNarrative(site) {
    const pl = G.player, def = Narrative.byId[site.definitionId]; if (!def) return;
    if (site.changed) { UI.announce(`${def.changedTitle || def.title}: nothing more remains to be done.`, '#8a7444', 2200); return; }
    const first = Narrative.record(pl.narrative, site, true);
    UI.announce(def.discovered, def.kind === 'clue' ? '#d8c18a' : '#8fc8ff', 4200);
    if (first) {
      if (def.lore) for (const entry of Lore.discover(pl.lore, def.lore, { location: G.map.name, site: site.id }))
        UI.announce(`Codex updated: ${entry.title}`, '#c8a8ff', 2400);
      QuestState.bump(pl, 'narrative', G.map.actIdx, 1);
      if (def.faction) Factions.change(pl.reputation, def.faction, def.reputation || 0, { rivals: false });
      if (def.dialogue) pl.dialogue.consequences[`narrative:${def.dialogue}`] = true;
      Save.saveChar(pl);
    }
  },

  propLabel(pr) {
    return {
      lever: pr.on ? 'Pull lever (reset)' : 'Pull the lever',
      brazier_unlit: 'Light the brazier',
      orevein: 'Mine the vein',
      bookshelf: 'Search the shelves',
      fountain: 'Drink from the fountain',
    }[pr.kind] || pr.kind;
  },

  // ---------------- interactive fixtures & smashable props ----------------
  useProp(pr) {
    const pl = G.player, map = G.map;
    if (pr.smashable && pr.hp > 0 && !pr.fixture) {
      pr.hp = 0;
      sfx('hit');
      Physics.burst(pr.x, pr.y, pr.mat || 'wood', 10, { speed: 3.4, size: 3.2, z: 8 });
      Physics.impulse(pr.x, pr.y, 1.6, 1.4);
      if (U.chance(U.rand, 0.30)) G.groundItems.push({ x: pr.x, y: pr.y, gold: Math.ceil((3 + map.mlvl * 1.8) * U.rf(U.rand, 0.5, 1.5)) });
      else if (U.chance(U.rand, 0.10)) this.dropComponent(pr.x, pr.y, map.mlvl);
      else if (U.chance(U.rand, 0.12)) G.groundItems.push({ x: pr.x, y: pr.y, item: Items.generate(map.mlvl, { classId: pl.cls, mf: pl.derived.mf, unidentified: true }) });
      return;
    }
    switch (pr.kind) {
      case 'lever': {
        pr.on = !pr.on;
        sfx('equip');
        G.shake += 3;
        if (pr.on && !pr.spent) {
          pr.spent = true;
          UI.announce('Something grinds open nearby...', '#8fc8ff', 2200);
          const c = pr.cache;
          for (let i = 0; i < U.ri(U.rand, 2, 4); i++) {
            const sx = c.x + U.rf(U.rand, -0.7, 0.7), sy = c.y + U.rf(U.rand, -0.7, 0.7);
            if (U.chance(U.rand, 0.45)) G.groundItems.push({ x: sx, y: sy, gold: Math.ceil((8 + map.mlvl * 3.4) * U.rf(U.rand, 0.7, 1.6)) });
            else G.groundItems.push({ x: sx, y: sy, item: Items.generate(map.mlvl + 2, { classId: pl.cls, mf: pl.derived.mf + 15, unidentified: true }) });
          }
          FX.ring(c.x, c.y, 1.8, '#ffd94f');
          Physics.burst(c.x, c.y, 'stone', 8, { speed: 2.4 });
        } else UI.announce('The mechanism resets.', '#8a7444', 1400);
        break;
      }
      case 'brazier_unlit': {
        pr.lit = true;
        sfx('fire');
        map.lights.push({ x: pr.x, y: pr.y, r: 5, color: '#ffb04f', flick: true });
        UI.announce('The brazier roars to life.', '#ff9a3f', 1800);
        FX.ring(pr.x, pr.y, 1.4, '#ffb04f');
        break;
      }
      case 'orevein': {
        pr.ore--;
        sfx('hit');
        Physics.burst(pr.x, pr.y, 'stone', 7, { speed: 2.8, size: 2.6 });
        const amt = Math.ceil((14 + map.mlvl * 5) * U.rf(U.rand, 0.8, 1.5) * (1 + pl.derived.goldFind / 100));
        pl.gold += amt;
        UI.dmgNum(pr.x, pr.y, '+' + amt + 'g', '#ffd94f');
        if (pr.ore <= 0) UI.announce('The vein is worked out.', '#8a7444', 1400);
        break;
      }
      case 'bookshelf': {
        pr.searched = true;
        sfx('ui');
        if (U.chance(U.rand, 0.55)) {
          if (U.chance(U.rand, 0.22)) this.dropComponent(pr.x, pr.y + 0.6, map.mlvl + 1);
          else {
            const it = Items.generate(map.mlvl + 1, { classId: pl.cls, mf: pl.derived.mf + 10, unidentified: true });
            G.groundItems.push({ x: pr.x, y: pr.y + 0.6, item: it });
          }
          UI.announce('Something was hidden among the pages.', '#8fc8ff', 2000);
        } else {
          const amt = Math.ceil((6 + map.mlvl * 2.2) * U.rf(U.rand, 0.6, 1.4));
          pl.gold += amt;
          UI.dmgNum(pr.x, pr.y, '+' + amt + 'g', '#ffd94f');
        }
        Physics.burst(pr.x, pr.y, 'cloth', 4, { speed: 1.4, size: 2 });
        if (typeof WUI !== 'undefined') WUI.discoverLoreSource('prop', 'bookshelf', { location: map.name });
        break;
      }
      case 'fountain': {
        if (pr.charges <= 0) return;
        pr.charges--;
        sfx('shrine');
        pl.hp = Math.min(pl.derived.maxHp, pl.hp + pl.derived.maxHp * 0.5);
        pl.mp = Math.min(pl.derived.maxMp, pl.mp + pl.derived.maxMp * 0.5);
        pl.buffs = pl.buffs.filter(b => b.name !== 'Fountain\'s Vigor');
        pl.buffs.push({ name: 'Fountain\'s Vigor', stats: { regenHp: 4, allRes: 10 }, t: 90, maxT: 90, color: '#8fd8ff' });
        Ent.computeDerived(pl);
        UI.announce('The waters restore you.', '#8fd8ff', 2000);
        FX.ring(pr.x, pr.y, 1.6, '#8fd8ff');
        break;
      }
    }
  },

  useThing(th) {
    const pl = G.player, map = G.map;
    switch (th.kind) {
      case 'barrel': {
        th.hp = 0;
        sfx('hit');
        FX.deathBurst(th.x, th.y, '#7a5a38', 0.8);
        Physics.burst(th.x, th.y, 'wood', 12, { speed: 3.8, size: 3.4, z: 10 });
        Physics.impulse(th.x, th.y, 1.8, 1.6);
        if (th.explosive) Ent.explode(th.x, th.y, 2.2, [map.mlvl * 3 + 8, map.mlvl * 5 + 14], 'fire', { both: true });
        if (U.chance(U.rand, 0.35)) G.groundItems.push({ x: th.x, y: th.y, gold: Math.ceil((3 + map.mlvl * 2) * U.rf(U.rand, 0.5, 1.5)) });
        else if (U.chance(U.rand, 0.12)) this.dropComponent(th.x, th.y, map.mlvl);
        else if (U.chance(U.rand, 0.15)) G.groundItems.push({ x: th.x, y: th.y, item: Items.generate(map.mlvl, { classId: pl.cls, mf: pl.derived.mf, unidentified: true }) });
        break;
      }
      case 'chest': {
        th.opened = true;
        sfx('gold');
        Physics.burst(th.x, th.y, 'metal', 5, { speed: 1.8, size: 2.2, z: 14 });
        const n = U.ri(U.rand, 2, 3);
        for (let i = 0; i < n; i++) {
          if (U.chance(U.rand, 0.35)) G.groundItems.push({ x: th.x + U.rf(U.rand, -0.8, 0.8), y: th.y + U.rf(U.rand, -0.8, 0.8), gold: Math.ceil((6 + map.mlvl * 3) * U.rf(U.rand, 0.7, 1.6)) });
          else if (i === 0 || U.chance(U.rand, 0.24)) this.dropComponent(th.x + U.rf(U.rand, -0.8, 0.8), th.y + U.rf(U.rand, -0.8, 0.8), map.mlvl + 1);
          else G.groundItems.push({ x: th.x + U.rf(U.rand, -0.8, 0.8), y: th.y + U.rf(U.rand, -0.8, 0.8), item: Items.generate(map.mlvl + 1, { classId: pl.cls, mf: pl.derived.mf + 20, unidentified: true }) });
        }
        FX.ring(th.x, th.y, 1.4, '#ffd94f');
        break;
      }
      case 'shrine': {
        th.used = true;
        sfx('shrine');
        const sh = th.shrine;
        pl.buffs = pl.buffs.filter(b => b.name !== sh.name);
        pl.buffs.push({ name: sh.name, stats: sh.buff, t: sh.dur, maxT: sh.dur, color: '#8fc8ff' });
        Ent.computeDerived(pl);
        UI.announce(sh.msg, '#8fc8ff');
        FX.ring(th.x, th.y, 2, '#8fc8ff');
        break;
      }
      case 'goldpile': {
        th.taken = true;
        const amt = Math.ceil((5 + map.mlvl * 2.5) * U.rf(U.rand, 0.7, 1.6) * (1 + pl.derived.goldFind / 100));
        pl.gold += amt;
        sfx('gold');
        UI.dmgNum(th.x, th.y, '+' + amt + 'g', '#ffd94f');
        break;
      }
    }
  },

  // ---------------- per-frame update ----------------
  update(dt) {
    const pl = G.player;
    if (!pl || G.state !== 'game') return;
    const paused = UI.openPanel === 'menu' || UI.openPanel === 'death';
    if (paused) return;

    G.time += dt;
    this.potCd = Math.max(0, this.potCd - dt);
    G.stairsCd = Math.max(0, G.stairsCd - dt);
    pl.gcd = Math.max(0, pl.gcd - dt);
    if (pl.attackT > 0) pl.attackT -= dt;
    for (const k in pl.cds) if (pl.cds[k] > 0) pl.cds[k] -= dt;

    // buffs tick
    let buffsChanged = false;
    for (let i = pl.buffs.length - 1; i >= 0; i--) {
      pl.buffs[i].t -= dt;
      if (pl.buffs[i].t <= 0) { pl.buffs.splice(i, 1); buffsChanged = true; }
    }
    Ent.computeDerived(pl);
    const d = pl.derived;

    // regen
    if (!pl.dead) {
      pl.hp = Math.min(d.maxHp, pl.hp + d.regenHp * dt);
      pl.mp = Math.min(d.maxMp, pl.mp + d.regenMp * dt);
    }
    // block cooldown
    if (pl.blockCd > 0) pl.blockCd -= dt;

    // camera orbit on held rotate keys — the camera moves, the world doesn't
    const km = WUI.keymap;
    if (Cam.mode === 'third') {
      const rot = (this.keys[km.camRotR] ? 1 : 0) - (this.keys[km.camRotL] ? 1 : 0);
      if (rot) Cam.orbit(rot * Cam.orbitSpeed * dt, 0);
    }

    // movement is camera-relative: "up the screen" is always away from the
    // viewer, so the controls stay correct at any orbit angle
    let mx = (this.keys[km.moveR] || this.keys['arrowright'] ? 1 : 0) - (this.keys[km.moveL] || this.keys['arrowleft'] ? 1 : 0);
    let my = (this.keys[km.moveD] || this.keys['arrowdown'] ? 1 : 0) - (this.keys[km.moveU] || this.keys['arrowup'] ? 1 : 0);
    pl.moving = false;
    if (!pl.dead && (mx || my)) {
      const basis = R3.screenBasis();
      let wx = mx * basis.rx - my * basis.fx;
      let wy = mx * basis.rz - my * basis.fz;
      const len = Math.hypot(wx, wy);
      wx /= len; wy /= len;
      const spd = d.moveSpd * (G.map.town ? 1.15 : 1);
      const oldX = pl.x, oldY = pl.y;
      Ent.tryMove(pl, wx * spd * dt, wy * spd * dt);
      pl.moving = true;
      const actualDx = pl.x - oldX, actualDy = pl.y - oldY;
      // Casting deliberately faces the target (see Ent.castSkill/basicAttack),
      // but any movement that succeeds after the cast owns the newer heading.
      // Use the resolved displacement so wall sliding faces along the open axis;
      // a fully blocked move leaves the existing attack/movement facing intact.
      if (actualDx !== 0 || actualDy !== 0) pl.dir = Math.atan2(actualDy, actualDx);
    }

    // The sconce within reach, lit or not. Recomputed each frame and parked on
    // G so the overlay can prompt for exactly the one the key will act on.
    G.nearLight = pl.dead ? null : Dungeon.nearestSconce(G.map, pl.x, pl.y);
    // mouse world position
    G.mouseWorld = Render.screenToWorld(this.mouse.x, this.mouse.y);

    // held mouse buttons cast — at the focused unit if there is one
    if (!pl.dead && UI.openPanel === null) {
      if (this.mouse.lmb && this.lmbCasting) Target.tryCast(pl.hotbar.lmb || 'atk');
      if (this.mouse.rmb && pl.hotbar.rmb) Target.tryCast(pl.hotbar.rmb);
    }

    // gait phase drives the walk/run cycle
    pl.gait = (pl.gait || 0) + dt * (pl.moving ? d.moveSpd * 0.30 : 0);

    // world simulation
    if (!pl.dead) Ent.updateWorld(dt);
    Physics.step(dt);

    // auto-pickup gold
    for (let i = WUI.set.autoGold === false ? -1 : G.groundItems.length - 1; i >= 0; i--) {
      const gi = G.groundItems[i];
      if (gi.gold && U.dist2(pl.x, pl.y, gi.x, gi.y) < 1.4) {
        pl.gold += Math.ceil(gi.gold * (1 + d.goldFind / 100));
        UI.dmgNum(gi.x, gi.y, '+' + gi.gold + 'g', '#ffd94f');
        sfx('gold');
        G.groundItems.splice(i, 1);
      }
    }

    // stairs
    const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
    if (G.stairsCd <= 0 && tx >= 0 && ty >= 0 && tx < G.map.w && ty < G.map.h) {
      if (G.map.t[ty * G.map.w + tx] === TILE.EXIT) this.descend();
    }

    // boss taunt
    const boss = G.monsters.find(m => m.boss && !m.dead);
    if (boss && boss.aggro && !boss.taunted) {
      boss.taunted = true;
      UI.announce('“' + boss.def.taunt + '”', '#ff9a7a', 4500);
    }

    // autosave
    G.autosaveT -= dt;
    if (G.autosaveT <= 0) { G.autosaveT = 25; Save.saveChar(pl); }

    Target.update(dt);
    UI.updateHUD();
    WUI.update(dt);
    Social.update(dt);

    // interactable hover tooltip + cursor
    if (UI.openPanel === null) {
      const hov = this.hoverInteractable();
      if (hov && hov.kind === 'gitem') UI.tip(Items.tooltip(hov.gi.item, pl));
      else if (hov && hov.kind === 'thing' && hov.th.kind === 'shrine') UI.tip(`<div class="tt-name" style="color:#8fc8ff">${hov.label}</div><div class="tt-type">Click to receive its blessing</div>`);
      else if (!hov) UI.hideTip();
      Render.cv.style.cursor = hov ? 'pointer' : 'crosshair';
    }
  },

  // ---------------- input ----------------
  bindInput() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (G.state !== 'game') return;
      // all game actions run through the rebindable keymap layer
      if (WUI.handleKey(k, e)) { if (k !== 'escape') e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    const cv = document.getElementById('game');
    cv.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    cv.addEventListener('mousedown', e => {
      AUDIO.ensure();
      if (G.state !== 'game') return;
      if (e.button === 0) {
        this.mouse.lmb = true;
        this.lmbCasting = false;
        if (G.player.dead) return;
        // 1) a unit under the cursor: focus it, or act on it if already focused
        const unit = Target.pick(e.clientX, e.clientY);
        if (unit) {
          if (Target.current !== unit) { Target.set(unit); return; }
          if (Target.kindOf(unit) === 'npc') { this.interact({ kind: 'npc', x: unit.x, y: unit.y, npc: unit }); return; }
          this.lmbCasting = true;                 // second click on a focused unit casts
          Target.tryCast(G.player.hotbar.lmb || 'atk');
          return;
        }
        // 2) otherwise the usual world interaction, then free-aim casting
        const hov = this.hoverInteractable();
        if (hov) { this.interact(hov); return; }
        Target.clear();
        this.lmbCasting = true;
      } else if (e.button === 2) this.mouse.rmb = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.lmb = false; this.lmbCasting = false; }
      if (e.button === 2) this.mouse.rmb = false;
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      if (e.button !== 1) return;               // middle button orbits
      e.preventDefault();
      let lx = e.clientX, ly = e.clientY;
      const move = ev => {
        Cam.orbit((ev.clientX - lx) * 0.008, -(ev.clientY - ly) * 0.0016);
        lx = ev.clientX; ly = ev.clientY;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    cv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    cv.addEventListener('wheel', e => {
      if (G.state !== 'game') return;
      e.preventDefault();
      Cam.adjustZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.lmb = this.mouse.rmb = false; });
  },

  // ---------------- main loop ----------------
  _last: 0,
  loop(ts) {
    requestAnimationFrame(t => this.loop(t));
    const cap = WUI.set && Number(WUI.set.fpsLimit) || 0;
    const interval = cap > 0 ? 1000 / cap : 0;
    if (!this._last) this._last = ts - (interval || 16);

    const elapsed = ts - this._last;
    if (interval && elapsed < interval) return;

    // Keep the fractional interval instead of resetting to `ts`; otherwise
    // small requestAnimationFrame timing errors accumulate and lower the cap.
    const acceptedAt = interval ? ts - (elapsed % interval) : ts;
    const dt = Math.min(0.05, (acceptedAt - this._last) / 1000);
    this._last = acceptedAt;
    if (G.state === 'game') {
      const updateStart = performance.now();
      this.update(dt);
      Render.cpuUpdateMs = performance.now() - updateStart;
      Render.frame(dt, G.time);
    }
  },
};

// ---------------- boot ----------------
function showRendererRecovery() {
  const diagnostic = R3.initializationStatus || {};
  const message = document.createElement('div');
  message.id = 'renderer-init-error';
  message.setAttribute('role', 'alert');
  message.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-content:center;text-align:center;padding:32px;background:#100b09;color:#ead9bf;font:18px/1.5 serif';
  message.innerHTML = `<div style="max-width:680px"><h1 style="color:#d88b55">Graphics could not start</h1>
    <p>Reload the page or close other GPU-heavy tabs. If this continues, update your graphics driver, try disabling hardware acceleration, or select Safe graphics mode.</p>
    <div aria-label="Startup graphics options" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:18px 0">
      <button id="renderer-reset-graphics" class="big-btn dark">RESET GRAPHICS CONFIGURATION</button>
      <button id="renderer-safe-mode" class="big-btn dark">SAFE MODE</button>
      <button id="renderer-compatibility" class="big-btn dark">WEBGL 1 / COMPATIBILITY MODE</button>
      <button id="renderer-copy-diagnostic" class="big-btn dark">COPY DIAGNOSTICS</button>
    </div>
    <pre id="renderer-init-diagnostic" style="max-width:680px;max-height:240px;overflow:auto;text-align:left;white-space:pre-wrap;font:12px/1.4 monospace;color:#bdab97"></pre>
    <label style="display:block;margin:16px"><input id="renderer-fallback-models" type="checkbox"> Force fallback models</label>
    <label style="display:block;margin:16px"><input id="renderer-advanced-effects" type="checkbox"> Advanced GPU effects</label>
    <button id="renderer-reload" class="big-btn">RELOAD</button>
    </div>`;
  document.body.appendChild(message);
  const report = JSON.stringify({ renderer: diagnostic,
    graphics: typeof GraphicsConfig !== 'undefined' ? GraphicsConfig.diagnostics() : null,
    userAgent: navigator.userAgent }, null, 2);
  document.getElementById('renderer-init-diagnostic').textContent = report;
  const fallbackModels = document.getElementById('renderer-fallback-models');
  fallbackModels.checked = !R3.authoredModels;
  fallbackModels.addEventListener('change', () => R3.setAuthoredModels(!fallbackModels.checked));
  const advancedEffects = document.getElementById('renderer-advanced-effects');
  advancedEffects.checked = GraphicsConfig.current.advancedEffects !== false;
  advancedEffects.addEventListener('change', () => GraphicsConfig.save(Object.assign({},
    GraphicsConfig.current, { advancedEffects: advancedEffects.checked })));
  document.getElementById('renderer-reload').addEventListener('click', () => location.reload());
  document.getElementById('renderer-reset-graphics').addEventListener('click', () => {
    GraphicsConfig.reset();
    try { sessionStorage.removeItem(R3.PROFILE_SESSION_KEY); } catch (_) {}
    location.reload();
  });
  document.getElementById('renderer-safe-mode').addEventListener('click', () => {
    GraphicsConfig.safeMode();
    location.reload();
  });
  document.getElementById('renderer-compatibility').addEventListener('click', () => {
    GraphicsConfig.compatibilityMode();
    location.reload();
  });
  document.getElementById('renderer-copy-diagnostic').addEventListener('click', async event => {
    try { await navigator.clipboard.writeText(report); event.currentTarget.textContent = 'COPIED'; }
    catch (_) { event.currentTarget.textContent = 'COPY FAILED — SELECT TEXT BELOW'; }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  Assets.absorbPacks();   // curated per-act slugs win over generic name matches
  // Baked effect sheets load in the background. Nothing waits on them: until
  // they arrive (or if they never do) every effect keeps drawing procedurally.
  if (typeof GraphicsConfig === 'undefined' || GraphicsConfig.current.advancedEffects !== false)
    Assets.loadSheets();
  if (!Render.init()) {
    showRendererRecovery();
    return;
  }
  Cam.init();
  UI.init();
  WUI.init();
  Social.init();
  Party.init();
  UI.initMenu();
  Game.bindInput();
  requestAnimationFrame(t => Game.loop(t));
});
