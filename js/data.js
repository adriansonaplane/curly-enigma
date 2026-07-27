// ============ DIABLOID: data.js — classes, skills, monsters, acts, items ============
'use strict';

// ---------- Elements ----------
const ELEM = {
  phys: { color: '#cfcfcf', res: null,   name: 'Physical'  },
  fire: { color: '#ff7a2f', res: 'fire', name: 'Fire'      },
  cold: { color: '#6fd3ff', res: 'cold', name: 'Cold'      },
  lite: { color: '#ffe94f', res: 'lite', name: 'Lightning' },
  pois: { color: '#8ef04a', res: 'pois', name: 'Poison'    },
  arc:  { color: '#c07bff', res: 'arc',  name: 'Arcane'    },
  holy: { color: '#ffe9b0', res: 'arc',  name: 'Holy'      },
};

// ---------- Skill factory ----------
// Archetypes: strike, slam, proj, nova, beam, meteor, chain, summon, trap,
//             storm, buff, curse, dash, passive, heal
let _skillSeq = 0;
function S(name, arch, elem, o = {}) {
  const sk = Object.assign({
    id: 'sk' + (_skillSeq++), name, arch, elem,
    maxLvl: 20, mana: 4, cd: 0, desc: '',
  }, o);
  return sk;
}
function T(name, skills) { return { name, skills }; }

