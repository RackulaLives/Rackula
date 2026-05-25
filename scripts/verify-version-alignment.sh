#!/usr/bin/env bash
set -euo pipefail

# Verify that every published Rackula image reports the same release version.
#
# Background: a release once shipped the `:persist` image at a stale version
# (Discussion #1563). This script runs each image and asserts its runtime version
# endpoint reports the expected release version, so a misaligned image fails the
# release before it reaches users.
#
# Usage:
#   scripts/verify-version-alignment.sh <expected_version>
#
# Image refs are supplied via environment variables (any unset ref is skipped):
#   FRONTEND_IMAGE  Static frontend image    -> GET /version.json   (.version)
#   PERSIST_IMAGE   Persist frontend image   -> GET /version.json   (.version)
#   API_IMAGE       API backend image        -> GET /api/version    (.version)
#
# Example:
#   FRONTEND_IMAGE=ghcr.io/rackulalives/rackula:0.9.5 \
#   PERSIST_IMAGE=ghcr.io/rackulalives/rackula:v0.9.5-persist \
#   API_IMAGE=ghcr.io/rackulalives/rackula-api:0.9.5 \
#   scripts/verify-version-alignment.sh 0.9.5

EXPECTED_VERSION="${1:-}"
if [[ -z "$EXPECTED_VERSION" ]]; then
  echo "ERROR: expected version is required (usage: $0 <expected_version>)" >&2
  exit 2
fi

for dep in docker curl jq; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "ERROR: required dependency '$dep' not found on PATH" >&2
    exit 2
  fi
done

CONTAINERS=()
cleanup() {
  for cid in "${CONTAINERS[@]:-}"; do
    [[ -n "$cid" ]] && docker rm -f "$cid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

failures=0
checked=0

# verify_image <label> <image_ref> <container_port> <path>
verify_image() {
  local label="$1" image="$2" container_port="$3" path="$4"

  # Count the attempt up front so every exit path (including failures below)
  # leaves a non-zero "checked" total — otherwise a sole image that fails here
  # would misreport as "no images to check".
  checked=$((checked + 1))

  echo "→ ${label}: starting ${image}"
  local cid
  cid="$(docker run -d -P "$image")"
  CONTAINERS+=("$cid")

  # Resolve the ephemeral host port Docker mapped to the container port.
  local hostport
  hostport="$(docker port "$cid" "${container_port}/tcp" | head -n1 | sed 's/.*://')"
  if [[ -z "$hostport" ]]; then
    echo "  ✗ could not resolve published host port for ${container_port}/tcp" >&2
    failures=$((failures + 1))
    return
  fi

  local url="http://127.0.0.1:${hostport}${path}"
  local body="" actual=""
  local attempt
  for attempt in $(seq 1 30); do
    if body="$(curl -fsS --connect-timeout 5 --max-time 10 "$url" 2>/dev/null)"; then
      actual="$(printf '%s' "$body" | jq -r '.version // empty')"
      [[ -n "$actual" ]] && break
    fi
    sleep 1
  done

  if [[ "$actual" == "$EXPECTED_VERSION" ]]; then
    echo "  ✓ reports ${actual}"
  else
    echo "  ✗ expected ${EXPECTED_VERSION}, got '${actual:-<no response>}' from ${path}" >&2
    failures=$((failures + 1))
  fi
}

[[ -n "${FRONTEND_IMAGE:-}" ]] && verify_image "frontend (static)" "$FRONTEND_IMAGE" 8080 "/version.json"
[[ -n "${PERSIST_IMAGE:-}" ]] && verify_image "frontend (persist)" "$PERSIST_IMAGE" 8080 "/version.json"
[[ -n "${API_IMAGE:-}" ]] && verify_image "api" "$API_IMAGE" 3001 "/api/version"

if [[ "$checked" -eq 0 ]]; then
  echo "ERROR: no images to check; set FRONTEND_IMAGE, PERSIST_IMAGE, and/or API_IMAGE" >&2
  exit 2
fi

if [[ "$failures" -gt 0 ]]; then
  echo "✗ Version alignment FAILED: ${failures} image(s) did not report ${EXPECTED_VERSION}" >&2
  exit 1
fi

echo "✓ Version alignment passed: all ${checked} image(s) report ${EXPECTED_VERSION}"
