'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const sandbox = { console, setTimeout: () => {}, localStorage: { getItem: () => null, setItem: () => {} } };
sandbox.globalThis = sandbox;
sandbox.window = { addEventListener: () => {} };
sandbox.DifficultyState = { capture: () => {}, migrate: x => x, activate: () => {} };
sandbox.Dialogue = sandbox.Lore = sandbox.Narrative = sandbox.Factions = { migrate: x => x };
sandbox.MERCENARY_BY_ID = {};
sandbox.SEASON = { current: () => ({ num: 1 }) };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + `
  globalThis.RUNES=RUNES; globalThis.RUNE_BY_NAME=RUNE_BY_NAME; globalThis.RUNEWORDS=RUNEWORDS;
  globalThis.GEM_TYPES=GEM_TYPES; globalThis.GEM_QUALITIES=GEM_QUALITIES; globalThis.GEM_QUALITY_MULT=GEM_QUALITY_MULT;
  globalThis.GEM_BASE_VAL=GEM_BASE_VAL; globalThis.TIER_LVLS=TIER_LVLS; globalThis.WEAPON_TYPES=WEAPON_TYPES;
  globalThis.ARMOR_TYPES=ARMOR_TYPES; globalThis.JEWELRY_TYPES=JEWELRY_TYPES; globalThis.PREFIXES=PREFIXES;
  globalThis.SUFFIXES=SUFFIXES; globalThis.ITEM_QUALITY=ITEM_QUALITY; globalThis.ETHEREAL_CHANCE=ETHEREAL_CHANCE;
  globalThis.ETHEREAL_WEAPON_MULT=ETHEREAL_WEAPON_MULT; globalThis.ETHEREAL_ARMOR_MULT=ETHEREAL_ARMOR_MULT;
  globalThis.ETHEREAL_PRICE_MULT=ETHEREAL_PRICE_MULT; globalThis.SETS=SETS; globalThis.UNIQUES=UNIQUES;
  globalThis.MAX_LVL=MAX_LVL; globalThis.GAMBLE_CFG=GAMBLE_CFG; globalThis.runewordForBase=runewordForBase;
`, sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/items.js'), 'utf8') + '\nglobalThis.Items=Items;', sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/item-condition.js'), 'utf8'), sandbox);
sandbox.UI = { inventoryGrid: { removeItem: (it, inv) => inv.splice(inv.indexOf(it), 1) }, announce: () => {} };
sandbox.Ent = {
  computeDerived: pl => { pl.derived = { maxHp: 100, maxMp: 50 }; return pl.derived; },
  refreshDerived: pl => {
    const hp = Number(pl.hp), mp = Number(pl.mp);
    const derived = sandbox.Ent.computeDerived(pl);
    pl.hp = Number.isFinite(hp) ? Math.min(Math.max(0, hp), derived.maxHp) : derived.maxHp;
    pl.mp = Number.isFinite(mp) ? Math.min(Math.max(0, mp), derived.maxMp) : derived.maxMp;
    return derived;
  },
};
sandbox.sfx = () => {};
vm.runInContext(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8') + '\nglobalThis.RuntimeSave=Save; globalThis.RuntimeGame=Game; globalThis.RuntimeG=G;', sandbox);

const { Items, RuntimeSave: Save, RuntimeGame: Game, RuntimeG: G } = sandbox;
const socketTir = { id: 'same', type: 'rune', name: 'Tir', durability: 77 };
const steel = { id: 'weapon', type: 'sword', tier: 0, slot: 'weapon', rarity: 'common', sockets: 2,
  gems: [socketTir, { id: 'same', kind: 'rune', name: 'El' }],
  stats: { dmgPct: 33, ar: 50, regenHp: 0.5 }, runeword: 'steel' };
const topGem = { id: 'same', kind: 'gem', gemType: 'ruby', quality: 'perfect', durability: 66 };
const stashRune = { id: 'same', kind: 'rune', name: 'El' };
const malformedTop = { id: 'bad-top', kind: 'gem', gemType: 'not-a-gem', quality: 'chipped' };
const malformedStash = { id: 'bad-stash', kind: 'rune', name: 'DefinitelyNotARune' };
const invHelm = { id: 'inv-helm', type: 'helm', tier: 1, slot: 'helm', gems: [], stats: {} };
const mercChest = { id: 'merc-chest', type: 'chest', tier: 2, slot: 'chest', gems: [], stats: {}, durability: 2 };
const corpseShield = { id: 'corpse-shield', type: 'shield', tier: 0, slot: 'offhand', gems: [], stats: {} };
const stashStaff = { id: 'stash-staff', type: 'staff', tier: 3, slot: 'weapon', gems: [], stats: {} };
const player = { equip: { weapon: steel }, inv: [topGem, invHelm, malformedTop], mercenary: { equipment: { chest: mercChest } },
  corpses: [{ id: 'corpse', gear: [{ slot: 'offhand', item: corpseShield }] }] };
G.stash = [stashRune, stashStaff, malformedStash];
Save.normalizeItems(player, G.stash);
const ids = [steel.id, ...steel.gems.map(x => x.id), topGem.id, stashRune.id];
assert.strictEqual(new Set(ids).size, ids.length, 'every top-level and nested item gets a unique stable id');
assert(steel.gems.every(x => x.component && x.reqLvl !== undefined && x.width === 1), 'nested components are hydrated');
assert(topGem.component && topGem.weaponEffect, 'top-level components are hydrated');
assert.strictEqual(socketTir.durability, 77, 'socket fillers are never condition-normalized');
assert.strictEqual(topGem.durability, 66, 'standalone components are never condition-normalized');
for (const durable of [steel, invHelm, corpseShield, stashStaff])
  assert.strictEqual(durable.durability, durable.maxDurability, 'legacy top-level gear starts at full durability');
assert.strictEqual(mercChest.durability, 2, 'existing finite durability survives save normalization');
assert(!player.inv.includes(malformedTop) && !G.stash.includes(malformedStash), 'malformed standalone components are discarded');
assert.strictEqual(steel.runeword, 'steel');
assert.deepStrictEqual(JSON.parse(JSON.stringify(steel.stats)), { dmgPct: 8, regenHp: -1 }, 'legacy runeword overlay is removed once');
const saved = JSON.stringify(player);
Save.normalizeItems(player, G.stash);
assert.strictEqual(JSON.stringify(player), saved, 'migration is idempotent');

const generatedBase = Items.makeBaseItem(() => 0.5, sandbox.WEAPON_TYPES[0], 0, 1);
const generatedUnique = Items.makeUnique(() => 0.5, sandbox.UNIQUES[0]);
const generatedSet = Items.makeSetPiece(() => 0.5, sandbox.SETS[0], sandbox.SETS[0].pieces[0]);
for (const generated of [generatedBase, generatedUnique, generatedSet])
  assert(generated.maxDurability > 0 && generated.durability === generated.maxDurability, 'durable factory returns are canonicalized');
const brokenTip = Items.tooltip(Object.assign({}, generatedBase, { durability: 0 }), { lvl: 99, equip: {} });
assert(brokenTip.includes('Durability: 0 of ') && brokenTip.includes('BROKEN') && brokenTip.includes('grants no bonuses'),
  'broken tooltip explains condition and disabled bonuses');

const component = Items.makeRune('El'); component.id = 'component';
const target = { id: 'target', type: 'sword', slot: 'weapon', rarity: 'common', name: 'Sword', sockets: 1, gems: [null], stats: {} };
G.player = { name: 'Tester', lvl: 99, hp: 100, inv: [component], equip: { weapon: target }, mercenary: null };
const inserted = Game.insertSocket('component', 'target');
assert.strictEqual(inserted.ok, true, inserted.reason);
assert.strictEqual(G.player.inv.length, 0);
assert.strictEqual(target.gems[0], component);
const failed = Game.insertSocket('missing', 'target');
assert.strictEqual(failed.ok, false, 'invalid socket transactions do not mutate inventory');
const zod = Items.makeRune('Zod'); zod.id = 'zod';
const lowTarget = { id: 'low-target', type: 'sword', slot: 'weapon', rarity: 'common', name: 'Low Sword', sockets: 1, gems: [null], stats: {} };
G.player = { name: 'Novice', lvl: 1, hp: 100, inv: [zod, lowTarget], equip: {}, mercenary: null };
const beforeLevelFailure = JSON.stringify(G.player);
assert.strictEqual(Game.insertSocket('zod', 'low-target').ok, false);
assert.strictEqual(JSON.stringify(G.player), beforeLevelFailure, 'level-gated socket failure is fully atomic');

const a = Items.rollComponent(1, 0, () => 0.99);
const b = Items.rollComponent(1, 0, () => 0.99);
assert.deepStrictEqual(JSON.parse(JSON.stringify(Items.componentRecord(a))), JSON.parse(JSON.stringify(Items.componentRecord(b))), 'component drops are deterministic for a supplied RNG');
console.log('itemization runtime contract: ok');
