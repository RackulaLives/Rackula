#!/usr/bin/env bash
# add-corpus-fixture.sh — Add a current-format layout to the upgrade corpus.
#
# Usage: scripts/add-corpus-fixture.sh <path-to.rackula.yaml> <tag-slug>
# Example: scripts/add-corpus-fixture.sh ~/Downloads/lab.rackula.yaml v26.6.0-lab
#
# Copies the layout into the corpus and writes an empty allow-list sidecar
# (current-format layouts need no transformations). Verify by running:
#   npm run test:run -- src/tests/upgrade-corpus.test.ts
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

SRC="${1:-}"
SLUG="${2:-}"
[[ -n "$SRC" && -n "$SLUG" ]] || die "usage: $0 <path-to.rackula.yaml> <tag-slug>"
[[ -f "$SRC" ]] || die "no such file: $SRC"

DIR="src/tests/fixtures/upgrade-corpus"
cp "$SRC" "${DIR}/${SLUG}.rackula.yaml"
printf '{\n  "allowList": []\n}\n' > "${DIR}/${SLUG}.expected.json"
echo ">> added ${DIR}/${SLUG}.rackula.yaml + sidecar" >&2
echo ">> now run: npm run test:run -- src/tests/upgrade-corpus.test.ts" >&2