// ---------- Classes: 7 classes x 3 trees x 10 skills = 210 skills ----------
const CLASSES = [
{
  id: 'warbringer', name: 'Warbringer', dmgStat: 'str',
  desc: 'A mountain of scarred muscle. Breaks bodies and morale alike.',
  base: { str: 30, dex: 20, vit: 28, ene: 10 },
  weapon: 'sword',
  pal: { skin: '#c98d5e', cloth: '#7a2e1a', armor: '#8a8f99', hair: '#4a2c14', trim: '#c9a44f' },
  trees: [
    T('Way of Blood', [
      S('Cleave', 'strike', 'phys', { wd: 130, wdLvl: 14, range: 2.0, arcW: 2.4, mana: 3, desc: 'A wide sweep that hews all foes in front of you.' }),
      S('Rend', 'strike', 'phys', { wd: 105, wdLvl: 11, range: 1.9, arcW: 1.4, dot: 22, mana: 3, desc: 'Tears flesh, leaving wounds that bleed over time.' }),
      S('Savage Leap', 'dash', 'phys', { range: 6, wd: 120, wdLvl: 12, radius: 2.2, cd: 4, mana: 7, desc: 'Leap to a point, cratering the ground on impact.' }),
      S('Whirlwind', 'slam', 'phys', { wd: 95, wdLvl: 12, radius: 2.6, mana: 8, desc: 'Become a cyclone of steel, striking all around you.' }),
      S('Skullsplitter', 'strike', 'phys', { wd: 210, wdLvl: 22, range: 2.0, arcW: 0.9, stun: 1.2, mana: 6, desc: 'An overhead blow that stuns what it does not kill.' }),
      S('Bladestorm', 'nova', 'phys', { dmg: [10, 18], dmgLvl: 0.32, count: 10, speed: 9, mana: 11, wd: 60, wdLvl: 7, desc: 'Hurls a ring of spinning blades outward.' }),
      S('Rampage', 'buff', 'phys', { buff: { atkSpd: 22, moveSpd: 12 }, dur: 10, durLvl: 0.5, cd: 14, mana: 10, desc: 'Fury takes hold: attack and move faster.' }),
      S('Earthshatter', 'slam', 'phys', { wd: 170, wdLvl: 18, radius: 3.6, stun: 0.8, cd: 6, mana: 13, desc: 'Smash the earth, staggering everything nearby.' }),
      S('Executioner', 'strike', 'phys', { wd: 320, wdLvl: 30, range: 2.2, arcW: 1.1, cd: 5, mana: 10, desc: 'A killing stroke of terrible weight.' }),
      S('Avatar of Gore', 'buff', 'phys', { buff: { dmgPct: 35, leechHp: 6, armor: 60 }, dur: 14, durLvl: 0.6, cd: 30, mana: 20, desc: 'Become carnage incarnate.' }),
    ]),
    T('Warcries', [
      S('Battle Shout', 'buff', 'phys', { buff: { dmgPct: 18 }, dur: 20, durLvl: 1, mana: 6, cd: 2, desc: 'A roar that stokes your bloodlust.' }),
      S('Intimidate', 'curse', 'phys', { debuff: { slow: 0.25, weaken: 0.15 }, radius: 5, dur: 8, mana: 6, cd: 3, desc: 'Nearby enemies cower, slowed and weakened.' }),
      S('Warhorn', 'buff', 'phys', { buff: { moveSpd: 25 }, dur: 12, durLvl: 0.6, mana: 6, cd: 6, desc: 'Sound the horn of the old warbands.' }),
      S('Demoralize', 'curse', 'phys', { debuff: { dmgTaken: 0.22 }, radius: 5.5, dur: 9, mana: 8, cd: 4, desc: 'Broken spirits take deeper wounds.' }),
      S('Rallying Cry', 'buff', 'phys', { buff: { armor: 90, allRes: 12 }, dur: 15, durLvl: 0.8, mana: 9, cd: 8, desc: 'Steel yourself against the coming storm.' }),
      S('Terrifying Bellow', 'curse', 'phys', { debuff: { slow: 0.45 }, radius: 6.5, dur: 6, mana: 10, cd: 6, desc: 'A bellow that freezes cowards mid-step.' }),
      S('Bloodlust', 'buff', 'phys', { buff: { leechHp: 8, atkSpd: 15 }, dur: 12, durLvl: 0.6, mana: 11, cd: 12, desc: 'The scent of blood quickens your blade.' }),
      S('Voice of Ruin', 'nova', 'phys', { dmg: [26, 44], dmgLvl: 0.34, count: 14, speed: 11, mana: 14, cd: 5, desc: 'Your voice itself becomes a weapon.' }),
      S('Stoneskin Chant', 'buff', 'phys', { buff: { armor: 220 }, dur: 10, durLvl: 0.5, mana: 12, cd: 14, desc: 'An old chant that turns skin to granite.' }),
      S('Godsblood Hymn', 'buff', 'phys', { buff: { dmgPct: 25, atkSpd: 20, moveSpd: 15, allRes: 20 }, dur: 12, durLvl: 0.5, cd: 35, mana: 22, desc: 'The forbidden hymn of the war-gods.' }),
    ]),
    T('Iron Discipline', [
      S('Toughness', 'passive', 'phys', { passive: { hp: 14 }, desc: 'Hard living, harder body. +Life per point.' }),
      S('Weapon Mastery', 'passive', 'phys', { passive: { dmgPct: 5 }, desc: 'Every weapon is an old friend. +Damage per point.' }),
      S('Iron Skin', 'passive', 'phys', { passive: { armor: 22 }, desc: 'Scars upon scars. +Armor per point.' }),
      S('Deep Wounds', 'passive', 'phys', { passive: { critDmg: 9 }, desc: 'You know where to cut. +Critical damage per point.' }),
      S('Relentless', 'passive', 'phys', { passive: { atkSpd: 2.5 }, desc: 'You do not tire. +Attack speed per point.' }),
      S('Blood Rite', 'passive', 'phys', { passive: { leechHp: 0.8 }, desc: 'Spilled blood feeds you. +Life leech per point.' }),
      S('Juggernaut', 'passive', 'phys', { passive: { hp: 10, moveSpd: 1.5 }, desc: 'An avalanche in armor.' }),
      S('Colossus', 'passive', 'phys', { passive: { str: 4 }, desc: 'Grow ever mightier. +Strength per point.' }),
      S('Indomitable', 'passive', 'phys', { passive: { allRes: 3 }, desc: 'Nothing bends you. +All resistances per point.' }),
      S('Warlord\'s Focus', 'passive', 'phys', { passive: { critCh: 1.6 }, desc: 'See the opening. Take it. +Crit chance per point.' }),
    ]),
  ],
},
{
  id: 'elementalist', name: 'Elementalist', dmgStat: 'ene',
  desc: 'Fire, frost and storm answer her call — and her grudges.',
  base: { str: 12, dex: 18, vit: 20, ene: 38 },
  weapon: 'staff',
  pal: { skin: '#e8b48c', cloth: '#2a3f8f', armor: '#5a3f8f', hair: '#d8622a', trim: '#ffd77a' },
  trees: [
    T('Pyromancy', [
      S('Firebolt', 'proj', 'fire', { dmg: [6, 12], dmgLvl: 0.34, speed: 12, mana: 2, desc: 'A hissing dart of flame.' }),
      S('Ember Spray', 'proj', 'fire', { dmg: [4, 8], dmgLvl: 0.32, count: 3, spread: 0.5, speed: 10, mana: 4, desc: 'A fan of burning motes.' }),
      S('Fireball', 'proj', 'fire', { dmg: [14, 26], dmgLvl: 0.33, speed: 10, explodeR: 1.8, mana: 6, desc: 'The classic. Detonates on impact.' }),
      S('Ignite', 'curse', 'fire', { debuff: { dot: 18, dotElem: 'fire', dmgTaken: 0.1 }, radius: 3.4, dur: 6, mana: 7, cd: 3, desc: 'Set an area of foes alight.' }),
      S('Flame Wave', 'proj', 'fire', { dmg: [12, 20], dmgLvl: 0.32, count: 5, spread: 1.5, speed: 8, mana: 10, desc: 'A rolling wall of fire.' }),
      S('Meteor', 'meteor', 'fire', { dmg: [45, 80], dmgLvl: 0.36, radius: 2.6, delay: 0.9, cd: 3, mana: 13, desc: 'Call a stone of heaven down on their heads.' }),
      S('Fire Nova', 'nova', 'fire', { dmg: [18, 30], dmgLvl: 0.33, count: 16, speed: 9, mana: 12, desc: 'An expanding ring of flame.' }),
      S('Immolation Aura', 'buff', 'fire', { buff: { thorns: 30, fireDmg: 12 }, dur: 15, durLvl: 0.8, mana: 12, cd: 10, desc: 'Wreath yourself in punishing fire.' }),
      S('Living Flame', 'summon', 'fire', { minion: 'flameling', maxN: 3, dur: 30, mana: 15, cd: 4, desc: 'A mote of fire given hunger.' }),
      S('Apocalypse', 'storm', 'fire', { dmg: [40, 70], dmgLvl: 0.36, radius: 7, strikes: 12, dur: 4, cd: 16, mana: 26, desc: 'The sky opens. Everything burns.' }),
    ]),
    T('Cryomancy', [
      S('Ice Shard', 'proj', 'cold', { dmg: [5, 10], dmgLvl: 0.34, speed: 13, slowHit: 0.25, mana: 2, desc: 'A razor of ice that chills the blood.' }),
      S('Frost Nova', 'nova', 'cold', { dmg: [10, 16], dmgLvl: 0.3, count: 14, speed: 8, slowHit: 0.45, mana: 8, cd: 3, desc: 'Freeze everything around you.' }),
      S('Glacial Spike', 'proj', 'cold', { dmg: [16, 28], dmgLvl: 0.33, speed: 9, explodeR: 1.6, slowHit: 0.5, mana: 7, desc: 'A frozen lance that shatters on impact.' }),
      S('Chilling Armor', 'buff', 'cold', { buff: { armor: 120, coldDmg: 8 }, dur: 20, durLvl: 1, mana: 9, cd: 8, desc: 'Plate yourself in living ice.' }),
      S('Ice Lance', 'beam', 'cold', { dmg: [22, 36], dmgLvl: 0.34, range: 9, slowHit: 0.4, mana: 9, desc: 'A piercing beam of absolute cold.' }),
      S('Blizzard', 'storm', 'cold', { dmg: [20, 34], dmgLvl: 0.34, radius: 4, strikes: 10, dur: 3.5, cd: 8, mana: 16, desc: 'A howling storm of ice over the target.' }),
      S('Deep Freeze', 'curse', 'cold', { debuff: { slow: 0.7 }, radius: 4, dur: 5, mana: 11, cd: 8, desc: 'Lock them in place. Then decide their fate.' }),
      S('Frozen Orb', 'proj', 'cold', { dmg: [8, 14], dmgLvl: 0.32, speed: 5, orb: true, orbRate: 0.08, mana: 14, cd: 2, desc: 'A slow orb that sprays shards as it drifts.' }),
      S('Winter\'s Grasp', 'passive', 'cold', { passive: { coldDmg: 3 }, desc: 'The cold seeps into every blow. +Cold damage per point.' }),
      S('Absolute Zero', 'nova', 'cold', { dmg: [45, 75], dmgLvl: 0.36, count: 22, speed: 10, slowHit: 0.6, cd: 14, mana: 25, desc: 'The temperature of the void, unleashed.' }),
    ]),
    T('Storm Calling', [
      S('Spark', 'proj', 'lite', { dmg: [1, 16], dmgLvl: 0.36, speed: 14, mana: 2, desc: 'Wildly unpredictable — sometimes devastating.' }),
      S('Charged Bolt', 'proj', 'lite', { dmg: [3, 9], dmgLvl: 0.32, count: 4, spread: 1.1, speed: 7, wobble: true, mana: 4, desc: 'A swarm of erratic sparks.' }),
      S('Lightning', 'beam', 'lite', { dmg: [4, 40], dmgLvl: 0.36, range: 10, mana: 7, desc: 'A bolt that splits the dark.' }),
      S('Teleport', 'dash', 'arc', { range: 7, cd: 2.5, mana: 9, blink: true, desc: 'Fold space. Arrive elsewhere.' }),
      S('Chain Lightning', 'chain', 'lite', { dmg: [14, 30], dmgLvl: 0.34, jumps: 4, jumpsLvl: 0.25, speed: 13, mana: 9, desc: 'Lightning that hunts from foe to foe.' }),
      S('Static Field', 'nova', 'lite', { dmg: [12, 20], dmgLvl: 0.3, count: 18, speed: 12, mana: 10, cd: 2, desc: 'A crackling shockwave of static.' }),
      S('Energy Shield', 'buff', 'lite', { buff: { armor: 100, allRes: 15 }, dur: 18, durLvl: 0.9, mana: 12, cd: 10, desc: 'A skin of humming force.' }),
      S('Thunderstorm', 'storm', 'lite', { dmg: [30, 55], dmgLvl: 0.35, radius: 6, strikes: 8, dur: 5, cd: 10, mana: 15, desc: 'The clouds rage on your behalf.' }),
      S('Storm Mastery', 'passive', 'lite', { passive: { liteDmg: 3 }, desc: 'Thunder lives in your hands. +Lightning damage per point.' }),
      S('Wrath of the Sky', 'meteor', 'lite', { dmg: [70, 130], dmgLvl: 0.36, radius: 3, delay: 0.5, cd: 9, mana: 22, desc: 'One bolt. One crater.' }),
    ]),
  ],
},
{
  id: 'deathspeaker', name: 'Deathspeaker', dmgStat: 'ene',
  desc: 'Where he walks, the dead rise and the living wither.',
  base: { str: 14, dex: 16, vit: 22, ene: 36 },
  weapon: 'wand',
  pal: { skin: '#cfd3c8', cloth: '#2c3326', armor: '#494f42', hair: '#e8e2cf', trim: '#8ef04a' },
  trees: [
    T('Summoning', [
      S('Raise Skeleton', 'summon', 'phys', { minion: 'skelwarrior', maxN: 3, maxNLvl: 0.25, dur: 60, mana: 5, cd: 1, desc: 'The dead owe you their service.' }),
      S('Skeletal Mage', 'summon', 'arc', { minion: 'skelmage', maxN: 2, maxNLvl: 0.2, dur: 60, mana: 8, cd: 1, desc: 'Even in death, they remember the old words.' }),
      S('Bone Armor', 'buff', 'phys', { buff: { armor: 110 }, dur: 25, durLvl: 1.2, mana: 8, cd: 6, desc: 'A carapace of orbiting bone.' }),
      S('Blood Golem', 'summon', 'phys', { minion: 'bloodgolem', maxN: 1, dur: 90, mana: 16, cd: 6, desc: 'A shambling mass that exists to be hit.' }),
      S('Corpse Burst', 'meteor', 'pois', { dmg: [24, 40], dmgLvl: 0.34, radius: 2.6, delay: 0.15, mana: 8, cd: 1.5, desc: 'What falls in battle becomes a bomb.' }),
      S('Dark Pact', 'buff', 'phys', { buff: { minionDmg: 40, minionHp: 30 }, dur: 15, durLvl: 0.8, mana: 12, cd: 10, desc: 'Feed your servants a sliver of your soul.' }),
      S('Raise Horde', 'summon', 'phys', { minion: 'skelwarrior', maxN: 6, maxNLvl: 0.3, count: 3, dur: 60, mana: 18, cd: 8, desc: 'Not one servant. A procession.' }),
      S('Grave Mastery', 'passive', 'phys', { passive: { minionDmg: 6, minionHp: 5 }, desc: 'Your dead hit harder and linger longer.' }),
      S('Flesh Colossus', 'summon', 'phys', { minion: 'colossus', maxN: 1, dur: 120, mana: 30, cd: 20, desc: 'Stitched from a battlefield\'s worth of regret.' }),
      S('Army of the Damned', 'summon', 'phys', { minion: 'skelwarrior', maxN: 10, count: 6, dur: 45, mana: 35, cd: 30, desc: 'Empty every grave at once.' }),
    ]),
    T('Curses', [
      S('Amplify Pain', 'curse', 'arc', { debuff: { dmgTaken: 0.3 }, radius: 4, dur: 10, mana: 4, cd: 2, desc: 'Their wounds open twice as wide.' }),
      S('Enfeeble', 'curse', 'arc', { debuff: { weaken: 0.3 }, radius: 4, dur: 10, mana: 4, cd: 2, desc: 'Sap the strength from their limbs.' }),
      S('Decrepify', 'curse', 'arc', { debuff: { slow: 0.4, weaken: 0.15 }, radius: 4, dur: 8, mana: 6, cd: 3, desc: 'Age them a century in a heartbeat.' }),
      S('Plague', 'curse', 'pois', { debuff: { dot: 26, dotElem: 'pois' }, radius: 4.5, dur: 8, mana: 8, cd: 3, desc: 'A rot that spreads through the ranks.' }),
      S('Life Tap', 'buff', 'arc', { buff: { leechHp: 10 }, dur: 12, durLvl: 0.6, mana: 9, cd: 8, desc: 'Every wound you deal feeds you.' }),
      S('Terror', 'curse', 'arc', { debuff: { slow: 0.55, weaken: 0.25 }, radius: 5, dur: 6, mana: 10, cd: 6, desc: 'Show them exactly how they will die.' }),
      S('Siphon Soul', 'beam', 'arc', { dmg: [18, 30], dmgLvl: 0.33, range: 8, healPct: 40, mana: 9, desc: 'Drink their essence across the dark.' }),
      S('Occult Mastery', 'passive', 'arc', { passive: { arcDmg: 3 }, desc: 'The forbidden syllables come easily now.' }),
      S('Doom', 'curse', 'arc', { debuff: { dmgTaken: 0.45, dot: 20, dotElem: 'arc' }, radius: 5, dur: 9, mana: 16, cd: 10, desc: 'Pronounce a sentence no court can lift.' }),
      S('Death Sentence', 'curse', 'arc', { debuff: { dmgTaken: 0.6, slow: 0.5 }, radius: 6, dur: 8, mana: 24, cd: 18, desc: 'All debts come due at once.' }),
    ]),
    T('Bone Craft', [
      S('Bone Spike', 'proj', 'phys', { dmg: [6, 11], dmgLvl: 0.34, speed: 12, mana: 2, desc: 'A splinter of sharpened femur.' }),
      S('Teeth', 'proj', 'phys', { dmg: [3, 6], dmgLvl: 0.3, count: 5, countLvl: 0.2, spread: 0.9, speed: 11, mana: 4, desc: 'A fan of gnashing shards.' }),
      S('Bone Spear', 'beam', 'phys', { dmg: [18, 30], dmgLvl: 0.34, range: 9, mana: 7, desc: 'A lance of fused vertebrae that pierces ranks.' }),
      S('Marrow Shield', 'buff', 'phys', { buff: { armor: 80, thorns: 25 }, dur: 20, durLvl: 1, mana: 8, cd: 8, desc: 'Bone splinters bite back.' }),
      S('Corpse Lance', 'proj', 'phys', { dmg: [20, 34], dmgLvl: 0.34, speed: 15, pierce: 2, mana: 7, desc: 'Fast, silent, and entirely rude.' }),
      S('Bone Nova', 'nova', 'phys', { dmg: [16, 26], dmgLvl: 0.32, count: 16, speed: 10, mana: 11, desc: 'A ring of shrieking splinters.' }),
      S('Spirit Reaper', 'passive', 'phys', { passive: { leechMp: 0.6, leechHp: 0.4 }, desc: 'Harvest what the dying no longer need.' }),
      S('Bone Prison', 'curse', 'phys', { debuff: { slow: 0.85 }, radius: 3, dur: 4, mana: 12, cd: 9, desc: 'Cage them in a lattice of bone.' }),
      S('Bone Storm', 'storm', 'phys', { dmg: [26, 45], dmgLvl: 0.34, radius: 5, strikes: 9, dur: 4, cd: 10, mana: 16, desc: 'The ossuary rises, spinning.' }),
      S('Wail of the Dead', 'nova', 'arc', { dmg: [40, 68], dmgLvl: 0.36, count: 20, speed: 11, cd: 13, mana: 24, desc: 'Every soul you have taken screams at once.' }),
    ]),
  ],
},
{
  id: 'templar', name: 'Templar', dmgStat: 'str',
  desc: 'A fallen order\'s last blade, burning with borrowed light.',
  base: { str: 26, dex: 18, vit: 26, ene: 18 },
  weapon: 'mace',
  pal: { skin: '#d9a878', cloth: '#f0e6d0', armor: '#b8a44f', hair: '#7a5a2e', trim: '#fff2c0' },
  trees: [
    T('Sacred Fire', [
      S('Smite', 'strike', 'holy', { wd: 135, wdLvl: 13, range: 1.9, arcW: 1.2, mana: 3, desc: 'Strike with the weight of judgment.' }),
      S('Holy Bolt', 'proj', 'holy', { dmg: [7, 13], dmgLvl: 0.34, speed: 12, mana: 3, desc: 'A dart of condensed conviction.' }),
      S('Consecrate', 'slam', 'holy', { dmg: [14, 24], dmgLvl: 0.32, radius: 3.2, mana: 8, desc: 'Sanctify the ground beneath your boots — violently.' }),
      S('Hammer of Wrath', 'proj', 'holy', { dmg: [16, 28], dmgLvl: 0.34, speed: 9, explodeR: 1.5, mana: 7, desc: 'A spectral maul hurled at the unrighteous.' }),
      S('Radiance', 'nova', 'holy', { dmg: [15, 25], dmgLvl: 0.32, count: 14, speed: 9, mana: 10, desc: 'Light escapes you in a searing ring.' }),
      S('Judgment', 'strike', 'holy', { wd: 240, wdLvl: 24, range: 2.1, arcW: 1.0, cd: 4, mana: 9, desc: 'The verdict is guilty. It is always guilty.' }),
      S('Blessed Ground', 'meteor', 'holy', { dmg: [35, 60], dmgLvl: 0.34, radius: 2.8, delay: 0.6, cd: 4, mana: 12, desc: 'Call a pillar of light down upon them.' }),
      S('Holy Lance', 'beam', 'holy', { dmg: [24, 40], dmgLvl: 0.34, range: 9, mana: 10, desc: 'A spear of daybreak, thrown through the dark.' }),
      S('Wave of Light', 'nova', 'holy', { dmg: [38, 64], dmgLvl: 0.35, count: 20, speed: 10, cd: 8, mana: 18, desc: 'A tolling bell of radiance.' }),
      S('Ascension', 'buff', 'holy', { buff: { dmgPct: 30, holyDmg: 20, lightRad: 3 }, dur: 14, durLvl: 0.6, cd: 28, mana: 22, desc: 'For a moment, you are what the order promised.' }),
    ]),
    T('Auras', [
      S('Might', 'passive', 'holy', { passive: { dmgPct: 4 }, desc: 'An aura of raw force. +Damage per point.' }),
      S('Vigor', 'passive', 'holy', { passive: { moveSpd: 2 }, desc: 'Your stride devours the road. +Move speed per point.' }),
      S('Defiance', 'passive', 'holy', { passive: { armor: 20 }, desc: 'An unseen bulwark. +Armor per point.' }),
      S('Cleansing', 'passive', 'holy', { passive: { poisRes: 4, regenHp: 0.6 }, desc: 'Corruption cannot roost in you.' }),
      S('Salvation', 'passive', 'holy', { passive: { allRes: 3 }, desc: 'A quiet shield against all elements.' }),
      S('Fanaticism', 'passive', 'holy', { passive: { atkSpd: 2.5 }, desc: 'Zeal moves your arm. +Attack speed per point.' }),
      S('Meditation', 'passive', 'holy', { passive: { regenMp: 0.8 }, desc: 'Stillness at the center of slaughter. +Mana regen.' }),
      S('Redemption', 'passive', 'holy', { passive: { regenHp: 1.2 }, desc: 'The fallen lend you their unspent years.' }),
      S('Concentration', 'passive', 'holy', { passive: { dmgPct: 6 }, desc: 'Nothing exists but the strike. +Damage per point.' }),
      S('Conviction', 'passive', 'holy', { passive: { critCh: 1.4 }, desc: 'Doubt dies first. +Crit chance per point.' }),
    ]),
    T('Bastion', [
      S('Shield Bash', 'strike', 'phys', { wd: 120, wdLvl: 12, range: 1.7, arcW: 1.2, stun: 1.0, mana: 4, desc: 'Introduce their face to your heraldry.' }),
      S('Holy Shield', 'buff', 'phys', { buff: { armor: 130 }, dur: 25, durLvl: 1.2, mana: 8, cd: 8, desc: 'Your shield glows with stubborn light.' }),
      S('Zealotry', 'buff', 'phys', { buff: { atkSpd: 28 }, dur: 10, durLvl: 0.5, mana: 9, cd: 10, desc: 'Strike in a blur of devotion.' }),
      S('Charge', 'dash', 'phys', { range: 7, wd: 160, wdLvl: 16, radius: 1.6, cd: 5, mana: 8, desc: 'A cavalry charge of one.' }),
      S('Retribution', 'passive', 'phys', { passive: { thorns: 8 }, desc: 'Those who strike you answer for it.' }),
      S('Aegis', 'buff', 'phys', { buff: { armor: 90, allRes: 18 }, dur: 12, durLvl: 0.6, mana: 12, cd: 12, desc: 'A dome of interlocking wards.' }),
      S('Crusader\'s Resolve', 'passive', 'phys', { passive: { vit: 3.5 }, desc: 'The body serves the cause. +Vitality per point.' }),
      S('Shield Wall', 'buff', 'phys', { buff: { armor: 260, moveSpd: -10 }, dur: 8, durLvl: 0.4, mana: 14, cd: 15, desc: 'Become the wall the others died behind.' }),
      S('Consecrated Steel', 'passive', 'phys', { passive: { holyDmg: 3 }, desc: 'Your steel remembers its blessing. +Holy damage.' }),
      S('Wrath of the Highest', 'meteor', 'holy', { dmg: [80, 140], dmgLvl: 0.36, radius: 3.4, delay: 0.8, cd: 14, mana: 26, desc: 'You asked. Something answered.' }),
    ]),
  ],
},
{
  id: 'windrunner', name: 'Windrunner', dmgStat: 'dex',
  desc: 'Her arrows arrive before the sound of the bowstring.',
  base: { str: 16, dex: 34, vit: 22, ene: 16 },
  weapon: 'bow',
  pal: { skin: '#dba87f', cloth: '#2e5e3a', armor: '#6a7a52', hair: '#e8d089', trim: '#b8e0a0' },
  trees: [
    T('Precision', [
      S('Piercing Shot', 'proj', 'phys', { wd: 110, wdLvl: 11, speed: 15, pierce: 3, mana: 2, desc: 'One arrow, several regrets.' }),
      S('Multishot', 'proj', 'phys', { wd: 75, wdLvl: 8, count: 3, countLvl: 0.18, spread: 0.7, speed: 14, mana: 5, desc: 'Why loose one arrow when five will do?' }),
      S('Guided Arrow', 'proj', 'phys', { wd: 130, wdLvl: 13, speed: 10, homing: true, mana: 5, desc: 'It knows the way to the heart.' }),
      S('Impale', 'strike', 'phys', { wd: 220, wdLvl: 22, range: 2.4, arcW: 0.6, mana: 5, desc: 'For guests who get too close.' }),
      S('Strafe', 'proj', 'phys', { wd: 60, wdLvl: 7, count: 7, spread: 2.6, speed: 14, mana: 9, desc: 'A half-circle of whistling death.' }),
      S('Critical Eye', 'passive', 'phys', { passive: { critCh: 1.5 }, desc: 'You see the gap in every guard.' }),
      S('Penetrate', 'passive', 'phys', { passive: { dmgPct: 5 }, desc: 'Draw deeper. Hit harder.' }),
      S('Rapid Fire', 'buff', 'phys', { buff: { atkSpd: 35 }, dur: 8, durLvl: 0.5, mana: 11, cd: 12, desc: 'The string sings one long note.' }),
      S('Deadeye', 'passive', 'phys', { passive: { critDmg: 8 }, desc: 'When you crit, they simply stop.' }),
      S('Arrowstorm', 'storm', 'phys', { dmg: [30, 50], dmgLvl: 0.35, radius: 5, strikes: 12, dur: 4, cd: 12, mana: 20, desc: 'Blot out the ceiling.' }),
    ]),
    T('Elemental Quiver', [
      S('Fire Arrow', 'proj', 'fire', { wd: 90, wdLvl: 9, flat: [4, 8], speed: 14, mana: 3, desc: 'An arrow dressed for the occasion.' }),
      S('Cold Arrow', 'proj', 'cold', { wd: 85, wdLvl: 9, flat: [3, 7], speed: 14, slowHit: 0.35, mana: 3, desc: 'Slows the target\'s plans considerably.' }),
      S('Stormstrike Bolt', 'proj', 'lite', { wd: 80, wdLvl: 10, flat: [1, 14], speed: 16, mana: 4, desc: 'Crackles unpleasantly on arrival.' }),
      S('Exploding Arrow', 'proj', 'fire', { wd: 100, wdLvl: 11, flat: [6, 12], speed: 13, explodeR: 1.8, mana: 6, desc: 'The fletching is the fuse.' }),
      S('Freezing Arrow', 'proj', 'cold', { wd: 95, wdLvl: 10, flat: [6, 10], speed: 13, explodeR: 1.7, slowHit: 0.5, mana: 7, desc: 'Shatters into a burst of frost.' }),
      S('Plague Javelin', 'proj', 'pois', { wd: 110, wdLvl: 12, flat: [8, 14], speed: 11, explodeR: 2.0, mana: 8, desc: 'Leaves a memorable impression, then a rash.' }),
      S('Lightning Fury', 'chain', 'lite', { dmg: [18, 36], dmgLvl: 0.35, jumps: 5, jumpsLvl: 0.25, speed: 14, mana: 10, desc: 'One throw, a dozen thunderclaps.' }),
      S('Immolation Arrow', 'meteor', 'fire', { dmg: [36, 60], dmgLvl: 0.34, radius: 2.4, delay: 0.4, cd: 4, mana: 11, desc: 'Marks the spot where everything catches fire.' }),
      S('Frost Volley', 'nova', 'cold', { dmg: [16, 28], dmgLvl: 0.32, count: 12, speed: 11, slowHit: 0.4, mana: 12, desc: 'Winter, in every direction at once.' }),
      S('Elemental Fusillade', 'proj', 'fire', { dmg: [22, 38], dmgLvl: 0.34, count: 9, spread: 1.8, speed: 13, multiElem: true, cd: 8, mana: 20, desc: 'Fire, frost and storm in one ragged volley.' }),
    ]),
    T('Wind Discipline', [
      S('Fleet Foot', 'passive', 'phys', { passive: { moveSpd: 2 }, desc: 'The ground barely notices you.' }),
      S('Dodge', 'passive', 'phys', { passive: { armor: 16 }, desc: 'Be where the blade is not.' }),
      S('Windwalk', 'dash', 'phys', { range: 6, cd: 3, mana: 6, blink: true, desc: 'Step through a gap in the air.' }),
      S('Zephyr Ward', 'buff', 'phys', { buff: { armor: 70, moveSpd: 15 }, dur: 12, durLvl: 0.6, mana: 8, cd: 8, desc: 'A jealous wind turns arrows aside.' }),
      S('Eagle Eye', 'passive', 'phys', { passive: { lightRad: 0.2, mf: 2 }, desc: 'Nothing glitters unseen.' }),
      S('Valkyrie', 'summon', 'phys', { minion: 'valkyrie', maxN: 1, dur: 60, mana: 20, cd: 12, desc: 'A spear-maiden answers from elsewhere.' }),
      S('Slipstream', 'buff', 'phys', { buff: { atkSpd: 18, moveSpd: 18 }, dur: 10, durLvl: 0.5, mana: 10, cd: 10, desc: 'Ride the current only you can feel.' }),
      S('Hunter\'s Instinct', 'passive', 'phys', { passive: { dex: 4 }, desc: 'The prey teaches the hunter. +Dexterity per point.' }),
      S('Tempest', 'storm', 'lite', { dmg: [26, 46], dmgLvl: 0.34, radius: 5.5, strikes: 10, dur: 4.5, cd: 11, mana: 17, desc: 'Whistle up a storm with teeth.' }),
      S('Spirit of the Hawk', 'buff', 'phys', { buff: { dmgPct: 22, critCh: 10, moveSpd: 12 }, dur: 12, durLvl: 0.6, cd: 26, mana: 20, desc: 'See everything. Miss nothing.' }),
    ]),
  ],
},
{
  id: 'nightblade', name: 'Nightblade', dmgStat: 'dex',
  desc: 'You will not hear the joke, but the punchline is a knife.',
  base: { str: 18, dex: 32, vit: 22, ene: 16 },
  weapon: 'dagger',
  pal: { skin: '#b98d6e', cloth: '#2a2233', armor: '#3d3550', hair: '#1c1424', trim: '#a05dd8' },
  trees: [
    T('Shadow Arts', [
      S('Shadow Strike', 'strike', 'phys', { wd: 150, wdLvl: 15, range: 1.8, arcW: 1.1, mana: 3, desc: 'The dark lends your blade its edge.' }),
      S('Fan of Knives', 'nova', 'phys', { dmg: [8, 14], dmgLvl: 0.32, count: 10, speed: 12, wd: 55, wdLvl: 6, mana: 7, desc: 'Everyone nearby receives a knife.' }),
      S('Poisoned Blades', 'buff', 'pois', { buff: { poisDmg: 10 }, dur: 20, durLvl: 1, mana: 6, cd: 5, desc: 'Coat your steel in whispered endings.' }),
      S('Vanish', 'dash', 'phys', { range: 6, cd: 3.5, mana: 7, blink: true, desc: 'Step out of the story for a moment.' }),
      S('Death Mark', 'curse', 'phys', { debuff: { dmgTaken: 0.35 }, radius: 3, dur: 8, mana: 8, cd: 5, desc: 'Choose who the night takes next.' }),
      S('Shadow Clone', 'summon', 'phys', { minion: 'shadowclone', maxN: 1, dur: 25, mana: 14, cd: 12, desc: 'A copy of you with fewer scruples.' }),
      S('Envenom', 'passive', 'pois', { passive: { poisDmg: 3 }, desc: 'Your blades are never quite clean.' }),
      S('Blade Flurry', 'strike', 'phys', { wd: 90, wdLvl: 10, range: 1.9, arcW: 2.6, hits: 3, mana: 8, desc: 'Three cuts before the first drop falls.' }),
      S('Nightfall', 'curse', 'phys', { debuff: { slow: 0.5, weaken: 0.2 }, radius: 5, dur: 7, mana: 12, cd: 8, desc: 'Drop the dark over their eyes.' }),
      S('Assassinate', 'strike', 'phys', { wd: 380, wdLvl: 38, range: 2.0, arcW: 0.7, cd: 7, mana: 14, desc: 'The conversation ends.' }),
    ]),
    T('Traps', [
      S('Fire Trap', 'trap', 'fire', { dmg: [8, 14], dmgLvl: 0.33, maxN: 3, dur: 20, rate: 1.0, radius: 2.2, mana: 6, desc: 'A gift that keeps on burning.' }),
      S('Lightning Sentry', 'trap', 'lite', { dmg: [10, 18], dmgLvl: 0.34, maxN: 3, dur: 20, rate: 0.8, shoot: true, mana: 8, desc: 'A coil that spits judgment.' }),
      S('Frost Trap', 'trap', 'cold', { dmg: [7, 12], dmgLvl: 0.32, maxN: 3, dur: 20, rate: 1.1, radius: 2.4, slowHit: 0.45, mana: 7, desc: 'Cools tempers and ankles alike.' }),
      S('Poison Cloud', 'meteor', 'pois', { dmg: [20, 34], dmgLvl: 0.33, radius: 2.8, delay: 0.2, linger: 4, mana: 9, cd: 4, desc: 'A miasma with opinions.' }),
      S('Blade Sentinel', 'trap', 'phys', { dmg: [12, 20], dmgLvl: 0.34, maxN: 2, dur: 18, rate: 0.7, shoot: true, mana: 9, desc: 'A whirling guardian of sharpened spite.' }),
      S('Shock Web', 'meteor', 'lite', { dmg: [26, 44], dmgLvl: 0.34, radius: 2.6, delay: 0.3, mana: 10, cd: 4, desc: 'A net woven from live current.' }),
      S('Trap Mastery', 'passive', 'phys', { passive: { minionDmg: 7 }, desc: 'Your devices grow crueler. +Trap & minion damage.' }),
      S('Inferno Trap', 'trap', 'fire', { dmg: [18, 30], dmgLvl: 0.34, maxN: 3, dur: 18, rate: 0.9, radius: 2.8, mana: 12, desc: 'Less a trap, more a small volcano.' }),
      S('Chain Sentry', 'trap', 'lite', { dmg: [16, 28], dmgLvl: 0.34, maxN: 3, dur: 20, rate: 1.0, shoot: true, chain: true, mana: 14, desc: 'It never shocks just one.' }),
      S('Death Sentry', 'trap', 'fire', { dmg: [30, 50], dmgLvl: 0.35, maxN: 4, dur: 20, rate: 1.1, radius: 3.2, mana: 18, cd: 2, desc: 'The last trap anyone walks past.' }),
    ]),
    T('Martial Ways', [
      S('Tiger Strike', 'strike', 'phys', { wd: 140, wdLvl: 14, range: 1.8, arcW: 1.3, mana: 3, desc: 'A palm that cracks ribs like kindling.' }),
      S('Cobra Strike', 'strike', 'phys', { wd: 110, wdLvl: 11, range: 1.8, arcW: 1.2, healPct: 30, mana: 4, desc: 'Strike like the snake, drink like one too.' }),
      S('Phoenix Kick', 'slam', 'fire', { wd: 130, wdLvl: 13, radius: 2.4, mana: 7, desc: 'Land heel-first in a bloom of flame.' }),
      S('Claws of Thunder', 'strike', 'lite', { wd: 120, wdLvl: 13, flat: [2, 18], range: 1.9, arcW: 1.6, mana: 6, desc: 'Your fists remember the storm.' }),
      S('Blades of Ice', 'strike', 'cold', { wd: 115, wdLvl: 12, flat: [5, 10], range: 1.9, arcW: 1.6, slowHit: 0.4, mana: 6, desc: 'Cold hands. Colder intentions.' }),
      S('Serpent\'s Coil', 'buff', 'pois', { buff: { leechHp: 9 }, dur: 12, durLvl: 0.6, mana: 9, cd: 10, desc: 'What you wound, you keep.' }),
      S('Inner Focus', 'passive', 'phys', { passive: { regenMp: 0.6, atkSpd: 1.5 }, desc: 'Breathe in. Someone exhales forever.' }),
      S('Way of the Viper', 'passive', 'pois', { passive: { critCh: 1.0, poisDmg: 2 }, desc: 'Patience, then the fang.' }),
      S('Dragon Talon', 'strike', 'phys', { wd: 200, wdLvl: 20, range: 2.0, arcW: 1.0, knock: 3, mana: 8, desc: 'A kick that relocates the argument.' }),
      S('Dragon Flight', 'dash', 'phys', { range: 8, wd: 260, wdLvl: 26, radius: 2.0, cd: 8, mana: 14, desc: 'Arrive like a meteor with a grudge.' }),
    ]),
  ],
},
{
  id: 'wildkeeper', name: 'Wildkeeper', dmgStat: 'str',
  desc: 'The forest\'s debt collector. The wilderness fights beside him.',
  base: { str: 24, dex: 20, vit: 26, ene: 22 },
  weapon: 'axe',
  pal: { skin: '#c99a6e', cloth: '#5a4726', armor: '#7a6a3a', hair: '#8a5a2e', trim: '#8ef04a' },
  trees: [
    T('Feral Rage', [
      S('Maul', 'strike', 'phys', { wd: 140, wdLvl: 14, range: 2.0, arcW: 1.6, mana: 3, desc: 'Hit them like a falling tree.' }),
      S('Shred', 'strike', 'phys', { wd: 100, wdLvl: 10, range: 1.8, arcW: 1.4, dot: 18, mana: 4, desc: 'Claws leave wounds that keep working.' }),
      S('Feral Claws', 'buff', 'phys', { buff: { atkSpd: 25 }, dur: 12, durLvl: 0.6, mana: 7, cd: 8, desc: 'Your hands forget they were ever hands.' }),
      S('Pounce', 'dash', 'phys', { range: 6, wd: 140, wdLvl: 14, radius: 1.8, cd: 4, mana: 7, desc: 'Close the distance the predator\'s way.' }),
      S('Rabid Bite', 'strike', 'pois', { wd: 130, wdLvl: 13, flat: [6, 12], range: 1.7, arcW: 0.9, mana: 5, desc: 'A bite nobody walks off.' }),
      S('Beast Within', 'buff', 'phys', { buff: { dmgPct: 25, hp: 60 }, dur: 14, durLvl: 0.7, mana: 11, cd: 14, desc: 'Let it out. Apologize later.' }),
      S('Savagery', 'passive', 'phys', { passive: { dmgPct: 5 }, desc: 'Civilization was slowing you down.' }),
      S('Thick Hide', 'passive', 'phys', { passive: { armor: 20 }, desc: 'Bark, fur, and sheer stubbornness.' }),
      S('Alpha\'s Roar', 'curse', 'phys', { debuff: { slow: 0.4, weaken: 0.25 }, radius: 6, dur: 7, mana: 12, cd: 8, desc: 'Remind them where they stand in the food chain.' }),
      S('Primal Fury', 'buff', 'phys', { buff: { dmgPct: 30, atkSpd: 25, leechHp: 5 }, dur: 12, durLvl: 0.5, cd: 30, mana: 20, desc: 'The oldest anger there is.' }),
    ]),
    T('Storm of Roots', [
      S('Firestorm', 'proj', 'fire', { dmg: [5, 9], dmgLvl: 0.32, count: 3, spread: 0.8, speed: 7, mana: 4, desc: 'Ribbons of flame race along the ground.' }),
      S('Molten Boulder', 'proj', 'fire', { dmg: [16, 28], dmgLvl: 0.33, speed: 6, explodeR: 2.0, pierce: 1, mana: 8, desc: 'Slow, heavy, and profoundly persuasive.' }),
      S('Twister', 'proj', 'phys', { dmg: [8, 14], dmgLvl: 0.32, count: 3, spread: 0.9, speed: 8, wobble: true, mana: 7, desc: 'Little winds with big grievances.' }),
      S('Cyclone Armor', 'buff', 'phys', { buff: { armor: 100, allRes: 10 }, dur: 20, durLvl: 1, mana: 9, cd: 8, desc: 'Wrap the weather around your shoulders.' }),
      S('Tornado', 'proj', 'phys', { dmg: [22, 38], dmgLvl: 0.34, speed: 7, pierce: 4, wobble: true, mana: 10, desc: 'The forest\'s own siege engine.' }),
      S('Volcano', 'meteor', 'fire', { dmg: [40, 68], dmgLvl: 0.35, radius: 2.8, delay: 0.7, cd: 6, mana: 14, desc: 'Ask the mountain for a favor.' }),
      S('Hurricane', 'storm', 'cold', { dmg: [22, 38], dmgLvl: 0.34, radius: 5, strikes: 10, dur: 5, cd: 10, mana: 16, desc: 'A cold spiral with you at its calm center.' }),
      S('Gale Force', 'passive', 'phys', { passive: { moveSpd: 1.5, atkSpd: 1.5 }, desc: 'The wind is always at your back.' }),
      S('Nature\'s Wrath', 'passive', 'phys', { passive: { fireDmg: 2, coldDmg: 2 }, desc: 'Every element owes you a favor.' }),
      S('Armageddon', 'storm', 'fire', { dmg: [45, 75], dmgLvl: 0.36, radius: 7, strikes: 14, dur: 5, cd: 18, mana: 26, desc: 'The sky rains fists of burning rock.' }),
    ]),
    T('The Grove', [
      S('Summon Wolf', 'summon', 'phys', { minion: 'wolf', maxN: 3, maxNLvl: 0.15, dur: 60, mana: 6, cd: 1, desc: 'The pack answers.' }),
      S('Raven Flock', 'summon', 'phys', { minion: 'raven', maxN: 3, dur: 40, mana: 6, cd: 1, desc: 'Eyes above, beaks below.' }),
      S('Poison Creeper', 'trap', 'pois', { dmg: [6, 11], dmgLvl: 0.32, maxN: 2, dur: 25, rate: 1.2, radius: 2.6, mana: 7, desc: 'A vine that resents being stepped on.' }),
      S('Summon Bear', 'summon', 'phys', { minion: 'bear', maxN: 1, dur: 90, mana: 14, cd: 6, desc: 'Diplomacy, weighing four hundred pounds.' }),
      S('Heart of the Oak', 'passive', 'phys', { passive: { hp: 12, regenHp: 0.4 }, desc: 'Old roots run through you.' }),
      S('Oak Blessing', 'heal', 'phys', { heal: 40, healLvl: 14, mana: 10, cd: 6, desc: 'The grove knits your wounds closed.' }),
      S('Grove Guardian', 'summon', 'phys', { minion: 'treant', maxN: 1, dur: 120, mana: 24, cd: 15, desc: 'The oldest tree in the wood, awake and annoyed.' }),
      S('Symbiosis', 'passive', 'phys', { passive: { allRes: 2.5, minionHp: 4 }, desc: 'You and the wild, one organism.' }),
      S('Wild Communion', 'passive', 'phys', { passive: { minionDmg: 6 }, desc: 'Your beasts fight with your fury.' }),
      S('Spirit of the Wild', 'buff', 'phys', { buff: { dmgPct: 20, minionDmg: 40, minionHp: 40 }, dur: 15, durLvl: 0.7, cd: 30, mana: 22, desc: 'Every fang in the forest bares at once.' }),
    ]),
  ],
},
];

