'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = {}; sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../js/item-condition.js'), 'utf8'), sandbox);
const C = sandbox.ItemCondition, plain = value => JSON.parse(JSON.stringify(value)), snap = JSON.stringify;
let serial = 0;
const item = (type, extra = {}) => Object.assign({ id: `i${++serial}`, type, tier: 0, price: 400, stats: {}, gems: [] }, extra);

const families = ['sword','axe','mace','dagger','spear','claw','bow','crossbow','wand','staff','helm','chest','gloves','boots','belt','shield','orb'];
families.forEach(type => { const x = item(type); assert(Number.isInteger(C.maxDurability(x))); assert(C.maxDurability(x) >= 1 && C.maxDurability(x) <= 100); });
assert.strictEqual(C.maxDurability(item('ring')), 0); assert.strictEqual(C.maxDurability(item('amulet')), 0);
assert(C.maxDurability(item('sword', { tier: 4 })) > C.maxDurability(item('sword', { tier: 0 })));

for (const bad of [undefined, null, '', NaN, Infinity]) { const x = item('axe', { durability: bad, custom: { kept: 1 } }); C.normalize(x); assert.strictEqual(x.durability, x.maxDurability); assert.deepStrictEqual(x.custom, { kept: 1 }); const once = snap(x); C.normalize(x); assert.strictEqual(snap(x), once); }
const negative = item('helm', { durability: -9 }); C.normalize(negative); assert.strictEqual(negative.durability, 0);
const high = item('chest', { durability: 9999 }); C.normalize(high); assert.strictEqual(high.durability, high.maxDurability);
const legacy = item('staff'); C.normalize(legacy); assert.strictEqual(legacy.durability, legacy.maxDurability);
const jewel = item('ring', { durability: 5, maxDurability: 6, future: true }); C.normalize(jewel); assert.strictEqual(jewel.durability, undefined); assert.strictEqual(jewel.future, true);

const worn = item('sword'); C.normalize(worn); const max = worn.maxDurability;
assert.deepStrictEqual(plain(C.wear(worn, 3)), { ok:true, reason:'', amount:3, before:max, after:max-3, broke:false, crossed:false });
assert.strictEqual(C.wear(worn, 1.9).amount, 1); assert.strictEqual(worn.durability, max - 4);
worn.durability = 2; const broke = C.wear(worn, 99); assert.strictEqual(worn.durability, 0); assert.strictEqual(broke.amount, 2); assert.strictEqual(broke.broke, true); assert.strictEqual(C.isBroken(worn), true);
assert.strictEqual(C.wear(worn, 2).broke, false); assert.strictEqual(worn.durability, 0);

const socket = { id:'sock', kind:'rune', name:'Zod', durability:77 }, corpseItem = item('shield', { id:'corpse', gems:[socket], durability:2, custom:'preserve' });
const hero = item('sword', { id:'hero', durability:1 }), merc = item('helm', { id:'merc', durability:3 });
const eth = item('axe', { id:'eth', ethereal:true, durability:1 }), full = item('boots', { id:'full' }); C.normalize(full);
const duplicate = hero;
const player = { gold:9999, equip:{weapon:hero}, inv:[duplicate, eth, full], mercenary:{equipment:{helm:merc}}, corpses:[{gear:[{slot:'offhand',item:corpseItem}]}], marker:{kept:true} };
const stash = [item('staff', { id:'stash', durability:4 }), hero];
assert.strictEqual(C.owned(player, stash).filter(x => x.id === 'hero').length, 1);
const q1 = plain(C.quoteAll(player, stash)), q2 = plain(C.quoteAll(player, stash)); assert.deepStrictEqual(q1, q2); assert.deepStrictEqual(q1.entries.map(x => x.id), ['corpse','hero','merc','stash']);
assert.strictEqual(q1.excluded.find(x => x.id === 'eth').reason, 'ethereal'); assert.strictEqual(q1.excluded.find(x => x.id === 'full').reason, 'already-full');
assert.strictEqual(C.quote(eth).reason, 'ethereal');

const poor = plain(player), poorStash = plain(stash); poor.gold = q1.cost - 1; const poorBefore = snap(poor), poorStashBefore = snap(poorStash);
assert.strictEqual(C.repairAll(poor, q1, poorStash).reason, 'insufficient-gold'); assert.strictEqual(snap(poor), poorBefore); assert.strictEqual(snap(poorStash), poorStashBefore);
const stalePlayer = plain(player), staleStash = plain(stash), staleBefore = snap(stalePlayer); stalePlayer.equip.weapon = null; stalePlayer.inv = stalePlayer.inv.filter(x => x.id !== 'hero'); staleStash.splice(staleStash.findIndex(x => x.id === 'hero'), 1); const afterRemoval = snap(stalePlayer);
assert.strictEqual(C.repairAll(stalePlayer, q1, staleStash).reason, 'stale-ownership'); assert.strictEqual(snap(stalePlayer), afterRemoval); assert.notStrictEqual(staleBefore, afterRemoval);

const beforeGold = player.gold, result = C.repairAll(player, q1, stash); assert.strictEqual(result.ok, true); assert.strictEqual(result.cost, q1.cost); assert.strictEqual(player.gold, beforeGold-q1.cost);
q1.entries.forEach(e => { const found=C.owned(player,stash).find(x=>x.id===e.id).item; assert.strictEqual(found.durability, found.maxDurability); });
assert.strictEqual(eth.durability,1); assert.strictEqual(full.durability,full.maxDurability); assert.strictEqual(corpseItem.gems[0],socket); assert.strictEqual(socket.durability,77); assert.strictEqual(corpseItem.custom,'preserve');

const one = item('mace', { id:'one', durability:1, price:257 }), onePlayer={gold:1000,inv:[one]}; const oneQ=C.quoteOne(onePlayer,'one'); const oneGold=onePlayer.gold; const oneResult=C.repairOne(onePlayer,oneQ); assert(oneResult.ok); assert.strictEqual(onePlayer.gold,oneGold-oneQ.cost); assert.strictEqual(one.durability,one.maxDurability);
const missingBefore=snap(onePlayer); assert.strictEqual(C.repairOne(onePlayer,'missing').reason,'not-owned'); assert.strictEqual(snap(onePlayer),missingBefore);
one.durability = 1; const duplicateQuote = C.quote(one);
const duplicatePlan = { ok:true, cost:duplicateQuote.cost*2, entries:[duplicateQuote,duplicateQuote] }, duplicateBefore=snap(onePlayer);
assert.strictEqual(C.commit(onePlayer,duplicatePlan).reason,'invalid-plan'); assert.strictEqual(snap(onePlayer),duplicateBefore);
console.log('item condition contract: ok');
