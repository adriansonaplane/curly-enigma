// ============ DIABLOID: quest-state.js — quest catalogue and saved state ============
'use strict';

// Keep the quest model independent from WUI.  The single exported object is
// intentional: classic scripts share a page, so adding one namespace is safer
// than publishing every quest helper as a global function.
const QuestState = (() => {
  const quests = [];

  ACTS.forEach((act, i) => {
    quests.push({ id: 'cull' + i, name: 'Cull the Horde ' + U.roman(i + 1), type: 'kill', act: i, need: 30,
      desc: `Slay 30 monsters in ${act.name}.`, gold: 120 + i * 220, xp: 220 * Math.pow(3.1, i) });
    quests.push({ id: 'boss' + i, name: BOSSES[act.boss].name.split(',')[0] + ' Must Fall', type: 'boss', act: i, need: 1,
      desc: `Destroy the master of ${act.name}.`, gold: 350 + i * 400, xp: 500 * Math.pow(3.1, i) });
  });
  for (const level of [5, 15, 30, 50, 75])
    quests.push({ id: 'lvl' + level, name: 'Rise to ' + level, type: 'level', need: level,
      desc: `Reach level ${level}.`, gold: level * 40, xp: 0 });
  for (const floor of [3, 10, 25])
    quests.push({ id: 'abyss' + floor, name: 'Abyss: Floor ' + floor, type: 'abyss', need: floor,
      desc: `Descend to floor ${floor} of the Endless Abyss.`, gold: floor * 300, xp: floor * 900 });
  quests.push(
    { id: 'shrines', name: 'Kissed by Light', type: 'shrine', need: 3, desc: 'Receive blessings from 3 shrines.', gold: 250, xp: 300 },
    { id: 'chests', name: 'Treasure Hunter', type: 'chest', need: 5, desc: 'Loot 5 treasure chests.', gold: 400, xp: 500 },
    { id: 'rich', name: 'Filthy Rich', type: 'gold', need: 10000, desc: 'Hold 10,000 gold at once.', gold: 1000, xp: 800 },
  );
  quests.forEach(Object.freeze);
  Object.freeze(quests);

  const record = value => {
    const result = Object.create(null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const id of Object.keys(value)) result[id] = value[id];
    return result;
  };

  function create() { return { version: 1, p: Object.create(null), done: Object.create(null) }; }

  // v0 characters stored only {p, done}. Preserve unknown quest ids so a save
  // can round-trip across versions without silently discarding future data.
  function migrate(saved) {
    const state = create();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return state;
    const progress = saved.p || saved.progress;
    for (const id in record(progress)) {
      const value = Number(progress[id]);
      if (Number.isFinite(value) && value >= 0) state.p[id] = value;
    }
    const completed = saved.done || saved.completed;
    for (const id in record(completed)) if (completed[id]) state.done[id] = true;
    return state;
  }

  function available(quest, player) {
    if (quest.type === 'kill' || quest.type === 'boss') return quest.act <= player.progress.actUnlocked;
    if (quest.type === 'abyss') return player.progress.actUnlocked >= 5 || player.progress.bossKilled[4];
    return true;
  }

  function progress(quest, player) {
    const state = player.quests;
    if (quest.type === 'kill') return state.p[quest.id] || 0;
    if (quest.type === 'boss') return player.progress.bossKilled[quest.act] ? 1 : 0;
    if (quest.type === 'level') return player.lvl;
    if (quest.type === 'abyss') return player.progress.abyssBest || 0;
    if (quest.type === 'gold') return player.gold;
    return state.p[quest.id] || 0;
  }

  function bump(player, type, act, amount = 1) {
    for (const quest of quests) {
      if (quest.type !== type || player.quests.done[quest.id] || !available(quest, player)) continue;
      if ((type === 'kill' || type === 'boss') && quest.act !== act) continue;
      if (type === 'kill' || type === 'shrine' || type === 'chest')
        player.quests.p[quest.id] = (player.quests.p[quest.id] || 0) + amount;
    }
  }

  function takeCompleted(player) {
    const completed = [];
    for (const quest of quests) {
      if (!player.quests.done[quest.id] && available(quest, player) && progress(quest, player) >= quest.need) {
        player.quests.done[quest.id] = true;
        completed.push(quest);
      }
    }
    return completed;
  }

  return Object.freeze({ quests, create, migrate, available, progress, bump, takeCompleted });
})();
globalThis.QuestState = QuestState;
