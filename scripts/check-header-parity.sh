#!/usr/bin/env bash
#
# check-header-parity.sh - self-host header and build-env parity guard.
#
# Part of issue #2032 (self-host half). Verifies the self-host CSP/header files
# and the Dockerfile VITE_* build args stay within their expected invariants so
# an accidental change fails CI instead of shipping.
#
# Checks (self-host half):
#   1. No analytics origins (cloudflareinsights, /cdn-cgi/) in either header file.
#   2. CSP script-src is exactly 'self' (zero inline-script hashes, no analytics
#      origins) and each CSP declares form-action 'self'.
#   3. The VITE_* build args declared in deploy/Dockerfile match an explicit
#      allowlist, so an accidental add/remove fails CI.
#   5. (--with-build) dist inline-script scan: dist/index.html and
#      dist/login.html must contain no inline <script> tags (every <script>
#      must carry a src= attribute). Requires `npm run build` to have run first.
#
# DEFERRED to the CF half (#2029 prod _headers, #2134 dev _headers):
#   - The prod/dev CF _headers script-src diff against the self-host files. Those
#     CF surfaces do not exist yet, so there is nothing to compare against.
#   - The wrangler-job VITE_* parity comparison (dev: VITE_ENV=development,
#     analytics token absent in dev). The wrangler deploy jobs do not exist yet;
#     add this comparison alongside the CF surfaces in #2029/#2134.
#
# Usage:
#   scripts/check-header-parity.sh              # static checks (1-3)
#   scripts/check-header-parity.sh --with-build # also run the dist scan (5)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

WITH_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-build) WITH_BUILD=1; shift ;;
    -h | --help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done

SELFHOST_HEADERS=(
  "deploy/security-headers.conf"
  "deploy/lxc/security-headers.conf"
)

# Analytics origins that must never appear in the self-host header files.
ANALYTICS_PATTERNS=(
  "cloudflareinsights"
  "/cdn-cgi/"
)

# VITE_* build args expected in deploy/Dockerfile. The self-host Docker build
# pins exactly these; an add/remove here must be a deliberate edit to this list.
EXPECTED_VITE_ARGS=(
  "VITE_ENV"
)

FAILS=0
fail() { echo "FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
pass() { echo "ok: $*"; }

# --- check 1: no analytics origins in the self-host header files -------------
for f in "${SELFHOST_HEADERS[@]}"; do
  [[ -f "$f" ]] || { fail "missing header file: $f"; continue; }
  for pat in "${ANALYTICS_PATTERNS[@]}"; do
    if grep -F --quiet "$pat" "$f"; then
      fail "analytics origin '$pat' found in $f (self-host must have none)"
    fi
  done
done
[[ $FAILS -eq 0 ]] && pass "no analytics origins in self-host header files"

# --- check 2: CSP script-src invariant + form-action ------------------------
# script-src must be exactly 'self': zero inline-script hashes, no extra origins.
for f in "${SELFHOST_HEADERS[@]}"; do
  [[ -f "$f" ]] || continue

  csp_line="$(grep -F "Content-Security-Policy" "$f" || true)"
  if [[ -z "$csp_line" ]]; then
    fail "no Content-Security-Policy directive in $f"
    continue
  fi

  # Pull out the script-src directive value (between 'script-src' and the next ';').
  script_src="$(printf '%s' "$csp_line" | grep -oE "script-src[^;]*" || true)"
  if [[ -z "$script_src" ]]; then
    fail "no script-src directive in CSP of $f"
    continue
  fi

  # Normalise surrounding whitespace for an exact-match compare.
  script_src="$(printf '%s' "$script_src" | tr -s ' ' | sed 's/[[:space:]]*$//')"
  if [[ "$script_src" != "script-src 'self'" ]]; then
    fail "script-src in $f must be exactly \"script-src 'self'\" (got: \"$script_src\")"
  fi

  # Belt-and-braces: explicitly reject inline-script hashes even if the exact
  # match above ever loosens.
  if printf '%s' "$script_src" | grep -qE "'sha(256|384|512)-"; then
    fail "script-src in $f contains an inline-script hash (must be zero hashes)"
  fi

  # form-action must be present and scoped to 'self'.
  if ! printf '%s' "$csp_line" | grep -qE "form-action 'self'"; then
    fail "CSP in $f must declare \"form-action 'self'\""
  fi
done
[[ $FAILS -eq 0 ]] && pass "CSP script-src is 'self' with zero hashes; form-action 'self' present"

# --- check 3: Dockerfile VITE_* build-arg allowlist -------------------------
# DEFERRED: the full prod/dev parity comparison against the wrangler deploy jobs
# is added with the CF half (#2029/#2134). Those jobs do not exist yet, so here
# we only validate the self-host Dockerfile against the expected allowlist.
DOCKERFILE="deploy/Dockerfile"
if [[ ! -f "$DOCKERFILE" ]]; then
  fail "missing $DOCKERFILE"
else
  declared_vite_args="$(grep -oE "^ARG[[:space:]]+VITE_[A-Z0-9_]+" "$DOCKERFILE" \
    | awk '{print $2}' | sed 's/=.*//' | sort -u || true)"
  expected_sorted="$(printf '%s\n' "${EXPECTED_VITE_ARGS[@]}" | sort -u)"
  if [[ "$declared_vite_args" != "$expected_sorted" ]]; then
    fail "VITE_* build args in $DOCKERFILE do not match the expected allowlist"
    echo "  expected:" >&2; printf '    %s\n' $expected_sorted >&2
    echo "  declared:" >&2; printf '    %s\n' ${declared_vite_args:-<none>} >&2
  else
    pass "Dockerfile VITE_* build args match the expected allowlist"
  fi
fi

# --- check 5: dist inline-script scan (--with-build) ------------------------
if [[ $WITH_BUILD -eq 1 ]]; then
  dist_files=(
    "dist/index.html"
    "dist/login.html"
  )
  for f in "${dist_files[@]}"; do
    if [[ ! -f "$f" ]]; then
      fail "missing $f (run 'npm run build' before --with-build)"
      continue
    fi
    # Flag any <script ...> opening tag that lacks a src= attribute. The bundle
    # must emit only external scripts so the CSP can stay script-src 'self'.
    if grep -oiE "<script\b[^>]*>" "$f" | grep -qivE "\bsrc="; then
      fail "inline <script> (no src=) found in $f"
      grep -oiE "<script\b[^>]*>" "$f" | grep -ivE "\bsrc=" | sed 's/^/    /' >&2
    fi
  done
  [[ $FAILS -eq 0 ]] && pass "no inline <script> tags in dist/index.html or dist/login.html"
fi

echo
if [[ $FAILS -eq 0 ]]; then
  echo "Header and build-env parity check passed."
  exit 0
else
  echo "Header and build-env parity check FAILED: $FAILS issue(s)." >&2
  exit 1
fi
