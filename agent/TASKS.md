# Active tasks

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
