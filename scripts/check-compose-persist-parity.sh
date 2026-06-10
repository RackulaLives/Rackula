#!/usr/bin/env bash
set -euo pipefail

ROOT_COMPOSE="docker-compose.yml"
DEPLOY_COMPOSE="deploy/docker-compose.persist.yml"

required_lines=(
  "API_WRITE_TOKEN=\${RACKULA_API_WRITE_TOKEN:-}"
  "CORS_ORIGIN=\${CORS_ORIGIN:-http://localhost:8080}"
  "RACKULA_API_WRITE_TOKEN=\${RACKULA_API_WRITE_TOKEN:-}"
  "ALLOW_INSECURE_CORS=\${ALLOW_INSECURE_CORS:-false}"
)

for compose_file in "$ROOT_COMPOSE" "$DEPLOY_COMPOSE"; do
  if [[ ! -f "$compose_file" ]]; then
    echo "Missing compose file: $compose_file"
    exit 1
  fi

  for required_line in "${required_lines[@]}"; do
    if ! grep -F --quiet "$required_line" "$compose_file"; then
      echo "Missing '$required_line' in $compose_file"
      exit 1
    fi
  done
done

# RACKULA_STORAGE_MODE wiring must exist in both files, with per-stack
# defaults: root compose defaults to browser (API only runs with
# --profile persist), the persist stack defaults to server.
root_storage_line="RACKULA_STORAGE_MODE=\${RACKULA_STORAGE_MODE:-browser}"
deploy_storage_line="RACKULA_STORAGE_MODE=\${RACKULA_STORAGE_MODE:-server}"

if ! grep -F --quiet "$root_storage_line" "$ROOT_COMPOSE"; then
  echo "Missing '$root_storage_line' in $ROOT_COMPOSE"
  exit 1
fi

if ! grep -F --quiet "$deploy_storage_line" "$DEPLOY_COMPOSE"; then
  echo "Missing '$deploy_storage_line' in $DEPLOY_COMPOSE"
  exit 1
fi

echo "Compose persistence env parity check passed."
