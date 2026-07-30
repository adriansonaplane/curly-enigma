# Task log

## 2026-07-30 06:59:55 UTC — Sol — Unidentified loot verified; charm audits begin

**Actor / evidence source:** Sol (`/root`) integrating contract, runtime,
browser, leak-audit, and independent visual-review reports. **Task:**
`TASK-20260730-11`. **Revision:** branch `main` at baseline `8976a63`; the
shared working tree remains intentionally dirty; commit/PR: none.

**Result.** Eligible magic, rare, set, and unique equipment can now enter the
field unidentified. Scrolls of Identification provide an atomic exact-one
keyboard/mouse flow, while Old Maras provides free identify-all for inventory
items only. Tooltip, world label, search, equip, mercenary/derived-stat, socket,
Cube, repair, vendor, corpse, and save paths conceal or reject unresolved gear.
Explicit save migration preserves legacy identified items. Bosses guarantee an
identification scroll and lesser ranks use scaled drop chances.

**Review.** `/root/identification_leak_audit` found no critical bypass. The
initial harsh visual review correctly returned `BLOCK` for a 390×844
tooltip/status collision. Status-aware tooltip placement and regression
assertions closed it; `/root/identification_visual_critic` then returned exact
`ACCEPT`, including measured 8-pixel gaps. Ephemeral evidence is under
`/tmp/curly-enigma-identification-audit-critic-20260729-234508/` and
`/tmp/curly-enigma-identification-tooltip-recheck-20260729-235250/`.

**Verification.** Identification core/runtime contracts and four focused
browser journeys pass. All 16 Node contracts are green; changed-JavaScript
syntax and `git diff --check` are green; the final Chromium/SwiftShader suite
passed `69/69` in 2.3 minutes. SwiftShader is correctness evidence, not
hardware-performance certification.

**Next.** Keep this feature verified but unarchived until Adrian records owner
acceptance. The next bounded slice is D2 inventory charms; delegated contract-
architecture and integration audits are active. The broad D2/WoW/D&D/AAA goal
remains active.

## 2026-07-30 06:13:16 UTC — Sol — Durability visual acceptance closes the batch gates

**Actor / evidence source:** Sol (`/root`) integrating the independent final
review from `/root/durability_visual_audit`. **Revision:** branch `main` at
baseline `8976a63`; commit/PR: none; the shared working tree remains intentionally
dirty.

**Result.** The durability/smith slice is now functionally and visually
verified. Review-driven polish contains phone smith rows and buttons, gives merc
rows/buttons a themed responsive layout, makes paperdoll and merc gear keyboard
focusable, clamps focus-triggered tooltips inside the viewport, and exposes
explicit accessible `Low` and `Broken` condition labels. The independent verdict
is exact `ACCEPT`.

**Visual evidence.** Fresh 1600×900 desktop and 390×844 mobile captures cover a
keyboard-focus inventory tooltip, broken inventory/paperdoll/mercenary gear,
affordable and insufficient-gold smith states, scroll-bottom containment, and
the empty state after Repair All. The mobile tooltip stayed within viewport
bounds and keyboard reachability was true. Mobile logs were empty; desktop logs
contained only allowed WebGL ReadPixels stall warnings. Evidence is ephemeral at
`/tmp/curly-enigma-durability-audit-20260729/`.

**Final-tree verification.** The focused durability browser suite passed `3/3`
in 14.3 seconds, all 14 Node contracts passed, changed-JavaScript syntax and
`git diff --check` passed, and the full Chromium/SwiftShader suite passed `65/65`
in 2.0 minutes after all durability fixes. SwiftShader is correctness evidence,
not hardware-performance certification.

**Next.** Keep durability verified but unarchived until Adrian records owner
acceptance. The broad D2/WoW/D&D/AAA objective remains active, and the next
feature continues from this verified batch.

## 2026-07-30 06:07:04 UTC — Sol — Feature-first itemization and recovery batch

**Actor / evidence source:** Sol (`/root`) integrating delegated implementation,
contract, runtime-audit, and independent visual-review reports. **Revision:**
branch `main` at baseline `8976a63`; commit/PR: none; the shared working tree is
intentionally dirty.

