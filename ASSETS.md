# DIABLOID — Art & VFX Gap List

A survey of every prop, environment feature and effect currently in the game,
scored by how much a real model / texture / VFX would improve it. Written to
answer: *which slots would benefit from a dropped-in asset, and which are
missing art entirely?*

---

## 0. On the asset library

**The `fabclaude.com` API is unreachable from this environment.** All seven
documented endpoints fail at the network gateway, not in our code:

```
$ curl -sS https://fabclaude.com/api/models
curl: (56) CONNECT tunnel failed, response 403
```

The agent proxy reports the reason directly:

```json
{ "kind": "connect_rejected",
  "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  "host": "fabclaude.com:443" }
```

`toolScoped: false` in the proxy status means no tool has separate egress —
`WebFetch` and every HTTP client hit the same wall. Per `/root/.ccr/README.md`
this is a policy denial to report, not to work around, so I did not attempt to
tunnel around it.

**What that changes:** I could not read the library's catalogue, so I can't say
*"use model #4412 for the brazier."* What follows instead is the demand side —
the exact list of slots, with the shape and pixel budget each one needs — so
whoever can reach the API can match entries to it in one pass. If someone with
network access can whitelist `fabclaude.com` or drop a catalogue JSON into the
repo, mapping this list to real assets is an afternoon's work.

**Engine constraint that governs every entry below:** DIABLOID has no build step
and no external files. Every visual in the game today is either drawn with
Canvas 2D vector calls at runtime (props, the player figure) or baked once into
an offscreen sprite sheet at load (tiles, monsters). Any imported asset has to
arrive as one of:

| Format | Where it plugs in | Notes |
|---|---|---|
| Sprite sheet (PNG/data-URI) | `Sprites.bake*` | Best fit. Needs 8 facings for anything that turns. |
| SVG path data | `Render.drawProp` | Drop-in replacement for a `case` block. Keeps zero-dependency. |
| Tiling texture | `Sprites.getTiles` | Must be seamless at 64×32 dimetric. |
| Particle atlas | `G.parts` | Would need a UV-aware particle draw; currently circles only. |

Anything shipped as glTF/FBX is not usable without a 3D pipeline we don't have.

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
| **Doors / archways** | **Do not exist.** `TILE` is only `{WALL, FLOOR, EXIT, ENTRY}` (`js/dungeon.js:4`). Rooms open directly into corridors. | Door frame + door leaf props, open/closed states. Biggest single readability win — corridors currently blend into rooms. |
| **Stairs** | `EXIT`/`ENTRY` are flat floor tiles with a tint. | Descending stairwell model with a dark well; the "you are leaving" beat has no visual weight. |
| **Gas vent** | Declared in the cavern theme (`hazards: ['lava','vent']`) but `placeHazards` has no `vent` branch — it silently falls through to `HAZ.GAS` (`js/dungeon.js:355`). | Either a real vent prop + jet VFX, or drop `vent` from the theme. **This is a live content bug, not just an art gap.** |
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

The particle system (`js/render.js:361`) draws **coloured circles only** —
`ctx.arc()` with an optional `lighter` blend. Every effect in the game is built
from circles, lines and gradients. That's the single biggest lever here: a
textured-quad particle path plus a small atlas (smoke, spark, ember, shard,
rune, splash) would lift every one of the 210 skills at once.

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

1. **Doors + archways** — a missing feature, not a fidelity problem. Changes how every dungeon reads.
2. **Textured particle atlas + quad renderer** — one change, improves all 210 skills.
3. **Animated flame sprite sheets** — the spooky lighting mode makes every light source load-bearing.
4. **Boss models (5)** — highest per-asset impact on the parts players remember.
5. **Liquid shoreline transition tiles** — kills the hardest-edged artifact left in the tile layer.
6. **Prop destruction states** — smashables currently vanish; wrecks would sell the physics work.

## Known bug found during this survey

`vent` is listed in the cavern theme's hazard array but has no branch in
`Dungeon.placeHazards`, so it falls through the `else` and is placed as
ordinary gas (`js/dungeon.js:355-364`). The cavern therefore has two hazard
entries that produce identical results. Fix is either a real `vent` hazard or
removing the entry.
