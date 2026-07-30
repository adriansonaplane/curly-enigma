'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = { console, ACTS: [], BOSSES: {}, U: { roman: n => String(n) } };
for (let i = 0; i < 5; i++) {
  context.ACTS.push({ name: 'Act ' + i, boss: 'b' + i });
  context.BOSSES['b' + i] = { name: 'Boss ' + i + ', Title' };
}
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/quest-state.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/difficulty-state.js', 'utf8'), context);

const Q = context.QuestState;
const D = context.DifficultyState;

let state = D.create();
assert.strictEqual(state.version, 1);
assert.strictEqual(state.unlocked, 0, 'new heroes begin on Normal only');
assert.strictEqual(D.canSelect(state, 0), true);
assert.strictEqual(D.canSelect(state, 1), false);
assert.strictEqual(D.canSelect(null, 0), false);
assert.strictEqual(D.select(state, 1), false, 'locked tiers cannot be selected');
assert.strictEqual(D.select(null, 0), false, 'selection fails closed on absent state');
assert.strictEqual(D.activate({}, { unlocked: 0, campaigns: [] }, 0), false,
  'activation fails closed on malformed state');

// Partial versioned saves merge the selected campaign field-by-field with the
// legacy root mirrors. Inactive and forward-compatible data remains untouched.
const rootFallback = {
  difficultyIdx: 1,
  progress: { actUnlocked: 3, bossKilled: [true, true, true, false, false], abyssBest: 12, rootProgress: 'kept' },
  quests: { p: { shrines: 4 }, done: { cull0: true }, rootQuestMeta: 'kept' },
};
let partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [], rootMeta: 'kept' }, rootFallback);
assert.strictEqual(partial.selected, 1, 'an empty campaign array retains the selected tier');
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'empty selected slot falls back to root progress');
assert.strictEqual(partial.campaigns[1].quests.entries.shrines.objectives.primary, 4,
  'empty selected slot falls back to root quests');
assert.strictEqual(partial.rootMeta, 'kept');

const sparseCampaigns = [];
sparseCampaigns[0] = { inactiveMeta: 'normal-kept',
  progress: { actUnlocked: 2, bossKilled: [true, true], abyssBest: 6, progressMeta: 'kept' }, quests: Q.create() };
sparseCampaigns[2] = { inactiveMeta: 'hell-kept', progress: { actUnlocked: 1 }, quests: Q.create() };
sparseCampaigns[3] = { futureTier: 'kept' };
partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: sparseCampaigns }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.rootProgress, 'kept', 'a sparse selected slot uses root progress');
assert.strictEqual(partial.campaigns[0].inactiveMeta, 'normal-kept');
assert.strictEqual(partial.campaigns[0].progress.progressMeta, 'kept');
assert.strictEqual(partial.campaigns[2].inactiveMeta, 'hell-kept');
assert.strictEqual(partial.campaigns[3].futureTier, 'kept', 'unknown future tiers survive migration');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { nestedMeta: 'kept', quests: { p: { chests: 2 } } }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'missing nested progress uses root progress');
assert.strictEqual(partial.campaigns[1].quests.entries.chests.objectives.primary, 2,
  'valid nested quests win over root quests');
assert.strictEqual(partial.campaigns[1].quests.entries.shrines, undefined);
assert.strictEqual(partial.campaigns[1].nestedMeta, 'kept');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: { actUnlocked: 4, bossKilled: [true, true, true, true, false], abyssBest: 22, nestedProgress: 'kept' } }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 4, 'valid nested progress wins over root progress');
assert.strictEqual(partial.campaigns[1].progress.nestedProgress, 'kept');
assert.strictEqual(partial.campaigns[1].quests.entries.shrines.objectives.primary, 4,
  'missing nested quests uses root quests');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: {}, quests: {} }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'empty progress retains root act state');
