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
  globalThis.CUBE_RECIPES = CUBE_RECIPES;
  globalThis.RUNES = RUNES; globalThis.RUNE_BY_NAME = RUNE_BY_NAME;
  globalThis.GEM_TYPES = GEM_TYPES; globalThis.GEM_QUALITIES = GEM_QUALITIES;
  globalThis.TIER_LVLS = TIER_LVLS; globalThis.RUNEWORDS = RUNEWORDS;`, sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/items.js'), 'utf8') + '\nglobalThis.Items = Items;', sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/cube.js'), 'utf8'), sandbox);

const { Cube, Items, CUBE_RECIPES, TIER_LVLS } = sandbox;
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = value => JSON.stringify(value);
let serial = 1;

function gem(type, quality) {
  const item = Items.makeGem(type, quality);
  item.id = `test-gem-${serial++}`;
  return item;
}

function rune(name) {
  const item = Items.makeRune(name);
  item.id = `test-rune-${serial++}`;
  return item;
}

function equipment(type, rarity = 'common', tier = 0, overrides = {}) {
  const base = Items.baseById(type);
  const ilvl = Math.max(TIER_LVLS[tier], overrides.ilvl || TIER_LVLS[tier]);
  const item = Items.makeBaseItem(() => 0.5, base, tier, ilvl, { skipQuality: true });
  Object.assign(item, { id: `test-item-${serial++}`, rarity, quality: 'normal', sockets: 0, gems: [], stats: {} }, overrides);
  item.price = Items.price(item);
  return item;
}

function pack(items) {
  const occupied = Array.from({ length: 6 }, () => Array(10).fill(false));
  for (const item of items) {
    const [width, height] = Items.sizeOf(item);
    let found = null;
    for (let row = 0; row <= 6 - height && !found; row++) for (let col = 0; col <= 10 - width; col++) {
      let free = true;
      for (let y = 0; y < height && free; y++) for (let x = 0; x < width; x++)
        if (occupied[row + y][col + x]) { free = false; break; }
      if (free) { found = { col, row }; break; }
    }
    if (!found) throw new Error(`Test fixture does not fit: ${item.id}`);
    item._gx = found.col; item._gy = found.row;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) occupied[found.row + y][found.col + x] = true;
  }
  return items;
}

function player(items, gold = 5000, shouldPack = true) {
  return { inv: shouldPack ? pack(items) : items, gold, marker: { untouched: true }, lvl: 42 };
}

function fixed(value) { return () => value; }

function assertAtomicFailure(pl, ids, rng, reasonPattern) {
  const before = snapshot(pl);
  const result = Cube.transmute(pl, ids, rng);
  assert.strictEqual(result.ok, false);
  if (reasonPattern) assert.match(result.reason, reasonPattern);
  assert.strictEqual(snapshot(pl), before, 'failed transmutation must preserve every player field');
  return result;
}

assert.deepStrictEqual(Array.from(Cube.recipes, recipe => recipe.id), Array.from(CUBE_RECIPES, recipe => recipe.id));
assert.deepStrictEqual(plain(Cube.COSTS), { upgrade_tier: 1400, remove_gems: 500 });

// Gem upgrade: exact multiplicity, order independence, terminal rejection,
// deterministic pure preview, exact consumption, and a fresh unique id.
{
  const inputs = [gem('ruby', 'chipped'), gem('ruby', 'chipped'), gem('ruby', 'chipped')];
  const pl = player(inputs, 77), ids = inputs.map(item => item.id).reverse();
  const before = snapshot(pl);
  const first = Cube.preview(pl, ids), second = Cube.preview(pl, ids);
  assert.deepStrictEqual(plain(first), plain(second));
  assert.strictEqual(snapshot(pl), before, 'preview must not mutate player state');
  assert.deepStrictEqual(plain(first), {
    ok: true, recipeId: 'gem_upgrade', cost: 0,
    outputs: [{ kind: 'gem', gemType: 'ruby', quality: 'flawed', name: 'Flawed Ruby' }], reason: '',
  });
  const oldIds = new Set(ids), result = Cube.transmute(pl, ids, fixed(0.25));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(pl.inv.length, 1);
  assert.strictEqual(pl.inv[0].quality, 'flawed');
  assert.strictEqual(pl.inv[0].component, true);
  assert.strictEqual(pl.inv[0].width, 1);
  assert(pl.inv[0].description && pl.inv[0].price > 0, 'Cube gems are production-ready inventory items');
  assert(!oldIds.has(pl.inv[0].id));
  assert.strictEqual(pl.gold, 77);

  const terminal = [gem('diamond', 'perfect'), gem('diamond', 'perfect'), gem('diamond', 'perfect')];
  const terminalPlayer = player(terminal);
  assertAtomicFailure(terminalPlayer, terminal.map(item => item.id), fixed(0), /terminal quality/i);

  const mixed = [gem('ruby', 'chipped'), gem('ruby', 'chipped'), gem('ruby', 'flawed')];
  const mixedPlayer = player(mixed);
  assertAtomicFailure(mixedPlayer, mixed.map(item => item.id), fixed(0), /three matching gems/i);
  assertAtomicFailure(mixedPlayer, [mixed[0].id, mixed[0].id, mixed[1].id], fixed(0), /same inventory instance/i);
}

// Rune upgrade: exact instances/multiplicity and terminal Zod behavior.
{
  const inputs = [rune('El'), rune('El'), rune('El')], pl = player(inputs);
  const result = Cube.transmute(pl, [inputs[2].id, inputs[0].id, inputs[1].id], fixed(0.1));
  assert.strictEqual(result.recipeId, 'rune_upgrade');
  assert.strictEqual(pl.inv[0].name, 'Eld');
  assert.strictEqual(pl.inv[0].ord, 2);
  assert.strictEqual(pl.inv[0].component, true);
  assert(pl.inv[0].description && pl.inv[0].price > 0, 'Cube runes are production-ready inventory items');

  const terminal = [rune('Zod'), rune('Zod'), rune('Zod')], terminalPlayer = player(terminal);
  assertAtomicFailure(terminalPlayer, terminal.map(item => item.id), fixed(0), /terminal rune/i);

  const mixed = [rune('El'), rune('El'), rune('Eld')], mixedPlayer = player(mixed);
  assertAtomicFailure(mixedPlayer, mixed.map(item => item.id), fixed(0), /three matching runes/i);
}

// Socket recipe: unordered Ral/Tal/Ort multiset, normal/rarity/base/socket
// constraints, ilvl socket cap, and preservation of the base's other fields.
{
  const base = equipment('sword', 'common', 1, { ilvl: 20, stats: { dmgPct: 7 }, custom: 'kept' });
  const inputs = [base, rune('Ort'), rune('Ral'), rune('Tal')], pl = player(inputs);
  const ids = [inputs[3].id, base.id, inputs[1].id, inputs[2].id];
  const preview = Cube.preview(pl, ids);
  assert.deepStrictEqual(plain(preview.outputs[0].sockets), { min: 1, max: 3 });
  const result = Cube.transmute(pl, ids, fixed(0.999));
  assert.strictEqual(result.recipeId, 'add_sockets');
  assert.strictEqual(pl.inv.length, 1);
  assert.strictEqual(pl.inv[0].sockets, 3);
  assert.strictEqual(pl.inv[0].id, base.id, 'socketing must preserve the base item identity');
  assert.deepStrictEqual(Array.from(pl.inv[0].gems), [null, null, null]);
  assert.deepStrictEqual(plain(pl.inv[0].stats), { dmgPct: 7 });
  assert.strictEqual(pl.inv[0].custom, 'kept');

  const invalidRarity = equipment('sword', 'magic', 0);
  const rarityInputs = [invalidRarity, rune('Ral'), rune('Tal'), rune('Ort')], rarityPlayer = player(rarityInputs);
  assertAtomicFailure(rarityPlayer, rarityInputs.map(item => item.id), fixed(0), /normal common base/i);

  const alreadySocketed = equipment('sword', 'common', 0, { sockets: 1, gems: [null] });
  const socketInputs = [alreadySocketed, rune('Ral'), rune('Tal'), rune('Ort')], socketPlayer = player(socketInputs);
  assertAtomicFailure(socketPlayer, socketInputs.map(item => item.id), fixed(0), /completely unsocketed/i);

  const gloves = equipment('gloves', 'common', 0);
  const gloveInputs = [gloves, rune('Ral'), rune('Tal'), rune('Ort')], glovePlayer = player(gloveInputs);
  assertAtomicFailure(glovePlayer, gloveInputs.map(item => item.id), fixed(0), /cannot receive sockets/i);

  const wrongRunes = [equipment('sword'), rune('Ral'), rune('Tal'), rune('Tal')], wrongPlayer = player(wrongRunes);
  assertAtomicFailure(wrongPlayer, wrongRunes.map(item => item.id), fixed(0), /exactly Ral, Tal, and Ort/i);
}

// Rare base tier upgrade: gold is exact, base rolls are deterministic, affixes
// and sockets persist, terminal tiers reject, and insufficient gold is atomic.
{
  const embedded = gem('topaz', 'chipped');
  const rare = equipment('axe', 'rare', 1, { ilvl: 30, reqLvl: 14, stats: { str: 9 }, sockets: 1, gems: [embedded] });
  const pl = player([rare], 1400), preview = Cube.preview(pl, [rare.id]);
  assert.strictEqual(preview.recipeId, 'upgrade_tier');
  assert.strictEqual(preview.cost, 1400);
  const result = Cube.transmute(pl, [rare.id], fixed(0.5));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(pl.gold, 0);
  assert.strictEqual(pl.inv[0].tier, 2);
  assert.strictEqual(pl.inv[0].id, rare.id, 'tier upgrading must preserve the base item identity');
  assert.strictEqual(pl.inv[0].baseName, Items.baseById('axe').names[2]);
  assert.deepStrictEqual(plain(pl.inv[0].stats), { str: 9 });
  assert.strictEqual(pl.inv[0].gems[0].id, embedded.id);
  assert(pl.inv[0].reqLvl >= TIER_LVLS[2]);

  const terminal = equipment('axe', 'rare', TIER_LVLS.length - 1), terminalPlayer = player([terminal], 9999);
  assertAtomicFailure(terminalPlayer, [terminal.id], fixed(0), /terminal base tier/i);

  const poor = equipment('axe', 'rare', 1), poorPlayer = player([poor], 1399);
  const poorPreview = Cube.preview(poorPlayer, [poor.id]);
  assert.strictEqual(poorPreview.recipeId, 'upgrade_tier');
  assert.strictEqual(poorPreview.cost, 1400);
  assertAtomicFailure(poorPlayer, [poor.id], fixed(0), /costs 1400/i);

  const common = equipment('axe', 'common', 1), commonPlayer = player([common], 9999);
  assertAtomicFailure(commonPlayer, [common.id], fixed(0), /No declared Cube recipe/i);
}

// Magic reroll: exact perfect-gem requirement, preserved base identity fields,
// deterministic output for identical state/RNG, and fresh unique ids.
{
  const original = equipment('wand', 'magic', 2, { ilvl: 28, stats: { ene: 99 }, name: 'Old Magic Wand' });
  const inputs = [original, gem('ruby', 'perfect'), gem('skull', 'perfect'), gem('topaz', 'perfect')];
  const firstPlayer = player(inputs), secondPlayer = plain(firstPlayer), ids = inputs.map(item => item.id).reverse();
  const first = Cube.transmute(firstPlayer, ids, sandbox.makeRng(12345));
  const second = Cube.transmute(secondPlayer, ids, sandbox.makeRng(12345));
  assert.strictEqual(first.recipeId, 'reroll_magic');
  assert.deepStrictEqual(plain(first.outputs), plain(second.outputs), 'identical state and RNG must produce deterministic output');
  const output = firstPlayer.inv[0];
  assert.strictEqual(output.rarity, 'magic');
  assert.strictEqual(output.type, 'wand');
  assert.strictEqual(output.tier, 2);
  assert.strictEqual(output.ilvl, 28);
  assert.notDeepStrictEqual(plain(output.stats), { ene: 99 });
  assert.strictEqual(output.id, original.id, 'rerolling must preserve the base item identity');

  const bad = [equipment('wand', 'magic', 1), gem('ruby', 'perfect'), gem('skull', 'perfect'), gem('topaz', 'flawless')];
  const badPlayer = player(bad);
  assertAtomicFailure(badPlayer, bad.map(item => item.id), fixed(0), /three perfect gems/i);
}

// Hel removal preserves the base item, destroys every socket content, charges
// the declared cost, and reverses the current in-place Runeword stat overlay.
{
  const socketed = equipment('sword', 'common', 0, { sockets: 2, gems: [rune('Tir'), rune('El')],
    stats: { dmgPct: 5, ar: 10, regenHp: 0.5 }, custom: 'survives' });
  Items.applyRuneword(socketed);
  assert.strictEqual(socketed.runeword, 'steel');
  const inputContents = socketed.gems.map(item => item.id);
  const hel = rune('Hel'), pl = player([hel, socketed], 500);
  const result = Cube.transmute(pl, [socketed.id, hel.id], fixed(0));
  assert.strictEqual(result.recipeId, 'remove_gems');
  assert.strictEqual(pl.gold, 0);
  assert.strictEqual(pl.inv.length, 1);
  assert.strictEqual(pl.inv[0].type, 'sword');
  assert.strictEqual(pl.inv[0].id, socketed.id, 'socket removal must preserve the base item identity');
  assert.strictEqual(pl.inv[0].custom, 'survives');
  assert.deepStrictEqual(Array.from(pl.inv[0].gems), [null, null]);
  assert.strictEqual(pl.inv[0].runeword, undefined);
  assert.deepStrictEqual(plain(pl.inv[0].stats), { dmgPct: 5, ar: 10, regenHp: 0.5 });
  assert(inputContents.every(id => !snapshot(pl.inv[0]).includes(id)), 'socket contents must be destroyed');

  const empty = equipment('sword', 'common', 0, { sockets: 2, gems: [null, null] });
  const emptyHel = rune('Hel'), emptyPlayer = player([empty, emptyHel], 500);
  assertAtomicFailure(emptyPlayer, [empty.id, emptyHel.id], fixed(0), /no socket contents/i);
}

// Magic-to-rare upgrade: exact chipped/perfect-skull multiset and deterministic
// fresh rare output on the same base/tier/ilvl.
{
  const magic = equipment('chest', 'magic', 2, { ilvl: 35, stats: { hp: 10 } });
  const chipped = gem('emerald', 'chipped'), skull = gem('skull', 'perfect');
  const pl = player([skull, magic, chipped]);
  const result = Cube.transmute(pl, [chipped.id, skull.id, magic.id], sandbox.makeRng(91));
  assert.strictEqual(result.recipeId, 'upgrade_rare');
  assert.strictEqual(pl.inv.length, 1);
  assert.strictEqual(pl.inv[0].rarity, 'rare');
  assert.strictEqual(pl.inv[0].id, magic.id, 'rarity upgrading must preserve the base item identity');
  assert.strictEqual(pl.inv[0].type, 'chest');
  assert.strictEqual(pl.inv[0].tier, 2);
  assert.strictEqual(pl.inv[0].ilvl, 35);
  assert(Object.keys(pl.inv[0].stats).length >= 1);

  const badMagic = equipment('chest', 'magic', 1), badInputs = [badMagic, gem('emerald', 'chipped'), gem('ruby', 'perfect')];
  const badPlayer = player(badInputs);
  assertAtomicFailure(badPlayer, badInputs.map(item => item.id), fixed(0), /perfect skull/i);
}

// A completely full valid grid can transmute because selected ingredients free
// space first. An overfull projected result fails without consuming anything.
{
  const full = [];
  for (let i = 0; i < 60; i++) full.push({ id: `full-${i}`, kind: 'junk', name: `Filler ${i}`,
    rarity: 'common', _gx: i % 10, _gy: Math.floor(i / 10) });
  full[0] = Object.assign(gem('amethyst', 'chipped'), { _gx: 0, _gy: 0 });
  full[1] = Object.assign(gem('amethyst', 'chipped'), { _gx: 1, _gy: 0 });
  full[2] = Object.assign(gem('amethyst', 'chipped'), { _gx: 2, _gy: 0 });
  const fullPlayer = player(full, 0, false), ids = full.slice(0, 3).map(item => item.id);
  const result = Cube.transmute(fullPlayer, ids, fixed(0));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(fullPlayer.inv.length, 58);
  assert.strictEqual(result.outputs[0]._gx, 0);
  assert.strictEqual(result.outputs[0]._gy, 0);

  const packed = [];
  for (let i = 0; i < 60; i++) packed.push({ id: `overfull-${i}`, kind: 'junk', name: `Filler ${i}`,
    rarity: 'common', _gx: i % 10, _gy: Math.floor(i / 10) });
  const overflowInputs = [gem('sapphire', 'chipped'), gem('sapphire', 'chipped'), gem('sapphire', 'chipped')];
  const overfullPlayer = player(packed.concat(overflowInputs), 0, false);
  assertAtomicFailure(overfullPlayer, overflowInputs.map(item => item.id), fixed(0), /does not fit/i);

  const pinned = { id: 'pinned-cell', kind: 'junk', name: 'Pinned', rarity: 'common', _gx: 0, _gy: 0 };
  const loose = { id: 'legacy-loose', kind: 'junk', name: 'Loose', rarity: 'common' };
  const mixedInputs = [gem('ruby', 'chipped'), gem('ruby', 'chipped'), gem('ruby', 'chipped')];
  mixedInputs.forEach((item, index) => { item._gx = index + 2; item._gy = 0; });
  const mixedPlayer = player([loose, pinned, ...mixedInputs], 0, false);
  assert.strictEqual(Cube.transmute(mixedPlayer, mixedInputs.map(item => item.id), fixed(0)).ok, true,
    'anchored cells must be reserved before legacy items are first-fit');
}

// Defensive selection/id/RNG failures are total and atomic; existing ids are
// reserved even when they look like Cube-generated ids.
{
  const inputs = [gem('ruby', 'chipped'), gem('ruby', 'chipped'), gem('ruby', 'chipped')];
  const collision = { id: 'cube-gem_upgrade-1', kind: 'junk', name: 'Reserved id', rarity: 'common' };
  const pl = player([collision, ...inputs]), ids = inputs.map(item => item.id);
  const result = Cube.transmute(pl, ids, fixed(0));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.outputs[0].id, 'cube-gem_upgrade-2');
  assert.strictEqual(new Set(pl.inv.map(item => item.id)).size, pl.inv.length);

  const duplicateA = gem('ruby', 'chipped'), duplicateB = gem('ruby', 'chipped');
  duplicateB.id = duplicateA.id;
  const duplicatePlayer = player([duplicateA, duplicateB], 0);
  assertAtomicFailure(duplicatePlayer, [duplicateA.id], fixed(0), /ids must be unique/i);

  const badRngInputs = [equipment('sword'), rune('Ral'), rune('Tal'), rune('Ort')];
  const badRngPlayer = player(badRngInputs), badIds = badRngInputs.map(item => item.id);
  assertAtomicFailure(badRngPlayer, badIds, () => NaN, /Unable to create/i);

  const missingPlayer = player([gem('ruby', 'chipped')]);
  assertAtomicFailure(missingPlayer, ['not-present'], fixed(0), /not in the inventory/i);
}

console.log('cube contract: all seven recipes are deterministic, capacity-safe, and atomic');
