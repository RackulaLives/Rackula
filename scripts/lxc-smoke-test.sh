#!/usr/bin/env bash
#
# lxc-smoke-test.sh - dev smoke test for the Rackula Proxmox LXC deploy + upgrade.
#
# Runs ON a Proxmox host (root). Builds nothing: it takes a prebuilt dev tarball
# (a build-lxc-dev.yml artifact, rackula-lxc-*.tar.gz), spins up a throwaway CT,
# runs the REAL canonical rackula-install.sh / update_script against that payload
# via the RACKULA_PREBUILD_TARBALL override, and verifies the result.
#
# Safety: the CT is auto-allocated (pvesh nextid) with a sentinel hostname
# (rackula-smoke-*). Every destructive pct call refuses any CT whose hostname
# lacks that prefix, so a real container can never be touched.
#
# Usage:
#   scripts/lxc-smoke-test.sh --tarball <file> [--mode deploy|upgrade|both]
#                             [--baseline release|<tarball>] [--storage <s>]
#                             [--bridge <b>] [--template <vztmpl>] [--keep]
#
set -euo pipefail

# --- defaults ---------------------------------------------------------------
MODE="both"
TARBALL=""
BASELINE="release"
STORAGE=""
BRIDGE="vmbr0"
TEMPLATE=""
KEEP=0
SENTINEL_PREFIX="rackula-smoke-"
COMMUNITY_SCRIPTS_URL="https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CANON="$REPO_ROOT/deploy/lxc/community-scripts"

CREATED_CTID=""
CHECK_FAILS=0
TMPD=""

# --- logging ----------------------------------------------------------------
info() { echo -e "\033[34m[*]\033[0m $*" >&2; }
ok() { echo -e "\033[32m[+]\033[0m $*" >&2; }
# shellcheck disable=SC2329  # invoked from cleanup (trap)
warn() { echo -e "\033[33m[!]\033[0m $*" >&2; }
err() { echo -e "\033[31m[x]\033[0m $*" >&2; }
die() {
  err "$*"
  exit 1
}

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a path}"; shift 2 ;;
    --mode) MODE="${2:?}"; shift 2 ;;
    --baseline) BASELINE="${2:?}"; shift 2 ;;
    --storage) STORAGE="${2:?}"; shift 2 ;;
    --bridge) BRIDGE="${2:?}"; shift 2 ;;
    --template) TEMPLATE="${2:?}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h | --help) usage 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

case "$MODE" in deploy | upgrade | both) ;; *) die "--mode must be deploy|upgrade|both" ;; esac
[[ -n "$TARBALL" ]] || die "--tarball is required (a build-lxc-dev rackula-lxc-*.tar.gz)"
[[ -f "$TARBALL" ]] || die "tarball not found: $TARBALL"
TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
[[ "$BASELINE" == "release" || -f "$BASELINE" ]] || die "--baseline must be 'release' or an existing tarball"

# --- preflight --------------------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || die "must run as root on a Proxmox host"
for c in pct pvesh curl tar; do command -v "$c" >/dev/null || die "missing required command: $c"; done
# The script runs the canonical install/update scripts, so it needs the full repo layout
# (deploy/lxc/community-scripts/), not just lxc-smoke-test.sh on its own.
for f in "$CANON/install/rackula-install.sh" "$CANON/ct/rackula.sh"; do
  [[ -f "$f" ]] || die "missing $f - run from a Rackula checkout (ship deploy/lxc/community-scripts/ alongside this script)"
done

if [[ -z "$STORAGE" ]]; then
  # first ACTIVE storage that can hold a container rootfs (Status column == active)
  STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active"{print $1; exit}')"
  [[ -n "$STORAGE" ]] || die "could not auto-detect an active rootdir storage; pass --storage"
  info "auto-detected storage: $STORAGE"
