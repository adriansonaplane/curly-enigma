// ============ DIABLOID: worldstate.js — the consequence ledger ============
// One persisted, per-character record that every narrative system reads and
// writes through: flags, counters, free-form vars, an append-only log of what
// happened, faction reputation, quest state, discovered lore and dialogue
// memory. Nothing else in the narrative layer keeps its own localStorage key —
// this is the single source of truth, so "the world remembers" is one save
// file, not five that can drift out of sync with each other.
//
// Owned by the narrative layer (js/quests.js, js/faction.js, js/lore.js,
// js/dialogue.js, js/environment.js, and the NPC-depth code in js/social.js).
// Talks to localStorage directly; talks to nothing else in the game, so it can
// be loaded and unit-tested with nothing but a localStorage stub (see
// tests/node/worldstate.js).
'use strict';

const WorldState = {
  KEY: 'narrative_v1',
  MAX_LOG: 240,

  _all: null,   // { [charKey]: CharState } — the whole localStorage blob
  char: null,   // current character's lowercase key
  data: null,   // current character's live, mutable CharState

  // The shape every CharState is coerced into. Anything a malformed or
  // hand-edited save doesn't provide (or provides with the wrong type) falls
  // back to this rather than propagating `undefined` into game logic.
  defaults() {
    return {
      v: 1,
      flags: {},                                   // id -> bool
      counters: {},                                 // id -> number
      vars: {},                                     // id -> any JSON value
      log: [],                                      // [{t, kind, label, detail, gossiped?}]
      npc: {},                                      // npcId -> NPC-depth runtime state (social.js)
      factions: {},                                 // factionId -> number (reputation)
      quests: { active: {}, done: {}, failed: {} }, // questId -> state (quests.js)
      lore: { discovered: {} },                     // entryId -> {t, via}
      dialogue: { visited: {}, memory: {} },        // nodeKey -> true; npc -> free notes
    };
  },

  _readRaw() {
    let text = null;
    try { text = localStorage.getItem(this.KEY); } catch (e) { return {}; }
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) { return {}; }
  },

  _writeRaw() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this._all)); } catch (e) { /* storage full/unavailable */ }
  },

  _isPlainObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); },

  // Defensive shape repair. Every field is validated independently, so one
  // corrupted branch (wrong type, truncated write, a hand-edited save) loses
  // only that branch rather than throwing or discarding the whole record.
  _sanitize(raw) {
    const out = this.defaults();
    if (!this._isPlainObj(raw)) return out;
    const po = this._isPlainObj.bind(this);

    if (po(raw.flags)) for (const k in raw.flags) out.flags[k] = !!raw.flags[k];
    if (po(raw.vars)) for (const k in raw.vars) out.vars[k] = raw.vars[k];
    if (po(raw.counters)) for (const k in raw.counters) {
      const n = raw.counters[k];
      if (typeof n === 'number' && isFinite(n)) out.counters[k] = n;
    }
    if (Array.isArray(raw.log)) {
      out.log = raw.log
        .filter(e => po(e) && typeof e.kind === 'string' && typeof e.t === 'number')
        .slice(-this.MAX_LOG)
        .map(e => ({ t: e.t, kind: e.kind, label: typeof e.label === 'string' ? e.label : '', detail: e.detail === undefined ? null : e.detail, gossiped: !!e.gossiped }));
    }
    if (po(raw.npc)) for (const k in raw.npc) if (po(raw.npc[k])) out.npc[k] = raw.npc[k];
    if (po(raw.factions)) for (const k in raw.factions) {
      const n = raw.factions[k];
      if (typeof n === 'number' && isFinite(n)) out.factions[k] = n;
    }
    if (po(raw.quests)) {
      if (po(raw.quests.active)) out.quests.active = raw.quests.active;
      if (po(raw.quests.done)) out.quests.done = raw.quests.done;
      if (po(raw.quests.failed)) out.quests.failed = raw.quests.failed;
    }
    if (po(raw.lore) && po(raw.lore.discovered)) out.lore.discovered = raw.lore.discovered;
    if (po(raw.dialogue)) {
      if (po(raw.dialogue.visited)) out.dialogue.visited = raw.dialogue.visited;
      if (po(raw.dialogue.memory)) out.dialogue.memory = raw.dialogue.memory;
    }
    return out;
  },

  // Switch the ledger to a given character, loading (and repairing) its saved
  // state. Safe to call repeatedly — re-entering the same character is a
  // cheap no-op that still re-reads localStorage, so an externally-changed
  // save is picked up.
  forCharacter(name) {
    const key = String(name || 'adventurer').trim().toLowerCase() || 'adventurer';
    this._all = this._readRaw();
    this.char = key;
    this.data = this._sanitize(this._all[key]);
    this._all[key] = this.data;
    this._writeRaw();
    return this.data;
  },

  // Any narrative code that runs before a character is chosen (tests, or a
  // dialogue probe run standalone) gets a throwaway record instead of a
  // crash on `this.data.flags`.
  ensure() {
    if (!this.data) this.forCharacter('adventurer');
    return this.data;
  },

  save() {
    if (!this.char) return;
    if (!this._all) this._all = this._readRaw();
    this._all[this.char] = this.data;
    this._writeRaw();
  },

  // Wipes the in-memory ledger (not localStorage) — for tests only.
  resetForTests() { this._all = null; this.char = null; this.data = null; },

  // ---------------- ledger primitives ----------------
  has(flag) { return !!this.ensure().flags[flag]; },
  set(flag, val = true, label) {
    const d = this.ensure();
    const v = !!val;
    const changed = !!d.flags[flag] !== v;
    d.flags[flag] = v;
    if (changed) this.record('flag', label || flag, { flag, val: v });
    else this.save();
    return v;
  },
  clear(flag) { return this.set(flag, false); },

  getVar(id, def) { const d = this.ensure(); return (id in d.vars) ? d.vars[id] : def; },
  setVar(id, val, label) {
    const d = this.ensure();
    d.vars[id] = val;
    this.record('var', label || id, { id, val });
    return val;
  },

  count(id) { return this.ensure().counters[id] || 0; },
  inc(id, n = 1, label) {
    const d = this.ensure();
    d.counters[id] = (d.counters[id] || 0) + n;
    this.record('counter', label || id, { id, n, total: d.counters[id] });
    return d.counters[id];
  },

  // Append-only consequence log. `record` always saves — it is the thing
  // other systems call right after mutating their own sub-namespace of
  // `this.data`, so one `record()` call both journals the event and commits
  // the whole ledger to localStorage.
  record(kind, label, detail) {
    const d = this.ensure();
    d.log.push({ t: Date.now(), kind, label, detail: detail === undefined ? null : detail, gossiped: false });
    if (d.log.length > this.MAX_LOG) d.log.splice(0, d.log.length - this.MAX_LOG);
    this.save();
  },
  history(n = 20) { return this.ensure().log.slice(-n); },

  // Gossip support (consumed by the NPC-depth code in social.js): entries not
  // yet handed to any NPC's memory, oldest first, and a way to mark one used.
  pendingGossip(limit = 12) { return this.ensure().log.filter(e => !e.gossiped).slice(0, limit); },
  markGossiped(entry) { entry.gossiped = true; this.save(); },
};
