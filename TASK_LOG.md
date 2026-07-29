# Task log

Execution history, one entry per task, newest first. `HANDOFF.md` carries the
information a successor needs to make the next correct decision; this file
carries how we got there, so the handoff does not become a chronological dump.
The structure is the one set out in HANDOFF.md §U4.

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

Vertices are preserved exactly in all three. Bounds are *tighter* after
merging — `Box3.setFromObject` transforms a rotated part's own AABB and
over-covers it, while merged geometry bounds the welded vertices. runic-pillar
(31 of 58 parts rotated) measures 1.08e-3 shorter; the two axis-aligned models
agree to 2e-8.

**Mutation testing.** Each check was confirmed to fail deliberately: dropping
`LatheGeometry` from the runtime table (2 failures), skipping the merge (13),
and merging without baking the transform (13).

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
