# Claude → Codex Handoff

DIABLOID — *Ashes of the Nephalem*. Browser ARPG, vanilla JS, no build step.
Open `index.html` from disk and it runs.

**Headline state:** the 2D isometric renderer has been replaced with three.js.
`js/render.js` is deleted. PR #10 carries the migration.

> Owner-supplied decisions and playtest results are recorded explicitly. Values
> that were not supplied remain marked "not reported" rather than inferred.

---

## 1. Current intent

DIABLOID is intended as a **visual demo**, not a portfolio piece, commercial
prototype, or systems sandbox. Fidelity and atmosphere therefore take priority
over content volume and balance.

The real-hardware smoke-test milestone has now been completed (§2). The next
concrete milestone is to decide and document the camera direction: retain the
isometric preset or retire it and make third-person the sole presentation of the
3D world. The owner's current preference is to move forward with the 3D world
and possibly remove the remaining isometric path, but this is not yet approval
to delete it. No camera-removal feature work should begin until that scope and
its save/settings compatibility requirements are confirmed.

## 2. Last known-good state

| | |
|---|---|
| Branch | `claude/diablo-2-clone-game-dzbw4a` |
| PR | #10 → `main` (open at handoff) |
| Last commit | `328d551` — torch toggle |
| Last **automated** verification | `328d551`, headless Chromium + swiftshader |
| Last **human** playtest | 2026-07-28, merge commit `cb9f811` |
| Browser | Firefox 153 |
| Operating system | Linux |
| Resolution / device pixel ratio | 2560×1440 / 1.25 |
| GPU | NVIDIA GeForce RTX 3060 |
| Profile / save state | Existing pre-PR-10 save (not a clean profile); loaded successfully |

### Human playtest results

The owner observed **96–155 FPS**. They confirmed that the reported
`155/155, 155/107, 107/96, 155, 96` measurements map, in order, to town, a
normal dungeon, a busy room, isometric mode, and third-person mode. The first
three are average/worst-observed pairs; the final two mode-specific figures are
single observations, not separate average/worst pairs. Do not infer unreported
values.

| Scene / mode | Average FPS | Worst-observed FPS |
|---|---:|---:|
| Town | 155 | 155 |
| Normal dungeon | 155 | 107 |
| Busy room (~40 monsters) | 107 | 96 |
| Isometric mode (scene not specified) | 155 | not reported |
| Third-person mode (scene not specified) | 96 | not reported |

- **Visual or input defects:** none reported. No screenshot or video was
  supplied because no defect was reported.
- **Save and reload:** appeared to work correctly with the pre-PR-10 save.
- **Portal, normal death, and hardcore death:** all appeared to work correctly.

The older automated verification remains useful supplementary evidence: it ran
in headless Chromium with software GL (swiftshader) at 1100×640 or 1440×860.
Treat its "zero errors, 230 draw calls" result as correctness evidence, not
real-hardware performance evidence. This Firefox/RTX 3060 session is the first
real-hardware performance evidence.

Saves are `localStorage`. The human test above is the first recorded check of a
pre-PR-10 save across the 3D migration.

## 3. Known issues

Ordered by my confidence that they are real.

| # | Issue | Repro | Expected vs actual | Pre/post 3D |
|---|---|---|---|---|
| 1 | **Draw calls 230–380 in a busy room** | Enter any depth-2+ dungeon with ~40 monsters | Expected: <150. Actual: 230 iso / 380 third-person | Post |
| 2 | **No fog, god rays, or colour grade** | Compare any dungeon to pre-migration screenshots | These layers existed in 2D and were not ported | Post |
| 3 | **No ambient particles** (dust, embers, fireflies) | Stand still in any act | Air is empty; `map.shafts` is generated and unused | Post |
| 4 | **Physics debris draws as a 2D overlay** | Smash a crate | Works, but chips don't occlude behind geometry | Post |
| 5 | **`runic-pillar` effect payload corrupt** | — | Owner said leave it | Pre |
| 6 | **17 catalogue monster models unwired** | — | All 45 use procedural rigs | Pre (asset gap) |

No playtest defect screenshots or video are attached because the owner reported
no visual or input defects. Older generated screenshots are in the session, not
the repo.