assert.deepStrictEqual(Array.from(partial.campaigns[1].progress.bossKilled), [true, true, true, false, false]);
assert.strictEqual(partial.campaigns[1].progress.abyssBest, 12);
assert.strictEqual(partial.campaigns[1].quests.entries.shrines.objectives.primary, 4,
  'empty quest placeholder cannot erase valid root quests');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: { actUnlocked: 4, nestedOnly: 'kept' }, quests: {} }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 4, 'nested act overrides the root act');
assert.deepStrictEqual(Array.from(partial.campaigns[1].progress.bossKilled), [true, true, true, false, false],
  'partial act-only state inherits root boss kills');
assert.strictEqual(partial.campaigns[1].progress.abyssBest, 12, 'partial act-only state inherits root Abyss depth');
assert.strictEqual(partial.campaigns[1].progress.rootProgress, 'kept');
assert.strictEqual(partial.campaigns[1].progress.nestedOnly, 'kept');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: { bossKilled: [false, true, false, true, false] } }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'boss-only state inherits root act');
assert.deepStrictEqual(Array.from(partial.campaigns[1].progress.bossKilled), [false, true, false, true, false]);
assert.strictEqual(partial.campaigns[1].progress.abyssBest, 12, 'boss-only state inherits root Abyss depth');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: { abyssBest: 31 } }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'Abyss-only state inherits root act');
assert.deepStrictEqual(Array.from(partial.campaigns[1].progress.bossKilled), [true, true, true, false, false]);
assert.strictEqual(partial.campaigns[1].progress.abyssBest, 31, 'nested Abyss depth overrides root depth');

partial = D.migrate({ version: 1, selected: Infinity, unlocked: Infinity, campaigns: [null,
  { malformedMeta: 'kept', progress: { actUnlocked: Infinity, bossKilled: 'bad', abyssBest: Infinity },
    quests: { entries: { chests: { status: 'accepted' } } } }] }, rootFallback);
assert.strictEqual(partial.selected, 1, 'nonfinite selected tier falls back to the valid legacy tier');
assert.strictEqual(partial.unlocked, 1, 'nonfinite unlocked tier is repaired');
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'nonfinite nested act falls back to valid root state');
assert.strictEqual(partial.campaigns[1].progress.abyssBest, 12, 'nonfinite nested Abyss falls back to valid root state');
assert.deepStrictEqual(Array.from(partial.campaigns[1].progress.bossKilled), [true, true, true, false, false],
  'malformed nested boss kills fall back to valid root state');
assert.strictEqual(partial.campaigns[1].quests.entries.shrines.objectives.primary, 4,
  'entries without a canonical version are malformed and fall back to root quests');
assert.strictEqual(partial.campaigns[1].malformedMeta, 'kept');

partial = D.migrate({ version: 1, selected: 1, unlocked: 1, campaigns: [null,
  { progress: [], quests: 'bad' }] }, rootFallback);
assert.strictEqual(partial.campaigns[1].progress.actUnlocked, 3, 'malformed progress field uses root progress');
assert.strictEqual(partial.campaigns[1].quests.entries.cull0.status, Q.STATES.COMPLETED,
  'malformed quest field uses root quests');

partial = D.migrate({ version: 1, selected: 0, unlocked: 0, campaigns: [{
  progress: { actUnlocked: -Infinity, abyssBest: 1e30, bossKilled: [1, true, null, false, true] }, quests: Q.create(),
}] }, {});
assert.strictEqual(partial.campaigns[0].progress.actUnlocked, 0);
assert.strictEqual(partial.campaigns[0].progress.abyssBest, 1000000, 'finite progress is capped at a safe sanity bound');
assert.deepStrictEqual(Array.from(partial.campaigns[0].progress.bossKilled), [false, true, false, false, true]);
assert.strictEqual(Number.isFinite(partial.campaigns[0].progress.abyssBest), true);

