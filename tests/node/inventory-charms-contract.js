'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/inventory-charms.js'), 'utf8'), sandbox,
  { filename: 'js/inventory-charms.js' });

const C = sandbox.InventoryCharms;
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = value => JSON.stringify(value);

function queue(values) {
  let cursor = 0;
  const rng = () => {
    if (cursor >= values.length) throw new Error('Test RNG exhausted.');
    return values[cursor++];
  };
  rng.used = () => cursor;
  return rng;
}

function fixedSmall(id, identified = false) {
  const item = C.generate({ id, ilvl: 1, form: 'small' }, queue([0.9, 0, 0, 0, 0, 0, 0]));
  item.identified = identified;
  return item;
}

function manaLifeSmall(id, identified = false) {
  // Both sides; prefix index 5 at ilvl 1 is p_mana, suffix index 0 is s_life.
  const item = C.generate({ id, ilvl: 1, form: 'small' }, queue([0.9, 0.75, 0, 0, 0, 0, 0]));
  item.identified = identified;
  return item;
}

function highLifeGrand(id, identified = false) {
  // Suffix only, s_life, highest available band, minimum value in that band.
  const item = C.generate({ id, ilvl: 54, form: 'grand' }, queue([0.3, 0, 0.999, 0]));
  item.identified = identified;
  return item;
}

function sizeOf(item) {
  if (item && C.FORMS[item.form] && item.type === C.FORMS[item.form].type)
    return [C.FORMS[item.form].width, C.FORMS[item.form].height];
  return [Number(item && item.width) || 1, Number(item && item.height) || 1];
}

// Public constants are complete and deeply immutable.
assert.strictEqual(C.VERSION, 1);
assert.deepStrictEqual(plain(C.FORM_ORDER), ['small', 'large', 'grand']);
assert.deepStrictEqual(plain(C.FORMS), {
  small: { type: 'charm_small', baseName: 'Small Charm', width: 1, height: 1, scale: 1, weight: 50 },
  large: { type: 'charm_large', baseName: 'Large Charm', width: 1, height: 2, scale: 1.75, weight: 30 },
  grand: { type: 'charm_grand', baseName: 'Grand Charm', width: 1, height: 3, scale: 2.5, weight: 20 },
});
assert.deepStrictEqual(plain(C.BANDS), [
  { minIlvl: 1, reqLvl: 1 }, { minIlvl: 18, reqLvl: 14 },
  { minIlvl: 36, reqLvl: 28 }, { minIlvl: 54, reqLvl: 42 },
]);
for (const value of [C, C.FORM_ORDER, C.FORMS, C.FORMS.small, C.BANDS, C.BANDS[0], C.AFFIXES,
  C.AFFIXES[0], C.AFFIXES[0].ranges, C.FORM_WEIGHTS, C.SIDE_WEIGHTS, C.BAND_WEIGHTS,
  C.STAT_KEYS, C.DROP_CHANCE, C.REASONS]) assert(Object.isFrozen(value));
assert.strictEqual(C.AFFIXES.length, 16);
assert.deepStrictEqual(plain(C.DROP_CHANCE), { normal: 0.025, champion: 0.08, elite: 0.16, boss: 0.5 });
assert.deepStrictEqual(plain(C.rangeFor('p_all_res', 3, 'grand')), [10, 13]);
assert.strictEqual(C.rangeFor('p_all_res', 0, 'small'), null);
assert.strictEqual(C.bandFor(1), 0);
assert.strictEqual(C.bandFor(18), 1);
assert.strictEqual(C.bandFor(36), 2);
assert.strictEqual(C.bandFor(54), 3);
assert.strictEqual(C.bandFor(0), -1);
assert.strictEqual(C.bandFor(100), -1);

