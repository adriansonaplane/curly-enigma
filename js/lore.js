// ============ DIABLOID: lore.js — discoverable, persistent codex ============
'use strict';

// Lore is authored independently from its mutable character state. IDs are save
// keys, so they must never be recycled even if an entry is retired.
const Lore = (() => {
  const VERSION = 1;
  const authored = [
    { id: 'place.havens-rest', title: "Haven's Rest", category: 'Places',
      content: 'A walled village built where the pilgrim road meets the old descent.',
      source: { type: 'dialogue', id: 'elder', location: "Haven's Rest", node: 'welcome' } },
    { id: 'person.fallen-bishop', title: 'The Fallen Bishop', category: 'People',
      content: 'Once a guardian of the parish, the Bishop listened too long to voices behind the stone.',
      source: { type: 'dialogue', id: 'elder', location: "Haven's Rest", node: 'parish' } },
    { id: 'place.endless-abyss', title: 'The Endless Abyss', category: 'Places',
      content: 'No survey agrees on its depth. Each expedition finds the stairs changed.',
      source: { type: 'dialogue', id: 'elder', location: "Haven's Rest", node: 'abyss' } },
    { id: 'relic.parish-marginalia', title: 'Parish Marginalia', category: 'Relics',
      content: 'A cramped hand records a pulse beneath the parish: one beat for every seventh bell.',
      source: { type: 'prop', id: 'bookshelf', location: 'The Old Parish' } },
    { id: 'mystery.heart-below', title: 'The Heart Below', category: 'Mysteries',
      content: 'The changed stair and the Bishop\'s rhythm describe one vast thing turning in its sleep.',
      source: { type: 'deduction', location: 'Codex cross-reference' },
      unlock: { all: ['person.fallen-bishop', 'place.endless-abyss', 'relic.parish-marginalia'] } },
    { id: 'history.first-purge', title: 'The First Purge', category: 'History',
      content: 'With its master slain, the parish records can finally name the villagers who barred the crypt from within.',
      source: { type: 'quest', id: 'boss0', location: 'The Old Parish' } },
    { id: 'mystery.seventh-bell', title: 'The Seventh Bell', category: 'Mysteries',
      content: 'The final name in the purge ledger is not a villager. It is the name engraved on the bell that never rings.',
      source: { type: 'deduction', location: 'Codex cross-reference' },
      unlock: { all: ['history.first-purge', 'mystery.heart-below'] } },
    { id: 'clue.seventh-bell-ledger', title: 'The Seventh-Bell Ledger', category: 'Clues',
      content: 'A sealed parish ledger names a forbidden seventh bell hidden below the nave.',
      source: { type: 'clue', id: 'parish-ledger', location: 'The Old Parish' } },
    { id: 'clue.cabal-trail', title: 'Cabal Trail Marks', category: 'Clues',
      content: 'Soot marks encode a route through the deep roads and bear the Cinder Cabal cipher.',
      source: { type: 'clue', id: 'cabal-mark', location: 'The deep roads' } },
  ];

  const entries = authored.map(raw => {
    const entry = { ...raw, source: { ...raw.source } };
    if (raw.unlock) entry.unlock = {
      all: Object.freeze([...(raw.unlock.all || [])]), any: Object.freeze([...(raw.unlock.any || [])]),
    };
    Object.freeze(entry.source); if (entry.unlock) Object.freeze(entry.unlock);
    return Object.freeze(entry);
  });
  const byId = Object.freeze(Object.fromEntries(entries.map(entry => [entry.id, entry])));
  const categories = Object.freeze([...new Set(entries.map(entry => entry.category))].sort());

  function create() { return { version: VERSION, discovered: Object.create(null), read: Object.create(null) }; }
  function migrate(saved) {
    const state = create();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return state;
    const discovered = saved.discovered && typeof saved.discovered === 'object' ? saved.discovered : {};
    const read = saved.read && typeof saved.read === 'object' ? saved.read : {};
    for (const id of Object.keys(discovered)) if (byId[id] && discovered[id])
      state.discovered[id] = typeof discovered[id] === 'object' ? { ...discovered[id] } : { at: 0 };
    for (const id of Object.keys(read)) if (state.discovered[id] && read[id]) state.read[id] = true;
    return state;
  }
  const has = (state, id) => !!(state && state.discovered && state.discovered[id]);
  function meets(state, condition) {
    if (!condition) return true;
    return (condition.all || []).every(id => has(state, id)) &&
      (!(condition.any || []).length || condition.any.some(id => has(state, id)));
  }
  function discover(state, id, metadata) {
    const entry = byId[id];
    if (!entry || !state || has(state, id) || !meets(state, entry.unlock)) return [];
    state.discovered[id] = { at: Date.now(), source: { ...entry.source, ...(metadata || {}) } };
    delete state.read[id];
    const found = [entry];
    // Resolve authored deductions to a fixed point, allowing stable chains.
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of entries) if (!has(state, candidate.id) && candidate.unlock && meets(state, candidate.unlock)) {
        state.discovered[candidate.id] = { at: Date.now(), source: { ...candidate.source } };
        delete state.read[candidate.id]; found.push(candidate); changed = true;
      }
    }
    return found;
  }
  function discoverSource(state, type, id, metadata) {
    const found = [];
    for (const entry of entries)
      if (!entry.unlock && entry.source.type === type && entry.source.id === id &&
        (!entry.source.node || entry.source.node === (metadata && metadata.node)))
        found.push(...discover(state, entry.id, metadata));
    return found;
  }
  function markRead(state, id) { if (has(state, id)) state.read[id] = true; }
  const unreadCount = state => entries.reduce((n, entry) => n + (has(state, entry.id) && !state.read[entry.id] ? 1 : 0), 0);

  return Object.freeze({ VERSION, entries: Object.freeze(entries), byId, categories, create, migrate,
    has, meets, discover, discoverSource, markRead, unreadCount });
})();

// Compatibility export for tools that consumed the original catalogue name.
const LoreCodex = Lore.entries;
globalThis.Lore = Lore;
globalThis.LoreCodex = LoreCodex;