**Delivered and verified.** The advanced-effects drawer now has three focused
browser regressions covering live master/child behavior, resource lifecycle, and
projectile visibility, followed by an independent visual `ACCEPT`. Cube/socket
itemization has socket, Cube, and runtime Node contracts plus five focused
browser tests. Its review-driven fixes give keyboard ownership to the open panel
and clone every cached sprite canvas so item icons are unique DOM nodes; a fresh
independent review returned `ACCEPT`.

**Delivered, with one visual gate still open.** Softcore corpse recovery has a
pure state contract, persistence/runtime integration, multiple atomic recoveries,
portal and town-fallback behavior, and three focused browser tests; hardcore is
unchanged. Its first visual review correctly returned `BLOCK` for genuine
390-pixel announcement overflow and corpse/enemy legend ambiguity. After the
fixes, `/root/corpse_visual_recheck2` returned exact `ACCEPT` across 16 fresh
captures: mobile PNGs are 390×844 with `scrollWidth/clientWidth` `390/390`, and
desktop PNGs are 1600×900 with width metrics `1600/1600`. Labels,
announcements, corpse diamonds versus enemy circles, focus, and Enter paths were
safe, with no errors beyond allowed SwiftShader diagnostics. Item durability and
smith repair have a pure condition contract, persistence, a shared landed-hit
wear token, broken gear suppression, deterministic physical wear, and an atomic repair UI that
excludes unresolved corpses. Its Node contracts and three focused browser tests
pass; its separate visual audit is pending.

**Verification boundary.** All Node tests pass. The final all-up Chromium suite
also passed `65/65` in 2.0 minutes with SwiftShader. This establishes software
correctness rather than hardware-GPU performance. Evidence under `/tmp` is
ephemeral.

**Next.** Resolve the pending durability visual review and iterate any material
blockers. Do not archive without the existing owner and participant consensus. The broad
D2/WoW/D&D/AAA objective remains active, and feature work continues after these
gates.

## 2026-07-30 04:34:47 UTC — Sol — Difficulty campaigns, audited UI, and visible corpse physics

**Actor / evidence source:** Sol (`/root`) implementing the difficulty slice and
integrating reports from `/root/difficulty_code_review`, `/root/gameplay_audit`,
`/root/quality_audit`, `/root/visual_audit`, `/root/ragdoll_code_review`, and
`/root/documentation_audit`. **Revision:** branch `main` at baseline `8976a63`;
commit/PR: none, changes remain in the shared uncommitted working tree.

**Intent.** Add durable per-character Normal → Nightmare → Hell campaign
progression; correct two independently audited HUD controls; make corpse physics
visible and bounded; and repair browser fixtures so failures represent product
behavior. **Non-goals:** a skeletal/per-limb solver for authored meshes, creation
of authored actor assets, real-GPU performance certification, or a claim that the
broad MMORPG/AAA objective is complete.

**Result.** Difficulty selection now preserves hero level, equipment, inventory,
gold, and shared character systems while isolating campaign progress and quests
per tier. Act V completion unlocks the next tier, migration is versioned and
nondestructive for partial/malformed legacy saves, selection fails closed, and
tier resistance/level/HP/damage rules are covered. The picker has semantic hero
and delete buttons, accessible sealed tiers, focus/scroll restoration, class
portrait, tier modifiers, and responsive layout. Action bar 2 once again honors
its hidden state, and ordinary enemy nameplates honor the setting while elite and
boss plates remain visible.

Corpse rendering now consumes the existing physics state: bodies translate,
lift, ease into a signed prone fall, articulate procedural limbs asymmetrically,
remain grounded using cached transformed bounds, fade with isolated materials,
drop their shadows during fade, and retire rig/body/material state cleanly. Gore
debris expires after one second. The authored path is covered through the real
production instancer using a synthetic rigid model; no authored monster payload
exists in this checkout.

**Verification.** The initial browser baseline was `38 passed, 8 failed`. All
eight original failures were fixture/assertion defects (panel state, selector
scope, fallback ownership, minimap raster brittleness, context timing, layout
comparison, and FPS-clock assumptions), not eight product fixes. After correction
and the new feature regressions, Chromium `/usr/bin/chromium` with SwiftShader
passed `52/52` in 1.0 minute. The exact final commands were:

