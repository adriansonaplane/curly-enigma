# Task log

Execution history, one entry per task, newest first. `HANDOFF.md` carries the
information a successor needs to make the next correct decision; this file
carries how we got there, so the handoff does not become a chronological dump.
The structure is the one set out in HANDOFF.md §U4.

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
