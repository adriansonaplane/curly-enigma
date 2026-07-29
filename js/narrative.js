// ============ DIABLOID: narrative.js — shared condition/effect kernel ============
// The tiny DSL that js/dialogue.js and js/quests.js both build on: a
// condition object describes a fact about the world worth branching on, an
// effect object describes a consequence worth applying. Neither dialogue nor
// quests own this vocabulary — they just speak it — so a persuasion check
// can gate a quest step and a quest resolution can gate a dialogue line
// without those two systems knowing anything about each other's internals.
//
// Every lookup here is defensive (`typeof X !== 'undefined'`) because this
// file, like the rest of the narrative layer, has to survive being loaded in
// a bare Node `vm` sandbox with only a handful of its sibling modules present
// — see tests/node/*.js.
'use strict';

function narrCond(cond, ctx) {
  if (!cond) return true;
  if (cond.any) return cond.any.some(c => narrCond(c, ctx));
  if (cond.all) return cond.all.every(c => narrCond(c, ctx));
  if (cond.not) return !narrCond(cond.not, ctx);
  if ('flag' in cond) return (typeof WorldState !== 'undefined' && WorldState.has(cond.flag)) === (cond.is !== false);
  if (cond.factionMin) return typeof Faction !== 'undefined' && Faction.meets(cond.factionMin[0], cond.factionMin[1]);
  if (cond.factionBelow) return typeof Faction !== 'undefined' && !Faction.meets(cond.factionBelow[0], cond.factionBelow[1]);
  if (cond.questDone) return typeof Quests !== 'undefined' && Quests.isDone(cond.questDone);
  if (cond.questActive) return typeof Quests !== 'undefined' && Quests.isActive(cond.questActive);
  if (cond.questFailed) return typeof Quests !== 'undefined' && Quests.isFailed(cond.questFailed);
  if (cond.questStep) return typeof Quests !== 'undefined' && Quests.stepIs(cond.questStep[0], cond.questStep[1]);
  if (cond.questResolution) return typeof Quests !== 'undefined' && Quests.resolutionIs(cond.questResolution[0], cond.questResolution[1]);
  if (cond.questNotStarted) return typeof Quests !== 'undefined' && Quests.status(cond.questNotStarted) !== 'active' && !Quests.isDone(cond.questNotStarted) && !Quests.isFailed(cond.questNotStarted);
  if (cond.lvlMin != null) return ((ctx && ctx.pl && ctx.pl.lvl) || 1) >= cond.lvlMin;
  if (cond.loreMin != null) return typeof Lore !== 'undefined' && Lore.discoveredCount() >= cond.loreMin;
  if (cond.loreHas) return typeof Lore !== 'undefined' && Lore.isDiscovered(cond.loreHas);
  if (cond.statMin) return (((ctx && ctx.pl && ctx.pl.stats) || {})[cond.statMin[0]] || 0) >= cond.statMin[1];
  if (cond.goldMin != null) return ((ctx && ctx.pl && ctx.pl.gold) || 0) >= cond.goldMin;
  return true;
}
function narrAll(conds, ctx) { return !conds || conds.every(c => narrCond(c, ctx)); }

function narrApplyOne(eff, ctx) {
  const pl = (ctx && ctx.pl) || {};
  if (eff.setFlag) WorldState.set(eff.setFlag[0], eff.setFlag.length > 1 ? eff.setFlag[1] : true);
  if (eff.faction && typeof Faction !== 'undefined') Faction.adjust(eff.faction[0], eff.faction[1], { reason: eff.faction[2] || (ctx && ctx.npc && ctx.npc.id) || 'event' });
  if (eff.startQuest && typeof Quests !== 'undefined') Quests.start(eff.startQuest);
  if (eff.advanceQuest && typeof Quests !== 'undefined') Quests.advance(eff.advanceQuest[0], eff.advanceQuest[1]);
  if (eff.completeQuest && typeof Quests !== 'undefined') Quests.complete(eff.completeQuest[0], eff.completeQuest[1]);
  if (eff.failQuest && typeof Quests !== 'undefined') Quests.fail(eff.failQuest[0], eff.failQuest[1]);
  if (eff.unlockLore && typeof Lore !== 'undefined') Lore.discover(eff.unlockLore, { via: 'npc' });
  if (typeof eff.gold === 'number') pl.gold = Math.max(0, (pl.gold || 0) + eff.gold);
  if (typeof eff.xp === 'number' && typeof G !== 'undefined' && G.awardXp) G.awardXp(eff.xp);
  if (eff.announce && typeof UI !== 'undefined' && UI.announce) UI.announce(eff.announce[0], eff.announce[1] || '#ffd94f');
  if (eff.relationship && typeof Social !== 'undefined' && Social.npcInteract) Social.npcInteract(eff.relationship[0], eff.relationship[1], eff.relationship[2]);
  if (eff.giveItem && typeof Game !== 'undefined' && Game.giveItem && typeof Items !== 'undefined') Game.giveItem(Items.generate(eff.giveItem.lvl || pl.lvl || 1, eff.giveItem.opts || { classId: pl.cls }));
  if (eff.record) WorldState.record('event', eff.record, { npc: ctx && ctx.npc && ctx.npc.id });
  if (eff.counter) WorldState.inc(eff.counter[0], eff.counter[1] || 1);
}

const Narrative = {
  evalCond: narrCond,
  evalAll: narrAll,

  applyEffect(eff, ctx) {
    if (!eff) return;
    try { narrApplyOne(eff, ctx); }
    catch (e) { if (typeof console !== 'undefined') console.warn('[narrative] effect failed', eff, e); }
  },
  applyEffects(effs, ctx) { (effs || []).forEach(e => this.applyEffect(e, ctx)); },

  // Test hook: when G/G.player aren't available (Node, or before a hero is
  // loaded), buildCtx falls back to this so callers always get an object.
  _testPlayer: null,
  buildCtx(npc) {
    const pl = (typeof G !== 'undefined' && G && G.player) ? G.player : (this._testPlayer || {});
    return { pl, npc: npc || null, ws: (typeof WorldState !== 'undefined') ? WorldState : null };
  },
};