// Unlock level for skill index i within a tree (rows of 2).
function skillReqLvl(i) { return [1, 1, 7, 7, 13, 13, 19, 19, 25, 25][i] || 1; }

// Skill lookup table
const SKILL_BY_ID = {};
for (const c of CLASSES) for (const t of c.trees) for (const s of t.skills) { s.cls = c.id; SKILL_BY_ID[s.id] = s; }

// ---------- Monster families ----------
// body: shape archetype used by sprite baker: humanoid, brute, blob, spider, bat, serpent, ghost, skeleton
const MONSTERS = {
  zombie:     { name: 'Risen Drudge',  body: 'humanoid', pal: { main: '#6a7a52', dark: '#3a4a2a', eye: '#d0ff60' }, hp: 22, dmg: [3, 6],  spd: 1.3, ai: 'melee',  xp: 1.0, size: 1.0 },
  skeleton:   { name: 'Gravebound',    body: 'skeleton', pal: { main: '#d8d2be', dark: '#8a8472', eye: '#60d0ff' }, hp: 14, dmg: [3, 7],  spd: 2.2, ai: 'melee',  xp: 1.0, size: 1.0 },
  skelarcher: { name: 'Bone Archer',   body: 'skeleton', pal: { main: '#cfc4a4', dark: '#7a7258', eye: '#ffe94f' }, hp: 10, dmg: [4, 8],  spd: 2.0, ai: 'ranged', xp: 1.1, size: 0.95 },
  fallen:     { name: 'Gnashling',     body: 'humanoid', pal: { main: '#b8452a', dark: '#6a1f0f', eye: '#ffd94f' }, hp: 9,  dmg: [2, 5],  spd: 3.2, ai: 'melee',  xp: 0.8, size: 0.75 },
  shaman:     { name: 'Gnash Shaman',  body: 'humanoid', pal: { main: '#c86a2a', dark: '#7a3a0f', eye: '#ff4f4f' }, hp: 14, dmg: [5, 9],  spd: 1.8, ai: 'caster', elem: 'fire', xp: 1.4, size: 0.85 },
  bat:        { name: 'Gloom Shrieker',body: 'bat',      pal: { main: '#5a4a6a', dark: '#2c2236', eye: '#ff6a9a' }, hp: 7,  dmg: [2, 4],  spd: 4.0, ai: 'melee',  xp: 0.8, size: 0.7, fly: true },
  spider:     { name: 'Tomb Spinner',  body: 'spider',   pal: { main: '#4a3a2a', dark: '#241a10', eye: '#8ef04a' }, hp: 13, dmg: [3, 6],  spd: 3.4, ai: 'melee',  elem: 'pois', xp: 1.0, size: 0.9 },
  goatman:    { name: 'Kh\'zar Brute', body: 'brute',    pal: { main: '#8a5a3a', dark: '#4a2c16', eye: '#ffb04f' }, hp: 30, dmg: [6, 11], spd: 2.4, ai: 'melee',  xp: 1.3, size: 1.15 },
  cultist:    { name: 'Ash Cultist',   body: 'humanoid', pal: { main: '#7a2222', dark: '#3a0c0c', eye: '#c07bff' }, hp: 16, dmg: [5, 10], spd: 2.0, ai: 'caster', elem: 'arc', xp: 1.4, size: 1.0 },
  wraith:     { name: 'Hollow Wraith', body: 'ghost',    pal: { main: '#8fa8c8', dark: '#3a4a66', eye: '#dff4ff' }, hp: 15, dmg: [4, 8],  spd: 2.8, ai: 'melee',  elem: 'arc', xp: 1.3, size: 1.0, fly: true },
  golem:      { name: 'Barrow Golem',  body: 'brute',    pal: { main: '#7a7a82', dark: '#3c3c44', eye: '#ff8a2f' }, hp: 60, dmg: [8, 15], spd: 1.2, ai: 'melee',  xp: 1.8, size: 1.35 },
  imp:        { name: 'Cinder Imp',    body: 'humanoid', pal: { main: '#c2452a', dark: '#661f0f', eye: '#ffe94f' }, hp: 12, dmg: [5, 9],  spd: 2.6, ai: 'ranged', elem: 'fire', xp: 1.2, size: 0.7 },
  succubus:   { name: 'Veil Temptress',body: 'humanoid', pal: { main: '#a04a6a', dark: '#5a1f36', eye: '#ff6a9a' }, hp: 20, dmg: [6, 11], spd: 2.6, ai: 'ranged', elem: 'arc', xp: 1.6, size: 1.0, fly: true },
  knight:     { name: 'Dread Knight',  body: 'humanoid', pal: { main: '#3c3c50', dark: '#1c1c28', eye: '#ff4f4f' }, hp: 45, dmg: [9, 16], spd: 2.2, ai: 'melee',  xp: 1.9, size: 1.1 },
  exploder:   { name: 'Bloatling',     body: 'blob',     pal: { main: '#9ab84a', dark: '#5a7a1f', eye: '#ff8a2f' }, hp: 10, dmg: [15, 25], spd: 3.0, ai: 'exploder', elem: 'pois', xp: 1.1, size: 0.85 },
  serpent:    { name: 'Fane Serpent',  body: 'serpent',  pal: { main: '#3a7a5a', dark: '#1c4a32', eye: '#d0ff60' }, hp: 18, dmg: [5, 10], spd: 2.4, ai: 'ranged', elem: 'pois', xp: 1.3, size: 1.0 },
  brute:      { name: 'Hellspawn Ravager', body: 'brute',pal: { main: '#8a2c1c', dark: '#4a120a', eye: '#ffe94f' }, hp: 55, dmg: [10, 18], spd: 2.0, ai: 'charger', xp: 2.0, size: 1.3 },
  lich:       { name: 'Grave Lich',    body: 'skeleton', pal: { main: '#b8c8d8', dark: '#5a6a7a', eye: '#c07bff' }, hp: 35, dmg: [7, 13], spd: 1.6, ai: 'summoner', elem: 'arc', xp: 2.2, size: 1.05 },
  // ------ Player minions ------
  skelwarrior:{ name: 'Skeleton Warrior', body: 'skeleton', pal: { main: '#e0dcc8', dark: '#948e78', eye: '#60d0ff' }, hp: 30, dmg: [4, 8], spd: 3.0, ai: 'melee', xp: 0, size: 0.95, minion: true },
  skelmage:   { name: 'Skeleton Mage', body: 'skeleton', pal: { main: '#cfd8e8', dark: '#7a86a0', eye: '#c07bff' }, hp: 20, dmg: [5, 10], spd: 2.6, ai: 'ranged', elem: 'arc', xp: 0, size: 0.95, minion: true },
  bloodgolem: { name: 'Blood Golem',   body: 'brute',    pal: { main: '#8a1f1f', dark: '#4a0c0c', eye: '#ffd94f' }, hp: 120, dmg: [6, 12], spd: 2.2, ai: 'melee', xp: 0, size: 1.25, minion: true },
  colossus:   { name: 'Flesh Colossus',body: 'brute',    pal: { main: '#9a6a5a', dark: '#5a342a', eye: '#8ef04a' }, hp: 300, dmg: [14, 26], spd: 1.8, ai: 'melee', xp: 0, size: 1.5, minion: true },
  flameling:  { name: 'Living Flame',  body: 'ghost',    pal: { main: '#ff8a2f', dark: '#a03c0a', eye: '#fff2c0' }, hp: 25, dmg: [6, 12], spd: 3.2, ai: 'ranged', elem: 'fire', xp: 0, size: 0.8, minion: true, fly: true },
  wolf:       { name: 'Spirit Wolf',   body: 'spider',   pal: { main: '#7a8a9a', dark: '#3c4650', eye: '#8ef04a' }, hp: 35, dmg: [5, 10], spd: 3.6, ai: 'melee', xp: 0, size: 0.85, minion: true, quad: true },
  raven:      { name: 'Raven',         body: 'bat',      pal: { main: '#26262e', dark: '#101014', eye: '#ffe94f' }, hp: 12, dmg: [3, 6], spd: 4.2, ai: 'melee', xp: 0, size: 0.6, minion: true, fly: true },
  bear:       { name: 'Grove Bear',    body: 'brute',    pal: { main: '#6a4a2c', dark: '#3a2412', eye: '#ffd94f' }, hp: 160, dmg: [10, 18], spd: 2.4, ai: 'melee', xp: 0, size: 1.3, minion: true },
  treant:     { name: 'Grove Guardian',body: 'brute',    pal: { main: '#4a5a2c', dark: '#243012', eye: '#8ef04a' }, hp: 260, dmg: [12, 22], spd: 1.6, ai: 'melee', xp: 0, size: 1.45, minion: true },
  valkyrie:   { name: 'Valkyrie',      body: 'humanoid', pal: { main: '#d8d8e8', dark: '#8a8aa8', eye: '#ffe94f' }, hp: 140, dmg: [9, 16], spd: 3.0, ai: 'melee', xp: 0, size: 1.05, minion: true },
  shadowclone:{ name: 'Shadow Clone',  body: 'humanoid', pal: { main: '#2a2233', dark: '#14101c', eye: '#a05dd8' }, hp: 80, dmg: [8, 14], spd: 3.2, ai: 'melee', xp: 0, size: 1.0, minion: true },
  // ------ Boss summons ------
  spiderling: { name: 'Spiderling',    body: 'spider',   pal: { main: '#5a4a3a', dark: '#2c2216', eye: '#8ef04a' }, hp: 8, dmg: [2, 4], spd: 3.8, ai: 'melee', elem: 'pois', xp: 0.5, size: 0.55 },
};

