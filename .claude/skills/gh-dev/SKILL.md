---
name: gh-dev
description: Pick up GitHub issues and develop them with worktree isolation. Works with any repo - auto-detects from current directory.
---

# GitHub Issue Development

Pick up the next issue, assess it, and either complete it or document blockers.
Works with any GitHub repository with worktree isolation.

**Arguments:** `$ARGUMENTS` (optional: issue number to work on specific issue)

---

## Repository Detection

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
REPO_NAME=$(gh repo view --json name -q .name 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "Not in a GitHub repository."
  exit 1
fi
```

---

## Issue Selection (Label-Free Fallback)

**Priority order:**

1. If `ready` label exists in repo → use labeled issues
2. If no `ready` label → fall back to lowest open issue number

```bash
# Check if ready label exists
HAS_READY=$(gh label list --json name -q '.[].name' | grep -q "^ready$" && echo "yes" || echo "no")

if [ "$HAS_READY" = "yes" ]; then
  gh issue list --label ready --state open --json number,title,labels
else
  gh issue list --state open --json number,title,labels | jq 'sort_by(.number) | .[0:5]'
fi
```

---

## Issue Locking

**If `in-progress` label exists:** Use it for locking (prevents parallel agents on same issue).

```bash
# Claim
gh issue edit <N> --add-label "in-progress"

# Release
gh issue edit <N> --remove-label "in-progress"
```

**If no `in-progress` label:** Skip locking (single-agent mode).

---

## Worktree Requirement

**MANDATORY:** Always create a worktree for issue work. Never work directly on main.

```bash
git worktree add .worktree/${REPO_NAME}-issue-<N> -b <type>/<N>-<desc> origin/main
WORKTREE_DIR="$(pwd)/.worktree/${REPO_NAME}-issue-<N>"
```

Use `WORKTREE_DIR` variable and subshells `(cd "$WORKTREE_DIR" && ...)` for all worktree commands.

---

## Branch Checkout Rules

**NEVER in main directory:**

```bash
git checkout <branch>      # Changes branch for ALL agents
git switch <branch>        # Same problem
```

**ALWAYS use worktrees:**

```bash
git worktree add .worktree/${REPO_NAME}-issue-<N> -b <type>/<N>-<desc>
```

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
                           PHASE 2: Assess & Claim
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Simple                   Complex
              (≤3 files)              (>3 files)
                    │                      │
                    │              Use Plan agent
                    │                      │
                    └──────────┬───────────┘
                               ▼
                    Create worktree (MANDATORY)
                               │
                               ▼
                         PHASE 3: Implement
                               │
                               ▼
                         Run verification
                               │
                               ▼
                    ┌──── CodeRabbit Review ◀───┐
                    │          │                │
                    │    Issues found?          │
                    │     yes      no           │
                    │      │       │            │
                    │      ▼       ▼            │
                    │   Fix all  Commit ────────┘
                    │   issues     │
                    │      │       ▼
                    └──────┘   Create PR
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                 Success              Blocked
                    │                     │
                    ▼                     ▼
              Merge               Release lock
              Cleanup              WIP commit
                    │              Comment on issue
                    ▼                     │
              PHASE 4:                    ▼
              More issues?              STOP
```

---

## Phase 1: Pre-flight

> Skip if argument provided or already in worktree.

### 1a. Main Branch Verification

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ] && [ "$CURRENT" != "master" ]; then
  echo "WARNING: Main directory on branch: $CURRENT"
  git checkout main || git checkout master
fi
```

### 1b. Worktree Detection

```bash
git worktree list
```

Extract claimed issue numbers from branch names.

### 1c. Issue Fetch

Using label-free fallback logic above. Exclude worktree-claimed issues.

---

## Phase 2: Issue Assessment

### 2a. Claim Issue

```bash
# If in-progress label exists
gh issue edit <N> --add-label "in-progress"
sleep 2
gh issue view <N> --json number,title,body,labels,assignees
```

**Abort conditions:** Assignee added, conflicting comment, `ready` label removed.

### 2b. Complexity Assessment

| Criteria       | Simple       | Complex                |
| -------------- | ------------ | ---------------------- |
| Size label     | `size:small` | `size:medium+`         |
| Files affected | ≤3           | >3                     |
| Type           | Bug fix      | Feature, architectural |

**Simple:** Proceed to Phase 3.
**Complex:** Use Plan agent first.

---

## Phase 3: Implementation

### 3a. Create Worktree

```bash
git fetch origin main || git fetch origin master
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@')
git worktree add .worktree/${REPO_NAME}-issue-<N> -b <type>/<N>-<desc> origin/${BASE_BRANCH}
WORKTREE_DIR="$(pwd)/.worktree/${REPO_NAME}-issue-<N>"
```

### 3b. Implement

Work on the issue. Follow acceptance criteria.

### 3c. Verification (if configured)

Check CLAUDE.md for `### Verification Commands`. If found, run them:

