#!/usr/bin/env bash
# upgrade-smoke.sh - Manual pre-release Docker upgrade smoke.
#
# Seeds a /data volume using the PREVIOUS released images, then brings up the
# locally built NEW images against the same volume and confirms the seeded
# layout survives. Covers two risks the in-memory corpus test cannot see:
# volume permissions (uid 1001) and on-disk layout discovery.
#
# Usage: scripts/upgrade-smoke.sh        (resolves previous tag automatically)
#        OLD_TAG=v26.5.0 scripts/upgrade-smoke.sh   (override)
#
# Requires: docker, curl. Old images are pulled from ghcr.io; if they are
# private, run `gh auth token | docker login ghcr.io -u <user> --password-stdin`
# first.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*" >&2; }

command -v docker >/dev/null || die "docker not found"
command -v curl >/dev/null || die "curl not found"
command -v git >/dev/null || die "git not found"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Resolve the previous released tag (newest v* tag not pointing at HEAD).
OLD_TAG="${OLD_TAG:-}"
if [[ -z "$OLD_TAG" ]]; then
  head_tag="$(git tag --points-at HEAD --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$t" != "$head_tag" ]]; then OLD_TAG="$t"; break; fi
  done < <(git tag --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$')
fi
[[ -n "$OLD_TAG" ]] || die "could not resolve a previous release tag; set OLD_TAG=vX.Y.Z"
OLD_VERSION="${OLD_TAG#v}"
info "Upgrading from $OLD_TAG"

OLD_API="ghcr.io/rackulalives/rackula-api:${OLD_VERSION}"

PROJECT="rackula-upgrade-smoke"
VOLUME="${PROJECT}-data"
NET="${PROJECT}-net"
SEED_YAML="src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml"
SEED_UUID="550e8400-e29b-41d4-a716-446655440000"
API_PORT=13001

cleanup() {
  docker rm -f "${PROJECT}-api" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume rm "$VOLUME" >/dev/null 2>&1 || true
docker volume create "$VOLUME" >/dev/null
docker network create "$NET" >/dev/null 2>&1 || true

wait_for_health() {
  local name="$1" tries=30
  while (( tries-- > 0 )); do
    if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$name" >&2 || true
  die "API did not become healthy"
}

run_api() {
  local image="$1" name="$2"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network "$NET" \
    -e DATA_DIR=/data -e RACKULA_API_PORT=3001 -e RACKULA_AUTH_MODE=none \
    -v "${VOLUME}:/data" -p "${API_PORT}:3001" "$image" >/dev/null
}

info "Pulling and starting OLD API ($OLD_API)"
docker pull "$OLD_API" >/dev/null || die "could not pull $OLD_API (login to ghcr.io?)"
run_api "$OLD_API" "${PROJECT}-api"
wait_for_health "${PROJECT}-api"

info "Seeding layout $SEED_UUID through the OLD API"
curl -fsS -X PUT "http://127.0.0.1:${API_PORT}/api/layouts/${SEED_UUID}" \
  -H "Content-Type: text/yaml" --data-binary "@${SEED_YAML}" >/dev/null \
  || die "seed PUT failed"

info "Stopping OLD API (keeping volume)"
docker rm -f "${PROJECT}-api" >/dev/null

info "Building NEW API image from working tree"
docker build -f api/Dockerfile -t "${PROJECT}/api:new" api >/dev/null \
  || die "new API image build failed"

info "Starting NEW API against the same volume"
run_api "${PROJECT}/api:new" "${PROJECT}-api"
wait_for_health "${PROJECT}-api"

info "Asserting the seeded layout survived the upgrade"
body="$(curl -fsS "http://127.0.0.1:${API_PORT}/api/layouts/${SEED_UUID}")" \
  || die "GET after upgrade failed (layout not found, permissions, or discovery change)"
echo "$body" | grep -q "Representative Lab" \
  || die "layout body did not contain expected content after upgrade"

info "Asserting NEW API reports a version"
curl -fsS "http://127.0.0.1:${API_PORT}/api/version" | grep -q '"version"' \
  || die "version endpoint did not return a version"

echo "PASS: upgrade from ${OLD_TAG} preserved the seeded layout" >&2
