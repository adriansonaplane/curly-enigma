// ============ DIABLOID: dialogue.js — authored NPC dialogue graphs ============
'use strict';

// Graph vocabulary:
//   condition: { level, gold, visited, notVisited, flag, notFlag }
//   effects:   { gold, hpPotions, mpPotions, heal, setFlag }
//   skillCheck:{ stat, difficulty, success:{ next, effects }, failure:{ next, effects } }
// `remember` makes a choice consequential: after successful effects it is
// recorded and cannot be selected twice, including after saving and reloading.
const DialogueGraphs = Object.freeze({
  healer: { start: 'welcome', nodes: {
    welcome: { text: 'The Light keeps no ledger, friend. What do you need?', choices: [
      { id: 'heal', text: 'Heal my wounds.', action: 'heal' },
      { id: 'hp', text: 'Buy a healing potion.', action: 'buyHp' },
      { id: 'mp', text: 'Buy a mana potion.', action: 'buyMp' },
      { id: 'faith', text: 'How do you keep faith?', next: 'faith' },
    ] },
    faith: { text: 'Faith is not certainty. It is taking one more step while the road is dark.', choices: [] },
  } },
  smith: { start: 'trade', nodes: {
    trade: { text: 'Steel does not lie. Bring coin and I will bring thunder.', choices: [
      { id: 'trade', text: 'Show me your wares.', action: 'vendor' },
      { id: 'anvil', text: 'What happened to the old anvil?', next: 'anvil' },
    ] },
    anvil: { text: 'It rang by itself the night the Bishop fell. I have not struck it since.', choices: [] },
  } },
  gambler: { start: 'welcome', nodes: {
    welcome: { text: 'Mystery goods! Treasure or trash—the uncertainty is half the value.', choices: [
      { id: 'gamble', text: 'Let fortune decide.', action: 'gamble' },
    ] },
  } },
  stash: { start: 'welcome', nodes: {
    welcome: { text: 'The vault forgets nothing. Unlike its keeper.', choices: [
      { id: 'vault', text: 'Open the vault.', action: 'stash' },
    ] },
  } },
  elder: { start: 'welcome', nodes: {
    welcome: { text: 'The roads grow darker. What would you know?', choices: [
      { id: 'parish', text: 'Tell me about the parish.', next: 'parish' },
      { id: 'abyss', text: 'What lies below the village?', next: 'abyss' },
      { id: 'walls', text: '[Insight] What did the Bishop hear in the walls?',
        condition: { notFlag: 'elder_walls_known' },
        skillCheck: { stat: 'ene', difficulty: 16,
          success: { next: 'walls_truth', effects: { setFlag: 'elder_walls_known' } },
          failure: { next: 'walls_failed' } } },
      { id: 'warning', text: 'I will heed your warning.', condition: { visited: 'elder:abyss', notFlag: 'elder_warning_heeded' },
        effects: { setFlag: 'elder_warning_heeded' }, remember: true, next: 'warning' },
    ] },
    parish: { text: 'The Bishop was a good man once. Then he started listening to the walls.', choices: [] },
    abyss: { text: 'They say the Abyss has no bottom. Someone should check—but return if it starts calling your name.', choices: [] },
    walls_truth: { text: 'Not words. A heartbeat. Slow, vast, and rising from beneath the parish.', choices: [] },
    walls_failed: { text: 'Some truths require more than a sharp ear. Perhaps another time.', choices: [] },
    warning: { text: 'Good. Caution keeps a hero alive longer than courage does.', choices: [] },
  } },
});

const DialogueState = Object.freeze({
  VERSION: 1,
  create() { return { version: 1, visited: {}, choices: {}, flags: {}, checks: {} }; },
  migrate(saved) {
    const out = this.create();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const key of ['visited', 'choices', 'flags', 'checks']) {
      const value = saved[key];
      if (value && typeof value === 'object' && !Array.isArray(value))
        for (const id in value) if (value[id]) out[key][id] = value[id];
    }
    return out;
  },
});

