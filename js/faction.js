// ============ DIABLOID: faction.js — factions & reputation ============
// Five factions native to the setting established in js/lore.js. Reputation
// is a single signed integer per faction, stored in WorldState (so it is
// per-character and survives save/reload for free), mapped onto named tiers
// that gate dialogue options, a vault, and a couple of quest prerequisites.
//
// The interesting part is `adjust()`: raising one faction can deliberately
// lower another (see OPPOSED below) — action has cost, not just reward.
'use strict';

const FACTIONS = [
  { id: 'choir', name: 'The Vigil Choir', short: 'Choir',
    blurb: 'What remains of the old faith. Mercy, restraint, keeping the dead down.' },
  { id: 'emberwrights', name: 'The Emberwrights', short: 'Emberwrights',
    blurb: 'Smiths and miners of the Undercity. Craft, salvage, paying what you owe.' },
  { id: 'hollowmarket', name: 'The Hollow Market', short: 'Market',
    blurb: 'Brokers, fences, and fixers who profit off the wounds. Nerve, risk, discretion.' },
  { id: 'deepwardens', name: 'The Deep Wardens', short: 'Wardens',
    blurb: 'An order that should not still exist. Earned only through what you find, never bought.' },
  { id: 'drownedcult', name: 'The Drowned Cult', short: 'Cult',
    blurb: 'Worshippers of the reflection in the Fane. Standing here is never free elsewhere.' },
];

// Raising `raise` by `amount` costs each entry in `costs` `amount * ratio`
// reputation, rounded toward zero so a +1 nudge never phantom-costs a point
// it didn't actually spend.
const FACTION_OPPOSED = {
  choir: [{ id: 'hollowmarket', ratio: 0.4 }, { id: 'drownedcult', ratio: 0.6 }],
  hollowmarket: [{ id: 'choir', ratio: 0.4 }],
  drownedcult: [{ id: 'choir', ratio: 0.6 }, { id: 'deepwardens', ratio: 0.3 }],
  deepwardens: [{ id: 'drownedcult', ratio: 0.2 }],
  emberwrights: [],
};

const FACTION_TIERS = [
  { key: 'hated', name: 'Hated', min: -Infinity },
  { key: 'unfriendly', name: 'Unfriendly', min: -50 },
  { key: 'neutral', name: 'Neutral', min: 0 },
  { key: 'friendly', name: 'Friendly', min: 50 },
  { key: 'honored', name: 'Honored', min: 150 },
  { key: 'exalted', name: 'Exalted', min: 350 },
];
const FACTION_MIN = -400, FACTION_MAX = 500;

const Faction = {
  byId(id) { return FACTIONS.find(f => f.id === id) || null; },
  all() { return FACTIONS.slice(); },

  rep(id) {
    if (typeof WorldState === 'undefined') return 0;
    const v = WorldState.ensure().factions[id];
    return typeof v === 'number' && isFinite(v) ? v : 0;
  },

  // Pure — takes a number, not a faction id, so it is directly unit-testable
  // without touching WorldState.
  tierFor(value) {
    let best = FACTION_TIERS[0];
    for (const t of FACTION_TIERS) if (value >= t.min) best = t;
    return best;
  },
  tierOf(id) { return this.tierFor(this.rep(id)); },
  tierRank(key) { return FACTION_TIERS.findIndex(t => t.key === key); },

  // Does this faction's current standing meet or exceed the given tier?
  meets(id, tierKey) {
    const need = this.tierRank(tierKey);
    if (need < 0) return false;
    return this.tierRank(this.tierOf(id).key) >= need;
  },

  // Applies `amount` to `id`, plus opposed spillover on any factions listed
  // in FACTION_OPPOSED[id], clamped to [FACTION_MIN, FACTION_MAX]. Returns a
  // change report per faction touched, including whether its tier flipped —
  // callers (dialogue effects, quest resolutions) use that to narrate a
  // "your standing with X has fallen to Unfriendly" moment.
  adjust(id, amount, opts) {
    if (typeof WorldState === 'undefined' || !this.byId(id) || !amount) return [];
    const reason = (opts && opts.reason) || 'unspecified';
    const touched = [{ id, amount }];
    for (const opp of (FACTION_OPPOSED[id] || [])) {
      const spill = -Math.trunc(amount * opp.ratio);
      if (spill) touched.push({ id: opp.id, amount: spill });
    }
    const reports = [];
    const d = WorldState.ensure();
    for (const t of touched) {
      const before = this.rep(t.id);
      const beforeTier = this.tierFor(before).key;
      const after = U.clamp(before + t.amount, FACTION_MIN, FACTION_MAX);
      d.factions[t.id] = after;
      const afterTier = this.tierFor(after).key;
      reports.push({ id: t.id, before, after, delta: after - before, tierChanged: beforeTier !== afterTier, tier: afterTier });
    }
    WorldState.record('faction', `Reputation shift (${reason})`, { primary: id, amount, reports });
    return reports;
  },

  list() {
    return FACTIONS.map(f => ({ ...f, rep: this.rep(f.id), tier: this.tierOf(f.id) }));
  },
};
