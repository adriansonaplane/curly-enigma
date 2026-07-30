// ============ DIABLOID: item-identification.js — concealed loot and atomic identification ============
'use strict';

// Pure item/inventory state only: this module deliberately has no DOM or
// generator dependency. Quotes are opaque, in-memory capabilities so commits
// can reject a same-id replacement as well as a changed identification state.
const ItemIdentification = (() => {
  const EQUIPMENT_TYPES = Object.freeze([
    'sword', 'axe', 'mace', 'dagger', 'spear', 'claw', 'bow', 'crossbow', 'wand', 'staff',
    'helm', 'chest', 'gloves', 'boots', 'belt', 'shield', 'orb', 'ring', 'amulet',
  ]);
  const CHARM_TYPES = Object.freeze(['charm_small', 'charm_large', 'charm_grand']);
  const ELIGIBLE_RARITIES = Object.freeze(['magic', 'rare', 'set', 'unique']);
  const TYPE_LABELS = Object.freeze({
    sword: 'Sword', axe: 'Axe', mace: 'Mace', dagger: 'Dagger', spear: 'Spear', claw: 'Claw',
    bow: 'Bow', crossbow: 'Crossbow', wand: 'Wand', staff: 'Staff', helm: 'Helm', chest: 'Armor',
    gloves: 'Gloves', boots: 'Boots', belt: 'Belt', shield: 'Shield', orb: 'Orb', ring: 'Ring', amulet: 'Amulet',
    charm_small: 'Small Charm', charm_large: 'Large Charm', charm_grand: 'Grand Charm',
  });
  const SCROLL = Object.freeze({
    kind: 'utility', utility: 'identify-scroll', name: 'Scroll of Identification',
    description: 'Identifies one unidentified item in your inventory.',
    rarity: 'common', width: 1, height: 1, reqLvl: 1, value: 80, price: 80,
  });
  const REASONS = Object.freeze({
    INVALID_PLAYER: 'invalid-player', INVALID_INVENTORY: 'invalid-inventory',
    INVALID_INVENTORY_ITEM: 'invalid-inventory-item', MISSING_ITEM_ID: 'missing-item-id',
    MALFORMED_ITEM_ID: 'malformed-item-id', DUPLICATE_ITEM_ID: 'duplicate-item-id',
    MISSING_SCROLL_ID: 'missing-scroll-id', MALFORMED_SCROLL_ID: 'malformed-scroll-id',
    MISSING_TARGET_ID: 'missing-target-id', MALFORMED_TARGET_ID: 'malformed-target-id',
    SAME_ID: 'same-id', MISSING_SCROLL: 'missing-scroll', WRONG_UTILITY: 'wrong-utility',
    MISSING_TARGET: 'missing-target', INELIGIBLE_TARGET: 'ineligible-target',
    ALREADY_IDENTIFIED: 'already-identified', INVALID_PLAN: 'invalid-plan',
    STALE_PLAYER: 'stale-player', STALE_INVENTORY: 'stale-inventory',
    STALE_SCROLL: 'stale-scroll', STALE_TARGET: 'stale-target',
    STALE_MEMBERSHIP: 'stale-membership', STALE_REPLACEMENT: 'stale-replacement',
    STALE_STATE: 'stale-state', IMMUTABLE_TARGET: 'immutable-target',
    IMMUTABLE_INVENTORY: 'immutable-inventory',
  });

  const typeSet = new Set(EQUIPMENT_TYPES), charmTypeSet = new Set(CHARM_TYPES), raritySet = new Set(ELIGIBLE_RARITIES);
  const singlePlans = new WeakMap(), allPlans = new WeakMap();
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const idIssue = value => {
    if (value === undefined || value === null || value === '') return 'missing';
    if (typeof value !== 'string' || !value.trim() || value.trim() !== value) return 'malformed';
    return '';
  };

  function isEligible(item) {
    if (!object(item)) return false;
    if (item.kind === 'charm' && charmTypeSet.has(item.type) && item.rarity === 'magic') {
      const form = item.type.slice(6);
      const height = { small: 1, large: 2, grand: 3 }[form];
      if (item.form !== form || Number(item.width) !== 1 || Number(item.height) !== height) return false;
      // Once the authoritative charm module is loaded, malformed roll records
      // must not become identifiable merely by forging the public shell.
      if (typeof InventoryCharms !== 'undefined' && InventoryCharms &&
          typeof InventoryCharms.isCharm === 'function' && !InventoryCharms.isCharm(item)) return false;
      return true;
    }
    if (!typeSet.has(item.type) || !raritySet.has(item.rarity)) return false;
    if (item.potion || item.component) return false;
    // Generated equipment historically has no kind; projected/new records may
    // opt into the explicit equipment marker. Every other kind is non-equipment.
    return item.kind === undefined || item.kind === null || item.kind === 'equipment';
  }

  function isIdentified(item) { return !isEligible(item) || item.identified !== false; }
  function needsIdentification(item) { return isEligible(item) && item.identified === false; }

  function normalize(item) {
    if (!object(item)) return item;
    // Only an explicit legacy-safe boolean false on eligible equipment is
    // meaningful. Missing, null, string, and numeric values migrate to true.
    item.identified = isEligible(item) && item.identified === false ? false : true;
    return item;
  }

  function prepareDrop(item) {
    if (!object(item)) return item;
    item.identified = isEligible(item) ? false : true;
    return item;
  }

  function baseName(item) {
    const supplied = object(item) ? text(item.baseName) : null;
    if (supplied) return supplied;
    return object(item) && TYPE_LABELS[item.type] || 'Item';
  }

  function displayName(item) {
    if (needsIdentification(item)) return `Unidentified ${baseName(item)}`;
    return object(item) && (text(item.name) || text(item.baseName) || TYPE_LABELS[item.type]) || 'Item';
  }

  function createScroll(id) {
    if (idIssue(id)) throw new TypeError('Scroll of Identification requires a non-empty, trimmed string id.');
    // Caller owns global uniqueness; inventory validation rejects collisions.
    return {
      id, kind: SCROLL.kind, utility: SCROLL.utility, name: SCROLL.name, baseName: SCROLL.name,
      description: SCROLL.description, rarity: SCROLL.rarity, width: SCROLL.width, height: SCROLL.height,
      reqLvl: SCROLL.reqLvl, value: SCROLL.value, price: SCROLL.price, socketable: false,
    };
  }

  function isScroll(item) {
    return object(item) && !idIssue(item.id) && item.kind === SCROLL.kind && item.utility === SCROLL.utility &&
      Number(item.width) === SCROLL.width && Number(item.height) === SCROLL.height &&
      !item.component && !item.potion && item.socketable !== true;
  }

  function fingerprint(value) {
    const seen = new Map();
    function visit(current) {
      if (current === null) return 'null';
      const kind = typeof current;
      if (kind === 'undefined') return 'undefined';
      if (kind === 'string') return `string:${JSON.stringify(current)}`;
      if (kind === 'boolean') return `boolean:${current}`;
      if (kind === 'number') return Number.isNaN(current) ? 'number:NaN' :
        current === Infinity ? 'number:Infinity' : current === -Infinity ? 'number:-Infinity' :
          Object.is(current, -0) ? 'number:-0' : `number:${current}`;
      if (kind === 'bigint') return `bigint:${current}`;
      if (kind === 'symbol') return `symbol:${String(current.description || '')}`;
      if (kind === 'function') return `function:${current.name || ''}`;
      if (seen.has(current)) return `ref:${seen.get(current)}`;
      const ref = seen.size; seen.set(current, ref);
      if (Array.isArray(current)) return `array:${ref}[${current.map(visit).join(',')}]`;
      const keys = Object.keys(current).sort();
      return `object:${ref}{${keys.map(key => `${JSON.stringify(key)}=${visit(current[key])}`).join(',')}}`;
    }
    return visit(value);
  }

  function inventory(player) {
    if (!object(player)) return { ok: false, reason: REASONS.INVALID_PLAYER };
    if (!Array.isArray(player.inv)) return { ok: false, reason: REASONS.INVALID_INVENTORY };
    const byId = new Map();
    for (const item of player.inv) {
      if (!object(item)) return { ok: false, reason: REASONS.INVALID_INVENTORY_ITEM };
      const issue = idIssue(item.id);
      if (issue) return { ok: false, reason: issue === 'missing' ? REASONS.MISSING_ITEM_ID : REASONS.MALFORMED_ITEM_ID };
      if (byId.has(item.id)) return { ok: false, reason: REASONS.DUPLICATE_ITEM_ID, id: item.id };
      byId.set(item.id, item);
    }
    return { ok: true, inv: player.inv, byId };
  }

  const frozenIds = ids => Object.freeze(ids.slice());
  function singleFailure(reason, scrollId = null, targetId = null) {
    return Object.freeze({ ok: false, reason, mode: 'scroll', scrollId, targetId, consume: 0 });
  }
  function allFailure(reason) {
    return Object.freeze({ ok: false, reason, mode: 'all', targetIds: frozenIds([]), count: 0, cost: 0 });
  }
  function singleResult(reason, scrollId, targetId) {
    return Object.freeze({ ok: false, reason, mode: 'scroll', scrollId, targetId,
      consumed: 0, identified: frozenIds([]) });
  }
  function allResult(reason) {
    return Object.freeze({ ok: false, reason, mode: 'all', identified: frozenIds([]), count: 0, cost: 0 });
  }

  function quote(player, scrollId, targetId) {
    const scrollIssue = idIssue(scrollId);
    if (scrollIssue) return singleFailure(scrollIssue === 'missing' ? REASONS.MISSING_SCROLL_ID : REASONS.MALFORMED_SCROLL_ID,
      typeof scrollId === 'string' ? scrollId : null, typeof targetId === 'string' ? targetId : null);
    const targetIssue = idIssue(targetId);
    if (targetIssue) return singleFailure(targetIssue === 'missing' ? REASONS.MISSING_TARGET_ID : REASONS.MALFORMED_TARGET_ID,
      scrollId, typeof targetId === 'string' ? targetId : null);
    if (scrollId === targetId) return singleFailure(REASONS.SAME_ID, scrollId, targetId);
    const selected = inventory(player);
    if (!selected.ok) return singleFailure(selected.reason, scrollId, targetId);
    const scroll = selected.byId.get(scrollId), target = selected.byId.get(targetId);
    if (!scroll) return singleFailure(REASONS.MISSING_SCROLL, scrollId, targetId);
    if (!isScroll(scroll)) return singleFailure(REASONS.WRONG_UTILITY, scrollId, targetId);
    if (!target) return singleFailure(REASONS.MISSING_TARGET, scrollId, targetId);
    if (!isEligible(target)) return singleFailure(REASONS.INELIGIBLE_TARGET, scrollId, targetId);
    if (!needsIdentification(target)) return singleFailure(REASONS.ALREADY_IDENTIFIED, scrollId, targetId);

    const plan = Object.freeze({ ok: true, reason: '', mode: 'scroll', scrollId, targetId, consume: 1 });
    singlePlans.set(plan, { player, inv: selected.inv, scroll, target,
      scrollState: fingerprint(scroll), targetState: fingerprint(target) });
    return plan;
  }

  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  // Identification commits deliberately support data properties only. Calling
  // an accessor setter would let arbitrary user code throw (or mutate unrelated
  // state) halfway through a multi-item commit. Missing own properties retain
  // normal assignment semantics, but only when no inherited descriptor blocks
  // creation of a safe own data property.
  function identificationMutation(item) {
    try {
      const own = Object.getOwnPropertyDescriptor(item, 'identified');
      if (own) {
        if (!hasOwn(own, 'value') || own.writable !== true) return null;
        return { item, hadOwn: true, descriptor: own };
      }

      let prototype = Object.getPrototypeOf(item);
      while (prototype) {
        const inherited = Object.getOwnPropertyDescriptor(prototype, 'identified');
        if (inherited) {
          if (!hasOwn(inherited, 'value') || inherited.writable !== true) return null;
          break;
        }
        prototype = Object.getPrototypeOf(prototype);
      }
      if (!Object.isExtensible(item)) return null;
      return { item, hadOwn: false, descriptor: null };
    } catch (_) {
      // Descriptor/prototype traps are not trusted as writable capabilities.
      return null;
    }
  }

  function applyIdentification(mutation) {
    if (mutation.hadOwn) {
      const descriptor = mutation.descriptor;
      Object.defineProperty(mutation.item, 'identified', {
        value: true, writable: descriptor.writable,
        enumerable: descriptor.enumerable, configurable: descriptor.configurable,
      });
    } else {
      Object.defineProperty(mutation.item, 'identified', {
        value: true, writable: true, enumerable: true, configurable: true,
      });
    }
    if (mutation.item.identified !== true) throw new TypeError('Identification write did not commit.');
  }

  function restoreIdentification(mutation) {
    try {
      if (mutation.hadOwn) Object.defineProperty(mutation.item, 'identified', mutation.descriptor);
      else if (!Reflect.deleteProperty(mutation.item, 'identified')) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  // A one-scroll commit has to shift and shrink the quoted inventory. Require
  // canonical dense array slots up front, including a writable length, so a
  // hostile index descriptor cannot make splice fail after identifying the
  // target. Descriptors are retained for best-effort transactional rollback if
  // a Proxy trap still throws despite the preflight.
  function inventoryRemoval(inv, index) {
    try {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(inv, 'length');
      const length = inv.length;
      if (!lengthDescriptor || !hasOwn(lengthDescriptor, 'value') || lengthDescriptor.writable !== true ||
          !Number.isSafeInteger(length) || length < 1 || index < 0 || index >= length) return null;

      const descriptors = [];
      for (let slot = 0; slot < length; slot++) {
        const descriptor = Object.getOwnPropertyDescriptor(inv, String(slot));
        if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.writable !== true ||
            descriptor.enumerable !== true || descriptor.configurable !== true) return null;
        descriptors.push(descriptor);
      }
      return { inv, index, length, lengthDescriptor, descriptors };
    } catch (_) {
      return null;
    }
  }

  function restoreInventory(removal) {
    try {
      if (removal.inv.length < removal.length) {
        Object.defineProperty(removal.inv, 'length', Object.assign({}, removal.lengthDescriptor, { value: removal.length }));
      }
      for (let slot = 0; slot < removal.descriptors.length; slot++)
        Object.defineProperty(removal.inv, String(slot), removal.descriptors[slot]);
      Object.defineProperty(removal.inv, 'length', removal.lengthDescriptor);
      return true;
    } catch (_) {
      return false;
    }
  }

  function commit(player, plan) {
    if (plan && plan.ok === false) return singleResult(plan.reason || REASONS.INVALID_PLAN,
      plan.scrollId || null, plan.targetId || null);
    const expected = object(plan) && singlePlans.get(plan);
    if (!expected) return singleResult(REASONS.INVALID_PLAN, plan && plan.scrollId || null, plan && plan.targetId || null);
    if (player !== expected.player) return singleResult(REASONS.STALE_PLAYER, plan.scrollId, plan.targetId);
    if (!object(player) || player.inv !== expected.inv || !Array.isArray(player.inv))
      return singleResult(REASONS.STALE_INVENTORY, plan.scrollId, plan.targetId);
    const selected = inventory(player);
    if (!selected.ok) return singleResult(selected.reason, plan.scrollId, plan.targetId);
    const scroll = selected.byId.get(plan.scrollId), target = selected.byId.get(plan.targetId);
    if (!scroll) return singleResult(REASONS.STALE_SCROLL, plan.scrollId, plan.targetId);
    if (!target) return singleResult(REASONS.STALE_TARGET, plan.scrollId, plan.targetId);
    if (scroll !== expected.scroll) return singleResult(REASONS.STALE_SCROLL, plan.scrollId, plan.targetId);
    if (target !== expected.target) return singleResult(REASONS.STALE_TARGET, plan.scrollId, plan.targetId);
    if (fingerprint(scroll) !== expected.scrollState || fingerprint(target) !== expected.targetState ||
      !isScroll(scroll) || !needsIdentification(target))
      return singleResult(REASONS.STALE_STATE, plan.scrollId, plan.targetId);
    const scrollIndex = player.inv.indexOf(scroll);
    if (scrollIndex < 0) return singleResult(REASONS.STALE_SCROLL, plan.scrollId, plan.targetId);
    const targetMutation = identificationMutation(target);
    if (!targetMutation) return singleResult(REASONS.IMMUTABLE_TARGET, plan.scrollId, plan.targetId);
    const removal = inventoryRemoval(player.inv, scrollIndex);
    if (!removal) return singleResult(REASONS.IMMUTABLE_INVENTORY, plan.scrollId, plan.targetId);

    // Remove first, then identify. If an exotic target defeats the descriptor
    // preflight, restore both sides before reporting a mutation-free failure.
    let stage = 'inventory';
    try {
      Array.prototype.splice.call(player.inv, scrollIndex, 1);
      stage = 'target';
      applyIdentification(targetMutation);
    } catch (_) {
      if (stage === 'target') restoreIdentification(targetMutation);
      restoreInventory(removal);
      return singleResult(stage === 'inventory' ? REASONS.IMMUTABLE_INVENTORY : REASONS.IMMUTABLE_TARGET,
        plan.scrollId, plan.targetId);
    }
    return Object.freeze({ ok: true, reason: '', mode: 'scroll', scrollId: plan.scrollId,
      targetId: plan.targetId, consumed: 1, identified: frozenIds([plan.targetId]) });
  }

  function quoteAll(player) {
    const selected = inventory(player);
    if (!selected.ok) return allFailure(selected.reason);
    const targets = selected.inv.filter(needsIdentification);
    const targetIds = targets.map(item => item.id);
    const plan = Object.freeze({ ok: true, reason: '', mode: 'all', targetIds: frozenIds(targetIds),
      count: targetIds.length, cost: 0 });
    allPlans.set(plan, { player, inv: selected.inv,
      members: selected.inv.map(item => ({ id: item.id, item, state: fingerprint(item) })), targets });
    return plan;
  }

  function commitAll(player, plan) {
    if (plan && plan.ok === false) return allResult(plan.reason || REASONS.INVALID_PLAN);
    const expected = object(plan) && allPlans.get(plan);
    if (!expected) return allResult(REASONS.INVALID_PLAN);
    if (player !== expected.player) return allResult(REASONS.STALE_PLAYER);
    if (!object(player) || player.inv !== expected.inv || !Array.isArray(player.inv)) return allResult(REASONS.STALE_INVENTORY);
    const selected = inventory(player);
    if (!selected.ok) return allResult(selected.reason);
    if (selected.inv.length !== expected.members.length) return allResult(REASONS.STALE_MEMBERSHIP);
    for (const member of expected.members) {
      const current = selected.byId.get(member.id);
      if (!current) return allResult(REASONS.STALE_MEMBERSHIP);
      if (current !== member.item) return allResult(REASONS.STALE_REPLACEMENT);
      if (fingerprint(current) !== member.state) return allResult(REASONS.STALE_STATE);
    }
    const currentTargets = selected.inv.filter(needsIdentification);
    if (currentTargets.length !== expected.targets.length || currentTargets.some(item => !expected.targets.includes(item)))
      return allResult(REASONS.STALE_STATE);
    const mutations = [];
    for (const item of expected.targets) {
      const mutation = identificationMutation(item);
      if (!mutation) return allResult(REASONS.IMMUTABLE_TARGET);
      mutations.push(mutation);
    }

    const attempted = [];
    try {
      for (const mutation of mutations) {
        // Include the current target so a Proxy that writes and then throws is
        // also offered rollback.
        attempted.push(mutation);
        applyIdentification(mutation);
      }
    } catch (_) {
      for (let index = attempted.length - 1; index >= 0; index--) restoreIdentification(attempted[index]);
      return allResult(REASONS.IMMUTABLE_TARGET);
    }
    return Object.freeze({ ok: true, reason: '', mode: 'all', identified: frozenIds(plan.targetIds),
      count: plan.targetIds.length, cost: 0 });
  }

  function identify(player, scrollId, targetId) { return commit(player, quote(player, scrollId, targetId)); }
  function identifyAll(player, plan) { return commitAll(player, plan || quoteAll(player)); }

  return Object.freeze({ EQUIPMENT_TYPES, CHARM_TYPES, ELIGIBLE_RARITIES, TYPE_LABELS, SCROLL, REASONS,
    isEligible, isIdentified, needsIdentification, normalize, prepareDrop, displayName,
    createScroll, makeScroll: createScroll, isScroll, isIdentificationScroll: isScroll,
    quote, quoteOne: quote, quoteIdentify: quote, commit, commitOne: commit, commitIdentify: commit,
    identify, identifyOne: identify, quoteAll, commitAll, identifyAll });
})();

globalThis.ItemIdentification = ItemIdentification;
