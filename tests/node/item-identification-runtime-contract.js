'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const storage = new Map();
const sandbox = {
  console,
  Date,
  setTimeout: () => 0,
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
};
sandbox.globalThis = sandbox;
sandbox.window = { addEventListener: () => {} };
sandbox.DifficultyState = { capture: () => {}, migrate: value => value, activate: () => {} };
sandbox.QuestState = { create: () => ({}), migrate: value => value || {} };
sandbox.Dialogue = sandbox.Lore = sandbox.Narrative = sandbox.Factions = { migrate: value => value };
sandbox.SEASON = { current: () => ({ num: 1 }) };
sandbox.UI = {
  inventoryGrid: { removeItem: (item, inventory) => inventory.splice(inventory.indexOf(item), 1) },
  announce: () => {},
};
sandbox.sfx = () => {};

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
  globalThis.CUBE_RECIPES=CUBE_RECIPES;
`);
load('js/item-identification.js');
load('js/items.js', '\nglobalThis.Items=Items;');
load('js/item-condition.js');
load('js/cube.js');
load('js/corpse-state.js');
load('js/entities.js', '\nglobalThis.Ent=Ent;');
load('js/main.js', '\nglobalThis.RuntimeSave=Save; globalThis.RuntimeGame=Game; globalThis.RuntimeG=G;');

const {
  ItemIdentification: Identification,
  ItemCondition: Condition,
  Items,
  Cube,
  CorpseState,
  Ent,
  RuntimeSave: Save,
  RuntimeG: G,
} = sandbox;
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = value => JSON.stringify(value);
const rng = () => 0.5;

// Direct factories and vendor/gamble-style generation are identified by
// default. The world-drop option is the only route that veils eligible gear,
// including Unique/Set generator early returns.
const defaultGenerated = Items.generate(60, { classId: sandbox.CLASSES[0].id });
assert.strictEqual(Identification.isIdentified(defaultGenerated), true);
for (const rarity of ['magic', 'rare', 'set', 'unique']) {
  const vendorItem = Items.generate(60, { forceRarity: rarity, forceType: 'sword', classId: sandbox.CLASSES[0].id });
  assert.strictEqual(vendorItem.rarity, rarity);
  assert.strictEqual(vendorItem.identified, true, `${rarity} vendor generation must stay identified`);
  assert.strictEqual(Items.needsIdentification(vendorItem), false);

  const worldItem = Items.generate(60, {
    forceRarity: rarity,
    forceType: 'sword',
    classId: sandbox.CLASSES[0].id,
    unidentified: true,
  });
  assert.strictEqual(worldItem.rarity, rarity);
  assert.strictEqual(worldItem.identified, false, `${rarity} world generation must be veiled`);
  assert.strictEqual(Items.needsIdentification(worldItem), true);
  assert.strictEqual(Items.displayName(worldItem), `Unidentified ${worldItem.baseName}`);
}

const directBase = Items.makeBaseItem(rng, sandbox.WEAPON_TYPES[0], 0, 1, { skipQuality: true });
const directUnique = Items.makeUnique(rng, sandbox.UNIQUES[0]);
const directSet = Items.makeSetPiece(rng, sandbox.SETS[0], sandbox.SETS[0].pieces[0]);
for (const item of [directBase, directUnique, directSet]) {
  assert.strictEqual(Identification.isIdentified(item), true);
  assert.strictEqual(item.identified, true, 'direct factories must canonicalize identification state');
}

const commonDrop = Items.generate(60, { forceRarity: 'common', forceType: 'sword', unidentified: true });
const gem = Items.makeGem('ruby', 'chipped');
const rune = Items.makeRune('El');
const scroll = Items.makeIdentifyScroll();
assert.strictEqual(commonDrop.identified, true, 'common drops are never veiled');
for (const item of [commonDrop, gem, rune, scroll]) {
  assert.strictEqual(Identification.isIdentified(item), true);
  assert.strictEqual(Items.needsIdentification(item), false);
}
assert.strictEqual(Items.isIdentifyScroll(scroll), true);
assert.deepStrictEqual([scroll.width, scroll.height, scroll.socketable], [1, 1, false]);
assert.strictEqual(scroll.component, undefined, 'identification scrolls must not enter component normalization/socketing');

// Every public inspection or commerce surface remains non-oracular. The base
// type may be shown, while rolls, exact value, requirements, sockets, condition,
// quality, flavor, and true identity remain concealed.
const hidden = {
  id: 'hidden-secret', type: 'sword', slot: 'weapon', tier: 1, ilvl: 40,
  baseName: 'Broadsword', name: 'ABSOLUTE SECRET NAME', rarity: 'unique', identified: false,
  flavor: 'ABSOLUTE SECRET FLAVOR', stats: { str: 9876 }, dmg: [4321, 9876], spd: 0.91,
  reqLvl: 77, price: 987654, ethereal: true, quality: 'superior',
  sockets: 2, gems: [rune, null], durability: 3, maxDurability: 66,
};
const beforeInspection = snapshot(hidden);
const tooltip = Items.tooltip(hidden, { lvl: 99, equip: {} });
assert(tooltip.includes('Unidentified Broadsword') && tooltip.includes('UNIDENTIFIED'));
for (const secret of [
  'ABSOLUTE SECRET NAME', 'ABSOLUTE SECRET FLAVOR', '9876', '4321', '77', '987654',
  'Durability:', 'Sockets (', 'Ethereal', 'Superior Quality',
]) assert.strictEqual(tooltip.includes(secret), false, `tooltip leaked ${secret}`);
const comparison = Items.compareTooltip(hidden, { lvl: 99, equip: {} });
assert(comparison.includes('COMPARISON LOCKED'));
assert.strictEqual(comparison.includes('ABSOLUTE SECRET NAME'), false);
assert.strictEqual(Items.sellPrice(hidden), 0, 'unidentified equipment cannot be sold or appraised');
const repairQuote = Condition.quote(hidden);
assert.deepStrictEqual(plain(repairQuote), { ok: false, id: hidden.id, reason: 'unidentified', cost: 0 });
assert.strictEqual(JSON.stringify(repairQuote).includes('ABSOLUTE SECRET'), false);
assert.strictEqual(Items.insertSocket(hidden, gem, 99), false, 'socket insertion rejects veiled equipment');
assert.strictEqual(snapshot(hidden), beforeInspection, 'inspection and rejected item actions are pure');

// The Cube gates a veiled input before matching or naming any recipe and both
// preview and transmute leave inventory, gold, and the hidden record untouched.
const cubeHidden = {
  id: 'cube-hidden', type: 'sword', slot: 'weapon', tier: 0, ilvl: 40,
  baseName: 'Short Sword', name: 'SECRET CUBE RARE', rarity: 'rare', identified: false,
  stats: { dmgPct: 999 }, reqLvl: 1, price: 88888, sockets: 0, gems: [],
};
const cubePlayer = { inv: [cubeHidden], gold: 99999 };
const beforeCube = snapshot(cubePlayer);
const cubePreview = Cube.preview(cubePlayer, [cubeHidden.id]);
assert.deepStrictEqual(plain(cubePreview), {
  ok: false,
  recipeId: null,
  cost: 0,
  outputs: [],
  reason: 'Identify every concealed input before transmutation.',
});
assert.strictEqual(JSON.stringify(cubePreview).includes('SECRET CUBE RARE'), false);
const cubeResult = Cube.transmute(cubePlayer, [cubeHidden.id], rng);
assert.strictEqual(cubeResult.ok, false);
assert.strictEqual(cubeResult.reason, cubePreview.reason);
assert.strictEqual(snapshot(cubePlayer), beforeCube);

// A malicious/legacy save cannot gain hero, socket, set, weapon, block, or
// mercenary contributions from equipment whose explicit state is unidentified.
const cls = sandbox.CLASSES[0];
const setId = sandbox.SETS[0].id;
const hiddenWeapon = {
  id: 'inactive-weapon', type: 'sword', slot: 'weapon', tier: 1, rarity: 'set', identified: false,
  baseName: 'Broadsword', name: 'Hidden Weapon', stats: { str: 500, hp: 700, fireDmg: 900 },
  dmg: [500, 900], spd: 3, setId, sockets: 1, gems: [Items.makeGem('ruby', 'perfect')],
};
const hiddenHelm = {
  id: 'inactive-helm', type: 'helm', slot: 'helm', tier: 1, rarity: 'set', identified: false,
  baseName: 'Full Helm', name: 'Hidden Helm', stats: { vit: 400 }, armor: 800, setId, sockets: 0, gems: [],
};
const hero = equipment => ({
  cls: cls.id, lvl: 12, difficultyIdx: 0, stats: {}, skills: {}, buffs: [],
  equip: equipment, hp: 100, mp: 50,
});
const baselineHero = hero({});
const veiledHero = hero({ weapon: hiddenWeapon, helm: hiddenHelm });
const baselineDerived = plain(Ent.computeDerived(baselineHero));
const veiledDerived = plain(Ent.computeDerived(veiledHero));
assert.deepStrictEqual(veiledDerived, baselineDerived, 'unidentified hero equipment must contribute nothing');
assert.strictEqual(Ent.activeWeapon(veiledHero), null);
assert.deepStrictEqual(Array.from(Ent.weaponDmg(veiledHero)), [1, 3]);

const mercBase = { archetypeId: 'ironwolf', level: 12, equipment: {} };
const mercHidden = {
  id: 'inactive-merc', type: 'sword', slot: 'weapon', tier: 1, rarity: 'unique', identified: false,
  baseName: 'Broadsword', name: 'Hidden Mercenary Weapon', stats: { hp: 900, vit: 400, dmgFlat: 700 },
  dmg: [600, 800], armor: 1000, sockets: 0, gems: [],
};
assert.deepStrictEqual(
  plain(Ent.mercDerived({ archetypeId: 'ironwolf', level: 12, equipment: { weapon: mercHidden } })),
  plain(Ent.mercDerived(mercBase)),
  'unidentified mercenary equipment must contribute nothing',
);

// Corpse recovery never silently re-equips a veiled record: even an empty
// original slot spills the exact object into the first free inventory cells.
const corpseHidden = {
  id: 'corpse-hidden', type: 'sword', slot: 'weapon', tier: 1, rarity: 'rare', identified: false,
  baseName: 'Broadsword', name: 'Hidden Corpse Sword', stats: { str: 10 }, sockets: 0, gems: [],
};
const corpsePlayer = {
  equip: { weapon: null }, inv: [],
  corpses: [{ id: 'corpse-with-hidden', version: 1, gear: [{ slot: 'weapon', item: corpseHidden }], location: { kind: 'town' } }],
};
const recovery = CorpseState.recover(corpsePlayer, 'corpse-with-hidden');
assert.deepStrictEqual(plain(recovery), { ok: true, restored: 0, spilled: 1 });
assert.strictEqual(corpsePlayer.equip.weapon, null);
assert.strictEqual(corpsePlayer.inv[0], corpseHidden);
assert.deepStrictEqual([corpseHidden._gx, corpseHidden._gy], [0, 0]);
assert.strictEqual(corpseHidden.identified, false);

// Save normalization is top-level and legacy-safe across every ownership/world
// location. Explicit false survives serialization, while missing or malformed
// states migrate to identified without touching the hidden records themselves.
const gear = (id, rarity = 'rare', identified = Symbol.for('missing')) => {
  const item = {
    id, type: 'sword', slot: 'weapon', tier: 0, ilvl: 20,
    baseName: 'Short Sword', name: `Saved ${id}`, rarity, stats: { str: 2 },
    reqLvl: 1, price: 50, sockets: 0, gems: [],
  };
  if (identified !== Symbol.for('missing')) item.identified = identified;
  return item;
};
const legacyInventory = gear('save-legacy');
const explicitInventory = gear('save-inventory-hidden', 'rare', false);
const malformedEquipped = gear('save-malformed', 'rare', 'false');
const explicitMerc = gear('save-merc-hidden', 'magic', false);
const explicitCorpse = gear('save-corpse-hidden', 'unique', false);
const explicitStash = gear('save-stash-hidden', 'set', false);
const explicitGround = gear('save-ground-hidden', 'rare', false);
const explicitDungeon = gear('save-dungeon-hidden', 'magic', false);
const savedPlayer = {
  name: 'Archivist', cls: cls.id, hardcore: false, lvl: 12, xp: 0,
  stats: {}, statPts: 0, skillPts: 0, skills: {}, hotbar: {},
  equip: { weapon: malformedEquipped }, inv: [legacyInventory, explicitInventory],
  corpses: [{ id: 'saved-corpse', version: 1, gear: [{ slot: 'weapon', item: explicitCorpse }], location: { kind: 'town' } }],
  gold: 100, potions: { hp: 0, mp: 0 }, progress: {}, difficultyIdx: 0, difficulty: {},
  bars: null, macros: [], quests: {}, dialogue: {}, lore: {}, narrative: {}, reputation: {},
  mercenary: { archetypeId: 'ironwolf', level: 12, xp: 0, equipment: { weapon: explicitMerc }, dead: false },
};
G.stash = [explicitStash];
G.groundItems = [{ x: 1, y: 1, item: explicitGround }];
G.dungeonSave = { groundItems: [{ x: 2, y: 2, item: explicitDungeon }] };
Save.saveChar(savedPlayer);
assert.strictEqual(legacyInventory.identified, true);
assert.strictEqual(malformedEquipped.identified, true);
for (const item of [explicitInventory, explicitMerc, explicitCorpse, explicitStash, explicitGround, explicitDungeon])
  assert.strictEqual(item.identified, false, `${item.id} lost explicit concealed state during normalization`);

const storedCharacter = Save.loadChar('Archivist');
assert.strictEqual(storedCharacter.inv.find(item => item.id === explicitInventory.id).identified, false);
assert.strictEqual(storedCharacter.inv.find(item => item.id === legacyInventory.id).identified, true);
assert.strictEqual(storedCharacter.equip.weapon.identified, true);
assert.strictEqual(storedCharacter.mercenary.equipment.weapon.identified, false);
assert.strictEqual(storedCharacter.corpses[0].gear[0].item.identified, false);
Save.saveStash();
assert.strictEqual(JSON.parse(storage.get(Save.STASH))[0].identified, false);

console.log('item identification runtime contract: ok');
