# Active tasks

## TASK-20260730-05 — Wave 1: Implement remaining D2 combat formulas

- **Created:** 2026-07-30 01:50:00 UTC
- **Author:** Alex (orchestrator, Claude Code)
- **Owners:** Wave 1 implementation agent
- **Status:** active
- **Related:** `TASK-20260730-02`, `TASK-20260730-01`, `f440d7a`
- **Branch:** `claude/feature-d2-mechanics`

### Revalidation (2026-07-30 01:45 UTC)

Against baseline `f440d7a` (PR #85), the following are **already implemented**:
- Mercenary system (hiring, AI, equipment, leveling, death/resurrection) — DONE
- Monster AI differentiation (6 AI types: melee, ranged, caster, summoner, charger, exploder) — DONE
- Champion/unique affixes (ELITE_MODS: warp, vamp, multi, etc.) — DONE
- Life/mana leech (computeDerived, applied in damageMonster) — DONE
- Poison DoT (applyDebuff, ticks every 0.5s) — DONE
- Boss summon caps (BOSS_ADD_CAP: 6) — DONE
- Skill synergy metadata (defined on every skill via data.js loop) — DONE

### Confirmed gaps — implement these

1. **AR/Def hit chance formula.** Attacks always hit. Implement D2's
   AR vs Def roll: `hitChance = AR / (AR + Def) * 2 * 100`, clamped 5-95%.
   Apply in `damageMonster` for physical attacks.
2. **Blocking.** No shield-block logic exists. Implement block chance based on
   dex and shield `blockPct`, with a block animation delay. Apply to incoming
   melee/ranged physical damage in `damagePlayer`.
3. **Deadly strike / crushing blow.** Generic crit exists (`critCh`/`critDmg`),
   but D2-specific `deadlyStrike` (double damage) and `crushBlow` (% current HP)
   are not wired. Read from `pl.derived`, apply in the damage path.
4. **Synergies → damage.** Synergy metadata is on every skill but
   `rollWeaponDmg`/`rollSpellDmg` never read synergy bonuses. Wire: for each
   synergy entry, add `synergy.bonusPerRank * hardPoints(synergy.skillId)` to
   the skill's effective damage.
5. **Difficulty resistance penalties.** No difficulty tiers exist. Add Normal
   (0 resist penalty), Nightmare (-40), Hell (-100) applied to player resists.
   Add monster HP/damage/XP multipliers per difficulty.

### Acceptance criteria

- Every formula matches the description above or has a documented deviation.
- Each mechanic has a Node.js or browser test.
- Commit and push to `claude/feature-d2-mechanics`.

### Mini log

- 2026-07-30 01:50:00 UTC — Alex (orchestrator) — active — Revalidated against
  f440d7a. Five confirmed gaps assigned.

### Consensus

- [ ] Wave 1 agent — implementation complete
- [ ] Orchestrator — evidence reviewed

---

## TASK-20260730-06 — Wave 2: Finish compare-on-hover and grid inventory

- **Created:** 2026-07-30 01:50:00 UTC
- **Author:** Alex (orchestrator, Claude Code)
- **Owners:** Wave 2 implementation agent
- **Status:** active
- **Related:** `TASK-20260730-03`, `TASK-20260730-01`, `f440d7a`
- **Branch:** `claude/feature-mmo-ui`

### Revalidation (2026-07-30 01:45 UTC)

Against baseline `f440d7a` (PR #85), the following are **already implemented**:
- Paperdoll with 10 equipment slots, icons, unequip buttons — DONE
- Gear score formula and display — DONE
- Drag-and-drop inventory (InventoryGridController, HTML5 drag API) — DONE
- Skill tree with SVG prereq connectors — DONE
- Party frames with HP/MP bars, role badges, action buttons — DONE
- Full-map overlay with zoom, pan, legend, opacity, category toggles — DONE
- Settings panel with 7 tabs including rebindable keybinds — DONE
- Layout reset without page reload — DONE
- Minimap settings — DONE

### Confirmed gaps — implement these

1. **Compare-on-hover.** When hovering an inventory item, show a stat-diff
   tooltip comparing it against the currently equipped item in the same slot.
   Green for upgrades, red for downgrades. Add to `hookTip` or the item tooltip
   builder in `js/ui.js`.
2. **Grid-based variable-size inventory.** Items currently all occupy 1 cell.
   Add `w` and `h` properties to item base types (weapons 1×3 or 1×4, armor
   2×3, rings 1×1, etc.) and implement a spatial grid that checks for
   overlapping items. Render items spanning multiple cells.

### Acceptance criteria

- Compare tooltip shows stat deltas for at least: damage, armor, stats, resists.
- Grid inventory respects item dimensions and prevents overlapping placement.
- Both features work with existing drag-and-drop.
- Commit and push to `claude/feature-mmo-ui`.

### Mini log

- 2026-07-30 01:50:00 UTC — Alex (orchestrator) — active — Revalidated against
  f440d7a. Two confirmed gaps assigned.

### Consensus

- [ ] Wave 2 agent — implementation complete
- [ ] Orchestrator — evidence reviewed

---

## TASK-20260730-04 — Wave 3: narrative — CLOSED

- **Created:** 2026-07-30 01:23:44 UTC
- **Closed:** 2026-07-30 01:50:00 UTC
- **Closed by:** Alex (orchestrator, Claude Code)
- **Status:** closed — all items verified implemented at f440d7a

### Closure evidence

All six work items verified against f440d7a:
1. Modules wired in index.html (lines 112-116) — YES
2. Branching dialogue with consequences, skill checks (elder graph, skillCheck) — YES
3. Quest lifecycle (17 quests, full state machine, bump/refresh/takeCompleted) — YES
4. Factions with price effects, hostility gating (Factions.price, isHostile) — YES
5. Lore codex renderable (renderCodex in wui.js, discovery notifications) — YES
6. Environmental narrative in dungeon gen (Narrative.definitions, placeNarrative) — YES

### Mini log

- 2026-07-30 01:50:00 UTC — Alex (orchestrator) — closed — All items implemented
  by Codex PRs #79-#83. No remaining gaps.

---

## TASK-20260730-01 — Revalidate three Wave reports — CLOSED

- **Created:** 2026-07-30 01:15:56 UTC
- **Closed:** 2026-07-30 01:50:00 UTC
- **Closed by:** Alex (orchestrator, Claude Code)
- **Status:** closed — revalidation complete

### Closure evidence

Revalidated all three waves against f440d7a at 2026-07-30 01:45 UTC.
Wave 3 closed (fully implemented). Waves 1 and 2 narrowed to confirmed gaps
in TASK-20260730-05 and TASK-20260730-06.

---

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