// A fixed RNG produces an exact, production-ready schema without a trusted
// stats cache or any equipment/socket/condition fields.
{
  const rng = queue([0.9, 0, 0, 0, 0, 0, 0]);
  const item = C.generate({ id: 'fixed-small', ilvl: 1, form: 'small' }, rng);
  assert.strictEqual(rng.used(), 7);
  assert.deepStrictEqual(plain(item), {
    id: 'fixed-small', version: 1, kind: 'charm', type: 'charm_small', form: 'small', rarity: 'magic',
    ilvl: 1, baseName: 'Small Charm', name: 'Crimson Small Charm of Life', width: 1, height: 1,
    rolls: [
      { affixId: 'p_fire_res', band: 0, value: 2 },
      { affixId: 's_life', band: 0, value: 4 },
    ],
    reqLvl: 1, value: 91, price: 91, socketable: false, identified: false,
  });
  assert.strictEqual(C.isCharmRecord(item), true);
  assert.strictEqual(C.isCharm(item), true);
  assert.deepStrictEqual(plain(C.validate(item)), { ok: true, reason: '' });
  assert.deepStrictEqual(plain(C.statsOf(item)), { fireRes: 2, hp: 4 });
  assert.strictEqual(C.nameOf(item), 'Crimson Small Charm of Life');
  assert.strictEqual(C.priceOf(item), 91);
  for (const forbidden of ['stats', 'slot', 'component', 'sockets', 'gems', 'durability', 'ethereal'])
    assert.strictEqual(Object.prototype.hasOwnProperty.call(item, forbidden), false);
}

// Weighted form and side boundaries are stable. A supplied form consumes no
// form roll, and every chosen affix consumes selection, band, and value rolls.
{
  const make = (id, formRoll) => C.generate({ id, ilvl: 1 }, queue([formRoll, 0, 0, 0, 0]));
  assert.strictEqual(make('form-small', 0.499999).form, 'small');
  assert.strictEqual(make('form-large', 0.5).form, 'large');
  assert.strictEqual(make('form-grand', 0.8).form, 'grand');
  const prefix = C.generate({ id: 'prefix-only', ilvl: 1, form: 'small' }, queue([0.249999, 0, 0, 0]));
  const suffix = C.generate({ id: 'suffix-only', ilvl: 1, form: 'small' }, queue([0.25, 0, 0, 0]));
  const both = C.generate({ id: 'both-sides', ilvl: 1, form: 'small' }, queue([0.5, 0, 0, 0, 0, 0, 0]));
  assert.deepStrictEqual(Array.from(prefix.rolls, roll => roll.affixId), ['p_fire_res']);
  assert.deepStrictEqual(Array.from(suffix.rolls, roll => roll.affixId), ['s_life']);
  assert.strictEqual(both.rolls.length, 2);
}

// Weighted high bands, inclusive range endpoints, requirements, and scaling.
{
  const low = highLifeGrand('grand-low', true);
  assert.deepStrictEqual(plain(low.rolls), [{ affixId: 's_life', band: 3, value: 48 }]);
  assert.strictEqual(low.reqLvl, 42);
  assert.strictEqual(low.name, 'Grand Charm of Life');
  const high = C.generate({ id: 'grand-high', ilvl: 54, form: 'grand' }, queue([0.3, 0, 0.999, 0.999]));
  assert.strictEqual(high.rolls[0].value, 63);
  const allRes = {
    id: 'all-res', version: 1, kind: 'charm', type: 'charm_grand', form: 'grand', rarity: 'magic', ilvl: 54,
    baseName: 'Grand Charm', name: 'Shimmering Grand Charm', width: 1, height: 3,
    rolls: [{ affixId: 'p_all_res', band: 3, value: 13 }], reqLvl: 42,
    value: 40 + 75 + 108 + 52, price: 40 + 75 + 108 + 52, socketable: false, identified: true,
  };
  assert.strictEqual(C.validate(allRes).ok, true);
}

