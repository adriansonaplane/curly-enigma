// ============ DIABLOID: corpse-state.js — softcore gear recovery ============
'use strict';

// Pure state transitions only. Items are moved, never serialized or rebuilt, so
// their identity and all nested socket data survive capture and recovery.
const CorpseState = (() => {
  const VERSION = 1;
  const COLS = 10, ROWS = 6;
  const SIZES = Object.freeze({
    sword:[1,3], axe:[1,3], mace:[1,3], spear:[1,3], claw:[1,2], dagger:[1,2], wand:[1,2],
    staff:[1,4], bow:[2,3], crossbow:[2,3], helm:[2,2], chest:[2,3], shield:[2,3],
    orb:[1,2], gloves:[2,2], boots:[2,2], belt:[2,1], ring:[1,1], amulet:[1,1],
    charm_small:[1,1], charm_large:[1,2], charm_grand:[1,3],
  });
  let serial = 0;
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const sizeOf = item => SIZES[item && item.type] || [1, 1];

  function location(raw) {
    raw = object(raw);
    const result = {};
    for (const key of ['kind', 'area', 'zone', 'dungeon', 'town']) {
      const value = text(raw[key]); if (value) result[key] = value;
    }
    for (const key of ['act', 'floor', 'x', 'y', 'z']) {
      const value = finite(raw[key]); if (value !== null) result[key] = value;
    }
    if (!result.kind) result.kind = result.dungeon ? 'dungeon' : 'town';
    return result;
  }

  function entries(raw) {
    const source = Array.isArray(raw) ? raw : Object.entries(object(raw)).map(([slot, item]) => ({ slot, item }));
    const seen = new Set(), result = [];
    for (const value of source) {
      const entry = object(value), slot = text(entry.slot);
      if (!slot || seen.has(slot) || !entry.item || typeof entry.item !== 'object') continue;
      seen.add(slot); result.push({ slot, item: entry.item });
    }
    return result;
  }

  function uniqueId(used) {
    let id;
    do { id = `corpse-${Date.now().toString(36)}-${(++serial).toString(36)}`; } while (used.has(id));
    return id;
  }

  function migrate(raw) {
    const source = Array.isArray(raw) ? raw : Array.isArray(object(raw).corpses) ? raw.corpses : [];
    const used = new Set(), result = [];
    for (const value of source) {
      const record = object(value);
      const gear = entries(record.gear || record.items || record.equip || record.equipment);
      if (!gear.length) continue;
      let id = text(record.id);
      if (!id || used.has(id)) id = uniqueId(used);
      used.add(id);
      result.push(Object.assign({}, record, { id, version: VERSION, gear,
        location: location(record.location || record.where || record) }));
      delete result[result.length - 1].items;
      delete result[result.length - 1].equip;
      delete result[result.length - 1].equipment;
    }
    return result;
  }

  function capture(player, where) {
    if (!player || typeof player !== 'object') return { ok: false, reason: 'invalid-player' };
    if (player.hardcore) return { ok: false, noop: true, reason: 'hardcore' };
    const equip = object(player.equip);
    const gear = Object.keys(equip).filter(slot => equip[slot] && typeof equip[slot] === 'object' &&
      !(typeof InventoryCharms !== 'undefined' && InventoryCharms.isCharmRecord(equip[slot])))
      .map(slot => ({ slot, item: equip[slot] }));
    if (!gear.length) return { ok: false, noop: true, reason: 'no-gear' };
    const corpses = migrate(player.corpses);
    const corpse = { id: uniqueId(new Set(corpses.map(value => value.id))), version: VERSION,
      gear, location: location(where) };
    // Commit only after the complete record exists; clear precisely what was captured.
    player.corpses = corpses.concat(corpse);
    for (const entry of gear) if (equip[entry.slot] === entry.item) equip[entry.slot] = null;
    return { ok: true, corpse };
  }

  function occupancy(inv) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (const item of inv) {
      if (!item || !Number.isInteger(item._gx) || !Number.isInteger(item._gy)) continue;
      const [w, h] = sizeOf(item);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const row = item._gy + y, col = item._gx + x;
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) grid[row][col] = true;
      }
    }
    return grid;
  }

  function firstFit(item, grid) {
    const [w, h] = sizeOf(item);
    for (let row = 0; row <= ROWS - h; row++) for (let col = 0; col <= COLS - w; col++) {
      let free = true;
      for (let y = 0; y < h && free; y++) for (let x = 0; x < w; x++) if (grid[row+y][col+x]) { free = false; break; }
      if (free) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[row+y][col+x] = true;
        return { col, row };
      }
    }
    return null;
  }

  function recover(player, corpseId) {
    if (!player || typeof player !== 'object') return { ok: false, reason: 'invalid-player' };
    const corpses = migrate(player.corpses), id = text(corpseId);
    const index = corpses.findIndex(record => record.id === id);
    if (index < 0) return { ok: false, noop: true, reason: 'not-found' };
    const equip = object(player.equip), inv = Array.isArray(player.inv) ? player.inv : [];
    const grid = occupancy(inv), placements = [], restored = [];
    for (const entry of corpses[index].gear) {
      const concealed = typeof ItemIdentification !== 'undefined' && ItemIdentification.needsIdentification(entry.item);
      const charm = typeof InventoryCharms !== 'undefined' && InventoryCharms.isCharmRecord(entry.item);
      if (!equip[entry.slot] && !concealed && !charm) restored.push(entry);
      else {
        const place = firstFit(entry.item, grid);
        if (!place) return { ok: false, reason: 'inventory-full' };
        placements.push({ item: entry.item, col: place.col, row: place.row });
      }
    }
    // Commit the validated plan.
    for (const entry of restored) equip[entry.slot] = entry.item;
    for (const place of placements) { place.item._gx = place.col; place.item._gy = place.row; inv.push(place.item); }
    corpses.splice(index, 1);
    player.equip = equip; player.inv = inv; player.corpses = corpses;
    return { ok: true, restored: restored.length, spilled: placements.length };
  }

  function relocateInaccessible(player, isAccessible, town) {
    if (!player || typeof player !== 'object') return 0;
    const corpses = migrate(player.corpses), canReach = typeof isAccessible === 'function' ? isAccessible : () => false;
    let count = 0;
    for (const corpse of corpses) if (corpse.location.kind === 'dungeon' && !canReach(corpse.location, corpse)) {
      corpse.location = location(Object.assign({}, object(town), { kind: 'town' })); count++;
    }
    player.corpses = corpses;
    return count;
  }

  return Object.freeze({ VERSION, COLS, ROWS, migrate, capture, recover, relocateInaccessible });
})();
globalThis.CorpseState = CorpseState;