// ---------- Bosses ----------
const BOSSES = {
  malvor:     { name: 'Bishop Malvor, the Flayed Shepherd', body: 'humanoid', pal: { main: '#7a2222', dark: '#3a0c0c', eye: '#c07bff' }, hp: 340, dmg: [8, 14], spd: 1.9, size: 1.5, elem: 'arc',
                abilities: ['nova_arc', 'summon_skeleton', 'volley_arc'], taunt: 'The flock strays. The shepherd corrects.' },
  vashta:     { name: 'Vashta, Queen of the Thousand Eggs', body: 'spider', pal: { main: '#3c2c1c', dark: '#1a1008', eye: '#8ef04a' }, hp: 620, dmg: [10, 18], spd: 2.6, size: 1.9, elem: 'pois',
                abilities: ['spit_pois', 'summon_spiderling', 'charge'], taunt: 'My children are always hungry.' },
  karghul:    { name: 'Karghul, the Furnace Tyrant', body: 'brute', pal: { main: '#8a2c1c', dark: '#3a0c04', eye: '#ffe94f' }, hp: 1100, dmg: [16, 28], spd: 2.1, size: 2.1, elem: 'fire',
                abilities: ['nova_fire', 'meteor_fire', 'charge'], taunt: 'The forge wants bones for coal.' },
  ythalla:    { name: 'Yth-Halla, Mother of Rot', body: 'serpent', pal: { main: '#2c5a3c', dark: '#102a18', eye: '#d0ff60' }, hp: 1800, dmg: [20, 34], spd: 2.0, size: 2.2, elem: 'pois',
                abilities: ['storm_pois', 'summon_serpent', 'spit_pois'], taunt: 'Everything blooms. Everything rots. You are between steps.' },
  maltherion: { name: 'Maltherion, Lord of the Burning Throne', body: 'brute', pal: { main: '#661414', dark: '#2a0404', eye: '#ffb04f' }, hp: 3200, dmg: [28, 46], spd: 2.3, size: 2.4, elem: 'fire',
                abilities: ['nova_fire', 'meteor_fire', 'summon_imp', 'charge', 'volley_arc'], taunt: 'A thousand heroes have knelt where you stand. Look down. You can see their teeth.' },
};