// Generation validates all caller-owned inputs and every RNG sample.
{
  for (const options of [null, {}, { id: '', ilvl: 1 }, { id: ' x ', ilvl: 1 },
    { id: 'x', ilvl: 0 }, { id: 'x', ilvl: 1.5 }, { id: 'x', ilvl: 100 },
    { id: 'x', ilvl: 1, form: 'tiny' }])
    assert.throws(() => C.generate(options, () => 0));
  assert.throws(() => C.generate({ id: 'no-rng', ilvl: 1 }), /random function/i);
  for (const value of [-0.1, 1, NaN, Infinity, 'not-a-number'])
    assert.throws(() => C.generate({ id: `rng-${String(value)}`, ilvl: 1, form: 'small' }, () => value), /\[0, 1\)/);
  assert.throws(() => C.generate({ id: 'late-bad-rng', ilvl: 1, form: 'small' }, queue([0.9, 0, 0, 0, 0, 0, 1])), /\[0, 1\)/);
}

// Version-zero migration accepts only bounded authoritative roll references,
// regenerates every derived field, strips injected gameplay state, preserves
// identity/placement and leaves identification policy to ItemIdentification.
{
  const legacy = {
    id: 'legacy-large', kind: 'charm', type: 'large-charm', charmSize: 'large', rarity: 'magic',
    ilvl: '18', affixes: [{ id: 'p_mana', band: '1', value: '11' }],
    name: 'Forged Name', baseName: 'Forged Base', width: 9, height: 9, reqLvl: 99,
    value: 999999, price: 999999, stats: { hp: 9999 }, slot: 'weapon', sockets: 6,
    gems: [{ kind: 'rune' }], durability: 88, maxDurability: 88, ethereal: true,
    identified: 'false', _gx: 3, _gy: 2,
  };
  assert.strictEqual(C.normalize(legacy), legacy);
  assert.deepStrictEqual(plain(legacy), {
    id: 'legacy-large', version: 1, kind: 'charm', type: 'charm_large', form: 'large', rarity: 'magic',
    ilvl: 18, baseName: 'Large Charm', name: "Serpent's Large Charm", width: 1, height: 2,
    rolls: [{ affixId: 'p_mana', band: 1, value: 11 }], reqLvl: 14,
    value: 170, price: 170, socketable: false, identified: 'false', _gx: 3, _gy: 2,
  });
  assert.strictEqual(C.validate(legacy).ok, true);
  assert.strictEqual(C.activeReason(legacy, 99), C.REASONS.UNIDENTIFIED);
  const after = snapshot(legacy);
  assert.strictEqual(C.migrate(legacy), legacy);
  assert.strictEqual(snapshot(legacy), after, 'normalization is JSON-idempotent');
}

// Invalid normalization is atomic. Valid v1 records have corrupted derived
// fields repaired, while immutable records are rejected without partial edits.
{
  const invalids = [
    { id: 'unknown', kind: 'charm', type: 'small', ilvl: 1, affixes: [{ id: 'not-real', band: 0, value: 1 }] },
    { id: 'duplicate-side', kind: 'charm', type: 'small', ilvl: 1, affixes: [
      { id: 's_life', band: 0, value: 4 }, { id: 's_strength', band: 0, value: 1 },
    ] },
    { id: 'future', version: 2, kind: 'charm', type: 'charm_small', form: 'small', rarity: 'magic', ilvl: 1,
      rolls: [{ affixId: 's_life', band: 0, value: 4 }] },
    { id: 'too-strong', kind: 'charm', type: 'small', ilvl: 1,
      affixes: [{ id: 's_life', band: 0, value: 999 }] },
    { id: 'stats-only', kind: 'charm', type: 'small', ilvl: 1, stats: { hp: 10 } },
  ];
  for (const item of invalids) {
    const before = snapshot(item);
    assert.strictEqual(C.normalize(item), null);
    assert.strictEqual(snapshot(item), before);
  }

  const corrupted = fixedSmall('corrupted', true);
  corrupted.name = 'Injected'; corrupted.width = 8; corrupted.value = corrupted.price = 999;
  corrupted.stats = { hp: 5000 }; corrupted.slot = 'weapon';
  assert.strictEqual(C.normalize(corrupted), corrupted);
  assert.strictEqual(corrupted.name, 'Crimson Small Charm of Life');
  assert.strictEqual(corrupted.width, 1);
  assert.strictEqual(corrupted.value, 91);
  assert.strictEqual('stats' in corrupted, false);
  assert.strictEqual('slot' in corrupted, false);

  const frozen = Object.freeze(fixedSmall('frozen', true)), before = snapshot(frozen);
  assert.strictEqual(C.normalize(frozen), null);
  assert.strictEqual(snapshot(frozen), before);
}

