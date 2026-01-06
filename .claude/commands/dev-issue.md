# Issue Development Workflow v6

Pick up the next ready issue, assess it, and either complete it or document blockers.
Designed for autonomous operation with subagent delegation and memory-assisted context.

**Arguments:** `$ARGUMENTS` (optional: issue number to work on specific issue)

---

## Issue Locking Protocol

To prevent multiple agents from working on the same issue simultaneously:

1. **Claim with label:** Add `in-progress` label immediately when selecting an issue
2. **Race detection:** Re-fetch issue after claiming; abort if another agent also claimed it (check for conflicting comments/assignees added in the same window)
3. **Release on exit:** Remove `in-progress` label when done (success or blocked)

**Label lifecycle:**

```text
ready → in-progress (agent claims) → ready (released on completion/block)
```

**Important:** Issues with `in-progress` label are automatically excluded from the available issues query. An agent that crashes without releasing the lock will leave the issue marked—humans or other agents can manually remove `in-progress` to reclaim stale locks.

---

## Worktree Requirement

**MANDATORY:** Always create a worktree for issue work. Never work directly on main.

```bash
# Required pattern - always use worktrees with absolute paths
git worktree add ../Rackula-issue-<N> -b <type>/<N>-<desc>
WORKTREE_DIR="$(pwd)/../Rackula-issue-<N>"
(cd "$WORKTREE_DIR" && npm install)
```

**Important:** Use `WORKTREE_DIR` variable and subshells `(cd "$WORKTREE_DIR" && ...)` for all worktree commands. Claude Code's session stays anchored to the main project directory, so regular `cd` commands get reset.

This ensures:

- Parallel agents don't conflict on the same directory
- Main branch stays clean
- Easy cleanup if work is abandoned
- No "Shell cwd was reset" token waste

---

## CRITICAL: Branch Checkout Rules

**NEVER run these commands in the main Rackula directory:**

```bash
# FORBIDDEN in main directory:
git checkout <branch>      # ❌ Changes branch for ALL agents
git switch <branch>        # ❌ Same problem
git checkout -b <branch>   # ❌ Creates and switches
```

**The main directory must ALWAYS stay on `main` branch.** Multiple agents share this directory, and switching branches causes conflicts.

**ALWAYS use worktrees instead:**

```bash
# CORRECT: Create isolated worktree with absolute paths
git worktree add ../Rackula-issue-<N> -b <type>/<N>-<desc>
WORKTREE_DIR="$(pwd)/../Rackula-issue-<N>"
(cd "$WORKTREE_DIR" && npm install)
# Use subshells for all worktree commands: (cd "$WORKTREE_DIR" && <command>)
```

**If you find main directory on wrong branch:**

```bash
# Fix it immediately:
git checkout main
```

---

## Permissions

You have **explicit permission** to perform WITHOUT asking:

| Action       | Scope                                                       |
| ------------ | ----------------------------------------------------------- | ---- | ----- | -------- | ---- | ------------------ |
| Git branches | `(fix                                                       | feat | chore | refactor | test | docs)/<number>-\*` |
| Worktrees    | Sibling directories `Rackula-issue-<N>`                     |
| Edit files   | `src/`, `docs/`, test files                                 |
| Commands     | `npm test`, `npm run build`, `npm run lint`, `gh` CLI       |
| Git ops      | add, commit, push (non-main), fetch, pull, worktree         |
| PRs          | `gh pr create`, `gh pr merge --squash` after checks pass    |
| Issue labels | `gh issue edit --add-label`, `--remove-label` (for locking) |

**STOP and ask for:** Force push, direct main operations, deleting branches/worktrees not created this session, genuine ambiguity.

---

## Decision Flow

```text
START
  │
  ├─ Argument provided? ──yes──▶ Work on issue #$ARGUMENTS
  │                              Skip to PHASE 2
  │
  ├─ In worktree? ──yes──▶ Extract issue # from branch
  │                        Skip to PHASE 2
  │
  └─ In main directory ──▶ PHASE 1: Find next issue
                                │
                                ▼
                           PHASE 2: Assess
                                │
                                ▼
                    ┌─── Claim issue (add in-progress label) ───┐
                    │                                           │
                    ▼                                           ▼
              Race detected?                              Claimed OK
              (abort conditions)                               │
                    │                                          │
                    ▼                                          │
              Release label,                                   │
              try next issue                                   │
                    │                                          │
                    └──────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              size:small              size:medium+
              ≤3 files                or complex
              explicit AC                  │
                    │                      ▼
                    │              Launch Plan agent
                    │                      │
                    └──────────┬───────────┘
                               ▼
                    Create worktree (MANDATORY)
                               │
                               ▼
                         PHASE 3: Implement (TDD)
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                 Success              Failure
                    │                     │
                    ▼                     ▼
              Create PR            Error Recovery
              Merge                (3 attempts max)
              Release label              │
              Clean up             ┌─────┴─────┐
                    │              ▼           ▼
                    ▼          Resolved    BLOCKED
              PHASE 4:             │           │
              More issues?         │     Release label
                    │              │     WIP commit
                    ▼              │     Comment
              Loop or Stop         └─────┬─────┘
                                         ▼
                                       STOP
```

