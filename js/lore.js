// ============ DIABLOID: lore.js — discoverable codex entries ============
'use strict';

const LoreCodex = Object.freeze([
  Object.freeze({ id: 'havens-rest', title: "Haven's Rest", category: 'places',
    text: 'A walled village built where the pilgrim road meets the old descent.' }),
  Object.freeze({ id: 'fallen-bishop', title: 'The Fallen Bishop', category: 'people',
    text: 'Once a guardian of the parish, the Bishop listened too long to voices behind the stone.' }),
  Object.freeze({ id: 'endless-abyss', title: 'The Endless Abyss', category: 'places',
    text: 'No survey agrees on its depth. Each expedition finds the stairs changed.' }),
]);
globalThis.LoreCodex = LoreCodex;
