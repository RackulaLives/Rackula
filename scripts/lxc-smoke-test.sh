#!/usr/bin/env bash
#
# lxc-smoke-test.sh - dev smoke test for the Rackula Proxmox LXC deploy + upgrade.
#
# Builds nothing: it takes a prebuilt dev tarball (a build-lxc-dev.yml artifact,
# rackula-lxc-*.tar.gz), spins up a throwaway CT, runs the REAL canonical
# rackula-install.sh / update_script against that payload via the
# RACKULA_PREBUILD_TARBALL override, and verifies the result.
#
# Two drivers:
#   pct (default) - run ON a Proxmox host as root; uses the pct/pvesh/pveam CLI.
#   api           - run from anywhere (e.g. a CI runner VM with no pct); drives CT
#                   lifecycle via the Proxmox REST API and runs commands by SSH into
#                   the CT. Reads its config from env (source proxmox-smoke.env first):
#                   PROXMOX_VE_{ENDPOINT,NODE,TOKEN_ID,TOKEN_SECRET,INSECURE} and
#                   RACKULA_{CI_POOL,CT_STORAGE,CT_SSH_KEY,CT_SSH_PUBKEY}. The debian-13
#                   template is auto-detected via the API (override with --template).
#
# Safety: the CT gets a sentinel hostname (rackula-smoke-*). Every destructive op
# refuses any CT whose hostname lacks that prefix, so a real container is never touched.
#
# Usage:
#   scripts/lxc-smoke-test.sh --tarball <file> [--mode deploy|upgrade|both]
#                             [--baseline release|<tarball>] [--driver pct|api]
#                             [--storage <s>] [--bridge <b>] [--template <vztmpl>]
#                             [--keep] [--dry-run]
#
set -euo pipefail

# --- defaults ---------------------------------------------------------------
MODE="both"
TARBALL=""
BASELINE="release"
DRIVER="pct"
DRY_RUN=0
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
CT_IP_CACHE=""
SSH_OPTS=()

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
  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a path}"; shift 2 ;;
    --mode) MODE="${2:?}"; shift 2 ;;
    --baseline) BASELINE="${2:?}"; shift 2 ;;
    --driver) DRIVER="${2:?--driver needs pct|api}"; shift 2 ;;
    --storage) STORAGE="${2:?}"; shift 2 ;;
    --bridge) BRIDGE="${2:?}"; shift 2 ;;
    --template) TEMPLATE="${2:?}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

case "$MODE" in deploy | upgrade | both) ;; *) die "--mode must be deploy|upgrade|both" ;; esac
case "$DRIVER" in pct | api) ;; *) die "--driver must be pct|api" ;; esac
[[ $DRY_RUN -eq 1 && "$DRIVER" != "api" ]] && die "--dry-run is only supported with --driver api"
[[ -n "$TARBALL" ]] || die "--tarball is required (a build-lxc-dev rackula-lxc-*.tar.gz)"
[[ -f "$TARBALL" ]] || die "tarball not found: $TARBALL"
TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
[[ "$BASELINE" == "release" || -f "$BASELINE" ]] || die "--baseline must be 'release' or an existing tarball"

# --- preflight --------------------------------------------------------------
# The script runs the canonical install/update scripts, so it needs the full repo layout
# (deploy/lxc/community-scripts/), not just lxc-smoke-test.sh on its own. Both drivers.
for f in "$CANON/install/rackula-install.sh" "$CANON/ct/rackula.sh"; do
  [[ -f "$f" ]] || die "missing $f - run from a Rackula checkout (ship deploy/lxc/community-scripts/ alongside this script)"
done