// ---------- Acts / themes ----------
const ACTS = [
  { name: 'The Weeping Parish',   theme: 'crypt',    boss: 'malvor',
    pool: ['zombie', 'skeleton', 'skelarcher', 'fallen', 'bat'], mlvl: 1,
    intro: 'The parish buried its dead too shallow, and prayed too quietly.' },
  { name: 'Catacombs of Ash',     theme: 'catacomb', boss: 'vashta',
    pool: ['skeleton', 'skelarcher', 'spider', 'shaman', 'fallen', 'wraith'], mlvl: 9,
    intro: 'The ash remembers the fire. It is waiting to be embers again.' },
  { name: 'The Molten Undercity', theme: 'cavern',   boss: 'karghul',
    pool: ['imp', 'goatman', 'golem', 'exploder', 'shaman', 'brute'], mlvl: 18,
    intro: 'A city built downward, until it found something better left unfound.' },
  { name: 'The Drowned Fane',     theme: 'fane',     boss: 'ythalla',
    pool: ['serpent', 'cultist', 'wraith', 'spider', 'succubus', 'lich'], mlvl: 28,
    intro: 'The water here does not reflect your face. It reflects someone else\'s.' },
  { name: 'The Burning Throne',   theme: 'hell',     boss: 'maltherion',
    pool: ['knight', 'brute', 'imp', 'succubus', 'cultist', 'golem', 'lich'], mlvl: 38,
    intro: 'The throne has never been empty. Not once. Not ever.' },
];
const ABYSS = { name: 'The Endless Abyss', themes: ['crypt', 'catacomb', 'cavern', 'fane', 'hell'],
  pool: ['zombie', 'skeleton', 'skelarcher', 'spider', 'shaman', 'wraith', 'goatman', 'imp', 'golem', 'exploder', 'cultist', 'succubus', 'knight', 'brute', 'serpent', 'lich'],
  mlvl0: 48 };

