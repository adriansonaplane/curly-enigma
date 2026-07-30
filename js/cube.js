// ============ DIABLOID: cube.js — atomic Horadric transmutation engine ============
'use strict';

// This module deliberately owns no DOM state. A caller identifies the exact
// inventory instances to transmute by id; preview is pure, and transmute builds
// and packs every output before replacing the player's inventory/gold fields.
const Cube = (() => {
  const COLS = 10, ROWS = 6;
  const COSTS = Object.freeze({ upgrade_tier: 1400, remove_gems: 500 });
  const recipes = Array.isArray(CUBE_RECIPES) ? CUBE_RECIPES : [];
  const recipeIds = new Set(recipes.map(recipe => recipe && recipe.id));

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const hasRecipe = id => recipeIds.has(id);
  const ok = (recipeId, cost, outputs) => ({ ok: true, recipeId, cost, outputs, reason: '' });
  const fail = (reason, recipeId = null, cost = 0) => ({ ok: false, recipeId, cost, outputs: [], reason });

  function clone(value, seen = new Map()) {
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const out = Array.isArray(value) ? [] : {};
    seen.set(value, out);
    for (const key of Object.keys(value)) out[key] = clone(value[key], seen);
    return out;
  }

  function componentName(item) {
    if (isGem(item)) {
      const quality = item.quality[0].toUpperCase() + item.quality.slice(1);
      return `${quality} ${GEM_TYPES[item.gemType].name}`;
    }
    if (isRune(item)) return item.name;
    return '';
  }

  function isGem(item) {
    return isObject(item) && item.kind === 'gem' && typeof item.gemType === 'string' &&
      Object.prototype.hasOwnProperty.call(GEM_TYPES, item.gemType) && GEM_QUALITIES.includes(item.quality);
  }

  function isRune(item) {
    if (!isObject(item) || item.kind !== 'rune' || typeof item.name !== 'string') return false;
    const definition = RUNE_BY_NAME[item.name];
    return !!definition && (item.ord === undefined || Number(item.ord) === definition.ord);
  }

  function isEquipment(item) {
    return isObject(item) && typeof item.type === 'string' && !!Items.baseById(item.type) &&
      Number.isInteger(Number(item.tier)) && Number(item.tier) >= 0 && Number(item.tier) < TIER_LVLS.length;
  }

  function selection(player, inputIds) {
    if (!isObject(player) || !Array.isArray(player.inv) || !Number.isFinite(player.gold) || player.gold < 0)
      return { error: fail('Player inventory or gold is invalid.') };
    if (!Array.isArray(inputIds) || inputIds.length === 0)
      return { error: fail('Select at least one inventory item.') };
    if (inputIds.some(id => typeof id !== 'string' || !id.length))
      return { error: fail('Every selected item must have a valid id.') };
    if (new Set(inputIds).size !== inputIds.length)
      return { error: fail('The same inventory instance cannot be selected twice.') };

    const byId = new Map();
    for (const item of player.inv) {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id.length)
        return { error: fail('Every inventory item must have a valid id.') };
      if (byId.has(item.id)) return { error: fail('Inventory item ids must be unique.') };
      byId.set(item.id, item);
    }
    const items = [];
    for (const id of inputIds) {
      const item = byId.get(id);
      if (!item) return { error: fail(`Selected item ${id} is not in the inventory.`) };
      items.push(item);
    }
    return { items, selectedIds: new Set(inputIds) };
  }

  function itemSize(item) {
    const size = Items.sizeOf(item);
    if (!Array.isArray(size) || size.length !== 2) return null;
    const width = Number(size[0]), height = Number(size[1]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > COLS || height > ROWS) return null;
    return [width, height];
  }

  // Pack existing items and projected outputs without mutating either. Explicit
  // grid anchors are authoritative; legacy items with no anchor are first-fit.
  function projectedPlacements(inventory, selectedIds, outputs, preferred) {
    const occupied = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const canPlace = (size, col, row) => {
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 ||
        col + size[0] > COLS || row + size[1] > ROWS) return false;
      for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++)
        if (occupied[row + y][col + x]) return false;
      return true;
    };
    const occupy = (size, col, row) => {
      for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) occupied[row + y][col + x] = true;
    };
    const firstFit = size => {
      for (let row = 0; row <= ROWS - size[1]; row++)
        for (let col = 0; col <= COLS - size[0]; col++) if (canPlace(size, col, row)) return { col, row };
      return null;
    };
    const place = (item, requested) => {
      const size = itemSize(item); if (!size) return null;
      let position = null;
      if (requested && canPlace(size, requested.col, requested.row)) position = requested;
      else position = firstFit(size);
      if (!position) return null;
      occupy(size, position.col, position.row);
      return position;
    };

    const anchored = [], loose = [];
    for (const item of inventory) {
      if (selectedIds.has(item.id)) continue;
      const hasX = item._gx !== undefined && item._gx !== null;
      const hasY = item._gy !== undefined && item._gy !== null;
      if (hasX !== hasY) return null;
      (hasX ? anchored : loose).push(item);
    }
    // Reserve every declared anchor before first-fitting legacy unanchored
    // items. Inventory order must not let a loose item steal an anchored cell.
    for (const item of anchored) {
      const requested = { col: Number(item._gx), row: Number(item._gy) };
      const size = itemSize(item);
      if (!size || !canPlace(size, requested.col, requested.row)) return null;
      occupy(size, requested.col, requested.row);
    }
    for (const item of loose) if (!place(item, null)) return null;

    const placements = [];
    for (let i = 0; i < outputs.length; i++) {
      const position = place(outputs[i], preferred && preferred[i]);
      if (!position) return null;
      placements.push(position);
    }
    return placements;
  }

  function socketCap(item, base) {
    const maximum = Number(base.maxSockets) || 0;
    const ilvl = Math.max(1, Math.floor(Number(item.ilvl) || 1));
    if (ilvl >= 41) return maximum;
    if (ilvl >= 28) return Math.min(maximum, 4);
    if (ilvl >= 15) return Math.min(maximum, 3);
    return Math.min(maximum, 2);
  }

  function cleanSockets(item) {
    const sockets = Number(item.sockets || 0);
    if (!Number.isInteger(sockets) || sockets < 0) return false;
    if (item.gems !== undefined && !Array.isArray(item.gems)) return false;
    const gems = item.gems || [];
    if (gems.length !== sockets) return false;
    return gems.every(gem => gem === null || isGem(gem) || isRune(gem));
  }

  function equipmentPreview(item, changes = {}) {
    return Object.assign({ kind: 'equipment', sourceId: item.id, type: item.type,
      rarity: item.rarity, tier: Number(item.tier), ilvl: Number(item.ilvl) || 1 }, changes);
  }

  function planGemUpgrade(items) {
    if (items.length !== 3 || !items.every(isGem)) return null;
    const first = items[0];
    if (!items.every(item => item.gemType === first.gemType && item.quality === first.quality))
      return { error: fail('Gem upgrades require exactly three matching gems.', 'gem_upgrade') };
    const qualityIndex = GEM_QUALITIES.indexOf(first.quality);
    if (qualityIndex === GEM_QUALITIES.length - 1)
      return { error: fail('Perfect gems are already the terminal quality.', 'gem_upgrade') };
    const quality = GEM_QUALITIES[qualityIndex + 1];
    const preview = { kind: 'gem', gemType: first.gemType, quality,
      name: `${quality[0].toUpperCase() + quality.slice(1)} ${GEM_TYPES[first.gemType].name}` };
    return { recipeId: 'gem_upgrade', cost: 0, preview: [preview], preferredSource: first,
      make: () => [Items.componentRecord(preview)] };
  }

  function planRuneUpgrade(items) {
    if (items.length !== 3 || !items.every(isRune)) return null;
    const first = items[0];
    if (!items.every(item => item.name === first.name))
      return { error: fail('Rune upgrades require exactly three matching runes.', 'rune_upgrade') };
    const runeIndex = RUNES.findIndex(rune => rune.name === first.name);
    if (runeIndex === RUNES.length - 1)
      return { error: fail('Zod is already the terminal rune.', 'rune_upgrade') };
    const definition = RUNES[runeIndex + 1];
    const preview = { kind: 'rune', name: definition.name, ord: definition.ord };
    return { recipeId: 'rune_upgrade', cost: 0, preview: [preview], preferredSource: first,
      make: () => [Items.componentRecord(preview)] };
  }

  function addSocketsCandidate(items) {
    if (items.length !== 4) return false;
    return items.filter(isEquipment).length === 1 && items.filter(item => item && item.kind === 'rune').length === 3;
  }

  function planAddSockets(items) {
    if (!addSocketsCandidate(items)) return null;
    const runes = items.filter(isRune).map(item => item.name).sort();
    if (runes.join('|') !== ['Ort', 'Ral', 'Tal'].sort().join('|'))
      return { error: fail('Socketing requires exactly Ral, Tal, and Ort.', 'add_sockets') };
    const item = items.find(isEquipment), base = Items.baseById(item.type);
    if (item.rarity !== 'common' || (item.quality || 'normal') !== 'normal')
      return { error: fail('Only a normal common base can receive Cube sockets.', 'add_sockets') };
    if (!cleanSockets(item)) return { error: fail('The base has malformed socket state.', 'add_sockets') };
    if (Number(item.sockets || 0) !== 0 || (item.gems || []).some(Boolean))
      return { error: fail('The base must be completely unsocketed.', 'add_sockets') };
    const cap = socketCap(item, base);
    if (cap < 1) return { error: fail('That base type cannot receive sockets.', 'add_sockets') };
    const preview = equipmentPreview(item, { sockets: { min: 1, max: cap } });
    return { recipeId: 'add_sockets', cost: 0, preview: [preview], preferredSource: item, preserveSourceId: item.id,
      make: rng => {
        const output = clone(item);
        output.sockets = Math.min(cap, 1 + Math.floor(rng() * 6));
        output.gems = Array(output.sockets).fill(null);
        delete output.runeword; delete output.runewordName;
        output.price = Items.price(output);
        return [output];
      } };
  }

  function planTierUpgrade(items) {
    if (items.length !== 1 || !isEquipment(items[0]) || items[0].rarity !== 'rare') return null;
    const item = items[0], nextTier = Number(item.tier) + 1;
    if (nextTier >= TIER_LVLS.length)
      return { error: fail('This rare item is already at the terminal base tier.', 'upgrade_tier', COSTS.upgrade_tier) };
    if (!cleanSockets(item)) return { error: fail('The rare item has malformed socket state.', 'upgrade_tier', COSTS.upgrade_tier) };
    const preview = equipmentPreview(item, { tier: nextTier, baseName: Items.baseById(item.type).names[nextTier] });
    return { recipeId: 'upgrade_tier', cost: COSTS.upgrade_tier, preview: [preview], preferredSource: item, preserveSourceId: item.id,
      make: rng => [upgradeTier(item, nextTier, rng)] };
  }

  function magicAndGems(items, count) {
    return items.length === count + 1 && items.filter(item => isEquipment(item) && item.rarity === 'magic').length === 1 &&
      items.filter(isGem).length === count;
  }

  function planRerollMagic(items) {
    if (!magicAndGems(items, 3)) return null;
    const item = items.find(entry => isEquipment(entry) && entry.rarity === 'magic');
    const gems = items.filter(isGem);
    if (!gems.every(gem => gem.quality === 'perfect'))
      return { error: fail('Rerolling requires exactly three perfect gems.', 'reroll_magic') };
    const preview = equipmentPreview(item, { rerolled: true });
    return { recipeId: 'reroll_magic', cost: 0, preview: [preview], preferredSource: item, preserveSourceId: item.id,
      make: rng => [rerollEquipment(item, 'magic', rng)] };
  }

  function planRemoveGems(items) {
    if (items.length !== 2) return null;
    const hel = items.find(item => isRune(item) && item.name === 'Hel');
    const item = items.find(isEquipment);
    if (!hel || !item) return null;
    if (!cleanSockets(item)) return { error: fail('The item has malformed socket state.', 'remove_gems', COSTS.remove_gems) };
    if (Number(item.sockets || 0) < 1 || !(item.gems || []).some(Boolean))
      return { error: fail('The item has no socket contents to remove.', 'remove_gems', COSTS.remove_gems) };
    const preview = equipmentPreview(item, { sockets: Number(item.sockets), emptied: true });
    return { recipeId: 'remove_gems', cost: COSTS.remove_gems, preview: [preview], preferredSource: item, preserveSourceId: item.id,
      make: () => [removeSocketContents(item)] };
  }

  function planUpgradeRare(items) {
    if (!magicAndGems(items, 2)) return null;
    const item = items.find(entry => isEquipment(entry) && entry.rarity === 'magic');
    const gems = items.filter(isGem);
    const chipped = gems.filter(gem => gem.quality === 'chipped');
    const skull = gems.filter(gem => gem.gemType === 'skull' && gem.quality === 'perfect');
    if (chipped.length !== 1 || skull.length !== 1)
      return { error: fail('Rare upgrading requires one chipped gem and one perfect skull.', 'upgrade_rare') };
    const preview = equipmentPreview(item, { rarity: 'rare', rerolled: true });
    return { recipeId: 'upgrade_rare', cost: 0, preview: [preview], preferredSource: item, preserveSourceId: item.id,
      make: rng => [rerollEquipment(item, 'rare', rng)] };
  }

  function identifyPlan(items) {
    const planners = [planAddSockets, planRerollMagic, planRemoveGems, planUpgradeRare,
      planTierUpgrade, planGemUpgrade, planRuneUpgrade];
    for (const planner of planners) {
      const plan = planner(items);
      if (plan) {
        if (plan.error) return plan;
        if (!hasRecipe(plan.recipeId)) return { error: fail(`Recipe ${plan.recipeId} is not declared.`) };
        return plan;
      }
    }
    return { error: fail('No declared Cube recipe matches those exact inputs.') };
  }

  function qualityMultiplier(quality, rng) {
    const definition = ITEM_QUALITY[quality] || ITEM_QUALITY.normal;
    return definition.mulRange[0] + rng() * (definition.mulRange[1] - definition.mulRange[0]);
  }

  function rollBaseValues(output, base, tier, rng) {
    const quality = output.quality || 'normal';
    const multiplier = qualityMultiplier(quality, rng);
    if (base.dmg) {
      const range = base.dmg[tier];
      output.dmg = [Math.max(1, Math.round(range[0] * (0.9 + rng() * 0.2) * multiplier)),
        Math.max(1, Math.round(range[1] * (0.9 + rng() * 0.25) * multiplier))];
      if (output.ethereal) output.dmg = output.dmg.map(value => Math.round(value * ETHEREAL_WEAPON_MULT));
      output.spd = base.spd; output.ranged = !!base.ranged;
      if (base.critBonus) output.critBonus = base.critBonus; else delete output.critBonus;
    } else delete output.dmg;
    if (base.armor && base.armor[tier]) {
      output.armor = Math.max(1, Math.round(base.armor[tier] * (0.85 + rng() * 0.35) * multiplier));
      if (output.ethereal) output.armor = Math.round(output.armor * ETHEREAL_ARMOR_MULT);
    } else delete output.armor;
    if (base.caster) output.spellPct = base.caster + tier * 6; else delete output.spellPct;
    if (base.blockPct) output.baseBlockPct = base.blockPct; else delete output.baseBlockPct;
  }

  function freshEquipment(source, rng) {
    const base = Items.baseById(source.type), tier = Number(source.tier), ilvl = Math.max(1, Math.floor(Number(source.ilvl) || 1));
    const output = { type: base.id, slot: base.slot, tier, ilvl, baseName: base.names[tier], name: base.names[tier],
      rarity: 'common', stats: {}, reqLvl: TIER_LVLS[tier], quality: Items.rollQuality(rng) };
    output.ethereal = base.slot !== 'ring' && base.slot !== 'amulet' && rng() < ETHEREAL_CHANCE;
    if (!output.ethereal) delete output.ethereal;
    rollBaseValues(output, base, tier, rng);
    const sockets = Items.rollSockets(rng, base, ilvl);
    output.sockets = sockets; output.gems = Array(sockets).fill(null);
    return output;
  }

  function rerollEquipment(source, rarity, rng) {
    const output = freshEquipment(source, rng), base = Items.baseById(source.type), ilvl = output.ilvl;
    output.rarity = rarity;
    if (rarity === 'magic') {
      const count = rng() < 0.4 ? 2 : 1;
      const affixes = Items.rollAffixes(rng, base, ilvl, count);
      output.stats = affixes.stats;
      output.name = `${affixes.prefixName ? affixes.prefixName + ' ' : ''}${output.baseName}${affixes.suffixName ? ' ' + affixes.suffixName : ''}`.trim();
    } else {
      const maximum = ilvl >= 40 ? 6 : ilvl >= 24 ? 5 : 4;
      const count = Math.min(maximum, 3 + Math.floor(rng() * (maximum - 2)));
      const affixes = Items.rollAffixes(rng, base, ilvl, count);
      output.stats = affixes.stats;
      output.name = `${RARE_NAME_A[Math.floor(rng() * RARE_NAME_A.length)]}${RARE_NAME_B[Math.floor(rng() * RARE_NAME_B.length)]} ${output.baseName.split(' ').pop()}`;
      output.reqLvl = Math.min(MAX_LVL, output.reqLvl + 2);
    }
    output.price = Items.price(output);
    return output;
  }

  function upgradeTier(source, nextTier, rng) {
    const output = clone(source), base = Items.baseById(source.type);
    output.tier = nextTier;
    output.baseName = base.names[nextTier];
    output.reqLvl = Math.max(Number(source.reqLvl) || 1, TIER_LVLS[nextTier]);
    rollBaseValues(output, base, nextTier, rng);
    output.price = Items.price(output);
    return output;
  }

  function removeSocketContents(source) {
    const output = clone(source);
    // Legacy saves folded the Runeword overlay into base stats. Current items
    // mark the separated socket-stat model and must not be subtracted again.
    const word = typeof source.runeword === 'string' ? RUNEWORDS.find(entry => entry.id === source.runeword) : null;
    if (word && source._socketStatsVersion !== 1 && isObject(output.stats)) for (const key of Object.keys(word.stats)) {
      const current = Number(output.stats[key]);
      if (!Number.isFinite(current)) continue;
      const value = current - Number(word.stats[key]);
      if (Math.abs(value) < 1e-9) delete output.stats[key]; else output.stats[key] = value;
    }
    output._socketStatsVersion = 1;
    output.gems = Array(Number(output.sockets)).fill(null);
    delete output.runeword; delete output.runewordName;
    output.price = Items.price(output);
    return output;
  }

  function preferredPositions(plan) {
    const source = plan.preferredSource;
    const requested = source && Number.isInteger(Number(source._gx)) && Number.isInteger(Number(source._gy))
      ? { col: Number(source._gx), row: Number(source._gy) } : null;
    return plan.preview.map((_output, index) => index === 0 ? requested : null);
  }

  function analyze(player, inputIds) {
    const picked = selection(player, inputIds);
    if (picked.error) return picked;
    if (typeof ItemIdentification !== 'undefined' && picked.items.some(ItemIdentification.needsIdentification))
      return { ...picked, error: fail('Identify every concealed input before transmutation.') };
    if (typeof InventoryCharms !== 'undefined' && picked.items.some(InventoryCharms.isCharmRecord))
      return { ...picked, error: fail('Charms have no Cube recipe.') };
    const plan = identifyPlan(picked.items);
    if (plan.error) return { ...picked, error: plan.error };
    if (player.gold < plan.cost)
      return { ...picked, plan, error: fail(`Not enough gold; this recipe costs ${plan.cost}.`, plan.recipeId, plan.cost) };
    const placements = projectedPlacements(player.inv, picked.selectedIds, plan.preview, preferredPositions(plan));
    if (!placements)
      return { ...picked, plan, error: fail('The transmutation output does not fit in the inventory.', plan.recipeId, plan.cost) };
    return { ...picked, plan, placements };
  }

  function preview(player, inputIds) {
    try {
      const analysis = analyze(player, inputIds);
      if (analysis.error) return analysis.error;
      return ok(analysis.plan.recipeId, analysis.plan.cost, clone(analysis.plan.preview));
    } catch (_error) {
      return fail('Invalid Cube transaction.')
    }
  }

  function safeRng(rng) {
    if (typeof rng !== 'function') throw new TypeError('A random function is required.');
    return () => {
      const value = Number(rng());
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random values must be in [0, 1).');
      return value;
    };
  }

  function idFactory(player, recipeId) {
    const used = new Set(player.inv.map(item => item.id));
    let serial = 1;
    return () => {
      let id;
      do id = `cube-${recipeId}-${serial++}`; while (used.has(id));
      used.add(id); return id;
    };
  }

  function transmute(player, inputIds, rng) {
    const analysis = (() => {
      try { return analyze(player, inputIds); }
      catch (_error) { return { error: fail('Invalid Cube transaction.') }; }
    })();
    if (analysis.error) return analysis.error;

    let outputs;
    try {
      const random = safeRng(rng);
      outputs = analysis.plan.make(random).map(output => clone(output));
      const nextId = idFactory(player, analysis.plan.recipeId);
      for (let i = 0; i < outputs.length; i++)
        outputs[i].id = i === 0 && analysis.plan.preserveSourceId ? analysis.plan.preserveSourceId : nextId();
      const placements = projectedPlacements(player.inv, analysis.selectedIds, outputs, preferredPositions(analysis.plan));
      if (!placements) return fail('The transmutation output does not fit in the inventory.', analysis.plan.recipeId, analysis.plan.cost);
      for (let i = 0; i < outputs.length; i++) {
        outputs[i]._gx = placements[i].col;
        outputs[i]._gy = placements[i].row;
      }
    } catch (_error) {
      return fail('Unable to create the transmutation output.', analysis.plan.recipeId, analysis.plan.cost);
    }

    // The commit is intentionally only these two assignments. All validation,
    // random rolls, cloning, unique-id allocation, and packing happened above.
    player.inv = player.inv.filter(item => !analysis.selectedIds.has(item.id)).concat(outputs);
    player.gold -= analysis.plan.cost;
    return ok(analysis.plan.recipeId, analysis.plan.cost, outputs);
  }

  return Object.freeze({ recipes, COSTS, preview, transmute });
})();

globalThis.Cube = Cube;
