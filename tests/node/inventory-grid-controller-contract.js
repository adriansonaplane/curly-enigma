'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const sandbox = {
  console,
  Items: {
    sizeOf(item) { return item && Array.isArray(item.size) ? item.size : [1, 1]; },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8') +
    '\nglobalThis.InventoryGridControllerContract = InventoryGridController;',
  sandbox,
  { filename: 'js/ui.js' },
);

const Controller = sandbox.InventoryGridControllerContract;
assert.strictEqual(typeof Controller, 'function');
const grid = new Controller();

const mutable = { id: 'mutable' };
const frozenPlaced = Object.freeze({ id: 'frozen-placed', _gx: 1, _gy: 0 });
const frozenUnplaced = Object.freeze({ id: 'frozen-unplaced' });
const frozenInvalid = Object.freeze({ id: 'frozen-invalid', _gx: 99, _gy: 99 });
const throwingAnchor = { id: 'throwing-anchor' };
Object.defineProperty(throwingAnchor, '_gx', { get() { throw new Error('hostile anchor'); } });

let migrated;
assert.doesNotThrow(() => {
  migrated = grid.migrateInv([
    null,
    'malformed-member',
    17,
    [],
    mutable,
    frozenPlaced,
    frozenUnplaced,
    frozenInvalid,
    throwingAnchor,
  ]);
});
assert.deepStrictEqual(Array.from(migrated), [mutable, frozenPlaced],
  'only mutable repairable records and immutable records with legal anchors survive migration');
assert.deepStrictEqual([mutable._gx, mutable._gy], [0, 0]);
assert.deepStrictEqual([frozenPlaced._gx, frozenPlaced._gy], [1, 0]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(frozenUnplaced, '_gx'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(frozenUnplaced, '_gy'), false);

assert.deepStrictEqual(Array.from(grid.migrateInv({ corrupt: true })), []);

console.log('inventory grid controller contract: ok');
