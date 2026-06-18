#!/usr/bin/env bash
# check-corpus-freshness.sh -- Fail if the schema changed since the last release
# but no new upgrade-corpus fixture was added. Fail-closed release guard.
#
# Usage: scripts/check-corpus-freshness.sh [BASE_REF]
# BASE_REF defaults to the newest v* tag that does not point at HEAD.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

CORPUS_DIR="src/tests/fixtures/upgrade-corpus"
SCHEMA_PATHS=(
  "src/lib/schemas"
  "src/lib/utils/yaml.ts"
  "src/lib/utils/serialization.ts"
  "src/lib/storage/migrate-layout.ts"
  "src/lib/storage/adapt-legacy-layout.ts"
)

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  head_tag="$(git tag --points-at HEAD --list 'v*' | head -1 || true)"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$t" != "$head_tag" ]]; then BASE="$t"; break; fi
  done < <(git tag --list 'v*' --sort=-v:refname)
fi
[[ -n "$BASE" ]] || die "could not resolve a previous release tag; pass one explicitly"

echo ">> comparing ${BASE}..HEAD" >&2
if git diff --quiet "$BASE" HEAD -- "${SCHEMA_PATHS[@]}"; then
  echo ">> no schema-path changes since ${BASE}; corpus freshness not required" >&2
  exit 0
fi

added="$(git diff --name-only --diff-filter=A "$BASE" HEAD -- "${CORPUS_DIR}/*.rackula.yaml" | grep -c . || true)"
if [[ "${added:-0}" -lt 1 ]]; then
  die "schema changed since ${BASE} but no new corpus fixture was added under ${CORPUS_DIR}. Capture a current-format layout (see ${CORPUS_DIR}/README.md) and commit it."
fi
echo ">> schema changed and ${added} new corpus fixture(s) added since ${BASE}; OK" >&2
