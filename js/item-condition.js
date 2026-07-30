// ============ DIABLOID: item-condition.js — durability and atomic repairs ============
'use strict';

// This module deliberately knows nothing about the DOM or the item generator.
// Its small type table is part of the save contract, making old-save migration
// deterministic even if generation balance changes later.
const ItemCondition = (() => {
  const WEAPONS = new Set(['sword', 'axe', 'mace', 'dagger', 'spear', 'claw', 'bow', 'crossbow', 'wand', 'staff']);
  const ARMOR = new Set(['helm', 'chest', 'gloves', 'boots', 'belt', 'shield', 'orb']);
  const JEWELRY = new Set(['ring', 'amulet']);
  const TYPE_BONUS = Object.freeze({
    sword: 8, axe: 12, mace: 14, dagger: 2, spear: 7, claw: 4, bow: 5, crossbow: 9, wand: 1, staff: 6,
    helm: 7, chest: 18, gloves: 4, boots: 6, belt: 5, shield: 14, orb: 2,
  });
  const clampInt = (value, low, high) => Math.min(high, Math.max(low, Math.floor(Number(value))));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const idOf = item => object(item) && typeof item.id === 'string' && item.id.trim() ? item.id : null;

  function maxDurability(item) {
    if (!object(item) || JEWELRY.has(item.type) || item.component || item.kind === 'gem' || item.kind === 'rune' || item.potion) return 0;
    const family = WEAPONS.has(item.type) ? 32 : ARMOR.has(item.type) ? 38 : 0;
    if (!family) return 0;
    const tier = Number.isFinite(Number(item.tier)) ? clampInt(item.tier, 0, 4) : 0;
    return clampInt(family + (TYPE_BONUS[item.type] || 0) + tier * 8, 1, 100);
  }

  function condition(item) {
    const max = maxDurability(item);
    if (!max) return { durability: 0, maxDurability: 0 };
    const source = item && item.durability, raw = Number(source);
    // Missing and non-finite values are legacy records, and therefore begin
    // full. Finite malformed values are clamped rather than silently refilled.
    const legacyMissing = source === undefined || source === null || source === '';
    const durability = !legacyMissing && Number.isFinite(raw) ? clampInt(raw, 0, max) : max;
    return { durability, maxDurability: max };
  }

  function canonicalize(item) {
    if (!object(item)) return item;
    const next = condition(item);
    if (!next.maxDurability) {
      delete item.durability;
      delete item.maxDurability;
    } else {
      item.durability = next.durability;
      item.maxDurability = next.maxDurability;
    }
    return item;
  }

  function isBroken(item) {
    const state = condition(item);
    return state.maxDurability > 0 && state.durability === 0;
  }

  function wear(item, amount) {
    if (!object(item)) return { ok: false, reason: 'missing-item', amount: 0, before: 0, after: 0, broke: false, crossed: false };
    const beforeState = condition(item), requested = Number(amount);
    if (!beforeState.maxDurability || !Number.isFinite(requested) || requested <= 0)
      return { ok: false, reason: !beforeState.maxDurability ? 'not-durable' : 'invalid-amount', amount: 0,
        before: beforeState.durability, after: beforeState.durability, broke: false, crossed: false };
    const loss = Math.min(beforeState.durability, Math.floor(requested));
    if (!loss) return { ok: true, reason: '', amount: 0, before: beforeState.durability, after: beforeState.durability, broke: false, crossed: false };
    canonicalize(item);
    item.durability = beforeState.durability - loss;
    const broke = beforeState.durability > 0 && item.durability === 0;
    return { ok: true, reason: '', amount: loss, before: beforeState.durability, after: item.durability, broke, crossed: broke };
  }

  function owned(player, stash) {
    const result = [], seenIds = new Set(), seenObjects = new Set();
    const add = (item, location) => {
      if (!object(item) || seenObjects.has(item)) return;
      seenObjects.add(item);
      const id = idOf(item);
      if (!id || seenIds.has(id)) return;
      seenIds.add(id); result.push({ id, item, location });
    };
    const map = (record, prefix) => { if (object(record)) for (const key of Object.keys(record).sort()) add(record[key], `${prefix}.${key}`); };
    map(player && player.equip, 'equip');
    (Array.isArray(player && player.inv) ? player.inv : []).forEach((item, i) => add(item, `inv.${i}`));
    map(player && player.mercenary && player.mercenary.equipment, 'mercenary.equipment');
    const store = Array.isArray(stash) ? stash : Array.isArray(player && player.stash) ? player.stash : [];
    store.forEach((item, i) => add(item, `stash.${i}`));
    (Array.isArray(player && player.corpses) ? player.corpses : []).forEach((corpse, ci) =>
      (Array.isArray(corpse && corpse.gear) ? corpse.gear : []).forEach((entry, gi) => add(entry && (entry.item || entry), `corpses.${ci}.gear.${gi}`)));
    return result;
  }

  function repairCost(item) {
    const state = condition(item), missing = state.maxDurability - state.durability;
    if (!missing) return 0;
    const price = Number.isFinite(Number(item && item.price)) ? Math.max(0, Number(item.price)) : 0;
    return Math.max(1, Math.ceil((Math.max(10, price) * missing) / state.maxDurability * 0.25));
  }

  function entry(item, location) {
    const id = idOf(item), state = condition(item);
    if (!id) return { ok: false, id: null, reason: 'missing-id', cost: 0 };
    if (typeof ItemIdentification !== 'undefined' && ItemIdentification.needsIdentification(item))
      return { ok: false, id, reason: 'unidentified', cost: 0 };
    if (!state.maxDurability) return { ok: false, id, reason: 'not-durable', cost: 0 };
    if (item.ethereal) return { ok: false, id, reason: 'ethereal', cost: 0 };
    if (state.durability === state.maxDurability) return { ok: false, id, reason: 'already-full', cost: 0 };
    return { ok: true, id, location: location || '', reason: '', cost: repairCost(item),
      durability: state.durability, maxDurability: state.maxDurability };
  }

  function quote(item) { return entry(item); }
  function quoteOne(player, id, stash) {
    const found = owned(player, stash).find(record => record.id === id);
    return found ? entry(found.item, found.location) : { ok: false, id: id == null ? null : String(id), reason: 'not-owned', cost: 0 };
  }
  function quoteAll(player, stash) {
    const entries = owned(player, stash).map(record => entry(record.item, record.location));
    const repairs = entries.filter(value => value.ok).sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, cost: repairs.reduce((sum, value) => sum + value.cost, 0), entries: repairs,
      excluded: entries.filter(value => !value.ok).sort((a, b) => String(a.id).localeCompare(String(b.id))) };
  }

  function validatePlan(player, plan, stash) {
    if (!plan || plan.ok === false || !Array.isArray(plan.entries)) return { ok: false, reason: 'invalid-plan' };
    const lookup = new Map(owned(player, stash).map(record => [record.id, record.item]));
    const targets = [], plannedIds = new Set();
    for (const expected of plan.entries) {
      if (!expected || plannedIds.has(expected.id)) return { ok: false, reason: 'invalid-plan', id: expected && expected.id };
      plannedIds.add(expected.id);
      const item = lookup.get(expected.id);
      if (!item) return { ok: false, reason: 'stale-ownership', id: expected.id };
      const current = entry(item);
      if (!current.ok || current.cost !== expected.cost || current.durability !== expected.durability || current.maxDurability !== expected.maxDurability)
        return { ok: false, reason: 'stale-condition', id: expected.id };
      targets.push({ item, expected });
    }
    const cost = targets.reduce((sum, value) => sum + value.expected.cost, 0);
    if (cost !== plan.cost) return { ok: false, reason: 'stale-quote' };
    const gold = Number(player && player.gold);
    if (!Number.isFinite(gold) || gold < cost) return { ok: false, reason: 'insufficient-gold', cost };
    return { ok: true, cost, targets };
  }

  function commit(player, plan, stash) {
    const checked = validatePlan(player, plan, stash);
    if (!checked.ok) return Object.assign({ cost: 0, repaired: [] }, checked);
    // All validation is complete. These are the only writes in the commit.
    for (const target of checked.targets) {
      target.item.maxDurability = target.expected.maxDurability;
      target.item.durability = target.expected.maxDurability;
    }
    player.gold -= checked.cost;
    return { ok: true, reason: '', cost: checked.cost, repaired: checked.targets.map(value => value.expected.id) };
  }

  function repairOne(player, planOrId, stash) {
    const plan = typeof planOrId === 'string' ? (() => { const q = quoteOne(player, planOrId, stash); return { ok: q.ok, cost: q.cost, entries: q.ok ? [q] : [], reason: q.reason }; })() :
      planOrId && !Array.isArray(planOrId.entries) ? { ok: planOrId.ok, cost: planOrId.cost, entries: planOrId.ok ? [planOrId] : [], reason: planOrId.reason } : planOrId;
    if (!plan || !plan.ok) return { ok: false, reason: plan && plan.reason || 'invalid-plan', cost: 0, repaired: [] };
    return commit(player, plan, stash);
  }
  function repairAll(player, planOrStash, maybeStash) {
    const supplied = planOrStash && Array.isArray(planOrStash.entries);
    return commit(player, supplied ? planOrStash : quoteAll(player, planOrStash), supplied ? maybeStash : planOrStash);
  }

  return Object.freeze({ maxDurability, condition, canonicalize, normalize: canonicalize, isBroken, wear,
    owned, collectOwned: owned, repairCost, quote, quoteOne, quoteAll, commit, repair: repairOne, repairOne, repairAll });
})();

globalThis.ItemCondition = ItemCondition;