// Visual language of each tileset. Beyond the base palette:
//   pattern — floor masonry style baked into the hi-res tiles
//   fog     — [color, alpha] drifting atmospheric fog layer
//   grade   — [topColor, bottomColor, alpha] screen color grading
//   shaft   — god-ray color (falls from unseen cracks above), null = none
//   amb     — ambient particle field: dust | ember | spore | ash | firefly
//   water   — standing-liquid tint, enables 'water' hazard pools
//   moss    — accent growth color painted on walls/floors
const THEMES = {
  town:     { floor: '#4a4a3c', floorAlt: '#565646', wall: '#6a5a44', wallTop: '#8a7a5c', ambient: 0.34, torch: '#ffb04f', name: 'Haven\'s Rest',
              pattern: 'cobble', fog: ['#a8b8c8', 0.045], grade: ['#28384c', '#c8843c', 0.07], shaft: null, amb: 'firefly', water: '#38648a', moss: '#5a7040' },
  crypt:    { floor: '#3c4048', floorAlt: '#34383e', wall: '#2c3038', wallTop: '#4c525e', ambient: 0.82, torch: '#ffb04f', hazards: ['spikes', 'water'],
              props: ['pillar', 'grave', 'bones', 'statue', 'cobweb', 'rubble', 'candles'],
              pattern: 'slab', fog: ['#8ca4c0', 0.09], grade: ['#16243e', '#0a1018', 0.13], shaft: '#a8c8f0', amb: 'dust', water: '#28455c', moss: '#3e5548' },
  catacomb: { floor: '#453c30', floorAlt: '#3c342a', wall: '#33291c', wallTop: '#584a34', ambient: 0.84, torch: '#ff9a3f', hazards: ['spikes', 'gas'],
              props: ['pillar', 'bones', 'urn', 'skullpile', 'cobweb', 'banner', 'rubble'],
              pattern: 'brick', fog: ['#a89468', 0.08], grade: ['#382a12', '#120a04', 0.11], shaft: '#e8c88a', amb: 'dust', water: null, moss: '#564a2c' },
  cavern:   { floor: '#33261e', floorAlt: '#2c201a', wall: '#221610', wallTop: '#44342a', ambient: 0.86, torch: '#ff6a2f', hazards: ['lava', 'vent'],
              props: ['rock', 'crystal', 'stalagmite', 'mushroom'],
              pattern: 'rough', fog: ['#c06438', 0.06], grade: ['#4a1c08', '#160400', 0.14], shaft: null, amb: 'ember', water: null, moss: '#6a3c1e' },
  fane:     { floor: '#26362e', floorAlt: '#203028', wall: '#182420', wallTop: '#32463c', ambient: 0.85, torch: '#5affc8', hazards: ['gas', 'spikes', 'water'],
              props: ['pillar', 'idol', 'urn', 'mushroom', 'statue', 'rubble'],
              pattern: 'slab', fog: ['#6aa87a', 0.11], grade: ['#0a2818', '#040e06', 0.13], shaft: '#8ae8b0', amb: 'spore', water: '#1c4636', moss: '#3e7a4e' },
  hell:     { floor: '#38201c', floorAlt: '#301a16', wall: '#24100c', wallTop: '#4c2c24', ambient: 0.87, torch: '#ff4f2f', hazards: ['lava', 'spikes'],
              props: ['spike', 'bones', 'idol', 'skullpile', 'rubble'],
              pattern: 'cracked', fog: ['#a83428', 0.09], grade: ['#581408', '#1a0000', 0.16], shaft: '#ff8a50', amb: 'ash', water: null, moss: '#742818' },
};

// ---------- Elite affixes ----------
const ELITE_MODS = {
  fast:    { name: 'Swift',      spd: 1.5 },
  brutal:  { name: 'Brutal',     dmg: 1.6 },
  stone:   { name: 'Stoneskin',  hp: 1.5, armor: true },
  vamp:    { name: 'Vampiric',   leech: true },
  fireEn:  { name: 'Flamewreathed', elem: 'fire', nova: true },
  coldEn:  { name: 'Frostbound', elem: 'cold', nova: true },
  liteEn:  { name: 'Stormtouched', elem: 'lite', nova: true },
  poisEn:  { name: 'Plaguebearer', elem: 'pois', nova: true },
  multi:   { name: 'Multishot',  multi: true },
  warp:    { name: 'Warping',    warp: true },
};
const ELITE_NAME_A = ['Gore', 'Dread', 'Ash', 'Blight', 'Rot', 'Skull', 'Blood', 'Grim', 'Bile', 'Storm', 'Vile', 'Hate', 'Bone', 'Night', 'Fell'];
const ELITE_NAME_B = ['maw', 'fang', 'claw', 'gut', 'howl', 'wound', 'shard', 'hide', 'brand', 'spike', 'wing', 'eye', 'tongue', 'render', 'bane'];

// ---------- Items ----------
const TIER_LVLS = [1, 12, 24, 38, 52];
const WEAPON_TYPES = [
  { id: 'sword',    slot: 'weapon', spd: 1.00, names: ['Short Sword', 'Broadsword', 'War Sword', 'Rune Blade', 'Doom Edge'],       dmg: [[2, 5], [7, 14], [14, 27], [25, 46], [40, 70]] },
  { id: 'axe',      slot: 'weapon', spd: 0.85, names: ['Hatchet', 'Battle Axe', 'War Cleaver', 'Berserker Axe', 'Worldsplitter'],  dmg: [[3, 7], [9, 18], [17, 33], [30, 55], [48, 84]] },
  { id: 'mace',     slot: 'weapon', spd: 0.80, names: ['Cudgel', 'Flanged Mace', 'War Hammer', 'Doom Maul', 'Star of Ruin'],       dmg: [[3, 8], [10, 20], [19, 36], [33, 60], [52, 92]] },
  { id: 'dagger',   slot: 'weapon', spd: 1.40, critBonus: 6, names: ['Dirk', 'Stiletto', 'Kris', 'Night Fang', 'Heartseeker'],     dmg: [[1, 4], [5, 10], [10, 19], [18, 33], [29, 51]] },
  { id: 'spear',    slot: 'weapon', spd: 0.95, names: ['Javelin', 'Pike', 'War Spear', 'Storm Pike', 'Sky Impaler'],               dmg: [[2, 6], [8, 16], [16, 30], [28, 51], [45, 78]] },
  { id: 'claw',     slot: 'weapon', spd: 1.30, critBonus: 4, names: ['Katar', 'Wrist Blade', 'Battle Cestus', 'Shadow Claw', 'Godfist'], dmg: [[1, 5], [6, 11], [11, 21], [20, 36], [32, 56]] },
  { id: 'bow',      slot: 'weapon', spd: 1.10, ranged: true, names: ['Short Bow', 'Hunter\'s Bow', 'Composite Bow', 'Sky Bow', 'Windforce'], dmg: [[2, 5], [7, 14], [14, 26], [24, 45], [39, 68]] },
  { id: 'crossbow', slot: 'weapon', spd: 0.75, ranged: true, names: ['Light Crossbow', 'Arbalest', 'Siege Crossbow', 'Ballista', 'Hellrack'], dmg: [[4, 9], [11, 22], [21, 40], [36, 66], [57, 100]] },
  { id: 'wand',     slot: 'weapon', spd: 1.15, caster: 12, names: ['Bone Wand', 'Grim Wand', 'Grave Wand', 'Lich Wand', 'Deathspire'], dmg: [[1, 3], [4, 8], [8, 15], [14, 26], [23, 40]] },
  { id: 'staff',    slot: 'weapon', spd: 0.90, caster: 20, names: ['Gnarled Staff', 'Cedar Staff', 'Rune Staff', 'Archon Staff', 'Worldtree Rod'], dmg: [[2, 5], [6, 12], [12, 23], [21, 39], [34, 60]] },
];
const ARMOR_TYPES = [
  { id: 'helm',   slot: 'helm',   names: ['Cap', 'Full Helm', 'Casque', 'Winged Helm', 'Crown of Ages'],        armor: [4, 12, 24, 42, 66] },
  { id: 'chest',  slot: 'chest',  names: ['Quilted Armor', 'Chain Mail', 'Plate Mail', 'Archon Plate', 'Sacred Aegis'], armor: [8, 24, 48, 82, 130] },
  { id: 'gloves', slot: 'gloves', names: ['Leather Gloves', 'Chain Gauntlets', 'War Gauntlets', 'Ogre Gauntlets', 'Fists of Legend'], armor: [3, 9, 18, 31, 49] },
  { id: 'boots',  slot: 'boots',  names: ['Worn Boots', 'Chain Boots', 'Greaves', 'War Treads', 'Shadow Striders'], armor: [3, 9, 18, 31, 49] },
  { id: 'belt',   slot: 'belt',   names: ['Sash', 'Heavy Belt', 'Plated Belt', 'War Belt', 'Colossus Girdle'],   armor: [2, 7, 14, 25, 40] },
  { id: 'shield', slot: 'offhand',names: ['Buckler', 'Kite Shield', 'Tower Shield', 'Ward of the Ancients', 'Bulwark of Dawn'], armor: [6, 18, 36, 62, 98] },
  { id: 'orb',    slot: 'offhand',names: ['Glass Orb', 'Scrying Orb', 'Soul Orb', 'Void Sphere', 'Eye of Eternity'], armor: [2, 6, 12, 21, 33], caster: 14 },
];
const JEWELRY_TYPES = [
  { id: 'ring',   slot: 'ring',   names: ['Copper Ring', 'Silver Ring', 'Gold Ring', 'Rune Band', 'Sigil of Kings'], armor: [0, 0, 0, 0, 0] },
  { id: 'amulet', slot: 'amulet', names: ['Bone Charm', 'Silver Amulet', 'Jade Talisman', 'Occult Pendant', 'Star of the Deep'], armor: [0, 0, 0, 0, 0] },
];

