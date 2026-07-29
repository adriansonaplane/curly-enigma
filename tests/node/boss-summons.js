'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const monsters = [];
const sandbox = {
  globalThis: {},
  G: {
    monsters,
    projs: [], pending: [], storms: [], shake: 0,
    awardXp() {}, dropLoot() {}, stats: { kills: 0 }, onBossKilled() {},
  },
  U: {
    rand: () => 0,
    rf: (_rng, lo) => lo,
    pick: (_rng, values) => values[0],
    angleTo: () => 0,
  },
  FX: { ring() {}, deathBurst() {} },
  Physics: { ragdoll() {}, burst() {} },
  sfx() {},
  ELITE_MODS: {},
};
vm.createContext(sandbox);
const source = fs.readFileSync(path.join(__dirname, '../../js/entities.js'), 'utf8');
vm.runInContext(`${source}\nglobalThis.Ent = Ent;`, sandbox);
const Ent = sandbox.globalThis.Ent;

Ent.makeMonster = (kind, x, y) => {
  const add = { kind, x, y, dead: false };
  monsters.push(add);
  return add;
};

const boss = {
  x: 5, y: 5, size: 2, lvl: 10, hp: 100, maxHp: 100,
  dmgLo: 1, dmgHi: 2, atkCd: 1, abilityCd: 0,
  abilities: ['summon_skeleton'], boss: true, rank: 'boss',
  mods: [], def: { pal: { main: '#fff' } }, xpVal: 100,
};
monsters.push(boss);

for (let i = 0; i < 10; i++) {
  boss.abilityCd = 0;
  Ent.updateBoss(boss, { x: 20, y: 20 }, 20, 0, 0.1, 0);
}

const livingAdds = () => monsters.filter(m => !m.dead && m.summonedBy === boss);
assert.strictEqual(livingAdds().length, Ent.BOSS_ADD_CAP, 'repeated summons must respect the per-boss cap');
assert(livingAdds().every(add => add.aggro), 'boss adds should immediately aggro');

Ent.killMonster(boss, null);
assert.strictEqual(livingAdds().length, 0, 'all living adds should despawn with their boss');
assert(monsters.filter(m => m.summonedBy === boss).every(add => add.deathT === 0.4));
assert.strictEqual(sandbox.G.stats.kills, 1, 'despawned adds must not count as kills');

console.log('boss summoning enforces its living-add cap and cleans up owned adds');
