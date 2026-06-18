#!/usr/bin/env bash
# add-corpus-fixture.sh - Add a current-format layout to the upgrade corpus.
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

case "$SLUG" in
  *[!a-zA-Z0-9._-]* | *..* ) die "invalid slug '$SLUG' (use only letters, digits, dot, underscore, hyphen)";;
esac

DIR="src/tests/fixtures/upgrade-corpus"
DEST_YAML="${DIR}/${SLUG}.rackula.yaml"
DEST_JSON="${DIR}/${SLUG}.expected.json"
[[ -e "$DEST_YAML" || -e "$DEST_JSON" ]] && die "fixture '${SLUG}' already exists; choose another slug"

cp "$SRC" "$DEST_YAML"
printf '{\n  "allowList": []\n}\n' > "$DEST_JSON"
echo ">> added ${DEST_YAML} + sidecar" >&2
echo ">> now run: npm run test:run -- src/tests/upgrade-corpus.test.ts" >&2
