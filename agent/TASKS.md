# Active tasks

## TASK-20260730-11 — Unidentified loot and identification services — VERIFIED, NOT ARCHIVED

- **Created / verified:** 2026-07-30 06:59:55 UTC
- **Author / implementation owner:** Sol (`/root`)
- **Contributors:** `/root/identify_feature_contract`,
  `/root/identification_integration_audit`, `/root/identification_core`,
  `/root/identification_runtime_tests`, `/root/identification_browser_tests`,
  `/root/identification_leak_audit`
- **Reviewer:** `/root/identification_visual_critic`
- **Status:** completed and independently verified; awaiting owner archival
  consensus
- **Baseline:** branch `main` at `8976a63`; shared dirty tree; commit/PR none

### Delivered / acceptance state

- [x] Eligible field-dropped magic, rare, set, and unique equipment supports an
  explicit unidentified state with nondestructive legacy-save migration.
- [x] Scrolls of Identification consume exactly one scroll and reveal exactly
  one inventory item atomically through keyboard or mouse interaction.
- [x] Old Maras offers free identify-all restricted to inventory; equipment,
  stash, mercenary gear, corpses, and ground items remain out of scope.
- [x] Tooltip, world label, search, equip, mercenary/derived stats, socket,
  Cube, repair, vendor, corpse, and save paths conceal or reject unresolved
  items; the independent leak audit found no critical bypass.
- [x] Bosses guarantee a scroll; lesser monster ranks use scaled drop chances.
- [x] Focused pure-core/runtime Node coverage and four focused browser journeys
  pass.

### Independent visual evidence

- The first harsh review returned `BLOCK` for a genuine 390×844 tooltip/status
  collision.
- Status-aware tooltip placement and explicit gap/containment assertions landed;
  the fresh independent verdict is exact `ACCEPT` with measured 8-pixel gaps.
- Ephemeral evidence:
  `/tmp/curly-enigma-identification-audit-critic-20260729-234508/` and
  `/tmp/curly-enigma-identification-tooltip-recheck-20260729-235250/`.

### Final verification

- [x] All 16 Node contracts green.
- [x] Focused identification browser suite `4/4`.
- [x] Changed-JavaScript syntax and `git diff --check` green.
- [x] Final Chromium/SwiftShader suite `69/69` in 2.3 minutes.

SwiftShader establishes correctness, not hardware performance. The next bounded
slice is D2 inventory charms; `/root/charm_contract_architecture` and
`/root/charm_integration_audit` are active. The broad D2/WoW/D&D/AAA goal
remains active.

### Consensus / archive gate

- [x] Sol (`/root`) — functional integration and final gates complete
- [x] `/root/identification_visual_critic` — exact `ACCEPT`
- [ ] Adrian — owner acceptance and archive approval

### Mini log

- 2026-07-30 06:59:55 UTC — Sol (`/root`) — verified — Identification core,
  leak audit, visual iteration, and final-tree gates recorded; owner archive
  consent remains pending.

## TASK-20260730-10 — Item durability and smith repair — VERIFIED, NOT ARCHIVED

- **Created:** 2026-07-30 06:07:04 UTC
- **Author / implementation owner:** Sol (`/root`)
- **Contributors:** `/root/item_condition`, `/root/durability_runtime_audit`
- **Reviewer:** `/root/durability_visual_audit`
- **Status:** completed and independently verified; awaiting owner archival
  consensus
- **Baseline:** branch `main` at `8976a63`; shared dirty tree; commit/PR none

### Delivered / acceptance state

- [x] Pure condition, ownership, quote, and atomic commit contract.
- [x] Persistence plus shared landed-hit token and deterministic physical wear.
- [x] Broken gear suppresses its base, affix, socket, runeword, set, and block
  contributions while remaining equipped.
- [x] Smith repair UI provides exact one/all quotes, validates atomically, and
  excludes unresolved corpse equipment; ethereal gear remains unrepairable.
- [x] Node contracts and three focused browser tests pass.
- [x] Independent harsh visual verdict from `/root/durability_visual_audit`:
  exact `ACCEPT`.
