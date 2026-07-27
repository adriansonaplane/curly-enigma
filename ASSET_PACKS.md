# DIABLOID — Act Asset Packs

The standing pull list. The catalogue holds 3,727 models and 400 effects; this
is the few dozen we actually want, chosen per act so each one reads as its own
place instead of a generic dungeon.

Fetched through the four documented endpoints via `Assets.api`
(`js/assets.js`); the list itself lives in `js/assetpacks.js` and this file is
generated from it, so the two cannot drift.

```
GET /api/models/:slug           metadata + HTML source
GET /api/models/:slug/html      raw HTML document -> iframe
GET /api/effects/:slug          metadata + preview HTML
GET /api/effects/:slug/preview  raw animation HTML -> iframe
```

**These assets are HTML documents, not images** — there is no `.png` to point an
`<img>` at. The ingest path is therefore: fetch the document, load it in a
sandboxed offscreen iframe, let the animation settle, and capture a frame.
See `Assets.api.rasterise()`.

> **Status: nothing has been pulled.** `fabclaude.com` is refused at the network
> gateway — all four endpoints return HTTP 000 (403 at the CONNECT tunnel, so
> the connection is never established). Everything below is wired and waiting on
> `Assets.api.ingestPacks()`.

Entries marked **NEW** are content added to the game to coincide with the art —
props, monsters and traps that did not exist before.


## Act I — The Weeping Parish (`crypt`)

17 props · 4 monsters · 4 effects

| Slot | Catalogue slug | |
|---|---|---|
| `catacomb_niche` | `catacomb-niche-uoc` | **NEW** |
| `crypt_slab` | `crimson-crypt-slab-uoc` | **NEW** |
| `effigy` | `sepulcher-effigy-uoc` | **NEW** |
| `soul_cage` | `soul-cage-uoc` | **NEW** |
| `reliquary` | `reliquary-shrine-uoc` | **NEW** |
| `ghost_chains` | `ghost-in-chains-uoc` | **NEW** |
| `haunted_mirror` | `haunted-mirror-uoc` | **NEW** |
| `prison_cell` | `prison-cell-uoc` | **NEW** |
| `corpse_shroud` | `corpse-shroud-uoc` | **NEW** |
| `whipping_post` | `whipping-post-uoc` | **NEW** |
| `grave_marker` | `grave-marker-small-uoc` | **NEW** |
| `sarcophagus` | `imperial-sarcophagus-uoc` |  |
| `grave` | `cursed-grave-uoc` |  |
| `skullpile` | `bone-heap-uoc` |  |
| `cobweb` | `cobweb-cluster-uoc` |  |
| `door_wood` | `wooden-door-uoc` |  |
| `door_barred` | `barred-dungeon-door-uoc` |  |

**Monsters**

| Slot | Catalogue slug | |
|---|---|---|
| `mon_ghoul` | `ragm-ghoul` | **NEW** |
| `mon_skeleton` | `ragm-skeleton` |  |
| `mon_zombie` | `ragm-zombie` |  |
| `mon_wraith` | `ragm-wraith` |  |

**Effects**

| Slot | Catalogue slug | |
|---|---|---|
| `fx_ghostwisp` | `soulflame-3d` | **NEW** |
| `fx_torch` | `torch-3d` |  |
| `fx_dust` | `dustmotes-3d` |  |
| `fx_groundfog` | `groundfog-3d` |  |

## Act II — Catacombs of Ash (`catacomb`)

15 props · 4 monsters · 4 effects

| Slot | Catalogue slug | |
|---|---|---|
| `ritual_circle` | `ritual-circle-uoc` | **NEW** |
| `embalming_slab` | `embalming-slab-uoc` | **NEW** |
| `necronomicon` | `necronomicon-stand-uoc` | **NEW** |
| `plague_vat` | `plague-vat-uoc` | **NEW** |
| `phylactery` | `phylactery-uoc` | **NEW** |
| `soul_gem` | `soul-gem-uoc` | **NEW** |
| `spider_eggsac` | `spider-egg-sac-uoc` | **NEW** |
| `cocoon` | `cocooned-victim-uoc` | **NEW** |
| `haunted_doll` | `haunted-doll-uoc` | **NEW** |
| `bloody_hand` | `bloody-handprint-uoc` | **NEW** |
| `bandit_tent` | `bandit-tent-uoc` | **NEW** |
| `urn` | `cinerary-urn-uoc` |  |
| `bookshelf` | `bookcase` |  |
| `anvil` | `inferno-anvil-uoc` |  |
| `banner` | `battle-standard-uoc` |  |