if [[ "$DRIVER" == "pct" ]]; then
  [[ "$(id -u)" -eq 0 ]] || die "pct driver must run as root on a Proxmox host"
  for c in pct pvesh curl tar; do command -v "$c" >/dev/null || die "missing required command: $c"; done
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
else
  # api driver: no root, no pct. Needs curl/jq for the REST API and ssh/scp into the CT.
  for c in curl jq ssh scp tar; do command -v "$c" >/dev/null || die "missing required command: $c (api driver)"; done
  _miss=()
  for v in PROXMOX_VE_ENDPOINT PROXMOX_VE_NODE PROXMOX_VE_TOKEN_ID PROXMOX_VE_TOKEN_SECRET \
    RACKULA_CI_POOL RACKULA_CT_STORAGE \
    RACKULA_CT_SSH_KEY RACKULA_CT_SSH_PUBKEY; do
    [[ -n "${!v:-}" ]] || _miss+=("$v")
  done
  [[ ${#_miss[@]} -eq 0 ]] || die "api driver missing env (source proxmox-smoke.env): ${_miss[*]}"
  STORAGE="${STORAGE:-$RACKULA_CT_STORAGE}"
  # TEMPLATE: if not passed via --template, api_create auto-detects the newest debian-13
  # vztmpl via the storage content API, so the gate is not tied to a pinned template version.
  if [[ $DRY_RUN -eq 0 ]]; then
    [[ -f "$RACKULA_CT_SSH_KEY" ]] || die "RACKULA_CT_SSH_KEY not found: $RACKULA_CT_SSH_KEY"
    [[ -f "$RACKULA_CT_SSH_PUBKEY" ]] || die "RACKULA_CT_SSH_PUBKEY not found: $RACKULA_CT_SSH_PUBKEY"
  fi
  # Throwaway CTs reuse CTIDs/IPs, so host keys legitimately churn every run. No host-key
  # check here is intentional and scoped to runner->ephemeral-CT only (see #1982 plan).
  SSH_OPTS=(-T -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
    -o LogLevel=ERROR -o ConnectTimeout=10 -o BatchMode=yes -i "$RACKULA_CT_SSH_KEY")
fi

TMPD="$(mktemp -d)"

# --- Proxmox REST helpers (api driver) -------------------------------------
_urlenc() { jq -rn --arg s "$1" '$s|@uri'; }

# _dry_stub METHOD PATH -> canned JSON so downstream jq parsing succeeds offline.
_dry_stub() {
  local method="$1" path="$2"
  case "$path" in
    /cluster/nextid) echo '{"data":"100"}' ;;
    */content*) echo '{"data":[{"volid":"local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst"}]}' ;;
    */tasks/*/status) echo '{"data":{"status":"stopped","exitstatus":"OK"}}' ;;
    */interfaces) echo '{"data":[{"name":"eth0","inet":"10.0.0.123/24"}]}' ;;
    */config) echo "{\"data\":{\"hostname\":\"${SENTINEL_PREFIX}dry\"}}" ;;
    */lxc) # GET = node CT list (empty), POST = create (returns a UPID)
      if [[ "$method" == "GET" ]]; then echo '{"data":[]}'; else echo '{"data":"UPID:dry:0:0:0:dry::root@pam:"}'; fi ;;
    *) echo '{"data":"UPID:dry:00000000:00000000:00000000:dry::root@pam:"}' ;;
  esac
}

# _pve METHOD PATH [curl-args...] -> response body on stdout.
_pve() {
  local method="$1" path="$2"; shift 2
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN curl -X $method ${PROXMOX_VE_ENDPOINT}/api2/json${path} $*" >&2
    _dry_stub "$method" "$path"
    return 0
  fi
  local opts=(-fsS -H "Authorization: PVEAPIToken=${PROXMOX_VE_TOKEN_ID}=${PROXMOX_VE_TOKEN_SECRET}" -X "$method")
  [[ "${PROXMOX_VE_INSECURE:-}" == "true" ]] && opts+=(-k)
  curl "${opts[@]}" "$@" "${PROXMOX_VE_ENDPOINT}/api2/json${path}"
}

# Poll an async PVE task (UPID) to completion. Returns nonzero on failure/timeout.
_api_wait_task() {
  local upid="$1" enc resp st ex
  enc="$(_urlenc "$upid")"
  for _ in $(seq 1 60); do
    resp="$(_pve GET "/nodes/${PROXMOX_VE_NODE}/tasks/${enc}/status" 2>/dev/null || true)"
    st="$(printf '%s' "$resp" | jq -r '.data.status // empty' 2>/dev/null || true)"
    if [[ "$st" == "stopped" ]]; then
      ex="$(printf '%s' "$resp" | jq -r '.data.exitstatus // empty' 2>/dev/null || true)"
      [[ "$ex" == "OK" ]] && return 0
      warn "PVE task finished non-OK ($ex): $upid"
      return 1
    fi
    sleep 2
  done
  warn "PVE task did not finish in 120s: $upid"
  return 1
}