fi
if [[ -z "$TEMPLATE" ]]; then
  # newest debian-13 template across all active template (vztmpl) storages
  for _st in $(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active"{print $1}'); do
    TEMPLATE="$(pveam list "$_st" 2>/dev/null | awk '/debian-13/{print $1}' | sort -V | tail -1)"
    [[ -n "$TEMPLATE" ]] && break
  done
  [[ -n "$TEMPLATE" ]] || die "could not auto-detect a debian-13 template; pass --template (e.g. local:vztmpl/debian-13-standard_*.tar.zst)"
  info "auto-detected template: $TEMPLATE"
fi

TMPD="$(mktemp -d)"

# --- sentinel-guarded CT helpers -------------------------------------------
_ct_hostname() { pct config "$1" 2>/dev/null | awk -F': ' '/^hostname:/{print $2}'; }

_assert_sentinel() {
  local id="$1" host
  host="$(_ct_hostname "$id")"
  [[ "$host" == "${SENTINEL_PREFIX}"* ]] ||
    die "refusing to touch CT $id: hostname '$host' lacks '${SENTINEL_PREFIX}' prefix"
}

# shellcheck disable=SC2329  # invoked via trap
cleanup() {
  local rc=$?
  if [[ -n "$CREATED_CTID" ]]; then
    if [[ $KEEP -eq 1 ]]; then
      warn "--keep set: leaving CT $CREATED_CTID ($(_ct_hostname "$CREATED_CTID")) running"
    elif [[ "$(_ct_hostname "$CREATED_CTID")" == "${SENTINEL_PREFIX}"* ]]; then
      info "tearing down CT $CREATED_CTID"
      pct stop "$CREATED_CTID" >/dev/null 2>&1 || true
      pct destroy "$CREATED_CTID" >/dev/null 2>&1 || true
    fi
  fi
  [[ -n "$TMPD" ]] && rm -rf "$TMPD"
  return "$rc"
}
trap cleanup EXIT

# Creates the throwaway CT and sets the global CREATED_CTID (no stdout capture, no
# subshell - so the EXIT trap can always tear it down).
create_ct() {
  local newid host suffix
  # DNS-label-safe hostname suffix from the tarball name
  suffix="$(basename "$TARBALL" .tar.gz | tr -c 'A-Za-z0-9' '-' | tr -s '-' | sed 's/^-//; s/-$//')"
  [[ -n "$suffix" ]] || suffix="ct"
  host="${SENTINEL_PREFIX}${suffix}"
  host="${host:0:63}"
  host="${host%-}"
  newid="$(pvesh get /cluster/nextid)"
  info "creating CT $newid ($host) from $TEMPLATE on $STORAGE"
  pct create "$newid" "$TEMPLATE" \
    --hostname "$host" --unprivileged 1 --features nesting=1 \
    --cores 1 --memory 512 --rootfs "${STORAGE}:8" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --ostype debian >/dev/null
  # set only after pct create succeeds, so cleanup never targets a non-existent CT
  CREATED_CTID="$newid"
  _assert_sentinel "$CREATED_CTID"
  pct start "$CREATED_CTID" >/dev/null
  local i
  for i in $(seq 1 30); do
    pct exec "$CREATED_CTID" -- bash -c 'getent hosts github.com >/dev/null 2>&1' && break
    sleep 2
    [[ "$i" -eq 30 ]] && die "CT $CREATED_CTID has no network after 60s"
  done
  ok "CT $CREATED_CTID up with network"
}

# Stage the framework helpers + canonical scripts into the CT once.
stage_ct() {
  local id="$1"
  _assert_sentinel "$id"
  curl -fsSL "$COMMUNITY_SCRIPTS_URL/misc/install.func" -o "$TMPD/install.func" ||
    die "failed to fetch install.func"
  pct exec "$id" -- bash -c 'apt-get update -qq && apt-get install -y -qq curl ca-certificates tar >/dev/null' ||
    die "failed to install base tools in CT $id"
  pct push "$id" "$TMPD/install.func" /root/install.func
  pct push "$id" "$CANON/install/rackula-install.sh" /root/rackula-install.sh
  # Extract just the update_script function body (closing brace is at column 0).
  sed -n '/^function update_script()/,/^}/p' "$CANON/ct/rackula.sh" >"$TMPD/update_script.sh"
  pct push "$id" "$TMPD/update_script.sh" /root/update_script.sh
}

# Run the real rackula-install.sh inside the CT. $2 = payload tarball path on host,
# or empty for a real release fetch (baseline=release).
run_install() {
  local id="$1" payload="${2:-}"
  _assert_sentinel "$id"
  local pre=""
  if [[ -n "$payload" ]]; then
    pct push "$id" "$payload" /root/payload.tar.gz
    pre='export RACKULA_PREBUILD_TARBALL=/root/payload.tar.gz;'
    info "installing dev payload ($(basename "$payload")) via real rackula-install.sh"
  else
    info "installing baseline (real latest-release fetch) via rackula-install.sh"
  fi
  # No errexit/nounset: the framework runs install.sh without them and install.sh
  # self-manages via catch_errors. app/APPLICATION are framework vars its motd/cleanup
  # tail references; provide them so the tail does not trip on an unset value.
  pct exec "$id" -- bash -c "
    set -o pipefail
    export FUNCTIONS_FILE_PATH=\"\$(cat /root/install.func)\"
    export app=rackula APPLICATION=Rackula tz=\"\${tz:-Etc/UTC}\"
    $pre
    bash /root/rackula-install.sh
  "
}

# Run the real update_script body inside the CT against the dev tarball.
run_update() {
  local id="$1" payload="$2"
  _assert_sentinel "$id"
  pct push "$id" "$payload" /root/payload.tar.gz
  info "upgrading to dev payload ($(basename "$payload")) via real update_script"
  # shellcheck disable=SC2016  # body runs inside the CT; $vars must not expand on the host
  pct exec "$id" -- bash -c '
    # No errexit: the framework runs update_script without it; update_script signals
    # real failure via its own exit 1, and the marker + smoke checks are the verdict.
    set -o pipefail
    export FUNCTIONS_FILE_PATH="$(cat /root/install.func)"
    source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
    color 2>/dev/null || true
    # host-only framework guards are no-ops inside the CT
    header_info() { :; }
    check_container_storage() { :; }
    check_container_resources() { :; }
    APP="Rackula"
    export RACKULA_PREBUILD_TARBALL=/root/payload.tar.gz
    source /root/update_script.sh
    update_script
  '
}

# --- smoke checks -----------------------------------------------------------
_check() {
  local id="$1" name="$2" cmd="$3"
  if pct exec "$id" -- bash -c "$cmd" >/dev/null 2>&1; then
    ok "  check: $name"
  else
    err "  check FAILED: $name"
    CHECK_FAILS=$((CHECK_FAILS + 1))
  fi
}

# First IPv4 of the CT (hostname -I can list IPv6/link-local first; a bare IPv6 in http:// is invalid).
ct_ip() { pct exec "$1" -- bash -c "hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}\$' | head -1" 2>/dev/null; }

smoke_checks() {
  local id="$1"
  info "smoke checks on CT $id"
  _check "$id" "API /api/health responds" "curl -sf --max-time 5 http://127.0.0.1/api/health"
  _check "$id" "frontend served" "curl -sf --max-time 5 -o /dev/null http://127.0.0.1/"
  _check "$id" "rackula-api active" "systemctl is-active --quiet rackula-api"
  _check "$id" "nginx active" "systemctl is-active --quiet nginx"
  _check "$id" "no API crash in journal" \
    "! journalctl -u rackula-api --no-pager 2>/dev/null | grep -qiE 'panic|segfault|MODULE_NOT_FOUND|cannot find module'"
}

# --- run --------------------------------------------------------------------
info "Rackula LXC smoke test - tarball $(basename "$TARBALL"), mode $MODE"
create_ct
CTID="$CREATED_CTID"
stage_ct "$CTID"

case "$MODE" in
  deploy)
    run_install "$CTID" "$TARBALL"
    smoke_checks "$CTID"
    ;;
  upgrade | both)
    # baseline install (release by default, so the real fetch_and_deploy runs once)
    if [[ "$BASELINE" == "release" ]]; then
      run_install "$CTID" ""
    else
      run_install "$CTID" "$BASELINE"
    fi
    smoke_checks "$CTID"
    # seed a data marker, then upgrade to the dev payload
    MARKER="smoke-$(date +%s)-$$"
    pct exec "$CTID" -- bash -c "mkdir -p /opt/rackula/data && printf '%s' '$MARKER' > /opt/rackula/data/.smoke-marker"
    info "seeded data marker: $MARKER"
    run_update "$CTID" "$TARBALL"
    smoke_checks "$CTID"
    GOT="$(pct exec "$CTID" -- bash -c 'cat /opt/rackula/data/.smoke-marker 2>/dev/null' || true)"
    if [[ "$GOT" == "$MARKER" ]]; then
      ok "  check: data survived upgrade"
    else
      err "  check FAILED: data marker lost (got '${GOT}', want '${MARKER}')"
      CHECK_FAILS=$((CHECK_FAILS + 1))
    fi
    ;;
esac

echo
IP="$(ct_ip "$CTID")"
if [[ -n "$IP" ]]; then
  info "web UI: http://${IP}/   (CT $CTID, ${SENTINEL_PREFIX}*)"
  [[ $KEEP -eq 1 ]] && info "CT kept (--keep): browse http://${IP}/ or 'pct enter $CTID'; remove with 'pct stop $CTID && pct destroy $CTID'"
fi
if [[ "$CHECK_FAILS" -eq 0 ]]; then
  ok "SMOKE TEST PASSED (mode: $MODE)"
  exit 0
else
  err "SMOKE TEST FAILED: $CHECK_FAILS check(s) failed (mode: $MODE)"
  exit 1
fi
