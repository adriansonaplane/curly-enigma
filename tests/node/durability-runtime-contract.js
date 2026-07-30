'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8') + '\nglobalThis.makeRng = makeRng; globalThis.U = U;', sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + `
  globalThis.CLASSES=CLASSES; globalThis.SKILL_BY_ID=SKILL_BY_ID;
  globalThis.MERCENARY_BY_ID=MERCENARY_BY_ID; globalThis.SETS=SETS;
  globalThis.TIER_LVLS=TIER_LVLS; globalThis.WEAPON_TYPES=WEAPON_TYPES;
  globalThis.ARMOR_TYPES=ARMOR_TYPES; globalThis.JEWELRY_TYPES=JEWELRY_TYPES;
  globalThis.PREFIXES=PREFIXES; globalThis.SUFFIXES=SUFFIXES; globalThis.ITEM_QUALITY=ITEM_QUALITY;
  globalThis.ETHEREAL_CHANCE=ETHEREAL_CHANCE; globalThis.ETHEREAL_WEAPON_MULT=ETHEREAL_WEAPON_MULT;
  globalThis.ETHEREAL_ARMOR_MULT=ETHEREAL_ARMOR_MULT; globalThis.ETHEREAL_PRICE_MULT=ETHEREAL_PRICE_MULT;
  globalThis.UNIQUES=UNIQUES; globalThis.MAX_LVL=MAX_LVL; globalThis.GAMBLE_CFG=GAMBLE_CFG;
  globalThis.RUNES=RUNES; globalThis.RUNE_BY_NAME=RUNE_BY_NAME; globalThis.RUNEWORDS=RUNEWORDS;
  globalThis.GEM_TYPES=GEM_TYPES; globalThis.GEM_QUALITIES=GEM_QUALITIES;
  globalThis.GEM_QUALITY_MULT=GEM_QUALITY_MULT; globalThis.GEM_BASE_VAL=GEM_BASE_VAL;
  globalThis.runewordForBase=runewordForBase; globalThis.ELEM=ELEM;`, sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/items.js'), 'utf8') + '\nglobalThis.Items=Items;', sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/item-condition.js'), 'utf8'), sandbox);
sandbox.difficultyByIdx = () => ({ resPenalty: 0 });
vm.runInContext(fs.readFileSync(path.join(root, 'js/entities.js'), 'utf8') + '\nglobalThis.Ent=Ent;', sandbox);

const { Items, ItemCondition: C, Ent } = sandbox;
const rng = () => 0.5;
let notices = 0;
sandbox.UI = { announce: () => { notices++; }, dmgNum: () => {} };
sandbox.FX = { slash: () => {} };
sandbox.sfx = () => {};
sandbox.Physics = { impulse: () => {}, burst: () => {} };

const make = type => {
  const base = Items.baseById(type);
  return Items.makeBaseItem(rng, base, 0, 1, { skipQuality: true });
};
const cls = sandbox.CLASSES[0];
const weapon = make('sword'), helm = make('helm'), chest = make('chest'), shield = make('shield');
weapon.stats = { str: 10, dmgFlat: 7 };
weapon.sockets = 1;
weapon.gems = [Items.makeGem('ruby', 'perfect')];
helm.stats = {};
chest.stats = {};
shield.stats = {};

// A broken item contributes no direct, socket, base, set, speed, mode, block,
// or mercenary value, but remains in its original equipment slot.
sandbox.SETS.push({ id: '__condition_test', pieces: [{}, {}], bonuses: { 2: { hp: 99 } } });
helm.setId = chest.setId = '__condition_test';
const pl = {
  cls: cls.id, lvl: 1, difficultyIdx: 0, stats: {}, skills: {}, buffs: [],
  equip: { weapon, helm, chest, offhand: shield }, hp: 999, mp: 999,
  gcd: 0, cds: {}, x: 5, y: 5, dir: 0, attackT: 0,
};
let full = Ent.computeDerived(pl);
assert.strictEqual(full.str, cls.base.str + 10);
assert.strictEqual(full.flatElem.fire, 8);
assert(full.maxHp >= 99 + 50, 'two intact set pieces activate the test bonus');
assert(full.blockChance > 0);
const fullRate = full.atkRate;