Things I explicitly could **not** check headless: audio, real frame pacing,
high-DPI scaling, alt-tab / context-loss recovery.

## 4. Priority order

My recommendation, not a decision:

1. **Camera direction** — decide whether to retire the isometric preset before
   doing more mode-specific work.
2. **Crashes / correctness** — nothing known from the first hardware smoke test.
3. **Performance** — the draw-call merge (§8 of the appendix) is the one
   high-value, well-understood optimisation left.
4. **Visual regressions** — fog / grade / ambient particles, in that order.
5. **New content** — last.

### Must not change without a deliberate decision

- **`FX3.PX = 1/32`.** Particle `z`/`size` are in the old renderer's pixels.
  Changing the conversion re-tunes the arc of every skill, hazard and death
  burst simultaneously.
- **`R3.screenBasis()` deriving from `yaw` in closed form.** Reverting it to
  `getWorldDirection()` reintroduces a shipped bug (see appendix §3).
- **The isometric preset.** Iso and third-person currently share one rig. The
  owner is considering removing iso in favour of the 3D-world direction, but
  deletion requires the explicit scope decision described in §1.
- **Dungeon sconces generating cold, in hallways.** This is a design decision the
  owner made explicitly, twice.
- **`vendor/three.min.js`** — pinned r128. The code uses r128-era APIs
  (`outputEncoding`, `sRGBEncoding`); r15x+ renamed them.

## 5. Claude context worth preserving

**Last successful prompt:** "The lights need to toggle, on/off." → `328d551`.

**Unfinished / never started:**
- Static-part mesh merging for actor rigs (identified, scoped, not begun).
- Wiring the 17 catalogue models over the procedural rigs.
- The owner still has ~97 models unpulled (`FORCE=1 ./tools/pull-models.sh`).
  May be moot if procedural rigs are kept.

**Architectural decisions explained but under-documented in code:**

- *Isometric as camera preset.* The 2D renderer baked the projection into a
  matrix, which is why "isometric" and "third person" were two code paths that
  disagreed. One rig, one set of maths, classic look as a preset.
- *Nameplates/damage/bubbles/minimap stay 2D.* They are genuinely screen-space.
  A nameplate wants crisp text at a fixed pixel size; billboarded quads fight the
  depth buffer. This split is why `renderer.js` is 350 lines and `render.js` was
  2,300.
- *Procedural rigs over waiting for art.* The catalogue mapped 17 models against
  45 monsters. Building 8 archetypes from primitives meant no part of the
  bestiary regressed to placeholders, and mapped models can be swapped in one at
  a time without touching the rigs.
- *Effect simulation moved, not rewritten.* `FX.*` and the integrator were never
  2D. They lived in `render.js` only because the drawing did. Deleting the
  renderer would have deleted the effects.
- *Instancing means state changes are transforms.* A prop part cannot be hidden
  individually, so "hidden" is scale-zero. Smashed props and unlit flames both
  use this.

**Tried and reverted / corrected mid-flight:**

- Auto-lighting sconces by proximity → replaced with a deliberate key on owner
  request → then made a toggle. Three iterations, all in git history.
- `screenBasis()` reading the camera matrix — produced a one-frame-stale basis,
  and the identity on first update. Replaced with closed form.
- A weapon carry angle as a per-weapon constant — clears the floor at rest,
  drives the blade through it mid-stride. Replaced with a per-frame solve
  against the live kinematic chain, fencing **both** ends of the weapon.
- A sanitizer pass that rewrote bare `top.` → `window.` corrupted 19 effect
  payloads (`top` is an ordinary local variable). Fixed to only rewrite explicit
  `window.top` forms. `runic-pillar` was not recoverable.

## 6. Manual smoke-test route

Completed by the owner on 2026-07-28 in Firefox 153 on Linux, at a 2560×1440
viewport and 1.25× device scaling on an RTX 3060, using merge commit `cb9f811`.
The observed range was 96–155 FPS. Keep this route for regression testing; each
step states the expected behaviour.

1. **Create a character** — class grid shows 7 classes; picking one and
   confirming lands you in Haven's Rest.
2. **Town** — warm braziers, trees, fountain, villagers with *bodies* (not just
   nameplates). Town is lit; this is intentional.