// Affix pools: [key, statKey, isPct, name, slots, baseVal, perTier]
// slots: w=weapon, a=armor pieces, j=jewelry, s=shield/offhand
const PREFIXES = [
  ['fierce',   'dmgPct',   'Fierce',    'wj',  8, 7],
  ['cruel',    'dmgPct',   'Cruel',     'w',  20, 12],
  ['sharp',    'dmgFlat',  'Honed',     'w',   2, 3],
  ['blazing',  'fireDmg',  'Blazing',   'wj',  3, 4],
  ['freezing', 'coldDmg',  'Freezing',  'wj',  3, 4],
  ['charged',  'liteDmg',  'Charged',   'wj',  3, 5],
  ['venom',    'poisDmg',  'Venomous',  'wj',  3, 4],
  ['occult',   'arcDmg',   'Occult',    'wj',  3, 4],
  ['sturdy',   'armorPct', 'Sturdy',    'as', 12, 9],
  ['fortified','armor',    'Fortified', 'as',  6, 9],
  ['beastly',  'str',      'Bear\'s',   'waj', 3, 3],
  ['agile',    'dex',      'Falcon\'s', 'waj', 3, 3],
  ['hearty',   'vit',      'Titan\'s',  'waj', 3, 3],
  ['sage',     'ene',      'Sage\'s',   'waj', 3, 3],
  ['gilded',   'goldFind', 'Gilded',    'aj', 15, 12],
  ['seeker',   'mf',       'Seeker\'s', 'aj',  6, 5],
  ['vampiric', 'leechHp',  'Vampiric',  'wj',  2, 1.5],
  ['soulful',  'leechMp',  'Soulthirst','wj',  1.5, 1],
  ['swift',    'atkSpd',   'Swift',     'w',   6, 5],
  ['keen',     'critCh',   'Keen',      'wj',  3, 2.5],
  ['brutalp',  'critDmg',  'Merciless', 'wj', 10, 8],
  ['radiant',  'lightRad', 'Radiant',   'aj',  1, 0.5],
  ['arch',     'allSkills','Archon\'s', 'wj',  1, 0.34],
];
const SUFFIXES = [
  ['bear',    'hp',       'of the Bear',      'waj', 10, 12],
  ['fox',     'mp',       'of the Fox',       'waj',  8, 9],
  ['vigor',   'regenHp',  'of Vigor',         'aj',   1, 0.8],
  ['clarity', 'regenMp',  'of Clarity',       'aj',   0.8, 0.6],
  ['flamew',  'fireRes',  'of Flame Warding', 'asj',  8, 6],
  ['frostw',  'coldRes',  'of Frost Warding', 'asj',  8, 6],
  ['stormw',  'liteRes',  'of Storm Warding', 'asj',  8, 6],
  ['venomw',  'poisRes',  'of Venom Warding', 'asj',  8, 6],
  ['nullw',   'arcRes',   'of the Null',      'asj',  8, 6],
  ['rainbow', 'allRes',   'of the Rainbow',   'asj',  4, 3],
  ['thorns',  'thorns',   'of Thorns',        'as',   4, 5],
  ['alacrity','atkSpd',   'of Alacrity',      'wj',   5, 4],
  ['zephyr',  'moveSpd',  'of the Zephyr',    'a',    4, 3],   // boots-ish but allow armor
  ['precision','critCh',  'of Precision',     'wj',   2, 2],
  ['ruin',    'critDmg',  'of Devastation',   'wj',   8, 7],
  ['plenty',  'goldFind', 'of Plenty',        'aj',  12, 10],
  ['fortune', 'mf',       'of Fortune',       'aj',   5, 4],
  ['leech',   'leechHp',  'of the Leech',     'wj',   1.5, 1.2],
  ['ox',      'str',      'of the Ox',        'waj',  2, 3],
  ['cat',     'dex',      'of the Cat',       'waj',  2, 3],
  ['whale',   'vit',      'of the Whale',     'waj',  2, 3],
  ['owl',     'ene',      'of the Owl',       'waj',  2, 3],
  ['power',   'allSkills','of Power',         'j',    1, 0.34],
];

// ---------- Unique items ----------
// { name, type (base type id), tier, stats, flavor }
const UNIQUES = [
  { name: 'Widowmaker\'s Grief', type: 'sword', tier: 1, stats: { dmgPct: 60, leechHp: 5, critCh: 6 }, flavor: 'It has outlived every hand that held it.' },
  { name: 'The Pale Verdict', type: 'sword', tier: 3, stats: { dmgPct: 110, holyDmg: 25, critDmg: 40 }, flavor: 'Judgment, forged and sharpened.' },
  { name: 'Gutrender', type: 'axe', tier: 2, stats: { dmgPct: 90, atkSpd: 12, leechHp: 6 }, flavor: 'Subtlety was the first thing it cut away.' },
  { name: 'Worldsplitter\'s Echo', type: 'axe', tier: 4, stats: { dmgPct: 160, str: 25, critDmg: 60 }, flavor: 'The mountain still remembers the first swing.' },
  { name: 'Bonecrusher Litany', type: 'mace', tier: 2, stats: { dmgPct: 95, stunOnHit: 1, armor: 30 }, flavor: 'Each dent is a prayer answered.' },
  { name: 'Night\'s Whisper', type: 'dagger', tier: 2, stats: { dmgPct: 70, critCh: 12, atkSpd: 15, poisDmg: 12 }, flavor: 'The last sound is no sound at all.' },
  { name: 'The Long Goodbye', type: 'spear', tier: 3, stats: { dmgPct: 105, critDmg: 55, dex: 15 }, flavor: 'Reach out and touch someone. Once.' },
  { name: 'Talon of the Marsh King', type: 'claw', tier: 3, stats: { dmgPct: 85, poisDmg: 22, atkSpd: 18, leechHp: 4 }, flavor: 'The swamp keeps what it catches.' },
  { name: 'Windforce Reborn', type: 'bow', tier: 4, stats: { dmgPct: 140, atkSpd: 20, dex: 20, critCh: 8 }, flavor: 'The gale, given a grip and a grudge.' },
  { name: 'The Iron Chorus', type: 'crossbow', tier: 3, stats: { dmgPct: 120, critDmg: 50, liteDmg: 20 }, flavor: 'Every bolt sings the same short hymn.' },
  { name: 'Sceptre of Drowned Stars', type: 'wand', tier: 3, stats: { spellPct: 45, allSkills: 1, mp: 40, arcDmg: 15 }, flavor: 'It hums with light that fell a long way.' },
  { name: 'The Worldtree\'s Grief', type: 'staff', tier: 4, stats: { spellPct: 60, allSkills: 2, ene: 25, regenMp: 3 }, flavor: 'Cut from the tree that holds up the sky. It has not forgiven.' },
  { name: 'Crown of the Hollow King', type: 'helm', tier: 3, stats: { armorPct: 60, allSkills: 1, hp: 60, allRes: 10 }, flavor: 'Heavy is the head. Hollow is heavier.' },
  { name: 'Gaze of the Abyss', type: 'helm', tier: 4, stats: { armorPct: 50, mf: 30, critCh: 6, lightRad: 2 }, flavor: 'It looked back. You blinked first.' },
  { name: 'Shell of the First Turtle', type: 'chest', tier: 2, stats: { armorPct: 80, hp: 80, allRes: 12 }, flavor: 'Older than the ocean it crawled from.' },
  { name: 'Mantle of Burning Sorrow', type: 'chest', tier: 4, stats: { armorPct: 70, fireDmg: 25, thorns: 40, fireRes: 30 }, flavor: 'Grief, woven and set alight.' },
  { name: 'Fists of the Cave Bear', type: 'gloves', tier: 2, stats: { atkSpd: 15, str: 12, dmgPct: 25 }, flavor: 'The bear no longer needs them.' },
  { name: 'Threadwalkers', type: 'boots', tier: 3, stats: { moveSpd: 22, dex: 12, mf: 15 }, flavor: 'They only touch the world out of politeness.' },
  { name: 'Girdle of the Gorged', type: 'belt', tier: 2, stats: { hp: 70, vit: 12, goldFind: 40 }, flavor: 'It has never once been buckled to the last hole.' },
  { name: 'The Unanswered Door', type: 'shield', tier: 3, stats: { armorPct: 75, thorns: 35, allRes: 15 }, flavor: 'Ten thousand knocks. Not one reply.' },
  { name: 'Heart of the Frozen Sea', type: 'orb', tier: 3, stats: { spellPct: 40, coldDmg: 25, mp: 50 }, flavor: 'Still beating. Very slowly.' },
  { name: 'Band of the Last Debt', type: 'ring', tier: 2, stats: { leechHp: 4, leechMp: 3, hp: 30 }, flavor: 'Everything borrowed returns, with interest.' },
  { name: 'The Kingslayer\'s Oath', type: 'ring', tier: 4, stats: { dmgPct: 20, critCh: 6, allSkills: 1 }, flavor: 'Sworn once. Kept eleven times.' },
  { name: 'Tear of the Silent God', type: 'amulet', tier: 3, stats: { allSkills: 1, allRes: 15, regenHp: 2, regenMp: 1.5 }, flavor: 'He saw everything, and said nothing, and wept exactly once.' },
  { name: 'The Bleak Meridian', type: 'amulet', tier: 4, stats: { allSkills: 2, mf: 25, dmgPct: 15 }, flavor: 'All roads cross it. None return quite parallel.' },
];