- [x] Final Chromium/SwiftShader suite: `65/65` passed in 2.0 minutes.

### Independent visual evidence

- Review-driven fixes contain phone smith rows/buttons, themed responsive merc
  rows/buttons, make paperdoll/merc gear focusable, clamp focus tooltips to the
  viewport, and expose explicit accessible `Low`/`Broken` condition labels.
- Fresh 1600×900 desktop and 390×844 mobile captures cover keyboard-focus
  inventory tooltip, broken inventory/paperdoll/merc gear, affordable and
  insufficient smith states, scroll-bottom containment, and the empty state
  after Repair All.
- Mobile tooltip bounds stayed inside the viewport and keyboard reachability was
  true. Mobile logs were empty; desktop showed only allowed WebGL ReadPixels
  stall warnings.
- Evidence: ephemeral `/tmp/curly-enigma-durability-audit-20260729/`.
- Final tree: focused durability browser `3/3` in 14.3 seconds, all 14 Node
  contracts green, changed-JavaScript syntax and diff checks green, and full
  Chromium/SwiftShader `65/65` in 2.0 minutes.

### Consensus / archive gate

- [x] Sol (`/root`) — functional integration complete
- [x] `/root/durability_visual_audit` — `ACCEPT`
- [ ] Adrian — owner acceptance and archive approval

### Mini log

- 2026-07-30 06:13:16 UTC — Sol (`/root`) — verified — Final independent visual
  acceptance and final-tree functional/browser evidence recorded; owner archive
  consent remains pending.

## TASK-20260730-09 — Softcore corpse recovery — VERIFIED, NOT ARCHIVED

- **Created:** 2026-07-30 06:07:04 UTC
- **Author / implementation owner:** Sol (`/root`)
- **Contributors:** `/root/corpse_contract`, `/root/corpse_visual_audit`
- **Reviewer:** `/root/corpse_visual_recheck2`
- **Status:** completed and verified; awaiting owner archival consensus
- **Baseline:** branch `main` at `8976a63`; shared dirty tree; commit/PR none

### Delivered / acceptance state

- [x] Versioned pure capture/recover/migrate/relocate contract with atomic
  multiple-corpse recovery and preserved item/socket identity.
- [x] Save/load, death, respawn, return portal, town fallback, renderer, map,
  interaction, failure, and hardcore-no-op integration.
- [x] Node contract and three focused browser tests pass.
- [x] Initial genuine mobile audit returned `BLOCK`; overflow and ambiguous
  enemy-like corpse markers were corrected at exact `390/390` mobile and
  `1600/1600` desktop viewport metrics.
- [x] Fresh independent recheck returned exact `ACCEPT` across 16 PNGs: mobile
  390×844 with `scrollWidth/clientWidth` `390/390`, desktop 1600×900 with width
  metrics `1600/1600`, safe labels/announcements, distinct enemy circles and
  corpse diamonds, working focus/Enter paths, and no errors beyond allowed
  SwiftShader diagnostics.
- [x] Final Chromium/SwiftShader suite: `65/65` passed in 2.0 minutes.

### Consensus / archive gate

- [x] Sol (`/root`) — functional integration complete
- [x] `/root/corpse_visual_recheck2` — `ACCEPT`
- [ ] Adrian — owner acceptance and archive approval

## TASK-20260729-01 — Browser-verify advanced graphics settings — VERIFIED, NOT ARCHIVED

- **Created:** 2026-07-29 19:35:21 UTC
- **Author:** Sol (`/root`)
- **Implementation owner:** Sol (`/root`)
- **Reviewer:** independent delegated visual reviewer; path not retained after
  context compaction
- **Status:** completed and verified; awaiting owner archival consensus
- **Related:** `93c1b60`, `DISCUSSION-20260729-01`, `VITAL.md`

### Acceptance criteria