- `npm run test:dialogue`
- `npm run test:boss-summons`
- `npm run test:quests`
- `npm run test:lore`
- `npm run test:factions`
- `npm run test:difficulty`
- `npm run test:models`
- `find js tests/node tests/browser -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
- `git diff --check`
- `/usr/bin/bash -lc 'PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser'`

This supersedes the old current-status claim that
`video-settings-contract.spec.js:3` fails on `main`; that statement remains below
only as historical evidence. SwiftShader establishes correctness, not hardware
GPU throughput.

**Review / artifacts.** Final difficulty captures are
`/tmp/difficulty-latest-desktop.png` and
`/tmp/difficulty-latest-mobile.png`; the pre-iteration critique is under
`/tmp/curly-enigma-difficulty-audit-20260729/`. Ragdoll before/after evidence and
metrics are under `/tmp/curly-enigma-ragdoll-audit-20260729/`,
`/tmp/curly-enigma-ragdoll-audit-20260729-rerun/`, and
`/tmp/curly-enigma-ragdoll-audit-20260729-low-random-final/`. The settings
capture is `/tmp/curly-enigma-audit-20260729/07-settings-video.png`. These `/tmp`
artifacts are ephemeral. The final visual reviewer measured a monotonic
low-random fall, full prone at about 542 ms, effectively zero floor penetration,
and no persistent corpse shadow; the independent code reviewer reported no
remaining blocker.

**Known limitations / next.** Corpse motion is a short-lived whole-body fall
with procedural limb posing, not a general skeletal ragdoll. Authored behavior is
synthetic-test-only; the model audit reports 18 mapped monster species and zero
present authored payloads. Overall world lighting, HUD hierarchy, and actor art
remain well below the target visual bar, and no real-GPU capture was performed.
The next product slice is the visual foundation/authored-actor/HUD-readability
pass. Separately, `TASK-20260729-01` remains active for dynamic advanced-effect
master/child switching, disposal/reinitialization, and projectile visibility.

## 2026-07-30 01:23:44 UTC — Sol — Consolidate complete Wave program

**Actor / evidence source:** Sol (`/root`) using reports from `/root/wave1`,
`/root/wave2`, and `/root/wave3` plus today's owner corrections.

**Result.** Added every reported task to Wave-specific active records; summarized
the workspace thread; populated comments, discussion, features, questions,
plans, handoffs, assignments, and vital safeguards; and retained the primary
repository/`codex/agent-coordination` workflow.

**Evidence limitation.** This is documentation consolidation. Reports created
against PR #62 remain subject to source revalidation at PR #83 or newer.

**Next.** Assign Wave revalidation owners and independent reviewers.

Execution history, one entry per task, newest first. `HANDOFF.md` carries the
information a successor needs to make the next correct decision; this file
carries how we got there, so the handoff does not become a chronological dump.
The structure is the one set out in HANDOFF.md §U4.

---

## 2026-07-30 01:15:56 UTC — Sol — Create shared agent coordination branch

**Actor / evidence source:** Sol (`/root`). **Owner:** Adrian.

**Intent.** Create the requested shared agent branch from `main` in the primary
curly-enigma checkout and restore the Wave handoff records.

**Result.** Created `codex/agent-coordination` from `main` at `366c6ff` and used
the primary repository checkout without a secondary worktree. Recorded the three
completed static Wave reviews and a current-baseline revalidation plan.

**Next concrete task.** Revalidate each reported gap against PR #83 or a newer
agreed baseline, then assign bounded implementation and visual-review work.

## 2026-07-29 19:35:21 UTC — Sol — Establish the always-current agent documentation branch

**Actor / evidence source:** Sol (`/root`) with advisory review from
`/root/coordination_policy`. **Owner:** Adrian. **Known collaborator:** Alex.

**Intent.** Create a Markdown-only `agent` branch workflow for on-demand task,
discussion, feature, plan, question, comment, handoff, sub-agent, archive, and
emergency/vital coordination.

**Files / subsystems.** `agent/*.md`, `agent/archive/*.md`, `SUBAGENT_LOG.md`,
and `TASK_LOG.md`; documentation only.

**Decision.** Agents work asynchronously unless feedback is vital, check the
vital log at defined checkpoints, append a Mini log to every touched note, and
require explicit current-participant consensus before moving completed work to
the monthly archive and removing it from active notes.

**Next concrete task.** Use a browser-capable host to complete
`TASK-20260729-01`, then archive it only after its owner and reviewer record
agreement.

---

## 2026-07-29 19:00:03 UTC — Sol — Document GPU/facing work and establish attributed logs

**Actor / evidence source:** Sol (`/root`), repository state, and delegated
static audit from `/root/log_audit`. **Owner:** Adrian. **Known collaborator:**
Alex.

**Commit documented:** `93c1b60` — per-effect advanced GPU controls, settings
reorganization, automatic-gold wiring, and attack interruption on damage.

**Intent.** Give the next contributor an accurate continuation for the prior
implementation and establish Adrian's required name-and-time convention for all
future events and tasks. Add a separate ledger so delegated agent activity is
not mixed with product implementation history.

**Non-goals.** No runtime code changes, no attempt to fabricate timestamps for
older entries, and no claim that browser tests passed when Chromium was absent.

**Files / subsystems.** `HANDOFF.md`, `TASK_LOG.md`, and new
`SUBAGENT_LOG.md`; documentation only.

**Verification / environment.** Reviewed the current Git history and both
existing project logs in the `/workspace/curly-enigma` checkout. The current
implementation commit is `93c1b60`. The previous implementation verification
remains: model-contract tests and syntax/static checks passed; Playwright was
blocked by a missing browser and an HTTP 403 during browser installation.

**Decision.** Future entries use `YYYY-MM-DD HH:MM:SS UTC — Agent/Actor —
Event or task name`. Historical date-only entries stay intact; unknown times
must be labeled rather than inferred.

**Next concrete task.** Run Playwright and capture the updated Video settings UI
on a browser-capable host, then record the result with the tester's name and an
exact UTC timestamp.

---

## 2026-07-29 — White world: a GPU watchdog reset, not a leak

**Commits:** `510ddc2` (context-loss survival), `2a188d4` (prop dispose leak).

**Symptom.** World renders white, 2D UI overlay fine. Began with the GPU work in
PRs #33-#43. Loads in Firefox, not in Chromium.

**Root cause, unresolved.** A single frame takes 421-1323 ms:

    [Violation] 'requestAnimationFrame' handler took 986ms

That is a GPU driver reset. Chrome enforces a watchdog on long frames and kills
the context; Firefox tolerates the same frame. Chromium is not broken here — it
is the accurate reporter, and it is the better browser to debug this in.

The cycle is self-sustaining: context lost -> restore -> three.js re-uploads
every geometry (`webglcontextrestored` handler takes 213 ms) -> the next frame
takes 421 ms -> lost again.

The shader error is downstream, not a second bug. `getProgramInfoLog` is EMPTY
with link status false, then 1282 (INVALID_OPERATION) after restore. An empty
log with a failed link is the signature of compiling against a dying context.
The grade shader source is fine and had been working.

**Fixed along the way, neither being the cure:**

- `Props3.dispose()` called only `InstancedMesh.dispose()`, freeing the instance
  matrix buffer and neither geometry nor material — while the condition tested
  for geometry and then ignored it. `build()` reruns per resolved authored
  template, so a map load leaked all of it repeatedly. Real, but it does not
  produce a 986 ms frame.
- No WebGL context-loss handling existed anywhere, so a loss was permanent: the
  GPU timer kept querying the dead context's handles every frame. The game now
  survives a loss. Covered by `tests/browser/context-loss.spec.js`, which goes
  red with `calls === 0` after restore when the handlers are removed.

**Tried and reverted.** Disposing `_target` and flagging `_postMat` inside the
restore handler, to rebuild the grade pass's dead GPU objects. It runs before
three.js finishes its own restore and turned the probe red. The idea is sound;
the timing is not. Needs deferring to the next frame.

**Next concrete task.** 421 ms of frame time with a 213 ms re-upload is
submission/upload volume, not fill — so grade and shadow toggles will not move
it. Count the scene:

    let meshes=0, inst=0, insts=0;
    R3.scene.traverse(n=>{ if(n.isMesh) meshes++;
      if(n.isInstancedMesh){inst++; insts+=n.count;} });

If instanced meshes number in the hundreds or thousands, spatial chunking
(#38/#41) split the world into more meshes than merging removed. Then bisect
#38/#41 and #39/#42. A Firefox performance profile across one spike would name
the function outright.

**Also open.** `video-settings-contract.spec.js:3` fails on main, unrelated to
the above and predating these commits (PR #43).

---

## 2026-07-29 — Rendering pipeline mapped; GPU work ordered

**Scope:** static review only; no runtime renderer changes and no hardware GPU
capture in this task.

Mapped the live flow from `requestAnimationFrame` through `Game.update`,
`Render.frame`, scene synchronisation, the Three.js world pass, optional
full-resolution grade/vignette pass, and the native-resolution 2D overlay.
World tiles, props, particle points and static actor parts are already batched;
the review therefore did not treat draw calls as the sole explanation for 100%
GPU load.

**Primary finding.** The frame loop is uncapped. It renders once per browser
animation frame, and automatic quality only yields below 34 FPS. At the owner's
145–155 FPS hardware baseline, the renderer continuously consumes available
GPU capacity by design. Full-resolution rendering at 2560×1440 / DPR 1.25,
an optional second full-screen grade pass, standard-material point lights,
transparent effects and shadow work are the next likely costs to separate.

**Correctness finding.** Shadow policy is not fully dynamic: `R3.shadows` is
updated from quality each frame, while the hero light's `castShadow` flag is set
only during map light construction. A low-quality or shadow-off change can
therefore leave shadow-map work enabled until the next map rebuild.

**Agreed execution order.** Add non-blocking diagnostics; implement a persisted
display/30/60/90/120 FPS limiter; fix dynamic shadow disabling; add 3D render
scale and a target-based governor; profile light budgets; then measure spatial
chunking and transient-effect instancing. Reconcile the AO/reflection controls,
which currently have no consumer in the reviewed renderer. Full detail and
acceptance constraints are in HANDOFF §U10.

**Existing immediate items retained.** Visually verify `ragm-volcanic-imp`,
inspect `bookcase.json`'s fetch, make full-pack index discovery fail safe, and
replace the stale draw-call figure with a controlled real-hardware capture.

**Decision:** do not start an external TypeScript framework. Static typing may
later begin as build-free JSDoc plus development-only `tsc --noEmit`, but it is
explicitly outside the rendering-performance work.

**Next concrete task.** Implement diagnostics and the FPS limiter first, with
browser coverage for the cap and elapsed game time; use the resulting GPU and
pass-level measurements to choose the next optimization rather than changing
batch boundaries speculatively.

---

## 2026-07-29 — Measured: 4,696 primitives to 1,562 draw calls

**Commits:** `3ee15b8`, `eb5b1af`, `c7c5bb6`, `1ce09cb` on
`claude/diablo-2-clone-game-dzbw4a`, rebased onto `a720f37` (merge of PR #30).

Owner-run on the full 99-model pack, measured by `tools/inspect-models.js`,
which reads the count off the compiled root the renderer is handed rather than
deriving it separately.

| stage | draw calls | vs one per primitive |
|---|---:|---:|
| unmerged | 4,696 | — |
| static merge by material (`b87713b`) | 2,432 | 48.2% fewer |
| + material dedup by value (`c7c5bb6`) | **1,562** | **66.7% fewer** |

The dedup removed a further 870 draws — a 36% cut on top of the merge. It came
from a defect that looked like file redundancy: the compiler keyed materials on
object identity, and the catalogue constructs a fresh MeshStandardMaterial per
part, so models whose parts shared one appearance still got one draw each.
`bookcase` compiled to 73 primitives and 73 draws before it; `astral-obelisk`
71 and 71.

**Also fixed:** the compiler was not reproducible. Three consecutive compiles of
one unmodified payload produced yaws of 0, 0.00035 and 0, because `Math.random`
was seeded per slug but the clock was left live and the catalogue's animation
code reads it. The clock is frozen and `performance.now()` supplied (it was
absent, so a payload reaching for it threw into the init guard and lost its
model for an unrelated reason). Five consecutive compiles are now byte-
identical. This matters beyond tidiness: `git diff` on the baked scenes is the
only cheap check that a pipeline edit did not move geometry, and it could not
work before.

**Audit after sanitising:** 198 BLOCK to 17, `external hosts referenced: NONE`.
Sixteen are `.html` sidecars carrying the `broken-js` corruption, which nothing
in the pipeline reads. **`bookcase.json`'s `fetch` is the only blocking finding
in a file the compiler consumes** and is still unexamined — the sanitiser has no
rule for it.

**Trap worth knowing.** `assets/models/index.json` and
`assets/models/baked/manifest.json` are both tracked and both committed at the
3-model sample state, so switching branches silently reverts a 99-model working
set to 3. The payloads are untracked and survive; only the two files that index
them are lost. Recovery is `./tools/pull-models.sh`, which skips anything
already on disk and rebuilds the index from every slug present — no downloads.

**Still unverified.** No `ragm-*` model has been rendered. Six models remain
flagged by the placement inspector and have not been read yet.

**Next concrete task.** Read the six flagged rows; examine `bookcase.json`'s
fetch; then re-measure FPS on real hardware per HANDOFF §U2 step 4, which is now
the only outstanding item in that sequence.

---

## 2026-07-29 — Full-pack results; bounds measurement corrected

**Commit:** `ff92c38`. Owner ran all three checks on the complete 99-model pack.

**Result: the merge is correct across all 99.** Every model preserved its
vertex count exactly and produced draws equal to materials plus animated parts.

| | primitives | draws | |
|---|---:|---:|---|
| all 99 models | 4,696 | 2,432 | 48.2% fewer |
| 15 `ragm-*` actors | 315 | 118 | 21.0 → 7.9 per monster |

A 40-monster room goes from ~840 actor draws to ~315 — against HANDOFF §3 #1's
stale 230–380 total, this is the largest single lever available.

**The 29 test failures were mine.** All 29 were bounds checks; none was a
vertex count, a draw count or a merge. `Box3.setFromObject` transforms each
geometry's axis-aligned box, which over-covers a rotated part — worst case a
UV sphere, whose box is the full ±r cube while the sphere is rotation-
invariant. One rotated non-uniformly-scaled sphere misreports its own `minY`
by **0.41 world units**. The `ragm` actors are built entirely from rotated
scaled spheres. Both sides now bound actual vertices; tolerance 1e-2 → 1e-5,
and runic-pillar drops from 1.08e-3 to 2.90e-8.

`tools/inspect-models.js` had the same flaw and is fixed the same way — it now
compiles through the real `actors3d.js`. **Its 2026-07-29 output is void:**
`ragm-troll` −0.151, `ragm-lich-lord` −0.068, `ragm-wraith` −0.080 and
`fen-shrine-idol` −0.100 are all within the over-coverage magnitude and were
probably never sunken. Re-run required.

`ragm-volcanic-imp` is the one flag likely to survive: floating 0.528 with a
0.253 footprint offset, and measuring 1.23 × 1.06 × 1.02 — wider than tall,
where every other actor is clearly taller than wide.

**Audit read (198 payloads, all BLOCK).** The two halves differ completely:

- The 99 `.json` payloads — *the only files the compiler reads* — hit exactly
  one blocking rule each, `cdn-reference`, which is a string match on
  `cdnjs.cloudflare.com`. No live `<script src>`, no `parent-access`, no
  `postMessage`, no `broken-js`.
- The 99 `.html` sidecars carry every serious finding: live remote script tags,
  frame access, postMessage, and `broken-js` on ten of them. Nothing reads
  these files.
- **`bookcase.json` is the one genuine outlier: `fetch x1`**, the only runtime
  network call in any `.json`.

The owner's working payloads differ from the three committed here (local
`wooden-door-uoc.json` contains zero occurrences of `cdnjs` and is 67
characters longer than the audited copy), so the audited files are a different,
un-sanitised vintage. `node tools/sanitize-payloads.js` then re-audit.

**Next concrete task.** Re-run `node tools/inspect-models.js`; look at
`bookcase.json`'s fetch and `ragm-volcanic-imp`; then re-measure draw calls and
FPS per HANDOFF §U2 step 4.

---

## 2026-07-29 — Wire the compiled monster models and merge them by material

**PR / commit:** branch `claude/diablo-2-clone-game-dzbw4a`, commits `5562b58`,
`b87713b`. Base `fedc868` (merge of PR #29).

**Intent.** Make the fifteen compiled `ragm-*` monster models actually drive
monsters, without regressing the draw-call work landed in PR #21.

**Non-goals.** Re-measuring FPS or draw calls on real hardware (that is the next
task, and deliberately follows this one — measuring a pack that is about to
change wastes the measurement). Broadening model coverage to props-as-actors.
Any change to the compiler's output format.

**Files / subsystems.**

- `js/actors3d.js` — `MODEL_MAP`, `GEOMETRY_ARGS`, `_primitive`, `_compileModel`,
  `instanceModel`, `animate`, `sync`, `stats`.
- `tools/inspect-models.js` — new; placement audit for compiled scenes.
- `tests/node/model-contract.js` — new; compiler/runtime contract checks.
- `package.json` — `test:models` script; `compile:models` now also inspects.

**What was wrong.**

1. `MODEL_MAP` mapped four species, and three of those named slugs the
   catalogue does not contain (`ragm-golem`, `ragm-bloatling`,
   `ragm-furnace-tyrant`). One species resolved; fourteen compiled models drove
   nothing.
2. `requestModel`'s rejection landed in `.catch(() => {})`. A missing model was
   indistinguishable from an unmapped species, which is why (1) survived three
   PRs.
3. `instanceModel` cloned an authored model's parts straight through — 13–27
   loose meshes. `build()` merges the static parts of a procedural archetype, so
   wiring authored models naively would have *raised* draw calls on exactly the
   monsters the merge was meant to make cheaper.
4. The runtime rebuilt six of the thirteen geometry types the compiler may
   emit. A lathe, ring or polyhedron threw at load — into the same silent catch.
5. `instanceModel` derived scale from `def.size` and dropped the 1.3× boss
   multiplier `build()` applies. Never observed, because the only boss in
   `MODEL_MAP` resolved to an absent slug.
6. The authored branch of `animate()` set `position.y` unconditionally, so a
   flying species would have swapped to its model and settled onto the floor.

**What changed.** Fourteen species mapped (thirteen by exact name;
`ragm-volcanic-imp` → `imp`, not `flameling`, which is incorporeal). Authored
models merge by material — every authored model is `rigid`, so *all* parts are
static and the model collapses to one draw per material, a better ratio than
the procedural merge achieves. Meshes named in `doc.animations` stay exempt.
Misses are recorded and reported in `stats().modelMisses`.

**Verification.** `npm run test:models` — runs the real `actors3d.js` against
the vendored three.js in a `vm`; no DOM, no GPU, no network.

**Before / after (the three models in this checkout).**

| model | primitives | draws before | draws after |
|---|---:|---:|---:|
| runic-pillar-uoc | 58 | 58 | 40 |
| soul-cage-uoc | 36 | 36 | 24 |
| wooden-door-uoc | 28 | 28 | 6 |

Vertices are preserved exactly in all three.

> **Superseded by the 2026-07-29 full-pack entry above.** This entry originally
> reported bounds as legitimately "tighter after merging" (runic-pillar 1.08e-3)
> and treated that as expected. It was not expected — it was the *reference*
> being measured with `Box3.setFromObject`, which over-covers rotated parts. The
> reading was right about the direction and wrong about the cause, and the
> tolerance it justified (1e-2) was loose enough to hide a 2mm defect. Corrected
> in `ff92c38`; runic-pillar now agrees to 2.90e-8.

**Mutation testing.** Each check was confirmed to fail deliberately: dropping
`LatheGeometry` from the runtime table (2 failures), skipping the merge (13),
and merging without baking the transform (13). Re-run after `ff92c38` with the
tightened bound: 2, 3, 6, plus two new mutations — collapsing every material
into one bucket (3) and nudging `minY` by two millimetres (3).

**Known regressions / unverified.**

- **The 15 `ragm-*` models have never been rendered.** This checkout carries a
  three-model sample pack, all props. Heights in `MODEL_MAP` are estimates from
  each family's `def.size`, not measurements, and no `ragm-*` model has been
  seen in-game at any scale.
- Whether the recovered `ragm-*` roots are correctly placed is unmeasured here
  — `tools/inspect-models.js` exists to answer that and needs the full pack.
- No real-hardware draw-call or FPS figure exists for the merged authored path.

**Next concrete task.** Owner runs, on the full 99-model pack:
`node tools/audit-assets.js assets/models`, `node tools/inspect-models.js`,
`npm run test:models`. Then re-measure draw calls and FPS per HANDOFF §U2 step 4.

---

## 2026-07-28 — Full catalogue compilation

See HANDOFF.md §U5. PRs #25–#29. All 99 models compile.
