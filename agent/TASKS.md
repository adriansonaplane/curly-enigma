# Active tasks

## TASK-20260729-01 — Browser-verify advanced graphics settings

- **Created:** 2026-07-29 19:35:21 UTC
- **Author:** Sol (`/root`)
- **Owners:** next browser-capable implementation agent
- **Status:** blocked
- **Related:** `93c1b60`, `DISCUSSION-20260729-01`, `VITAL.md`

### Acceptance criteria

- Run the Playwright browser suite with Chromium.
- Exercise the master advanced-effects switch and each child switch separately.
- Verify resource disposal/reinitialization and projectile visibility.
- Capture the reorganized Settings → Video UI.
- Record results, environment, commands, screenshot path, and participant review.

### Mini log

- 2026-07-29 19:35:21 UTC — Sol (`/root`) — blocked — Prior environment lacked
  Chromium and the Playwright CDN returned HTTP 403; requires browser-capable host.

### Consensus

- [ ] Assigned implementation agent — acceptance criteria verified
- [ ] Reviewing agent — evidence reviewed

---

# Completed tasks

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
