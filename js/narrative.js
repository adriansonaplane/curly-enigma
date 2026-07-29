// ============ DIABLOID: narrative.js — persistent dungeon discoveries ============
'use strict';

// Narrative sites deliberately live outside `haz` and `things`: they are story
// content, not traps or loot containers.  Definition ids and generated site ids
// are save keys and must therefore remain stable.
const Narrative = (() => {
  const VERSION = 1;
  const definitions = Object.freeze([
    Object.freeze({ id: 'parish-ledger', kind: 'clue', acts: [0], title: 'Wax-Sealed Ledger',
      prompt: 'Inspect the wax-sealed ledger', discovered: 'The last entry names a seventh bell beneath the parish.',
      lore: 'clue.seventh-bell-ledger', quest: 'investigate-depths', dialogue: 'found-seventh-bell', faction: 'haven', reputation: 20,
      placement: Object.freeze({ room: true, wall: true, entryDistance: 8, exitDistance: 4 }) }),
    Object.freeze({ id: 'cabal-mark', kind: 'clue', acts: [1, 2, 3, 4, 'abyss'], title: 'Cabal Trail Mark',
      prompt: 'Examine the soot-black trail mark', discovered: 'The mark records a safe road used by the Cinder Cabal.',
      lore: 'clue.cabal-trail', quest: 'investigate-depths', dialogue: 'found-cabal-mark', faction: 'cinder', reputation: -15,
      placement: Object.freeze({ wall: true, entryDistance: 7, hazardDistance: 2 }) }),
    Object.freeze({ id: 'wounded-scout', kind: 'encounter', acts: [0, 1, 2, 3, 4], title: 'Wounded Scout',
      prompt: 'Offer aid to the wounded scout', discovered: 'The scout accepts your aid and promises to report to Haven.',
      changedTitle: 'Rescued Scout', quest: 'investigate-depths', dialogue: 'rescued-scout', faction: 'haven', reputation: 35,
      placement: Object.freeze({ room: true, entryDistance: 10, hazardDistance: 3, isolated: true }) }),
  ]);
  const byId = Object.freeze(Object.fromEntries(definitions.map(d => [d.id, d])));
  const dictionary = () => Object.create(null);
  function create() { return { version: VERSION, sites: dictionary() }; }
  function migrate(raw) {
    const out = create(), sites = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.sites;
    if (!sites || typeof sites !== 'object') return out;
    for (const id of Object.keys(sites)) {
      const s = sites[id]; if (!s || typeof s !== 'object') continue;
      out.sites[id] = { discovered: !!s.discovered, changed: !!s.changed };
    }
    return out;
  }
  const stateFor = (state, id) => state && state.sites && state.sites[id];
  function applyState(site, state) {
    const saved = stateFor(state, site.id);
    site.discovered = !!(saved && saved.discovered); site.changed = !!(saved && saved.changed);
    return site;
  }
  function record(state, site, changed = true) {
    if (!state.sites) state.sites = dictionary();
    const saved = state.sites[site.id] || (state.sites[site.id] = { discovered: false, changed: false });
    const first = !saved.discovered; saved.discovered = true; saved.changed ||= changed;
    site.discovered = saved.discovered; site.changed = saved.changed;
    return first;
  }
  return Object.freeze({ VERSION, definitions, byId, create, migrate, stateFor, applyState, record });
})();
globalThis.Narrative = Narrative;
