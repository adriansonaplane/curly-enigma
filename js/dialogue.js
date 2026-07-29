// ============ DIABLOID: dialogue.js — authored NPC dialogue graphs ============
'use strict';

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
    return true;
  }

  function validateEffects(effects, pl) {
    const copy = { gold: pl.gold, hp: pl.potions.hp, mp: pl.potions.mp };
    for (const effect of effects || []) {
      if (!effect || !['gold', 'potion', 'flag'].includes(effect.type)) return false;
      if (effect.type === 'gold') copy.gold += Number(effect.amount) || 0;
      if (effect.type === 'potion') {
        if (!['hp', 'mp'].includes(effect.kind)) return false;
        copy[effect.kind] += Number(effect.amount) || 0;
        if (copy[effect.kind] < 0 || copy[effect.kind] > 20) return false;
      }
      if (copy.gold < 0) return false;
      if (effect.type === 'flag' && typeof effect.key !== 'string') return false;
    }
    return true;
  }

  function applyEffects(effects, pl, state) {
    if (!validateEffects(effects, pl)) return false;
    for (const effect of effects || []) {
      if (effect.type === 'gold') pl.gold += Number(effect.amount) || 0;
      else if (effect.type === 'potion') pl.potions[effect.kind] += Number(effect.amount) || 0;
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
