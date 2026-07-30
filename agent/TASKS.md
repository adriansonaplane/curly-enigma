# Active tasks

## TASK-20260730-02 — Wave 1: D2 combat, AI, affixes, bosses, and mercenaries

- **Created:** 2026-07-30 01:23:44 UTC
- **Author:** Sol (`/root`)
- **Owners:** Wave 1 implementation agent and independent reviewer
- **Status:** active; revalidation required
- **Related:** `/root/wave1`, `366c6ff`, `TASK-20260730-01`, `VITAL.md`

### Work items

1. Require line of sight for caster and summoner attacks; reposition without
   consuming cooldown when sight is blocked.
2. Carry the originating skill ID/name through projectiles, pending meteors,
   storms, grounds, explosions, and damage-meter attribution.
3. Aggregate and apply `stunOnHit` and weapon-projectile `pierce` affixes with
   explicit semantics and deterministic coverage.
4. Add ownership, living-add caps, and boss-death cleanup for boss summons.
5. Build persistent Diablo-style mercenaries: archetypes, hiring, follow/combat
   AI, equipment, leveling, death/resurrection, transitions, and save migration.

### Acceptance criteria

- Revalidate each item against the latest baseline before editing.
- Add deterministic regression coverage for every confirmed mechanic.
- Document formulas, caps, ownership, and save compatibility.
- Obtain reviewer acceptance for AI behavior and mercenary usability.

### Mini log

- 2026-07-30 01:23:44 UTC — Sol (`/root`) — active — All Wave 1 findings copied
  from the workspace review into the shared coordination branch.

### Consensus

- [ ] Wave 1 owner — implementation and evidence complete
- [ ] Mechanics reviewer — formulas and behavior accepted

## TASK-20260730-03 — Wave 2: modern MMO character and world UI

- **Created:** 2026-07-30 01:23:44 UTC
- **Author:** Sol (`/root`)
- **Owners:** Wave 2 implementation agent and visual-fidelity reviewer
- **Status:** active; revalidation required
- **Related:** `/root/wave2`, `366c6ff`, `TASK-20260730-01`, `VITAL.md`

### Work items

1. Render the character-sheet equipment paperdoll with all slots, tooltips,
   explicit unequip actions, and a defined gear-score formula.
2. Implement inventory search/filter/sort, stable positions, drag/drop, swapping,
   explicit equip/drop actions, and either real footprints or removal of dead UI.
3. Build prerequisite-driven class skill trees with coordinates, connectors,
   allocation validation, ranks, lock reasons, synergies, and action-bar dragging.
4. Separate actual player party frames from summon/pet frames; add roles, status,
   range, leadership, targeting, context actions, and persistent layouts.
5. Add a scalable full explored-map overlay with a keybind, zoom/pan, orientation,
   opacity, legend, marker filters, and quest objectives.
6. Replace reload-based layout reset with confirmation and immediate safe reset.
7. Add minimap visibility, scale, orientation, and marker-category settings.

### Acceptance criteria

- Revalidate each item against PRs #63–#83 and newer commits.
- Capture screenshots for every perceptible panel or HUD change.
- Run interaction, persistence, keyboard, scaling, and viewport checks.
- A separate harsh visual reviewer must record concrete acceptance or defects.

### Mini log

- 2026-07-30 01:23:44 UTC — Sol (`/root`) — active — All Wave 2 findings copied
  into a bounded implementation and visual-review task.

### Consensus

- [ ] Wave 2 owner — implementation and evidence complete
- [ ] Visual reviewer — presentation and interaction accepted

## TASK-20260730-04 — Wave 3: narrative, role-playing, and world reactivity

- **Created:** 2026-07-30 01:23:44 UTC
- **Author:** Sol (`/root`)
- **Owners:** Wave 3 implementation agent and narrative reviewer
- **Status:** active; revalidation required
- **Related:** `/root/wave3`, `366c6ff`, PRs #79–#83, `TASK-20260730-01`

### Work items

1. Revalidate and finish dedicated quest, dialogue, faction, and lore modules and
   their dependency-order wiring in `index.html`.
2. Finish branching, stateful NPC dialogue with conditions, choices,
   consequences, skill checks, services, visited state, and save migration.
3. Finish the offered/accepted/objectives/ready/turned-in/completed/failed quest
   lifecycle with givers, prerequisites, sequencing, branches, and consequences.
4. Finish persistent factions and reputation tiers affecting dialogue, quests,
   prices, access, rewards, hostility, and visible UI.
5. Finish structured lore discovery, chained unlocks, announcements, unread state,
   safe rendering, search, filtering, and persistence.
6. Finish authored environmental clues with stable state, inspection outcomes,
   quest/dialogue/faction/codex hooks, readable props, and minimap secrecy.

### Acceptance criteria

- Treat merged PRs #79–#83 as likely partial/full implementations; close or refine
  tasks only after inspecting code and recording commit evidence.
- Exercise legacy saves and meaningful cross-system consequences.
- Review prose consistency, choice clarity, accessibility, and environmental
  readability independently from implementation.

### Mini log

- 2026-07-30 01:23:44 UTC — Sol (`/root`) — active — All Wave 3 findings recorded
  with explicit awareness of intervening narrative merges.

### Consensus

- [ ] Wave 3 owner — current-baseline scope and evidence complete
- [ ] Narrative reviewer — story, choice, and world feedback accepted

## TASK-20260730-01 — Revalidate three Wave reports

- **Created:** 2026-07-30 01:15:56 UTC
- **Author:** Sol (`/root`)
- **Owners:** next Wave implementation agents
- **Status:** active
- **Related:** `79165c4`, `366c6ff`, `SUBAGENTS.md`, `VITAL.md`

### Acceptance criteria

- Recheck every reported Wave 1–3 gap against the latest agreed baseline.
- Close already-implemented findings with commit and PR evidence.
- Split confirmed gaps into bounded implementation and visual-review tasks.
- Record exact verification commands and screenshots for perceptible changes.
- Keep coordination commits Markdown-only and on `codex/agent-coordination`.

### Mini log

- 2026-07-30 01:15:56 UTC — Sol (`/root`) — active — Audit records restored;
  implementation awaits current-baseline revalidation.

### Consensus

- [x] Sol (`/root`) — accepted at 2026-07-30 01:15:56 UTC
- [ ] Wave implementation owners — findings confirmed
- [ ] Visual reviewers — visible acceptance criteria confirmed

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
