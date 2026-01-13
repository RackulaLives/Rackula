# Worktree Cleanup Workflow v1

Clean up stale worktrees and associated branches.

**Arguments:** `$ARGUMENTS` (optional: "list" for dry-run, "all" for cleanup all)

---

## When to Use

- End of work session
- Before starting new issue work
- When `git worktree list` shows multiple entries
- Proactively after merging PRs

**Triggers for Claude to invoke proactively:**

- Conversation mentions "clean up" or "tidy"
- More than 2 worktrees exist
- Starting `/dev-issue` and stale worktrees detected

---

## Workflow

### 1. Inventory

```bash
git worktree list
git branch -vv | grep -E "gone]"  # Find orphaned branches (remote deleted)
```

Report current state before any changes.

### 2. Classify Each Worktree

For each worktree (except main), determine status:

| Status   | Criteria                                     | Action          |
| -------- | -------------------------------------------- | --------------- |
| Active   | Has uncommitted changes                      | Skip, warn user |
| Merged   | Branch merged to main (check with `gh pr`)   | Safe to remove  |
| Orphaned | Remote branch deleted (`gone]` in branch -vv)| Safe to remove  |
| Stale    | No commits in 7+ days, no open PR            | Ask user        |

**Check for open PRs:**

```bash
gh pr list --head <branch-name> --state open --json number
```

### 3. Cleanup (with confirmation)

**If `$ARGUMENTS` is "list":** Report what would be removed, don't remove.

**If `$ARGUMENTS` is "all":** Remove all safe-to-remove without asking.

**Otherwise:** Ask for confirmation on each.

```bash
# For each safe-to-remove worktree:
git worktree remove .worktree/<name>
git branch -d <branch>  # Delete local branch if exists
git worktree prune
```

### 4. Summary

Report:
- Removed: N worktrees
- Kept: M worktrees (with reasons for each)
- Remaining branches: list any orphaned local branches

---

## Integration

**References:** `superpowers:using-git-worktrees` for creation patterns
**Called by:** `/dev-issue` (at session end), manually when needed

---

## Examples

```bash
# Dry run - see what would be cleaned
/worktree-cleanup list

# Clean up all safe worktrees
/worktree-cleanup all

# Interactive cleanup (default)
/worktree-cleanup
```
