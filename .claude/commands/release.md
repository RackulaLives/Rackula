# Release Workflow v2 (CalVer)

Create a new release with changelog entry, version bump, and tag push.
CHANGELOG.md is the single source of truth — GitHub releases derive from it.

**Arguments:** `$ARGUMENTS` (optional)

- No argument → auto-compute next CalVer version via `scripts/next-version.sh --dry-run`
- Explicit version → use the given version string (e.g., `26.7.0`)

---

## Permissions

| Action | Scope                                         |
| ------ | --------------------------------------------- |
| Git    | add, commit, tag, push (to main)              |
| npm    | version (no-git-tag-version)                  |
| GitHub | None (GitHub Action handles release creation) |

**Commands allowed:** `git log`, `git tag`, `gh pr list`, `gh issue list`, `npm version`, `scripts/next-version.sh`, `scripts/contributors.sh`

---

## Workflow

```text
START
  │
  ├─ Parse $ARGUMENTS → determine version source
  │   (empty: auto-compute via next-version.sh)
  │   (explicit: use given version string)
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
  │   - Compute or validate version
  │   - npm version $NEW_VERSION --no-git-tag-version
  │   - git add && git commit
  │   - git tag v$NEW_VERSION
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
HAS_LAST_TAG=true
if [ -z "$LAST_TAG" ]; then
  HAS_LAST_TAG=false
  echo "No previous tags found. This will be the first release."
  LAST_TAG="HEAD~100"  # Fall back to recent history for range-based queries
fi
echo "Last release: $LAST_TAG"
```

### 1b. Get Commits Since Last Release

```bash
git log "$LAST_TAG"..HEAD --oneline --no-merges
```

### 1c. Get Merged PRs Since Last Release

```bash
# Get the date of the last real tag (or use fixed fallback for first release)
if [ "$HAS_LAST_TAG" = true ]; then
  LAST_DATE=$(git log -1 --format=%aI "$LAST_TAG" 2>/dev/null || echo "2025-01-01")
else
  LAST_DATE="2025-01-01"
fi

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

### 1e. Get Contributors Since Last Release

```bash
# Compute a preview version for contributor extraction (NEW_VERSION is set in Phase 4)
PREVIEW_VERSION="$ARGUMENTS"
if [ -z "$PREVIEW_VERSION" ]; then
  PREVIEW_VERSION=$(scripts/next-version.sh --dry-run)
