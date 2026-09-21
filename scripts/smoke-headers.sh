#!/usr/bin/env bash
#
# smoke-headers.sh - fail-closed post-deploy smoke for the Cloudflare prod and
# dev surfaces.
#
# Part of issue #2029; the dev surface was added by #2134. Complements
# e2e/deploy-smoke.spec.ts rather than duplicating it: that suite proves the bundle BOOTS in a real browser (shell
# renders, a share link paints, version.json is well-formed). It deliberately
# asserts nothing about headers, content types, SPA-fallback behaviour, or
# version/commit matching, and it tolerates an empty commit for Docker builds.
# Those are exactly the checks that catch a broken Workers deploy, so they live
# here.
#
# Why they matter on Workers specifically: not_found_handling
# "single-page-application" turns EVERY unmatched path into 200 + index.html.
# A missing or misnamed asset therefore returns a cheerful HTML page instead of
# a 404, and under nosniff the browser refuses to execute it. A smoke test that
# only checks "did / return 200" cannot see that. Every content-type assertion
# below exists to make that failure mode loud.
#
# Expected header values are read from scripts/gen-headers.mjs, which is itself
# parity-checked against deploy/security-headers.conf by `--check`. There is no
# second copy of the values here to drift.
#
# Usage:
#   scripts/smoke-headers.sh <base-url> [--surface prod|dev] [--live] [--expect-version X] [--expect-commit Y]
#
#   --surface  which scripts/gen-headers.mjs surface to expect (default prod).
#              dev also expects server-mode config.js and asserts that
#              /api/layouts is unreachable (404, the API host lock), so run it
#              against the workers.dev preview URL, never d.racku.la.
#   --live     additionally assert exactly one Strict-Transport-Security header.
#              Only meaningful on a hostname inside the racku.la zone; see #3214
#              (a zone-level control currently rewrites HSTS to max-age=0).
#
# Exits non-zero on the first category of failure, after running every check, so
# CI reports all problems in one pass.

set -uo pipefail

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "usage: scripts/smoke-headers.sh <base-url> [--surface prod|dev] [--live] [--expect-version X] [--expect-commit Y]" >&2
  exit 2
fi
shift

SURFACE="prod"
LIVE=0
EXPECT_VERSION=""
EXPECT_COMMIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --live) LIVE=1; shift ;;
    --surface)
      [ $# -ge 2 ] || { echo "error: $1 requires a value" >&2; exit 2; }
      case "$2" in
        prod|dev) SURFACE="$2" ;;
        *) echo "error: --surface must be prod or dev" >&2; exit 2 ;;
      esac
      shift 2 ;;
    --expect-version|--expect-commit)
      # `shift 2` with only one argument left fails under `set -u`-less bash and
      # loops forever; reject explicitly so a malformed CI invocation is loud.
      [ $# -ge 2 ] || { echo "error: $1 requires a value" >&2; exit 2; }
      case "$1" in
        --expect-version) EXPECT_VERSION="$2" ;;
        --expect-commit)  EXPECT_COMMIT="$2" ;;
      esac
      shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

BASE_URL="${BASE_URL%/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FAILS=0
fail() { echo "FAIL: $*" >&2; FAILS=$((FAILS + 1)); }
pass() { echo "ok: $*"; }

# Retry the whole request: a freshly promoted version can 5xx for a beat.
fetch() { curl -sS --max-time 30 --retry 3 --retry-delay 2 "$@"; }
headers_of() { fetch -I "$1" | tr -d '\r'; }

# Fail loudly rather than silently reporting a challenge page as a broken deploy.
#
# This script cannot solve a JS challenge, and on the Free plan Bot Fight Mode
# cannot be skipped by a WAF rule (it does not run on the Ruleset Engine). So on
# a challenged surface the only correct behaviour is to stop with a message that
# names the cause, instead of emitting seventeen phantom deploy failures -- which
# is how this presented before it was diagnosed.
#
# In CI this script therefore runs against the workers.dev preview URL, which is
# outside the racku.la zone and not challenged. Live-origin header verification
# is done by the browser instead, in e2e/deploy-smoke.spec.ts.
challenge_guard() {
  local mitigated
  mitigated="$(headers_of "$BASE_URL/" | grep -i '^cf-mitigated:' || true)"
  if [ -n "$mitigated" ]; then
    echo "FAIL: Cloudflare is challenging this client ($mitigated)." >&2
    echo "      curl cannot solve a JS challenge, so every assertion below would" >&2
    echo "      report a challenge page as a broken deploy." >&2
    echo "      Run this against the workers.dev preview URL, or verify this" >&2
    echo "      surface through the browser smoke instead." >&2
    exit 1
  fi
}
challenge_guard