**Monsters**

| Slot | Catalogue slug | |
|---|---|---|
| `mon_necromancer` | `ragm-necromancer` | **NEW** |
| `mon_ratman` | `ragm-ratman` | **NEW** |
| `mon_mummy` | `ragm-mummy` | **NEW** |
| `mon_skelmage` | `ragm-skeletal-mage` |  |

**Effects**

| Slot | Catalogue slug | |
|---|---|---|
| `fx_ritual` | `magic-circle-3d` | **NEW** |
| `fx_summon` | `spawnportal-3d` |  |
| `fx_poison` | `poison-cloud-3d` |  |
| `fx_runes` | `runes-3d` |  |

## Act III — The Molten Undercity (`cavern`)

17 props · 3 monsters · 6 effects

| Slot | Catalogue slug | |
|---|---|---|
| `ore_smelter` | `ore-smelter-uoc` | **NEW** |
| `foundry_crucible` | `foundry-crucible-uoc` | **NEW** |
| `lava_waterfall` | `lava-waterfall-uoc` | **NEW** |
| `volcanic_vent` | `volcanic-vent-uoc` | **NEW** |
| `stalactite` | `stalactite-cluster-uoc` | **NEW** |
| `echo_crystal` | `echo-crystal-uoc` | **NEW** |
| `amethyst_geode` | `amethyst-geode-uoc` | **NEW** |
| `dwarven_rune` | `dwarven-runestone-uoc` | **NEW** |
| `mining_beam` | `mining-support-beam-uoc` | **NEW** |
| `dynamite` | `dynamite-bundle-uoc` | **NEW** |
| `ogre_bonepile` | `ogre-bone-pile-uoc` | **NEW** |
| `lava_bridge` | `lava-bridge-uoc` | **NEW** |
| `orevein` | `ore-vein-uoc` |  |
| `crystal` | `crystal-growth-uoc` |  |
| `stalagmite` | `cave-stalagmite-uoc` |  |
| `mushroom` | `glowspore-colony-uoc` |  |
| `cauldron` | `voodoo-cauldron-uoc` |  |

**Monsters**

| Slot | Catalogue slug | |
|---|---|---|
| `mon_troll` | `ragm-troll` | **NEW** |
| `mon_ogre` | `ragm-ogre` | **NEW** |
| `mon_imp` | `ragm-volcanic-imp` |  |

**Effects**

| Slot | Catalogue slug | |
|---|---|---|
| `fx_steamvent` | `geothermalsteam-3d` |  |
| `fx_venttell` | `steamvent-3d` |  |
| `fx_flamejet` | `flamejet-3d` |  |
| `fx_lava` | `lavaflow-3d` |  |
| `fx_ember` | `embersdrift-3d` |  |
| `fx_explosion` | `blast-3d` |  |

## Act IV — The Drowned Fane (`fane`)

17 props · 2 monsters · 4 effects

| Slot | Catalogue slug | |
|---|---|---|
| `fen_idol` | `fen-shrine-idol-uoc` | **NEW** |
| `naga_statue` | `naga-statue-uoc` | **NEW** |
| `coral_pillar` | `coral-pillar-uoc` | **NEW** |
| `sunken_bell` | `sunken-monastery-bell-uoc` | **NEW** |
| `marsh_grass` | `marsh-grass-cluster-uoc` | **NEW** |
| `poison_pool` | `poison-bubble-pool-uoc` | **NEW** |
| `poison_vine` | `poison-vine-cluster-uoc` | **NEW** |
| `bog_skeleton` | `bog-skeleton-uoc` | **NEW** |
| `spore_vent` | `spore-cloud-vent-uoc` | **NEW** |
| `toxic_vent` | `toxic-fog-vent-uoc` | **NEW** |
| `swamp_willow` | `swamp-willow-tree-uoc` | **NEW** |
| `will_o_wisp` | `will-o-wisp-uoc` | **NEW** |
| `fey_pool` | `fey-pool-uoc` | **NEW** |
| `giant_clam` | `giant-clam-uoc` | **NEW** |
| `sunken_wall` | `sunken-battlement-uoc` | **NEW** |
| `fountain` | `elven-wellspring-uoc` |  |
| `brazier` | `sunfire-brazier-uoc` |  |

