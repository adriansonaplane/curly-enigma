'use strict';

// Runtime integration contract for Diablo-II-style inventory charms.
//
// This intentionally exercises the production scripts together instead of
// replacing charm logic with a test double. The fixture records below document
// the persisted charm schema expected by the runtime:
//   kind: "charm"
//   type: charm_small | charm_large | charm_grand
//   form: small | large | grand
//   rolls: canonical { affixId, band, value } records
// Stats are always derived by InventoryCharms.statsOf(); a persisted `stats`
// object is never authoritative.
// Charms are identified, level-qualified, validly placed inventory objects or
// they grant no stats. In particular, ownership aliases and duplicate ids must
// never become a source of duplicated bonuses.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const storage = new Map();
const announcements = [];
let failingStorageKey = null;
const sandbox = {
  console,
  Date,
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  performance: { now: () => 0 },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => {
      if (key === failingStorageKey) throw new Error(`injected storage failure for ${key}`);
      storage.set(key, String(value));
    },
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  },
};
sandbox.globalThis = sandbox;
sandbox.window = { addEventListener: () => {} };
sandbox.document = {};
sandbox.DifficultyState = {
  create: () => ({ selected: 0, unlocked: 0, campaigns: [] }),
  capture: () => {},
  migrate: value => value || { selected: 0, unlocked: 0, campaigns: [] },
  activate: (player, state, selected = 0) => {
    player.difficulty = state;
    player.difficultyIdx = selected;
    return state;
  },
  canSelect: () => true,
};
sandbox.QuestState = { create: () => ({}), migrate: value => value || {}, bump: () => {} };
sandbox.DialogueState = { create: () => ({}) };
sandbox.Dialogue = sandbox.Lore = sandbox.Narrative = {
  create: () => ({}),
  migrate: value => value || {},
};
sandbox.Factions = {
  migrate: value => value || {},
  price: value => value,
  isHostile: () => false,
};
sandbox.SEASON = { current: () => ({ num: 1 }) };
sandbox.sfx = () => {};
sandbox.FX = { ring: () => {}, deathBurst: () => {}, levelUp: () => {} };
sandbox.Render = { drawMinimap: () => {}, mapMarkers: () => [] };
sandbox.Physics = { clear: () => {} };
sandbox.WUI = { set: {}, keymap: {}, update: () => {} };
sandbox.Social = sandbox.Party = { update: () => {} };

vm.createContext(sandbox);
const load = (file, suffix = '') => vm.runInContext(
  fs.readFileSync(path.join(root, file), 'utf8') + suffix,
  sandbox,
  { filename: file },
);

load('js/util.js', '\nglobalThis.makeRng=makeRng; globalThis.U=U;');
load('js/data.js', `
  globalThis.CLASSES=CLASSES; globalThis.SKILL_BY_ID=SKILL_BY_ID;
  globalThis.MERCENARY_BY_ID=MERCENARY_BY_ID; globalThis.SETS=SETS;
  globalThis.TIER_LVLS=TIER_LVLS; globalThis.WEAPON_TYPES=WEAPON_TYPES;
  globalThis.ARMOR_TYPES=ARMOR_TYPES; globalThis.JEWELRY_TYPES=JEWELRY_TYPES;
  globalThis.PREFIXES=PREFIXES; globalThis.SUFFIXES=SUFFIXES;
  globalThis.ITEM_QUALITY=ITEM_QUALITY; globalThis.ETHEREAL_CHANCE=ETHEREAL_CHANCE;
  globalThis.ETHEREAL_WEAPON_MULT=ETHEREAL_WEAPON_MULT;
  globalThis.ETHEREAL_ARMOR_MULT=ETHEREAL_ARMOR_MULT;
  globalThis.ETHEREAL_PRICE_MULT=ETHEREAL_PRICE_MULT; globalThis.UNIQUES=UNIQUES;
  globalThis.MAX_LVL=MAX_LVL; globalThis.GAMBLE_CFG=GAMBLE_CFG;
  globalThis.RUNES=RUNES; globalThis.RUNE_BY_NAME=RUNE_BY_NAME; globalThis.RUNEWORDS=RUNEWORDS;
  globalThis.GEM_TYPES=GEM_TYPES; globalThis.GEM_QUALITIES=GEM_QUALITIES;
  globalThis.GEM_QUALITY_MULT=GEM_QUALITY_MULT; globalThis.GEM_BASE_VAL=GEM_BASE_VAL;
  globalThis.runewordForBase=runewordForBase; globalThis.ELEM=ELEM;
  globalThis.CUBE_RECIPES=CUBE_RECIPES; globalThis.difficultyByIdx=difficultyByIdx;
`);
load('js/items.js', '\nglobalThis.Items=Items;');
load('js/item-identification.js');

// Keep the failure actionable while the production module is being built.
const charmModule = ['js/item-charms.js', 'js/inventory-charms.js']
  .find(file => fs.existsSync(path.join(root, file)));
assert(charmModule, 'Missing production charm core (expected js/item-charms.js or js/inventory-charms.js).');
load(charmModule);
const InventoryCharms = sandbox.InventoryCharms || sandbox.ItemCharms;
assert(InventoryCharms && typeof InventoryCharms.isCharm === 'function',
  'The production charm core must expose InventoryCharms.isCharm(item).');
for (const api of ['generate', 'normalize', 'migrate', 'isCharmRecord', 'validate', 'statsOf', 'priceOf',
  'activeReason', 'isActive', 'validateCarried', 'aggregate'])
  assert.strictEqual(typeof InventoryCharms[api], 'function', `InventoryCharms.${api} must be public.`);

load('js/item-condition.js');
load('js/cube.js');
load('js/corpse-state.js');
load('js/entities.js', '\nglobalThis.Ent=Ent;');

