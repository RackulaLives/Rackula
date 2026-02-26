#!/usr/bin/env bash
# backfill-labels.sh — One-time label cleanup and migration
#
# Renames misspelled labels (preserving issue associations),
# merges duplicates, and removes obsolete labels.
#
# Usage:
#   ./scripts/backfill-labels.sh --dry-run    # Preview changes
#   ./scripts/backfill-labels.sh              # Apply changes
#
# Requires: gh CLI authenticated with repo access

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN — no changes will be made"
  echo "==========================================="
fi

REPO="RackulaLives/Rackula"

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    echo "  → $*"
    "$@" 2>/dev/null || echo "    (label not found, skipping)"
  fi
}

echo ""
echo "=== Phase 1: Rename misspelled labels ==="
echo ""

# Rename preserves all issue/PR associations
echo "Renaming 'area:data-schema-persistance' → 'area:data-schema-persistence'"
run gh label edit "area:data-schema-persistance" --name "area:data-schema-persistence" --repo "$REPO"

echo ""
echo "=== Phase 2: Merge duplicate labels ==="
echo ""

# For each duplicate, find issues with old label, apply new label, remove old label
merge_label() {
  local old="$1"
  local new="$2"
  echo "Merging '$old' → '$new'"

  if $DRY_RUN; then
    local count
    count=$(gh issue list --label "$old" --state all --repo "$REPO" --json number --jq 'length' 2>/dev/null || echo "0")
    echo "  [dry-run] Would move $count issues/PRs from '$old' to '$new'"
    echo "  [dry-run] Would delete label '$old'"
    return
  fi

  # Get all issues with old label
  local issues
  issues=$(gh issue list --label "$old" --state all --repo "$REPO" --json number --jq '.[].number' 2>/dev/null || true)

  if [ -n "$issues" ]; then
    for issue in $issues; do
      gh issue edit "$issue" --add-label "$new" --remove-label "$old" --repo "$REPO" 2>/dev/null || true
      echo "    Migrated issue #$issue"
    done
  fi

  # Delete the old label
  gh label delete "$old" --yes --repo "$REPO" 2>/dev/null || echo "    (label not found)"
}

merge_label "enhancement" "feature"
merge_label "accessibility" "area:a11y"
merge_label "damnit/safari" "browser-bug"
merge_label "github_actions" "ci"
merge_label "ux" "area:ui"

echo ""
echo "=== Phase 3: Delete obsolete labels ==="
echo ""

delete_label() {
  local label="$1"
  local reason="$2"
  echo "Deleting '$label' ($reason)"

  if $DRY_RUN; then
    local count
    count=$(gh issue list --label "$label" --state all --repo "$REPO" --json number --jq 'length' 2>/dev/null || echo "0")
    echo "  [dry-run] Label has $count issues/PRs"
    echo "  [dry-run] Would delete label '$label'"
    return
  fi

  local count
  count=$(gh issue list --label "$label" --state all --repo "$REPO" --json number --jq 'length' 2>/dev/null || echo "0")
  echo "  Label has $count issues/PRs"
  gh label delete "$label" --yes --repo "$REPO" 2>/dev/null || echo "  (label not found)"
}

delete_label "devex" "too vague — use chore or area:testing"
delete_label "idea:dashboard" "use feature + description instead"
delete_label "javascript" "too generic, not useful for triage"
delete_label "known-issue" "use bug + status labels instead"

echo ""
echo "=== Done ==="
if $DRY_RUN; then
  echo "Run without --dry-run to apply changes."
fi