# --- SSH/scp helpers (api driver; dry-run prints instead of contacting) -----
_shq() { local s=${1//\'/\'\\\'\'}; printf "'%s'" "$s"; }

_ssh() {
  if [[ $DRY_RUN -eq 1 ]]; then echo "DRY-RUN ssh ${SSH_OPTS[*]} $*" >&2; return 0; fi
  # shellcheck disable=SC2029  # the remote command is built client-side on purpose (see _shq)
  ssh "${SSH_OPTS[@]}" "$@"
}
_scp() {
  if [[ $DRY_RUN -eq 1 ]]; then echo "DRY-RUN scp ${SSH_OPTS[*]} $*" >&2; return 0; fi
  scp "${SSH_OPTS[@]}" "$@"
}

# --- shared CT helpers ------------------------------------------------------
# Sentinel hostname derived from the tarball name (DNS-label-safe, <=63 chars).
_sentinel_host() {
  local suffix host
  suffix="$(basename "$TARBALL" .tar.gz | tr -c 'A-Za-z0-9' '-' | tr -s '-' | sed 's/^-//; s/-$//')"
  [[ -n "$suffix" ]] || suffix="ct"
  host="${SENTINEL_PREFIX}${suffix}"
  host="${host:0:63}"
  host="${host%-}"
  printf '%s' "$host"
}

_assert_sentinel() {
  local id="$1" host
  host="$(ct_hostname "$id")"
  [[ "$host" == "${SENTINEL_PREFIX}"* ]] ||
    die "refusing to touch CT $id: hostname '$host' lacks '${SENTINEL_PREFIX}' prefix"
}

# --- driver: pct ------------------------------------------------------------
pct_hostname() { pct config "$1" 2>/dev/null | awk -F': ' '/^hostname:/{print $2}'; }

pct_create() {
  local host newid
  host="$(_sentinel_host)"
  newid="$(pvesh get /cluster/nextid)"
  info "creating CT $newid ($host) from $TEMPLATE on $STORAGE"
  pct create "$newid" "$TEMPLATE" \
    --hostname "$host" --unprivileged 1 --features nesting=1 \
    --cores 1 --memory 512 --rootfs "${STORAGE}:8" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --ostype debian >/dev/null
  # set only after create succeeds, so cleanup never targets a non-existent CT
  CREATED_CTID="$newid"
  _assert_sentinel "$CREATED_CTID"
  pct start "$CREATED_CTID" >/dev/null
}

pct_wait_net() {
  for _ in $(seq 1 30); do
    pct exec "$CREATED_CTID" -- bash -c 'getent hosts github.com >/dev/null 2>&1' &&
      { ok "CT $CREATED_CTID up with network"; return 0; }
    sleep 2
  done
  die "CT $CREATED_CTID has no network after 60s"
}

pct_exec() { pct exec "$1" -- bash -c "$2"; }
pct_push() { pct push "$1" "$2" "$3"; }
# shellcheck disable=SC2329  # invoked indirectly via ct_destroy from the cleanup trap
pct_destroy() {
  pct stop "$1" >/dev/null 2>&1 || true
  pct destroy "$1" >/dev/null 2>&1 || true
}
# First IPv4 of the CT (hostname -I can list IPv6/link-local first; a bare IPv6 in http:// is invalid).
pct_ip() { pct exec "$1" -- bash -c "hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}\$' | head -1" 2>/dev/null; }

# --- driver: api ------------------------------------------------------------
api_hostname() {
  _pve GET "/nodes/${PROXMOX_VE_NODE}/lxc/${1}/config" 2>/dev/null | jq -r '.data.hostname // empty' 2>/dev/null || true
}

api_ip() {
  if [[ -n "$CT_IP_CACHE" ]]; then printf '%s' "$CT_IP_CACHE"; return 0; fi
  local ip
  ip="$(_pve GET "/nodes/${PROXMOX_VE_NODE}/lxc/${1}/interfaces" 2>/dev/null |
    jq -r '.data[]? | select(.name=="eth0") | .inet // empty' 2>/dev/null |
    sed 's#/.*##' | grep -E '^[0-9]+(\.[0-9]+){3}$' | head -1 || true)"
  [[ -n "$ip" ]] || return 1
  CT_IP_CACHE="$ip"
  printf '%s' "$ip"
}

# Newest debian-13 vztmpl on the `local` storage, via the content API (no host CLI).
api_detect_template() {
  _pve GET "/nodes/${PROXMOX_VE_NODE}/storage/local/content?content=vztmpl" 2>/dev/null |
    jq -r '.data[]?.volid // empty' 2>/dev/null | grep 'debian-13' | sort -V | tail -1
}

api_create() {
  local host newid pubkey upid template
  host="$(_sentinel_host)"
  # Cluster-global next free id. Accounts for BOTH VMs and CTs (the node CT list alone
  # misses VMs, e.g. the debian-13-cloud template at 9000). The CT is kept safe by its
  # sentinel hostname + ci-smoke pool membership + ephemeral teardown, not by its id range.
  newid="$(_pve GET /cluster/nextid | jq -r '.data')"
  template="${TEMPLATE:-$(api_detect_template)}"
  [[ -n "$template" ]] || die "no debian-13 vztmpl found via API on storage 'local'; pass --template"
  pubkey="$(cat "$RACKULA_CT_SSH_PUBKEY" 2>/dev/null || true)"
  info "creating CT $newid ($host) via API on $PROXMOX_VE_NODE (pool $RACKULA_CI_POOL, template $template)"
  upid="$(_pve POST "/nodes/${PROXMOX_VE_NODE}/lxc" \
    --data-urlencode "vmid=${newid}" \
    --data-urlencode "hostname=${host}" \
    --data-urlencode "ostemplate=${template}" \
    --data-urlencode "storage=${STORAGE}" \
    --data-urlencode "rootfs=${STORAGE}:8" \
    --data-urlencode "unprivileged=1" \
    --data-urlencode "features=nesting=1" \
    --data-urlencode "cores=1" \
    --data-urlencode "memory=512" \
    --data-urlencode "net0=name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --data-urlencode "ostype=debian" \
    --data-urlencode "pool=${RACKULA_CI_POOL}" \
    --data-urlencode "ssh-public-keys=${pubkey}" | jq -r '.data')"
  if ! _api_wait_task "$upid"; then
    # The create task may have materialised the CT before failing; purge it if it's ours.
    [[ "$(api_hostname "$newid")" == "${SENTINEL_PREFIX}"* ]] && api_destroy "$newid" || true
    die "CT create failed for $newid"
  fi
  CREATED_CTID="$newid"
  _assert_sentinel "$CREATED_CTID"
  upid="$(_pve POST "/nodes/${PROXMOX_VE_NODE}/lxc/${newid}/status/start" | jq -r '.data')"
  _api_wait_task "$upid" || die "CT start failed for $newid"
}

