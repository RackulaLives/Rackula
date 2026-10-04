#!/usr/bin/env bats
# next-version.bats — Tests for scripts/next-version.sh
#
# Run: bats scripts/next-version.bats

setup() {
  # Create a temporary git repo for isolated tag testing.
  # Tags are placed on separate commits so git describe returns
  # predictable results (most recent commit ancestry).
  export TEST_REPO="$(mktemp -d)"
  cd "$TEST_REPO"
  git init --initial-branch=main >/dev/null 2>&1
  # Keep tags lightweight and commits unsigned regardless of global config
  git config tag.gpgSign false
  git config commit.gpgSign false
  git commit --allow-empty -m "initial" >/dev/null 2>&1
  # Point to the test script (use the real script path)
  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)/next-version.sh"
}

teardown() {
  rm -rf "$TEST_REPO"
}

# Helper: create a commit and tag it. Each tag gets its own commit
# so git describe reliably returns the latest tag by ancestry.
commit_tag() {
  local tag="$1"
  git commit --allow-empty -m "release ${tag}" >/dev/null 2>&1
  git tag "$tag"
}

# Helper: compute current YY.M in the same way the script does
current_yy_m() {
  local date_output yy mm
  date_output=$(date +"%y %m")
  yy=$(echo "$date_output" | cut -d' ' -f1 | sed 's/^0//')
  mm=$(echo "$date_output" | cut -d' ' -f2 | sed 's/^0//')
  echo "${yy}.${mm}"
}

# ---------------------------------------------------------------------------
# No tags exist — first release
# ---------------------------------------------------------------------------

@test "no tags: produces YY.M.1" {
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

# ---------------------------------------------------------------------------
# SemVer tag (prep phase) — current YY.M won't match, MICRO resets
# ---------------------------------------------------------------------------

@test "semver tag v0.10.1: produces YY.M.1 (no match on YY.M)" {
  commit_tag v0.10.1
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

@test "semver tag v0.9.5: produces YY.M.1" {
  commit_tag v0.9.5
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

# ---------------------------------------------------------------------------
# CalVer tag matching current YY.M — MICRO increments
# ---------------------------------------------------------------------------

@test "calver tag in same YY.M: increments MICRO" {
  local yy_m
  yy_m=$(current_yy_m)
  commit_tag "v${yy_m}.1"
  local result
  result=$(bash "$SCRIPT" --dry-run)
  [ "$result" = "${yy_m}.2" ]
}

@test "legacy .0 calver tag in same YY.M: continues at .1" {
  local yy_m
  yy_m=$(current_yy_m)
  commit_tag "v${yy_m}.0"
  local result
  result=$(bash "$SCRIPT" --dry-run)
  [ "$result" = "${yy_m}.1" ]
}

@test "calver tag with higher MICRO in same YY.M: increments from latest" {
  local yy_m
  yy_m=$(current_yy_m)
  commit_tag "v${yy_m}.3"
  local result
  result=$(bash "$SCRIPT" --dry-run)
  [ "$result" = "${yy_m}.4" ]
}

# ---------------------------------------------------------------------------
# CalVer tag from different month — MICRO resets to 1
# ---------------------------------------------------------------------------

@test "calver tag from different year: produces YY.M.1" {
  commit_tag v25.12.5
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

@test "calver tag from different month same year: produces YY.M.1" {
  local yy mm prev_mm
  yy=$(date +"%y" | sed 's/^0//')
  mm=$(date +"%m" | sed 's/^0//')
  # Use month 1 less than current (or 12 if January)
  prev_mm=$((mm - 1))
  [[ $prev_mm -eq 0 ]] && prev_mm=12
  commit_tag "v${yy}.${prev_mm}.2"
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

# ---------------------------------------------------------------------------
# Mixed tags — picks the most recent by commit ancestry
# ---------------------------------------------------------------------------

@test "mixed semver and calver tags: uses most recent tag" {
  local yy_m
  yy_m=$(current_yy_m)
  # SemVer tag first (older commit)
  commit_tag v0.10.1
  # CalVer tag second (newer commit) — git describe picks this
  commit_tag "v${yy_m}.1"
  local result
  result=$(bash "$SCRIPT" --dry-run)
  [ "$result" = "${yy_m}.2" ]
}

# ---------------------------------------------------------------------------
# Duplicate tag detection
# ---------------------------------------------------------------------------

@test "duplicate tag: exits non-zero with error message" {
  local yy_m
  yy_m=$(current_yy_m)
  # Create a CalVer tag, then a SemVer tag on a later commit.
  # git describe returns the SemVer tag (closest to HEAD).
  # Script computes YY.M.1 (since SemVer YY.M doesn't match),
  # but the CalVer tag already exists → duplicate error.
  commit_tag "v${yy_m}.1"
  commit_tag v0.10.1
  run bash "$SCRIPT" --dry-run
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "already exists"
}

# ---------------------------------------------------------------------------
# Pre-release / malformed tag handling
# ---------------------------------------------------------------------------

@test "pre-release tag v26.6.0-rc.1: skipped, produces YY.M.1" {
  commit_tag v26.6.0-rc.1
  local result
  result=$(bash "$SCRIPT" --dry-run)
  local yy_m
  yy_m=$(current_yy_m)
  [ "$result" = "${yy_m}.1" ]
}

# ---------------------------------------------------------------------------
# --help flag
# ---------------------------------------------------------------------------

@test "--help: exits 0 and shows usage" {
  run bash "$SCRIPT" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Compute the next CalVer"
}

@test "-h: exits 0 and shows usage" {
  run bash "$SCRIPT" -h
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "Compute the next CalVer"
}

# ---------------------------------------------------------------------------
# Unknown flag
# ---------------------------------------------------------------------------

@test "unknown flag: exits non-zero" {
  run bash "$SCRIPT" --bogus
  [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# Output format validation
# ---------------------------------------------------------------------------

@test "output matches N.N.N format" {
  local result
  result=$(bash "$SCRIPT" --dry-run)
  echo "$result" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'
}

@test "output month is not zero-padded" {
  local result
  result=$(bash "$SCRIPT" --dry-run)
  # Extract month component: YY.M.MICRO → M should not start with 0
  local month
  month=$(echo "$result" | cut -d. -f2)
  # The month should equal the unpadded date month
  local expected_mm
  expected_mm=$(date +"%m" | sed 's/^0//')
  [ "$month" = "$expected_mm" ]
}

# ---------------------------------------------------------------------------
# --tag action (tag creation, pushed to a local bare remote)
# ---------------------------------------------------------------------------

@test "--tag creates and pushes git tag" {
  local yy_m version tag_name remote
  yy_m=$(current_yy_m)
  version="${yy_m}.1"
  tag_name="v${version}"
  # The script rolls back the local tag if the push fails, so give it a
  # local bare remote to push to.
  remote="$TEST_REPO/remote.git"
  git init --bare "$remote" >/dev/null 2>&1
  git remote add origin "$remote"
  # Create a SemVer tag first so the computed version is predictable
  commit_tag v0.10.1
  run bash "$SCRIPT" --tag
  [ "$status" -eq 0 ]
  git tag -l "$tag_name" | grep -qx "$tag_name"
  git --git-dir="$remote" tag -l "$tag_name" | grep -qx "$tag_name"
}

# ---------------------------------------------------------------------------
# Not in a git repo
# ---------------------------------------------------------------------------

@test "outside git repo: exits non-zero with error" {
  cd "$(mktemp -d)"
  run bash "$SCRIPT" --dry-run
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "git"
  rm -rf "$(cd "$(mktemp -d)" && pwd)"
}