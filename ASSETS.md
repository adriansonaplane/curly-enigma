# DIABLOID — Art & VFX Gap List

A survey of every prop, environment feature and effect currently in the game,
scored by how much a real model / texture / VFX would improve it, and mapped
onto the supplied catalogues.

---

## 0. Catalogue status — mapped, but nothing can be fetched yet

Two catalogues were supplied: **3,727 models** and **400 effects**.

**They are metadata only.** Every entry is `slug / name / description /
category / tags` — there is no geometry, no image data, and not a single URL
or file reference in either file (verified: zero fields matching
`https?://`, `data:`, `.glb`, `.gltf`, `.png`, `.svg`, `.fbx`, `base64`).

To turn a slug into art you have to fetch it, and **`fabclaude.com` is still
refused at the network gateway**:

```
curl: (56) CONNECT tunnel failed, response 403

{"kind":"connect_rejected","host":"fabclaude.com:443",
 "detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)"}
```

`toolScoped: false` means no tool has separate egress. So: **the mapping below
is real and usable, but no pixels can be imported until someone whitelists the
host or drops the actual asset files into the repo.**

That is exactly why `js/assets.js` exists — the mapping is baked in, and
`Assets.ingest(resolver)` fills every slot the moment a resolver can reach the
art. Nothing else has to change.

### What's in the catalogues

The models file is dominated by one project — **Ultima Online Classic (2,690
of 3,727 entries)** — which is the right genre. It carries ~120 `dungeon-*`
categories (`dungeon-necropolis`, `dungeon-tomb`, `dungeon-crypt`,
`dungeon-mausoleum`, `dungeon-ossuary`, `dungeon-inferno`…), plus
`basic-prop`, `door-portal`, `undead`, `bone`, `necromancer` and `mechanism`.
The remaining ~1,000 are Minecraft, seasonal, aquatic and modern-domestic sets
that are no use to us.

Effects break down as: energy 72, nature 67, particles 64, games 34, motion 27,
patterns 24, explosion 15, impact 13, weapon 12, aura 12, telegraph 12,
environment 12, ui 11, boss 11, emote 7, feedback 7.

### Engine constraint that governs every mapping

DIABLOID has no build step and no external files. Imported art has to arrive
as one of:

| Format | Where it plugs in | Notes |
|---|---|---|
| Sprite sheet (PNG/data-URI) | `Assets.register()` | Best fit. 8 facings for anything that turns. |
| SVG path data | `Assets.register()` after rasterising | Keeps zero-dependency. |
| Tiling texture | `Sprites.getTiles` | Must be seamless at 64×32 dimetric. |
| Particle atlas | `Sprites.getParticle` | Now supported — see §4. |

