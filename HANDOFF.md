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

The camera decision is complete: **remove orthographic isometric, retain two
perspective presets**. `elevated` preserves the fixed, readable overview without
parallel projection; `third` remains the freely orbitable close view. This was
chosen over retaining orthographic mode because particles, occlusion and scale
now have one projection contract, and over third-person-only because the fixed
overview remains important for dungeon and edge-of-screen combat readability.
Both presets use the same Three.js camera, world pass, picking, and closed-form
`R3.screenBasis()` movement basis. Do not add mode-specific world renderers.

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

1. **Camera validation** — keep the two perspective presets on the smoke route
   and do not restore an orthographic rendering path.
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
- **The single perspective rendering path.** Elevated and third-person are
  presets on one rig; orthographic is intentionally retired.
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

- *Elevated perspective as camera preset.* The fixed overview and freely
  orbitable third-person view share one perspective rig and one set of maths.
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
7. **Drop / store an item**, then **save and reload**. Before loading, also set
   `localStorage.cam_v1` to an old payload with `mode: "iso"`; it must load the
   elevated preset cleanly while retaining compatible third-person preferences.
8. **Boss** — a boss should be larger (1.3×) with a wider health bar.
9. **Portal (T)**, **death**, and **hardcore death** if that mode is enabled.
10. **Camera (V)** — elevated ↔ third person. In *each* preset, walk all four
    screen directions; target and place projectile/AoE skills near every screen
    edge; pass behind walls and confirm occlusion fading; inspect particles and
    equipped helm/shield/weapon; and traverse a dense dungeon room to confirm
    the layout remains readable. In third person, repeat after orbiting with
    `[`, `]`, and middle-drag. Movement must remain camera-relative throughout.
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

## A3. Camera: two presets, one perspective path

`MODE_ELEVATED` pins yaw to π/4 and uses a high perspective view.
`MODE_FREE` is perspective and orbits. Both render through `R3.perspCam`; camera
mode may select rig values but must never select a different world renderer.
Movement reads `R3.screenBasis()` directly, so its axes always match the yaw
used to draw the scene. Legacy `cam_v1` values with `mode: "iso"` migrate to
`elevated`; legacy orthographic pitch is deliberately not copied.

**Readback note.** There is no `preserveDrawingBuffer`, so `drawImage(canvas)`
in a test returns black. This is a measurement artifact, not a black screen;
shim the constructor when a test needs readback.

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

---

# Codex + owner update — 2026-07-28

This section is append-only follow-up context. It supersedes only the facts called
out below; the original Claude handoff above remains the historical record of the
state at PR #10.

## U1. Current hardware baseline

The owner completed a real-hardware pass in Firefox 153 on Linux, using an NVIDIA
GeForce RTX 3060 at 2560×1440 and 1.25× device scaling. The profile contained a
pre-migration save. Save/reload, portals, normal death and hardcore death appeared
to behave correctly.

After the camera work, the owner reported these average / worst-observed frame
rates:

| Camera preset | Average FPS | Worst-observed FPS |
|---|---:|---:|
| Isometric (historical baseline) | 155 | 96 |
| Third person | 155 | 112 |
| Elevated perspective | 145 | 112 |

These results replace the ambiguous mode-specific interpretation in §2 lines
46–59. They are the first real-GPU performance evidence, but remain a single
machine and should not be treated as a minimum hardware specification. The older
SwiftShader probes remain correctness evidence rather than performance evidence.

## U2. Direction confirmed

Development is proceeding with the current Three.js world. Orthographic isometric
has been replaced by elevated perspective; elevated and third-person remain
presets on the same perspective renderer. Intentional screen-space UI and overlays
remain 2D.

The agreed development order is:

1. Restore the missing atmosphere.
2. Establish a safe authored-model pipeline and replace procedural models where
   the authored result is a genuine improvement.
3. Reduce actor draw calls by merging each archetype's static primitive geometry;
   keep animated joints separate.
4. Re-measure on real hardware, then continue through the remaining priorities.

SDF blending was discussed as a possible interpretation of the optimisation, but
it is not the selected production approach. Static `BufferGeometry` merging is
the direct solution to the existing per-mesh draw calls. SDF actors may be tested
later as an isolated visual experiment only if they offer a measurable advantage.

## U3. Work completed since the original handoff