// main.js uses the inventory controller for placement and exact-object removal.
// The real grid is DOM-backed, so the VM supplies the same 10x6 first-fit
// contract while leaving all item/charm decisions to production code.
function gridSize(item) {
  const size = sandbox.Items.sizeOf(item);
  return [Number(size[0]), Number(size[1])];
}
function validAnchor(item) {
  const [width, height] = gridSize(item);
  return Number.isInteger(item && item._gx) && Number.isInteger(item && item._gy) &&
    item._gx >= 0 && item._gy >= 0 && item._gx + width <= 10 && item._gy + height <= 6;
}
function occupancy(inventory, ignored) {
  const cells = Array.from({ length: 6 }, () => Array(10).fill(null));
  for (const item of inventory || []) {
    if (!item || item === ignored || !validAnchor(item)) continue;
    const [width, height] = gridSize(item);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
      cells[item._gy + y][item._gx + x] = item;
  }
  return cells;
}
const inventoryGrid = {
  COLS: 10,
  ROWS: 6,
  ensureGrid: () => {},
  removeItem: (item, inventory) => {
    const index = inventory.indexOf(item);
    if (index >= 0) inventory.splice(index, 1);
  },
  findSpace: (item, inventory, ignored) => {
    const [width, height] = gridSize(item), cells = occupancy(inventory, ignored);
    for (let row = 0; row <= 6 - height; row++) for (let col = 0; col <= 10 - width; col++) {
      let free = true;
      for (let y = 0; y < height && free; y++) for (let x = 0; x < width; x++)
        if (cells[row + y][col + x]) { free = false; break; }
      if (free) return { col, row };
    }
    return null;
  },
};
sandbox.UI = {
  inventoryGrid,
  openPanel: null,
  announce: message => announcements.push(String(message)),
  dmgNum: () => {},
  showDeath: () => {},
};
load('js/main.js', '\nglobalThis.RuntimeSave=Save; globalThis.RuntimeGame=Game; globalThis.RuntimeG=G;');

const {
  Items,
  ItemIdentification: Identification,
  ItemCondition: Condition,
  Cube,
  CorpseState,
  Ent,
  RuntimeSave: Save,
  RuntimeGame: Game,
  RuntimeG: G,
} = sandbox;
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = value => JSON.stringify(value);
const labelFor = { charm_small: 'Small Charm', charm_large: 'Large Charm', charm_grand: 'Grand Charm' };
const footprintFor = { charm_small: [1, 1], charm_large: [1, 2], charm_grand: [1, 3] };
const formFor = { charm_small: 'small', charm_large: 'large', charm_grand: 'grand' };

function charm(id, type = 'charm_small', seed = 1, extra = {}) {
  const generated = InventoryCharms.generate({ id, ilvl: 80, form: formFor[type] }, sandbox.makeRng(seed));
  assert(generated, `failed to generate ${type}`);
  generated.identified = true;
  generated._gx = 0;
  generated._gy = 0;
  Object.assign(generated, extra);
  return generated;
}

function charmWithStat(id, stat, type = 'charm_small', extra = {}) {
  for (let seed = 1; seed <= 20000; seed++) {
    const candidate = charm(id, type, seed, extra);
    const stats = InventoryCharms.statsOf(candidate);
    if (Number(stats && stats[stat]) > 0) return candidate;
  }
  assert.fail(`No deterministic ${type} generator seed produced ${stat}.`);
}

function resourceCharm(id, extra = {}) {
  const values = [0.9, 0.75, 0, 0, 0, 0, 0];
  let cursor = 0;
  const record = InventoryCharms.generate({ id, ilvl: 1, form: 'small' }, () => values[cursor++] ?? 0);
  assert(record, 'deterministic resource charm generation failed');
  const stats = InventoryCharms.statsOf(record);
  assert.deepStrictEqual(plain(stats), { mp: 3, hp: 4 },
    'locked generator sequence must produce canonical p_mana + s_life rolls');
  record.identified = true;
  record._gx = 0;
  record._gy = 0;
  Object.assign(record, extra);
  return record;
}

function charmStats(...records) {
  const result = {};
  for (const record of records) for (const [key, value] of Object.entries(InventoryCharms.statsOf(record) || {}))
    result[key] = (result[key] || 0) + Number(value || 0);
  return result;
}

function expectedMaxima(pl, baseline, stats) {
  return {
    hp: Math.floor(50 + (baseline.vit + Number(stats.vit || 0)) * 3.5 + pl.lvl * 6 + Number(stats.hp || 0)),
    mp: Math.floor(20 + (baseline.ene + Number(stats.ene || 0)) * 2 + pl.lvl * 2 + Number(stats.mp || 0)),
  };
}

function emptyEquip() {
  return { weapon: null, offhand: null, helm: null, chest: null, gloves: null,
    boots: null, belt: null, amulet: null, ring1: null, ring2: null };
}

let playerSerial = 0;
function player(inventory = []) {
  return {
    name: `CharmRuntime${++playerSerial}`,
    cls: sandbox.CLASSES[0].id,
    hardcore: false,
    dead: false,
    deadForever: false,
    lvl: 30,
    xp: 0,
    stats: { str: 0, dex: 0, vit: 0, ene: 0 },
    statPts: 0,
    skillPts: 0,
    skills: {},
    cds: {},
    buffs: [],
    hotbar: {},
    equip: emptyEquip(),
    inv: inventory,
    corpses: [],
    gold: 5000,
    potions: { hp: 0, mp: 0 },
    progress: { bossKilled: [], actUnlocked: 0, abyssBest: 0 },
    difficultyIdx: 0,
    difficulty: { selected: 0, unlocked: 0, campaigns: [] },
    bars: null,
    macros: [],
    quests: {},
    dialogue: {},
    lore: {},
    narrative: {},
    reputation: {},
    mercenary: null,
    x: 1,
    y: 1,
    dir: 0,
    hp: 1,
    mp: 1,
    gcd: 0,
    attackT: 0,
    hurtT: 0,
    moving: false,
    _invMigrated: true,
  };
}

function useWorld(pl, stash = []) {
  G.player = pl;
  G.stash = stash;
  G.groundItems = [];
  G.dungeonSave = null;
  G.map = { town: true, things: [], clues: [], encounters: [] };
  G.monsters = [];
  return pl;
}

function baselineFor(pl) {
  const inv = pl.inv, equip = pl.equip, mercenary = pl.mercenary, corpses = pl.corpses;
  const stash = G.stash, ground = G.groundItems, dungeon = G.dungeonSave;
  pl.inv = []; pl.equip = emptyEquip(); pl.mercenary = null; pl.corpses = [];
  G.stash = []; G.groundItems = []; G.dungeonSave = null;
  const result = plain(Ent.computeDerived(pl));
  pl.inv = inv; pl.equip = equip; pl.mercenary = mercenary; pl.corpses = corpses;
  G.stash = stash; G.groundItems = ground; G.dungeonSave = dungeon;
  return result;
}

function derived(pl) {
  G.player = pl;
  return plain(Ent.computeDerived(pl));
}

