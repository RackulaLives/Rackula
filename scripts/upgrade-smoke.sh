#!/usr/bin/env bash
# upgrade-smoke.sh - Manual pre-release Docker upgrade smoke.
#
# Drives the real compose stack through an old-to-new upgrade and confirms an
# existing deployment's saved data survives. It seeds a layout using the
# PREVIOUS released image, upgrades to a locally built image against the same
# bind mount, and asserts the data is byte-identical afterwards.
#
# Unlike an in-memory test, this exercises what only a real deployment can show:
# on-disk format compatibility (does new code find and read old-written
# folders?), the bind mount declared by the compose file, uid 1001 ownership,
# and the read-only rootfs (can the upgraded container still write to /data?).
#
# Usage: scripts/upgrade-smoke.sh        (resolves previous tag automatically)
#        OLD_TAG=v26.5.0 scripts/upgrade-smoke.sh   (override)
#
# Requires: docker, docker compose, curl, cmp, git, and sudo. sudo is used to
# chown the bind mount to uid 1001 and to remove the uid-1001-owned files the
# container leaves behind. Old images are pulled from ghcr.io; if they are
# private, run `gh auth token | docker login ghcr.io -u <user> --password-stdin`
# first.
#
# Supported on Linux (and the self-hosted runner). On macOS Docker Desktop the
# uid/bind-mount permission dimension is virtualized, so the format and
# read_only checks still run but host-permission fidelity is reduced.
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}
info() { echo ">> $*" >&2; }

for tool in docker curl cmp git sudo; do
  command -v "$tool" >/dev/null || die "$tool not found"
done
docker compose version >/dev/null 2>&1 || die "docker compose (v2) not found"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
FIXTURE_DIR="$REPO_ROOT/src/tests/fixtures/upgrade-corpus"
SEED_YAML="$FIXTURE_DIR/v26.5.0-representative.rackula.yaml"
# A pre-carrier layout exercises the format the carrier-first refactor (#2158)
# replaced. The server stores it verbatim and must serve it back unchanged: a
# pull alone must never alter pre-carrier data. The carrier transform itself is
# client-side and covered by the Vitest corpus, not here.
PRECARRIER_YAML="$FIXTURE_DIR/pre-carrier-slot-position.rackula.yaml"
[[ -f "$COMPOSE_FILE" ]] || die "compose file not found: $COMPOSE_FILE"
[[ -f "$SEED_YAML" ]] || die "seed fixture not found: $SEED_YAML"
[[ -f "$PRECARRIER_YAML" ]] || die "pre-carrier fixture not found: $PRECARRIER_YAML"

# The URL uuid must match the fixture's metadata.id, or the PUT is rejected.
uuid_of() {
  local u
  u="$(grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$1" | head -1)"
  [[ -n "$u" ]] || die "could not read a layout UUID from $1"
  echo "$u"
}
SEED_UUID="$(uuid_of "$SEED_YAML")"
PRECARRIER_UUID="$(uuid_of "$PRECARRIER_YAML")"

