// ============ DIABLOID: factions.js — factions and reputation rules ============
'use strict';

const Factions = (() => {
  const VERSION = 2, MIN = -6000, MAX = 6000;
  const definitions = Object.freeze([
    Object.freeze({ id: 'haven', name: "Haven's Rest", color: '#d8b56d', description: 'The last refuge before the deep roads.', rivals: ['cinder'] }),
    Object.freeze({ id: 'light', name: 'Keepers of the Light', color: '#f4dc75', description: 'Wardens, healers, and hunters of corruption.', rivals: ['cinder'] }),
    Object.freeze({ id: 'ironsong', name: 'Ironsong Compact', color: '#b6c3ca', description: 'Smiths who keep the old forging oaths.', rivals: ['cinder'] }),
    Object.freeze({ id: 'cinder', name: 'Cinder Cabal', color: '#d35b43', description: 'Power-seekers sworn to the corruption below.', rivals: ['haven', 'light', 'ironsong'] }),
  ]);
  const byId = Object.freeze(Object.fromEntries(definitions.map(f => [f.id, f])));
  const tiers = Object.freeze([
    Object.freeze({ min: MIN, name: 'Hated' }), Object.freeze({ min: -3000, name: 'Hostile' }),
    Object.freeze({ min: -1000, name: 'Unfriendly' }), Object.freeze({ min: 0, name: 'Neutral' }),
    Object.freeze({ min: 1000, name: 'Friendly' }), Object.freeze({ min: 3000, name: 'Honored' }),
    Object.freeze({ min: 5000, name: 'Revered' }),
  ]);
  const clamp = value => Math.max(MIN, Math.min(MAX, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0));
  function create() { return { version: VERSION, values: Object.create(null) }; }
  function migrate(saved) {
    const out = create();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    const values = saved.values && typeof saved.values === 'object' ? saved.values : saved; // v0/v1 was a bare map
    for (const id of Object.keys(values)) if (byId[id]) out.values[id] = clamp(values[id]);
    return out;
  }
  function value(state, id) { return clamp((state && state.values ? state.values : state || {})[id]); }
  function tier(score) { let current = tiers[0]; for (const candidate of tiers) if (clamp(score) >= candidate.min) current = candidate; return current; }
  function nextTier(score) { return tiers.find(candidate => candidate.min > clamp(score)) || null; }
  function change(state, id, amount, options = {}) {
    if (!byId[id]) return 0;
    const normalized = migrate(state), before = value(normalized, id);
    normalized.values[id] = clamp(before + Number(amount || 0));
    if (state && state.values) state.values = normalized.values;
    else if (state) { state.version = VERSION; state.values = normalized.values; }
    if (options.rivals !== false && amount > 0) for (const rival of byId[id].rivals) normalized.values[rival] = clamp(value(normalized, rival) - Math.round(amount * 0.25));
    return normalized.values[id] - before;
  }
  const isHostile = (state, id) => value(state, id) <= -3000;
  const hasAccess = (state, id, minimum = 0) => !isHostile(state, id) && value(state, id) >= minimum;
  // Friendly merchants give 5% off per positive tier; hostile merchants refuse service.
  function price(base, state, id) {
    const positiveTier = Math.max(0, tiers.indexOf(tier(value(state, id))) - tiers.indexOf(tier(0)));
    return Math.max(1, Math.round(Number(base) * (1 - Math.min(0.25, positiveTier * 0.05))));
  }
  return Object.freeze({ VERSION, MIN, MAX, definitions, byId, tiers, ranks: tiers, create, migrate, value, tier, rank: tier, nextTier, change, isHostile, hasAccess, price });
})();
globalThis.Factions = Factions;