function allTopLevelOccurrences(pl, stash, targetOrId) {
  const matches = [];
  const wantedObject = targetOrId && typeof targetOrId === 'object' ? targetOrId : null;
  const wantedId = wantedObject ? wantedObject.id : targetOrId;
  const add = (item, location) => {
    if (item && (item === wantedObject || (!wantedObject && item.id === wantedId))) matches.push({ item, location });
  };
  Object.entries(pl.equip || {}).forEach(([slot, item]) => add(item, `equip.${slot}`));
  (pl.inv || []).forEach((item, index) => add(item, `inv.${index}`));
  Object.entries(pl.mercenary && pl.mercenary.equipment || {}).forEach(([slot, item]) => add(item, `merc.${slot}`));
  (pl.corpses || []).forEach((corpse, ci) => (corpse.gear || []).forEach((entry, gi) =>
    add(entry && entry.item, `corpse.${ci}.${gi}`)));
  (stash || []).forEach((item, index) => add(item, `stash.${index}`));
  (G.groundItems || []).forEach((entry, index) => add(entry && entry.item, `ground.${index}`));
  (G.dungeonSave && G.dungeonSave.groundItems || []).forEach((entry, index) =>
    add(entry && entry.item, `dungeon.${index}`));
  return matches;
}

// -------------------------------------------------------------------------
// Generation, footprints, and world-drop concealment
// -------------------------------------------------------------------------

for (const [type, expected] of Object.entries(footprintFor)) {
  const record = charm(`size-${type}`, type);
  assert.strictEqual(InventoryCharms.isCharm(record), true, `${type} must be structurally recognized as a charm`);
  assert.strictEqual(InventoryCharms.isCharmRecord(record), true, `${type} must satisfy the persisted record schema`);
  assert.deepStrictEqual(Array.from(Items.sizeOf(record)), expected, `${type} footprint must be authoritative`);
  assert.strictEqual(Condition.maxDurability(record), 0, `${type} can never gain durability`);
}

const forgedStats = resourceCharm('forged-stats');
const canonicalForgedStats = plain(InventoryCharms.statsOf(forgedStats));
forgedStats.stats = { hp: 999999, mp: 999999, __proto__: { hp: 999999 } };
assert.strictEqual(InventoryCharms.normalize(forgedStats), forgedStats);
assert.deepStrictEqual(plain(InventoryCharms.statsOf(forgedStats)), canonicalForgedStats,
  'persisted stats cannot override canonical rolls');
assert.strictEqual(Object.prototype.hasOwnProperty.call(forgedStats, 'stats'), false,
  'normalization removes the non-authoritative stats payload');

assert.strictEqual(typeof G.dropCharm, 'function', 'G.dropCharm(x, y, ilvl) is the central field-drop entry point.');
useWorld(player());
const originalRand = sandbox.U.rand;
sandbox.U.rand = () => 0.42;
const worldCharm = G.dropCharm(7, 9, 35);
sandbox.U.rand = originalRand;
assert(worldCharm && InventoryCharms.isCharm(worldCharm), 'dropCharm must return the exact generated charm');
assert.strictEqual(G.groundItems.length, 1);
assert.strictEqual(G.groundItems[0].item, worldCharm);
assert.strictEqual(Identification.needsIdentification(worldCharm), true, 'field charms are concealed');
assert(/^Unidentified (Small|Large|Grand) Charm$/.test(Items.displayName(worldCharm)),
  'a field label may reveal only the charm footprint');
assert(!Items.displayName(worldCharm).includes(worldCharm.name), 'the rolled charm name must remain concealed');

// -------------------------------------------------------------------------
// Legal-grid-only activation and every ownership exclusion
// -------------------------------------------------------------------------

const active = resourceCharm('active-resource', { _gx: 2, _gy: 2 });
let pl = useWorld(player([active]));
let base = baselineFor(pl), withCharm = derived(pl);
let activeStats = charmStats(active);
let maxima = expectedMaxima(pl, base, activeStats);
let aggregate = InventoryCharms.aggregate(pl, item => Items.sizeOf(item));
assert.strictEqual(aggregate.ok, true);
assert.deepStrictEqual(Array.from(aggregate.activeIds), [active.id]);
assert.deepStrictEqual(plain(aggregate.stats), plain(activeStats));
assert.strictEqual(withCharm.maxHp, maxima.hp);
assert.strictEqual(withCharm.maxMp, maxima.mp);

const inactiveCases = [
  ['unidentified', charm('inactive-hidden', 'charm_small', 11, { identified: false, _gx: 1, _gy: 1 })],
  ['negative-column', charm('inactive-neg', 'charm_small', 13, { _gx: -1, _gy: 0 })],
  ['fractional-row', charm('inactive-frac', 'charm_small', 14, { _gx: 0, _gy: 1.5 })],
  ['string-column', charm('inactive-string', 'charm_small', 15, { _gx: '0', _gy: 0 })],
  ['missing-anchor', charm('inactive-loose', 'charm_small', 16, { _gx: undefined, _gy: undefined })],
  ['out-of-bounds-grand', charm('inactive-oob', 'charm_grand', 17, { _gx: 9, _gy: 4 })],
];
for (const [label, record] of inactiveCases) {
  pl = useWorld(player([record])); base = baselineFor(pl);
  assert.deepStrictEqual(derived(pl), base, `${label} charm must contribute no derived stats`);
}

let belowLevel = null;
for (let seed = 12; seed < 100 && !belowLevel; seed += 1) {
  const candidate = charm('inactive-level', 'charm_small', seed, { _gx: 1, _gy: 1 });
  if (candidate.reqLvl > 1) belowLevel = candidate;
}
assert(belowLevel, 'fixture must find a canonical charm with a level requirement');
pl = useWorld(player([belowLevel]));
pl.lvl = belowLevel.reqLvl - 1;
base = baselineFor(pl);
assert.deepStrictEqual(derived(pl), base, 'below-level charm must contribute no derived stats');

const overlapA = charm('overlap-a', 'charm_small', 18, { _gx: 3, _gy: 3 });
const overlapB = charm('overlap-b', 'charm_small', 19, { _gx: 3, _gy: 3 });
pl = useWorld(player([overlapA, overlapB])); base = baselineFor(pl);
aggregate = InventoryCharms.aggregate(pl, item => Items.sizeOf(item));
assert.strictEqual(aggregate.ok, false, 'overlapping carried topology fails closed');
assert.deepStrictEqual(plain(aggregate.stats), {});
assert.deepStrictEqual(derived(pl), base, 'every charm in an ambiguous overlap is inactive');

const repeatedObject = charm('repeated-object', 'charm_small', 20, { _gx: 0, _gy: 0 });
pl = useWorld(player([repeatedObject, repeatedObject])); base = baselineFor(pl);
assert.strictEqual(InventoryCharms.validateCarried(pl, item => Items.sizeOf(item)).ok, false);
assert.deepStrictEqual(derived(pl), base, 'the same object repeated in inventory is inactive, not counted once per entry');

