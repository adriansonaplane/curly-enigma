// ============ DIABLOID: assetpacks.js — curated per-act asset packs ============
'use strict';

// The catalogue holds 3,727 models and 400 effects. We want a few dozen, not
// all of them. This is the shortlist: everything picked here is thematically
// right for a specific act, so a pull is bounded and each act reads as its own
// place rather than a generic dungeon.
//
// `slot` is the game-side name (a prop kind, monster body, hazard or effect).
// `slug` is the catalogue entry to fetch. `add: true` marks content that did
// not exist in the game before these packs — new props, monsters and traps
// added to coincide with the art.
//
// Fetching happens through Assets.api (js/assets.js), which speaks the four
// documented endpoints. Nothing is fetched at load; ACT_PACKS is a plan.

const ACT_PACKS = {

  // ---------- Act I — The Weeping Parish (crypt) ----------
  // A buried church. Graves, reliquaries, restless dead, prison cells.
  crypt: {
    act: 0, name: 'The Weeping Parish',
    models: [
      { slot: 'catacomb_niche',  slug: 'catacomb-niche-uoc',        add: true },
      { slot: 'crypt_slab',      slug: 'crimson-crypt-slab-uoc',    add: true },
      { slot: 'effigy',          slug: 'sepulcher-effigy-uoc',      add: true },
      { slot: 'soul_cage',       slug: 'soul-cage-uoc',             add: true },
      { slot: 'reliquary',       slug: 'reliquary-shrine-uoc',      add: true },
      { slot: 'ghost_chains',    slug: 'ghost-in-chains-uoc',       add: true },
      { slot: 'haunted_mirror',  slug: 'haunted-mirror-uoc',        add: true },
      { slot: 'prison_cell',     slug: 'prison-cell-uoc',           add: true },
      { slot: 'corpse_shroud',   slug: 'corpse-shroud-uoc',         add: true },
      { slot: 'whipping_post',   slug: 'whipping-post-uoc',         add: true },
      { slot: 'grave_marker',    slug: 'grave-marker-small-uoc',    add: true },
      { slot: 'sarcophagus',     slug: 'imperial-sarcophagus-uoc' },
      { slot: 'grave',           slug: 'cursed-grave-uoc' },
      { slot: 'skullpile',       slug: 'bone-heap-uoc' },
      { slot: 'cobweb',          slug: 'cobweb-cluster-uoc' },
      { slot: 'door_wood',       slug: 'wooden-door-uoc' },
      { slot: 'door_barred',     slug: 'barred-dungeon-door-uoc' },
      // monsters
      { slot: 'mon_ghoul',       slug: 'ragm-ghoul',                add: true, kind: 'monster' },
      { slot: 'mon_skeleton',    slug: 'ragm-skeleton',             kind: 'monster' },
      { slot: 'mon_zombie',      slug: 'ragm-zombie',               kind: 'monster' },
      { slot: 'mon_wraith',      slug: 'ragm-wraith',               kind: 'monster' },
    ],
    effects: [
      { slot: 'fx_ghostwisp',    slug: 'soulflame-3d',              add: true },
      { slot: 'fx_torch',        slug: 'torch-3d' },
      { slot: 'fx_dust',         slug: 'dustmotes-3d' },
      { slot: 'fx_groundfog',    slug: 'groundfog-3d' },
    ],
  },

  // ---------- Act II — Catacombs of Ash (catacomb) ----------
  // Necromancers at work. Ritual circles, plague vats, spider nests.
  catacomb: {
    act: 1, name: 'Catacombs of Ash',
    models: [
      { slot: 'ritual_circle',   slug: 'ritual-circle-uoc',         add: true },
      { slot: 'embalming_slab',  slug: 'embalming-slab-uoc',        add: true },
      { slot: 'necronomicon',    slug: 'necronomicon-stand-uoc',    add: true },
      { slot: 'plague_vat',      slug: 'plague-vat-uoc',            add: true },
      { slot: 'phylactery',      slug: 'phylactery-uoc',            add: true },
      { slot: 'soul_gem',        slug: 'soul-gem-uoc',              add: true },
      { slot: 'spider_eggsac',   slug: 'spider-egg-sac-uoc',        add: true },
      { slot: 'cocoon',          slug: 'cocooned-victim-uoc',       add: true },
      { slot: 'haunted_doll',    slug: 'haunted-doll-uoc',          add: true },
      { slot: 'bloody_hand',     slug: 'bloody-handprint-uoc',      add: true },
      { slot: 'bandit_tent',     slug: 'bandit-tent-uoc',           add: true },
      { slot: 'urn',             slug: 'cinerary-urn-uoc' },
      { slot: 'bookshelf',       slug: 'bookcase' },
      { slot: 'anvil',           slug: 'inferno-anvil-uoc' },
      { slot: 'banner',          slug: 'battle-standard-uoc' },
      // monsters
      { slot: 'mon_necromancer', slug: 'ragm-necromancer',          add: true, kind: 'monster' },
      { slot: 'mon_ratman',      slug: 'ragm-ratman',               add: true, kind: 'monster' },
      { slot: 'mon_mummy',       slug: 'ragm-mummy',                add: true, kind: 'monster' },
      { slot: 'mon_skelmage',    slug: 'ragm-skeletal-mage',        kind: 'monster' },
    ],
    effects: [
      { slot: 'fx_ritual',       slug: 'magic-circle-3d',           add: true },
      { slot: 'fx_summon',       slug: 'spawnportal-3d' },
      { slot: 'fx_poison',       slug: 'poison-cloud-3d' },
      { slot: 'fx_runes',        slug: 'runes-3d' },
    ],
  },

  // ---------- Act III — The Molten Undercity (cavern) ----------
  // A dwarven mine that dug too deep. Smelters, lava falls, ogres.
  cavern: {
    act: 2, name: 'The Molten Undercity',
    models: [
      { slot: 'ore_smelter',     slug: 'ore-smelter-uoc',           add: true },
      { slot: 'foundry_crucible',slug: 'foundry-crucible-uoc',      add: true },
      { slot: 'lava_waterfall',  slug: 'lava-waterfall-uoc',        add: true },
      { slot: 'volcanic_vent',   slug: 'volcanic-vent-uoc',         add: true },
      { slot: 'stalactite',      slug: 'stalactite-cluster-uoc',    add: true },
      { slot: 'echo_crystal',    slug: 'echo-crystal-uoc',          add: true },
      { slot: 'amethyst_geode',  slug: 'amethyst-geode-uoc',        add: true },
      { slot: 'dwarven_rune',    slug: 'dwarven-runestone-uoc',     add: true },
      { slot: 'mining_beam',     slug: 'mining-support-beam-uoc',   add: true },
      { slot: 'dynamite',        slug: 'dynamite-bundle-uoc',       add: true },
      { slot: 'ogre_bonepile',   slug: 'ogre-bone-pile-uoc',        add: true },
      { slot: 'lava_bridge',     slug: 'lava-bridge-uoc',           add: true },
      { slot: 'orevein',         slug: 'ore-vein-uoc' },
      { slot: 'crystal',         slug: 'crystal-growth-uoc' },
      { slot: 'stalagmite',      slug: 'cave-stalagmite-uoc' },
      { slot: 'mushroom',        slug: 'glowspore-colony-uoc' },
      { slot: 'cauldron',        slug: 'voodoo-cauldron-uoc' },
      // monsters
      { slot: 'mon_troll',       slug: 'ragm-troll',                add: true, kind: 'monster' },
      { slot: 'mon_ogre',        slug: 'ragm-ogre',                 add: true, kind: 'monster' },
      { slot: 'mon_imp',         slug: 'ragm-volcanic-imp',         kind: 'monster' },
    ],
    effects: [
      { slot: 'fx_steamvent',    slug: 'geothermalsteam-3d' },
      { slot: 'fx_venttell',     slug: 'steamvent-3d' },
      { slot: 'fx_flamejet',     slug: 'flamejet-3d' },
      { slot: 'fx_lava',         slug: 'lavaflow-3d' },
      { slot: 'fx_ember',        slug: 'embersdrift-3d' },
      { slot: 'fx_explosion',    slug: 'blast-3d' },
    ],
  },

  // ---------- Act IV — The Drowned Fane (fane) ----------
  // A sunken temple gone to swamp. Naga, spores, poison bogs.
  fane: {
    act: 3, name: 'The Drowned Fane',
    models: [
      { slot: 'fen_idol',        slug: 'fen-shrine-idol-uoc',       add: true },
      { slot: 'naga_statue',     slug: 'naga-statue-uoc',           add: true },
      { slot: 'coral_pillar',    slug: 'coral-pillar-uoc',          add: true },
      { slot: 'sunken_bell',     slug: 'sunken-monastery-bell-uoc', add: true },
      { slot: 'marsh_grass',     slug: 'marsh-grass-cluster-uoc',   add: true },
      { slot: 'poison_pool',     slug: 'poison-bubble-pool-uoc',    add: true },
      { slot: 'poison_vine',     slug: 'poison-vine-cluster-uoc',   add: true },
      { slot: 'bog_skeleton',    slug: 'bog-skeleton-uoc',          add: true },
      { slot: 'spore_vent',      slug: 'spore-cloud-vent-uoc',      add: true },
      { slot: 'toxic_vent',      slug: 'toxic-fog-vent-uoc',        add: true },
      { slot: 'swamp_willow',    slug: 'swamp-willow-tree-uoc',     add: true },
      { slot: 'will_o_wisp',     slug: 'will-o-wisp-uoc',           add: true },
      { slot: 'fey_pool',        slug: 'fey-pool-uoc',              add: true },
      { slot: 'giant_clam',      slug: 'giant-clam-uoc',            add: true },
      { slot: 'sunken_wall',     slug: 'sunken-battlement-uoc',     add: true },
      { slot: 'fountain',        slug: 'elven-wellspring-uoc' },
      { slot: 'brazier',         slug: 'sunfire-brazier-uoc' },
      // monsters
      { slot: 'mon_lizardman',   slug: 'ragm-lizardman',            add: true, kind: 'monster' },
      { slot: 'mon_serpent',     slug: 'ragm-serpent',              kind: 'monster' },
    ],
    effects: [
      { slot: 'fx_spore',        slug: 'swampgas-3d',               add: true },
      { slot: 'fx_acid',         slug: 'acid-splash-3d',            add: true },
      { slot: 'fx_ripple',       slug: 'pondripple-3d' },
      { slot: 'fx_poison',       slug: 'poisonswell-3d' },
    ],
  },

  // ---------- Act V — The Burning Throne (hell) ----------
  // The other side. Sigils, rifts, titans, magma.
  hell: {
    act: 4, name: 'The Burning Throne',
    models: [
      { slot: 'demonic_sigil',   slug: 'demonic-sigil-ward-uoc',    add: true },
      { slot: 'fel_crystal',     slug: 'fel-crystal-shard-uoc',     add: true },
      { slot: 'void_rift_prop',  slug: 'void-rift-uoc',             add: true },
      { slot: 'scorched_wall',   slug: 'scorched-rampart-uoc',      add: true },
      { slot: 'titan_disc',      slug: 'titan-disc-uoc',            add: true },
      { slot: 'astral_obelisk',  slug: 'astral-obelisk-uoc',        add: true },
      { slot: 'twisted_tree',    slug: 'twisted-tree-uoc',          add: true },
      { slot: 'corrupted_stone', slug: 'corrupted-stone-uoc',       add: true },
      { slot: 'charred_bones',   slug: 'charred-bones-uoc',         add: true },
      { slot: 'dragon_nest',     slug: 'dragon-nest-uoc',           add: true },
      { slot: 'ember_geyser',    slug: 'ember-geyser-uoc',          add: true },
      { slot: 'eldritch_eye',    slug: 'cosmic-horror-eye-uoc',     add: true },
      { slot: 'scorched_weapons',slug: 'scorched-weapons-uoc',      add: true },
      { slot: 'statue',          slug: 'titan-watcher-statue-uoc' },
      { slot: 'pillar',          slug: 'runic-pillar-uoc' },
      { slot: 'idol',            slug: 'obsidian-king-statue-uoc' },
      { slot: 'brazier',         slug: 'storm-keeper-brazier-uoc' },
      { slot: 'anvil',           slug: 'inferno-anvil-uoc' },
      // monsters
      { slot: 'mon_magmagolem',  slug: 'magma-golem-uoc',           add: true, kind: 'monster' },
      { slot: 'mon_cyclops',     slug: 'ragm-cyclops',              add: true, kind: 'monster' },
      { slot: 'mon_ettin',       slug: 'ragm-ettin',                add: true, kind: 'monster' },
      { slot: 'mon_liche',       slug: 'ragm-lich-lord',            kind: 'monster' },
    ],
    effects: [
      { slot: 'fx_voidrift',     slug: 'void-rift-3d',              add: true },
      { slot: 'fx_meteor',       slug: 'falling-meteor-3d' },
      { slot: 'fx_meteorwarn',   slug: 'meteorwarn-3d' },
      { slot: 'fx_firetornado',  slug: 'fire-tornado-3d',           add: true },
      { slot: 'fx_bossdeath',    slug: 'bossdeath-3d' },
    ],
  },
};

