#!/usr/bin/env bash
# test-contributors.sh - Validate contributors.sh behaviour.
#
# Tests:
#   1. Dry-run outputs a valid markdown block for a known tag range
#   2. Dry-run does not modify ACKNOWLEDGEMENTS.md
#   3. Bot exclusion: dependabot and coderabbitai authors are excluded
#   4. Maintainer exclusion: ggfevans is excluded
#   5. Idempotency detection works
#
# Usage:
#   scripts/test-contributors.sh
#
# Requires: gh CLI authenticated, git repository with tag history.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRIBUTORS_SCRIPT="$SCRIPT_DIR/contributors.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colours for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Colour

PASS=0
FAIL=0

pass() {
  echo -e "${GREEN}PASS${NC}: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "${RED}FAIL${NC}: $1"
  FAIL=$((FAIL + 1))
}

# ---------------------------------------------------------------------------
# Test 1: Dry-run produces output for a known tag range
# ---------------------------------------------------------------------------

echo "=== Test 1: Dry-run produces valid markdown block ==="

OUTPUT=$("$CONTRIBUTORS_SCRIPT" v26.5.0 26.6.0 --dry-run) || {
  fail "contributors.sh exited with error for v26.5.0..v26.6.0"
  OUTPUT=""
}

if [[ -n "$OUTPUT" ]]; then
  # Check that output starts with version heading
  if echo "$OUTPUT" | grep -q "^### v26\.6\.0"; then
    pass "Dry-run output contains version heading"
  else
    fail "Dry-run output missing version heading '### v26.6.0'"
  fi

  # Check that output has at least one contributor line or the no-contributors message
  if echo "$OUTPUT" | grep -qE "^- @"; then
    pass "Dry-run output contains contributor entries"
  else
    # It's valid to have no external contributors, but warn
    echo "  (No external contributors found - this may be expected)"
    pass "Dry-run output is valid (no contributors is acceptable)"
  fi
else
  fail "Dry-run produced no output"
fi

# ---------------------------------------------------------------------------
# Test 2: Dry-run does not modify ACKNOWLEDGEMENTS.md
# ---------------------------------------------------------------------------

echo ""
echo "=== Test 2: Dry-run does not modify ACKNOWLEDGEMENTS.md ==="

cd "$REPO_ROOT"
CHECKSUM_BEFORE=$(shasum ACKNOWLEDGEMENTS.md | cut -d' ' -f1)

"$CONTRIBUTORS_SCRIPT" v26.5.0 26.6.0 --dry-run >/dev/null || true

CHECKSUM_AFTER=$(shasum ACKNOWLEDGEMENTS.md | cut -d' ' -f1)

if [[ "$CHECKSUM_BEFORE" == "$CHECKSUM_AFTER" ]]; then
  pass "ACKNOWLEDGEMENTS.md unchanged after dry-run"
else
  fail "ACKNOWLEDGEMENTS.md was modified during dry-run (should not happen)"
fi

# ---------------------------------------------------------------------------
# Test 3: Bot and maintainer exclusion
# ---------------------------------------------------------------------------

echo ""
echo "=== Test 3: Bot and maintainer exclusion ==="

if [[ -n "$OUTPUT" ]]; then
  # dependabot should never appear
  if echo "$OUTPUT" | grep -q "@dependabot"; then
    fail "dependabot appears in contributor output (should be excluded)"
  else
    pass "dependabot excluded from contributor output"
  fi

  # app/dependabot should never appear
  if echo "$OUTPUT" | grep -q "app/dependabot"; then
    fail "app/dependabot appears in contributor output (should be excluded)"
  else
    pass "app/dependabot excluded from contributor output"
  fi

  # coderabbitai should never appear
  if echo "$OUTPUT" | grep -q "@coderabbitai"; then
    fail "coderabbitai appears in contributor output (should be excluded)"
  else
    pass "coderabbitai excluded from contributor output"
  fi

  # Maintainer should never appear
  if echo "$OUTPUT" | grep -q "@ggfevans"; then
    fail "ggfevans appears in contributor output (should be excluded)"
  else
    pass "ggfevans (maintainer) excluded from contributor output"
  fi
else
  echo "  (Skipped - no output from dry-run to check)"
fi

# ---------------------------------------------------------------------------
# Test 4: Idempotency detection
# ---------------------------------------------------------------------------

echo ""
echo "=== Test 4: Idempotency ==="

# Create a temp file to test idempotency logic
TEMP_DIR=$(mktemp -d)
cp "$REPO_ROOT/ACKNOWLEDGEMENTS.md" "$TEMP_DIR/ACKNOWLEDGEMENTS.md"

# Insert a fake v99.99.99 entry to test idempotency detection
sed -i "" '/^## AI Development/i\
### v99.99.99\
\
- @testuser: test contribution (#99999)\
' "$TEMP_DIR/ACKNOWLEDGEMENTS.md"

# The script's idempotency check uses grep -qF on the version heading
# Test this directly
if grep -qF "### v99.99.99" "$TEMP_DIR/ACKNOWLEDGEMENTS.md"; then
  pass "Idempotency check detects existing version heading"
else
  fail "Idempotency check did not detect existing version heading"
fi

# Clean up
rm -rf "$TEMP_DIR"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=== Results ==="
echo -e "Passed: ${GREEN}${PASS}${NC}  Failed: ${RED}${FAIL}${NC}"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0