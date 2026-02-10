#!/bin/sh
set -eu

# Ensure envsubst sees API_WRITE_TOKEN even when it is intentionally unset.
: "${API_WRITE_TOKEN:=}"
export API_WRITE_TOKEN

exec /docker-entrypoint.sh "$@"
