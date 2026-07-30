'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8') + '\nglobalThis.makeRng = makeRng;', sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + `
  globalThis.RUNES=RUNES; globalThis.RUNE_BY_NAME=RUNE_BY_NAME; globalThis.RUNEWORDS=RUNEWORDS;
  globalThis.GEM_TYPES=GEM_TYPES; globalThis.GEM_QUALITIES=GEM_QUALITIES;
  globalThis.GEM_QUALITY_MULT=GEM_QUALITY_MULT; globalThis.GEM_BASE_VAL=GEM_BASE_VAL;
  globalThis.TIER_LVLS=TIER_LVLS; globalThis.WEAPON_TYPES=WEAPON_TYPES;
  globalThis.ARMOR_TYPES=ARMOR_TYPES; globalThis.JEWELRY_TYPES=JEWELRY_TYPES;
  globalThis.PREFIXES=PREFIXES; globalThis.SUFFIXES=SUFFIXES; globalThis.ITEM_QUALITY=ITEM_QUALITY;
  globalThis.ETHEREAL_CHANCE=ETHEREAL_CHANCE; globalThis.ETHEREAL_WEAPON_MULT=ETHEREAL_WEAPON_MULT;
  globalThis.ETHEREAL_ARMOR_MULT=ETHEREAL_ARMOR_MULT; globalThis.ETHEREAL_PRICE_MULT=ETHEREAL_PRICE_MULT;
  globalThis.SETS=SETS; globalThis.UNIQUES=UNIQUES; globalThis.MAX_LVL=MAX_LVL;
  globalThis.GAMBLE_CFG=GAMBLE_CFG; globalThis.runewordForBase=runewordForBase;
  globalThis.CLASSES=CLASSES; globalThis.SKILL_BY_ID=SKILL_BY_ID; globalThis.MERCENARY_BY_ID=MERCENARY_BY_ID;`, sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/items.js'), 'utf8') + '\nglobalThis.Items=Items;', sandbox);
sandbox.difficultyByIdx = () => ({ resPenalty: 0 });
vm.runInContext(fs.readFileSync(path.join(root, 'js/entities.js'), 'utf8') + '\nglobalThis.Ent=Ent;', sandbox);

const { Items, Ent } = sandbox;
const plain = value => JSON.parse(JSON.stringify(value));
const base = (type, slot, sockets, rarity = 'common') => ({ type, slot, sockets, rarity, gems: Array(sockets).fill(null), stats: {} });
const seq = values => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

const ruby = Items.makeGem('ruby', 'perfect');
assert.deepStrictEqual(plain(Items.sizeOf(ruby)), [1, 1]);
assert.strictEqual(ruby.component, true);
assert.strictEqual(ruby.rarity, 'magic');
assert(ruby.color && ruby.value > 0 && /weapons/i.test(ruby.description));
assert.match(Items.tooltip(ruby), /Socket Component/);
assert(Number.isFinite(Items.price(ruby)) && Number.isFinite(Items.sellPrice(ruby)), 'component economy values stay finite');
const normalized = { kind: 'gem', gemType: 'sapphire', quality: 'flawed', id: 'saved-component' };
assert.strictEqual(Items.normalizeComponent(normalized), normalized);
assert.strictEqual(normalized.id, 'saved-component');
assert.strictEqual(normalized.component, true);
assert(normalized.description && normalized.price > 0, 'saved and Cube components hydrate to production records');
assert.strictEqual(Items.componentRecord({ kind: 'rune', name: 'El', ord: 999 }), null, 'mismatched rune ordinals are rejected');

const sword = base('sword', 'weapon', 1);
assert.strictEqual(Items.insertSocket(sword, ruby, 1), true);
assert.deepStrictEqual(plain(Items.socketStats(sword)), { fireDmg: 8 });
const armor = base('chest', 'chest', 1);
assert.strictEqual(Items.insertSocket(armor, Items.makeGem('ruby', 'perfect'), 1), true);
assert.deepStrictEqual(plain(Items.socketStats(armor)), { fireRes: 8 });

