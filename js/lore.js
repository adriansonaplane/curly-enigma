// ============ DIABLOID: lore.js — the Lore Codex ============
// A catalogue of original setting lore — cosmology, history, factions, named
// places within each act, and first-person "voices" from the people of
// Haven's Rest — plus the small engine that tracks which entries a given
// character has actually found.
//
// Nothing here is placeholder text. Every entry is meant to survive being
// read on its own, cold, with no other context. Cross-references are real:
// an entry can name another entry's id, and the codex UI resolves that into
// either a working link or a "???" depending on whether *this* character has
// found it yet — so the codex itself withholds spoilers the same way the
// world does.
//
// Placement: js/dungeon.js tags readable props with a stable per-instance
// seed and a `theme` (which act they were generated in); js/environment.js
// resolves that (seed, theme) pair to an actual entry via `pickForSeed` only
// at the moment the player reads it, and only from entries whose `giftOnly`
// is falsy. `giftOnly` entries are learned from people, not paper — dialogue
// and quests unlock them explicitly by id.
'use strict';

const LORE_CATEGORIES = ['Cosmology', 'History', 'Factions', 'Places', 'Voices'];

const LORE_ENTRIES = [
  // ---------------- Cosmology ----------------
  { id: 'cosmo_choir', title: 'The Choir That Sang the World', category: 'Cosmology', theme: null, rarity: 'uncommon',
    text: 'Before there were names for anything, there was a sound — not one voice but many, layered so closely that no ear could unbraid them. The oldest prayers of the Vigil call it the Choir, and say it did not create the world so much as agree that one should exist, and go on agreeing, over and over, forever — because the moment it stopped agreeing was the moment the world stopped being sung. Haven\'s Rest still keeps the shape of that idea in its bells: pull the rope, and for one clean second, something answers back that is older than the metal.',
    crossRefs: ['cosmo_hush', 'cosmo_nephalem'] },
  { id: 'cosmo_hush', title: 'The Hush', category: 'Cosmology', theme: null, rarity: 'uncommon',
    text: 'Every choir has silences in it — the beats between notes, load-bearing and necessary. The old texts call that silence the Hush, and insist, with the particular defensiveness of people protesting too much, that it is not evil, merely off. Whether or not that is true, it is a plain fact that things which spend long enough in the Hush stop being able to tell the difference between resting and rotting. Ask a corpse. It will not answer, but that is rather the point.',
    crossRefs: ['cosmo_choir', 'cosmo_hollowking'] },
  { id: 'cosmo_nephalem', title: 'Ash and Ember: the Nephalem', category: 'Cosmology', theme: null, rarity: 'rare',
    text: 'Sing a Choir-note through a living throat and the throat usually burns out — the note is too large, the singer too small. A handful of mortals, once, did not burn: the note passed through them the way light passes through good glass, and came out the other side as something that could swing a sword. The Vigil named them Nephalem and built a religion around the hope it would happen again. It has, in trace amounts — a stubbornness in the blood, a resistance to rot, a talent for coming back from wounds that should have ended the story. Haven\'s Rest calls what\'s left of that bloodline "ash": not the fire, just what the fire leaves behind, still warm enough to matter.',
    crossRefs: ['cosmo_choir', 'cosmo_wounds'] },
  { id: 'cosmo_wounds', title: 'The Five Wounds', category: 'Cosmology', theme: null, rarity: 'uncommon',
    text: 'Five places on this stretch of the map do not heal. The Nephalem, at the end of what the Vigil calls the Long Silence, drove something old and patient into the ground and sealed the entry wounds with the last of their voices — a poetic way of saying they died doing it, and the seals were never meant to be permanent, only to buy time nobody spent well. The Weeping Parish. The Catacombs of Ash. The Molten Undercity. The Drowned Fane. The Burning Throne. Five wounds, five keepers gone wrong, and — underneath all of them, if the surveyors who came back are to be believed — one wound with no bottom at all.',
    crossRefs: ['cosmo_nephalem', 'cosmo_hollowking', 'fac_deepwardens'] },
  { id: 'cosmo_hollowking', title: "The Hollow King's Bargain", category: 'Cosmology', theme: null, rarity: 'rare',
    text: 'It does not have a name, or it has too many, which the Deep Wardens\' surviving fragments treat as the same problem. What the Nephalem bound was not killed, because the Hush cannot be killed any more than silence can be murdered — it can only be crowded out, and eventually the crowd gets tired. Each of the five seals is failing at its own pace, in its own idiom: the Parish forgot how to bury its dead properly; the Fane forgot whose face it was supposed to be showing you. The Wardens\' last surviving note on the subject reads, in full: "We did not seal a door. We seal a held breath. Ours are getting shorter."',
    crossRefs: ['cosmo_hush', 'cosmo_wounds', 'voice_warden'] },

  // ---------------- History ----------------
  { id: 'hist_founding', title: "The Founding of Haven's Rest", category: 'History', theme: 'town', rarity: 'common',
    text: 'Haven\'s Rest was not built where it is by accident. Every surveyor who has ever staked a tent on this hillside reports the same small, useless fact: it is the one spot within a day\'s walk of all five wounds where you can sleep without dreaming about them. Nobody knows why. The first chapter house was raised here two hundred years before Bishop Malvor\'s name meant anything, by a Vigil order that wanted a place to rest between watches. It has been a waypoint, a garrison, a refugee camp, and — currently — a town with a fountain, a gambler, and a woman who will sell you a sword. All four uses agree on the fountain.',
    crossRefs: ['fac_choir'] },
  { id: 'hist_malvor', title: 'The Shepherd Who Listened', category: 'History', theme: 'crypt', rarity: 'uncommon',
    text: 'Malvor was, by every surviving account, a genuinely gentle man — which is exactly the problem. Gentleness is a kind of listening, and he was posted to the one parish in the province where the walls had something to say. It started as comfort: he told his congregation the dead weren\'t really gone, that he could still hear them, faint, like a room next door. He was not lying. He was also not describing the dead. By the time the mother chapter sent someone to check on him, the graves were shallow on purpose and the bells rang a half-second early, as if answering a question before it was finished. He still preaches, some nights, to a congregation that never left.',
    crossRefs: ['cosmo_hush', 'fac_choir', 'place_parish'] },
  { id: 'hist_catacombs', title: 'Ash Enough to Bury a City', category: 'History', theme: 'catacomb', rarity: 'uncommon',
    text: 'The Catacombs of Ash were not built to hold anything living. They were an ossuary — the polite word for "a place too full to bury people properly" — for three generations of plague dead from a city the maps no longer name. Something found the sheer density of the dead useful the way a farmer finds a fallow field useful, and planted in it. Vashta did not conquer the Catacombs. She hatched there, the way mold finds bread that has already gone soft, and by the time anyone noticed, there were too many of her to ask how.',
    crossRefs: ['place_catacombs'] },
  { id: 'hist_undercity', title: "The Undercity's Last Shift", category: 'History', theme: 'cavern', rarity: 'uncommon',
    text: 'The Molten Undercity has a founding date and a founding reason, which is more than most of the wounds can claim: a guild of smiths chased a seam of ore that never cooled, sinking new levels every decade because the heat kept the ore workable and the workable ore kept the guild rich. They called the deepest level the Last Shift, the way you name a ship\'s worst cabin as a joke. Karghul\'s furnace-court sits exactly there now. The guild\'s descendants — what the surface calls the Emberwrights — still argue whether "Last Shift" was prophecy or just very bad luck. They keep digging regardless. Old habits and old debts are both, in the end, forms of gravity.',
    crossRefs: ['fac_emberwrights', 'place_undercity'] },
  { id: 'hist_fane', title: 'What the Fane Forgot', category: 'History', theme: 'fane', rarity: 'uncommon',
    text: 'Before it drowned, the Fane was a choir-loft — a Vigil retreat built over a freshwater spring the old texts call "clean enough to sing over." The sea that swallowed it did not rise; witnesses at the time swear the water came up through the floor, slow, over eleven days, giving the loft\'s clergy eleven days to leave, and none of them took it. Ythalla is what the water remembers instead of them. Every reflection in the Fane now shows a face — never quite yours, never quite anyone\'s, always mid-sentence, as if the clergy are still finishing whatever prayer the water interrupted.',
    crossRefs: ['place_fane', 'fac_drownedcult'] },

  // ---------------- Factions ----------------
  { id: 'fac_choir', title: 'The Vigil Choir', category: 'Factions', theme: 'crypt', rarity: 'common',
    text: 'The Vigil Choir survives Malvor the way a body survives losing a limb: diminished, favoring the wound, insisting the wound isn\'t there. What\'s left is scattered — solitary clerics like Brother Aldric, tending whoever will hold still long enough to be tended, mostly without a mother chapter to report to or discipline from. They still ring bells. They have simply gotten very good at listening for the half-second that means it\'s time to stop.',
    crossRefs: ['hist_malvor', 'hist_founding'] },
  { id: 'fac_emberwrights', title: 'The Emberwrights', category: 'Factions', theme: 'cavern', rarity: 'common',
    text: 'Guild in name, extended and argumentative family in practice, the Emberwrights forge steel from ore that has been too close to something for too long, and they will tell you, unprompted and at length, exactly how they keep that steel from remembering where it came from. Korga Ironsong is the public face of a trade most of them would rather not discuss with outsiders: that the best blades in five wounds are quenched in water carried up, at real cost to the carrier, from levels the guild no longer officially operates. The unofficial operating never stopped.',
    crossRefs: ['hist_undercity'] },
  { id: 'fac_hollowmarket', title: 'The Hollow Market', category: 'Factions', theme: null, rarity: 'common',
    text: 'Nobody founded the Hollow Market. It assembled, the way scavengers assemble around a wound that keeps producing valuable things and grieving people in roughly equal measure, and it has since developed something like ethics — in the sense that a fence who won\'t handle grave goods from a house still occupied is, relative to the alternative, a fence with ethics. Peddler Vex brokers for them in Haven\'s Rest, cheerfully, and would be the first to tell you not to trust that cheer. He is, in this one respect, entirely honest.',
    crossRefs: ['voice_vex'] },
  { id: 'fac_deepwardens', title: 'The Deep Wardens', category: 'Factions', theme: null, rarity: 'rare',
    text: 'The Deep Wardens do not, as far as anyone in Haven\'s Rest can currently prove, exist. They were the Nephalem\'s engineers — the ones who built the seals rather than sang them, cold iron and colder mathematics where the Choir offered only conviction. Their tunnels are older than every other structure in every wound, cut with a precision nothing else down there matches, and every vault of theirs found so far has been empty, its contents removed by hands that knew exactly what they were taking. Someone is still doing the Wardens\' work. Nobody has caught them at it.',
    crossRefs: ['cosmo_wounds', 'voice_warden'] },
  { id: 'fac_drownedcult', title: 'The Drowned Cult', category: 'Factions', theme: 'fane', rarity: 'uncommon',
    text: 'They do not call themselves the Drowned Cult; that is Haven\'s Rest\'s name for them, coined by a survivor who had, by her own account, no better words left. They gather in the Fane and pray to the water — not to Ythalla by name, which they consider rude, but to the reflection itself, on the theory that if you address the face for long enough it eventually addresses you back. It does. That is the entire problem.',
    crossRefs: ['hist_fane'] },

  // ---------------- Places ----------------
  { id: 'place_parish', title: 'The Ninth Confession', category: 'Places', theme: 'crypt', rarity: 'uncommon',
    text: 'Nine confessional booths line the Parish\'s east transept, numbered in chalk that has never quite worn off despite two centuries of hands. The first eight are empty. The ninth has never been recorded as empty by anyone who checked and lived to write it down — and yet every visiting cleric who dares open its door reports the same thing: no one inside, and the unmistakable, retreating sound of someone standing up too fast.',
    crossRefs: ['hist_malvor'] },
  { id: 'place_catacombs', title: 'The Weeping Kilns', category: 'Places', theme: 'catacomb', rarity: 'uncommon',
    text: 'Deep in the Catacombs stand three brick kilns, cold for longer than anyone alive has been. They were used, once, to burn plague dead too far gone for burial — a mercy, at the time. Ash still weeps from their seams in a fine, constant drizzle that never depletes the kilns and never quite reaches the floor before it\'s breathed by something with too many legs. Vashta\'s broods favor the kilns for their nests. Warmth, the survivors theorize. Or memory. The two are not always different things down there.',
    crossRefs: ['hist_catacombs'] },
  { id: 'place_undercity', title: 'The Cinderworks', category: 'Places', theme: 'cavern', rarity: 'uncommon',
    text: 'The Cinderworks was the Undercity\'s foundry floor, a cavern of forge-pits so vast that early Emberwright records simply call it "the room." Karghul rules from its center now, on a throne of slag still, after all this time, too hot to sit on comfortably — which has never once stopped him. The ore veins that fed the Cinderworks run through the walls even now, glowing faintly gold in the dark, and miners who follow them too far report the veins arranging themselves, very deliberately, into shapes that look like directions. They are never wrong about where the shapes point. They are also never right about what\'s waiting there.',
    crossRefs: ['hist_undercity'] },
  { id: 'place_fane', title: 'The Sunken Choir-Loft', category: 'Places', theme: 'fane', rarity: 'uncommon',
    text: 'You can still see the loft\'s old rafters if you dive far enough into the Fane\'s deep water, black wood gone soft and pale, hung with things that used to be songbooks. The water there is unnaturally still, even for a drowned place, and it reflects with a clarity that has nothing to do with cleanliness. Clergy who study the Fane recommend against looking down for longer than a held breath. Their reasoning, recorded verbatim: "It waits for you to recognize it. Don\'t give it the satisfaction."',
    crossRefs: ['hist_fane', 'fac_drownedcult'] },
  { id: 'place_throne', title: 'The Long Stair', category: 'Places', theme: 'hell', rarity: 'uncommon',
    text: 'Between the gate nearest the Cinderworks and Maltherion\'s court runs a single stair of nine hundred and some steps, no two witnesses agreeing on the exact count, cut from stone that was clearly quarried and clearly not by anyone still practicing the trade. Every previous claimant to the Burning Throne is said to be part of the stair now — not buried beneath it, built into it, which the current tenant apparently finds both practical and funny. He has never once explained the joke to a survivor.',
    crossRefs: [] },

  // ---------------- Voices ----------------
  { id: 'voice_aldric', title: "Aldric's Doubt", category: 'Voices', theme: 'town', rarity: 'uncommon', giftOnly: true,
    text: '"I healed a woman today whose wound should have killed her twice over, and when she thanked the Light I said \'you\'re welcome\' instead of correcting her, because I no longer know which of us the healing actually came from. I used to be certain the Choir worked through me. Now I mostly just hope I\'m not another Malvor with better luck so far." — Brother Aldric, private journal, undated.',
    crossRefs: ['hist_malvor', 'fac_choir'] },
  { id: 'voice_korga', title: "Korga's Ledger", category: 'Voices', theme: 'cavern', rarity: 'uncommon',
    text: '"Owed to Master Ironsong: one apprentice, name of Dell, last seen fetching quench-water from the third gallery, six years unpaid. I keep his corner of the forge clear. Not sentiment — I tell the others it\'s sentiment, but truthfully I keep it clear because clearing it would mean I\'ve finished totaling what I owe him, and I haven\'t, and some debts you don\'t get to close just because you\'re tired of counting."',
    crossRefs: ['fac_emberwrights'] },
  { id: 'voice_vex', title: "The Name Vex Doesn't Use", category: 'Voices', theme: null, rarity: 'rare',
    text: "Ledgers recovered from a Hollow Market strongbox list a 'V. Sorrentine' as the original underwriter of half the goods Peddler Vex now moves through Haven's Rest — a name nobody in town has ever heard him answer to, and a signature that matches his handwriting exactly. Ask him about it and he'll grin and change the subject to how it's poor manners to read another man's ledgers. He isn't wrong. He also isn't answering.",
    crossRefs: ['fac_hollowmarket'] },
  { id: 'voice_osric', title: "What the Vault Keeper Won't Say", category: 'Voices', theme: 'town', rarity: 'uncommon', giftOnly: true,
    text: 'Keeper Osric has never lost a single item entrusted to the shared vault, a fact he will mention, unprompted, to anyone who\'ll listen — and will just as reliably decline to explain how he was doing this exact job, in this exact town, according to at least one dated receipt, eleven years before Haven\'s Rest\'s oldest living resident was born. He is, by every account, an excellent and trustworthy keeper of other people\'s things. What he is a keeper of, precisely, is a separate question, and one he has never once answered.',
    crossRefs: ['hist_founding'] },
  { id: 'voice_maras', title: 'Old Maras Remembers', category: 'Voices', theme: 'town', rarity: 'rare', giftOnly: true,
    text: '"I met one, once — a real one, not ash-blooded like you, dear, no offense. Older than the Parish, she said, though she didn\'t look it. She fixed the Throne\'s line for three generations just by being nearby, the way a lit candle keeps a room\'s shadows honest. Then she wasn\'t nearby anymore, and Maltherion is what the shadows did with the time. I don\'t say this to frighten you. I say it because somebody ought to remember what \'enough\' used to look like, in case anyone\'s still keeping score."',
    crossRefs: ['cosmo_nephalem', 'place_throne'] },
  { id: 'voice_warden', title: "A Warden's Last Log", category: 'Voices', theme: 'catacomb', rarity: 'rare', giftOnly: true,
    text: '"Seal integrity at the Fane, failing. Recommend reinforcement crew, six, minimum. Denied — again — command cites the Parish as priority, cites the Undercity as priority, cites everything as priority except the thing actually about to give. Going to reinforce it myself. If you are reading this and did not write it, the reinforcement did not hold, and I would very much like whoever finds this to know it wasn\'t for lack of trying." — recovered from a sealed Warden cache, unsigned, ink still Vigil-standard issue.',
    crossRefs: ['fac_deepwardens', 'cosmo_hollowking'] },
];

