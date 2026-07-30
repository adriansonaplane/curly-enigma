'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = {}; sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../js/item-identification.js'), 'utf8'), sandbox);
const I = sandbox.ItemIdentification, plain = value => JSON.parse(JSON.stringify(value)), snap = JSON.stringify;
let serial = 0;
const equipment = (rarity = 'rare', extra = {}) => Object.assign({ id: `gear-${++serial}`, type: 'sword', slot: 'weapon',
  tier: 1, rarity, baseName: 'Crystal Sword', name: 'Doom Song', stats: { str: 8, critCh: 4 },
  durability: 17, maxDurability: 40, sockets: 2, gems: [null, null], _gx: 2, _gy: 1 }, extra);
const player = inv => ({ inv, gold: 911, equip: {}, stash: [], corpses: [] });

// Constants and structural eligibility do not require the global Items table.
assert(Object.isFrozen(I.EQUIPMENT_TYPES)); assert(Object.isFrozen(I.ELIGIBLE_RARITIES));
assert(Object.isFrozen(I.SCROLL)); assert(Object.isFrozen(I.REASONS));
for (const rarity of ['magic', 'rare', 'set', 'unique']) assert.strictEqual(I.isEligible(equipment(rarity)), true);
assert.strictEqual(I.isEligible(equipment('common')), false);
assert.strictEqual(I.isEligible(equipment('rare', { type: 'made-up' })), false);
assert.strictEqual(I.isEligible(equipment('rare', { potion: 'hp' })), false);
assert.strictEqual(I.isEligible(equipment('rare', { component: true })), false);
assert.strictEqual(I.isEligible(equipment('rare', { kind: 'gem' })), false);
assert.strictEqual(I.isEligible(equipment('rare', { kind: 'rune' })), false);
assert.strictEqual(I.isEligible(equipment('rare', { kind: 'utility' })), false);
assert.strictEqual(I.isEligible(equipment('rare', { kind: 'equipment' })), true);
assert.strictEqual(I.isEligible({ id: 'gem', kind: 'gem', component: true, rarity: 'magic', name: 'Ruby' }), false);

// Save migration is conservative: only an explicit false on eligible gear survives.
for (const state of [undefined, null, '', 0, 1, 'false', {}, []]) {
  const item = equipment('rare');
  if (state !== undefined) item.identified = state;
  const beforeStats = item.stats, beforeGems = item.gems;
  assert.strictEqual(I.normalize(item), item); assert.strictEqual(item.identified, true);
  assert.strictEqual(item.stats, beforeStats); assert.strictEqual(item.gems, beforeGems);
}
const legacyFalse = equipment('unique', { identified: false }); I.normalize(legacyFalse);
assert.strictEqual(legacyFalse.identified, false); assert.strictEqual(I.needsIdentification(legacyFalse), true);
for (const item of [equipment('common', { identified: false }), { id: 'r', kind: 'rune', component: true, rarity: 'rare', identified: false }]) {
  I.normalize(item); assert.strictEqual(item.identified, true); assert.strictEqual(I.isIdentified(item), true);
  assert.strictEqual(I.needsIdentification(item), false);
}
assert.strictEqual(I.normalize(null), null);

// Drop preparation mutates only the identification bit, keeps identity, and is idempotent.
const drop = equipment('set', { identified: true, custom: { roll: 0.123 } }), dropBefore = Object.assign({}, drop);
const dropStats = drop.stats, dropGems = drop.gems, dropCustom = drop.custom;
assert.strictEqual(I.prepareDrop(drop), drop); assert.strictEqual(drop.identified, false);
assert.strictEqual(drop.id, dropBefore.id); assert.strictEqual(drop.stats, dropStats); assert.strictEqual(drop.gems, dropGems); assert.strictEqual(drop.custom, dropCustom);
const prepared = snap(drop); I.prepareDrop(drop); assert.strictEqual(snap(drop), prepared);
const commonDrop = equipment('common'); I.prepareDrop(commonDrop); assert.strictEqual(commonDrop.identified, true);