**Monsters**

| Slot | Catalogue slug | |
|---|---|---|
| `mon_lizardman` | `ragm-lizardman` | **NEW** |
| `mon_serpent` | `ragm-serpent` |  |

**Effects**

| Slot | Catalogue slug | |
|---|---|---|
| `fx_spore` | `swampgas-3d` | **NEW** |
| `fx_acid` | `acid-splash-3d` | **NEW** |
| `fx_ripple` | `pondripple-3d` |  |
| `fx_poison` | `poisonswell-3d` |  |

## Act V — The Burning Throne (`hell`)

18 props · 4 monsters · 5 effects

| Slot | Catalogue slug | |
|---|---|---|
| `demonic_sigil` | `demonic-sigil-ward-uoc` | **NEW** |
| `fel_crystal` | `fel-crystal-shard-uoc` | **NEW** |
| `void_rift_prop` | `void-rift-uoc` | **NEW** |
| `scorched_wall` | `scorched-rampart-uoc` | **NEW** |
| `titan_disc` | `titan-disc-uoc` | **NEW** |
| `astral_obelisk` | `astral-obelisk-uoc` | **NEW** |
| `twisted_tree` | `twisted-tree-uoc` | **NEW** |
| `corrupted_stone` | `corrupted-stone-uoc` | **NEW** |
| `charred_bones` | `charred-bones-uoc` | **NEW** |
| `dragon_nest` | `dragon-nest-uoc` | **NEW** |
| `ember_geyser` | `ember-geyser-uoc` | **NEW** |
| `eldritch_eye` | `cosmic-horror-eye-uoc` | **NEW** |
| `scorched_weapons` | `scorched-weapons-uoc` | **NEW** |
| `statue` | `titan-watcher-statue-uoc` |  |
| `pillar` | `runic-pillar-uoc` |  |
| `idol` | `obsidian-king-statue-uoc` |  |
| `brazier` | `storm-keeper-brazier-uoc` |  |
| `anvil` | `inferno-anvil-uoc` |  |

**Monsters**

| Slot | Catalogue slug | |
|---|---|---|
| `mon_magmagolem` | `magma-golem-uoc` | **NEW** |
| `mon_cyclops` | `ragm-cyclops` | **NEW** |
| `mon_ettin` | `ragm-ettin` | **NEW** |
| `mon_liche` | `ragm-lich-lord` |  |

**Effects**

| Slot | Catalogue slug | |
|---|---|---|
| `fx_voidrift` | `void-rift-3d` | **NEW** |
| `fx_meteor` | `falling-meteor-3d` |  |
| `fx_meteorwarn` | `meteorwarn-3d` |  |
| `fx_firetornado` | `fire-tornado-3d` | **NEW** |
| `fx_bossdeath` | `bossdeath-3d` |  |

## Trap & prop effects

Wired to something that can hurt you, so these are gameplay rather than set dressing.

| Slot | Slug | Drives |
|---|---|---|
| `fx_venttell` | `steamvent-3d` | steam vent build-up (cavern) |
| `fx_flamejet` | `flamejet-3d` | steam vent jet (cavern) |
| `fx_spore` | `swampgas-3d` | spore vent cloud (fane) |
| `fx_emberjet` | `ember-geyser-uoc` | ember geyser (hell) |
| `fx_spiketell` | `electriccharge-3d` | spike trap arming tell |
| `fx_aoe` | `aoemarker-3d` | generic danger zone |
| `fx_explosion` | `blast-3d` | dynamite bundle (cavern) |
| `fx_ritual` | `magic-circle-3d` | ritual circle summon (catacomb) |

## Totals

| | |
|---|---|
| Models across 5 acts | **101** |
| Effects across 5 acts | **23** |
| Trap/prop effects | **8** |
| Of which are NEW game content | **78** |
| Fraction of the 4,127-entry catalogue | **3.0%** |