```bash
(cd "$WORKTREE_DIR" && <commands from CLAUDE.md>)
```

If not configured, skip or ask user.

### 3d. CodeRabbit Review Loop

**MANDATORY:** Run CodeRabbit review before committing. Address ALL feedback before proceeding.

```
┌─────────────────────────────────────────┐
│          CODERABBIT REVIEW LOOP         │
├─────────────────────────────────────────┤
│                                         │
│  1. Run coderabbit review               │
│         │                               │
│         ▼                               │
│  2. Issues found? ──no──▶ Proceed to    │
│         │                   commit      │
│        yes                              │
│         │                               │
│         ▼                               │
│  3. Create tasks from feedback          │
│         │                               │
│         ▼                               │
│  4. Implement fixes                     │
│         │                               │
│         ▼                               │
│  5. Re-run verification commands        │
│         │                               │
│         └────────▶ Back to step 1       │
│                                         │
└─────────────────────────────────────────┘
```

**Step 1: Run CodeRabbit**

```bash
(cd "$WORKTREE_DIR" && coderabbit --agent --type uncommitted 2>&1)
```

**Step 2: Parse Output**

CodeRabbit returns structured feedback with:

- `File:` - affected file path
- `Line:` - line range
- `Type:` - issue type (potential_issue, nitpick, etc.)
- `Prompt for AI Agent:` - description of what to fix

**Step 3: Create Tasks**

For each issue found, create a task with:

- Subject: Brief description from the prompt
- Description: Full CodeRabbit feedback including file/line

**Step 4: Implement Fixes**

Address each task in order. Mark completed as you go.

**Step 5: Re-verify**

After fixing all issues:

1. Run verification commands again (lint, test, build)
2. Run coderabbit again to confirm fixes
3. Only proceed when coderabbit returns no issues

**Exit Conditions:**

- **Success:** CodeRabbit returns "Review completed" with no issues → proceed to commit
- **Max iterations (3):** If issues persist after 3 cycles, ask user whether to proceed or abort

### 3e. Commit and Push

```bash
(cd "$WORKTREE_DIR" && git add -A && git commit -m "<type>: <desc>

Fixes #<N>" && git push -u origin <branch>)
```

### 3f. Create PR

```bash
(cd "$WORKTREE_DIR" && gh pr create \
  --title "<type>: <description> (#<N>)" \
  --body "## Summary
<bullets>

## Test Plan
- [ ] <verification>

Closes #<N>")
```

### 3g. Merge

```bash
gh pr checks <PR> --watch
gh pr merge <PR> --squash --delete-branch --auto
```

### 3h. Cleanup

```bash
# Release lock if label exists
gh issue edit <N> --remove-label "in-progress" 2>/dev/null || true

# Return to main, clean worktree
git checkout main || git checkout master
git pull
git worktree remove .worktree/${REPO_NAME}-issue-<N>
git worktree prune
```

---

## Phase 4: Continue or Stop

Check for more issues:

```bash
# Re-run issue fetch logic
```

**Continue if:** More issues AND autonomous mode.
**Stop if:** No issues, blocker hit, or user interruption.

---

## Blocker Handling

1. Commit WIP: `git commit -m "wip: partial #<N>" --no-verify && git push`
2. Release lock: `gh issue edit <N> --remove-label "in-progress"`
3. Comment on issue with status, blocker, what was attempted
4. Stop

---

## CLAUDE.md Overrides

If project has `## GitHub Workflow` section, read for:

### Verification Commands

````markdown
### Verification Commands

```bash
npm run lint
npm run test:run
npm run build
```
````

````

### Branch Prefixes

```markdown
### Branch Prefixes
- Bug: fix/
- Feature: feat/
- Chore: chore/
````

### Worktree Pattern

```markdown
### Worktree Pattern

.worktree/<custom>-issue-<N>
```

---

## Output Format

### After Each Issue

```markdown
## Issue #<N>: <title>

**Status:** Completed | Blocked
**Branch:** `<branch>`
**PR:** <url>

**Summary:** <what was done>

**Files Changed:**

- `file.ts`: <change>
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