api_wait_net() {
  local ip
  for _ in $(seq 1 30); do
    if ip="$(api_ip "$CREATED_CTID")" && [[ -n "$ip" ]]; then
      if _ssh "root@${ip}" 'getent hosts github.com >/dev/null 2>&1'; then
        ok "CT $CREATED_CTID up at $ip with network + sshd"
        return 0
      fi
    fi
    sleep 2
  done
  die "CT $CREATED_CTID: no IP / sshd / network after 60s"
}

api_exec() {
  local id="$1" cmd="$2" ip
  ip="$(api_ip "$id")" || die "no IP for CT $id"
  _ssh "root@${ip}" "bash -c $(_shq "$cmd")"
}
api_push() {
  local id="$1" src="$2" dst="$3" ip
  ip="$(api_ip "$id")" || die "no IP for CT $id"
  _scp "$src" "root@${ip}:${dst}"
}
api_destroy() {
  local id="$1" upid
  upid="$(_pve POST "/nodes/${PROXMOX_VE_NODE}/lxc/${id}/status/stop" 2>/dev/null | jq -r '.data // empty' 2>/dev/null || true)"
  [[ -n "$upid" ]] && _api_wait_task "$upid" >/dev/null 2>&1 || true
  # No bare assignment here: under set -e+pipefail a failed DELETE (e.g. transient API
  # outage during teardown) would otherwise abort the cleanup trap before TMPD is removed.
  upid="$(_pve DELETE "/nodes/${PROXMOX_VE_NODE}/lxc/${id}?force=1&purge=1" 2>/dev/null | jq -r '.data // empty' 2>/dev/null || true)"
  [[ -n "$upid" ]] && _api_wait_task "$upid" >/dev/null 2>&1 || true
}