const duplicateA = charm('duplicate-id', 'charm_small', 21, { _gx: 0, _gy: 0 });
const duplicateB = charm('duplicate-id', 'charm_small', 22, { _gx: 1, _gy: 0 });
pl = useWorld(player([duplicateA, duplicateB])); base = baselineFor(pl);
assert.strictEqual(InventoryCharms.validateCarried(pl, item => Items.sizeOf(item)).ok, false);
assert.deepStrictEqual(derived(pl), base, 'distinct objects with a duplicate id are all inactive');

const aliasedScope = charm('aliased-scope', 'charm_small', 23, { _gx: 0, _gy: 0 });
pl = useWorld(player([aliasedScope])); pl.lvl = 80; base = baselineFor(pl);
assert.notDeepStrictEqual(derived(pl), base,
  'the alias fixture must be level-eligible and active with one carried owner');
G.stash = [aliasedScope];
Save.normalizeItems(pl, G.stash);
assert.strictEqual(pl.inv.filter(item => item === aliasedScope).length, 1);
assert.strictEqual(G.stash.includes(aliasedScope), false,
  'save normalization removes the lower-priority stash alias of a carried charm');
assert.notDeepStrictEqual(derived(pl), base,
  'the one surviving carried owner remains active after alias normalization');

const scoped = charm('scoped', 'charm_small', 24, { _gx: 0, _gy: 0 });
for (const location of ['stash', 'equip', 'mercenary', 'corpse', 'ground', 'dungeon']) {
  pl = useWorld(player());
  if (location === 'stash') G.stash = [scoped];
  if (location === 'equip') pl.equip.weapon = scoped;
  if (location === 'mercenary') pl.mercenary = { archetypeId: 'ironwolf', level: pl.lvl, xp: 0,
    equipment: { weapon: scoped }, dead: false };
  if (location === 'corpse') pl.corpses = [{ id: 'scope-corpse', gear: [{ slot: 'weapon', item: scoped }],
    location: { kind: 'town' } }];
  if (location === 'ground') G.groundItems = [{ x: 2, y: 2, item: scoped }];
  if (location === 'dungeon') G.dungeonSave = { groundItems: [{ x: 2, y: 2, item: scoped }] };
  base = baselineFor(pl);
  assert.deepStrictEqual(derived(pl), base, `${location} charms must never contribute hero stats`);
}

// -------------------------------------------------------------------------
// Save normalization: canonical records, one id, and one physical owner
// -------------------------------------------------------------------------

const canonicalOwner = charm('owned-once', 'charm_large', 31, { _gx: 0, _gy: 0 });
const duplicateRecord = charm('owned-once', 'charm_large', 32, { _gx: 2, _gy: 0 });
duplicateRecord.rolls[0].value = 9999;
pl = useWorld(player([canonicalOwner, canonicalOwner, duplicateRecord]), [canonicalOwner, duplicateRecord]);
pl.equip.weapon = canonicalOwner;
pl.mercenary = { archetypeId: 'ironwolf', level: pl.lvl, xp: 0, equipment: { weapon: canonicalOwner }, dead: false };
pl.corpses = [{ id: 'alias-corpse', gear: [{ slot: 'weapon', item: canonicalOwner }], location: { kind: 'town' } }];
G.groundItems = [{ x: 1, y: 1, item: canonicalOwner }, { x: 2, y: 2, item: duplicateRecord }];
G.dungeonSave = { groundItems: [{ x: 3, y: 3, item: canonicalOwner }] };
Save.normalizeItems(pl, G.stash);
const survivingId = allTopLevelOccurrences(pl, G.stash, 'owned-once');
const survivingObject = allTopLevelOccurrences(pl, G.stash, canonicalOwner);
assert.strictEqual(survivingId.length, 1, 'normalization must not re-id a copied charm into another bonus');
assert.strictEqual(survivingObject.length, 1, 'normalization must remove exact-object ownership aliases');
assert.strictEqual(survivingId[0].location.startsWith('inv.'), true,
  'a valid carried occurrence wins over illegal equip/merc/corpse aliases');
assert.strictEqual(InventoryCharms.isCharm(survivingId[0].item), true);
assert(Object.values(InventoryCharms.statsOf(survivingId[0].item)).every(value => Number.isFinite(value) && value < 9999),
  'save normalization must retain canonical bounded rolls, never the forged duplicate payload');

// Portal return restores the saved ground array by reference. Treating the
// live and saved aliases as separate owners would clear the one physical charm
// during any save/autosave.
const portalGroundCharm = charm('portal-ground-owner', 'charm_small', 33);
delete portalGroundCharm._gx; delete portalGroundCharm._gy;
pl = useWorld(player());
const sharedGround = [{ x: 4, y: 5, item: portalGroundCharm }];
G.groundItems = sharedGround;
G.dungeonSave = { monsters: [], groundItems: sharedGround };
Save.saveChar(pl);
assert.strictEqual(G.dungeonSave.groundItems, G.groundItems,
  'fixture must exercise the portal-return ground-array alias');
assert.strictEqual(G.groundItems.length, 1);
assert.strictEqual(G.groundItems[0].item, portalGroundCharm,
  'save normalization must not delete a charm by scanning one aliased ground owner twice');

// When load-time ownership repair removes a stale stash duplicate, that repair
// must be persisted immediately. Otherwise removing the carried winner later
// would let the stale record resurrect from the independent stash key.
const stashWinner = charm('stale-stash-owner', 'charm_small', 34, { _gx: 0, _gy: 0 });
const staleStashCopy = charm('stale-stash-owner', 'charm_small', 34, { _gx: 0, _gy: 0 });
pl = useWorld(player([stashWinner]));
storage.set(Save.STASH, JSON.stringify([staleStashCopy]));
Save.loadStash();
assert.strictEqual(G.stash.length, 0, 'carried ownership wins over a stale stash duplicate');
assert.deepStrictEqual(JSON.parse(storage.get(Save.STASH)), [],
  'load-time duplicate pruning must update persistent stash storage immediately');
pl.inv.splice(pl.inv.indexOf(stashWinner), 1);
Save.saveChar(pl);
Save.loadStash();
assert.strictEqual(G.stash.length, 0, 'a removed winner cannot resurrect the stale stash copy later');

const existingLegacyId = charm('legacy-charm-inventory-1', 'charm_small', 35, { _gx: 1, _gy: 0 });
const missingLegacyId = charm('temporary-id', 'charm_small', 36, { _gx: 0, _gy: 0 });
delete missingLegacyId.id;
pl = useWorld(player([missingLegacyId, existingLegacyId]));
Save.normalizeItems(pl, G.stash);
assert.strictEqual(pl.inv.length, 2, 'assigning a missing charm id must preserve every distinct valid charm');
assert.strictEqual(pl.inv.includes(existingLegacyId), true);
assert.strictEqual(existingLegacyId.id, 'legacy-charm-inventory-1', 'a valid pre-existing id is never stolen');
assert.strictEqual(new Set(pl.inv.map(item => item.id)).size, 2, 'migrated charm ids remain unique');