const Lore = {
  byId(id) { return LORE_ENTRIES.find(e => e.id === id) || null; },
  all() { return LORE_ENTRIES.slice(); },
  categories() { return LORE_CATEGORIES.slice(); },

  // Entries that may physically appear as a note/inscription in the world —
  // giftOnly entries are learned from people or quests, never found on paper.
  placeable() { return LORE_ENTRIES.filter(e => !e.giftOnly); },
  forTheme(theme) {
    const pool = this.placeable();
    const themed = pool.filter(e => e.theme === theme);
    return themed.length ? themed : pool.filter(e => e.theme === null);
  },

  // Deterministic: the same (theme, seed) always resolves to the same entry,
  // so re-reading one physical note in a dungeon instance is stable within
  // that visit, without dungeon.js needing to know anything about lore.
  pickForSeed(theme, seed) {
    const pool = this.forTheme(theme).length ? this.forTheme(theme) : this.placeable();
    if (!pool.length) return null;
    const h = hashStr('lorepick|' + theme + '|' + seed);
    return pool[h % pool.length];
  },

  isDiscovered(id) {
    if (typeof WorldState === 'undefined') return false;
    return !!WorldState.ensure().lore.discovered[id];
  },

  // Returns { entry, firstTime } or null if the id is unknown.
  discover(id, opts) {
    const entry = this.byId(id);
    if (!entry || typeof WorldState === 'undefined') return null;
    const d = WorldState.ensure();
    const already = !!d.lore.discovered[id];
    if (!already) {
      d.lore.discovered[id] = { t: Date.now(), via: (opts && opts.via) || 'read' };
      WorldState.record('lore', 'Codex entry discovered: ' + entry.title, { id, via: (opts && opts.via) || 'read' });
    }
    return { entry, firstTime: !already };
  },

  discoveredList() {
    if (typeof WorldState === 'undefined') return [];
    const d = WorldState.ensure().lore.discovered;
    return Object.keys(d)
      .map(id => this.byId(id))
      .filter(Boolean)
      .sort((a, b) => d[a.id].t - d[b.id].t);
  },
  discoveredCount() { return this.discoveredList().length; },

  // Cross-references resolved through this character's own discovery state,
  // so the codex UI can show "???" for anything not yet found.
  crossRefsFor(id) {
    const e = this.byId(id);
    if (!e) return [];
    return (e.crossRefs || []).map(r => {
      const known = this.isDiscovered(r);
      const target = this.byId(r);
      return { id: r, known, title: known && target ? target.title : '???' };
    });
  },
};