// Concealment never consults the true rolled name and has deterministic fallbacks.
const secret = equipment('unique', { identified: false, baseName: 'Dimensional Blade', name: 'Azurewrath' });
assert.strictEqual(I.displayName(secret), 'Unidentified Dimensional Blade');
assert(!I.displayName(secret).includes('Azurewrath'));
secret.name = 'A Different Secret'; assert.strictEqual(I.displayName(secret), 'Unidentified Dimensional Blade');
const malformedBase = equipment('rare', { identified: false, baseName: 99, name: 'Soul Bite', type: 'helm' });
assert.strictEqual(I.displayName(malformedBase), 'Unidentified Helm'); assert(!I.displayName(malformedBase).includes('Soul Bite'));
assert.strictEqual(I.displayName({}), 'Item'); secret.identified = true; assert.strictEqual(I.displayName(secret), 'A Different Secret');

// Scroll records have stable utility identity and are ordinary 1x1, non-socketable common items.
const made = I.createScroll('scroll-made');
assert.deepStrictEqual(plain({ id: made.id, kind: made.kind, utility: made.utility, rarity: made.rarity,
  width: made.width, height: made.height, socketable: made.socketable }),
  { id: 'scroll-made', kind: 'utility', utility: 'identify-scroll', rarity: 'common', width: 1, height: 1, socketable: false });
assert.strictEqual(made.component, undefined); assert.strictEqual(I.isScroll(made), true);
assert.strictEqual(I.isScroll(Object.assign({}, made, { width: 2 })), false);
assert.strictEqual(I.isScroll(Object.assign({}, made, { kind: 'rune', component: true })), false);
assert.throws(() => I.createScroll('  '), /requires a non-empty, trimmed string id/);
assert.throws(() => I.createScroll(9), /requires a non-empty, trimmed string id/);

// Quotes are pure; commit consumes precisely one quoted instance and changes only identification.
const filler = equipment('common', { id: 'filler', name: 'Plain Sword' });
const scrollA = I.createScroll('scroll-a'), targetA = equipment('rare', { id: 'target-a', identified: false,
  condition: { durability: 9 }, gems: [{ id: 'nested-rune', kind: 'rune', nested: { roll: 71 } }, null] });
const nestedRune = targetA.gems[0], nestedRoll = nestedRune.nested, plA = player([filler, scrollA, targetA]);
const beforeQuote = snap(plA), quoteA = I.quote(plA, scrollA.id, targetA.id);
assert.strictEqual(quoteA.ok, true); assert.strictEqual(snap(plA), beforeQuote); assert(Object.isFrozen(quoteA));
const targetSnapshot = Object.assign({}, targetA), fillerSnapshot = snap(filler), goldBefore = plA.gold;
const resultA = I.commit(plA, quoteA);
assert.deepStrictEqual(plain(resultA), { ok: true, reason: '', mode: 'scroll', scrollId: 'scroll-a', targetId: 'target-a', consumed: 1, identified: ['target-a'] });
assert.deepStrictEqual(plA.inv, [filler, targetA]); assert.strictEqual(plA.inv[1], targetA); assert.strictEqual(targetA.identified, true);
assert.strictEqual(targetA.id, targetSnapshot.id); assert.strictEqual(targetA._gx, targetSnapshot._gx); assert.strictEqual(targetA._gy, targetSnapshot._gy);
assert.strictEqual(targetA.durability, targetSnapshot.durability); assert.strictEqual(targetA.condition, targetSnapshot.condition);
assert.strictEqual(targetA.gems, targetSnapshot.gems); assert.strictEqual(targetA.gems[0], nestedRune); assert.strictEqual(nestedRune.nested, nestedRoll);
assert.strictEqual(snap(filler), fillerSnapshot); assert.strictEqual(plA.gold, goldBefore);
assert.strictEqual(I.commit(plA, quoteA).ok, false, 'a consumed plan cannot consume another scroll');