---

## Quick Reference

### Commands

```bash
# Verification (run in worktree using subshell)
(cd "$WORKTREE_DIR" && npm run lint && npm run test:run && npm run build)

# Test specific file (in worktree)
(cd "$WORKTREE_DIR" && npm run test -- src/tests/<File>.test.ts --reporter=verbose)

# Worktrees (always define WORKTREE_DIR after creation)
git worktree add ../Rackula-issue-<N> -b <type>/<N>-<desc>
WORKTREE_DIR="$(pwd)/../Rackula-issue-<N>"
git worktree list
git worktree remove ../Rackula-issue-<N>
```

### Memory Search (mem-search skill)

| Purpose                 | Query                                                 |
| ----------------------- | ----------------------------------------------------- |
| Recent context          | `get_recent_context` with project="Rackula", limit=30 |
| Past work on issue      | `search` with query="#<N> OR <keywords>"              |
| Architectural decisions | `search` with type="decision", concepts="<area>"      |
| Similar bugs            | `search` with type="bugfix", query="<error keywords>" |

### Issue Type Checklists

**bug:** Reproduce → failing test → fix → check similar patterns
**feature:** Understand AC → plan if complex → TDD → update docs
**area:ui:** Keyboard nav, theme support, design tokens (no hardcoded values)

---

## Phase 1: Pre-flight

> Skip this phase if argument provided or already in a worktree.

### 1a. Main Branch Verification (FIRST)

**Before anything else**, verify main directory is on `main` branch:

```bash
cd /path/to/Rackula  # main directory
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ]; then
  echo "ERROR: Main directory on wrong branch: $CURRENT"
  echo "Fixing..."
  git checkout main
fi
```

If this check fails, another agent made a mistake. Fix it before proceeding.

---

Launch these operations **in parallel** using Task tool:

### 1b. Worktree Detection (Bash)

Check `git worktree list` to identify claimed issues (extract issue numbers from branch names like `fix/42-*`). Store claimed numbers to filter from available issues.

### 1c. Context Loading (mem-search skill)

Use `get_recent_context` for project="Rackula", limit=30.

If memory lacks architecture coverage, use Explore agent to summarize SPEC.md and ARCHITECTURE.md (under 500 words).

### 1d. WIP Branch Check (Bash)

```bash
git fetch origin --prune
git branch -a | grep -E "(fix|feat|chore|refactor|test|docs)/" || echo "No WIP branches"
```

### 1e. Issue Fetch (Bash)

Fetch top 5 ready issues sorted by priority then size, **excluding in-progress**:

```bash
gh issue list -R RackulaLives/Rackula --state open --label ready \
  --json number,title,labels,body \
  --jq '[.[] | select(.labels | map(.name) | any(. == "in-progress") | not)] |
  sort_by(
    (.labels | map(.name) | if any(test("priority:urgent")) then 0
      elif any(test("priority:high")) then 1
      elif any(test("priority:medium")) then 2
      else 3 end),
    (.labels | map(.name) | if any(test("size:small")) then 0
      elif any(test("size:medium")) then 1
      else 2 end)
  ) | .[0:5]'
```

Filter out worktree-claimed issues. If none remain, report "No ready issues available" and stop.

<!-- CHECKPOINT: Phase 1 Complete -->

---

## Phase 2: Issue Assessment

### 2a. Select and Claim Issue

Pick first available issue (or use provided argument).

**Step 1: Claim the issue immediately** by adding the `in-progress` label:

```bash
gh issue edit <number> --add-label "in-progress"
```

**Step 2: Race detection** — wait 2 seconds, then re-fetch to verify no conflict:

```bash
sleep 2
gh issue view <number> --json number,title,body,labels,comments,assignees
```

**Abort conditions** (another agent may have claimed simultaneously):

- Issue has an assignee that wasn't there before
- A comment was added within the race detection window
- Issue no longer has `ready` label

If any abort condition is true: remove `in-progress` label and try the next issue.

### 2b. Historical Context (mem-search skill)

Search for prior work: query="#<number> OR <title keywords>", type="decision,bugfix"

This reveals prior attempts, design decisions, known patterns, and past blockers. Review before planning—don't repeat failed approaches.

### 2c. Complexity Assessment

| Criteria            | Simple               | Complex                   |
| ------------------- | -------------------- | ------------------------- |
| Size label          | `size:small`         | `size:medium` or larger   |
| Acceptance criteria | Explicit             | Needs interpretation      |
| Files affected      | ≤3                   | >3 or multiple subsystems |
| Type                | Bug fix, small tweak | Feature, architectural    |

**Simple:** Proceed directly to Phase 3.
**Complex:** Launch Plan agent first with issue body, acceptance criteria, and any relevant memory context. Output numbered implementation plan.