3. **Enter Act I** — dungeon is *dark*. You should see roughly a hero-sized pool
   of light and little else. Torch sconces are unlit and appear only in
   corridors.
4. **Press F next to a sconce** — prompt reads `Light [F]` in amber; pressing
   lights it with a whoomph. Prompt flips to `Snuff [F]` in grey; pressing again
   puts it out. Light and flame both go.
5. **Combat** — melee, then a projectile skill, then an AoE/nova, then a buff.
   Damage numbers rise, the damage meter accumulates, monsters have visible
   bodies with distinct silhouettes.
6. **Loot** — kill something, confirm a coloured bead drops with a rarity-tinted
   label. Pick up, equip, confirm the item appears **on the character model**
   (helm, shield, weapon are all visible fixtures).
7. **Drop / store an item**, then **save and reload** — appeared to work
   correctly with the pre-PR-10 save recorded in §2; keep checking it for
   regressions.
8. **Boss** — a boss should be larger (1.3×) with a wider health bar.
9. **Portal (T)**, **death**, and **hardcore death** if that mode is enabled —
   portal behavior, normal death, and hardcore death all appeared to work
   correctly in the owner's playtest.
10. **Camera (V)** — iso ↔ third person. Movement keys must stay correct in
    both; this is the bug that was just fixed, so it is worth re-checking.
11. **Settings** — toggle mood spooky/bright, quality high/low, shadows. Low
    quality drops the light budget 12 → 6.

## 7. Asset provenance and redistribution

- **Catalogue** (`assets/effects/`, `assets/models/`) came from **fabclaude.com**,
  supplied by the project's PD via API endpoints the owner pulled with
  `tools/pull-effects.sh` / `tools/pull-models.sh`. **That host is blocked at the
  network gateway from this environment** (403 on CONNECT) — the scripts are for
  the owner to run locally.
- **Provenance:** files under `assets/effects/` and `assets/models/` were fetched
  from **fabclaude.com** using the two scripts above. The project's PD supplied
  the catalogue/API source to the project owner. No further author, upstream
  source, or chain-of-title information has been documented.
- **License / redistribution:** unknown. No licence or terms granting the right
  to copy, modify, commit, or redistribute these payloads have been located.
  The **project owner** is responsible for obtaining and documenting the
  applicable licence and provenance. **Do not publicly distribute the repository,
  or any original or baked/derived file from `assets/effects/` or
  `assets/models/`, until the project owner confirms those rights.** Committing
  the payloads here is not evidence of permission.
- **`vendor/three.min.js`** — three.js r128, **MIT**, from the npm registry.
  License text is included alongside it. This one is unambiguous.
- **Authoritative artifacts:** the JSON payloads in `assets/*/` are the source of
  truth. Everything under `assets/*/baked/` is *derived* and regenerable via
  `tools/bake-*.js`. They are committed so the game runs from `file://` with no
  build step — that is the reason, not an accident.
- **Payloads have been sanitised in place** (`tools/sanitize-payloads.js`): a
  cdnjs three.js `<script src>` and a `window.parent.postMessage` debug channel
  were defanged. Originals are re-fetchable with `FORCE=1`. `tools/audit-assets.js`
  gates this — it reports 0 blocking issues and no external hosts. Re-run it if
  you pull more assets.

---

# Appendix — technical notes

## A1. Load order is the dependency graph

No module system; `index.html` script order **is** the build. Globals are
`const`, so a top-level reference to another module's global throws; references
inside functions are fine.

```
util → audio → baked/index.js → assetpacks → assets → data → sprites
     → dungeon → items → entities
     → three.min.js → render3d → world3d → actors3d → props3d → fx3d → renderer
     → camera → physics → figure → target → ui → wui → social → main
```

`figure.js` loads *after* `actors3d.js` deliberately — `Hero3.prop()` reads
`Figure.P` lazily.

## A2. Three coordinate systems are live at once

| System | Unit | Where |
|---|---|---|
| Game world | 1 tile | `G.player.x/y`, monsters, props, lights |
| 3D world | 1 tile = 1 unit, **game `y` → world `z`**, `+Y` up | `R3.scene` |
| Legacy pixels | 32 px = 1 tile | `G.parts[].z/.size`, `G.dmgNums[].z` |

