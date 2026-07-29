// ============ DIABLOID: factions.js — factions and reputation rules ============
'use strict';

const Factions = Object.freeze({
  definitions: Object.freeze([
    Object.freeze({ id: 'haven', name: "Haven's Rest", description: 'The last refuge before the deep roads.' }),
    Object.freeze({ id: 'light', name: 'Keepers of the Light', description: 'Wardens, healers, and hunters of corruption.' }),
    Object.freeze({ id: 'ironsong', name: 'Ironsong Compact', description: 'Smiths who keep the old forging oaths.' }),
  ]),
  ranks: Object.freeze([
    Object.freeze({ min: -3000, name: 'Hostile' }), Object.freeze({ min: -500, name: 'Unfriendly' }),
    Object.freeze({ min: 0, name: 'Neutral' }), Object.freeze({ min: 1000, name: 'Friendly' }),
    Object.freeze({ min: 3000, name: 'Honored' }), Object.freeze({ min: 6000, name: 'Revered' }),
  ]),
  create() { return Object.create(null); },
  value(state, factionId) { return Number(state && state[factionId]) || 0; },
  rank(value) {
    let current = this.ranks[0];
    for (const rank of this.ranks) if (value >= rank.min) current = rank;
    return current;
  },
});
globalThis.Factions = Factions;
