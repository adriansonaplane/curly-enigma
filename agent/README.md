# Agent documentation branch

## NOTE-20260729-193521 — Agent branch operating policy

- **Created:** 2026-07-29 19:35:21 UTC
- **Author:** Sol (`/root`)
- **Type:** plan
- **Owners:** all active agents; project owner Adrian
- **Status:** active
- **Branch:** `agent`

### Purpose

The `agent` branch is the always-current coordination surface for agents working
with Alex and project owner Adrian. At the start of work, look for the local or
remote `agent` branch. If it does not exist, create it from the current agreed
baseline. Update it on demand whenever assignments, risks, decisions, status,
questions, or handoffs materially change.

Use a separate worktree so shared implementation work is never disrupted:

```sh
git fetch --all --prune
git show-ref --verify --quiet refs/heads/agent || git branch agent HEAD
git worktree add ../curly-enigma-agent agent
```

The branch may modify **Markdown files only**. Before each documentation commit:

```sh
test -z "$(git diff --cached --name-only --diff-filter=ACMR | awk '!/\.md$/')"
```

### Working rules

1. Read `VITAL.md` at task start, before risky/destructive actions, before every
   commit or handoff, and at reasonable intervals during long tasks.
2. Add named, UTC-timestamped comments to the appropriate files:
   `DISCUSSIONS.md`, `TASKS.md`, `FEATURES.md`, `PLANS.md`, `QUESTIONS.md`, and
   `COMMENTS.md`. Link related note and task IDs rather than duplicating context.
3. Every note contains a **Mini log**. Every material touch appends a one-line
   status check, even if status did not change.
4. Agents work asynchronously and should not wait for routine feedback. Feedback
   is vital only for destructive changes, security/data-loss risks, conflicting
   ownership, a hard dependency, an unresolved vital notice, or a decision only
   Adrian can make.
5. Discussion stays open while a task is active. Closure requires every current
   participant to record agreement that its acceptance criteria are met. Do not
   infer silence as agreement. If someone is unavailable, escalate to Adrian;
   only the owner may waive or replace that participant's acknowledgement.
6. After consensus, move the task and its linked discussion/comments to
   `archive/YYYY-MM.md`, then remove them from active files. Never delete the
   history.
7. Rebase/pull the documentation worktree before updating and commit frequently
   enough that the branch remains useful on demand.

### Common note template

```md
## NOTE-YYYYMMDD-HHMMSS — Short title
- **Created:** YYYY-MM-DD HH:MM:SS UTC
- **Author:** Name (`/root/path`)
- **Type:** discussion | task | feature | plan | question | comment | vital
- **Owners:** names/paths
- **Status:** proposed | active | blocked | review | consensus | archived
- **Related:** task/note/commit links
### Content
...
### Mini log
- YYYY-MM-DD HH:MM:SS UTC — Name/path — status — result and next check
### Consensus
- [ ] Name/path — agreement timestamp or reason pending
```

### Mini log

- 2026-07-29 19:35:21 UTC — Sol (`/root`) — active — Policy created; local
  `agent` branch is required and will be created after this documentation commit.

### Consensus

- [x] Sol (`/root`) — accepted at 2026-07-29 19:35:21 UTC
- [x] Coordination Policy (`/root/coordination_policy`) — recommended this
  workflow at 2026-07-29 19:34:45 UTC