# --- driver dispatch --------------------------------------------------------
ct_hostname() { case "$DRIVER" in pct) pct_hostname "$1" ;; api) api_hostname "$1" ;; esac; }
ct_create() { case "$DRIVER" in pct) pct_create ;; api) api_create ;; esac; }
ct_wait_net() { case "$DRIVER" in pct) pct_wait_net ;; api) api_wait_net ;; esac; }
ct_exec() { case "$DRIVER" in pct) pct_exec "$1" "$2" ;; api) api_exec "$1" "$2" ;; esac; }
ct_push() { case "$DRIVER" in pct) pct_push "$1" "$2" "$3" ;; api) api_push "$1" "$2" "$3" ;; esac; }
# shellcheck disable=SC2329  # invoked indirectly from the cleanup trap
ct_destroy() { case "$DRIVER" in pct) pct_destroy "$1" ;; api) api_destroy "$1" ;; esac; }
ct_ip() { case "$DRIVER" in pct) pct_ip "$1" ;; api) api_ip "$1" ;; esac; }

# --- teardown ---------------------------------------------------------------
# shellcheck disable=SC2329  # invoked via trap
cleanup() {
  local rc=$? host
  if [[ -n "$CREATED_CTID" ]]; then
    host="$(ct_hostname "$CREATED_CTID")"
    if [[ $KEEP -eq 1 ]]; then
      warn "--keep set: leaving CT $CREATED_CTID ($host) running"
    elif [[ "$host" == "${SENTINEL_PREFIX}"* ]]; then
      info "tearing down CT $CREATED_CTID"
      ct_destroy "$CREATED_CTID"
    elif [[ -z "$host" ]]; then
      # Hostname unreadable (e.g. transient API outage). CREATED_CTID was validated as a
      # sentinel CT at create time, so it is ours to remove; tear down but warn loudly so a
      # genuine leak is visible rather than silently skipped. ct_destroy is a safe no-op if
      # the CT is already gone.
      warn "could not read hostname for CT $CREATED_CTID (API unreachable?); tearing down the CT we created"
      ct_destroy "$CREATED_CTID"
    else
      warn "refusing to tear down CT $CREATED_CTID: hostname '$host' lacks '${SENTINEL_PREFIX}' prefix; remove it manually if it is ours"
    fi
  fi
  [[ -n "$TMPD" ]] && rm -rf "$TMPD"
  return "$rc"
}
trap cleanup EXIT

# --- stage + install/update -------------------------------------------------
# Stage the framework helpers + canonical scripts into the CT once.
stage_ct() {
  local id="$1"
  _assert_sentinel "$id"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN curl $COMMUNITY_SCRIPTS_URL/misc/install.func -> $TMPD/install.func" >&2
    : >"$TMPD/install.func"
  else
    curl -fsSL "$COMMUNITY_SCRIPTS_URL/misc/install.func" -o "$TMPD/install.func" ||
      die "failed to fetch install.func"
  fi
  ct_exec "$id" 'apt-get update -qq && apt-get install -y -qq curl ca-certificates tar >/dev/null' ||
    die "failed to install base tools in CT $id"
  ct_push "$id" "$TMPD/install.func" /root/install.func
  ct_push "$id" "$CANON/install/rackula-install.sh" /root/rackula-install.sh
  # Extract just the update_script function body (closing brace is at column 0).
  sed -n '/^function update_script()/,/^}/p' "$CANON/ct/rackula.sh" >"$TMPD/update_script.sh"
  ct_push "$id" "$TMPD/update_script.sh" /root/update_script.sh
}

