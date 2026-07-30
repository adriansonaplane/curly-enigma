// ============ DIABLOID: items.js — dynamic loot generation ============
'use strict';

const Items = {
  _seq: 1,

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
    const slot = this.equipSlotFor(item);
    if (!slot) return '';

    const equipped = player.equip[slot];
    if (!equipped) {
      return '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARED TO EQUIPPED</div>' +
        '<div style="color:#847252;font-size:11px">Empty slot — direct upgrade</div>';
    }

    let h = '<div class="tt-compare-label" style="margin-top:7px;border-top:1px solid #342710;padding-top:5px">COMPARED TO EQUIPPED</div>';
    let anyDiff = false;

    // Damage range comparison
    if (item.dmg || equipped.dmg) {
      const iLo = item.dmg ? item.dmg[0] : 0, iHi = item.dmg ? item.dmg[1] : 0;
      const eLo = equipped.dmg ? equipped.dmg[0] : 0, eHi = equipped.dmg ? equipped.dmg[1] : 0;
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
      const diff = (item.armor || 0) - (equipped.armor || 0);
      if (diff !== 0) {
        const sign = diff > 0 ? '+' : '';
        const cls = diff > 0 ? 'stat-up' : 'stat-down';
        h += `<div class="${cls}">${sign}${diff} Armor</div>`;
        anyDiff = true;
      }
    }

    // Gather all stat keys from both items
    const allKeys = new Set([...Object.keys(item.stats || {}), ...Object.keys(equipped.stats || {})]);
    for (const k of allKeys) {
      const iv = (item.stats && item.stats[k]) || 0;
      const ev = (equipped.stats && equipped.stats[k]) || 0;
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
      const diff = (item[s] || 0) - (equipped[s] || 0);
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

  rollAffixes(rng, base, ilvl, count) {
    const sc = this.slotClassOf(base);
    const stats = {};
    const chosen = [];
    let prefixName = null, suffixName = null;
    const pools = [PREFIXES, SUFFIXES];
    let guard = 0;
    while (chosen.length < count && guard++ < 60) {
      const pool = pools[chosen.length % 2 === 0 ? 0 : 1];
      const def = U.pick(rng, pool);
      const slots = def[3];
      if (!slots.includes(sc) && !(sc === 's' && slots.includes('a'))) continue;
      if (chosen.includes(def[0])) continue;
      chosen.push(def[0]);
      const val = this.affixTierVal(rng, def, ilvl);
      stats[def[1]] = (stats[def[1]] || 0) + val;
      if (pool === PREFIXES && !prefixName) prefixName = def[2];
      if (pool === SUFFIXES && !suffixName) suffixName = def[2];
    }
    return { stats, prefixName, suffixName };
  },

  // Main generator. opts: { forceRarity, forceType, classId, mf }
  generate(ilvl, opts = {}) {
    const rng = makeRng((Date.now() & 0xffffff) ^ (this._seq * 2654435761));
    this._seq++;
    ilvl = Math.max(1, Math.round(ilvl));
    const mf = opts.mf || 0;

    let rarity = opts.forceRarity;
    if (!rarity) {
      const m = 1 + mf / 100;
      rarity = U.weighted(rng, [
        ['unique', 1.6 * m], ['set', 2.2 * m], ['rare', 11 * m], ['magic', 34 * Math.sqrt(m)], ['common', 46],
      ]);
    }

    if (rarity === 'unique') {
      const pool = UNIQUES.filter(u => TIER_LVLS[u.tier] <= ilvl + 4);
      if (pool.length) return this.makeUnique(rng, U.pick(rng, pool));
      rarity = 'rare';
    }
    if (rarity === 'set') {
      let pieces = [];
      for (const s of SETS) for (const p of s.pieces) if (TIER_LVLS[p.tier] <= ilvl + 4) pieces.push({ set: s, piece: p });
      const clsPieces = pieces.filter(p => p.set.cls === opts.classId);
      if (clsPieces.length && U.chance(rng, 0.7)) pieces = clsPieces;
      if (pieces.length) { const pk = U.pick(rng, pieces); return this.makeSetPiece(rng, pk.set, pk.piece); }
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
      const n = U.ri(rng, 3, 5);
      const aff = this.rollAffixes(rng, base, ilvl, n);
      item.stats = aff.stats;
      item.name = U.pick(rng, RARE_NAME_A) + U.pick(rng, RARE_NAME_B) + ' ' + item.baseName.split(' ').pop();
      item.reqLvl = Math.min(MAX_LVL, item.reqLvl + 2);
    }
    item.price = this.price(item);
    return item;
  },

  makeBaseItem(rng, base, tier, ilvl) {
    const item = {
      id: 'it' + (this._seq++) + '_' + Math.floor(Math.random() * 1e6),
      type: base.id, slot: base.slot, tier, ilvl,
      baseName: base.names[tier], name: base.names[tier],
      rarity: 'common', stats: {}, reqLvl: TIER_LVLS[tier],
    };
    if (base.dmg) {
      const [lo, hi] = base.dmg[tier];
      item.dmg = [Math.max(1, Math.round(lo * U.rf(rng, 0.9, 1.1))), Math.round(hi * U.rf(rng, 0.9, 1.15))];
      item.spd = base.spd; item.ranged = !!base.ranged;
      if (base.critBonus) item.critBonus = base.critBonus;
    }
    if (base.armor && base.armor[tier]) item.armor = Math.round(base.armor[tier] * U.rf(rng, 0.85, 1.2));
    if (base.caster) item.spellPct = base.caster + tier * 6;
    item.price = this.price(item);
    return item;
  },

  makeUnique(rng, u) {
    const base = this.baseById(u.type);
    const item = this.makeBaseItem(rng, base, u.tier, TIER_LVLS[u.tier]);
    item.rarity = 'unique'; item.name = u.name; item.flavor = u.flavor;
    item.stats = Object.assign({}, u.stats);
    if (item.dmg) { item.dmg[0] = Math.round(item.dmg[0] * 1.25); item.dmg[1] = Math.round(item.dmg[1] * 1.25); }
    if (item.armor) item.armor = Math.round(item.armor * 1.3);
    item.price = this.price(item);
    return item;
  },

  makeSetPiece(rng, set, piece) {
    const base = this.baseById(piece.type);
    const item = this.makeBaseItem(rng, base, piece.tier, TIER_LVLS[piece.tier]);
    item.rarity = 'set'; item.name = piece.name; item.setId = set.id; item.setName = set.name;
    item.stats = Object.assign({}, piece.stats);
    item.price = this.price(item);
    return item;
  },

  price(item) {
    const rmul = { common: 1, magic: 3.2, rare: 8, set: 14, unique: 20 }[item.rarity] || 1;
    let p = (8 + item.ilvl * 6 + (item.tier || 0) * 30) * rmul;
    return Math.round(p);
  },

  sellPrice(item) { return Math.max(1, Math.floor(this.price(item) * 0.25)); },

  // ---------- tooltips ----------
  tooltip(item, player) {
    const rc = 'q-' + item.rarity;
    let h = `<div class="tt-name ${rc}">${U.esc(item.name)}</div>`;
    if (item.potion) {
      h += `<div class="tt-type">Potion — restores ${item.potion === 'hp' ? 'life' : 'mana'}</div>`;
      h += `<div style="color:#847252;font-size:11px">Click to add to your belt (${item.potion === 'hp' ? 'Q' : 'E'} to drink)</div>`;
      return h;
    }
    const kind = item.slot === 'weapon' ? (item.ranged ? 'Ranged Weapon' : 'Weapon')
      : item.slot === 'offhand' ? 'Off-hand' : item.slot[0].toUpperCase() + item.slot.slice(1);
    h += `<div class="tt-type">${U.esc(item.baseName)} — ${kind}</div>`;
    if (item.dmg) h += `<div>Damage: <b>${item.dmg[0]}–${item.dmg[1]}</b> &nbsp;<span style="color:#847252">(${item.spd.toFixed(2)} speed)</span></div>`;
    if (item.armor) h += `<div>Armor: <b>${item.armor}</b></div>`;
    if (item.spellPct) h += `<div class="tt-stat">+${item.spellPct}% Spell Damage</div>`;
    if (item.critBonus) h += `<div class="tt-stat">+${item.critBonus}% Critical Chance</div>`;
    for (const k in item.stats) h += `<div class="tt-stat">${this.statLine(k, item.stats[k])}</div>`;
    if (item.setId) {
      const set = SETS.find(s => s.id === item.setId);
      const owned = player ? Object.values(player.equip).filter(e => e && e.setId === item.setId).length : 0;
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