**glTF/FBX is not usable** without a 3D pipeline we do not have. The catalogue
descriptions ("fully procedural animation with gaits, blinks, dust and a
height-tracked shadow") strongly suggest these are live 3D scenes, so the
realistic ingest path is **rendered sprite sheets, not meshes** — 8 facings
baked off-line and shipped as PNG.

---

## 0b. The mapping — 77 slots, 73 with a candidate

Baked into `Assets.MANIFEST` (`js/assets.js`). Coverage is queryable at
runtime with `Assets.coverage()`.

### Structural (highest priority — these were missing features)

| Slot | Catalogue slug | Notes |
|---|---|---|
| `door_wood` | `wooden-door-uoc` | shipped as vector art this round |
| `door_barred` | `barred-dungeon-door-uoc` | shipped as vector art this round |
| `door_arch` | `pointed-archway` | also `stone-arch`, `archway` |
| `stairs` | `stone-flight-stairs` | also `spiral-staircase` |
| `trapdoor` | `trapdoor-uoc` | not yet used by the generator |

### Props

| Slot | Slug | Slot | Slug |
|---|---|---|---|
| `statue` | `titan-watcher-statue-uoc` | `pillar` | `runic-pillar-uoc` |
| `sarcophagus` | `imperial-sarcophagus-uoc` | `idol` | `obsidian-king-statue-uoc` |
| `fountain` | `blessed-font-uoc` | `bookshelf` | `bookcase` |
| `grave` | `tombstone` | `urn` | `cinerary-urn-uoc` |
| `skullpile` | `bone-heap-uoc` | `cobweb` | `cobweb-cluster-uoc` |
| `rubble` | `rubble-heap-uoc` | `rock` | `mossy-rock-uoc` |
| `crystal` | `quartz-cluster-uoc` | `stalagmite` | `cave-stalagmite-uoc` |
| `mushroom` | `glowspore-colony-uoc` | `orevein` | `ore-vein-uoc` |
| `lever` | `lever-uoc` | `brazier` | `storm-keeper-brazier-uoc` |
| `torch` | `wall-torch-sconce-uoc` | `candles` | `skull-sconce-uoc` |
| `lantern` | `patrol-lantern-uoc` | `anvil` | `inferno-anvil-uoc` |
| `cauldron` | `voodoo-cauldron-uoc` | `banner` | `battle-standard-uoc` |
| `weaponrack` | `weapon-rack` | `crate` | `crate-stack` |
| `sack` | `seed-sack-uoc` | `spike` | `spike-trap-floor-uoc` |
| `tree` | `autumn-spooky_tree` | `waypoint` | `teleporter-pad-uoc` |

**Weak matches** (mapped, but the fit is poor — flagged `fit: 'weak'`):
`chandelier` → `icicle-chandelier-uoc` (frost-themed), `bones` →
`bone-wind-chime-uoc`, `chest` → `crystal-chest-uoc`, `shrine` →
`ancestor-shrine-uoc`, `wellhead` → `water-pump-uoc`.

**No candidate at all** (4 slots — recorded with a reason rather than
force-fitted): `table` and `chair` (the catalogue's are all modern/domestic),
`pot` (cookware or planters), `barrel` (nearest is a brewery vat, wrong scale).

### Effects — 33 slots, all mapped

Highlights: `torch-3d`, `flame-3d`, `flamejet-3d`, `geothermalsteam-3d` and
`steamvent-3d` (the last two match the vent hazard added this round almost
exactly), `chain-lightning-3d`, `blast-3d`, `groundpound-3d`, `crescent-3d`,
`bloodsplat-3d`, `bloodpool-3d`, `poison-cloud-3d`, `frost-nova-3d`,
`falling-meteor-3d`, `meteorwarn-3d`, `aoemarker-3d`, `magic-circle-3d`,
`runes-3d`, `netherportal-3d`, `spawnportal-3d`, `buff-aura-3d`,
`regenaura-3d`, `shield-3d`, `lavaflow-3d`, `pondripple-3d`, `dustmotes-3d`,
`fogbank-3d`, `groundfog-3d`, `embersdrift-3d`, `bossdeath-3d`.

Notably the effects catalogue has a full **telegraph** set
(`aoemarker-3d`, `meteorwarn-3d`, `electriccharge-3d`, `groundslamwind-3d`,
`inhale-3d`, `poisonswell-3d`) — the game currently telegraphs almost nothing,
so this is the highest-value effects group after the core combat hits.

---

## 1. Props — currently vector-drawn, would benefit from real models

All 33 prop kinds are hand-drawn vector art in `js/render.js:1090` (`drawProp`).
They read fine in silhouette but have no surface detail, and at high zoom the
flat fills are the weakest thing on screen.

**Tier A — highest visual return.** Big, common, and often centre-frame:

| Prop | Themes | Today | What an asset buys |
|---|---|---|---|
| `pillar` | crypt, catacomb, fane | Tapered box + capital | Fluting, carved reliefs, broken variants. Tallest prop — dominates frame. |
| `sarcophagus` | crypt, catacomb | Slab + oval "face" | Effigy lid, engraved sides, cracked/open states. Signature D2 prop. |
| `statue` | crypt, fane | Blocky humanoid | Real sculpture silhouettes; currently the most obviously placeholder prop. |
| `idol` | fane, hell | Simple totem | Distinct per-theme deities; carries the fane/hell identity. |
| `chandelier` | crypt, fane, hell | Ring + candle dots | Hanging chain, wax runs, swaying animation. Big light source, always lit. |
| `fountain` | fane, town | Basin + water arc | Animated water, mossy stone, glowing rim. It's an *interactive fixture* — deserves the detail. |
| `bookshelf` | crypt, catacomb, fane | Rects with book spines | Real spines, sagging shelves, spilled-books searched-state. Interactive fixture. |

**Tier B — frequent set dressing.** Fine as-is, better with texture:

`crate`, `pot`, `urn`, `sack`, `barrel`, `table`, `chair`, `weaponrack`,
`anvil`, `cauldron`, `wellhead`, `banner`, `grave`, `skullpile`, `bones`,
`rubble`, `cobweb`, `candles`, `lantern`, `torch`, `brazier`, `brazier_unlit`,
`lever`, `orevein`, `rock`, `crystal`, `stalagmite`, `mushroom`, `spike`, `tree`

The smashables in this group (`crate`, `pot`, `urn`, `barrel`) also want a
**debris atlas** — `Physics.drawSmall` currently spawns coloured rectangles for
every material.

**Tier C — props with no destroyed/damaged state.** Smashables pop out of
existence at `hp <= 0` (`js/render.js:1091`). Each wants a wreck sprite:
`crate` → splintered planks, `pot`/`urn` → shard ring, `barrel` → staves +
spilled contents, `statue` → toppled torso.

---

## 2. Environment features with **no dedicated art at all**

These are placed by the generator and either reuse another prop's art or render
as an untextured tile. Highest-priority gaps in the whole list.

| Feature | Status | Needed |
|---|---|---|
| ~~**Doors / archways**~~ | **DONE this round.** `TILE.DOOR` marks every breach in a room's wall ring; stone jambs + lintel, with archway / plank / iron-grate leaves that swing open as you approach. Vector art for now — mapped to `wooden-door-uoc`, `barred-dungeon-door-uoc`, `pointed-archway` for when art lands. | — |
| **Stairs** | `EXIT`/`ENTRY` are flat floor tiles with a tint. | Descending stairwell model with a dark well; the "you are leaving" beat has no visual weight. |
| ~~**Gas vent**~~ | **FIXED this round.** `HAZ.VENT` is now its own hazard with a cycle — dormant, telegraphed build-up, scalding jet — rather than a silent alias for gas. Vector art + its own cycle-gated light. Maps to `geothermalsteam-3d` / `steamvent-3d` / `flamejet-3d`. | — |
| **Ceiling** | Nothing above wall-top height. | Vault ribs / beams for the crypt and fane; the spooky lighting pass makes the empty upper frame more noticeable. |
| **Wall variety** | One wall texture per theme, tinted. | Damaged, mossy, carved and alcove wall variants. |
| **Waypoint** | Drawn (`case 'waypoint'`) but very plain. | Rune-circle model + persistent portal VFX. Player sees it every run. |
| **Portal** | Simple ellipse. | Layered swirl, edge distortion, particle intake. |
| **Shrine** | Basic pedestal. | Per-boon variants (5 shrine types share one look). |
| **Chest** | One model, all rarities. | Rarity-tiered chests; loot quality is invisible until opened. |
| **Corpses** | Killed monsters fade out. | Persistent corpse/gib decals. Nothing records that a fight happened. |
| **Blood decals** | Particles only, no floor marks. | Splatter decal atlas, projected to floor. |
| **Footprint / scuff decals** | None. | Dust, water and blood trails. |

---

## 3. Hazards & liquids

Baked animated tiles (`js/render.js:233`). Functional, low fidelity.

| Hazard | Today | Wants |
|---|---|---|
| `lava` (`HAZ.LAVA`) | 2-frame scrolling tile + orange light | Flowing surface, crust cracks, rising heat shimmer, ember emitters at the shoreline |
| `water` (`HAZ.WATER`) | 2-frame tile + planar reflection | Normal-mapped ripple, shoreline foam, splash VFX on entry |
| `spikes` (`HAZ.SPIKES`) | Static tile | Retract/extend animation, blood-on-tip state |
| `gas` (`HAZ.GAS`) | Static green tile | Volumetric billow, not a flat tile — currently the weakest hazard |

No hazard has an **edge/transition tile**, so pools terminate on a hard tile
boundary. A 16-piece shoreline set per liquid would fix the sharpest remaining
artifact in the tile layer.

---

## 4. VFX gaps

~~The particle system draws **coloured circles only**.~~ **DONE this round.**
`Sprites.getParticle(shape, colour)` bakes seven masks — `dot`, `ember`,
`spark`, `smoke`, `shard`, `splash`, `rune` — with soft falloff, tinted on
demand and cached per shape+colour. Particles carry an optional `shape` and a
rotation/spin; anything that doesn't name one gets `dot`, the soft-edged
descendant of the old circle. Sparks are stars, blood is teardrops, gibs and
ash are shards, embers have hot cores, gas is a lumpy puff.

Still worth doing: route the remaining per-archetype effects through specific
shapes (`rune` is baked but unused — it's waiting on the summon/curse work
below), and drive them from real catalogue art via `Assets`.

**Per-archetype needs** — 15 skill archetypes (`js/sprites.js:780`), all with
icons, most with thin world VFX:

| Archetype | Has | Missing |
|---|---|---|
| `strike` | Arc swipe | Weapon trail mesh, impact spark burst |
| `slam` | Expanding ring | Ground crack decal, dust ring, screen shake |
| `proj` | Coloured circle | Projectile model per element, trail ribbon, impact burst |
| `nova` | Radial particles | Shockwave distortion ring |
| `beam` | Straight line | Core + bloom + crawling arcs; beams read as flat lines |
| `meteor` | Falling circle | Meteor model, fire trail, impact crater decal |
| `chain` | Polyline | Real branching arcs with per-jump flash |
| `storm` | Ellipse + bolts | Cloud volume above the field — currently invisible |
| `curse` | Ring | Persistent sigil under the cursed target |
| `trap` | Triangle | Armed/triggered states, tripwire glint |
| `summon` | Circle | Summoning-circle ground rune, arrival burst |
| `buff` / `heal` | Rising motes | Aura shells, sustained ground rune |
| `dash` | Line trails | Motion-blur ghosts of the actual figure |
| `passive` | — | Idle aura for always-on skills |

**Non-combat VFX gaps:**

- **Torch/brazier flame** is a static gradient blob. Real flame sprite sheets
  (4–8 frames) would matter more now than before — under the new spooky mood
  these *are* the light sources the player navigates by.
- **Elemental status** (burn, chill, shock, poison) has no on-body effect.
- **Level-up / item-drop beams** — legendary drops need a visible light column.
- **Weather** — no rain, no drips, no falling ash beyond the ambient field.
- **Ambient particles** are single-colour circles; 5 fields (`dust`, `ember`,
  `spore`, `ash`, `firefly`) all share one shape.

---

## 5. Characters

35 monster definitions + 5 bosses share **6 body archetypes** (`humanoid`,
`skeleton`, `brute`, `blob`, `spider`, `bat`, `serpent`, `ghost` — see
`js/sprites.js:51`), differentiated only by palette and scale. `Grove Bear`,
`Spirit Wolf` and `Raven` are palette-swapped spiders and bats.

| Slot | Gap |
|---|---|
| Monster bodies | Each of the 35 wants its own silhouette; at minimum the 5 bosses should not reuse a shared archetype |
| Bosses | 5 named bosses on generic bodies — these are the memorable fights and look like recoloured trash |
| NPCs | 5 town NPCs (`js/data.js:651`) share the player figure rig; each wants a distinctive silhouette |
| Player armour | Equipment renders as coloured plates on the skeleton; no per-tier models |
| Weapons | 12 weapon types are vector shapes (`js/sprites.js:829`); no per-rarity variants |
| Death | Monsters fade out; no death animations or ragdolls for non-physics kills |

---

## 6. 2D / UI assets

| Slot | Gap |
|---|---|
| Skill icons | 210 skills drawn from 15 archetype glyphs — within an archetype, icons are near-identical |
| Item icons | Procedural per slot type; no per-rarity or per-unique art |
| Buff/debuff icons | Generic coloured squares |
| Cursor | System cursor; no in-world targeting cursor |
| Minimap icons | Coloured dots for all entity types |
| Frame art | CSS gradients; no ornamental borders |

---

## Priority

If only a handful of assets can be sourced, in order:

~~1. Doors + archways~~ — **done this round.**
~~2. Textured particle atlas + quad renderer~~ — **done this round.**

Remaining, in order:

1. **Network access to `fabclaude.com`** — everything below is blocked on it. The mapping and the pipeline are ready; there are no pixels to put through them.
2. **Animated flame sprite sheets** (`torch-3d`, `flame-3d`) — the spooky lighting mode makes every light source load-bearing.
3. **Telegraph set** (`aoemarker-3d`, `meteorwarn-3d`, `electriccharge-3d`, `groundslamwind-3d`) — the game telegraphs almost nothing; this is the biggest fairness/readability gain left.
4. **Boss models (5)** — highest per-asset impact on the parts players remember. The `Ragdoll Monsters` set (49 entries) is the closest fit.
5. **Stairs** (`stone-flight-stairs`) — `EXIT`/`ENTRY` are still flat tinted floor tiles; the "you are leaving" beat has no visual weight.
6. **Liquid shoreline transition tiles** — kills the hardest-edged artifact left in the tile layer. No catalogue candidate; needs authoring.
7. **Prop destruction states** — smashables vanish at 0 HP; wrecks would sell the physics work. No catalogue candidate.

## Bugs found by this survey

| Bug | Status |
|---|---|
| `vent` declared by the cavern theme but silently placed as gas (`Dungeon.placeHazards` had no branch, so it fell through the `else`) | **Fixed.** Now a real `HAZ.VENT`; unrecognised hazard names place nothing instead of aliasing. |
| `ventPhase` used `%`, which keeps the sign of the dividend — a negative clock produced a negative phase that read as "jetting" and drove the jet envelope into negative canvas radii | **Fixed** (found by the new vent suite). |
| Rooms and corridors were visually indistinguishable | **Fixed** — see doors above. |
| The mood suite picked its measurement spot from generated geometry, so any change to the RNG stream silently moved it and starved the probe | **Fixed** — it now carves a controlled arena. |
