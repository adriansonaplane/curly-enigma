// ============ DIABLOID: dialogue.js — authored NPC dialogue graphs ============
'use strict';

const DialogueGraphs = Object.freeze({
  elder: Object.freeze({ start: 'welcome', nodes: Object.freeze({
    welcome: Object.freeze({ text: 'The roads grow darker. What would you know?', choices: Object.freeze([
      Object.freeze({ text: 'Tell me about the parish.', next: 'parish' }),
      Object.freeze({ text: 'What lies below the village?', next: 'abyss' }),
    ]) }),
    parish: Object.freeze({ text: 'The Bishop was a good man once. Then he started listening to the walls.', choices: Object.freeze([]) }),
    abyss: Object.freeze({ text: 'They say the Abyss has no bottom. Someone should check.', choices: Object.freeze([]) }),
  }) }),
  smith: Object.freeze({ start: 'trade', nodes: Object.freeze({
    trade: Object.freeze({ text: 'Steel does not lie. Bring coin and I will bring thunder.', choices: Object.freeze([]) }),
  }) }),
});
globalThis.DialogueGraphs = DialogueGraphs;