// Traps and prop effects that drive the new hazards, kept separate because
// they are gameplay, not set dressing — each one is wired to something that
// can hurt you.
const TRAP_EFFECTS = [
  { slot: 'fx_venttell',   slug: 'steamvent-3d',       use: 'steam vent build-up (cavern)' },
  { slot: 'fx_flamejet',   slug: 'flamejet-3d',        use: 'steam vent jet (cavern)' },
  { slot: 'fx_spore',      slug: 'swampgas-3d',        use: 'spore vent cloud (fane)' },
  { slot: 'fx_emberjet',   slug: 'ember-geyser-uoc',   use: 'ember geyser (hell)', src: 'm' },
  { slot: 'fx_spiketell',  slug: 'electriccharge-3d',  use: 'spike trap arming tell' },
  { slot: 'fx_aoe',        slug: 'aoemarker-3d',       use: 'generic danger zone' },
  { slot: 'fx_explosion',  slug: 'blast-3d',           use: 'dynamite bundle (cavern)' },
  { slot: 'fx_ritual',     slug: 'magic-circle-3d',    use: 'ritual circle summon (catacomb)' },
];

// Flatten the packs into the slot->slug shape Assets.MANIFEST uses, so the
// registry can resolve anything a pack references without a second mapping.
function packManifest() {
  const out = Object.create(null);
  for (const theme in ACT_PACKS) {
    const p = ACT_PACKS[theme];
    for (const m of p.models)
      out[m.slot] = { slug: m.slug, src: m.src || 'm', theme, kind: m.kind || 'prop', added: !!m.add };
    for (const e of p.effects)
      out[e.slot] = { slug: e.slug, src: e.src || 'f', theme, kind: 'effect', added: !!e.add };
  }
  for (const t of TRAP_EFFECTS)
    if (!out[t.slot]) out[t.slot] = { slug: t.slug, src: t.src || 'f', kind: 'effect', use: t.use };
  return out;
}
