#!/bin/sh
set -eu

# Ensure envsubst sees API_WRITE_TOKEN even when it is intentionally unset.
: "${API_WRITE_TOKEN:=}"
export API_WRITE_TOKEN

# Normalize auth mode for nginx template rendering.
# Accept legacy AUTH_MODE as fallback for compatibility.
raw_auth_mode="${RACKULA_AUTH_MODE:-${AUTH_MODE:-none}}"

raw_auth_mode_lower="$(printf '%s' "$raw_auth_mode" | tr '[:upper:]' '[:lower:]')"
auth_mode="$(printf '%s' "$raw_auth_mode_lower" | tr -d '[:space:]')"

case "$auth_mode" in
  "" | "none")
    RACKULA_AUTH_MODE="none"
    ;;
  "oidc" | "local")
    RACKULA_AUTH_MODE="$auth_mode"
    ;;
  *)
    echo "WARN: Invalid auth mode '$raw_auth_mode'; defaulting to RACKULA_AUTH_MODE=none" >&2
    RACKULA_AUTH_MODE="none"
    ;;
esac

export RACKULA_AUTH_MODE

# Trust proxy -- normalize RACKULA_TRUST_PROXY for nginx template rendering.
# Accepts 1/true/yes (case-insensitive) to enable, anything else is 0 (disabled).
# Required when Rackula is behind a TLS-terminating reverse proxy so auth
# redirects use the correct external scheme (https) via X-Forwarded-Proto.
raw_trust_proxy="${RACKULA_TRUST_PROXY:-0}"
raw_trust_proxy_lower="$(printf '%s' "$raw_trust_proxy" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

case "$raw_trust_proxy_lower" in
  1|true|yes)
    RACKULA_TRUST_PROXY="1"
    ;;
  *)
    RACKULA_TRUST_PROXY="0"
    ;;
esac
export RACKULA_TRUST_PROXY

# IPv6 listener -- auto-detect unless explicitly overridden.
# RACKULA_ENABLE_IPV6: "auto" (default) | "true" | "false"
# Detection uses /proc/net/if_inet6 (same method as official nginx Docker image).
ipv6_setting="${RACKULA_ENABLE_IPV6:-auto}"
ipv6_setting_lower="$(printf '%s' "$ipv6_setting" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

# Auto-detect: /proc/net/if_inet6 exists when IPv6 is enabled in the kernel.
# Absent when booted with ipv6.disable=1 or IPv6 module blacklisted.
ipv6_detect() { [ -f /proc/net/if_inet6 ]; }

case "$ipv6_setting_lower" in
  true)  ipv6_enabled=true ;;
  false) ipv6_enabled=false ;;
  auto|"")
    if ipv6_detect; then ipv6_enabled=true; else ipv6_enabled=false; fi
    ;;
  *)
    echo "WARN: Invalid RACKULA_ENABLE_IPV6='$ipv6_setting'; defaulting to auto-detect" >&2
    if ipv6_detect; then ipv6_enabled=true; else ipv6_enabled=false; fi
    ;;
esac

port="${RACKULA_LISTEN_PORT:-8080}"
if [ "$ipv6_enabled" = true ]; then
  RACKULA_IPV6_LISTEN="listen [::]:${port};"
else
  RACKULA_IPV6_LISTEN="# IPv6 not available"
  echo "INFO: IPv6 listen disabled (setting=$ipv6_setting_lower, /proc/net/if_inet6=$([ -f /proc/net/if_inet6 ] && echo 'found' || echo 'absent'))" >&2
fi
export RACKULA_IPV6_LISTEN

# Default resolver for nginx upstream DNS resolution.
# Docker uses 127.0.0.11 (embedded DNS). Override via NGINX_RESOLVER for other
# environments (e.g., Kubernetes cluster DNS IP).
: "${NGINX_RESOLVER:=127.0.0.11}"
export NGINX_RESOLVER

# Log configuration for debugging connectivity issues.
echo "Rackula: DNS resolver=${NGINX_RESOLVER} API upstream=${API_HOST}:${API_PORT} trust_proxy=${RACKULA_TRUST_PROXY}" >&2

# Warn Kubernetes users if API_HOST is a bare hostname (no dots).
# nginx resolver doesn't apply search domains, so bare names won't resolve
# in Kubernetes — FQDN like rackula-api.<ns>.svc.cluster.local is required.
if [ -n "${KUBERNETES_SERVICE_HOST:-}" ]; then
  case "${API_HOST}" in
    *.*) ;;  # Contains dots — likely FQDN or IP, fine
    *) echo "WARN: Kubernetes detected with bare API_HOST='${API_HOST}'. nginx requires FQDN (e.g., ${API_HOST}.default.svc.cluster.local). Set NGINX_RESOLVER to your cluster DNS IP if not 127.0.0.11." >&2 ;;
  esac
fi

exec /docker-entrypoint.sh "$@"