fi
scripts/contributors.sh "$LAST_TAG" "$PREVIEW_VERSION" --dry-run
```

This outputs a markdown block listing external contributors (excluding bots and the maintainer) with their merged PRs. Review this alongside the changelog draft.

---

## Phase 2: Draft Changelog Entry

### Categories (Keep a Changelog)

| Category       | Use For                                   |
| -------------- | ----------------------------------------- |
| **Added**      | New features                              |
| **Changed**    | Changes to existing functionality         |
| **Deprecated** | Soon-to-be removed features               |
| **Removed**    | Removed features                          |
| **Fixed**      | Bug fixes                                 |
| **Security**   | Vulnerability fixes                       |
| **Technical**  | Internal changes (CI, tests, refactoring) |

### Formatting Rules

1. **No emojis** in changelog entries
2. **Link format**: `(#123, PR #456)` when both issue and PR exist
3. **Concise descriptions**: Focus on what changed, not implementation details
4. **Consolidate related changes**: Group similar items (e.g., "3 new brand packs")
5. **User-focused language**: Describe impact, not code changes

### Entry Template

```markdown
## [YY.M.MICRO] - YYYY-MM-DD

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

=== CONTRIBUTOR ACKNOWLEDGEMENTS ===

[Contributor block from step 1e]

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
- Update ACKNOWLEDGEMENTS.md with contributor acknowledgements
- Update SECURITY.md supported version
- Bump version in package.json
- Create git tag v$NEW_VERSION
- Push to origin (triggers GitHub Action)

Proceed? [y/n]:
```

**STOP** if user says no.

---

## Phase 4: Execute Release

### 4a. Compute New Version

**No argument (auto-compute):**

```bash
if ! NEW_VERSION=$(scripts/next-version.sh --dry-run); then
  echo "ERROR: Failed to compute next version. Check scripts/next-version.sh output."
  exit 1
fi
# Check for duplicate local tag
if git tag -l "v$NEW_VERSION" | grep -q .; then
  echo "ERROR: Local tag v$NEW_VERSION already exists."
  exit 1
fi
# Check for duplicate remote tag (fail early before making any changes)
if git ls-remote --tags origin "refs/tags/v$NEW_VERSION" | grep -q .; then
  echo "ERROR: Remote tag v$NEW_VERSION already exists on origin."
  exit 1
fi
```

**Explicit version:**

```bash
NEW_VERSION="$ARGUMENTS"
# Validate format: YY.M.MICRO (three numeric segments, unpadded month)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ERROR: Version '$NEW_VERSION' is not valid CalVer format (expected YY.M.MICRO, e.g., 26.6.0)"
  exit 1
fi
# Reject zero-padded month (e.g., 26.06.0 is invalid; 26.6.0 is valid)
MONTH_PART=$(echo "$NEW_VERSION" | cut -d. -f2)
if [ "$MONTH_PART" != "$(echo "$MONTH_PART" | sed 's/^0//')" ]; then
  echo "ERROR: Month component must be unpadded (got $MONTH_PART, expected $(echo "$MONTH_PART" | sed 's/^0//'))"
  exit 1
fi
# Check for duplicate local tag
if git tag -l "v$NEW_VERSION" | grep -q .; then
  echo "ERROR: Local tag v$NEW_VERSION already exists."
  exit 1
fi
# Check for duplicate remote tag (fail early before making any changes)
if git ls-remote --tags origin "refs/tags/v$NEW_VERSION" | grep -q .; then
  echo "ERROR: Remote tag v$NEW_VERSION already exists on origin."
  exit 1
fi
```

Show version transition:

```bash
CURRENT=$(node -p "require('./package.json').version")
echo "Version: $CURRENT → $NEW_VERSION"
```

### 4b. Update CHANGELOG.md

Insert the new entry after the header (line 7) and before the first existing version entry.

Use the Edit tool to insert the changelog entry at the correct position.

### 4c. Update SECURITY.md

Update the supported versions table in SECURITY.md to reflect the new release version.

Use the Edit tool to replace the version table:

```markdown
| Version        | Supported          |
| -------------- | ------------------ |
| $NEW_VERSION   | :white_check_mark: |
| < $NEW_VERSION | :x:                |
```

This ensures SECURITY.md always shows the current release as the only supported version.

### 4d. Update ACKNOWLEDGEMENTS.md

Run the contributors script to insert the per-release contributor block:

```bash
scripts/contributors.sh "$LAST_TAG" "$NEW_VERSION"
```

If the script reports that the version heading already exists (idempotent), it will skip without error. If `gh` is not authenticated, the script will warn and continue without blocking the release.

### 4e. Commit Release Files

```bash
git add CHANGELOG.md SECURITY.md ACKNOWLEDGEMENTS.md
git commit -m "docs: update changelog, acknowledgements, and security policy for v$NEW_VERSION"
```

### 4f. Bump Version

```bash
npm version "$NEW_VERSION" --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): bump version to v$NEW_VERSION"
```

### 4g. Create Tag and Push

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

| Scenario                      | Response                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| No changes since last release | "No changes found. Nothing to release."                                              |
| Uncommitted changes           | "Error: Working directory not clean. Commit or stash changes first."                 |
| Not on main branch            | "Error: Must be on main branch to release."                                          |
| Tag already exists            | "Error: Tag vX.Y.Z already exists (locally or on origin)."                           |
| next-version.sh fails         | "Error: Failed to compute next version. Check scripts/next-version.sh output."       |
| Invalid explicit version      | "Error: Version 'X' is not valid CalVer format (expected YY.M.MICRO, e.g., 26.6.0)." |
| Zero-padded month             | "Error: Month must be unpadded (e.g., 26.6.0 not 26.06.0)."                          |
| Push fails                    | "Error: Push failed. Check permissions and try again."                               |
| contributors.sh fails   | Warn and continue. Contributor block is optional and can be added manually later. |

### Required Guard Implementation (Phase 4)

```bash
# Abort release if there are no releasable changes since last release.
# CHANGE_LINES should be the collected commit/PR lines prepared in earlier phases.
if [ -z "${CHANGE_LINES:-}" ]; then
  echo "No changes found. Nothing to release."
  exit 0
fi
```

---

## Output Format

### Success

```
=== Release v26.6.0 Complete ===

Changelog: Updated with 3 entries
Version: 0.10.1 → 26.6.0
Tag: v26.6.0

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
# Auto-compute next CalVer version (most common)
/release

# Explicit version (override computed version)
/release 26.7.0
```
