#!/usr/bin/env bash
# next-version.sh — Compute the next CalVer version (YY.M.MICRO) from date + git tags.
#
# CalVer format: YY.M.MICRO
#   YY    = 2-digit year (e.g., 26 for 2026)
#   M     = unpadded month (1-12)
#   MICRO = release counter, resets to 0 each month
#
# Rules:
#   - If current YY.M matches latest tag's YY.M → MICRO = tag.MICRO + 1
#   - If current YY.M differs from latest tag    → MICRO = 0
#   - If no tag exists                            → MICRO = 0
#   - SemVer tags (e.g., v0.10.1) won't match a
#     CalVer YY.M, so MICRO resets to 0 — correct during prep phase.
#   - Tags with non-N.N.N format (pre-release, etc.) are skipped.
#
# Usage:
#   scripts/next-version.sh --dry-run    # Compute and print, no side effects
#   scripts/next-version.sh --tag        # Compute, create tag, push to origin
#   scripts/next-version.sh --help       # Show usage

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
Usage: scripts/next-version.sh [OPTION]

Compute the next CalVer version (YY.M.MICRO) from the current date and
existing git tags.

Options:
  --dry-run    Compute and print version, no side effects (default)
  --tag        Compute version, create git tag, and push to origin
  --help       Show this help message

Output:
  The computed version string (e.g., 26.6.0) without a 'v' prefix.

Examples:
  scripts/next-version.sh --dry-run    # 26.6.0
  scripts/next-version.sh --tag         # 26.6.0 + git tag v26.6.0 + push
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

ACTION="dry-run"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      ACTION="dry-run"
      shift
      ;;
    --tag)
      ACTION="tag"
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

# ---------------------------------------------------------------------------
# Compute current YY.M (single date call to avoid midnight race)
# ---------------------------------------------------------------------------

# Capture both year and month from a single date invocation to avoid
# a race condition where the date changes between the two calls.
DATE_OUTPUT=$(date +"%y %m")
YY=$(echo "$DATE_OUTPUT" | cut -d' ' -f1 | sed 's/^0//')
M=$(echo "$DATE_OUTPUT" | cut -d' ' -f2 | sed 's/^0//')

# Validate we got numbers
[[ "$YY" =~ ^[0-9]+$ ]] || die "Year component is not numeric: $YY"
[[ "$M" =~ ^[0-9]+$ ]] || die "Month component is not numeric: $M"

# ---------------------------------------------------------------------------
# Determine MICRO from latest tag
# ---------------------------------------------------------------------------

MICRO=0

# Verify we're in a git repository
git rev-parse --git-dir >/dev/null 2>&1 || die "Not in a git repository"

# Get the most recent v* tag (may be SemVer during prep phase)
LATEST_TAG=""
LATEST_TAG=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null) || true

if [[ -n "$LATEST_TAG" ]]; then
  # Strip 'v' prefix
  TAG_VERSION="${LATEST_TAG#v}"

  # Validate tag format: must be exactly N.N.N (three numeric components).
  # Skip tags that don't match (pre-release tags, malformed tags, etc.)
  if ! echo "$TAG_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "INFO: Latest tag $LATEST_TAG is not N.N.N format, skipping." >&2
    LATEST_TAG=""
  fi
fi

if [[ -n "$LATEST_TAG" ]]; then
  # Split into components: MAJOR.MINOR.MICRO
  # Works for both CalVer (26.6.0) and SemVer (0.10.1)
  IFS='.' read -r TAG_YY TAG_M TAG_MICRO <<< "$TAG_VERSION"

  # Force base-10 interpretation to avoid octal issues with leading zeros
  TAG_YY=$((10#${TAG_YY}))
  TAG_M=$((10#${TAG_M}))
  TAG_MICRO=$((10#${TAG_MICRO}))

  # Compare current YY.M with tag's YY.M
  if [[ "$YY" -eq "$TAG_YY" && "$M" -eq "$TAG_M" ]]; then
    # Same year-month — increment MICRO
    MICRO=$((TAG_MICRO + 1))
  fi
  # else: different year-month — MICRO stays 0 (reset on month boundary)
fi

# ---------------------------------------------------------------------------
# Compose and validate version
# ---------------------------------------------------------------------------

VERSION="${YY}.${M}.${MICRO}"

# Validate format: three dot-separated numeric components, no zero-padded month
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  die "Computed version has invalid format: $VERSION (expected N.N.N)"
fi

# Reject zero-padded month (e.g., 26.06.0 is invalid; 26.6.0 is valid)
VERSION_MONTH="${VERSION#*.}"
VERSION_MONTH="${VERSION_MONTH%.*}"
if [[ "$VERSION_MONTH" != "$M" ]]; then
  die "Month component is zero-padded: $VERSION (expected ${YY}.${M}.${MICRO})"
fi

# Check for duplicate tag
TAG_NAME="v${VERSION}"
if git tag -l "$TAG_NAME" | grep -q .; then
  die "Tag ${TAG_NAME} already exists. Current version would be ${VERSION}."
fi

# ---------------------------------------------------------------------------
# Act on the computed version
# ---------------------------------------------------------------------------

case "$ACTION" in
  dry-run)
    echo "$VERSION"
    ;;
  tag)
    echo "Creating tag ${TAG_NAME} for version ${VERSION}..." >&2
    git tag "$TAG_NAME" || die "Failed to create tag ${TAG_NAME}"
    echo "Pushing ${TAG_NAME} to origin..." >&2
    if ! git push origin "$TAG_NAME"; then
      echo "ERROR: Failed to push ${TAG_NAME} to origin. Rolling back local tag." >&2
      git tag -d "$TAG_NAME" 2>/dev/null || true
      exit 1
    fi
    echo "$VERSION"
    ;;
  *)
    die "Unknown action: $ACTION"
    ;;
esac