# Run the real rackula-install.sh inside the CT. $2 = payload tarball path on host,
# or empty for a real release fetch (baseline=release).
run_install() {
  local id="$1" payload="${2:-}" pre="" body
  _assert_sentinel "$id"
  if [[ -n "$payload" ]]; then
    ct_push "$id" "$payload" /root/payload.tar.gz
    pre='export RACKULA_PREBUILD_TARBALL=/root/payload.tar.gz;'
    info "installing dev payload ($(basename "$payload")) via real rackula-install.sh"
  else
    info "installing baseline (real latest-release fetch) via rackula-install.sh"
  fi
  # No errexit/nounset: the framework runs install.sh without them and install.sh
  # self-manages via catch_errors. app/APPLICATION are framework vars its motd/cleanup
  # tail references; provide them so the tail does not trip on an unset value.
  body="
    set -o pipefail
    export FUNCTIONS_FILE_PATH=\"\$(cat /root/install.func)\"
    export app=rackula APPLICATION=Rackula tz=\"\${tz:-Etc/UTC}\"
    ${pre}
    bash /root/rackula-install.sh
  "
  ct_exec "$id" "$body"
}

# Run the real update_script body inside the CT against the dev tarball.
run_update() {
  local id="$1" payload="$2" body
  _assert_sentinel "$id"
  ct_push "$id" "$payload" /root/payload.tar.gz
  info "upgrading to dev payload ($(basename "$payload")) via real update_script"
  # shellcheck disable=SC2016  # body runs inside the CT; $vars must not expand on the host
  body='
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
  ct_exec "$id" "$body"
}

# --- smoke checks -----------------------------------------------------------
_check() {
  local id="$1" name="$2" cmd="$3"
  if [[ $DRY_RUN -eq 1 ]]; then
    # In dry-run the remote command is not executed, so a pass/fail verdict would
    # be meaningless. Report it as skipped rather than printing a misleading "ok".
    info "  check (dry-run, not evaluated): $name"
    return 0
  fi
  if ct_exec "$id" "$cmd" >/dev/null 2>&1; then
    ok "  check: $name"
  else
    err "  check FAILED: $name"
    CHECK_FAILS=$((CHECK_FAILS + 1))
  fi
}

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
info "Rackula LXC smoke test - tarball $(basename "$TARBALL"), mode $MODE, driver $DRIVER$([[ $DRY_RUN -eq 1 ]] && echo ' (dry-run)')"
ct_create
ct_wait_net
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
    ct_exec "$CTID" "mkdir -p /opt/rackula/data && printf '%s' '$MARKER' > /opt/rackula/data/.smoke-marker"
    info "seeded data marker: $MARKER"
    run_update "$CTID" "$TARBALL"
    smoke_checks "$CTID"
    GOT="$(ct_exec "$CTID" 'cat /opt/rackula/data/.smoke-marker 2>/dev/null' || true)"
    if [[ $DRY_RUN -eq 1 ]]; then
      : # dry-run: ssh stdout is not captured, so the marker verdict is not meaningful
    elif [[ "$GOT" == "$MARKER" ]]; then
      ok "  check: data survived upgrade"
    else
      err "  check FAILED: data marker lost (got '${GOT}', want '${MARKER}')"
      CHECK_FAILS=$((CHECK_FAILS + 1))
    fi
    ;;
esac

echo
IP="$(ct_ip "$CTID" || true)"
if [[ -n "$IP" ]]; then
  info "web UI: http://${IP}/   (CT $CTID, ${SENTINEL_PREFIX}*)"
  [[ $KEEP -eq 1 ]] && info "CT kept (--keep): browse http://${IP}/ or reach it via SSH; remove the CT manually when done"
fi
if [[ $DRY_RUN -eq 1 ]]; then
  ok "DRY-RUN complete (api call flow walked; health checks not evaluated)"
  exit 0
fi
if [[ "$CHECK_FAILS" -eq 0 ]]; then
  ok "SMOKE TEST PASSED (mode: $MODE)"
  exit 0
else
  err "SMOKE TEST FAILED: $CHECK_FAILS check(s) failed (mode: $MODE)"
  exit 1
fi
