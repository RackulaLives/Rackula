#!/usr/bin/env bash
# contributors.sh - Extract contributors from merged PRs and update ACKNOWLEDGEMENTS.md.
#
# Usage:
#   scripts/contributors.sh <prev_tag> <new_version>           # Insert contributor block
#   scripts/contributors.sh <prev_tag> <new_version> --dry-run  # Print block to stdout only
#
# Arguments:
#   prev_tag      Previous release tag (e.g., v26.5.0)
#   new_version   New release version without 'v' prefix (e.g., 26.6.0)
#
# Options:
#   --dry-run      Print the contributor block to stdout without modifying ACKNOWLEDGEMENTS.md
#
# Idempotent: If the version heading already exists in ACKNOWLEDGEMENTS.md, prints a
# message and exits 0 without making changes.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Authors to exclude from per-release acknowledgements.
# Bots (dependabot, coderabbit) and the maintainer (ggfevans) who is already
# credited in the all-contributors table.
EXCLUDED_AUTHORS="dependabot[bot] app/dependabot coderabbitai[bot] ggfevans"

ACKNOWLEDGEMENTS_FILE="${ACKNOWLEDGEMENTS_FILE:-ACKNOWLEDGEMENTS.md}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: scripts/contributors.sh <prev_tag> <new_version> [--dry-run]

Extract contributors from merged PRs since the previous release tag and
update ACKNOWLEDGEMENTS.md with a per-release contributor block.

Arguments:
  prev_tag      Previous release tag (e.g., v26.5.0)
  new_version   New release version without 'v' prefix (e.g., 26.6.0)

Options:
  --dry-run     Print contributor block to stdout without modifying ACKNOWLEDGEMENTS.md

Idempotent: If the version heading already exists in ACKNOWLEDGEMENTS.md,
the script exits 0 without making changes.

Examples:
  scripts/contributors.sh v26.5.0 26.6.0            # Insert block
  scripts/contributors.sh v26.5.0 26.6.0 --dry-run   # Preview block
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

DRY_RUN=false