# --- 1. shell ------------------------------------------------------------
code="$(fetch -o /dev/null -w '%{http_code}' "$BASE_URL/")"
[ "$code" = "200" ] && pass "GET / -> 200" || fail "GET / -> $code (expected 200)"

if headers_of "$BASE_URL/" | grep -qi '^content-type: *text/html'; then
  pass "/ is text/html"
else
  fail "/ content-type is not text/html"
fi

# --- 2. version.json: version AND commit, cache-busted -------------------
version_json="$(fetch "$BASE_URL/version.json?cb=$$")"
if headers_of "$BASE_URL/version.json" | grep -qi '^content-type: *application/json'; then
  pass "version.json is application/json"
else
  fail "version.json is not application/json (SPA fallback would return HTML)"
fi

if [ -n "$EXPECT_VERSION" ]; then
  if printf '%s' "$version_json" | tr -d ' \n' | grep -q "\"version\":\"$EXPECT_VERSION\""; then
    pass "version.json version = $EXPECT_VERSION"
  else
    fail "version.json version != $EXPECT_VERSION (got: $(printf '%s' "$version_json" | tr -d '\n'))"
  fi
fi

# The commit assertion is the real cache-buster: version alone cannot tell a
# re-deploy of the same tag from the new build.
if [ -n "$EXPECT_COMMIT" ]; then
  if printf '%s' "$version_json" | tr -d ' \n' | grep -q "\"commit\":\"$EXPECT_COMMIT\""; then
    pass "version.json commit = $EXPECT_COMMIT"
  else
    fail "version.json commit != $EXPECT_COMMIT (got: $(printf '%s' "$version_json" | tr -d '\n'))"
  fi
fi

# --- 3. config.js must be JS, not the SPA shell --------------------------
# If publicDir ever regressed, config.js would fall through to index.html and,
# under nosniff, be blocked - the app would boot into an undefined storage mode.
if headers_of "$BASE_URL/config.js" | grep -qiE '^content-type: *(application|text)/javascript'; then
  pass "config.js is JavaScript"
else
  fail "config.js is not JavaScript (SPA fallback; nosniff would block it)"
fi
# Prod is assets-only (browser storage); dev fronts the persistence API.
EXPECT_STORAGE="browser"
[ "$SURFACE" = "dev" ] && EXPECT_STORAGE="server"
if fetch "$BASE_URL/config.js" | grep -q "storage: *\"$EXPECT_STORAGE\""; then
  pass "config.js declares $EXPECT_STORAGE storage"
else
  fail "config.js does not declare $EXPECT_STORAGE storage"
fi

# --- 4. hashed entry point resolves to real JS with immutable caching -----
entry="$(fetch "$BASE_URL/" | grep -oE '/assets/main-[A-Za-z0-9_-]+\.js' | head -1)"
if [ -z "$entry" ]; then
  fail "could not find a hashed entry-point script in /"
else
  pass "entry point: $entry"
  if headers_of "$BASE_URL$entry" | grep -qiE '^content-type: *(application|text)/javascript'; then
    pass "entry point is JavaScript"
  else
    fail "entry point is not JavaScript (SPA fallback returned HTML)"
  fi
  if headers_of "$BASE_URL$entry" | grep -qi '^cache-control: *public, max-age=31536000, immutable'; then
    pass "/assets/* is immutable"
  else
    fail "/assets/* missing immutable Cache-Control"
  fi
fi

# --- 5. security headers, BY VALUE, diffed against the generator ---------
# Compare only the /* security block. The generator also emits an /assets/*
# Cache-Control rule, which is asserted separately in check 4.
#
# All six are strict, including Strict-Transport-Security. Check 6 additionally
# asserts it is not duplicated. (Until #3214 was fixed, a zone-level control
# rewrote HSTS to max-age=0 on every racku.la hostname; disabling zone HSTS let
# each Worker's own _headers value through.)
#
# X-Robots-Tag is compared the same way, against the chosen surface: prod must
# never emit noindex, and dev always must.
#
# Except on *.workers.dev: Cloudflare adds X-Robots-Tag: noindex to every
# response there, whatever _headers says. The v26.9.0 preview URL started
# returning it between 2026-09-14 and 2026-09-21, while count.racku.la serving
# the same build did not (#3392). On those hosts the header describes the
# platform, not this build, so it is left out of the comparison.
SECURITY_HEADERS='^(content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|strict-transport-security|x-robots-tag):'
IGNORED_HEADERS='^$'
case "$BASE_URL" in
  *://*.workers.dev) IGNORED_HEADERS='^x-robots-tag:' ;;