const reservedCharmId = charm('legacy-sword-equip-weapon', 'charm_small', 40, { _gx: 0, _gy: 0 });
const missingSwordId = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
delete missingSwordId.id;
pl = useWorld(player([reservedCharmId])); pl.equip.weapon = missingSwordId;
Save.normalizeItems(pl, G.stash);
assert.strictEqual(pl.inv.includes(reservedCharmId), true,
  'an earlier missing-id generic item cannot claim a later valid charm identity');
assert.strictEqual(reservedCharmId.id, 'legacy-sword-equip-weapon');
assert.notStrictEqual(missingSwordId.id, reservedCharmId.id);

const validBesideMalformed = charm('valid-beside-malformed', 'charm_small', 37, { _gx: 0, _gy: 0 });
pl = useWorld(player([validBesideMalformed, 'malformed-member']));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'malformed primitive inventory members must be pruned instead of crashing save migration');
assert.deepStrictEqual(pl.inv, [validBesideMalformed]);

const frozenMissingCharmId = charm('remove-before-freeze', 'charm_small', 38, { _gx: 1, _gy: 0 });
delete frozenMissingCharmId.id;
Object.freeze(frozenMissingCharmId);
const frozenMissingGenericId = Object.freeze({ kind: 'legacy-object', type: 'ring', _gx: 2, _gy: 0 });
pl = useWorld(player([frozenMissingCharmId, frozenMissingGenericId]));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'immutable legacy records that require ids must be pruned instead of throwing in strict mode');
assert.deepStrictEqual(pl.inv, []);

const frozenValidId = Object.freeze({
  id: 'frozen-valid', type: 'ring', slot: 'ring', rarity: 'common', stats: {}, _gx: 0, _gy: 0,
});
pl = useWorld(player([frozenValidId]));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'an immutable non-charm with a valid id must fail closed when downstream migration needs to write');
assert.deepStrictEqual(pl.inv, []);

const frozenValidGem = Items.makeGem('ruby', 'chipped');
frozenValidGem.id = 'frozen-valid-gem'; frozenValidGem._gx = 0; frozenValidGem._gy = 0;
Object.freeze(frozenValidGem);
pl = useWorld(player([frozenValidGem]));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'an immutable valid-id socket component must be pruned when canonical component migration cannot write');
assert.deepStrictEqual(pl.inv, []);

const frozenNestedGem = Items.makeGem('ruby', 'chipped');
frozenNestedGem.id = 'frozen-nested-gem'; Object.freeze(frozenNestedGem);
const socketHost = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
socketHost.id = 'socket-host-survives'; socketHost.sockets = 1; socketHost.gems = [frozenNestedGem];
socketHost._gx = 0; socketHost._gy = 0;
pl = useWorld(player([socketHost]));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash));
assert.strictEqual(pl.inv.includes(socketHost), true,
  'a malformed immutable socket filler must not delete its valid host item');
assert.deepStrictEqual(socketHost.gems, [null]);

const numericIdGem = Items.makeGem('ruby', 'chipped');
numericIdGem.id = 17; numericIdGem._gx = 0; numericIdGem._gy = 0;
const paddedIdGem = Items.makeGem('sapphire', 'chipped');
paddedIdGem.id = ' bad '; paddedIdGem._gx = 1; paddedIdGem._gy = 0;
pl = useWorld(player([numericIdGem, paddedIdGem]));
Save.normalizeItems(pl, G.stash);
assert.strictEqual(pl.inv.length, 2);
assert(pl.inv.every(item => typeof item.id === 'string' && item.id.trim() && item.id.trim() === item.id),
  'numeric and padded component identities migrate to strict lookup-safe strings');
assert.strictEqual(new Set(pl.inv.map(item => item.id)).size, 2);

const poisonedFrozenRing = Object.freeze({
  id: 'poisoned-valid-id', type: 'ring', slot: 'ring', rarity: 'common', stats: {}, _gx: 0, _gy: 0,
});
const poisonedIdCharm = charm('poisoned-valid-id', 'charm_small', 41, { _gx: 0, _gy: 0 });
pl = useWorld(player([poisonedIdCharm])); pl.equip.ring1 = poisonedFrozenRing;
Save.normalizeItems(pl, G.stash);
assert.strictEqual(pl.equip.ring1, null);
assert.strictEqual(pl.inv.includes(poisonedIdCharm), true,
  'an earlier record that fails canonicalization cannot poison a later valid identity claim');

const hostileIdCharm = charm('hostile-id-source', 'charm_small', 39, { _gx: 0, _gy: 0 });
delete hostileIdCharm.id;
Object.defineProperty(hostileIdCharm, 'id', {
  configurable: true,
  get() { throw new Error('hostile id getter'); },
});
pl = useWorld(player([hostileIdCharm]));
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'a charm with hostile identity access must be pruned instead of aborting ownership normalization');
assert.deepStrictEqual(pl.inv, []);

pl.inv = { corrupt: true };
assert.doesNotThrow(() => Save.normalizeItems(pl, G.stash),
  'a truthy non-array inventory container must migrate to an empty inventory');
assert.deepStrictEqual(plain(pl.inv), []);
storage.set(Save.STASH, JSON.stringify({ corrupt: true }));
assert.doesNotThrow(() => Save.loadStash(),
  'a truthy non-array stored stash container must migrate instead of crashing load');
assert.deepStrictEqual(plain(G.stash), []);
assert.deepStrictEqual(JSON.parse(storage.get(Save.STASH)), []);

const removedBySave = resourceCharm('cross-kind-save-id', { _gx: 0, _gy: 0 });
const collisionWeapon = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
collisionWeapon.id = removedBySave.id;
pl = useWorld(player([removedBySave])); pl.equip.weapon = collisionWeapon;
const collisionBase = baselineFor(pl);
Ent.refreshDerived(pl, { fill: true });
assert(pl.derived.maxHp > collisionBase.maxHp && pl.derived.maxMp > collisionBase.maxMp,
  'collision fixture must begin with active life and mana charm power');
Save.saveChar(pl);
assert.strictEqual(pl.inv.includes(removedBySave), false,
  'the higher-priority non-charm equipment id makes the colliding charm fail closed');