`FX3.PX = 1/32` converts on read. `Render.worldToScreen(x, y, z)` still takes
`z` in pixels so `physics.js` and `target.js` needed no changes.

## A3. Camera: iso is a preset, not a projection

`MODE_ISO` = orthographic, yaw pinned to π/4. `MODE_FREE` = perspective, orbits.

**`Cam.yaw` is not the camera's yaw in iso mode** — `renderer.js` only pushes it
into `R3.yaw` in FREE mode. Movement input rotated by `Cam.yaw` while the picture
used `R3.yaw` is exactly how "press left, walk south" happened. Use
`R3.screenBasis()`.

Ortho gotchas that cost real time:
- **Point sprites.** `size / -viewZ` is a *perspective* correction; under ortho
  it shrinks every particle to sub-pixel. See the `ortho` uniform in `fx3d.js`.
- **Readback.** No `preserveDrawingBuffer`, so `drawImage(canvas)` in a test
  returns black. Measurement artifact, not a black screen — shim the constructor.

## A4. Instancing constrains props

One `InstancedMesh` per (kind, part). A part cannot be hidden individually —
**scale it to zero**. `Props3.refresh(prop)` rewrites one instance after you
mutate `prop.lit` / `prop.smashed`.

New prop kind ⇒ add to `Props3.KIND`, or it silently becomes a rubble pile.
There is a probe assertion for this; keep it.

## A5. Emissive values are relative

`Props3.EMIT = 0.45` scales every emissive in the tables. sRGB output encoding
lifts midtones so hard that emissive ≈1.0 clips to white — every glowing prop
became the same pale blob. Change `EMIT`, not the tables.

## A6. Lighting model

- Dungeon fire (torch, candles, lantern, chandelier) generates **cold** and only
  in **hallways** — a corridor is a floor tile inside no room (`Dungeon.inRoom`).
- Crystals / fungus / ore keep a faint glow: not things you strike a flint on.
- **F** toggles. `Dungeon.nearestSconce()` is **state-blind on purpose** —
  skipping lit ones is what made it one-way.
- `World3.updateLights()` runs a nearest-N budget (12 high / 6 low). A cold
  sconce sorts to `Infinity`, not just zero intensity, or standing next to an
  unlit torch spends a slot on darkness.
- Town lights default lit (`lit` undefined ≠ `false`).

## A7. Monster identity

A spawned monster files its species under **`m.fam`** and carries **`m.def`**.
`m.kind` is only for summoned traps. This cost a full round — every monster
rendered as nothing, and the probe agreed with the bug because it built its own
stand-in monsters. **Probes now spawn through `Ent.makeMonster`.** Keep them
going through the real factory.

## A8. The draw-call optimisation, scoped

Each actor rig is 4–12 meshes because limbs animate. But most parts *don't*
move — torso, head, ribs, eyes. Merging the static parts of each archetype into
one geometry at build time, leaving only the animated joints separate, should
roughly halve the count. Highest-value work remaining.

`Actors3.VIEW = 30` (Manhattan) gates which monsters get bodies at all. Correct
but loose; a real frustum test would cull more.

## A9. Testing

No test runner. Verification is Playwright probes driving the real page in
headless Chromium (`--use-gl=swiftshader`). Two lessons paid for in bugs:

- **Assert on the mechanism, not a magic number.** A composed instance scale is
  prop-scale × part-scale; `> 0.5` fails for a legitimately small part. Assert
  "was exactly 0, is now non-zero".
- **A test that cannot fail is worse than none.** Early probes passed against
  broken code because they measured the wrong thing — screen corners black in
  both moods; hand-built monsters that dodged the `fam`/`kind` mismatch. Break
  the code on purpose and confirm the test goes red.

Software GL is slow; a 1440×860 viewport with 40 monsters can exceed Playwright's
default screenshot timeout. Use ~1100×640 and raise it.

## A10. Egress

`fabclaude.com` is blocked at the gateway (403 on CONNECT) for curl, WebFetch and
headless Chromium alike. The npm registry is **not** blocked — that is how
three.js r128 was vendored. Do not disable TLS verification or unset
`HTTPS_PROXY` to work around a 403; report the blocked host instead.

---

*Written by Claude at handoff. Codex's scan notes were not received in time to be
merged — add them as a new section rather than editing this one, so the two views
stay distinguishable.*
