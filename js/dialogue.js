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

globalThis.DialogueGraphs = DialogueGraphs;
globalThis.DialogueState = DialogueState;