if [[ $# -lt 2 ]]; then
  usage
  die "Expected at least 2 arguments, got $#"
fi

PREV_TAG="$1"
NEW_VERSION="$2"
shift 2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1. Use --help for usage."
      ;;
  esac
done

# Validate new_version format (YY.M.MICRO)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  die "Version '$NEW_VERSION' is not valid CalVer format (expected YY.M.MICRO, e.g., 26.6.0)"
fi

# ---------------------------------------------------------------------------
# Idempotency check
# ---------------------------------------------------------------------------

VERSION_HEADING="### v${NEW_VERSION}"

if [[ -f "$ACKNOWLEDGEMENTS_FILE" ]]; then
  if grep -qF "$VERSION_HEADING" "$ACKNOWLEDGEMENTS_FILE"; then
    echo "Contributor block for v${NEW_VERSION} already exists in ${ACKNOWLEDGEMENTS_FILE}. Skipping."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Get date of previous tag
# ---------------------------------------------------------------------------

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  die "Not in a git repository"
fi

PREV_DATE=$(git log -1 --format=%aI "$PREV_TAG" 2>/dev/null) || die "Could not get date for tag $PREV_TAG"

if [[ -z "$PREV_DATE" ]]; then
  die "Empty date returned for tag $PREV_TAG"
fi

# ---------------------------------------------------------------------------
# Fetch merged PRs since previous tag
# ---------------------------------------------------------------------------

echo "Fetching merged PRs since $PREV_DATE..." >&2

PR_DATA=$(gh pr list --state merged --search "merged:>=${PREV_DATE}" \
  --json number,title,author \
  --jq '.[] | "\(.number)\t\(.title)\t\(.author.login)"' 2>/dev/null) || {
  echo "WARNING: Failed to fetch PR data from GitHub. Skipping contributor acknowledgements." >&2
  exit 0
}

# ---------------------------------------------------------------------------
# Filter, deduplicate, and format contributors
# ---------------------------------------------------------------------------

# Filter out excluded authors using exact field matching (avoids regex metacharacter
# issues with names like "dependabot[bot]" where [ ] are ERE metacharacters).
# PR_DATA format: number<tab>title<tab>author
FILTERED=$(echo "$PR_DATA" | awk -F'\t' -v excl="$EXCLUDED_AUTHORS" '
  BEGIN { n = split(excl, a, / /) }
  { for (i = 1; i <= n; i++) if ($3 == a[i]) next; print }
')

if [[ -z "$FILTERED" ]]; then
  echo "No external contributors found for this release." >&2
  # Still produce a valid block with no entries, useful for idempotency
  BLOCK="${VERSION_HEADING}"
  BLOCK="${BLOCK}
"
  BLOCK="${BLOCK}- No external contributors in this release"
else
  # Deduplicate by author: keep all PRs per author, group them
  # First, collect all PRs per author
  declare -A AUTHOR_PRS  # author -> "title (#num)" entries (newline-separated)
  declare -A AUTHOR_ORDER  # track insertion order

  while IFS=$'\t' read -r number title author; do
    [[ -z "$number" ]] && continue
    # Lowercase first letter of title for consistency
    entry="$(echo "$title" | sed 's/^./\L&/') (#${number})"
    if [[ -n "${AUTHOR_PRS[$author]:-}" ]]; then
      AUTHOR_PRS[$author]="${AUTHOR_PRS[$author]}
${entry}"
    else
      AUTHOR_PRS[$author]="$entry"
      AUTHOR_ORDER[$author]=1
    fi
  done <<< "$FILTERED"

  # Format output lines
  BLOCK="${VERSION_HEADING}"
  BLOCK="${BLOCK}
"

  for author in $(printf '%s\n' "${!AUTHOR_ORDER[@]}" | sort); do
    entries="${AUTHOR_PRS[$author]}"
    # Count entries for this author
    entry_count=$(echo "$entries" | wc -l | tr -d ' ')

    if [[ "$entry_count" -eq 1 ]]; then
      # Single PR: use the PR title as description
      desc=$(echo "$entries" | head -1)
      # Extract just the title part (before the PR reference)
      title_only=$(echo "$desc" | sed 's/ (#[0-9]*)$//')
      pr_ref=$(echo "$desc" | grep -oE '\(#[0-9]+\)')
      # Lowercase first letter of title
      title_only=$(echo "$title_only" | sed 's/^./\L&/')
      BLOCK="${BLOCK}- @${author}: ${title_only} ${pr_ref}
"
    else
      # Multiple PRs: list all PR references
      pr_refs=$(echo "$entries" | grep -oE '#[0-9]+' | tr '\n' ' ' | sed 's/ $//')
      BLOCK="${BLOCK}- @${author}: ${pr_refs}
"
    fi
  done
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

if $DRY_RUN; then
  echo "$BLOCK"
else
  if [[ ! -f "$ACKNOWLEDGEMENTS_FILE" ]]; then
    echo "WARNING: ${ACKNOWLEDGEMENTS_FILE} not found. Skipping contributor acknowledgements." >&2
    exit 0
  fi

  # Find the insertion point: after the ALL-CONTRIBUTORS-LIST:END marker
  # and the "To add yourself" line that follows it
  END_MARKER="<!-- ALL-CONTRIBUTORS-LIST:END -->"
  END_LINE=$(grep -n "$END_MARKER" "$ACKNOWLEDGEMENTS_FILE" | head -1 | cut -d: -f1)

  if [[ -z "$END_LINE" ]]; then
    die "Could not find ${END_MARKER} in ${ACKNOWLEDGEMENTS_FILE}"
  fi

  # Find the line with "To add yourself" after the end marker (it's the line after the table)
  ADD_YOURSELF_LINE=$(awk -v start="$END_LINE" 'NR > start && /To add yourself/ {print NR; exit}' "$ACKNOWLEDGEMENTS_FILE")

  # Find the "## AI Development" heading, we insert before it
  AI_LINE=$(grep -n "^## AI Development" "$ACKNOWLEDGEMENTS_FILE" | head -1 | cut -d: -f1)

  if [[ -z "$AI_LINE" ]]; then
    die "Could not find '## AI Development' section in ${ACKNOWLEDGEMENTS_FILE}"
  fi

  # Check if "## Contributions by Release" section already exists
  RELEASE_SECTION=$(grep -n "^## Contributions by Release" "$ACKNOWLEDGEMENTS_FILE" | head -1 | cut -d: -f1)

  # Build the section intro if it doesn't exist yet
  if [[ -z "$RELEASE_SECTION" ]]; then
    # First time: add the section header and intro, then the block
    SECTION_BLOCK="
## Contributions by Release

Contributors who made merged pull requests in each release. For the full contributors table, see above.

${BLOCK}"
    # Insert before ## AI Development
    sed -i "" "${AI_LINE}i\\
${SECTION_BLOCK}
" "$ACKNOWLEDGEMENTS_FILE"
  else
    # Section exists: insert the block after the section intro
    # Find the first ### heading in the section (or end of section)
    # Prepend new version block right after the intro line
    INTRO_END=$((RELEASE_SECTION + 2))  # Section heading + intro line

    # Find the line after the intro to insert before the first ### heading
    # We insert AFTER the intro and BEFORE any existing ### entries
    sed -i "" "$((INTRO_END))a\\
${BLOCK}" "$ACKNOWLEDGEMENTS_FILE"
  fi

  echo "Updated ${ACKNOWLEDGEMENTS_FILE} with contributor block for v${NEW_VERSION}"
fi