// ---------- Class sets (4 pieces each, bonuses at 2/3/4) ----------
const SETS = [
  { id: 'set_war', cls: 'warbringer', name: 'Wrath of the Broken Mountain',
    pieces: [
      { name: 'Mountain\'s Fist', type: 'axe', tier: 3, stats: { dmgPct: 80, str: 15 } },
      { name: 'Mountain\'s Brow', type: 'helm', tier: 3, stats: { armorPct: 40, vit: 12 } },
      { name: 'Mountain\'s Heart', type: 'chest', tier: 3, stats: { armorPct: 55, hp: 60 } },
      { name: 'Mountain\'s Stride', type: 'boots', tier: 3, stats: { moveSpd: 15, str: 10 } }],
    bonuses: { 2: { hp: 60, str: 10 }, 3: { dmgPct: 40, leechHp: 5 }, 4: { dmgPct: 60, atkSpd: 20, allRes: 20 } } },
  { id: 'set_ele', cls: 'elementalist', name: 'Regalia of the Shattered Sky',
    pieces: [
      { name: 'Skyshard Rod', type: 'staff', tier: 3, stats: { spellPct: 40, allSkills: 1 } },
      { name: 'Skyshard Circlet', type: 'helm', tier: 3, stats: { armorPct: 30, ene: 15 } },
      { name: 'Skyshard Weave', type: 'chest', tier: 3, stats: { armorPct: 40, mp: 60 } },
      { name: 'Skyshard Loop', type: 'ring', tier: 3, stats: { fireDmg: 10, coldDmg: 10, liteDmg: 10 } }],
    bonuses: { 2: { mp: 50, ene: 12 }, 3: { spellPct: 30, regenMp: 2 }, 4: { spellPct: 50, allSkills: 2, allRes: 20 } } },
  { id: 'set_dth', cls: 'deathspeaker', name: 'Vestments of the Final Word',
    pieces: [
      { name: 'The Final Syllable', type: 'wand', tier: 3, stats: { spellPct: 35, allSkills: 1 } },
      { name: 'Hood of Last Rites', type: 'helm', tier: 3, stats: { armorPct: 30, minionDmg: 20 } },
      { name: 'Gravecloth Shroud', type: 'chest', tier: 3, stats: { armorPct: 40, hp: 50 } },
      { name: 'Mourner\'s Band', type: 'ring', tier: 3, stats: { arcDmg: 12, leechMp: 3 } }],
    bonuses: { 2: { minionHp: 30, hp: 40 }, 3: { minionDmg: 40, arcDmg: 15 }, 4: { minionDmg: 60, minionHp: 60, allSkills: 2 } } },
  { id: 'set_tmp', cls: 'templar', name: 'Panoply of the Dawn Eternal',
    pieces: [
      { name: 'Dawn\'s Rebuke', type: 'mace', tier: 3, stats: { dmgPct: 70, holyDmg: 18 } },
      { name: 'Dawn\'s Vigil', type: 'helm', tier: 3, stats: { armorPct: 40, allRes: 10 } },
      { name: 'Dawn\'s Bulwark', type: 'shield', tier: 3, stats: { armorPct: 60, thorns: 20 } },
      { name: 'Dawn\'s Embrace', type: 'chest', tier: 3, stats: { armorPct: 55, hp: 55 } }],
    bonuses: { 2: { armor: 60, holyDmg: 10 }, 3: { allRes: 15, regenHp: 2 }, 4: { dmgPct: 50, holyDmg: 30, armorPct: 40 } } },
  { id: 'set_wnd', cls: 'windrunner', name: 'Raiment of the Ninth Wind',
    pieces: [
      { name: 'Ninth Wind Longbow', type: 'bow', tier: 3, stats: { dmgPct: 75, atkSpd: 12 } },
      { name: 'Ninth Wind Coif', type: 'helm', tier: 3, stats: { armorPct: 30, dex: 15 } },
      { name: 'Ninth Wind Striders', type: 'boots', tier: 3, stats: { moveSpd: 18, dex: 10 } },
      { name: 'Ninth Wind Talisman', type: 'amulet', tier: 3, stats: { critCh: 6, mf: 15 } }],
    bonuses: { 2: { dex: 15, moveSpd: 10 }, 3: { critCh: 8, atkSpd: 15 }, 4: { dmgPct: 55, critDmg: 60, pierce: 2 } } },
  { id: 'set_ngt', cls: 'nightblade', name: 'Shadows of the Unsaid Name',
    pieces: [
      { name: 'The Unsaid Fang', type: 'dagger', tier: 3, stats: { dmgPct: 60, critCh: 8, poisDmg: 12 } },
      { name: 'Cowl of Hushed Steps', type: 'helm', tier: 3, stats: { armorPct: 30, critDmg: 25 } },
      { name: 'Wraps of the Third Hand', type: 'gloves', tier: 3, stats: { atkSpd: 15, dex: 12 } },
      { name: 'Whisperloop', type: 'ring', tier: 3, stats: { critCh: 5, leechHp: 3 } }],
    bonuses: { 2: { critCh: 6, dex: 12 }, 3: { poisDmg: 20, atkSpd: 12 }, 4: { critDmg: 80, dmgPct: 45, moveSpd: 15 } } },
  { id: 'set_wld', cls: 'wildkeeper', name: 'Heartwood of the First Forest',
    pieces: [
      { name: 'Heartwood Cleaver', type: 'axe', tier: 3, stats: { dmgPct: 70, minionDmg: 15 } },
      { name: 'Heartwood Crown', type: 'helm', tier: 3, stats: { armorPct: 35, minionHp: 20 } },
      { name: 'Heartwood Carapace', type: 'chest', tier: 3, stats: { armorPct: 50, regenHp: 2 } },
      { name: 'Heartwood Seed', type: 'amulet', tier: 3, stats: { allRes: 10, hp: 40 } }],
    bonuses: { 2: { hp: 50, regenHp: 1.5 }, 3: { minionDmg: 30, minionHp: 30 }, 4: { dmgPct: 45, minionDmg: 50, allRes: 20 } } },
];

// ---------- Shrines ----------
const SHRINE_TYPES = [
  { id: 'battle',   name: 'Shrine of Battle',    buff: { dmgPct: 40 },            dur: 60, msg: 'Your blows fall like hammers!' },
  { id: 'haste',    name: 'Shrine of Haste',     buff: { moveSpd: 30, atkSpd: 20 }, dur: 60, msg: 'The world slows around you!' },
  { id: 'fortune',  name: 'Shrine of Fortune',   buff: { mf: 60, goldFind: 80 },  dur: 90, msg: 'Fortune smiles upon you!' },
  { id: 'aegis',    name: 'Shrine of the Aegis', buff: { armor: 200, allRes: 30 }, dur: 60, msg: 'You are clad in unseen armor!' },
  { id: 'wisdom',   name: 'Shrine of Wisdom',    buff: { xpGain: 50 },            dur: 90, msg: 'Insight floods your mind!' },
  { id: 'mana',     name: 'Shrine of Springs',   buff: { regenMp: 6 },            dur: 60, msg: 'Power wells up inside you!' },
];

// ---------- NPCs ----------
const NPCS = [
  { id: 'healer',  name: 'Brother Aldric', role: 'Healer', pal: { skin: '#d9a878', cloth: '#8a7a5c', armor: '#6a5a44', hair: '#c8c8c8', trim: '#fff2c0' },
    lines: ['The Light keeps no ledger, friend. Be mended.', 'Even heroes bleed. Especially heroes, in my experience.', 'Rest. The dark will still be there when you wake.'] },
  { id: 'smith',   name: 'Korga Ironsong', role: 'Blacksmith', pal: { skin: '#b98d6e', cloth: '#5a3a26', armor: '#3c3c44', hair: '#26262e', trim: '#ff8a2f' },
    lines: ['Steel doesn\'t lie. People lie. Buy steel.', 'Bring me coin and I\'ll bring you thunder with a handle on it.', 'Everything\'s for sale. Except the anvil. Don\'t ask about the anvil.'] },
  { id: 'gambler', name: 'Peddler Vex', role: 'Gambler', pal: { skin: '#c99a6e', cloth: '#4a2a5a', armor: '#6a4a7a', hair: '#7a5a2e', trim: '#ffd94f' },
    lines: ['Mystery goods! Could be treasure! Could be trash! That\'s the poetry of it!', 'No refunds. The universe doesn\'t give refunds, why should I?', 'Feeling lucky? Of course you are. You\'re still alive, aren\'t you?'] },
  { id: 'stash',   name: 'Keeper Osric', role: 'Vault Keeper', pal: { skin: '#d9b88c', cloth: '#2a3a4a', armor: '#4a5a6a', hair: '#c8c8b0', trim: '#8fc8ff' },
    lines: ['Your goods are safe with me. Safer than you, frankly.', 'I guard treasure for heroes. The pay is bad but the stories are excellent.', 'The vault forgets nothing. Unlike its keeper.'] },
  { id: 'elder',   name: 'Old Maras', role: 'Village Elder', pal: { skin: '#c9a88c', cloth: '#3a3a2c', armor: '#5a5a44', hair: '#e8e2cf', trim: '#b0a880' },
    lines: [
      'They say the Abyss has no bottom. Someone should check. Someone expendable. No offense.',
      'Shrines in the deep places grant great boons. The catch? You have to be in the deep places.',
      'Elites carry the best plunder. The colored ones. Kill the colorful ones, dear.',
      'The Bishop was a good man once. Then he started listening to the walls.',
      'Season\'s ladder resets each quarter. Immortality is temporary. Like everything.',
      'Hard folk say the potions taste better in Hardcore. They only get to be wrong once.'] },
];

// ---------- Rival name generator data (for simulated ladder) ----------
const RIVAL_SYL_A = ['Kro', 'Vel', 'Mor', 'Thal', 'Ax', 'Bren', 'Syl', 'Dar', 'Fen', 'Gor', 'Hel', 'Isk', 'Jor', 'Kael', 'Lyr', 'Nyx', 'Ober', 'Pyr', 'Quin', 'Rag', 'Ser', 'Tor', 'Ulf', 'Vor', 'Wren', 'Xan', 'Yor', 'Zar', 'Ash', 'Bal'];
const RIVAL_SYL_B = ['ash', 'dor', 'gar', 'ien', 'ka', 'los', 'mir', 'nak', 'on', 'rik', 'sa', 'thas', 'uk', 'var', 'wyn', 'zor', 'eth', 'ius', 'ok', 'ran'];
const RIVAL_TAGS = ['', '', '', '', 'xX', 'Dark', 'The', 'Lord', 'Big', 'Lil', 'Sir', 'Mad'];

// ---------- Season config ----------
const SEASON = {
  epoch: Date.UTC(2026, 0, 6),        // Season 1 began Jan 6 2026
  lengthDays: 91,
  names: ['Season of Ash', 'Season of the Drowned Moon', 'Season of Broken Crowns', 'Season of the Pale Comet', 'Season of Hungering Dark', 'Season of the Second Sun'],
  current() {
    const days = Math.max(0, Math.floor((Date.now() - this.epoch) / 86400000));
    const idx = Math.floor(days / this.lengthDays);
    return { num: idx + 1, name: this.names[idx % this.names.length], day: days % this.lengthDays + 1, daysLeft: this.lengthDays - (days % this.lengthDays) };
  },
};

// ---------- Misc ----------
const RARE_NAME_A = ['Doom', 'Grim', 'Storm', 'Blood', 'Soul', 'Dread', 'Night', 'Ghoul', 'Bone', 'Ash', 'Viper', 'Raven', 'Wolf', 'Iron', 'Gale'];
const RARE_NAME_B = ['song', 'bite', 'ward', 'breaker', 'shroud', 'brand', 'call', 'grip', 'mark', 'thirst', 'coil', 'veil', 'edge', 'oath', 'howl'];

const XP_TABLE = (lvl) => Math.floor(100 * Math.pow(lvl, 2.1));
const MAX_LVL = 99;
