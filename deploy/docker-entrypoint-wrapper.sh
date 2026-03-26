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

exec /docker-entrypoint.sh "$@"