// Every input-validation and target-validation failure is mutation-free.
const badCases = [
  [null, 's', 't', 'invalid-player'], [{}, 's', 't', 'invalid-inventory'],
  [player([]), '', 't', 'missing-scroll-id'], [player([]), ' s ', 't', 'malformed-scroll-id'],
  [player([]), 's', null, 'missing-target-id'], [player([]), 's', 3, 'malformed-target-id'],
  [player([]), 'same', 'same', 'same-id'],
];
for (const [pl, scrollId, targetId, reason] of badCases) {
  const before = snap(pl); assert.strictEqual(I.quote(pl, scrollId, targetId).reason, reason); assert.strictEqual(snap(pl), before);
}
const invBad = [
  [player([null]), 'invalid-inventory-item'], [player([equipment('rare', { id: undefined })]), 'missing-item-id'],
  [player([equipment('rare', { id: ' bad ' })]), 'malformed-item-id'],
  [player([equipment('rare', { id: 'dup' }), equipment('magic', { id: 'dup' })]), 'duplicate-item-id'],
];
for (const [pl, reason] of invBad) { const before = snap(pl); assert.strictEqual(I.quote(pl, 's', 't').reason, reason); assert.strictEqual(snap(pl), before); }
const invalidTargetCases = [
  [player([equipment('rare', { id: 'wrong-s' }), equipment('rare', { id: 't', identified: false })]), 'wrong-s', 't', 'wrong-utility'],
  [player([I.createScroll('s')]), 's', 'absent', 'missing-target'],
  [player([I.createScroll('s'), equipment('common', { id: 't', identified: false })]), 's', 't', 'ineligible-target'],
  [player([I.createScroll('s'), equipment('rare', { id: 't', identified: true })]), 's', 't', 'already-identified'],
  [player([equipment('rare', { id: 't', identified: false })]), 'absent', 't', 'missing-scroll'],
];
for (const [pl, sid, tid, reason] of invalidTargetCases) {
  const before = snap(pl); const q = I.quote(pl, sid, tid); assert.strictEqual(q.reason, reason);
  assert.strictEqual(I.commit(pl, q).reason, reason); assert.strictEqual(snap(pl), before);
}

// Same-id clones, marker/state changes, duplicate introduction, and inventory replacement invalidate a quote atomically.
function staleFixture() {
  const scroll = I.createScroll(`stale-scroll-${++serial}`), target = equipment('unique', { id: `stale-target-${serial}`, identified: false });
  const pl = player([scroll, target]); return { pl, scroll, target, quote: I.quote(pl, scroll.id, target.id) };
}
{
  const f = staleFixture(), beforeTarget = snap(f.target); f.pl.inv[0] = Object.assign({}, f.scroll);
  const before = snap(f.pl); assert.strictEqual(I.commit(f.pl, f.quote).reason, 'stale-scroll');
  assert.strictEqual(snap(f.pl), before); assert.strictEqual(snap(f.target), beforeTarget);
}
{
  const f = staleFixture(); f.pl.inv[1] = Object.assign({}, f.target); const before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, f.quote).reason, 'stale-target'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(); f.scroll.utility = 'town-portal-scroll'; const before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, f.quote).reason, 'stale-state'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(); f.target.stats.str++; const before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, f.quote).reason, 'stale-state'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(); f.pl.inv.push(equipment('common', { id: f.scroll.id })); const before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, f.quote).reason, 'duplicate-item-id'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(); f.pl.inv = f.pl.inv.slice(); const before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, f.quote).reason, 'stale-inventory'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(), other = player(f.pl.inv); const before = snap(f.pl);
  assert.strictEqual(I.commit(other, f.quote).reason, 'stale-player'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = staleFixture(), before = snap(f.pl);
  assert.strictEqual(I.commit(f.pl, { ok: true, mode: 'scroll', scrollId: f.scroll.id, targetId: f.target.id }).reason, 'invalid-plan');
  assert.strictEqual(snap(f.pl), before);
}