// statsOf derives solely from the catalogue/rolls. An injected stats cache is
// ignored even though strict canonical validation correctly rejects the record.
{
  const item = manaLifeSmall('stats-source', true);
  item.stats = { hp: 99999, mp: 99999, allSkills: 99 };
  assert.strictEqual(C.validate(item).ok, false);
  assert.deepStrictEqual(plain(C.statsOf(item)), { hp: 4, mp: 3 });
  assert(Object.isFrozen(C.statsOf(item)));
  assert.strictEqual(C.normalize(item), item);
  assert.deepStrictEqual(plain(C.statsOf(item)), { hp: 4, mp: 3 });
}

// Identification and character-level gates are independent and fail closed.
{
  const item = highLifeGrand('gated', false);
  assert.strictEqual(C.activeReason(item, 99), C.REASONS.UNIDENTIFIED);
  assert.strictEqual(C.isActive(item, 99), false);
  item.identified = true;
  assert.strictEqual(C.activeReason(item, 41), C.REASONS.LEVEL_REQUIRED);
  assert.strictEqual(C.activeReason(item, 42), '');
  assert.strictEqual(C.isActive(item, 42), true);
  assert.strictEqual(C.activeReason(item, 0), C.REASONS.INVALID_LEVEL);
  item.extra = true;
  assert.strictEqual(C.activeReason(item, 99), C.REASONS.MALFORMED_CHARM);
}

// Legal carried-grid aggregation counts only identified, level-qualified
// charms from this exact inventory and returns stable frozen diagnostics.
{
  const active = manaLifeSmall('active', true); active._gx = 0; active._gy = 0;
  const hidden = fixedSmall('hidden', false); hidden._gx = 1; hidden._gy = 0;
  const gated = highLifeGrand('gated-grid', true); gated._gx = 2; gated._gy = 0;
  const other = { id: 'other', width: 2, height: 2, _gx: 3, _gy: 0 };
  const player = { lvl: 1, inv: [gated, other, hidden, active] };
  assert.deepStrictEqual(plain(C.validateCarried(player, sizeOf)), { ok: true, reason: '', id: null });
  const result = C.aggregate(player, sizeOf);
  assert.deepStrictEqual(plain(result), {
    ok: true, reason: '', stats: { hp: 4, mp: 3 }, activeIds: ['active'],
    inactive: [
      { id: 'gated-grid', reason: 'level-required', required: 42 },
      { id: 'hidden', reason: 'unidentified' },
    ],
  });
  assert(Object.isFrozen(result)); assert(Object.isFrozen(result.stats));
  assert(Object.isFrozen(result.activeIds)); assert(Object.isFrozen(result.inactive));
  assert(result.inactive.every(Object.isFrozen));
  player.lvl = 42;
  assert.deepStrictEqual(plain(C.aggregate(player, sizeOf).stats), { hp: 52, mp: 3 });
}