- [x] Run focused Playwright coverage with Chromium.
- [x] Exercise the master advanced-effects switch and each child switch.
- [x] Verify resource disposal/reinitialization and projectile visibility.
- [x] Capture and independently review the reorganized Settings → Video UI.
- [x] Record environment and ephemeral screenshot evidence.

### Mini log

- 2026-07-30 06:07:04 UTC — Sol (`/root`) — verified — Three focused browser
  tests pass and the independent visual reviewer returned `ACCEPT`; awaiting
  Adrian's archival consensus.
- 2026-07-30 04:34:47 UTC — Sol (`/root`) — active — Chromium at
  `/usr/bin/chromium`, the headless suite, and a settings screenshot are now
  available. Remaining acceptance: dynamically exercise the master and all
  three child switches independently, verify disposal/reinitialization, verify
  rendered projectile visibility, and obtain reviewer sign-off.
- 2026-07-29 19:35:21 UTC — Sol (`/root`) — blocked — Prior environment lacked
  Chromium and the Playwright CDN returned HTTP 403; requires browser-capable host.

### Consensus

- [x] Sol (`/root`) — acceptance criteria verified
- [x] Independent visual reviewer — `ACCEPT`
- [ ] Adrian — owner acceptance and archive approval

---

# Completed tasks

## TASK-20260730-08 — Cube and socket itemization — VERIFIED, NOT ARCHIVED

- **Created / verified:** 2026-07-30 06:07:04 UTC
- **Implementation integrator:** Sol (`/root`)
- **Contributors:** delegated pure/runtime agents; paths not retained after
  context compaction
- **Final reviewer:** `/root/cube_visual_recheck`
- **Status:** completed and verified in the shared uncommitted working tree
- **Baseline:** branch `main` at `8976a63`; commit/PR none

### Delivered / verification

1. Socket and Cube rules, transmutation, persistence, item identity, and nested
   socket behavior are covered by Node/socket/Cube/runtime contracts.
2. Five focused browser tests cover visible itemization flows, panel keyboard
   ownership, and unique copied sprite canvases.
3. Review-driven keyboard and duplicate-icon fixes landed; the fresh independent
   verdict is `ACCEPT`.

All `/tmp` evidence is ephemeral. The combined Chromium/SwiftShader suite passed
`65/65` in 2.0 minutes; this is not hardware-performance evidence.

### Consensus / archive gate

- [x] Sol (`/root`) — implementation verified
- [x] `/root/cube_visual_recheck` — `ACCEPT`
- [ ] Adrian — owner acceptance and archive approval

## TASK-20260730-07 — Difficulty campaigns, audited UI, and corpse physics — VERIFIED

- **Created / closed:** 2026-07-30 04:34:47 UTC
- **Author / implementation owner:** Sol (`/root`)
- **Reviewers:** `/root/difficulty_code_review`, `/root/gameplay_audit`,
  `/root/quality_audit`, `/root/visual_audit`, `/root/ragdoll_code_review`
- **Status:** completed and verified in the shared uncommitted working tree
- **Baseline:** branch `main` at `8976a63`; commit/PR none

### Delivered

1. Versioned Normal → Nightmare → Hell unlocks with separate per-tier campaign
   and quest state, durable migration, and shared hero level/gear/inventory/gold.
2. Accessible responsive tier picker, focus restoration, modifier/progress copy,
   action-bar hidden-state correction, and correct nameplate setting behavior.
3. Visible eased corpse translation/lift/prone fall, grounded bounds, procedural
   limb articulation, isolated material fade, shadow/gore cleanup, and bounded
   procedural plus synthetic-authored lifecycle.
4. Corrected browser fixtures so product behavior—not direct DOM state or brittle
   raster/timing assumptions—is measured.

### Verification / evidence

- Chromium + SwiftShader: `52 passed (1.0m)` using
  `/usr/bin/bash -lc 'PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser'`.
- Dialogue, boss-summon, quest, lore, faction, difficulty, model, syntax, and
  `git diff --check` contracts passed.
