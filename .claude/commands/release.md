# Release Workflow v1

Create a new release with changelog entry, version bump, and tag push.
CHANGELOG.md is the single source of truth - GitHub releases derive from it.

**Arguments:** `$ARGUMENTS` (required: `patch`, `minor`, `major`, or explicit version like `0.7.0`)

---

## Permissions

| Action | Scope |
|--------|-------|
| Git | add, commit, tag, push (to main) |
| npm | version (no-git-tag-version) |
| GitHub | None (GitHub Action handles release creation) |

**Commands allowed:** `git log`, `git tag`, `gh pr list`, `gh issue list`, `npm version`

---

## Workflow

```text
START
  │
  ├─ Parse $ARGUMENTS → determine version type
  │
  ├─ PHASE 1: Gather Changes
  │   - git log since last tag
  │   - gh pr list --state merged since last release
  │   - gh issue list --state closed since last release
  │
  ├─ PHASE 2: Draft Changelog Entry
  │   - Categorize changes (Added, Changed, Fixed, etc.)
  │   - Format in Keep a Changelog style
  │   - Show preview to user
  │
  ├─ PHASE 3: User Confirmation
  │   - Allow edits to draft
  │   - Confirm ready to release
  │
  ├─ PHASE 4: Execute Release
  │   - Update CHANGELOG.md
  │   - Update SECURITY.md (supported version)
  │   - npm version [type] --no-git-tag-version
  │   - git add && git commit
  │   - git tag vX.Y.Z
  │   - git push && git push --tags
  │
  └─ PHASE 5: Monitor
      - Show link to GitHub Actions
      - Optionally watch for completion
```

---

## Phase 1: Gather Changes

### 1a. Get Last Release Tag

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  echo "No previous tags found. This will be the first release."
  LAST_TAG="HEAD~100"  # Fall back to recent history
fi
echo "Last release: $LAST_TAG"
```

### 1b. Get Commits Since Last Release

```bash
git log $LAST_TAG..HEAD --oneline --no-merges
```

### 1c. Get Merged PRs Since Last Release

```bash
# Get the date of the last tag
LAST_DATE=$(git log -1 --format=%aI $LAST_TAG 2>/dev/null || echo "2025-01-01")

gh pr list --state merged --search "merged:>$LAST_DATE" \
  --json number,title,labels \
  --jq '.[] | "- \(.title) (#\(.number))"'
```

### 1d. Get Closed Issues Since Last Release

```bash
gh issue list --state closed --search "closed:>$LAST_DATE" \
  --json number,title,labels \
  --jq '.[] | select(.labels | map(.name) | any(test("bug|feature|chore"))) | "#\(.number): \(.title)"'
```

---

## Phase 2: Draft Changelog Entry

### Categories (Keep a Changelog)

| Category | Use For |
|----------|---------|
| **Added** | New features |
| **Changed** | Changes to existing functionality |
| **Deprecated** | Soon-to-be removed features |
| **Removed** | Removed features |
| **Fixed** | Bug fixes |
| **Security** | Vulnerability fixes |
| **Technical** | Internal changes (CI, tests, refactoring) |

### Formatting Rules

1. **No emojis** in changelog entries
2. **Link format**: `(#123, PR #456)` when both issue and PR exist
3. **Concise descriptions**: Focus on what changed, not implementation details
4. **Consolidate related changes**: Group similar items (e.g., "3 new brand packs")
5. **User-focused language**: Describe impact, not code changes

### Entry Template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- Feature description (#issue, PR #pr)

### Changed

- Change description (#issue, PR #pr)

### Fixed

- Bug fix description (#issue, PR #pr)

### Technical

- Internal change description (PR #pr)
```

### Present Draft to User

Show the draft entry and ask:
```
=== CHANGELOG DRAFT ===

[Draft content here]

=== END DRAFT ===

Does this look correct? [y/n/edit]:
```

If 'edit', allow user to provide corrections and regenerate.

---

## Phase 3: User Confirmation

Before executing release:

```
Ready to release v$NEW_VERSION

Changes:
- Update CHANGELOG.md with new entry
- Update SECURITY.md supported version
- Bump version in package.json
- Create git tag vX.Y.Z
- Push to origin (triggers GitHub Action)

Proceed? [y/n]:
```

**STOP** if user says no.

---

## Phase 4: Execute Release

### 4a. Calculate New Version

```bash
CURRENT=$(node -p "require('./package.json').version")

case "$ARGUMENTS" in
  patch) NEW_VERSION=$(echo $CURRENT | awk -F. '{print $1"."$2"."$3+1}') ;;
  minor) NEW_VERSION=$(echo $CURRENT | awk -F. '{print $1"."$2+1".0"}') ;;
  major) NEW_VERSION=$(echo $CURRENT | awk -F. '{print $1+1".0.0"}') ;;
  *) NEW_VERSION="$ARGUMENTS" ;;  # Explicit version
esac
```

### 4b. Update CHANGELOG.md

Insert the new entry after the header (line 7) and before the first existing version entry.

Use the Edit tool to insert the changelog entry at the correct position.

### 4c. Update SECURITY.md

Update the supported versions table in SECURITY.md to reflect the new release version.

Use the Edit tool to replace the version table:

```markdown
| Version | Supported          |
| ------- | ------------------ |
| $NEW_VERSION   | :white_check_mark: |
| < $NEW_VERSION | :x:                |
```

This ensures SECURITY.md always shows the current release as the only supported version.

### 4d. Commit Release Files

```bash
git add CHANGELOG.md SECURITY.md
git commit -m "docs: update changelog and security policy for v$NEW_VERSION"
```

### 4e. Bump Version

```bash
npm version $NEW_VERSION --no-git-tag-version
git add package.json package-lock.json
git commit --amend -m "v$NEW_VERSION"
```

### 4f. Create Tag and Push

```bash
git tag "v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"
```

---

## Phase 5: Monitor

### Show Release Status

```bash
echo "Release v$NEW_VERSION initiated!"
echo ""
echo "GitHub Actions:"
echo "  - Release: https://github.com/RackulaLives/Rackula/actions/workflows/release.yml"
echo "  - Deploy:  https://github.com/RackulaLives/Rackula/actions/workflows/deploy-prod.yml"
echo ""
echo "Once complete, release will be at:"
echo "  https://github.com/RackulaLives/Rackula/releases/tag/v$NEW_VERSION"
```

### Optional: Watch CI

```bash
# User can optionally watch the release workflow
gh run list --workflow=release.yml --limit 1
gh run watch
```

---

## Error Handling

| Scenario | Response |
|----------|----------|
| No changes since last release | "No changes found. Nothing to release." |
| Uncommitted changes | "Error: Working directory not clean. Commit or stash changes first." |
| Not on main branch | "Error: Must be on main branch to release." |
| Tag already exists | "Error: Tag vX.Y.Z already exists." |
| Push fails | "Error: Push failed. Check permissions and try again." |

---

## Output Format

### Success

```
=== Release v0.6.11 Complete ===

Changelog: Updated with 3 entries
Version: 0.6.10 → 0.6.11
Tag: v0.6.11

GitHub Actions triggered:
- Release workflow: Creating GitHub release from CHANGELOG.md
- Deploy workflow: Building and deploying to production

Monitor at: https://github.com/RackulaLives/Rackula/actions
```

### Aborted

```
Release cancelled by user.
No changes were made.
```

---

## Quick Reference

```bash
# Patch release (bug fixes)
/release patch

# Minor release (new features)
/release minor

# Major release (breaking changes)
/release major

# Explicit version
/release 1.0.0
```
