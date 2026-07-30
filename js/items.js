// ============ DIABLOID: items.js — dynamic loot generation ============
'use strict';

const Items = {
  _seq: 1,

  canonicalizeCondition(item) {
    if (typeof ItemCondition !== 'undefined' && ItemCondition && typeof ItemCondition.normalize === 'function')
      ItemCondition.normalize(item);
    return item;
  },

  canonicalizeIdentification(item) {
    if (typeof ItemIdentification !== 'undefined' && ItemIdentification && typeof ItemIdentification.normalize === 'function')
      ItemIdentification.normalize(item);
    return item;
  },

  finalize(item, opts = {}) {
    this.canonicalizeCondition(item);
    this.canonicalizeIdentification(item);
    if (opts.unidentified && typeof ItemIdentification !== 'undefined' &&
        ItemIdentification && typeof ItemIdentification.prepareDrop === 'function')
      ItemIdentification.prepareDrop(item);
    return item;
  },

  needsIdentification(item) {
    return !!(item && typeof ItemIdentification !== 'undefined' && ItemIdentification &&
      typeof ItemIdentification.needsIdentification === 'function' && ItemIdentification.needsIdentification(item));
  },

  isIdentifyScroll(item) {
    return !!(item && typeof ItemIdentification !== 'undefined' && ItemIdentification &&
      typeof ItemIdentification.isScroll === 'function' && ItemIdentification.isScroll(item));
  },

  isCharmRecord(item) {
    return !!(item && typeof InventoryCharms !== 'undefined' && InventoryCharms &&
      typeof InventoryCharms.isCharmRecord === 'function' && InventoryCharms.isCharmRecord(item));
  },

  isCharm(item) {
    return !!(item && typeof InventoryCharms !== 'undefined' && InventoryCharms &&
      typeof InventoryCharms.isCharm === 'function' && InventoryCharms.isCharm(item));
  },

  displayName(item) {
    if (!item) return '';
    return typeof ItemIdentification !== 'undefined' && ItemIdentification &&
      typeof ItemIdentification.displayName === 'function'
      ? ItemIdentification.displayName(item)
      : String(item.name || item.baseName || item.type || 'Item');
  },

  makeIdentifyScroll() {
    if (typeof ItemIdentification === 'undefined' || !ItemIdentification) return null;
    const make = ItemIdentification.makeScroll || ItemIdentification.createScroll;
    return typeof make === 'function' ? make(`identify-scroll-${Date.now().toString(36)}-${this._seq++}`) : null;
  },

  makeCharm(ilvl, opts = {}) {
    if (typeof InventoryCharms === 'undefined' || !InventoryCharms || typeof InventoryCharms.generate !== 'function') return null;
    const id = opts.id || `charm-${Date.now().toString(36)}-${this._seq++}`;
    return InventoryCharms.generate({ id, ilvl: Math.max(1, Math.min(99, Math.round(Number(ilvl) || 1))), form: opts.form }, opts.rng || U.rand);
  },

  rarityColor(r) {
    return { common: '#d8d8d8', magic: '#7b7bff', rare: '#ffff77', set: '#2bd45e', unique: '#c7924b' }[r] || '#d8d8d8';
  },

  STAT_LABELS: {
    str: '+# Strength', dex: '+# Dexterity', vit: '+# Vitality', ene: '+# Energy',
    hp: '+# Life', mp: '+# Mana', regenHp: '+# Life per second', regenMp: '+# Mana per second',
    dmgPct: '+#% Damage', dmgFlat: '+# Damage', spellPct: '+#% Spell Damage',
    atkSpd: '+#% Attack Speed', moveSpd: '+#% Move Speed',
    critCh: '+#% Critical Chance', critDmg: '+#% Critical Damage',
    armor: '+# Armor', armorPct: '+#% Armor',
    fireRes: '+#% Fire Resist', coldRes: '+#% Cold Resist', liteRes: '+#% Lightning Resist',
    poisRes: '+#% Poison Resist', arcRes: '+#% Arcane Resist', allRes: '+#% All Resistances',
    fireDmg: '+# Fire Damage', coldDmg: '+# Cold Damage', liteDmg: '+# Lightning Damage',
    poisDmg: '+# Poison Damage', arcDmg: '+# Arcane Damage', holyDmg: '+# Holy Damage',
    leechHp: '#% Life Leech', leechMp: '#% Mana Leech',
    mf: '+#% Magic Find', goldFind: '+#% Gold Find', lightRad: '+# Light Radius',
    allSkills: '+# to All Skills', thorns: 'Reflects # Damage', minionDmg: '+#% Minion Damage',
    minionHp: '+#% Minion Life', stunOnHit: '20% Chance to Stun for # Seconds',
    pierce: 'Weapon Projectiles Pierce # Additional Targets', xpGain: '+#% Experience',
    ar: '+# Attack Rating', crushBlow: '#% Chance of Crushing Blow', deadlyStrike: '#% Deadly Strike',
    openWounds: '#% Chance of Open Wounds', blockPct: '+#% Chance to Block',
  },
  statLine(k, v) {
    if (k === 'stunOnHit') return `20% Chance to Stun for ${Math.round(v * 10) / 10} ${v === 1 ? 'Second' : 'Seconds'}`;
    if (k === 'pierce') return `Weapon Projectiles Pierce ${Math.round(v)} Additional ${v === 1 ? 'Target' : 'Targets'}`;
    const t = this.STAT_LABELS[k] || ('+# ' + k);
    return t.replace('#', (Math.round(v * 10) / 10));
  },

  // Grid sizes [w, h] for D2-style variable-size inventory.
  // Weapon sizes: swords/axes 1x3, daggers 1x2, staves 1x4, bows 2x3
  // Armor sizes: chest/shields 2x3, helms 2x2, boots/gloves 2x2, belts 2x1
  // Jewelry: rings/amulets 1x1
  ITEM_SIZES: {
    sword: [1, 3], axe: [1, 3], mace: [1, 3], spear: [1, 3], claw: [1, 2],
    dagger: [1, 2], wand: [1, 2],
    staff: [1, 4], bow: [2, 3], crossbow: [2, 3],
    helm: [2, 2], chest: [2, 3], shield: [2, 3], orb: [1, 2],
    gloves: [2, 2], boots: [2, 2], belt: [2, 1],
    ring: [1, 1], amulet: [1, 1],
    charm_small: [1, 1], charm_large: [1, 2], charm_grand: [1, 3],
  },

  sizeOf(item) {
    if (!item) return [1, 1];
    return this.ITEM_SIZES[item.type] || [1, 1];
  },

  // Determine the equipment slot an item would fill.
  equipSlotFor(item) {
    if (!item) return null;
    if (item.slot === 'ring') return 'ring1'; // compare against first ring slot
    return item.slot;
  },

  // Build a stat comparison tooltip section: hovered item vs currently equipped.
  compareTooltip(item, player) {
    if (!item || !player || item.potion) return '';
    if (this.isCharmRecord(item)) return '';
    if (this.needsIdentification(item))
      return '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARISON LOCKED</div>' +
        '<div class="tt-unidentified-note">Identify this item to reveal and compare its properties.</div>';
    const slot = this.equipSlotFor(item);
    if (!slot) return '';

    const broken = value => !!(value && typeof ItemCondition !== 'undefined' && ItemCondition.isBroken(value));
    const equipped = player.equip[slot];
    if (this.needsIdentification(equipped))
      return '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARISON LOCKED</div>' +
        '<div class="tt-unidentified-note">The equipped item must be identified before comparison.</div>';
    if (!equipped) {
      return '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARED TO EQUIPPED</div>' +
        (broken(item)
          ? '<div class="stat-down">Broken — repair it before its bonuses apply</div>'
          : '<div style="color:#847252;font-size:11px">Empty slot — direct upgrade</div>');
    }

    let h = '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARED TO EQUIPPED</div>';
    let anyDiff = false;
    const itemActive = !broken(item), equippedActive = !broken(equipped);
    const itemStats = itemActive ? (item.stats || {}) : {};
    const equippedStats = equippedActive ? (equipped.stats || {}) : {};

    // Damage range comparison
    if (item.dmg || equipped.dmg) {
      const iLo = itemActive && item.dmg ? item.dmg[0] : 0, iHi = itemActive && item.dmg ? item.dmg[1] : 0;
      const eLo = equippedActive && equipped.dmg ? equipped.dmg[0] : 0, eHi = equippedActive && equipped.dmg ? equipped.dmg[1] : 0;
      const avgDiff = ((iLo + iHi) / 2) - ((eLo + eHi) / 2);
      if (Math.abs(avgDiff) >= 0.5) {
        const sign = avgDiff > 0 ? '+' : '';
        const cls = avgDiff > 0 ? 'stat-up' : 'stat-down';
        h += `<div class="${cls}">${sign}${Math.round(avgDiff * 10) / 10} avg damage</div>`;
        anyDiff = true;
      }
    }

    // Armor comparison
    if (item.armor != null || equipped.armor != null) {
      const diff = (itemActive ? item.armor || 0 : 0) - (equippedActive ? equipped.armor || 0 : 0);
      if (diff !== 0) {
        const sign = diff > 0 ? '+' : '';
        const cls = diff > 0 ? 'stat-up' : 'stat-down';
        h += `<div class="${cls}">${sign}${diff} Armor</div>`;
        anyDiff = true;
      }
    }

    // Gather all stat keys from both items
    const allKeys = new Set([...Object.keys(itemStats), ...Object.keys(equippedStats)]);
    for (const k of allKeys) {
      const iv = itemStats[k] || 0;
      const ev = equippedStats[k] || 0;
      const diff = Math.round((iv - ev) * 10) / 10;
      if (diff === 0) continue;
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'stat-up' : 'stat-down';
      const label = this.STAT_LABELS[k] ? this.STAT_LABELS[k].replace('+# ', '').replace('#% ', '').replace('# ', '').replace('+#', '').replace('#', '') : k;
      h += `<div class="${cls}">${sign}${diff} ${label}</div>`;
      anyDiff = true;
    }

    // Special stats: spellPct, critBonus
    const specials = ['spellPct', 'critBonus'];
    const specialLabels = { spellPct: '% Spell Damage', critBonus: '% Critical Chance' };
    for (const s of specials) {
      const diff = (itemActive ? item[s] || 0 : 0) - (equippedActive ? equipped[s] || 0 : 0);
      if (diff === 0) continue;
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'stat-up' : 'stat-down';
      h += `<div class="${cls}">${sign}${diff}${specialLabels[s]}</div>`;
      anyDiff = true;
    }

    if (!anyDiff) h += '<div style="color:#847252;font-size:11px">No stat difference</div>';
    return h;
  },

  allBases() { return WEAPON_TYPES.concat(ARMOR_TYPES, JEWELRY_TYPES); },
  baseById(id) { return this.allBases().find(b => b.id === id); },

  // pick base type + tier appropriate to ilvl
  pickBase(rng, ilvl, forceType) {
    let base;
    if (forceType) base = this.baseById(forceType);
    else {
      const roll = rng();
      const pool = roll < 0.34 ? WEAPON_TYPES : roll < 0.78 ? ARMOR_TYPES : JEWELRY_TYPES;
      base = U.pick(rng, pool);
    }
    let maxTier = 0;
    for (let t = 0; t < TIER_LVLS.length; t++) if (TIER_LVLS[t] <= ilvl) maxTier = t;
    let tier = maxTier;
    if (maxTier > 0 && U.chance(rng, 0.35)) tier = maxTier - 1;
    return { base, tier };
  },

  affixTierVal(rng, def, ilvl) {
    const [, , , , baseVal, perTier] = def;
    const t = U.clamp(Math.floor(ilvl / 9), 0, 7);
    return Math.max(1, Math.round((baseVal + perTier * t) * U.rf(rng, 0.75, 1.25) * 10) / 10);
  },

  slotClassOf(base) {
    if (base.slot === 'weapon') return 'w';
    if (base.slot === 'ring' || base.slot === 'amulet') return 'j';
    if (base.slot === 'offhand') return 's';
    return 'a';
  },

  // Item-level (and, via def[6]=minIlvl, quality-of-affix) gating: an affix
  // simply cannot be chosen until the item's ilvl reaches its minIlvl. This
  // is D2's real shape — the strongest affix tiers (and a few whole affixes
  // like jewelry +skills) are reserved for higher-level drops — applied to
  // this project's continuous baseVal+perTier scaling rather than D2's
  // discrete per-affix tier table.
  eligibleAffixes(pool, sc, ilvl) {
    return pool.filter(def => (def[3].includes(sc) || (sc === 's' && def[3].includes('a'))) && ilvl >= (def[6] || 1));
  },

  rollAffixes(rng, base, ilvl, count) {
    const sc = this.slotClassOf(base);
    const stats = {};
    const chosen = [];
    let prefixName = null, suffixName = null;
    const pools = [this.eligibleAffixes(PREFIXES, sc, ilvl), this.eligibleAffixes(SUFFIXES, sc, ilvl)];
    let guard = 0;
    while (chosen.length < count && guard++ < 80) {
      const pool = pools[chosen.length % 2 === 0 ? 0 : 1];
      if (!pool.length) break;
      const def = U.pick(rng, pool);
      if (chosen.includes(def[0])) continue;
      chosen.push(def[0]);
      const val = this.affixTierVal(rng, def, ilvl);
      stats[def[1]] = (stats[def[1]] || 0) + val;
      if (pools[0].includes(def) && !prefixName) prefixName = def[2];
      if (pools[1].includes(def) && !suffixName) suffixName = def[2];
    }
    return { stats, prefixName, suffixName };
  },

  // D2's real magic-find diminishing-returns formula (well documented,
  // reproduced from memory): effectiveMF = MF * C / (MF + C), where C
  // differs per rarity — 250 for Unique and 500 for Set are the two
  // constants most consistently cited by the community; Rare/Magic use a
  // larger, less aggressively-curving constant that is less precisely
  // documented, approximated here as 600. This replaces raw MF scaling the
  // odds linearly — at high MF the marginal value of another +1% keeps
  // shrinking, matching real D2's "MF has soft caps" behavior.
  effectiveMF(mf, rarity) {
    const C = { unique: 250, set: 500, rare: 600, magic: 600 }[rarity];
    if (!C || mf <= 0) return Math.max(0, mf);
    return mf * C / (mf + C);
  },

  // Main generator. opts: { forceRarity, forceType, classId, mf }
  generate(ilvl, opts = {}) {
    const rng = makeRng((Date.now() & 0xffffff) ^ (this._seq * 2654435761));
    this._seq++;
    ilvl = Math.max(1, Math.round(ilvl));
    const mf = opts.mf || 0;

    let rarity = opts.forceRarity;
    if (!rarity) {
      const eU = 1 + this.effectiveMF(mf, 'unique') / 100;
      const eS = 1 + this.effectiveMF(mf, 'set') / 100;
      const eR = 1 + this.effectiveMF(mf, 'rare') / 100;
      const eM = 1 + this.effectiveMF(mf, 'magic') / 100;
      rarity = U.weighted(rng, [
        ['unique', 1.6 * eU], ['set', 2.2 * eS], ['rare', 11 * eR], ['magic', 34 * Math.sqrt(eM)], ['common', 46],
      ]);
    }

    if (rarity === 'unique') {
      const pool = UNIQUES.filter(u => TIER_LVLS[u.tier] <= ilvl + 4);
      if (pool.length) return this.finalize(this.makeUnique(rng, U.pick(rng, pool)), opts);
      rarity = 'rare';
    }
    if (rarity === 'set') {
      let pieces = [];
      for (const s of SETS) for (const p of s.pieces) if (TIER_LVLS[p.tier] <= ilvl + 4) pieces.push({ set: s, piece: p });
      const clsPieces = pieces.filter(p => p.set.cls === opts.classId);
      if (clsPieces.length && U.chance(rng, 0.7)) pieces = clsPieces;
      if (pieces.length) { const pk = U.pick(rng, pieces); return this.finalize(this.makeSetPiece(rng, pk.set, pk.piece), opts); }
      rarity = 'rare';
    }

    const { base, tier } = this.pickBase(rng, ilvl, opts.forceType);
    const item = this.makeBaseItem(rng, base, tier, ilvl);
    item.rarity = rarity;

    if (rarity === 'magic') {
      const n = U.chance(rng, 0.4) ? 2 : 1;
      const aff = this.rollAffixes(rng, base, ilvl, n);
      item.stats = aff.stats;
      item.name = ((aff.prefixName ? aff.prefixName + ' ' : '') + item.baseName + (aff.suffixName ? ' ' + aff.suffixName : '')).trim();
    } else if (rarity === 'rare') {
      // Up to 6 affixes (real D2 rares can roll up to 3 prefixes + 3
      // suffixes = 6 total), gated by ilvl — low-level rares are more likely
      // to run out of eligible affixes before hitting 6 anyway thanks to
      // eligibleAffixes()'s minIlvl gate, but the *count itself* also climbs
      // with ilvl so early rares don't reliably roll a full 6.
      const maxN = ilvl >= 40 ? 6 : ilvl >= 24 ? 5 : 4;
      const n = U.ri(rng, Math.min(3, maxN), maxN);
      const aff = this.rollAffixes(rng, base, ilvl, n);
      item.stats = aff.stats;
      item.name = U.pick(rng, RARE_NAME_A) + U.pick(rng, RARE_NAME_B) + ' ' + item.baseName.split(' ').pop();
      item.reqLvl = Math.min(MAX_LVL, item.reqLvl + 2);
    }
    item.price = this.price(item);
    return this.finalize(item, opts);
  },

  // Quality roll: superior (+enhanced dmg/defense) / normal / inferior
  // (-dmg/defense). See ITEM_QUALITY in data.js for the cited rationale.
  rollQuality(rng) {
    return U.weighted(rng, [
      ['superior', ITEM_QUALITY.superior.weight],
      ['normal', ITEM_QUALITY.normal.weight],
      ['inferior', ITEM_QUALITY.inferior.weight],
    ]);
  },

  // Socket count: capped by the base type's maxSockets (0 for rings/
  // amulets/gloves/boots/belts, matching real D2 — those slots never take
  // sockets), and by an ilvl bracket so low-level items can't roll a
  // max-socket item early. Roughly 1/3 of eligible drops are socketed at
  // all, echoing D2's real drop rate being well under 100% even once a base
  // qualifies.
  rollSockets(rng, base, ilvl) {
    const max = base.maxSockets || 0;
    if (max <= 0) return 0;
    const bracket = ilvl >= 41 ? max : ilvl >= 28 ? Math.min(max, 4) : ilvl >= 15 ? Math.min(max, 3) : Math.min(max, 2);
    if (bracket <= 0 || !U.chance(rng, 1 / 3)) return 0;
    return U.ri(rng, 1, bracket);
  },

  makeBaseItem(rng, base, tier, ilvl, opts = {}) {
    const item = {
      id: 'it' + (this._seq++) + '_' + Math.floor(Math.random() * 1e6),
      type: base.id, slot: base.slot, tier, ilvl,
      baseName: base.names[tier], name: base.names[tier],
      rarity: 'common', stats: {}, reqLvl: TIER_LVLS[tier], quality: 'normal',
    };
    if (base.dmg) {
      const [lo, hi] = base.dmg[tier];
      item.dmg = [Math.max(1, Math.round(lo * U.rf(rng, 0.9, 1.1))), Math.round(hi * U.rf(rng, 0.9, 1.15))];
      item.spd = base.spd; item.ranged = !!base.ranged;
      if (base.critBonus) item.critBonus = base.critBonus;
    }
    if (base.armor && base.armor[tier]) item.armor = Math.round(base.armor[tier] * U.rf(rng, 0.85, 1.2));
    if (base.caster) item.spellPct = base.caster + tier * 6;
    if (base.blockPct) item.baseBlockPct = base.blockPct;

    // Quality never rolls on unique/set items — their magical properties
    // are fixed rolls (makeUnique/makeSetPiece pass skipQuality).
    if (!opts.skipQuality) {
      item.quality = this.rollQuality(rng);
      if (item.quality !== 'normal') {
        const [lo2, hi2] = ITEM_QUALITY[item.quality].mulRange;
        const mul = U.rf(rng, lo2, hi2);
        if (item.dmg) { item.dmg[0] = Math.max(1, Math.round(item.dmg[0] * mul)); item.dmg[1] = Math.round(item.dmg[1] * mul); }
        if (item.armor) item.armor = Math.max(1, Math.round(item.armor * mul));
        item.name = (item.quality === 'superior' ? 'Superior ' : 'Crude ') + item.name;
      }
    }

    // Ethereal — weapons and armor only, never rings/amulets.
    if (base.slot !== 'ring' && base.slot !== 'amulet' && U.chance(rng, ETHEREAL_CHANCE)) {
      item.ethereal = true;
      if (item.dmg) { item.dmg[0] = Math.round(item.dmg[0] * ETHEREAL_WEAPON_MULT); item.dmg[1] = Math.round(item.dmg[1] * ETHEREAL_WEAPON_MULT); }
      if (item.armor) item.armor = Math.round(item.armor * ETHEREAL_ARMOR_MULT);
    }

    // Sockets: capacity only; gems/runes are inserted later via socketGem().
    const nSockets = this.rollSockets(rng, base, ilvl);
    item.sockets = nSockets;
    item.gems = new Array(nSockets).fill(null);

    item.price = this.price(item);
    return this.finalize(item, opts);
  },

  makeUnique(rng, u) {
    const base = this.baseById(u.type);
    const item = this.makeBaseItem(rng, base, u.tier, TIER_LVLS[u.tier], { skipQuality: true });
    item.rarity = 'unique'; item.name = u.name; item.flavor = u.flavor;
    item.stats = Object.assign({}, u.stats);
    if (item.dmg) { item.dmg[0] = Math.round(item.dmg[0] * 1.25); item.dmg[1] = Math.round(item.dmg[1] * 1.25); }
    if (item.armor) item.armor = Math.round(item.armor * 1.3);
    item.price = this.price(item);
    return this.finalize(item);
  },

  makeSetPiece(rng, set, piece) {
    const base = this.baseById(piece.type);
    const item = this.makeBaseItem(rng, base, piece.tier, TIER_LVLS[piece.tier], { skipQuality: true });
    item.rarity = 'set'; item.name = piece.name; item.setId = set.id; item.setName = set.name;
    item.stats = Object.assign({}, piece.stats);
    item.price = this.price(item);
    return this.finalize(item);
  },

  // ---------- Sockets: gems, runes, rune words ----------
  componentRecord(source) {
    if (!source || (source.kind !== 'gem' && source.kind !== 'rune')) return null;
    if (source.kind === 'rune') {
      const r = RUNE_BY_NAME[source.name];
      if (!r || (source.ord !== undefined && Number(source.ord) !== r.ord)) return null;
      const value = 35 + r.ord * 15;
      const armorPct = Math.round(r.alonePct * 0.6 * 10) / 10;
      const effect = r.alonePct ? `Weapons: ${this.statLine('dmgPct', r.alonePct)}; Armor: ${this.statLine('armorPct', armorPct)}` : 'No individual socket bonus';
      return { kind: 'rune', component: true, name: r.name, baseName: `${r.name} Rune`, description: `Rune ${r.ord}. ${effect}`,
        ord: r.ord, reqLvl: r.lvl, rarity: 'rare', color: '#ffff77', value, price: value,
        width: 1, height: 1 };
    }
    const type = source.gemType, quality = source.quality, t = GEM_TYPES[type];
    if (!t || !GEM_QUALITIES.includes(quality)) return null;
    const name = quality[0].toUpperCase() + quality.slice(1) + ' ' + t.name;
    const rank = GEM_QUALITIES.indexOf(quality);
    const amount = Math.round(GEM_BASE_VAL * (GEM_QUALITY_MULT[quality] || 1) * 10) / 10;
    return { kind: 'gem', component: true, gemType: type, quality, name, baseName: name,
      weaponEffect: { stat: t.weapon.stat, value: amount }, armorEffect: { stat: t.armor.stat, value: amount },
      description: `Weapons: ${this.statLine(t.weapon.stat, amount)}; Armor: ${this.statLine(t.armor.stat, amount)}`,
      rarity: 'magic', color: '#7b7bff',
      value: 18 * (rank + 1) * (rank + 1), price: 18 * (rank + 1) * (rank + 1), reqLvl: 1,
      width: 1, height: 1 };
  },
  normalizeComponent(item) {
    const record = this.componentRecord(item);
    if (!record) return null;
    Object.assign(item, record);
    return item;
  },
  makeGem(type, quality) {
    const record = this.componentRecord({ kind: 'gem', gemType: type, quality });
    return record ? { ...record, id: 'gem_' + type + '_' + quality + '_' + (this._seq++) } : null;
  },
  makeRune(name) {
    const record = this.componentRecord({ kind: 'rune', name });
    const rune = RUNE_BY_NAME[name];
    return record ? { ...record, id: rune.id + '_' + (this._seq++) } : null;
  },

  // Deterministic component drops. Difficulty widens the eligible rune
  // window, while ilvl remains the hard progression gate.
  rollComponent(ilvl, difficulty = 0, rng = Math.random) {
    ilvl = Math.max(1, Math.floor(Number(ilvl) || 1));
    const diff = typeof difficulty === 'object' ? Number(difficulty.idx || difficulty.tier || 0) : Number(difficulty || 0);
    if (rng() < Math.min(0.22 + Math.max(0, diff) * 0.08, 0.48)) {
      const eligible = RUNES.filter(r => r.lvl <= ilvl + Math.max(0, diff) * 6);
      if (eligible.length) return this.makeRune(eligible[Math.min(eligible.length - 1, Math.floor(rng() * eligible.length))].name);
    }
    const maxQuality = ilvl >= 55 ? 4 : ilvl >= 38 ? 3 : ilvl >= 22 ? 2 : ilvl >= 10 ? 1 : 0;
    const types = Object.keys(GEM_TYPES);
    return this.makeGem(types[Math.min(types.length - 1, Math.floor(rng() * types.length))],
      GEM_QUALITIES[Math.min(maxQuality, Math.floor(rng() * (maxQuality + 1)))]);
  },

  // What a single socketed gem/rune contributes "alone" (i.e. when it isn't
  // part of a completed rune word) — see the citations on GEM_TYPES/RUNES in
  // data.js. `isWeaponSlot` picks the weapon-flavored effect vs the
  // armor/shield-flavored one, matching D2's real behavior that the same
  // gem does something different depending on what it's socketed into.
  gemAloneStat(g, isWeaponSlot) {
    if (!g) return null;
    if (g.kind === 'gem') {
      const t = GEM_TYPES[g.gemType]; if (!t) return null;
      const eff = isWeaponSlot ? t.weapon : t.armor;
      const mul = GEM_QUALITY_MULT[g.quality] || 1;
      return { key: eff.stat, val: Math.round(GEM_BASE_VAL * mul * 10) / 10 };
    }
    if (g.kind === 'rune') {
      const r = RUNE_BY_NAME[g.name];
      if (!r || !r.alonePct) return null; // Hel: no alone bonus, faithful to D2
      return isWeaponSlot
        ? { key: 'dmgPct', val: r.alonePct }
        : { key: 'armorPct', val: Math.round(r.alonePct * 0.6 * 10) / 10 };
    }
    return null;
  },

  insertSocket(item, obj, playerLevel = Infinity) {
    if (!item || !obj || (obj.kind !== 'gem' && obj.kind !== 'rune')) return false;
    if (this.needsIdentification(item)) return false;
    const sockets = Number(item.sockets);
    if (!Number.isInteger(sockets) || sockets < 1 || !Array.isArray(item.gems) || item.gems.length !== sockets) return false;
    if (obj.kind === 'gem' && (!GEM_TYPES[obj.gemType] || !GEM_QUALITIES.includes(obj.quality))) return false;
    const rune = obj.kind === 'rune' ? RUNE_BY_NAME[obj.name] : null;
    if (obj.kind === 'rune' && (!rune || Number(playerLevel) < rune.lvl)) return false;
    const idx = item.gems.indexOf(null);
    if (idx < 0) return false;
    item.gems[idx] = obj;
    this.applyRuneword(item);
    return true;
  },

  // Historical callers did not pass player level; keep that API permissive.
  socketGem(item, obj) { return this.insertSocket(item, obj, Infinity); },

  // A rune word activates only when EVERY socket is filled, all fillers are
  // runes (not gems), and the rune names match an eligible recipe for this
  // item's base type in the exact order — faithful to real D2. Idempotent:
  // re-checking an already-applied word does not re-add its stats.
  applyRuneword(item) {
    if (!item || !item.stats) return null;
    // Saves from the legacy implementation contain the word overlay folded
    // into stats. Remove it once, then permanently mark the separated model.
    if (item.runeword && item._socketStatsVersion !== 1) {
      const legacy = RUNEWORDS.find(rw => rw.id === item.runeword);
      if (legacy) for (const k in legacy.stats) {
        const value = Number(item.stats[k] || 0) - legacy.stats[k];
        if (Math.abs(value) < 1e-9) delete item.stats[k]; else item.stats[k] = value;
      }
    }
    item._socketStatsVersion = 1;
    let match = null;
    const validBase = item.rarity === 'common' && Array.isArray(item.gems) && item.gems.length === Number(item.sockets) && item.gems.length > 0;
    if (validBase && !item.gems.some(g => !g || g.kind !== 'rune')) {
      const names = item.gems.map(g => g.name);
      match = runewordForBase(item.type).find(rw => rw.sockets === item.sockets && rw.runes.every((n, i) => n === names[i])) || null;
    }
    if (!match) {
      delete item.runeword; delete item.runewordName;
      return null;
    }
    item.runeword = match.id; item.runewordName = match.name;
    return match;
  },

  socketStats(item) {
    const stats = {};
    if (!item || !Array.isArray(item.gems)) return stats;
    const add = (k, v) => { stats[k] = (stats[k] || 0) + v; };
    for (const component of item.gems) {
      const effect = this.gemAloneStat(component, item.slot === 'weapon');
      if (effect) add(effect.key, effect.val);
    }
    const word = this.applyRuneword(item);
    if (word) for (const k in word.stats) add(k, word.stats[k]);
    return stats;
  },

  // ---------- Gambling (see GAMBLE_CFG in data.js) ----------
  // Pure-function mirror of js/ui.js's renderGamble() formula, for anything
  // (including tests) that wants the gamble math without the DOM.
  gambleCost(pl) { return GAMBLE_CFG.costBase + pl.lvl * GAMBLE_CFG.costPerLvl; },
  gambleRarity(rng) { return U.weighted(rng, GAMBLE_CFG.rarityWeights); },

  price(item) {
    if (this.isCharmRecord(item) && typeof InventoryCharms !== 'undefined')
      return InventoryCharms.priceOf(item);
    if (this.isIdentifyScroll(item))
      return Math.max(1, Math.round(Number(item.value || item.price) || 1));
    if (item && (item.kind === 'gem' || item.kind === 'rune'))
      return Math.max(1, Math.round(Number(item.value || item.price) || 1));
    const rmul = { common: 1, magic: 3.2, rare: 8, set: 14, unique: 20 }[item.rarity] || 1;
    let p = (8 + item.ilvl * 6 + (item.tier || 0) * 30) * rmul;
    if (item.quality === 'superior') p *= 1.15;
    if (item.quality === 'inferior') p *= 0.7;
    if (item.sockets) p *= 1 + item.sockets * 0.08;
    if (item.ethereal) p *= ETHEREAL_PRICE_MULT;
    if (item.runeword) p *= 1.6;
    return Math.round(p);
  },

  sellPrice(item) {
    // Never turn the merchant into an oracle for concealed rolls or value.
    if (this.needsIdentification(item)) return 0;
    return Math.max(1, Math.floor(this.price(item) * 0.25));
  },

  // ---------- tooltips ----------
  tooltip(item, player) {
    const rc = 'q-' + item.rarity;
    let h = `<div class="tt-name ${rc}">${U.esc(this.displayName(item))}</div>`;
    if (this.isIdentifyScroll(item)) {
      h += '<div class="tt-type">Field Utility — 1×1</div>';
      h += '<div class="tt-identify-scroll">Reveals one unidentified item in your inventory.</div>';
      h += '<div class="tt-unidentified-note">Enter/click the scroll, then choose a glowing unidentified target.</div>';
      h += `<div class="q-gold" style="font-size:11px">Value: ${U.fmt(item.value || item.price || 0)} gold</div>`;
      return h;
    }
    if (item.kind === 'gem' || item.kind === 'rune') {
      h += `<div class="tt-type">Socket Component — 1×1</div>`;
      h += `<div class="tt-stat">${U.esc(item.description || '')}</div>`;
      h += `<div style="color:#847252">Requires Level ${item.reqLvl || 1}</div>`;
      h += `<div class="q-gold" style="font-size:11px">Value: ${U.fmt(item.value || item.price || 0)} gold</div>`;
      return h;
    }
    if (item.potion) {
      h += `<div class="tt-type">Potion — restores ${item.potion === 'hp' ? 'life' : 'mana'}</div>`;
      h += `<div style="color:#847252;font-size:11px">Click to add to your belt (${item.potion === 'hp' ? 'Q' : 'E'} to drink)</div>`;
      return h;
    }
    if (this.isCharmRecord(item)) {
      const [width, height] = this.sizeOf(item);
      h += `<div class="tt-type">Carried Charm — ${width}×${height}</div>`;
      if (this.needsIdentification(item)) {
        h += '<div class="tt-unidentified">UNIDENTIFIED</div>';
        h += '<div class="tt-unidentified-note">Its name, magic, requirement, and value remain concealed.</div>';
        h += '<div class="tt-unidentified-action">Use a Scroll of Identification, or ask Old Maras in town.</div>';
        return h;
      }
      const stats = typeof InventoryCharms !== 'undefined' ? InventoryCharms.statsOf(item) : {};
      for (const key of Object.keys(stats)) h += `<div class="tt-stat">${this.statLine(key, stats[key])}</div>`;
      const carried = !!(player && Array.isArray(player.inv) && player.inv.includes(item));
      const aggregate = carried && typeof InventoryCharms !== 'undefined'
        ? InventoryCharms.aggregate(player, this.sizeOf.bind(this)) : null;
      const active = !!(aggregate && aggregate.ok && aggregate.activeIds.includes(item.id));
      let state = 'INACTIVE — CARRY IN INVENTORY';
      if (active) state = 'ACTIVE IN CARRIED INVENTORY';
      else if (carried && aggregate && !aggregate.ok) state = 'INACTIVE — INVALID INVENTORY GRID';
      else if (carried && player && player.lvl < item.reqLvl) state = `INACTIVE — REQUIRES LEVEL ${item.reqLvl}`;
      h += `<div class="tt-charm-state ${active ? 'active' : 'inactive'}">${state}</div>`;
      const meets = !player || player.lvl >= item.reqLvl;
      h += `<div style="margin-top:5px;color:${meets ? '#847252' : '#ff5a3c'}">Requires Level ${item.reqLvl}</div>`;
      h += `<div class="q-gold" style="font-size:11px">Value: ${U.fmt(InventoryCharms.priceOf(item))} gold</div>`;
      return h;
    }
    const kind = item.slot === 'weapon' ? (item.ranged ? 'Ranged Weapon' : 'Weapon')
      : item.slot === 'offhand' ? 'Off-hand' : item.slot[0].toUpperCase() + item.slot.slice(1);
    h += `<div class="tt-type">${U.esc(item.baseName)} — ${kind}</div>`;
    if (this.needsIdentification(item)) {
      h += '<div class="tt-unidentified">UNIDENTIFIED</div>';
      h += '<div class="tt-unidentified-note">Its name, rolls, sockets, requirements, condition, and value remain concealed.</div>';
      h += '<div class="tt-unidentified-action">Use a Scroll of Identification, or ask Old Maras in town.</div>';
      return h;
    }
    if (item.dmg) h += `<div>Damage: <b>${item.dmg[0]}–${item.dmg[1]}</b> &nbsp;<span style="color:#847252">(${item.spd.toFixed(2)} speed)</span></div>`;
    if (item.armor) h += `<div>Armor: <b>${item.armor}</b></div>`;
    if (item.spellPct) h += `<div class="tt-stat">+${item.spellPct}% Spell Damage</div>`;
    if (item.critBonus) h += `<div class="tt-stat">+${item.critBonus}% Critical Chance</div>`;
    if (item.baseBlockPct) h += `<div class="tt-stat">Chance to Block: ${item.baseBlockPct}%</div>`;
    const condition = typeof ItemCondition !== 'undefined' && ItemCondition ? ItemCondition.condition(item) : null;
    if (condition && condition.maxDurability) {
      const broken = condition.durability === 0;
      h += `<div style="color:${broken ? '#ff5a4e' : '#a99a7a'}">Durability: ${condition.durability} of ${condition.maxDurability}</div>`;
      if (broken) h += '<div style="color:#ff5a4e;font-weight:bold">BROKEN — grants no bonuses while equipped.</div>';
    }
    if (item.ethereal) h += `<div style="color:#c0a0ff">Ethereal (cannot be repaired)</div>`;
    if (item.quality === 'superior') h += `<div style="color:#8fd8ff">Superior Quality</div>`;
    if (item.quality === 'inferior') h += `<div style="color:#a08060">Low Quality</div>`;
    for (const k in item.stats) h += `<div class="tt-stat">${this.statLine(k, item.stats[k])}</div>`;
    if (item.runewordName) h += `<div class="q-set" style="color:#ffae57">Rune Word: ${U.esc(item.runewordName)}</div>`;
    const socketBonus = this.socketStats(item);
    for (const k in socketBonus) h += `<div class="tt-stat">Socket Bonus: ${this.statLine(k, socketBonus[k])}</div>`;
    if (item.sockets) {
      const filled = item.gems.filter(Boolean);
      h += `<div>Sockets (${filled.length}/${item.sockets})${filled.length ? ': ' + filled.map(g => U.esc(g.name)).join(', ') : ''}</div>`;
    }
    if (item.setId) {
      const set = SETS.find(s => s.id === item.setId);
      const owned = player ? Object.values(player.equip).filter(e => e && e.setId === item.setId &&
        !this.needsIdentification(e) && !(typeof ItemCondition !== 'undefined' && ItemCondition.isBroken(e))).length : 0;
      h += `<div style="margin-top:5px" class="q-set">${U.esc(item.setName)} (${owned}/${set.pieces.length})</div>`;
      for (const nStr in set.bonuses) {
        const n = +nStr;
        const active = owned >= n;
        const lines = Object.keys(set.bonuses[n]).map(k => this.statLine(k, set.bonuses[n][k])).join(', ');
        h += `<div style="color:${active ? '#2bd45e' : '#5f5237'}">(${n}) ${lines}</div>`;
      }
    }
    if (item.flavor) h += `<div class="tt-flavor">“${U.esc(item.flavor)}”</div>`;
    const req = item.reqLvl || 1;
    const meets = !player || player.lvl >= req;
    h += `<div style="margin-top:5px;color:${meets ? '#847252' : '#ff5a3c'}">Requires Level ${req}</div>`;
    if (item.price != null) h += `<div class="q-gold" style="font-size:11px">Value: ${U.fmt(item.price)} gold</div>`;
    return h;
  },
};
