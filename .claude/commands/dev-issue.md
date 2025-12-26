# Issue Development Workflow v5

Pick up the next ready issue, assess it, and either complete it or document blockers.
Designed for autonomous operation with subagent delegation and memory-assisted context.

**Arguments:** `$ARGUMENTS` (optional: issue number to work on specific issue)

---

## Permissions

You have **explicit permission** to perform WITHOUT asking:

| Action | Scope |
|--------|-------|
| Git branches | `(fix|feat|chore|refactor|test|docs)/<number>-*` |
| Worktrees | Sibling directories `Rackarr-issue-<N>` |
| Edit files | `src/`, `docs/`, test files |
| Commands | `npm test`, `npm run build`, `npm run lint`, `gh` CLI |
| Git ops | add, commit, push (non-main), fetch, pull, worktree |
| PRs | `gh pr create`, `gh pr merge --squash` after checks pass |

**STOP and ask for:** Force push, direct main operations, deleting branches/worktrees not created this session, genuine ambiguity.

---

## Decision Flow

```
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
                         PHASE 3: Implement (TDD)
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                 Success              Failure
                    │                     │
                    ▼                     ▼
              Create PR            Error Recovery
              Merge                (3 attempts max)
              Clean up                    │
                    │              ┌──────┴──────┐
                    ▼              ▼             ▼
              PHASE 4:         Resolved      BLOCKED
              More issues?         │             │
                    │              └──────┬──────┘
                    ▼                     ▼
              Loop or Stop           WIP commit
                                     Comment
                                     STOP
```

---

## Quick Reference

### Commands

```bash
# Verification (run before commit)
npm run lint && npm run test:run && npm run build

# Test specific file
npm run test -- src/tests/<File>.test.ts --reporter=verbose

# Worktrees
git worktree add ../Rackarr-issue-<N> -b <type>/<N>-<desc>
git worktree list
git worktree remove ../Rackarr-issue-<N>
```

### Memory Search (mem-search skill)

| Purpose | Query |
|---------|-------|
| Recent context | `get_recent_context` with project="Rackarr", limit=30 |
| Past work on issue | `search` with query="#<N> OR <keywords>" |
| Architectural decisions | `search` with type="decision", concepts="<area>" |
| Similar bugs | `search` with type="bugfix", query="<error keywords>" |

### Issue Type Checklists

**bug:** Reproduce → failing test → fix → check similar patterns
**feature:** Understand AC → plan if complex → TDD → update docs
**area:ui:** Keyboard nav, theme support, design tokens (no hardcoded values)

---

## Phase 1: Pre-flight

> Skip this phase if argument provided or already in a worktree.

Launch these operations **in parallel** using Task tool:

### 1a. Worktree Detection (Bash)

Check `git worktree list` to identify claimed issues (extract issue numbers from branch names like `fix/42-*`). Store claimed numbers to filter from available issues.

### 1b. Context Loading (mem-search skill)

Use `get_recent_context` for project="Rackarr", limit=30.

If memory lacks architecture coverage, use Explore agent to summarize SPEC.md and ARCHITECTURE.md (under 500 words).

### 1c. WIP Branch Check (Bash)

```bash
git fetch origin --prune
git branch -a | grep -E "(fix|feat|chore|refactor|test|docs)/" || echo "No WIP branches"
```

### 1d. Issue Fetch (Bash)

Fetch top 5 ready issues sorted by priority then size:
```bash
gh issue list -R Rackarr/Rackarr --state open --label ready \
  --json number,title,labels,body \
  --jq 'sort_by(
    (.labels | map(.name) | if any(test("priority:urgent")) then 0
      elif any(test("priority:high")) then 1
      elif any(test("priority:medium")) then 2
      else 3 end),
    (.labels | map(.name) | if any(test("size:small")) then 0
      elif any(test("size:medium")) then 1
      else 2 end)
  ) | .[0:5]'
```

Filter out claimed issues. If none remain, report "No ready issues available" and stop.

<!-- CHECKPOINT: Phase 1 Complete -->

---

## Phase 2: Issue Assessment

### 2a. Select Issue

Pick first available issue (or use provided argument). Fetch full details:
```bash
gh issue view <number> --json number,title,body,labels,comments
```

### 2b. Historical Context (mem-search skill)

Search for prior work: query="#<number> OR <title keywords>", type="decision,bugfix"

This reveals prior attempts, design decisions, known patterns, and past blockers. Review before planning—don't repeat failed approaches.

### 2c. Complexity Assessment

| Criteria | Simple | Complex |
|----------|--------|---------|
| Size label | `size:small` | `size:medium` or larger |
| Acceptance criteria | Explicit | Needs interpretation |
| Files affected | ≤3 | >3 or multiple subsystems |
| Type | Bug fix, small tweak | Feature, architectural |

**Simple:** Proceed directly to Phase 3.
**Complex:** Launch Plan agent first with issue body, acceptance criteria, and any relevant memory context. Output numbered implementation plan.

### 2d. Identify Affected Files

If not obvious from issue, use Explore agent: "Find files related to <feature/component>. Search imports, types, component usages, tests."

<!-- CHECKPOINT: Phase 2 Complete -->

---

## Phase 3: Implementation

### 3a. Create Branch

**If in worktree for this issue:** Skip (branch exists).

**Otherwise:**
```bash
git checkout main && git pull origin main
git checkout -b <type>/<number>-<short-description>
```

For parallel sessions, create worktree in sibling directory and run `npm install` there.

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
npm run lint && npm run test:run && npm run build
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

If using worktree: return to main directory, pull, remove worktree, prune.
Update progress file status to "Completed" with PR URL.

<!-- CHECKPOINT: Phase 3 Complete -->

---

## Phase 4: Continue or Stop

Check for more ready issues: `gh issue list -R Rackarr/Rackarr --state open --label ready --json number | jq 'length'`

**Continue if:** More issues exist AND in autonomous mode → Return to Phase 1
**Stop if:** No issues remain, blocker hit, or user interruption

Write session summary when stopping.

---

## Error Recovery

### Test Failures

| Attempt | Action |
|---------|--------|
| 1 | Read output, fix obvious issues |
| 2 | Search memory for similar bugs: type="bugfix", query="<error keywords>" |
| 3 | Launch Plan agent with test output, code, and memory context |
| 4+ | Proceed to Blocker Handling |

### Lint/Build Failures

Usually auto-fixable: `npm run lint -- --fix`
If not, read error and fix manually.

---

## Blocker Handling

1. **Commit WIP:** `git commit -m "wip: partial progress on #<N>" --no-verify && git push`

2. **Comment on issue** with: status, completed items, blocker description, what was attempted, next steps needed, WIP branch name

3. **Update progress file** with BLOCKED status and blocker description

4. **Stop** — do not continue to next issue

---

## Context Management

If working on a long session and context is filling up:
1. Commit any WIP with descriptive message
2. Update progress file with current state
3. The session can be resumed from the WIP branch

---

## Output Format

### After Each Issue

```
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

```
## Session Summary

**Completed:** N issues
**Blocked:** M issues

**Completed:**
1. #42: Title - PR #123

**Blocked:**
1. #44: Title - <reason>
```