weapon.durability = 0;
chest.durability = 0;
const broken = Ent.computeDerived(pl);
assert.strictEqual(pl.equip.weapon, weapon, 'broken weapon remains equipped');
assert.strictEqual(broken.str, cls.base.str);
assert.strictEqual(broken.flatElem.fire, 0);
assert.deepStrictEqual(Array.from(Ent.weaponDmg(pl)), [1, 3]);
assert.notStrictEqual(broken.atkRate, fullRate);
assert(broken.maxHp < full.maxHp - 90, 'broken set piece no longer counts toward the set bonus');

const mercDef = sandbox.MERCENARY_BY_ID[Object.keys(sandbox.MERCENARY_BY_ID)[0]];
const mercWeapon = make('axe');
mercWeapon.stats = { vit: 20, dmgFlat: 50 };
const mercFull = Ent.mercDerived({ archetypeId: mercDef.id, level: 1, equipment: { weapon: mercWeapon } });
mercWeapon.durability = 0;
const mercBroken = Ent.mercDerived({ archetypeId: mercDef.id, level: 1, equipment: { weapon: mercWeapon } });
assert(mercBroken.maxHp < mercFull.maxHp);
assert(mercBroken.dmgHi < mercFull.dmgHi);

// One landed mult-target action wears exactly once. An action with no landed
// target wears zero, and the >0 -> 0 transition announces exactly once.
weapon.durability = 2;
chest.durability = chest.maxDurability;
Ent.computeDerived(pl);
sandbox.G = {
  player: pl, map: { town: false, mlvl: 1 }, shake: 0, projs: [],
  monsters: [
    { x: 6, y: 5, size: 1, ally: false, dead: false, defense: 0, hp: 100, stunT: 0 },
    { x: 6, y: 5.1, size: 1, ally: false, dead: false, defense: 0, hp: 100, stunT: 0 },
  ],
  onPlayerDeath: () => {},
};
Ent.damageMonster = () => 1;
const originalRand = sandbox.U.rand;
sandbox.U.rand = () => 0;
Ent.basicAttack(pl, 6, 5);
assert.strictEqual(weapon.durability, 1, 'multiple landed targets share one wear token');
pl.gcd = 0;
sandbox.G.monsters = [];
Ent.basicAttack(pl, 20, 20);
assert.strictEqual(weapon.durability, 1, 'an attack with no landed target does not wear');
pl.gcd = 0;
sandbox.G.monsters = [{ x: 6, y: 5, size: 1, ally: false, dead: false, defense: 0, hp: 100, stunT: 0 }];
Ent.basicAttack(pl, 6, 5);
assert.strictEqual(weapon.durability, 0);
assert.strictEqual(notices, 1, 'breaking announces once');

// A projectile/action token snapshots the original weapon and is idempotent,
// so swapping equipment before impact never wears its replacement.
const original = make('bow'), replacement = make('bow');
pl.equip.weapon = original;
Ent.computeDerived(pl);
const token = Ent.weaponUse(pl);
pl.equip.weapon = replacement;
Ent.consumeWeaponUse(token);
Ent.consumeWeaponUse(token);
assert.strictEqual(original.durability, original.maxDurability - 1);
assert.strictEqual(replacement.durability, replacement.maxDurability);

// Physical blocks wear only the offhand once; accepted physical hits wear one
// deterministic rotating armor piece rather than every slot.
pl.equip = { weapon: replacement, helm, chest, offhand: shield };
helm.durability = helm.maxDurability;
chest.durability = chest.maxDurability;
shield.durability = shield.maxDurability;
pl.hp = 500; pl.mp = 100; pl.blockCd = 0; pl.conditionWearCursor = 0;
Ent.computeDerived(pl);
pl.derived.blockChance = 100;
const beforeBlockHp = pl.hp;
Ent.damagePlayer(25, 'phys', null);
assert.strictEqual(pl.hp, beforeBlockHp);
assert.strictEqual(shield.durability, shield.maxDurability - 1);
assert.strictEqual(helm.durability, helm.maxDurability);
pl.blockCd = 0;
pl.derived.blockChance = 0;
Ent.damagePlayer(25, 'phys', null);
assert(pl.hp < beforeBlockHp);
assert.strictEqual(helm.durability, helm.maxDurability - 1);
assert.strictEqual(chest.durability, chest.maxDurability);
sandbox.U.rand = originalRand;

console.log('durability runtime contract: ok');