const legacy = {
  difficultyIdx: 0,
  progress: { actUnlocked: 5, bossKilled: [true, true, true, true, true], abyssBest: 9, futureFlag: 'kept' },
  quests: { p: { shrines: 2 }, done: { cull0: true } },
};
state = D.migrate(null, legacy);
assert.strictEqual(state.unlocked, 1, 'a legacy Act V clear earns Nightmare without another boss kill');
assert.strictEqual(state.campaigns[0].progress.abyssBest, 9);
assert.strictEqual(state.campaigns[0].progress.futureFlag, 'kept', 'unknown progress data is retained');
assert.strictEqual(state.campaigns[0].quests.entries.shrines.objectives.primary, 2);
assert.strictEqual(state.campaigns[0].quests.entries.cull0.status, Q.STATES.COMPLETED);
assert.strictEqual(state.campaigns[1].progress.actUnlocked, 0, 'newly unlocked campaign begins fresh');
assert.strictEqual(state.campaigns[1].progress.bossKilled.some(Boolean), false);

const marker = { id: 'kept-gear' };
const player = { difficulty: state, difficultyIdx: 0, progress: state.campaigns[0].progress,
  quests: state.campaigns[0].quests, equip: { weapon: marker }, lvl: 42, gold: 777 };
assert.ok(D.activate(player, state, 1));
assert.strictEqual(player.progress, state.campaigns[1].progress, 'selection binds the chosen campaign');
assert.strictEqual(player.equip.weapon, marker, 'switching does not replace character gear');
player.progress.actUnlocked = 2;
player.quests.entries.nightmareOnly = { status: Q.STATES.ACCEPTED, objectives: {} };
state = D.capture(player);
assert.ok(D.activate(player, state, 0));
assert.strictEqual(player.progress.abyssBest, 9, 'Normal progress survives a Nightmare session');
assert.strictEqual(state.campaigns[1].progress.actUnlocked, 2, 'Nightmare progress is retained independently');
assert.strictEqual(state.campaigns[1].quests.entries.nightmareOnly.status, Q.STATES.ACCEPTED);
assert.strictEqual(player.lvl, 42);
assert.strictEqual(player.gold, 777);

assert.strictEqual(D.canSelect(state, 2), false);
D.activate(player, state, 1);
player.progress.bossKilled[4] = true;
player.progress.actUnlocked = 5;
assert.strictEqual(D.unlockNext(state, 1), 2, 'Nightmare Act V unlocks Hell');
assert.strictEqual(D.unlockNext(state, 1), null, 'the unlock is only awarded once');
assert.strictEqual(D.canSelect(state, 2), true);
assert.ok(D.activate(player, state, 2));
assert.strictEqual(player.progress.actUnlocked, 0, 'Hell starts as a separate campaign');
assert.strictEqual(D.unlockNext(state, 2), null, 'Hell has no phantom fourth tier');

state = D.capture(player);
const roundTrip = D.migrate(JSON.parse(JSON.stringify(state)), {});
assert.strictEqual(roundTrip.unlocked, 2);
assert.strictEqual(roundTrip.selected, 2);
assert.strictEqual(roundTrip.campaigns[0].progress.abyssBest, 9);
assert.strictEqual(roundTrip.campaigns[1].progress.actUnlocked, 5);
assert.strictEqual(roundTrip.campaigns[2].progress.actUnlocked, 0);

const forwardCompatible = D.migrate(Object.assign(JSON.parse(JSON.stringify(roundTrip)), { futureRoot: 'kept' }), {});
assert.strictEqual(forwardCompatible.futureRoot, 'kept', 'unknown versioned state is retained');

const oldNightmare = D.migrate(null, { difficultyIdx: 1,
  progress: { actUnlocked: 3, bossKilled: [true, true, true, false, false], abyssBest: 0 }, quests: null });
assert.strictEqual(oldNightmare.unlocked, 1);
assert.strictEqual(oldNightmare.selected, 1);
assert.strictEqual(oldNightmare.campaigns[0].progress.bossKilled.every(Boolean), true,
  'an old later-tier save retains the prerequisite lower-tier clear');

console.log('difficulty state contract passed');
