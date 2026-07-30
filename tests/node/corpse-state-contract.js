'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const context = { console, Date }; context.globalThis = context; vm.createContext(context);
vm.runInContext(fs.readFileSync('js/corpse-state.js', 'utf8'), context);
const C = context.CorpseState;
const item = (id, type='ring') => ({ id, type, stats: { hp: 7 } });
const gem = { id:'gem-1', kind:'gem', data:{ roll:9 } };
const sword = item('sword','sword'); sword.sockets=1; sword.gems=[gem];
const helm = item('helm','helm');
const p = { equip:{ weapon:sword, helm, ring1:null }, inv:[], corpses:[] };
let result = C.capture(p, { kind:'dungeon', act:2, dungeon:'crypt', floor:3, x:4, y:5 });
assert(result.ok); const first = result.corpse;
assert.deepStrictEqual(Array.from(first.gear, e => e.slot), ['weapon','helm']);
assert.strictEqual(p.equip.weapon, null); assert.strictEqual(p.equip.helm, null);
assert.strictEqual(first.location.dungeon, 'crypt'); assert.strictEqual(first.version, C.VERSION);
assert.strictEqual(first.gear[0].item, sword, 'capture moves exact item object');

p.equip.ring1 = item('ring');
const second = C.capture(p, { kind:'town', town:'rogue-camp' }).corpse;
assert.notStrictEqual(first.id, second.id); assert.strictEqual(p.corpses.length, 2);
assert.strictEqual(C.capture(p, {}).reason, 'no-gear');
const unchanged = JSON.stringify(p);
assert.strictEqual(C.capture({ hardcore:true, equip:{weapon:item('hc')}, corpses:[] }, {}).reason, 'hardcore');
assert.strictEqual(JSON.stringify(p), unchanged, 'no-op does not mutate');

result = C.recover(p, first.id);
assert.deepStrictEqual({ok:result.ok,restored:result.restored,spilled:result.spilled},{ok:true,restored:2,spilled:0});
assert.strictEqual(p.equip.weapon, sword); assert.strictEqual(sword.gems[0], gem);
assert.strictEqual(sword.gems[0].data.roll, 9); assert.strictEqual(p.corpses.length, 1);
assert.strictEqual(C.recover(p, first.id).reason, 'not-found', 'recovery is idempotent');

// Occupied original slot spills first-fit while empty slots restore directly.
p.equip.ring1 = item('replacement');
result = C.recover(p, second.id); assert.strictEqual(result.spilled, 1);
assert.strictEqual(p.inv[0].id, 'ring'); assert.deepStrictEqual([p.inv[0]._gx,p.inv[0]._gy],[0,0]);

// A failed multi-item plan changes nothing, including planned item coordinates.
const full = []; for(let y=0;y<6;y++) for(let x=0;x<10;x++) full.push({_gx:x,_gy:y,id:`f${x}-${y}`,type:'ring'});
const spill = item('spill');
const blocked = { equip:{ring1:item('occupied')}, inv:full, corpses:[{id:'blocked',version:1,gear:[{slot:'ring1',item:spill}],location:{kind:'town'}}] };
const before = JSON.stringify(blocked); result=C.recover(blocked,'blocked');
assert.strictEqual(result.reason,'inventory-full'); assert.strictEqual(JSON.stringify(blocked),before); assert.strictEqual(spill._gx,undefined);

// Legacy/malformed records are repaired, empty records discarded, duplicate ids replaced.
const a=item('a'), b=item('b');
const migrated=C.migrate([{id:'same',items:{weapon:a},where:{dungeon:'pit',floor:'2'}},{id:'same',equipment:{helm:b}},null,{id:'empty',gear:'bad'}]);
assert.strictEqual(migrated.length,2); assert.strictEqual(migrated[0].id,'same'); assert.notStrictEqual(migrated[1].id,'same');
assert.deepStrictEqual(Array.from(migrated[0].gear,e=>e.slot),['weapon']); assert.strictEqual(migrated[0].location.kind,'dungeon');
assert.strictEqual(migrated[0].gear[0].item,a); assert.strictEqual(C.migrate(migrated)[1].id,migrated[1].id,'migration is idempotent');

const reloc={corpses:migrated}; const held=reloc.corpses[0].gear[0].item;
assert.strictEqual(C.relocateInaccessible(reloc, loc=>loc.dungeon==='open',{town:'rogue-camp',act:1,x:8}),1);
assert.strictEqual(reloc.corpses[0].location.kind,'town'); assert.strictEqual(reloc.corpses[0].gear[0].item,held);
assert.strictEqual(C.relocateInaccessible(reloc,()=>false,{town:'rogue-camp'}),0,'relocation is idempotent');
console.log('corpse state contract: ok');