// Any ambiguous identity, placement, footprint, or canonical record makes the
// whole charm aggregate empty. Failures never mutate the player or its items.
{
  const base = fixedSmall('base', true); base._gx = 0; base._gy = 0;
  const cases = [];
  cases.push({ reason: C.REASONS.DUPLICATE_ITEM_OBJECT, player: { lvl: 1, inv: [base, base] }, resolver: sizeOf });
  const sameId = fixedSmall('base', true); sameId._gx = 1; sameId._gy = 0;
  cases.push({ reason: C.REASONS.DUPLICATE_ITEM_ID, player: { lvl: 1, inv: [base, sameId] }, resolver: sizeOf });
  const overlap = fixedSmall('overlap', true); overlap._gx = 0; overlap._gy = 0;
  cases.push({ reason: C.REASONS.OVERLAP, player: { lvl: 1, inv: [base, overlap] }, resolver: sizeOf });
  const unplaced = fixedSmall('unplaced', true);
  cases.push({ reason: C.REASONS.UNPLACED_ITEM, player: { lvl: 1, inv: [unplaced] }, resolver: sizeOf });
  const half = fixedSmall('half', true); half._gx = 0;
  cases.push({ reason: C.REASONS.INVALID_ANCHOR, player: { lvl: 1, inv: [half] }, resolver: sizeOf });
  const fractional = fixedSmall('fractional', true); fractional._gx = 0.5; fractional._gy = 0;
  cases.push({ reason: C.REASONS.INVALID_ANCHOR, player: { lvl: 1, inv: [fractional] }, resolver: sizeOf });
  const out = highLifeGrand('out', true); out._gx = 9; out._gy = 4;
  cases.push({ reason: C.REASONS.OUT_OF_BOUNDS, player: { lvl: 54, inv: [out] }, resolver: sizeOf });
  const wrongSize = highLifeGrand('wrong-size', true); wrongSize._gx = 0; wrongSize._gy = 0;
  cases.push({ reason: C.REASONS.CHARM_SIZE_MISMATCH, player: { lvl: 54, inv: [wrongSize] }, resolver: () => [1, 1] });
  const malformed = fixedSmall('malformed', true); malformed._gx = 0; malformed._gy = 0; malformed.stats = { hp: 99 };
  cases.push({ reason: C.REASONS.MALFORMED_CHARM, player: { lvl: 1, inv: [malformed] }, resolver: sizeOf });
  const withMissingId = fixedSmall('with-missing', true); withMissingId._gx = 0; withMissingId._gy = 0;
  cases.push({ reason: C.REASONS.MISSING_ITEM_ID,
    player: { lvl: 1, inv: [withMissingId, { width: 1, height: 1, _gx: 1, _gy: 0 }] }, resolver: sizeOf });
  cases.push({ reason: C.REASONS.INVALID_SIZE,
    player: { lvl: 1, inv: [base] }, resolver: () => [NaN, 1] });
  for (const fixture of cases) {
    const before = snapshot(fixture.player), result = C.aggregate(fixture.player, fixture.resolver);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, fixture.reason);
    assert.deepStrictEqual(plain(result.stats), {});
    assert.deepStrictEqual(plain(result.activeIds), []);
    assert.deepStrictEqual(plain(result.inactive), []);
    assert.strictEqual(snapshot(fixture.player), before);
  }
}

// An unrelated malformed legacy inventory does not disable anything when it
// contains no charm-like record. This keeps the feature isolated until a charm
// actually needs carried-grid authority.
{
  const result = C.aggregate({ lvl: 'bad', inv: [{ anything: true }] }, null);
  assert.deepStrictEqual(plain(result), { ok: true, reason: '', stats: {}, activeIds: [], inactive: [] });
}

// The full 60-cell Small Charm bound remains finite and counts each legal
// object exactly once, independent of inventory order.
{
  const inventory = [];
  for (let index = 0; index < 60; index++) {
    const item = fixedSmall(`full-${String(index).padStart(2, '0')}`, true);
    item._gx = index % 10; item._gy = Math.floor(index / 10);
    inventory.push(item);
  }
  const player = { lvl: 99, inv: inventory.slice().reverse() };
  const result = C.aggregate(player, sizeOf);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(plain(result.stats), { fireRes: 120, hp: 240 });
  assert.strictEqual(result.activeIds.length, 60);
  assert.deepStrictEqual(plain(result.activeIds), inventory.map(item => item.id).sort());
}

console.log('inventory charms contract: ok');
