// ============ DIABLOID: inventory-charms.js — carried-grid charm contract ============
'use strict';

// This module is intentionally standalone: it owns the canonical charm data
// contract, deterministic generation, and read-only activation aggregation.
// It has no DOM, save-system, item-generator, or combat-engine dependency.
const InventoryCharms = (() => {
  const VERSION = 1;
  const COLS = 10;
  const ROWS = 6;
  const MAX_ILVL = 99;

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
    return Object.freeze(value);
  }

  const FORM_ORDER = deepFreeze(['small', 'large', 'grand']);
  const FORMS = deepFreeze({
    small: { type: 'charm_small', baseName: 'Small Charm', width: 1, height: 1, scale: 1, weight: 50 },
    large: { type: 'charm_large', baseName: 'Large Charm', width: 1, height: 2, scale: 1.75, weight: 30 },
    grand: { type: 'charm_grand', baseName: 'Grand Charm', width: 1, height: 3, scale: 2.5, weight: 20 },
  });
  const BANDS = deepFreeze([
    { minIlvl: 1, reqLvl: 1 },
    { minIlvl: 18, reqLvl: 14 },
    { minIlvl: 36, reqLvl: 28 },
    { minIlvl: 54, reqLvl: 42 },
  ]);

  const AFFIXES = deepFreeze([
    { id: 'p_fire_res', side: 'prefix', stat: 'fireRes', label: 'Crimson', minBand: 0,
      ranges: [[2, 4], [4, 6], [6, 8], [8, 10]] },
    { id: 'p_cold_res', side: 'prefix', stat: 'coldRes', label: 'Sapphire', minBand: 0,
      ranges: [[2, 4], [4, 6], [6, 8], [8, 10]] },
    { id: 'p_lightning_res', side: 'prefix', stat: 'liteRes', label: 'Amber', minBand: 0,
      ranges: [[2, 4], [4, 6], [6, 8], [8, 10]] },
    { id: 'p_poison_res', side: 'prefix', stat: 'poisRes', label: 'Emerald', minBand: 0,
      ranges: [[2, 4], [4, 6], [6, 8], [8, 10]] },
    { id: 'p_arcane_res', side: 'prefix', stat: 'arcRes', label: 'Umbral', minBand: 0,
      ranges: [[2, 4], [4, 6], [6, 8], [8, 10]] },
    { id: 'p_all_res', side: 'prefix', stat: 'allRes', label: 'Shimmering', minBand: 1,
      ranges: [null, [2, 3], [3, 4], [4, 5]] },
    { id: 'p_mana', side: 'prefix', stat: 'mp', label: "Serpent's", minBand: 0,
      ranges: [[3, 5], [6, 9], [10, 14], [15, 20]] },
    { id: 'p_attack_rating', side: 'prefix', stat: 'ar', label: 'Bronze', minBand: 0,
      ranges: [[8, 14], [15, 25], [26, 40], [41, 60]] },

    { id: 's_life', side: 'suffix', stat: 'hp', label: 'of Life', minBand: 0,
      ranges: [[4, 7], [8, 12], [13, 18], [19, 25]] },
    { id: 's_strength', side: 'suffix', stat: 'str', label: 'of Strength', minBand: 0,
      ranges: [[1, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 's_dexterity', side: 'suffix', stat: 'dex', label: 'of Dexterity', minBand: 0,
      ranges: [[1, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 's_vitality', side: 'suffix', stat: 'vit', label: 'of Vitality', minBand: 0,
      ranges: [[1, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 's_energy', side: 'suffix', stat: 'ene', label: 'of Energy', minBand: 0,
      ranges: [[1, 1], [1, 2], [2, 3], [3, 4]] },
    { id: 's_magic_find', side: 'suffix', stat: 'mf', label: 'of Fortune', minBand: 1,
      ranges: [null, [2, 3], [3, 4], [4, 5]] },
    { id: 's_gold_find', side: 'suffix', stat: 'goldFind', label: 'of Greed', minBand: 0,
      ranges: [[5, 8], [9, 14], [15, 22], [23, 32]] },
    { id: 's_armor', side: 'suffix', stat: 'armor', label: 'of Balance', minBand: 0,
      ranges: [[2, 4], [5, 8], [9, 14], [15, 22]] },
  ]);

  const FORM_WEIGHTS = deepFreeze({ small: 50, large: 30, grand: 20 });
  const SIDE_WEIGHTS = deepFreeze({ prefix: 25, suffix: 25, both: 50 });
  const BAND_WEIGHTS = deepFreeze([1, 2, 4, 8]);
  const STAT_KEYS = deepFreeze(Array.from(new Set(AFFIXES.map(affix => affix.stat))));
  const DROP_CHANCE = deepFreeze({ normal: 0.025, champion: 0.08, elite: 0.16, boss: 0.50 });
  const REASONS = deepFreeze({
    INVALID_ITEM: 'invalid-item',
    INVALID_ID: 'invalid-id',
    UNSUPPORTED_VERSION: 'unsupported-version',
    INVALID_KIND: 'invalid-kind',
    INVALID_RARITY: 'invalid-rarity',
    UNKNOWN_FORM: 'unknown-form',
    TYPE_FORM_MISMATCH: 'type-form-mismatch',
    INVALID_ILVL: 'invalid-ilvl',
    INVALID_ROLLS: 'invalid-rolls',
    INVALID_ROLL: 'invalid-roll',
    UNKNOWN_AFFIX: 'unknown-affix',
    DUPLICATE_AFFIX: 'duplicate-affix',
    DUPLICATE_SIDE: 'duplicate-side',
    ILLEGAL_BAND: 'illegal-band',
    ILLEGAL_AFFIX_LEVEL: 'illegal-affix-level',
    VALUE_OUT_OF_RANGE: 'value-out-of-range',
    NON_CANONICAL_ROLL_ORDER: 'non-canonical-roll-order',
    NON_CANONICAL_FIELD: 'non-canonical-field',
    NON_CANONICAL_DERIVED: 'non-canonical-derived',
    IMMUTABLE_ITEM: 'immutable-item',
    INVALID_PLAYER: 'invalid-player',
    INVALID_INVENTORY: 'invalid-inventory',
    INVALID_LEVEL: 'invalid-level',
    INVALID_INVENTORY_ITEM: 'invalid-inventory-item',
    MISSING_ITEM_ID: 'missing-item-id',
    MALFORMED_ITEM_ID: 'malformed-item-id',
    DUPLICATE_ITEM_ID: 'duplicate-item-id',
    DUPLICATE_ITEM_OBJECT: 'duplicate-item-object',
    INVALID_SIZE_RESOLVER: 'invalid-size-resolver',
    INVALID_SIZE: 'invalid-size',
    CHARM_SIZE_MISMATCH: 'charm-size-mismatch',
    UNPLACED_ITEM: 'unplaced-item',
    INVALID_ANCHOR: 'invalid-anchor',
    OUT_OF_BOUNDS: 'out-of-bounds',
    OVERLAP: 'overlap',
    MALFORMED_CHARM: 'malformed-charm',
    UNIDENTIFIED: 'unidentified',
    LEVEL_REQUIRED: 'level-required',
  });

  const AFFIX_BY_ID = new Map(AFFIXES.map(affix => [affix.id, affix]));
  const FORM_BY_TYPE = new Map(FORM_ORDER.map(form => [FORMS[form].type, form]));
  const LEGACY_TYPE_FORM = new Map([
    ['small', 'small'], ['small-charm', 'small'], ['small_charm', 'small'], ['charm-small', 'small'], ['charm_small', 'small'],
    ['large', 'large'], ['large-charm', 'large'], ['large_charm', 'large'], ['charm-large', 'large'], ['charm_large', 'large'],
    ['grand', 'grand'], ['grand-charm', 'grand'], ['grand_charm', 'grand'], ['charm-grand', 'grand'], ['charm_grand', 'grand'],
  ]);
  const ALLOWED_FIELDS = new Set([
    'id', 'version', 'kind', 'type', 'form', 'rarity', 'ilvl', 'baseName', 'name', 'width', 'height',
    'rolls', 'reqLvl', 'identified', 'value', 'price', 'socketable', '_gx', '_gy',
  ]);
  const ROLL_FIELDS = new Set(['affixId', 'band', 'value']);
  const EMPTY_STATS = Object.freeze({});
  const EMPTY_IDS = Object.freeze([]);
  const EMPTY_INACTIVE = Object.freeze([]);

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const validId = value => typeof value === 'string' && !!value && value.trim() === value;
  const exactInteger = value => Number.isInteger(value);
  const legacyInteger = value => {
    const converted = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(converted) && Number.isInteger(converted) ? converted : null;
  };
  const failure = reason => Object.freeze({ ok: false, reason });
  const valid = () => Object.freeze({ ok: true, reason: '' });

  function bandFor(ilvl) {
    if (!Number.isInteger(ilvl) || ilvl < 1 || ilvl > MAX_ILVL) return -1;
    let result = 0;
    for (let index = 1; index < BANDS.length; index++) if (ilvl >= BANDS[index].minIlvl) result = index;
    return result;
  }

  function rangeFor(affixId, band, form) {
    const affix = AFFIX_BY_ID.get(affixId), spec = FORMS[form];
    if (!affix || !spec || !Number.isInteger(band) || band < affix.minBand || band >= BANDS.length) return null;
    const source = affix.ranges[band];
    if (!source) return null;
    const low = Math.max(1, Math.round(source[0] * spec.scale));
    const high = Math.max(low, Math.round(source[1] * spec.scale));
    return Object.freeze([low, high]);
  }

  function isCharmRecord(value) {
    if (!isObject(value)) return false;
    if (value.kind === 'charm') return true;
    if (typeof value.type === 'string' && LEGACY_TYPE_FORM.has(value.type.toLowerCase())) return true;
    return typeof value.form === 'string' && FORM_ORDER.includes(value.form.toLowerCase()) ||
      typeof value.charmSize === 'string' && FORM_ORDER.includes(value.charmSize.toLowerCase());
  }

  function resolveForm(raw, legacy) {
    const candidates = [];
    if (typeof raw.type === 'string') {
      const key = legacy ? raw.type.toLowerCase() : raw.type;
      const value = legacy ? LEGACY_TYPE_FORM.get(key) : FORM_BY_TYPE.get(key);
      if (value) candidates.push(value);
      else return { reason: REASONS.UNKNOWN_FORM };
    } else if (!legacy) return { reason: REASONS.UNKNOWN_FORM };
    for (const key of ['form', 'charmSize']) if (own(raw, key)) {
      if (typeof raw[key] !== 'string') return { reason: REASONS.UNKNOWN_FORM };
      const value = raw[key].toLowerCase();
      if (!FORM_ORDER.includes(value)) return { reason: REASONS.UNKNOWN_FORM };
      candidates.push(value);
    }
    if (!candidates.length) return { reason: REASONS.UNKNOWN_FORM };
    if (candidates.some(value => value !== candidates[0])) return { reason: REASONS.TYPE_FORM_MISMATCH };
    return { form: candidates[0] };
  }

  function parseRolls(source, form, ilvl, legacy) {
    if (!Array.isArray(source) || source.length < 1 || source.length > 2)
      return { reason: REASONS.INVALID_ROLLS };
    const maximumBand = bandFor(ilvl), seenAffixes = new Set(), seenSides = new Set(), rolls = [];
    for (const raw of source) {
      if (!isObject(raw)) return { reason: REASONS.INVALID_ROLL };
      const affixId = legacy && !own(raw, 'affixId') ? raw.id : raw.affixId;
      if (typeof affixId !== 'string' || !affixId) return { reason: REASONS.INVALID_ROLL };
      const affix = AFFIX_BY_ID.get(affixId);
      if (!affix) return { reason: REASONS.UNKNOWN_AFFIX };
      if (seenAffixes.has(affixId)) return { reason: REASONS.DUPLICATE_AFFIX };
      if (seenSides.has(affix.side)) return { reason: REASONS.DUPLICATE_SIDE };
      const band = legacy ? legacyInteger(raw.band) : raw.band;
      const value = legacy ? legacyInteger(raw.value) : raw.value;
      if (!Number.isInteger(band) || band < 0 || band >= BANDS.length) return { reason: REASONS.ILLEGAL_BAND };
      if (band < affix.minBand || band > maximumBand || ilvl < BANDS[band].minIlvl)
        return { reason: REASONS.ILLEGAL_AFFIX_LEVEL };
      const range = rangeFor(affixId, band, form);
      if (!Number.isInteger(value)) return { reason: REASONS.INVALID_ROLL };
      if (!range || value < range[0] || value > range[1]) return { reason: REASONS.VALUE_OUT_OF_RANGE };
      seenAffixes.add(affixId); seenSides.add(affix.side);
      rolls.push({ affixId, band, value });
    }
    rolls.sort((left, right) => {
      const leftSide = AFFIX_BY_ID.get(left.affixId).side, rightSide = AFFIX_BY_ID.get(right.affixId).side;
      return (leftSide === rightSide ? left.affixId.localeCompare(right.affixId) : leftSide === 'prefix' ? -1 : 1);
    });
    return { rolls };
  }

  function parse(raw, allowLegacy) {
    if (!isObject(raw)) return { reason: REASONS.INVALID_ITEM };
    const version = own(raw, 'version') ? raw.version : 0;
    const legacy = allowLegacy && (version === 0 || version === undefined || version === null);
    if (!legacy && version !== VERSION) return { reason: REASONS.UNSUPPORTED_VERSION };
    if (!validId(raw.id)) return { reason: REASONS.INVALID_ID };
    if (legacy) {
      if (own(raw, 'kind') && raw.kind !== 'charm') return { reason: REASONS.INVALID_KIND };
      if (own(raw, 'rarity') && raw.rarity !== 'magic') return { reason: REASONS.INVALID_RARITY };
    } else {
      if (raw.kind !== 'charm') return { reason: REASONS.INVALID_KIND };
      if (raw.rarity !== 'magic') return { reason: REASONS.INVALID_RARITY };
    }
    const resolved = resolveForm(raw, legacy);
    if (!resolved.form) return resolved;
    const ilvl = legacy ? legacyInteger(raw.ilvl) : raw.ilvl;
    if (!Number.isInteger(ilvl) || ilvl < 1 || ilvl > MAX_ILVL) return { reason: REASONS.INVALID_ILVL };
    const sourceRolls = Array.isArray(raw.rolls) ? raw.rolls : legacy && Array.isArray(raw.affixes) ? raw.affixes : null;
    const parsedRolls = parseRolls(sourceRolls, resolved.form, ilvl, legacy);
    if (!parsedRolls.rolls) return parsedRolls;
    return { form: resolved.form, spec: FORMS[resolved.form], ilvl, rolls: parsedRolls.rolls };
  }

  function derived(parsed) {
    const prefix = parsed.rolls.find(roll => AFFIX_BY_ID.get(roll.affixId).side === 'prefix');
    const suffix = parsed.rolls.find(roll => AFFIX_BY_ID.get(roll.affixId).side === 'suffix');
    const parts = [];
    if (prefix) parts.push(AFFIX_BY_ID.get(prefix.affixId).label);
    parts.push(parsed.spec.baseName);
    if (suffix) parts.push(AFFIX_BY_ID.get(suffix.affixId).label);
    const reqLvl = parsed.rolls.reduce((maximum, roll) => Math.max(maximum, BANDS[roll.band].reqLvl), 1);
    const value = 40 + 25 * parsed.spec.height + 2 * parsed.ilvl +
      4 * parsed.rolls.reduce((sum, roll) => sum + roll.value, 0);
    return { name: parts.join(' '), reqLvl, value };
  }

  function validate(item) {
    const parsed = parse(item, false);
    if (!parsed.form) return failure(parsed.reason);
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || !ALLOWED_FIELDS.has(key)) return failure(REASONS.NON_CANONICAL_FIELD);
    }
    if (item.type !== parsed.spec.type || item.form !== parsed.form) return failure(REASONS.TYPE_FORM_MISMATCH);
    if (item.baseName !== parsed.spec.baseName || item.width !== parsed.spec.width || item.height !== parsed.spec.height ||
        item.socketable !== false) return failure(REASONS.NON_CANONICAL_DERIVED);
    const expected = derived(parsed);
    if (item.name !== expected.name || item.reqLvl !== expected.reqLvl || item.value !== expected.value || item.price !== expected.value)
      return failure(REASONS.NON_CANONICAL_DERIVED);
    if (item.rolls.length !== parsed.rolls.length) return failure(REASONS.INVALID_ROLLS);
    for (let index = 0; index < item.rolls.length; index++) {
      const actual = item.rolls[index], canonical = parsed.rolls[index];
      if (!isObject(actual) || Reflect.ownKeys(actual).some(key => typeof key !== 'string' || !ROLL_FIELDS.has(key)))
        return failure(REASONS.INVALID_ROLL);
      if (actual.affixId !== canonical.affixId || actual.band !== canonical.band || actual.value !== canonical.value)
        return failure(REASONS.NON_CANONICAL_ROLL_ORDER);
    }
    return valid();
  }

  function isCharm(item) { return validate(item).ok; }

  function desiredRecord(raw, parsed) {
    const values = derived(parsed);
    const desired = {
      id: raw.id,
      version: VERSION,
      kind: 'charm',
      type: parsed.spec.type,
      form: parsed.form,
      rarity: 'magic',
      ilvl: parsed.ilvl,
      baseName: parsed.spec.baseName,
      name: values.name,
      width: parsed.spec.width,
      height: parsed.spec.height,
      rolls: parsed.rolls.map(roll => ({ affixId: roll.affixId, band: roll.band, value: roll.value })),
      reqLvl: values.reqLvl,
      value: values.value,
      price: values.value,
      socketable: false,
    };
    for (const key of ['identified', '_gx', '_gy']) if (own(raw, key)) desired[key] = raw[key];
    return desired;
  }

  function canCommit(item, desired) {
    const existing = Reflect.ownKeys(item), desiredKeys = Reflect.ownKeys(desired);
    if (desiredKeys.some(key => !own(item, key)) && !Object.isExtensible(item)) return false;
    for (const key of existing) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!own(desired, key)) {
        if (!descriptor || !descriptor.configurable) return false;
      } else if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.writable) return false;
    }
    return true;
  }

  function restoreDescriptors(item, descriptors) {
    try {
      for (const key of Reflect.ownKeys(item)) if (!own(descriptors, key)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (descriptor && descriptor.configurable) delete item[key];
      }
      for (const key of Reflect.ownKeys(descriptors)) Object.defineProperty(item, key, descriptors[key]);
    } catch (_error) { /* best-effort rollback for exotic proxy objects */ }
  }

  function normalize(item) {
    const parsed = parse(item, true);
    if (!parsed.form) return null;
    const desired = desiredRecord(item, parsed);
    if (!canCommit(item, desired)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    try {
      for (const key of Reflect.ownKeys(item)) if (!own(desired, key)) delete item[key];
      for (const key of Reflect.ownKeys(desired)) item[key] = desired[key];
      if (!validate(item).ok) throw new TypeError('Charm normalization did not produce a canonical record.');
      return item;
    } catch (_error) {
      restoreDescriptors(item, descriptors);
      return null;
    }
  }

  function statsOf(item) {
    const parsed = parse(item, false);
    if (!parsed.form) return EMPTY_STATS;
    const stats = {};
    for (const roll of parsed.rolls) {
      const affix = AFFIX_BY_ID.get(roll.affixId);
      stats[affix.stat] = (stats[affix.stat] || 0) + roll.value;
    }
    const sorted = {};
    for (const key of Object.keys(stats).sort()) sorted[key] = stats[key];
    return Object.freeze(sorted);
  }

  function nameOf(item) {
    const parsed = parse(item, false);
    return parsed.form ? derived(parsed).name : '';
  }

  function priceOf(item) {
    const parsed = parse(item, false);
    return parsed.form ? derived(parsed).value : 0;
  }

  function activeReason(item, playerLevel) {
    if (!validate(item).ok) return REASONS.MALFORMED_CHARM;
    if (!Number.isInteger(playerLevel) || playerLevel < 1 || playerLevel > MAX_ILVL) return REASONS.INVALID_LEVEL;
    if (item.identified !== true) return REASONS.UNIDENTIFIED;
    if (playerLevel < item.reqLvl) return REASONS.LEVEL_REQUIRED;
    return '';
  }

  function isActive(item, playerLevel) { return activeReason(item, playerLevel) === ''; }

  function inventoryFailure(reason, id = null) { return { ok: false, reason, id }; }

  function inspectCarried(player, sizeOf) {
    if (!isObject(player)) return inventoryFailure(REASONS.INVALID_PLAYER);
    if (!Array.isArray(player.inv)) return inventoryFailure(REASONS.INVALID_INVENTORY);
    const hasCharm = player.inv.some(isCharmRecord);
    if (!hasCharm) return { ok: true, reason: '', id: null, charms: [] };
    if (!Number.isInteger(player.lvl) || player.lvl < 1 || player.lvl > MAX_ILVL)
      return inventoryFailure(REASONS.INVALID_LEVEL);
    if (typeof sizeOf !== 'function') return inventoryFailure(REASONS.INVALID_SIZE_RESOLVER);

    const seenObjects = new Set(), seenIds = new Set();
    const occupied = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const charms = [];
    for (const item of player.inv) {
      if (!isObject(item)) return inventoryFailure(REASONS.INVALID_INVENTORY_ITEM);
      if (seenObjects.has(item)) return inventoryFailure(REASONS.DUPLICATE_ITEM_OBJECT, validId(item.id) ? item.id : null);
      seenObjects.add(item);
      if (item.id === undefined || item.id === null || item.id === '') return inventoryFailure(REASONS.MISSING_ITEM_ID);
      if (!validId(item.id)) return inventoryFailure(REASONS.MALFORMED_ITEM_ID, typeof item.id === 'string' ? item.id : null);
      if (seenIds.has(item.id)) return inventoryFailure(REASONS.DUPLICATE_ITEM_ID, item.id);
      seenIds.add(item.id);

      const routedCharm = isCharmRecord(item);
      if (routedCharm && !validate(item).ok) return inventoryFailure(REASONS.MALFORMED_CHARM, item.id);
      let size;
      try { size = sizeOf(item); } catch (_error) { return inventoryFailure(REASONS.INVALID_SIZE, item.id); }
      if (!Array.isArray(size) || size.length !== 2 || !Number.isInteger(size[0]) || !Number.isInteger(size[1]) ||
          size[0] < 1 || size[1] < 1 || size[0] > COLS || size[1] > ROWS)
        return inventoryFailure(REASONS.INVALID_SIZE, item.id);
      if (routedCharm) {
        const spec = FORMS[item.form];
        if (size[0] !== spec.width || size[1] !== spec.height)
          return inventoryFailure(REASONS.CHARM_SIZE_MISMATCH, item.id);
      }
      const hasX = own(item, '_gx'), hasY = own(item, '_gy');
      if (!hasX && !hasY) return inventoryFailure(REASONS.UNPLACED_ITEM, item.id);
      if (hasX !== hasY || !Number.isInteger(item._gx) || !Number.isInteger(item._gy))
        return inventoryFailure(REASONS.INVALID_ANCHOR, item.id);
      if (item._gx < 0 || item._gy < 0 || item._gx + size[0] > COLS || item._gy + size[1] > ROWS)
        return inventoryFailure(REASONS.OUT_OF_BOUNDS, item.id);
      for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) {
        if (occupied[item._gy + y][item._gx + x] !== null) return inventoryFailure(REASONS.OVERLAP, item.id);
      }
      for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++)
        occupied[item._gy + y][item._gx + x] = item.id;
      if (routedCharm) charms.push(item);
    }
    return { ok: true, reason: '', id: null, charms };
  }

  function validateCarried(player, sizeOf) {
    const inspected = inspectCarried(player, sizeOf);
    return Object.freeze({ ok: inspected.ok, reason: inspected.reason, id: inspected.id });
  }

  function aggregateFailure(inspected) {
    return Object.freeze({ ok: false, reason: inspected.reason, id: inspected.id,
      stats: EMPTY_STATS, activeIds: EMPTY_IDS, inactive: EMPTY_INACTIVE });
  }

  function aggregate(player, sizeOf) {
    const inspected = inspectCarried(player, sizeOf);
    if (!inspected.ok) return aggregateFailure(inspected);
    const stats = {}, activeIds = [], inactive = [];
    for (const item of inspected.charms) {
      const reason = activeReason(item, player.lvl);
      if (reason) {
        const entry = { id: item.id, reason };
        if (reason === REASONS.LEVEL_REQUIRED) entry.required = item.reqLvl;
        inactive.push(Object.freeze(entry));
        continue;
      }
      activeIds.push(item.id);
      const itemStats = statsOf(item);
      for (const key of Object.keys(itemStats)) stats[key] = (stats[key] || 0) + itemStats[key];
    }
    const sortedStats = {};
    for (const key of Object.keys(stats).sort()) sortedStats[key] = stats[key];
    activeIds.sort();
    inactive.sort((left, right) => left.id.localeCompare(right.id) || left.reason.localeCompare(right.reason));
    return Object.freeze({ ok: true, reason: '', stats: Object.freeze(sortedStats),
      activeIds: Object.freeze(activeIds), inactive: Object.freeze(inactive) });
  }

  function safeRandom(rng) {
    const value = Number(rng());
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError('Charm random values must be finite numbers in [0, 1).');
    return value;
  }

  function weightedChoice(entries, rng) {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let cursor = safeRandom(rng) * total;
    for (const entry of entries) {
      if (cursor < entry[1]) return entry[0];
      cursor -= entry[1];
    }
    return entries[entries.length - 1][0];
  }

  function uniformChoice(entries, rng) {
    return entries[Math.floor(safeRandom(rng) * entries.length)];
  }

  function randomInteger(low, high, rng) {
    return low + Math.floor(safeRandom(rng) * (high - low + 1));
  }

  function generate(options, rng) {
    if (!isObject(options)) throw new TypeError('Charm generation requires an options object.');
    if (!validId(options.id)) throw new TypeError('Charm generation requires a non-empty, trimmed string id.');
    if (!Number.isInteger(options.ilvl) || options.ilvl < 1 || options.ilvl > MAX_ILVL)
      throw new RangeError(`Charm item level must be an integer in [1, ${MAX_ILVL}].`);
    if (typeof rng !== 'function') throw new TypeError('Charm generation requires a random function.');
    let form = options.form;
    if (form === undefined || form === null) {
      form = weightedChoice(FORM_ORDER.map(key => [key, FORM_WEIGHTS[key]]), rng);
    } else if (typeof form !== 'string' || !FORMS[form]) throw new TypeError('Unknown charm form.');

    const sideMode = weightedChoice([
      ['prefix', SIDE_WEIGHTS.prefix], ['suffix', SIDE_WEIGHTS.suffix], ['both', SIDE_WEIGHTS.both],
    ], rng);
    const sides = sideMode === 'both' ? ['prefix', 'suffix'] : [sideMode];
    const maximumBand = bandFor(options.ilvl), rolls = [];
    for (const side of sides) {
      const pool = AFFIXES.filter(affix => affix.side === side && affix.minBand <= maximumBand);
      const affix = uniformChoice(pool, rng);
      const eligibleBands = [];
      for (let band = affix.minBand; band <= maximumBand; band++) if (affix.ranges[band])
        eligibleBands.push([band, BAND_WEIGHTS[band]]);
      const band = weightedChoice(eligibleBands, rng), range = rangeFor(affix.id, band, form);
      rolls.push({ affixId: affix.id, band, value: randomInteger(range[0], range[1], rng) });
    }
    const parsed = { form, spec: FORMS[form], ilvl: options.ilvl, rolls };
    const item = desiredRecord({ id: options.id, identified: false }, parsed);
    if (!validate(item).ok) throw new TypeError('Generated charm failed its canonical contract.');
    return item;
  }

  return Object.freeze({
    VERSION, COLS, ROWS, MAX_ILVL,
    FORM_ORDER, FORMS, BANDS, AFFIXES,
    FORM_WEIGHTS, SIDE_WEIGHTS, BAND_WEIGHTS,
    STAT_KEYS, DROP_CHANCE, REASONS,
    isCharmRecord, isCharm, validate,
    normalize, migrate: normalize,
    bandFor, rangeFor,
    nameOf, statsOf, priceOf,
    activeReason, isActive,
    validateCarried, aggregate,
    generate,
  });
})();

globalThis.InventoryCharms = InventoryCharms;