assert.strictEqual(pl.derived.maxHp, collisionBase.maxHp);
assert.strictEqual(pl.derived.maxMp, collisionBase.maxMp);
assert.strictEqual(pl.hp, collisionBase.maxHp, 'save-time charm removal clamps current life immediately');
assert.strictEqual(pl.mp, collisionBase.maxMp, 'save-time charm removal clamps current mana immediately');

const repairedAlias = resourceCharm('save-repaired-alias', { _gx: 0, _gy: 0 });
pl = useWorld(player([repairedAlias, repairedAlias]));
const repairedBase = baselineFor(pl);
Ent.refreshDerived(pl);
assert.strictEqual(pl.charmState.ok, false, 'duplicate object begins fail-closed');
pl.hp = repairedBase.maxHp - 5; pl.mp = repairedBase.maxMp - 3;
const repairHp = pl.hp, repairMp = pl.mp;
Save.saveChar(pl);
assert.deepStrictEqual(plain(pl.charmState.activeIds), [repairedAlias.id]);
assert.strictEqual(pl.inv.filter(item => item === repairedAlias).length, 1);
assert.strictEqual(pl.derived.maxHp, repairedBase.maxHp + InventoryCharms.statsOf(repairedAlias).hp);
assert.strictEqual(pl.derived.maxMp, repairedBase.maxMp + InventoryCharms.statsOf(repairedAlias).mp);
assert.strictEqual(pl.hp, repairHp, 'save-time alias repair may raise max life but never heals');
assert.strictEqual(pl.mp, repairMp, 'save-time alias repair may raise max mana but never refills it');

// -------------------------------------------------------------------------
// Identification activates immediately but never heals current resources
// -------------------------------------------------------------------------

const hidden = resourceCharm('identify-charm', {
  identified: false,
  _gx: 0,
  _gy: 0,
});
const scroll = Identification.createScroll('identify-charm-scroll');
scroll._gx = 1; scroll._gy = 0;
pl = useWorld(player([hidden, scroll]));
base = baselineFor(pl);
Ent.computeDerived(pl);
pl.hp = base.maxHp - 7;
pl.mp = base.maxMp - 5;
const beforeHp = pl.hp, beforeMp = pl.mp;
const identified = Game.identifyItem(scroll.id, hidden.id);
assert.strictEqual(identified.ok, true, identified.reason);
assert.strictEqual(hidden.identified, true);
assert.strictEqual(pl.inv.includes(scroll), false);
activeStats = charmStats(hidden);
maxima = expectedMaxima(pl, base, activeStats);
assert.strictEqual(pl.derived.maxHp, maxima.hp);
assert.strictEqual(pl.derived.maxMp, maxima.mp);
assert.strictEqual(pl.hp, beforeHp, 'gaining maximum life from identification must not heal');
assert.strictEqual(pl.mp, beforeMp, 'gaining maximum mana from identification must not refill mana');

assert.strictEqual(typeof Ent.refreshDerived, 'function',
  'Ent.refreshDerived(player) must centralize recomputation and hp/mp clamping.');
pl.hp = pl.derived.maxHp;
pl.mp = pl.derived.maxMp;
pl.inv.splice(pl.inv.indexOf(hidden), 1);
Ent.refreshDerived(pl);
assert.strictEqual(pl.derived.maxHp, base.maxHp);
assert.strictEqual(pl.derived.maxMp, base.maxMp);
assert.strictEqual(pl.hp, base.maxHp, 'removing a life charm clamps current life immediately');
assert.strictEqual(pl.mp, base.maxMp, 'removing a mana charm clamps current mana immediately');
pl.inv.push(hidden);
Ent.refreshDerived(pl);
assert.strictEqual(pl.derived.maxHp, maxima.hp);
assert.strictEqual(pl.derived.maxMp, maxima.mp);
assert.strictEqual(pl.hp, base.maxHp, 're-adding a life charm raises the maximum without healing');
assert.strictEqual(pl.mp, base.maxMp, 're-adding a mana charm raises the maximum without refilling');

// -------------------------------------------------------------------------
// Tooltip concealment and explicit subsystem refusals
// -------------------------------------------------------------------------

const secret = charm('secret-charm', 'charm_grand', 41, {
  identified: false,
  _gx: 0,
  _gy: 0,
});
const secretName = secret.name;
const secretBefore = snapshot(secret);
const hiddenTip = Items.tooltip(secret, player([secret]));
assert(hiddenTip.includes('Unidentified Grand Charm') && hiddenTip.includes('UNIDENTIFIED'));
for (const leak of [secretName, 'Requires Level', 'Value:', 'tt-stat'])
  assert.strictEqual(hiddenTip.includes(leak), false, `unidentified charm tooltip leaked ${leak}`);
assert.strictEqual(snapshot(secret), secretBefore, 'tooltip inspection is pure');
assert.strictEqual(Items.sellPrice(secret), 0, 'an unidentified charm cannot be appraised or sold');

const refused = charm('refused-charm', 'charm_small', 42, { _gx: 0, _gy: 0 });
pl = useWorld(player([refused]));
const beforeEquip = snapshot({ inv: pl.inv, equip: pl.equip });
Game.equipFromInv(refused.id);
assert.strictEqual(snapshot({ inv: pl.inv, equip: pl.equip }), beforeEquip,
  'inventory activation must never route a charm into hero equipment');

const mercBase = { archetypeId: 'ironwolf', level: 30, equipment: {} };
const mercWithCharm = { archetypeId: 'ironwolf', level: 30, equipment: { weapon: refused } };
assert.deepStrictEqual(plain(Ent.mercDerived(mercWithCharm)), plain(Ent.mercDerived(mercBase)),
  'a forged mercenary charm grants no mercenary stats');

const socketTarget = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
socketTarget.id = 'socket-target'; socketTarget.sockets = 1; socketTarget.gems = [null];
const gem = Items.makeGem('ruby', 'chipped'); gem.id = 'socket-gem';
pl.inv = [refused, socketTarget, gem]; pl.equip = emptyEquip();
assert.strictEqual(Game.insertSocket(refused.id, socketTarget.id).ok, false,
  'a charm cannot masquerade as a socket component');
assert.strictEqual(Game.insertSocket(gem.id, refused.id).ok, false,
  'a charm cannot accept a socket component');
assert.deepStrictEqual(plain(Condition.quote(refused)), {
  ok: false, id: refused.id, reason: 'not-durable', cost: 0,
}, 'charms never enter the repair catalog');

