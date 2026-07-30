// ============ DIABLOID: difficulty-state.js — tier unlocks and campaigns ============
'use strict';

// Character power and possessions live on the character. Campaign state lives
// here so returning to Normal never erases a Nightmare run (and vice versa).
const DifficultyState = (() => {
  const VERSION = 1;
  const COUNT = 3;
  // A corruption guard, not a gameplay ceiling: one million floors remains far
  // beyond any reachable ladder run while keeping all downstream math finite.
  const MAX_ABYSS_FLOOR = 1000000;

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const object = value => isObject(value) ? value : {};
  const integer = (value, min, max, fallback = 0) => {
    const number = Number(value);
    const finite = Number.isFinite(number) ? number : fallback;
    return Math.max(min, Math.min(max, Math.floor(finite)));
  };
  const tier = value => integer(value, 0, COUNT - 1);
  const savedTier = value => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number < COUNT ? number : null;
  };

  function freshProgress() {
    return { actUnlocked: 0, bossKilled: [false, false, false, false, false], abyssBest: 0 };
  }

  function progress(raw, fallback) {
    // Selected-tier root mirrors fill individual holes in partial nested state;
    // explicit nested fields still win and both sides' metadata is retained.
    const nested = object(raw);
    const legacy = object(fallback);
    const merged = Object.assign({}, legacy, nested);
    const numeric = field => typeof nested[field] === 'number' && Number.isFinite(nested[field]) ? nested[field] :
      typeof legacy[field] === 'number' && Number.isFinite(legacy[field]) ? legacy[field] : 0;
    const kills = Array.isArray(nested.bossKilled) ? nested.bossKilled :
      Array.isArray(legacy.bossKilled) ? legacy.bossKilled : [];
    return Object.assign({}, merged, {
      actUnlocked: integer(numeric('actUnlocked'), 0, 5),
      bossKilled: Array.from({ length: 5 }, (_, i) => kills[i] === true),
      abyssBest: integer(numeric('abyssBest'), 0, MAX_ABYSS_FLOOR),
    });
  }

  function validQuests(raw) {
    if (!isObject(raw)) return false;
    const version = Number(raw.version);
    if (Object.prototype.hasOwnProperty.call(raw, 'entries'))
      return Number.isFinite(version) && version >= QuestState.VERSION && isObject(raw.entries);
    if (Number.isFinite(version) && version >= QuestState.VERSION) return false;
    for (const field of ['p', 'progress', 'done', 'completed'])
      if (Object.prototype.hasOwnProperty.call(raw, field) && !isObject(raw[field])) return false;
    return true;
  }

  function questHasState(raw) {
    if (!validQuests(raw)) return false;
    if (isObject(raw.entries) && Object.keys(raw.entries).length) return true;
    return ['p', 'progress', 'done', 'completed'].some(field =>
      isObject(raw[field]) && Object.keys(raw[field]).length);
  }

  function quests(raw, fallback) {
    const nested = validQuests(raw) ? raw : null;
    const legacy = validQuests(fallback) ? fallback : null;
    // An empty placeholder must not erase the still-valid selected-tier root
    // mirror. Metadata from both representations survives either choice.
    const source = nested && (questHasState(nested) || !legacy || !questHasState(legacy)) ? nested : legacy;
    // Keep forward-compatible metadata while replacing mutable entries with the
    // canonical QuestState representation.
    return Object.assign({}, object(legacy), object(nested), QuestState.migrate(source));
  }

  function freshCampaign() {
    return { progress: freshProgress(), quests: QuestState.create() };
  }

  function campaign(raw, fallback) {
    raw = object(raw);
    fallback = object(fallback);
    const progressSource = isObject(raw.progress) ? raw.progress : null;
    const progressFallback = isObject(fallback.progress) ? fallback.progress : null;
    return Object.assign({}, raw, { progress: progress(progressSource, progressFallback),
      quests: quests(raw.quests, fallback.quests) });
  }

  function completedCampaign() {
    const result = freshCampaign();
    result.progress.actUnlocked = 5;
    result.progress.bossKilled.fill(true);
    return result;
  }

  function inferUnlocked(state) {
    let unlocked = tier(state.unlocked);
    // A finished campaign is durable proof that the following tier was earned.
    for (let i = 0; i < COUNT - 1; i++) {
      if (state.campaigns[i].progress.bossKilled[4]) unlocked = Math.max(unlocked, i + 1);
    }
    state.unlocked = unlocked;
    state.selected = Math.min(tier(state.selected), unlocked);
    return state;
  }

  function create() {
    return { version: VERSION, unlocked: 0, selected: 0,
      campaigns: Array.from({ length: COUNT }, freshCampaign) };
  }

  // Legacy saves kept a single progress/quest pair at character root. Preserve
  // it in the tier it belonged to and infer already-earned lower tiers.
  function migrate(saved, legacyCharacter) {
    const raw = object(saved);
    const legacy = object(legacyCharacter);
    const hasCampaigns = Array.isArray(raw.campaigns);
    const legacySelected = savedTier(legacy.difficultyIdx) ?? 0;
    const selected = hasCampaigns ? savedTier(raw.selected) ?? legacySelected : legacySelected;
    const storedUnlocked = hasCampaigns ? savedTier(raw.unlocked) : selected;
    const campaigns = hasCampaigns ? raw.campaigns.slice() : [];
    for (let i = 0; i < COUNT; i++)
      campaigns[i] = campaign(hasCampaigns ? raw.campaigns[i] : null, i === selected ? legacy : null);
    const state = Object.assign({}, hasCampaigns ? raw : {}, {
      version: VERSION,
      unlocked: Math.max(storedUnlocked ?? selected, selected),
      selected,
      campaigns,
    });

    if (!hasCampaigns) {
      // Pre-versioned saves could already identify a later difficulty. Such a
      // character necessarily cleared each prior campaign; retain that fact.
      for (let i = 0; i < selected; i++) state.campaigns[i] = completedCampaign();
    }
    return inferUnlocked(state);
  }

  function canSelect(state, index) {
    index = Number(index);
    if (!isObject(state) || !Array.isArray(state.campaigns) || !Number.isInteger(index) || index < 0 || index >= COUNT)
      return false;
    const unlocked = Number(state.unlocked);
    const current = state.campaigns[index];
    return Number.isInteger(unlocked) && unlocked >= 0 && unlocked < COUNT && index <= unlocked &&
      isObject(current) && isObject(current.progress) && Number.isInteger(current.progress.actUnlocked) &&
      current.progress.actUnlocked >= 0 && current.progress.actUnlocked <= 5 &&
      Number.isInteger(current.progress.abyssBest) && current.progress.abyssBest >= 0 && current.progress.abyssBest <= MAX_ABYSS_FLOOR &&
      Array.isArray(current.progress.bossKilled) && current.progress.bossKilled.length === 5 &&
      current.progress.bossKilled.every(value => typeof value === 'boolean') &&
      isObject(current.quests) && Number.isFinite(Number(current.quests.version)) &&
      Number(current.quests.version) >= QuestState.VERSION && isObject(current.quests.entries);
  }

  function select(state, index) {
    const selected = Number(index);
    if (!canSelect(state, selected)) return false;
    state.selected = selected;
    return true;
  }

  function activate(player, state, index) {
    const selected = Number(index);
    if (!isObject(player) || !select(state, selected)) return false;
    const current = state.campaigns[selected];
    player.difficulty = state;
    player.difficultyIdx = selected;
    player.progress = current.progress;
    player.quests = current.quests;
    return current;
  }

  function capture(player) {
    let state = migrate(player && player.difficulty, player);
    const index = Math.min(tier(player && player.difficultyIdx), state.unlocked);
    state.selected = index;
    const current = state.campaigns[index];
    current.progress = progress(player && player.progress);
    current.quests = quests(player && player.quests);
    player.difficulty = state;
    player.difficultyIdx = index;
    player.progress = current.progress;
    player.quests = current.quests;
    return inferUnlocked(state);
  }

  function unlockNext(state, completedTier) {
    const index = tier(completedTier);
    if (!canSelect(state, index) || index >= COUNT - 1 || !state.campaigns[index].progress.bossKilled[4]) return null;
    const next = index + 1;
    if (state.unlocked >= next) return null;
    state.unlocked = next;
    return next;
  }

  return Object.freeze({ VERSION, COUNT, create, migrate, canSelect, select, activate, capture,
    unlockNext, freshProgress });
})();
globalThis.DifficultyState = DifficultyState;