# Resolve the previous released tag (newest v* tag not pointing at HEAD).
OLD_TAG="${OLD_TAG:-}"
if [[ -z "$OLD_TAG" ]]; then
  head_tag="$(git tag --points-at HEAD --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$t" != "$head_tag" ]]; then
      OLD_TAG="$t"
      break
    fi
  done < <(git tag --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$')
fi
[[ -n "$OLD_TAG" ]] || die "could not resolve a previous release tag; set OLD_TAG=vX.Y.Z"
OLD_VERSION="${OLD_TAG#v}"
OLD_IMG="ghcr.io/rackulalives/rackula-api:${OLD_VERSION}"
NEW_IMG="rackula-upgrade-smoke/api:new"
PORT=13001
BASE="http://127.0.0.1:${PORT}"
info "Upgrading from ${OLD_TAG} to a working-tree build"

# Throwaway project dir. The compose file's bind mount is `./data`, resolved
# against --project-directory, so the data dir must be named `data` inside it.
WORKDIR="$(mktemp -d)"
DATA_HOST="${WORKDIR}/data"
OVERRIDE="${WORKDIR}/override.yml"
mkdir -p "$DATA_HOST"
sudo chown 1001:1001 "$DATA_HOST"

cat >"$OVERRIDE" <<YAML
services:
  rackula-api:
    container_name: rackula-upgrade-smoke-api
    ports:
      - "${PORT}:3001"
YAML

COMPOSE=(docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE" --project-directory "$WORKDIR" -p rackula-upgrade-smoke --profile persist)

cleanup() {
  "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f rackula-upgrade-smoke-api >/dev/null 2>&1 || true
  docker rmi -f "$NEW_IMG" >/dev/null 2>&1 || true
  # The container leaves uid-1001-owned files in the bind mount.
  sudo rm -rf "$WORKDIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_health() {
  local tries=40
  while ((tries-- > 0)); do
    if curl -fsS "${BASE}/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs rackula-upgrade-smoke-api >&2 2>&1 || true
  die "API did not become healthy"
}

# Count snapshots tolerantly. Pre-feature images 404 the snapshots route, so
# grep finds nothing and exits nonzero; guard the substitution so set -e does
# not abort on an empty result.
snap_count() {
  local n
  n="$(curl -sS "${BASE}/layouts/${1}/snapshots" 2>/dev/null | grep -o '"filename"' | wc -l | tr -d ' ')" || n=0
  echo "${n:-0}"
}

up_api() {
  RACKULA_API_IMAGE="$1" "${COMPOSE[@]}" up -d rackula-api >/dev/null 2>&1 || die "compose up failed for $1"
}

info "Pulling and starting OLD API (${OLD_IMG})"
docker pull "$OLD_IMG" >/dev/null 2>&1 || die "could not pull ${OLD_IMG} (login to ghcr.io?)"
up_api "$OLD_IMG"
wait_health

info "Seeding layout ${SEED_UUID} through the OLD API"
curl -fsS -X PUT "${BASE}/layouts/${SEED_UUID}" \
  -H "Content-Type: text/yaml" --data-binary "@${SEED_YAML}" >/dev/null ||
  die "seed PUT failed"
# A second PUT with a stale updated-at forces a pre-overwrite snapshot when the
# old release has the snapshot feature (a no-op on releases that predate it).
curl -fsS -X PUT "${BASE}/layouts/${SEED_UUID}" \
  -H "Content-Type: text/yaml" -H "X-Rackula-Updated-At: 1970-01-01T00:00:00.000Z" \
  --data-binary "@${SEED_YAML}" >/dev/null || die "second seed PUT failed"

curl -fsS "${BASE}/layouts/${SEED_UUID}" -o "${WORKDIR}/before.yaml" || die "GET before upgrade failed"
SNAP_OLD="$(snap_count "$SEED_UUID")"
info "Seeded: $(wc -c <"${WORKDIR}/before.yaml" | tr -d ' ') bytes, ${SNAP_OLD} snapshot(s) under OLD"

info "Seeding pre-carrier layout ${PRECARRIER_UUID} through the OLD API"
curl -fsS -X PUT "${BASE}/layouts/${PRECARRIER_UUID}" \
  -H "Content-Type: text/yaml" --data-binary "@${PRECARRIER_YAML}" >/dev/null ||
  die "pre-carrier seed PUT failed"
curl -fsS "${BASE}/layouts/${PRECARRIER_UUID}" -o "${WORKDIR}/before-precarrier.yaml" ||
  die "GET pre-carrier before upgrade failed"

info "Stopping OLD API (keeping the bind mount)"
"${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
docker rm -f rackula-upgrade-smoke-api >/dev/null 2>&1 || true

info "Building NEW API image from the working tree"
docker build -f "$REPO_ROOT/api/Dockerfile" -t "$NEW_IMG" "$REPO_ROOT/api" >/dev/null ||
  die "new API image build failed"

info "Starting NEW API against the same bind mount"
up_api "$NEW_IMG"
wait_health

echo "===== assertions =====" >&2
pass=0
fail=0
skip=0
check() {
  if eval "$2"; then
    echo "PASS: $1" >&2
    pass=$((pass + 1))
  else
    echo "FAIL: $1" >&2
    fail=$((fail + 1))
  fi
}

curl -fsS "${BASE}/layouts" -o "${WORKDIR}/list.json" || die "GET list after upgrade failed"
check "discovery: new API lists the old-written layout" "grep -qi '${SEED_UUID}' '${WORKDIR}/list.json'"

curl -fsS "${BASE}/layouts/${SEED_UUID}" -o "${WORKDIR}/after.yaml" ||
  die "GET after upgrade failed (not found, permissions, or discovery change)"
check "no data loss: layout is byte-identical after upgrade" "cmp -s '${WORKDIR}/before.yaml' '${WORKDIR}/after.yaml'"

# Pre-carrier file at rest: the new release must serve it back unchanged. It is
# not transformed server-side; the carrier migration happens only when the app
# loads and then saves it (the migrating-save backup is tracked in #2517).
check "pre-carrier discovery: new API lists the pre-carrier layout" "grep -qi '${PRECARRIER_UUID}' '${WORKDIR}/list.json'"
curl -fsS "${BASE}/layouts/${PRECARRIER_UUID}" -o "${WORKDIR}/after-precarrier.yaml" ||
  die "GET pre-carrier after upgrade failed"
check "pre-carrier untouched at rest: byte-identical after a pull (no save)" "cmp -s '${WORKDIR}/before-precarrier.yaml' '${WORKDIR}/after-precarrier.yaml'"

SNAP_NEW="$(snap_count "$SEED_UUID")"
if [[ "$SNAP_OLD" -ge 1 ]]; then
  check "snapshots written by OLD survive (old=${SNAP_OLD} new=${SNAP_NEW})" "[[ '${SNAP_NEW}' -ge '${SNAP_OLD}' ]]"
else
  echo "SKIP: snapshot survival (OLD release ${OLD_TAG} predates the snapshot feature)" >&2
  skip=$((skip + 1))
fi

# Writes must still work under the read-only rootfs (only /data and /tmp are
# writable). The stale updated-at also snapshots the prior copy.
sed 's/Representative Lab/Representative Lab UPGRADED/' "${WORKDIR}/before.yaml" >"${WORKDIR}/modified.yaml"
write_code="$(curl -fsS -X PUT "${BASE}/layouts/${SEED_UUID}" \
  -H "Content-Type: text/yaml" -H "X-Rackula-Updated-At: 1970-01-01T00:00:00.000Z" \
  --data-binary "@${WORKDIR}/modified.yaml" -o /dev/null -w '%{http_code}' 2>/dev/null || true)"
curl -fsS "${BASE}/layouts/${SEED_UUID}" -o "${WORKDIR}/after-write.yaml" || die "GET after write failed"
check "writes work under read_only (http=${write_code})" \
  "[[ '${write_code}' == '200' ]] && cmp -s '${WORKDIR}/modified.yaml' '${WORKDIR}/after-write.yaml'"

SNAP_WRITE="$(snap_count "$SEED_UUID")"
check "the write created a snapshot (${SNAP_NEW} -> ${SNAP_WRITE})" "[[ '${SNAP_WRITE}' -gt '${SNAP_NEW}' ]]"

check "version endpoint responds" "curl -fsS '${BASE}/version' | grep -q version"

echo "===== result: ${pass} passed, ${fail} failed, ${skip} skipped =====" >&2
[[ "$fail" -eq 0 ]] || die "upgrade smoke FAILED"
echo "PASS: upgrade from ${OLD_TAG} preserved the seeded layout" >&2