const highRune = Items.makeRune('Zod'), runeTarget = base('sword', 'weapon', 1);
const beforeLevelFail = JSON.stringify(runeTarget);
assert.strictEqual(Items.insertSocket(runeTarget, highRune, 68), false);
assert.strictEqual(JSON.stringify(runeTarget), beforeLevelFail, 'level failure is atomic');
const full = base('sword', 'weapon', 1); full.gems[0] = ruby;
const beforeFull = JSON.stringify(full);
assert.strictEqual(Items.insertSocket(full, Items.makeRune('El'), 99), false);
assert.strictEqual(JSON.stringify(full), beforeFull, 'capacity failure is atomic');

const steel = base('sword', 'weapon', 2);
steel.gems = [Items.makeRune('Tir'), Items.makeRune('El')];
assert.strictEqual(Items.applyRuneword(steel).id, 'steel');
const once = plain(Items.socketStats(steel));
assert.strictEqual(once.dmgPct, 37.8, 'individual runes and word overlay are both present once');
assert.strictEqual(once.ar, 50);
assert.strictEqual(steel.stats.dmgPct, undefined, 'new overlay never mutates base stats');
assert.deepStrictEqual(plain(Items.socketStats(steel)), once, 'reconciliation is idempotent');
assert.match(Items.tooltip(steel), /Socket Bonus/, 'separated socket stats remain visible in equipment tooltips');

const wrong = base('sword', 'weapon', 2); wrong.gems = [Items.makeRune('El'), Items.makeRune('Tir')];
assert.strictEqual(Items.applyRuneword(wrong), null, 'rune order is exact');
const rare = base('sword', 'weapon', 2, 'rare'); rare.gems = [Items.makeRune('Tir'), Items.makeRune('El')];
assert.strictEqual(Items.applyRuneword(rare), null, 'Runewords require a common base');

const legacy = base('sword', 'weapon', 2); legacy.gems = [Items.makeRune('Tir'), Items.makeRune('El')];
legacy.runeword = 'steel'; legacy.runewordName = 'Steel'; legacy.stats = { dmgPct: 30, ar: 52, regenHp: 1.5 };
Items.applyRuneword(legacy);
assert.deepStrictEqual(plain(legacy.stats), { dmgPct: 5, ar: 2 }, 'legacy overlay migrates exactly once');
Items.applyRuneword(legacy);
assert.deepStrictEqual(plain(legacy.stats), { dmgPct: 5, ar: 2 });

const lowRoll = Items.rollComponent(1, 0, seq([0.9, 0, 0.99]));
assert.strictEqual(lowRoll.kind, 'gem'); assert.strictEqual(lowRoll.quality, 'chipped');
const runeRoll = Items.rollComponent(11, 0, seq([0, 0.99]));
assert.strictEqual(runeRoll.name, 'El');
assert(runeRoll.reqLvl <= 11, 'rolls cannot exceed the ilvl rune gate');

const cls = sandbox.CLASSES[0];
const player = { cls: cls.id, lvl: 1, difficultyIdx: 0, stats: {}, skills: {}, buffs: [],
  equip: { weapon: steel, offhand: null }, derived: null };
const derived = Ent.computeDerived(player);
const expectedPhys = 1 + cls.base[cls.dmgStat] * .013 + once.dmgPct / 100;
assert(Math.abs(derived.physMult - expectedPhys) < 1e-9, 'hero receives socket overlay exactly once');

const mercDef = sandbox.MERCENARY_BY_ID[Object.keys(sandbox.MERCENARY_BY_ID)[0]];
const pledge = base('shield', 'offhand', 3);
pledge.gems = [Items.makeRune('Ral'), Items.makeRune('Ort'), Items.makeRune('Tal')];
const pledgeStats = Items.socketStats(pledge);
const merc = Ent.mercDerived({ archetypeId: mercDef.id, level: 1, equipment: { armor: pledge } });
assert.strictEqual(merc.resist, Math.min(pledgeStats.allRes / 100, .65), 'merc receives socket overlay exactly once');

console.log('socket contract: ok');