pl.inv = [refused]; pl.gold = 5000;
const beforeCube = snapshot(pl);
const cubePreview = Cube.preview(pl, [refused.id]);
assert.strictEqual(cubePreview.ok, false, 'no declared Cube recipe accepts a charm');
const cubeResult = Cube.transmute(pl, [refused.id], () => 0.5);
assert.strictEqual(cubeResult.ok, false);
assert.strictEqual(snapshot(pl), beforeCube, 'Cube refusal is fully atomic');

// -------------------------------------------------------------------------
// Corpse rules: carried charms stay carried; malformed corpse charms spill
// -------------------------------------------------------------------------

const carriedThroughDeath = charm('carried-through-death', 'charm_grand', 51, { _gx: 0, _gy: 0 });
const deathWeapon = Items.makeBaseItem(() => 0.5, Items.baseById('sword'), 0, 30, { skipQuality: true });
deathWeapon.id = 'death-weapon';
pl = useWorld(player([carriedThroughDeath])); pl.equip.weapon = deathWeapon;
const captured = CorpseState.capture(pl, { kind: 'town', town: 'Haven' });
assert.strictEqual(captured.ok, true);
assert.strictEqual(pl.inv.includes(carriedThroughDeath), true);
assert.strictEqual(captured.corpse.gear.some(entry => entry.item === carriedThroughDeath), false,
  'ordinary death captures equipment only, never carried charms');

const corpseCharm = charm('corpse-charm', 'charm_grand', 52, { _gx: undefined, _gy: undefined });
pl = useWorld(player());
pl.corpses = [{ id: 'malformed-charm-corpse', version: 1,
  gear: [{ slot: 'weapon', item: corpseCharm }], location: { kind: 'town' } }];
const recovered = CorpseState.recover(pl, 'malformed-charm-corpse');
assert.deepStrictEqual(plain(recovered), { ok: true, restored: 0, spilled: 1 });
assert.strictEqual(pl.equip.weapon, null, 'a corpse charm can never restore into an equipment slot');
assert.strictEqual(pl.inv[0], corpseCharm);
assert.deepStrictEqual([corpseCharm._gx, corpseCharm._gy], [0, 0]);
assert.deepStrictEqual(Array.from(Items.sizeOf(corpseCharm)), [1, 3]);

// -------------------------------------------------------------------------
// Pickup failure, stash/sale/drop sequencing, and save/load preservation
// -------------------------------------------------------------------------

const fullInventory = [];
for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++)
  fullInventory.push({ id: `full-${col}-${row}`, type: 'ring', slot: 'ring', rarity: 'common',
    name: 'Packed Ring', baseName: 'Packed Ring', stats: {}, _gx: col, _gy: row });
const blockedPickup = charm('blocked-pickup', 'charm_small', 53, { _gx: undefined, _gy: undefined });
pl = useWorld(player(fullInventory));
G.groundItems = [{ x: 2, y: 2, item: blockedPickup }];
const beforeBlocked = snapshot({ inv: pl.inv, ground: G.groundItems });
assert.strictEqual(Game.giveItem(blockedPickup), false);
assert.strictEqual(snapshot({ inv: pl.inv, ground: G.groundItems }), beforeBlocked,
  'failed pickup is mutation-free and cannot create a second ground alias');
assert.strictEqual(allTopLevelOccurrences(pl, G.stash, blockedPickup).length, 1);

// Every completed stash move persists both the character and shared stash, not
// just one side of the move.
const transfer = resourceCharm('transfer-charm', { _gx: 0, _gy: 0 });
pl = useWorld(player([transfer]));
Ent.refreshDerived(pl); pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
assert.strictEqual(Save.saveChar(pl), true);
assert.strictEqual(Save.saveStash(), true);
const deposited = Game.depositStashItem(transfer.id);
assert.strictEqual(deposited.ok, true, deposited.reason);
let savedChar = Save.loadChar(pl.name);
let savedStash = JSON.parse(storage.get(Save.STASH));
assert.strictEqual(savedChar.inv.some(item => item.id === transfer.id), false);
assert.strictEqual(savedStash.filter(item => item.id === transfer.id).length, 1);
assert.strictEqual(pl.hp, pl.derived.maxHp); assert.strictEqual(pl.mp, pl.derived.maxMp);

const hpBeforeTake = pl.hp, mpBeforeTake = pl.mp;
const taken = Game.takeStashItem(transfer.id);
assert.strictEqual(taken.ok, true, taken.reason);
savedChar = Save.loadChar(pl.name); savedStash = JSON.parse(storage.get(Save.STASH));
assert.strictEqual(savedChar.inv.filter(item => item.id === transfer.id).length, 1);
assert.strictEqual(savedStash.some(item => item.id === transfer.id), false);
assert.strictEqual(pl.hp, hpBeforeTake, 'taking a charm from stash does not heal');
assert.strictEqual(pl.mp, mpBeforeTake, 'taking a charm from stash does not refill mana');

// Selling removes the exact instance, persists gold/removal, and clamps both
// resources. This models the required commit order of the DOM vendor handler.
pl.hp = pl.derived.maxHp; pl.mp = pl.derived.maxMp;
const sale = Items.sellPrice(transfer), goldBeforeSale = pl.gold;
pl.inv.splice(pl.inv.indexOf(transfer), 1); pl.gold += sale;
Ent.refreshDerived(pl); Save.saveChar(pl);
savedChar = Save.loadChar(pl.name);
assert.strictEqual(savedChar.inv.some(item => item.id === transfer.id), false);
assert.strictEqual(savedChar.gold, goldBeforeSale + sale);
assert.strictEqual(pl.hp, pl.derived.maxHp); assert.strictEqual(pl.mp, pl.derived.maxMp);

// A world drop likewise removes the saved carried owner before adding one
// session-local ground owner. A later successful give keeps the same object and
// never heals from the newly restored maximum.
const dropped = resourceCharm('dropped-charm', { _gx: 0, _gy: 0 });
pl.inv.push(dropped); Ent.refreshDerived(pl);
pl.hp = pl.derived.maxHp - 3; pl.mp = pl.derived.maxMp - 4;
pl.inv.splice(pl.inv.indexOf(dropped), 1); G.groundItems.push({ x: 3, y: 3, item: dropped });
Ent.refreshDerived(pl); Save.saveChar(pl);
assert.strictEqual(Save.loadChar(pl.name).inv.some(item => item.id === dropped.id), false);
assert.strictEqual(allTopLevelOccurrences(pl, G.stash, dropped).length, 1);
const hpBeforePickup = pl.hp, mpBeforePickup = pl.mp;
assert.strictEqual(Game.giveItem(dropped), true);
G.groundItems.splice(G.groundItems.findIndex(entry => entry.item === dropped), 1);
assert.strictEqual(pl.inv.includes(dropped), true);
const droppedStats = charmStats(dropped);
const droppedMaxima = expectedMaxima(pl, base, droppedStats);
assert.strictEqual(pl.derived.maxHp, droppedMaxima.hp);
assert.strictEqual(pl.derived.maxMp, droppedMaxima.mp);
assert.strictEqual(pl.hp, hpBeforePickup, 'picking up a charm raises max life without healing');
assert.strictEqual(pl.mp, mpBeforePickup, 'picking up a charm raises max mana without refilling');
Save.saveChar(pl);