The following work is now merged and supersedes the corresponding open items in
§3, §4, §5 and Appendix A8:

- **Browser probes:** PR #13 added reproducible Playwright smoke probes for the
  Three.js migration.
- **Rendering cleanup:** PR #15 audited dependencies and removed dead 2D world
  rendering paths while retaining intentional screen-space overlays.
- **Camera:** PR #16 replaced orthographic isometric with the fixed elevated
  perspective preset on the shared perspective rig.
- **Atmosphere:** PR #17 restored theme-aware fog, colour grading/vignette, god
  rays and ambient particle fields. Existing settings and quality controls drive
  these effects.
- **Model format:** PR #18 added a deterministic compiler for catalogue model
  payloads and documented the compiled runtime contract.
- **Monster models:** PR #19 added an authored monster-model provider with the
  procedural rigs retained as fallbacks.
- **Prop models:** PR #20 added authored prop templates through the existing
  instanced prop path.
- **Actor draw calls:** PR #21 merged static actor-archetype parts by material
  while leaving animation-driven parts separate. This is the optimisation that
  Appendix A8 previously described as not begun.

The next pass should validate the combined result visually and capture updated
draw-call and FPS measurements before broadening model coverage or attempting a
new rendering technique.

## U4. Improving future handoffs

Do not repeatedly rewrite the original narrative as the project advances. That
makes old measurements look current and loses the reasoning attached to earlier
decisions. Use this structure instead:

1. Keep the original handoff as a dated baseline.
2. Append short, dated update sections containing only changed facts, decisions,
   completed work, new risks and the next verification target.
3. Link every completed item to its PR or commit and record the exact revision
   used for manual measurements.
4. Keep correctness evidence, software-rendered measurements and real-GPU
   performance evidence explicitly separate.
5. Mark superseded statements rather than silently deleting them.
6. Record measured before/after values; do not describe an optimisation as
   successful from implementation alone.

If updates become frequent, add a separate `TASK_LOG.md` rather than allowing this
document to become a chronological dump. Use one entry per task with:

- date, task title, PR and merge commit;
- intent and non-goals;
- files or subsystems changed;
- verification commands and environment;
- before/after measurements;
- known regressions or unverified behavior;
- the next concrete task.

Periodically summarize stable conclusions from that log into a new dated handoff
section. Keep detailed execution history in the task log and reserve this file for
the information a successor needs to make the next correct decision.

## U5. 2026-07-28 — full catalogue compilation unblocked

The project owner has now run `node tools/compile-models.js` against the complete
local catalogue and confirmed that **all 99 of 99 models compile**, including the
15 `ragm-*` actors that previously failed with `window.MODEL: absent`. This is
manual evidence from the full asset pack; the repository checkout used by the
automation environment contains only the three-model sample pack.

The failure was not a broken `window.MODEL`. The RAGM payload family keeps its
model root in closure-local state, so neither the documented `window.MODEL.root`
contract nor a search of likely global names can reach it. The compiler now
observes objects passed to `THREE.Object3D.prototype.add` while each payload is
building its scene. Global roots remain preferred. When none is published, it
selects the largest observed subtree that contains meshes but no camera or light;
this recovers the closure-local actor group while rejecting the complete preview
scene and its ground plane. Failed discovery also reports the number of observed
Object3D additions, which distinguishes a payload that constructed nothing from
one whose scene shape is still unsupported.

The successful 99/99 compile establishes model-root discovery, not final visual
correctness. The next owner should run `node tools/validate-models.js`, inspect
the generated RAGM scenes in-game (especially pivots, scale, materials and shadow
decals), and only then treat the full compiled pack as shippable.

## U6. 2026-07-29 — Authored monster models wired; corrections to §3

Branch `claude/diablo-2-clone-game-dzbw4a`, commits `5562b58` and `b87713b`,
based on `fedc868`. Execution detail is in `TASK_LOG.md`; this section records
only what a successor needs in order to decide the next thing.

### Corrections to the original handoff

These supersede the corresponding rows and lines above. The originals are left
in place as the record of what was believed at PR #10.

- **§3 #2 (no fog / god rays / colour grade) and §3 #3 (no ambient particles)
  are resolved** by PR #17 and should be read as closed. §U3 says so; the §3
  table was not updated and still reads as open.