esac
expected="$(node "$SCRIPT_DIR/gen-headers.mjs" "$SURFACE" \
  | sed -n '/^\/\*/,/^$/p' | sed -n 's/^  //p' \
  | tr 'A-Z' 'a-z' | grep -E "$SECURITY_HEADERS" | grep -vE "$IGNORED_HEADERS" | sort)"
actual="$(headers_of "$BASE_URL/" | tr 'A-Z' 'a-z' \
  | grep -E "$SECURITY_HEADERS" | grep -vE "$IGNORED_HEADERS" | sort)"
if [ "$expected" = "$actual" ]; then
  pass "security headers match scripts/gen-headers.mjs by value"
else
  fail "security header drift from the generator:"
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
fi

# --- 6. exactly one Strict-Transport-Security header ---------------------
# The value itself is covered by the strict diff in check 5. This catches the
# duplicate-header case, which happens when a zone-level control emits HSTS
# alongside the Worker's own _headers. #3214 was that failure in its
# single-header form: the zone replaced the value with max-age=0. Guarding the
# count keeps the zone setting from silently coming back.
if [ "$LIVE" = "1" ]; then
  n="$(headers_of "$BASE_URL/" | grep -ci '^strict-transport-security:')"
  if [ "$n" = "1" ]; then
    pass "exactly one Strict-Transport-Security header"
  else
    fail "expected exactly 1 Strict-Transport-Security header, found $n (a zone-level HSTS setting is likely competing with _headers; see #3214)"
  fi
fi

# --- 7. SPA fallback, with headers still applied -------------------------
if fetch "$BASE_URL/no-such-path-$$" | grep -q 'id="app"'; then
  pass "absent path returns the SPA shell"
else
  fail "absent path does not return the SPA shell"
fi
if headers_of "$BASE_URL/no-such-path-$$" | grep -qi '^content-security-policy:'; then
  pass "CSP applied on an absent path"
else
  fail "CSP missing on an absent path"
fi

# --- 8. login.html is stripped from the Cloudflare artifact --------------
if fetch "$BASE_URL/login.html" | grep -q 'id="app"'; then
  pass "/login.html returns the SPA shell (login form not published)"
else
  fail "/login.html still serves the login form - neither Cloudflare surface has a login backend"
fi

# --- 9. Workers metadata and stray publicDir files are not fetchable -----
# .claude/settings.local.json and .DS_Store are gitignored (the former via the
# user-global ignore file), so they are invisible to `git status` yet can reach
# dist/ in a hand-run build. .assetsignore is the guard; this asserts it holds.
check_not_served() {
  if fetch "$BASE_URL$1" | grep -q 'id="app"'; then
    pass "$1 is not served"
  else
    fail "$1 IS SERVED - expected the SPA shell"
  fi
}
check_not_served "/_headers"
check_not_served "/.assetsignore"
check_not_served "/.claude/settings.local.json"
check_not_served "/.DS_Store"

# --- 10. dev API is unreachable from a preview URL -----------------------
# Preview URLs sit outside Cloudflare Access and outlive their version, so the
# Worker locks /api/* to d.racku.la (RACKULA_API_HOST) and answers 404 anywhere
# else. On d.racku.la itself Access answers first (302), which is why the dev
# surface runs against the preview URL.
if [ "$SURFACE" = "dev" ]; then
  code="$(fetch -o /dev/null -w '%{http_code}' "$BASE_URL/api/layouts")"
  if [ "$code" = "404" ]; then
    pass "/api/layouts -> 404 off the locked host"
  else
    fail "/api/layouts -> $code on a preview URL (expected 404: the API host lock must keep previews away from R2)"
  fi
fi

echo
if [ "$FAILS" -eq 0 ]; then
  echo "Smoke passed against $BASE_URL"
  exit 0
fi
echo "Smoke FAILED against $BASE_URL: $FAILS check(s) failed" >&2
exit 1
