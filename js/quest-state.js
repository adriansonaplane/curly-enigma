// ============ DIABLOID: quest-state.js — quest catalogue and saved state ============
'use strict';

// Quest definitions are data; mutable character state is kept separately. This
// makes quest relationships useful to dialogue/world systems without coupling
// them to WUI.
const QuestState = (() => {
  const VERSION = 2;
  const STATES = Object.freeze({
    OFFERED: 'offered', ACCEPTED: 'accepted', OBJECTIVE_PROGRESS: 'objective-progress',
    READY: 'ready-to-turn-in', COMPLETED: 'completed', FAILED: 'failed',
  });
  const VALID_STATES = new Set(Object.values(STATES));
  const quests = [];

  const objective = (id, type, need, text, extra = {}) => ({ id, type, need, text, ...extra });
  const add = q => quests.push({ faction: ({ elder: 'haven', healer: 'light', smith: 'ironsong', gambler: 'haven' })[q.giverNpc || 'elder'], reputation: 150, ...q, objectives: q.objectives || [[objective('primary', q.type, q.need, q.desc,
    q.act === undefined ? {} : { act: q.act })]], rewards: q.rewards || { gold: q.gold || 0, xp: q.xp || 0 },
    giverNpc: q.giverNpc || 'elder', turnInNpc: q.turnInNpc || q.giverNpc || 'elder',
    prerequisites: q.prerequisites || [], branches: q.branches || [], consequenceHooks: q.consequenceHooks || [] });

  ACTS.forEach((act, i) => {
    const prerequisite = i ? ['boss' + (i - 1)] : [];
    add({ id: 'cull' + i, name: 'Cull the Horde ' + U.roman(i + 1), type: 'kill', act: i, need: 30,
      desc: `Slay 30 monsters in ${act.name}.`, gold: 120 + i * 220, xp: 220 * Math.pow(3.1, i), prerequisites: prerequisite });
    add({ id: 'boss' + i, name: BOSSES[act.boss].name.split(',')[0] + ' Must Fall', type: 'boss', act: i, need: 1,
      desc: `Destroy the master of ${act.name}.`, gold: 350 + i * 400, xp: 500 * Math.pow(3.1, i),
      prerequisites: ['cull' + i], consequenceHooks: ['act-boss-defeated'] });
  });
  for (const level of [5, 15, 30, 50, 75])
    add({ id: 'lvl' + level, name: 'Rise to ' + level, type: 'level', need: level,
      desc: `Reach level ${level}.`, gold: level * 40, xp: 0, giverNpc: 'healer', turnInNpc: 'healer' });
  for (const floor of [3, 10, 25])
    add({ id: 'abyss' + floor, name: 'Abyss: Floor ' + floor, type: 'abyss', need: floor,
      desc: `Descend to floor ${floor} of the Endless Abyss.`, gold: floor * 300, xp: floor * 900,
      prerequisites: floor === 3 ? ['boss4'] : ['abyss' + ({ 10: 3, 25: 10 })[floor]], consequenceHooks: ['abyss-milestone'] });
  add({ id: 'shrines', name: 'Kissed by Light', type: 'shrine', need: 3, desc: 'Receive blessings from 3 shrines.', gold: 250, xp: 300, giverNpc: 'healer' });
  add({ id: 'chests', name: 'Treasure Hunter', type: 'chest', need: 5, desc: 'Loot 5 treasure chests.', gold: 400, xp: 500, giverNpc: 'gambler', turnInNpc: 'gambler',
    branches: [{ id: 'keep', label: 'Keep the spoils' }, { id: 'share', label: 'Share with the village' }] });
  add({ id: 'rich', name: 'Filthy Rich', type: 'gold', need: 10000, desc: 'Hold 10,000 gold at once.', gold: 1000, xp: 800, giverNpc: 'gambler', turnInNpc: 'gambler' });
  add({ id: 'investigate-depths', name: 'Signs in the Depths', type: 'narrative', need: 3,
    desc: 'Inspect 3 clues or encounters in the dungeons.', gold: 300, xp: 450, giverNpc: 'elder', faction: 'haven' });

  // Freeze nested authored data as well as the definitions themselves.
  for (const q of quests) {
    q.objectives.forEach(group => { group.forEach(Object.freeze); Object.freeze(group); });
    q.branches.forEach(Object.freeze); Object.freeze(q.objectives); Object.freeze(q.rewards);
    Object.freeze(q.prerequisites); Object.freeze(q.branches); Object.freeze(q.consequenceHooks); Object.freeze(q);
  }
  Object.freeze(quests);
  const byId = Object.freeze(Object.fromEntries(quests.map(q => [q.id, q])));

  const dictionary = () => Object.create(null);
  const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  function create() { return { version: VERSION, entries: dictionary() }; }
  function cleanNumber(value) { value = Number(value); return Number.isFinite(value) && value >= 0 ? value : 0; }
  function cleanEntry(raw) {
    raw = safeObject(raw);
    const status = VALID_STATES.has(raw.status) ? raw.status : STATES.OFFERED;
    const entry = { status, objectives: dictionary() };
    for (const id of Object.keys(safeObject(raw.objectives))) entry.objectives[id] = cleanNumber(raw.objectives[id]);
    if (typeof raw.branch === 'string') entry.branch = raw.branch;
    if (raw.readyNotified === true) entry.readyNotified = true;
    return entry;
  }

  // v0/v1 used {p, done}; progress becomes an accepted quest and done always
  // wins as completed. Own enumerable keys only prevent prototype payloads from
  // leaking into state, while unknown ids are retained for forward compatibility.
  function migrate(saved) {
    const state = create();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return state;
    if (saved.version >= VERSION && saved.entries && typeof saved.entries === 'object') {
      for (const id of Object.keys(saved.entries)) state.entries[id] = cleanEntry(saved.entries[id]);
      return state;
    }
    const progress = safeObject(saved.p || saved.progress);
    for (const id of Object.keys(progress)) state.entries[id] = { status: cleanNumber(progress[id]) > 0 ? STATES.OBJECTIVE_PROGRESS : STATES.ACCEPTED,
      objectives: Object.assign(dictionary(), { primary: cleanNumber(progress[id]) }) };
    const completed = safeObject(saved.done || saved.completed);
    for (const id of Object.keys(completed)) if (completed[id]) state.entries[id] = { status: STATES.COMPLETED, objectives: dictionary() };
    return state;
  }

  const entry = (player, quest) => player.quests.entries[typeof quest === 'string' ? quest : quest.id];
  const status = (quest, player) => (entry(player, quest) || {}).status || STATES.OFFERED;
  function available(quest, player) {
    if (!quest || !player) return false;
    if (!quest.prerequisites.every(id => status(id, player) === STATES.COMPLETED)) return false;
    if (quest.type === 'kill' || quest.type === 'boss') return quest.act <= player.progress.actUnlocked;
    if (quest.type === 'abyss') return player.progress.actUnlocked >= 5 || player.progress.bossKilled[4];
    return true;
  }
  function accept(player, questId, branch) {
    const quest = byId[questId];
    if (!quest || !available(quest, player) || status(quest, player) !== STATES.OFFERED) return false;
    if (branch !== undefined && !quest.branches.some(option => option.id === branch)) return false;
    player.quests.entries[questId] = { status: STATES.ACCEPTED, objectives: dictionary() };
    if (branch !== undefined) player.quests.entries[questId].branch = branch;
    refresh(player, quest);
    return true;
  }

  function objectiveProgress(quest, obj, player) {
    const saved = entry(player, quest);
    if (obj.type === 'boss') return player.progress.bossKilled[obj.act] ? 1 : 0;
    if (obj.type === 'level') return player.lvl;
    if (obj.type === 'abyss') return player.progress.abyssBest || 0;
    if (obj.type === 'gold') return player.gold;
    return saved && saved.objectives[obj.id] || 0;
  }
  const activeObjectives = (quest, player) => quest.objectives.find(group =>
    !group.every(obj => objectiveProgress(quest, obj, player) >= obj.need)) || quest.objectives[quest.objectives.length - 1];
  function progress(quest, player) { return objectiveProgress(quest, quest.objectives[0][0], player); }
  function refresh(player, quest) {
    const current = entry(player, quest);
    if (!current || ![STATES.ACCEPTED, STATES.OBJECTIVE_PROGRESS, STATES.READY].includes(current.status)) return current && current.status;
    let any = false;
    let allPrior = true;
    for (const group of quest.objectives) {
      const complete = group.every(obj => objectiveProgress(quest, obj, player) >= obj.need);
      any ||= group.some(obj => objectiveProgress(quest, obj, player) > 0);
      if (!complete) allPrior = false;
    }
    const next = allPrior ? STATES.READY : any ? STATES.OBJECTIVE_PROGRESS : STATES.ACCEPTED;
    if (next === STATES.READY && current.status !== STATES.READY) current.readyNotified = false;
    current.status = next;
    return current.status;
  }
  function bump(player, type, act, amount = 1) {
    for (const quest of quests) {
      const current = entry(player, quest);
      if (!current || ![STATES.ACCEPTED, STATES.OBJECTIVE_PROGRESS].includes(current.status)) continue;
      const group = activeObjectives(quest, player);
      for (const obj of group) {
        if (obj.type !== type || (obj.act !== undefined && obj.act !== act)) continue;
        current.objectives[obj.id] = cleanNumber(current.objectives[obj.id]) + cleanNumber(amount);
      }
      refresh(player, quest);
    }
  }
  function takeCompleted(player) { // Compatibility name: returns newly ready quests; never auto-completes.
    const ready = [];
    for (const quest of quests) {
      if (refresh(player, quest) === STATES.READY) {
        const current = entry(player, quest);
        if (!current.readyNotified) { current.readyNotified = true; ready.push(quest); }
      }
    }
    return ready;
  }
  function turnIn(player, questId, npcId, runHook) {
    const quest = byId[questId];
    const current = quest && entry(player, quest);
    if (!quest || !current || refresh(player, quest) !== STATES.READY || (npcId && npcId !== quest.turnInNpc)) return null;
    current.status = STATES.COMPLETED;
    if (typeof runHook === 'function') for (const hook of quest.consequenceHooks) runHook(hook, quest, current.branch);
    return quest.rewards;
  }
  function fail(player, questId, reason) {
    const current = entry(player, questId);
    if (!current || ![STATES.ACCEPTED, STATES.OBJECTIVE_PROGRESS, STATES.READY].includes(current.status)) return false;
    current.status = STATES.FAILED;
    if (typeof reason === 'string') current.failureReason = reason;
    return true;
  }

  return Object.freeze({ VERSION, STATES, quests, byId, create, migrate, status, available, accept, progress,
    objectiveProgress, activeObjectives, refresh, bump, takeCompleted, turnIn, fail });
})();
globalThis.QuestState = QuestState;