- **§3 #5 is half wrong.** `runic-pillar`'s *model* payload
  (`assets/models/runic-pillar-uoc.json`) is intact: its inline script parses,
  it compiles to 58 meshes, and it validates. Only the standalone `.html`
  sidecar is mangled, and the compiler never reads it — it reads `.json` →
  `meta.html`. The corrupt payload the owner said to leave alone is the
  **effect**, not the model. As previously written, this row invites someone to
  delete a working asset.
- **§3 #6 is out of date.** The count is not 17. Fifteen `ragm-*` monster
  models are compiled, of which fourteen were unwired until `b87713b`.
- **§3 #1 (230–380 draw calls) is stale and should not be quoted.** It predates
  PR #15 (dead 2D paths removed), PR #17 (atmosphere added, which costs draws)
  and PR #21 (static actor merge, which saves them). The net direction is
  unknown. It is also the number priority #3 rests on. Re-measure before
  planning against it.
- **§2's last-known-good block is stale.** PR #10 is merged; `main` is at
  `fedc868`. §5's "~97 models unpulled" is done — all 99 are pulled and compile.

### What was found and fixed

`MODEL_MAP` mapped four species and three of the four named slugs the catalogue
does not contain, so exactly one species resolved and fourteen compiled models
drove nothing. The reason it went unnoticed for three PRs is worth keeping:
`requestModel`'s rejection landed in an empty `.catch()`, which made a missing
model indistinguishable from a species that was never mapped. Misses are now
recorded and surfaced in `Actors3.stats().modelMisses`.

Fourteen species are now mapped. Authored models merge by material — every
authored model is `animation: 'rigid'`, so *all* of its parts are static and it
collapses to one draw per material. Without that, wiring them would have traded
PR #21's merged rigs for 13–27 loose meshes per monster and made draw calls
worse on precisely the species the merge was meant to make cheaper.

Three further defects were fixed on the same path: the runtime rebuilt six of
the thirteen geometry types the compiler may emit (the rest threw at load, into
the same silent catch); `instanceModel` dropped the 1.3× boss multiplier that
`build()` applies; and the authored animation branch ignored `def.fly`, so a
wraith would have swapped to its model and settled onto the floor.

### New tools

- **`tools/inspect-models.js`** — measures where a compiled model actually
  stands: bounds, gap from y=0, footprint offset from the origin, distinct
  rotation count. Flags `FLOATING`/`SUNKEN`, `OFF-CENTRE`, `SIZE` and
  `FROZEN-ROT`. This exists because `compile-models.js` bakes each mesh from
  `matrixWorld` — absolute scene space — so for the fifteen models whose root
  was *recovered* rather than published, any transform on the preview rig's
  ancestors is baked in permanently and every other check still passes. Exit
  code is always 0; it produces a shortlist for a human, not a gate.
- **`tests/node/model-contract.js`** (`npm run test:models`) — checks the
  compiler's geometry allowlist against the runtime's table, and every compiled
  model against a reference build of one mesh per primitive. No DOM, no GPU.

### Unverified — read before trusting the wiring

- **No `ragm-*` model has ever been rendered.** This checkout carries a
  three-model sample pack, all props. The `height` values in `MODEL_MAP` are
  estimates derived from each family's `def.size`, not measurements.
- Whether the fourteen recovered roots are correctly placed, scaled and
  oriented is **unmeasured**. That is what `inspect-models.js` is for and it
  needs the full pack.
- The merge is verified on three prop models (58→40, 36→24, 28→6 draws;
  vertices preserved exactly), not on any actor.
- All 16 browser probes pass, but they exercise the *procedural* path, since no
  authored model resolves in this checkout. They prove no regression, not that
  the authored path renders correctly.

### Next verification target

On the full 99-model pack, in this order:

1. `node tools/audit-assets.js assets/models` — the fifteen `ragm-*` payloads
   have never been through the security audit.
2. `node tools/inspect-models.js` — the shortlist of misplaced roots.
3. `npm run test:models` — merge equivalence across all 99.
4. Then, and only then, re-measure draw calls and FPS per §U2 step 4. Measuring
   before steps 1–3 measures a pack that is about to change.

### Still open, and not technical

§7's redistribution condition is live rather than hypothetical: the repository
is public and now carries 99 model payloads, 50 effect payloads and their baked
derivatives, with no licence or chain of title recorded. That is the project
owner's decision to make, but it should be made deliberately rather than by
default.
