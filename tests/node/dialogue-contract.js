'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/dialogue.js'), 'utf8'), sandbox);
const Dialogue = sandbox.globalThis.Dialogue;

const fresh = Dialogue.migrate(null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(fresh)), { version: 1, visited: {}, consequences: {}, flags: {} });
const migrated = Dialogue.migrate({ visited: { elder: ['welcome', 'welcome', 4] }, flags: { heard: true } });
assert.deepStrictEqual(Array.from(migrated.visited.elder), ['welcome']);
assert.strictEqual(migrated.flags.heard, true);

const player = { lvl: 4, gold: 10, stats: { ene: 8 }, derived: { ene: 13 }, potions: { hp: 2, mp: 2 } };
Dialogue.visit(fresh, 'elder', 'welcome');
assert(Dialogue.meets({ visited: 'welcome', level: 4, stat: 'ene', atLeast: 12 }, player, fresh, 'elder'));
assert(!Dialogue.meets({ gold: 11 }, player, fresh, 'elder'));
assert(!Dialogue.applyEffects([{ type: 'gold', amount: -11 }], player, fresh), 'invalid effects must be atomic');
assert.strictEqual(player.gold, 10);
assert(Dialogue.applyEffects([{ type: 'gold', amount: -5 }, { type: 'flag', key: 'paid' }], player, fresh));
assert.strictEqual(player.gold, 5);
assert.strictEqual(fresh.flags.paid, true);

console.log('dialogue graphs migrate state and apply validated consequences atomically');
