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
const Q = context.QuestState;
const player = {
  quests: Q.create(), lvl: 1, gold: 0,
  progress: { actUnlocked: 0, bossKilled: [false, false, false, false, false], abyssBest: 0 },
};

assert.strictEqual(Q.VERSION, 2);
assert.strictEqual(Q.status('cull0', player), Q.STATES.OFFERED);
assert.strictEqual(Q.accept(player, 'cull0'), true);
Q.bump(player, 'kill', 0, 29);
assert.strictEqual(Q.status('cull0', player), Q.STATES.OBJECTIVE_PROGRESS);
Q.bump(player, 'kill', 0);
assert.strictEqual(Q.status('cull0', player), Q.STATES.READY);
assert.strictEqual(Q.turnIn(player, 'cull0', 'smith'), null, 'wrong NPC cannot turn in a quest');
assert.deepStrictEqual({ ...Q.turnIn(player, 'cull0', 'elder') }, { gold: 120, xp: 220 });
assert.strictEqual(Q.status('cull0', player), Q.STATES.COMPLETED);
assert.strictEqual(Q.accept(player, 'boss0'), true, 'completion unlocks prerequisite');
assert.strictEqual(Q.fail(player, 'boss0', 'abandoned'), true);
assert.strictEqual(Q.status('boss0', player), Q.STATES.FAILED);

const migrated = Q.migrate({ p: { shrines: 2, zero: 0, __proto__: { polluted: 1 } }, done: { chests: 1 } });
assert.strictEqual(migrated.entries.shrines.status, Q.STATES.OBJECTIVE_PROGRESS);
assert.strictEqual(migrated.entries.shrines.objectives.primary, 2);
assert.strictEqual(migrated.entries.zero.status, Q.STATES.ACCEPTED);
assert.strictEqual(migrated.entries.chests.status, Q.STATES.COMPLETED);
assert.strictEqual(Object.getPrototypeOf(migrated.entries), null);
assert.strictEqual(migrated.entries.polluted, undefined);
console.log('quest state contract passed');