### 2d. Identify Affected Files

If not obvious from issue, use Explore agent: "Find files related to <feature/component>. Search imports, types, component usages, tests."

<!-- CHECKPOINT: Phase 2 Complete -->

---

## Phase 3: Implementation

### 3a. Create Worktree (MANDATORY)

**If already in worktree for this issue:** Skip (branch exists).

**Otherwise, ALWAYS create a worktree** (never work on main):

```bash
# From main directory - use absolute paths pattern
git fetch origin main
git worktree add ../Rackula-issue-<N> -b <type>/<N>-<short-description> origin/main
WORKTREE_DIR="$(pwd)/../Rackula-issue-<N>"
(cd "$WORKTREE_DIR" && npm install)
```

**Important:** Always define `WORKTREE_DIR` and use subshells `(cd "$WORKTREE_DIR" && ...)` for commands. Claude Code's session stays anchored to the main directory, so regular `cd` commands get reset.

**Why mandatory:**

- Prevents conflicts between parallel agent sessions
- Keeps main branch clean for other agents
- Allows easy cleanup if work is abandoned
- Isolates npm dependencies per issue
- Avoids "Shell cwd was reset" token waste

### 3b. Update Progress File

Add entry to `.claude/session-progress.md` with: issue number, title, start time, branch name, status "In Progress", and acceptance criteria as checkboxes.

### 3c. TDD Workflow

For each acceptance criterion:

1. Write failing test first
2. Implement minimum code to pass
3. Verify test passes
4. Mark criterion complete in progress file

### 3d. Pre-Commit Verification

```bash
(cd "$WORKTREE_DIR" && npm run lint && npm run test:run && npm run build)
```

If failures: see Error Recovery section.

### 3e. Commit and Push

Commit with conventional format: `<type>: <description>` with `Fixes #<number>` in body.
Push to origin with `-u` flag.

### 3f. Create PR

Use `gh pr create` with:

- Title: `<type>: <description> (#<number>)`
- Body: Summary bullets, files changed, test plan checklist, `Closes #<number>`

### 3g. Merge

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch --auto
```

### 3h. Cleanup

1. **Release the lock** — remove `in-progress` label (issue will close via PR merge):

   ```bash
   gh issue edit <number> --remove-label "in-progress"
   ```

2. If using worktree, return to main directory, pull, remove worktree, prune:

   ```bash
   cd /path/to/Rackula  # main directory
   git pull origin main
   git worktree remove ../Rackula-issue-<N>
   git worktree prune
   ```

3. Update progress file status to "Completed" with PR URL.

<!-- CHECKPOINT: Phase 3 Complete -->

---

## Phase 4: Continue or Stop

Check for more ready issues (excluding in-progress):

```bash
gh issue list -R RackulaLives/Rackula --state open --label ready \
  --json number,labels \
  --jq '[.[] | select(.labels | map(.name) | any(. == "in-progress") | not)] | length'
```

**Continue if:** More issues exist AND in autonomous mode → Return to Phase 1
**Stop if:** No issues remain, blocker hit, or user interruption

Write session summary when stopping.

---

## Error Recovery

### Test Failures

| Attempt | Action                                                                  |
| ------- | ----------------------------------------------------------------------- |
| 1       | Read output, fix obvious issues                                         |
| 2       | Search memory for similar bugs: type="bugfix", query="<error keywords>" |
| 3       | Launch Plan agent with test output, code, and memory context            |
| 4+      | Proceed to Blocker Handling                                             |

### Lint/Build Failures

Usually auto-fixable: `npm run lint -- --fix`
If not, read error and fix manually.

---

## Blocker Handling

1. **Commit WIP:** `git commit -m "wip: partial progress on #<N>" --no-verify && git push`

2. **Release the lock** — remove `in-progress` label, so others can pick it up:

   ```bash
   gh issue edit <N> --remove-label "in-progress"
   ```

3. **Comment on issue** with status, completed items, blocker description, what was attempted, next steps needed, WIP branch name

4. **Update progress file** with BLOCKED status and blocker description

5. **Stop** — do not continue to next issue (blocker needs human attention)

---

## Context Management

If working on a long session and context is filling up:

1. Commit any WIP with descriptive message
2. Update progress file with current state
3. The session can be resumed from the WIP branch

---

## Output Format

### After Each Issue

```markdown
## Issue #<number>: <title>

**Status:** ✅ Completed | ❌ Blocked
**Branch:** `<branch-name>`
**PR:** <url>

**Summary:** <what was done>

**Files Changed:**

- `file.ts`: <change summary>

**Key Learnings:** (auto-captured by claude-mem)

- <patterns discovered>
- <non-obvious decisions>
```

### Session End

```markdown
## Session Summary

**Completed:** N issues
**Blocked:** M issues

**Completed:**

1. #42: Title - PR #123

**Blocked:**

1. #44: Title - <reason>
```