// Dialogue data is deliberately code-free.  Conditions and effects use the small
// vocabulary below so a choice can be checked again at click time before any
// part of its consequence is committed.
const Dialogue = (() => {
  const VERSION = 1;
  const graphs = {
    elder: { start: 'welcome', nodes: {
      welcome: { text: 'The roads grow darker. What would you know?', choices: [
        { id: 'parish', text: 'Tell me about the parish.', next: 'parish' },
        { id: 'abyss', text: 'What lies below the village?', next: 'abyss' },
        { id: 'omens', text: '[Energy 12] Read the omens with me.', condition: { notFlag: 'elder.omens' },
          skillCheck: { stat: 'ene', dc: 12 }, success: 'omens', failure: 'omens-failed',
          effects: { success: [{ type: 'flag', key: 'elder.omens', value: true }], failure: [] } },
      ] },
      parish: { text: 'The Bishop was a good man once. Then he started listening to the walls.', choices: [
        { id: 'parish-back', text: 'I have another question.', next: 'welcome' },
      ] },
      abyss: { text: 'They say the Abyss has no bottom. Someone should check.', choices: [
        { id: 'abyss-back', text: 'I have another question.', next: 'welcome' },
      ] },
      omens: { text: 'You see it too. Keep this ward; the dark now knows your name.', choices: [
        { id: 'ward', text: 'I will remember.', next: 'welcome', once: true,
          effects: [{ type: 'potion', kind: 'mp', amount: 1 }] },
      ] },
      'omens-failed': { text: 'The smoke is only smoke to you—for now.', choices: [
        { id: 'omens-failed-back', text: 'Perhaps another time.', next: 'welcome' },
      ] },
    } },
    smith: { start: 'trade', nodes: { trade: { text: 'Steel does not lie. Bring coin and I will bring thunder.', choices: [] } } },
    healer: { start: 'welcome', nodes: { welcome: { text: 'Rest, wanderer. Body and spirit may both be mended here.', choices: [] } } },
    gambler: { start: 'welcome', nodes: { welcome: { text: 'Fortune favors the bold—and occasionally the house.', choices: [] } } },
    stash: { start: 'welcome', nodes: { welcome: { text: 'What is entrusted to the vault waits for every hero.', choices: [] } } },
  };

  function migrate(saved) {
    const out = { version: VERSION, visited: {}, consequences: {}, flags: {} };
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    const visited = saved.visited && typeof saved.visited === 'object' ? saved.visited : {};
    for (const id of Object.keys(visited)) {
      const values = Array.isArray(visited[id]) ? visited[id] : [];
      out.visited[id] = [...new Set(values.filter(v => typeof v === 'string'))];
    }
    for (const key of Object.keys(saved.consequences || {})) if (saved.consequences[key]) out.consequences[key] = true;
    for (const key of Object.keys(saved.flags || {})) out.flags[key] = saved.flags[key];
    return out;
  }

  function stat(pl, key) {
    const value = (pl.derived && pl.derived[key] !== undefined) ? pl.derived[key] : pl.stats && pl.stats[key];
    return Number(value) || 0;
  }

  function meets(condition, pl, state, npcId) {
    if (!condition) return true;
    if (Array.isArray(condition)) return condition.every(c => meets(c, pl, state, npcId));
    if (condition.all) return condition.all.every(c => meets(c, pl, state, npcId));
    if (condition.any) return condition.any.some(c => meets(c, pl, state, npcId));
    if (condition.flag && !state.flags[condition.flag]) return false;
    if (condition.notFlag && state.flags[condition.notFlag]) return false;
    if (condition.visited && !(state.visited[npcId] || []).includes(condition.visited)) return false;
    if (condition.notVisited && (state.visited[npcId] || []).includes(condition.notVisited)) return false;
    if (condition.level !== undefined && pl.lvl < condition.level) return false;
    if (condition.gold !== undefined && pl.gold < condition.gold) return false;
    if (condition.stat && stat(pl, condition.stat) < Number(condition.atLeast || 0)) return false;
    if (condition.faction && (typeof Factions === 'undefined' || Factions.value(pl.reputation, condition.faction) < Number(condition.reputation || 0))) return false;
    return true;
  }

  function validateEffects(effects, pl) {
    const copy = { gold: pl.gold, hp: pl.potions.hp, mp: pl.potions.mp };
    for (const effect of effects || []) {
      if (!effect || !['gold', 'potion', 'flag', 'reputation'].includes(effect.type)) return false;
      if (effect.type === 'gold') copy.gold += Number(effect.amount) || 0;
      if (effect.type === 'potion') {
        if (!['hp', 'mp'].includes(effect.kind)) return false;
        copy[effect.kind] += Number(effect.amount) || 0;
        if (copy[effect.kind] < 0 || copy[effect.kind] > 20) return false;
      }
      if (copy.gold < 0) return false;
      if (effect.type === 'flag' && typeof effect.key !== 'string') return false;
      if (effect.type === 'reputation' && (typeof Factions === 'undefined' || !Factions.byId[effect.faction] || !Number.isFinite(Number(effect.amount)))) return false;
    }
    return true;
  }

  function applyEffects(effects, pl, state) {
    if (!validateEffects(effects, pl)) return false;
    for (const effect of effects || []) {
      if (effect.type === 'gold') pl.gold += Number(effect.amount) || 0;
      else if (effect.type === 'potion') pl.potions[effect.kind] += Number(effect.amount) || 0;
      else if (effect.type === 'reputation') Factions.change(pl.reputation, effect.faction, effect.amount);
      else state.flags[effect.key] = effect.value === undefined ? true : effect.value;
    }
    return true;
  }

  function visit(state, npcId, nodeId) {
    if (!state.visited[npcId]) state.visited[npcId] = [];
    if (!state.visited[npcId].includes(nodeId)) state.visited[npcId].push(nodeId);
  }

  return Object.freeze({ VERSION, graphs: Object.freeze(graphs), migrate, meets, stat, validateEffects, applyEffects, visit });
})();

// Keep the descriptive legacy name available to data/debug tooling.
const DialogueGraphs = Dialogue.graphs;
globalThis.Dialogue = Dialogue;
globalThis.DialogueGraphs = DialogueGraphs;
globalThis.DialogueState = DialogueState;
