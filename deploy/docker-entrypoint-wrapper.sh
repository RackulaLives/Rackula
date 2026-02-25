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

exec /docker-entrypoint.sh "$@"