- Final difficulty captures: `/tmp/difficulty-latest-desktop.png` and mobile.
- Final ragdoll evidence: `/tmp/curly-enigma-ragdoll-audit-20260729-rerun/` and
  `/tmp/curly-enigma-ragdoll-audit-20260729-low-random-final/`.

### Limitations / archive gate

SwiftShader is not real-GPU performance evidence. Authored corpse coverage is a
synthetic rigid instance because all 18 mapped monster payloads are absent. The
motion is not a general skeletal solver, and the broad visual/MMORPG objective
remains active. `/tmp` evidence is ephemeral. Do not archive until the owner and
all required current participants explicitly agree.

### Mini log

- 2026-07-30 04:34:47 UTC — Sol (`/root`) — completed — Functional, code, and
  repeated independent visual review blockers closed; final all-up suite passed.

## TASK-20260730-05 — Wave 1: D2 combat formulas — MERGED

- **Created:** 2026-07-30 01:50:00 UTC
- **Closed:** 2026-07-30 03:15:00 UTC
- **Author:** Alex (orchestrator, Claude Code)
- **Owner:** Wave 1 agent
- **Status:** completed — merged as PR #86
- **Commit:** `83e819f` on `claude/feature-d2-mechanics`
- **Merged into main at:** `53ef2dc`

### Delivered

1. AR/Def hit chance — `rollHitCheck()`, D2 formula clamped [5,95], "Miss" text
2. Shield blocking — dex-based, 75% cap, 0.35s cooldown, "Block" text
3. Deadly strike / crushing blow / open wounds — `applyPhysSpecials()`
4. Synergy → damage — `synergyMult()` reads hard points, applied in weapon+spell
5. Difficulty tiers — monster HP/dmg/resist scaling, player resist penalties, saved

### Mini log

- 2026-07-30 01:50:00 UTC — Alex — active — Assigned after revalidation
- 2026-07-30 02:45:00 UTC — Wave 1 agent — completed — Committed and pushed
- 2026-07-30 03:15:00 UTC — Adrian — merged — PR #86 into main

## TASK-20260730-06 — Wave 2: compare-on-hover + grid inventory — MERGED

- **Created:** 2026-07-30 01:50:00 UTC
- **Closed:** 2026-07-30 03:15:00 UTC
- **Author:** Alex (orchestrator, Claude Code)
- **Owner:** Wave 2 agent
- **Status:** completed — merged as PR #87
- **Commit:** `dab7d96` on `claude/feature-mmo-ui`
- **Merged into main at:** `4556511`

### Delivered

1. Compare-on-hover — stat diff tooltip (green upgrades, red downgrades) for
   damage, armor, stats, resists, specials. "Empty slot" when nothing equipped.
2. Grid inventory — 10x6 grid, items span w×h footprint (swords 1x3, armor 2x3,
   rings 1x1, etc.), footprint-aware drag-and-drop, legacy save migration.

### Mini log

- 2026-07-30 01:50:00 UTC — Alex — active — Assigned after revalidation
- 2026-07-30 03:00:00 UTC — Wave 2 agent — completed — Committed and pushed
- 2026-07-30 03:15:00 UTC — Adrian — merged — PR #87 into main

## TASK-20260730-04 — Wave 3: narrative — CLOSED (no work needed)

- **Created:** 2026-07-30 01:23:44 UTC
- **Closed:** 2026-07-30 01:50:00 UTC
- **Closed by:** Alex (orchestrator, Claude Code)
- **Status:** closed — all items already implemented by Codex PRs #79-#83

### Closure evidence

Revalidated against `f440d7a`. All six work items verified implemented:
modules wired in index.html, branching dialogue with skill checks, quest
lifecycle (17 quests), factions with price effects, lore codex, environmental
narrative in dungeon generation.

## TASK-20260730-01 — Revalidate three Wave reports — CLOSED

- **Created:** 2026-07-30 01:15:56 UTC
- **Closed:** 2026-07-30 01:50:00 UTC
- **Closed by:** Alex (orchestrator, Claude Code)
- **Status:** closed — revalidation complete, gaps assigned and delivered