// Final round trip: identity, rolls, placement, identification, and activation
// all survive serialization and normalization without duplicating ownership.
const rawSaved = Save.loadChar(pl.name);
const savedDropped = rawSaved.inv.find(item => item.id === dropped.id);
assert(savedDropped, 'picked-up charm is persisted');
assert.strictEqual(savedDropped.kind, 'charm');
assert.strictEqual(savedDropped.type, 'charm_small');
assert.strictEqual(savedDropped.identified, true);
assert.deepStrictEqual([savedDropped._gx, savedDropped._gy], [dropped._gx, dropped._gy]);
assert.deepStrictEqual(plain(savedDropped.rolls), plain(dropped.rolls));
assert.deepStrictEqual(plain(InventoryCharms.statsOf(savedDropped)), plain(InventoryCharms.statsOf(dropped)));

const reloaded = player(rawSaved.inv);
Object.assign(reloaded, rawSaved, {
  cds: {}, buffs: [], dead: false, deadForever: false, x: 1, y: 1,
  hp: hpBeforePickup, mp: mpBeforePickup, _invMigrated: true,
});
useWorld(reloaded, savedStash);
Save.normalizeItems(reloaded, G.stash);
const reloadBase = baselineFor(reloaded), reloadDerived = derived(reloaded);
const reloadStats = charmStats(reloaded.inv.find(item => item.id === dropped.id));
const reloadMaxima = expectedMaxima(reloaded, reloadBase, reloadStats);
assert.strictEqual(reloadDerived.maxHp, reloadMaxima.hp);
assert.strictEqual(reloadDerived.maxMp, reloadMaxima.mp);
assert.strictEqual(allTopLevelOccurrences(reloaded, G.stash, dropped.id).length, 1);

// Cross-key storage failures are compensated back to the original owner. With
// either localStorage key failing, a transfer is rejected atomically and both
// live and durable state retain exactly one usable copy.
const depositDestinationFailure = resourceCharm('deposit-destination-failure', { _gx: 0, _gy: 0 });
pl = useWorld(player([depositDestinationFailure]));
Ent.refreshDerived(pl);
assert.strictEqual(Save.saveChar(pl), true); assert.strictEqual(Save.saveStash(), true);
failingStorageKey = Save.STASH;
let failedTransfer = Game.depositStashItem(depositDestinationFailure.id);
failingStorageKey = null;
assert.deepStrictEqual(plain(failedTransfer), { ok: false, reason: 'storage-failure', failedKey: 'stash' });
assert.strictEqual(pl.inv.filter(item => item === depositDestinationFailure).length, 1);
assert.strictEqual(G.stash.includes(depositDestinationFailure), false);
assert.strictEqual(Save.loadChar(pl.name).inv.filter(item => item.id === depositDestinationFailure.id).length, 1);
assert.strictEqual(JSON.parse(storage.get(Save.STASH)).some(item => item.id === depositDestinationFailure.id), false);

const depositSourceFailure = resourceCharm('deposit-source-failure', { _gx: 0, _gy: 0 });
pl = useWorld(player([depositSourceFailure]));
Ent.refreshDerived(pl);
assert.strictEqual(Save.saveChar(pl), true); assert.strictEqual(Save.saveStash(), true);
failingStorageKey = Save.CHARS;
failedTransfer = Game.depositStashItem(depositSourceFailure.id);
failingStorageKey = null;
assert.deepStrictEqual(plain(failedTransfer), {
  ok: false, reason: 'storage-failure', failedKey: 'character', durableDuplicate: false,
});
assert.strictEqual(pl.inv.filter(item => item === depositSourceFailure).length, 1);
assert.strictEqual(G.stash.includes(depositSourceFailure), false);
assert.strictEqual(Save.loadChar(pl.name).inv.filter(item => item.id === depositSourceFailure.id).length, 1);
assert.strictEqual(JSON.parse(storage.get(Save.STASH)).some(item => item.id === depositSourceFailure.id), false,
  'the compensating stash write removes the already-persisted destination copy');

const takeDestinationFailure = resourceCharm('take-destination-failure', { _gx: 0, _gy: 0 });
pl = useWorld(player(), [takeDestinationFailure]);
Ent.refreshDerived(pl);
assert.strictEqual(Save.saveChar(pl), true); assert.strictEqual(Save.saveStash(), true);
failingStorageKey = Save.CHARS;
failedTransfer = Game.takeStashItem(takeDestinationFailure.id);
failingStorageKey = null;
assert.deepStrictEqual(plain(failedTransfer), { ok: false, reason: 'storage-failure', failedKey: 'character' });
assert.strictEqual(pl.inv.includes(takeDestinationFailure), false);
assert.strictEqual(G.stash.filter(item => item === takeDestinationFailure).length, 1);
assert.strictEqual(Save.loadChar(pl.name).inv.some(item => item.id === takeDestinationFailure.id), false);
assert.strictEqual(JSON.parse(storage.get(Save.STASH)).filter(item => item.id === takeDestinationFailure.id).length, 1);

const takeSourceFailure = resourceCharm('take-source-failure', { _gx: 0, _gy: 0 });
pl = useWorld(player(), [takeSourceFailure]);
Ent.refreshDerived(pl);
assert.strictEqual(Save.saveChar(pl), true); assert.strictEqual(Save.saveStash(), true);
failingStorageKey = Save.STASH;
failedTransfer = Game.takeStashItem(takeSourceFailure.id);
failingStorageKey = null;
assert.deepStrictEqual(plain(failedTransfer), {
  ok: false, reason: 'storage-failure', failedKey: 'stash', durableDuplicate: false,
});
assert.strictEqual(pl.inv.includes(takeSourceFailure), false);
assert.strictEqual(G.stash.filter(item => item === takeSourceFailure).length, 1);
assert.strictEqual(Save.loadChar(pl.name).inv.some(item => item.id === takeSourceFailure.id), false,
  'the compensating character write removes the already-persisted destination copy');
assert.strictEqual(JSON.parse(storage.get(Save.STASH)).filter(item => item.id === takeSourceFailure.id).length, 1);

console.log('inventory charms runtime contract: ok');