// Descriptor-hostile inventories and targets fail without consuming the scroll
// or partially revealing the item.
{
  const f = staleFixture(), before = snap(f.pl);
  Object.defineProperty(f.pl.inv, 'length', { writable: false });
  const result = I.commit(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-inventory'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.pl.inv[0], f.scroll); assert.strictEqual(f.target.identified, false);
}
{
  const f = staleFixture(), before = snap(f.pl);
  Object.defineProperty(f.pl.inv, '0', { value: f.scroll, writable: false, enumerable: true, configurable: true });
  const result = I.commit(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-inventory'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.pl.inv[0], f.scroll); assert.strictEqual(f.target.identified, false);
}
{
  const f = staleFixture(); let setterCalls = 0;
  Object.defineProperty(f.pl.inv, '0', { get: () => f.scroll, set: () => { setterCalls++; throw new Error('hostile index'); },
    enumerable: true, configurable: true });
  const before = snap(f.pl), result = I.commit(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-inventory'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(setterCalls, 0); assert.strictEqual(f.target.identified, false);
}
{
  const scroll = I.createScroll('accessor-scroll'), target = equipment('rare', { id: 'accessor-target', identified: false });
  let setterCalls = 0;
  Object.defineProperty(target, 'identified', { get: () => false, set: () => { setterCalls++; throw new Error('hostile target'); },
    enumerable: true, configurable: true });
  const pl = player([scroll, target]), q = I.quote(pl, scroll.id, target.id), before = snap(pl), result = I.commit(pl, q);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(pl), before);
  assert.strictEqual(setterCalls, 0); assert.strictEqual(pl.inv[0], scroll);
}
{
  const f = staleFixture(), before = snap(f.pl);
  Object.defineProperty(f.target, 'identified', { value: false, writable: false, enumerable: true, configurable: true });
  const result = I.commit(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.pl.inv[0], f.scroll); assert.strictEqual(f.target.identified, false);
}
{
  const scroll = I.createScroll('throw-scroll'), raw = equipment('unique', { id: 'throw-target', identified: false });
  let armed = false;
  const target = new Proxy(raw, { defineProperty(object, key, descriptor) {
    const committed = Reflect.defineProperty(object, key, descriptor);
    if (armed && key === 'identified' && descriptor.value === true) throw new Error('define failed after write');
    return committed;
  } });
  const pl = player([scroll, target]), q = I.quote(pl, scroll.id, target.id), before = snap(pl); armed = true;
  const result = I.commit(pl, q);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(pl), before);
  assert.strictEqual(pl.inv[0], scroll); assert.strictEqual(raw.identified, false);
}

// Town identify-all quotes inventory only, costs nothing, and preserves every object/nested identity.
const allRare = equipment('rare', { id: 'all-rare', identified: false }), allSet = equipment('set', { id: 'all-set', identified: false,
  gems: [{ id: 'all-gem', kind: 'gem' }] }), allCommon = equipment('common', { id: 'all-common', identified: false });
const equippedHidden = equipment('unique', { id: 'equipped-hidden', identified: false });
const stashHidden = equipment('magic', { id: 'stash-hidden', identified: false });
const corpseHidden = equipment('rare', { id: 'corpse-hidden', identified: false });
const town = player([allRare, made, allSet, allCommon]); town.equip.weapon = equippedHidden; town.stash.push(stashHidden);
town.corpses.push({ gear: [{ slot: 'helm', item: corpseHidden }] });
const townGold = town.gold, allNested = allSet.gems[0], allBefore = snap(town), allQuote = I.quoteAll(town);
assert.deepStrictEqual(plain(allQuote), { ok: true, reason: '', mode: 'all', targetIds: ['all-rare', 'all-set'], count: 2, cost: 0 });
assert.strictEqual(snap(town), allBefore); const allCommit = I.commitAll(town, allQuote);
assert.deepStrictEqual(plain(allCommit), { ok: true, reason: '', mode: 'all', identified: ['all-rare', 'all-set'], count: 2, cost: 0 });
assert.strictEqual(allRare.identified, true); assert.strictEqual(allSet.identified, true); assert.strictEqual(allSet.gems[0], allNested);
assert.strictEqual(allCommon.identified, false, 'ineligible inventory state is not targeted or normalized by service');
assert.strictEqual(equippedHidden.identified, false); assert.strictEqual(stashHidden.identified, false); assert.strictEqual(corpseHidden.identified, false);
assert.strictEqual(town.gold, townGold); assert.strictEqual(town.inv.includes(made), true, 'town service consumes no scroll');

// Identify-all is membership- and state-atomic, including unrelated inventory members.
function allFixture() {
  const first = equipment('rare', { id: `all-first-${++serial}`, identified: false });
  const second = equipment('magic', { id: `all-second-${serial}`, identified: false });
  const common = equipment('common', { id: `all-common-${serial}` });
  const pl = player([first, common, second]); return { pl, first, second, common, quote: I.quoteAll(pl) };
}
{
  const f = allFixture(); f.pl.inv.push(I.createScroll(`added-${serial}`)); const before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, f.quote).reason, 'stale-membership'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.first.identified, false); assert.strictEqual(f.second.identified, false);
}
{
  const f = allFixture(); f.pl.inv.splice(1, 1); const before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, f.quote).reason, 'stale-membership'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = allFixture(); f.pl.inv[1] = Object.assign({}, f.common); const before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, f.quote).reason, 'stale-replacement'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = allFixture(); f.common.name = 'Changed after quote'; const before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, f.quote).reason, 'stale-state'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = allFixture(); f.second.identified = true; const before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, f.quote).reason, 'stale-state'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.first.identified, false, 'no earlier target may be partially identified');
}
{
  const f = allFixture(); f.pl.inv.reverse(); const result = I.commitAll(f.pl, f.quote);
  assert.strictEqual(result.ok, true, 'order changes do not change inventory membership');
  assert.strictEqual(f.first.identified, true); assert.strictEqual(f.second.identified, true);
}
{
  const empty = player([equipment('common', { id: 'nothing-to-identify' })]), q = I.quoteAll(empty), before = snap(empty);
  assert.strictEqual(q.ok, true); assert.strictEqual(q.count, 0); assert.strictEqual(I.commitAll(empty, q).ok, true);
  assert.strictEqual(snap(empty), before);
}
{
  const f = allFixture(), before = snap(f.pl);
  assert.strictEqual(I.commitAll(f.pl, plain(f.quote)).reason, 'invalid-plan'); assert.strictEqual(snap(f.pl), before);
}
{
  const f = allFixture(); let setterCalls = 0;
  Object.defineProperty(f.second, 'identified', { get: () => false, set: () => { setterCalls++; throw new Error('hostile target'); },
    enumerable: true, configurable: true });
  const before = snap(f.pl), result = I.commitAll(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(setterCalls, 0); assert.strictEqual(f.first.identified, false);
}
{
  const f = allFixture();
  Object.defineProperty(f.second, 'identified', { value: false, writable: false, enumerable: true, configurable: true });
  const before = snap(f.pl), result = I.commitAll(f.pl, f.quote);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(f.pl), before);
  assert.strictEqual(f.first.identified, false); assert.strictEqual(f.second.identified, false);
}
{
  const first = equipment('rare', { id: 'rollback-first', identified: false });
  const raw = equipment('magic', { id: 'rollback-throwing', identified: false }); let armed = false;
  const throwing = new Proxy(raw, { defineProperty(object, key, descriptor) {
    const committed = Reflect.defineProperty(object, key, descriptor);
    if (armed && key === 'identified' && descriptor.value === true) throw new Error('define failed after write');
    return committed;
  } });
  const pl = player([first, throwing]), q = I.quoteAll(pl), before = snap(pl); armed = true;
  const result = I.commitAll(pl, q);
  assert.strictEqual(result.reason, 'immutable-target'); assert.strictEqual(snap(pl), before);
  assert.strictEqual(first.identified, false, 'an earlier target must be rolled back'); assert.strictEqual(raw.identified, false);
}

console.log('item identification contract: ok');
