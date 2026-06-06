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

# Insert text at a 1-based line position in a file, in place. Portable
# replacement for `sed -i` insert/append: BSD and GNU sed differ on both the
# -i flag and the multi-line i\/a\ form. Text is passed via the environment
# (not -v) so awk does not interpret backslash escapes in it.
#   insert_at_line <file> <line> before|after <text>
insert_at_line() {
  local file="$1" line="$2" pos="$3" text="$4"
  local tmp rc
  tmp=$(mktemp)
  if TEXT="$text" awk -v line="$line" -v pos="$pos" '
    NR == line && pos == "before" { print ENVIRON["TEXT"] }
    { print }
    NR == line && pos == "after" { print ENVIRON["TEXT"] }
  ' "$file" > "$tmp"; then
    # Overwrite in place rather than `mv`: mktemp creates the temp at mode 0600,
    # and mv would replace the inode and clobber the tracked file's permissions.
    cat "$tmp" > "$file"
    rc=$?
    rm -f "$tmp"
    return "$rc"
  else
    rm -f "$tmp"
    return 1
  fi
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
  # Group PRs by author and format. Sort rows by author (stable, so PR order
  # within an author is preserved), then collapse each author group in a single
  # awk pass. Portable: no bash 4 associative arrays, no GNU sed.
  # Output (per the contributor acknowledgements design spec):
  #   "- @author: <first PR title, first letter lowercased> (#num1, #num2, ...)"
  # The /release skill presents the draft for review, so a maintainer can refine
  # the multi-PR summary by hand.
  CONTRIB_LINES=$(printf '%s\n' "$FILTERED" | sort -t"$(printf '\t')" -k3,3 -s | awk -F'\t' '
    function flush(   ltitle) {
      if (cur == "") return
      ltitle = tolower(substr(ftitle, 1, 1)) substr(ftitle, 2)
      print "- @" cur ": " ltitle " (" refs ")"
    }
    $3 != cur { flush(); cur = $3; refs = ""; ftitle = $2 }
    { refs = (refs == "" ? "#" $1 : refs ", #" $1) }
    END { flush() }
  ')

  BLOCK="${VERSION_HEADING}"
  BLOCK="${BLOCK}
"
  BLOCK="${BLOCK}${CONTRIB_LINES}"
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

  # Anchor insertion on the "## AI Development" heading and the optional
  # "## Contributions by Release" section. `|| true` keeps set -e/pipefail from
  # aborting when grep finds no match (or on a grep SIGPIPE from `head` closing
  # the pipe early); empty results are handled by the explicit checks below.
  AI_LINE=$(grep -n "^## AI Development" "$ACKNOWLEDGEMENTS_FILE" | head -1 | cut -d: -f1 || true)

  if [[ -z "$AI_LINE" ]]; then
    die "Could not find '## AI Development' section in ${ACKNOWLEDGEMENTS_FILE}"
  fi

  # Check if "## Contributions by Release" section already exists
  RELEASE_SECTION=$(grep -n "^## Contributions by Release" "$ACKNOWLEDGEMENTS_FILE" | head -1 | cut -d: -f1 || true)

  # Build the section intro if it doesn't exist yet
  if [[ -z "$RELEASE_SECTION" ]]; then
    # First time: add the section header and intro, then the block
    # Trailing newline keeps a blank line between the block and the following
    # ## AI Development heading.
    SECTION_BLOCK="
## Contributions by Release

Contributors who made merged pull requests in each release. For the full contributors table, see above.

${BLOCK}
"
    # Insert before ## AI Development
    insert_at_line "$ACKNOWLEDGEMENTS_FILE" "$AI_LINE" before "$SECTION_BLOCK"
  else
    # Section exists: insert the block after the section intro
    # Find the first ### heading in the section (or end of section)
    # Prepend new version block right after the intro line
    INTRO_END=$((RELEASE_SECTION + 2))  # Section heading + intro line

    # Find the line after the intro to insert before the first ### heading
    # We insert AFTER the intro and BEFORE any existing ### entries
    # Leading blank line separates this block from the intro and from any
    # previously inserted release block stacked above it.
    insert_at_line "$ACKNOWLEDGEMENTS_FILE" "$INTRO_END" after "
${BLOCK}"
  fi

  echo "Updated ${ACKNOWLEDGEMENTS_FILE} with contributor block for v${NEW_VERSION}"
fi