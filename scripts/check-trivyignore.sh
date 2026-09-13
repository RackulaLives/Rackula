#!/usr/bin/env bash
# Enforce the .trivyignore entry format (#3231). Trivy accepts a bare id, so
# without this check an entry with no reason, link, or expiry would silently
# unblock the release gate in build-images.yml.
#
# Every active entry must carry an exp:YYYY-MM-DD field on its own line and
# sit directly under a comment block with a reason line and an https:// link.
# A blank line or a bare "#" line ends a comment block.
#
# Usage: scripts/check-trivyignore.sh [file]   (default: .trivyignore)
set -euo pipefail

file="${1:-.trivyignore}"
errors=0
n=0
has_link=0
has_reason=0

while IFS= read -r raw || [[ -n "$raw" ]]; do
  n=$((n + 1))
  line="${raw#"${raw%%[![:space:]]*}"}"
  if [[ -z "$line" || "$line" =~ ^#[[:space:]]*$ ]]; then
    has_link=0
    has_reason=0
  elif [[ "$line" == \#* ]]; then
    if [[ "$line" == *https://* ]]; then has_link=1; else has_reason=1; fi
  else
    if [[ ! " $line " =~ [[:space:]]exp:[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]] ]]; then
      echo "$file:$n: missing exp:YYYY-MM-DD: $line" >&2
      errors=$((errors + 1))
    fi
    if [[ "$has_link" -eq 0 || "$has_reason" -eq 0 ]]; then
      echo "$file:$n: needs a comment block directly above with a reason and an https:// link: $line" >&2
      errors=$((errors + 1))
    fi
    has_link=0
    has_reason=0
  fi
done <"$file"

if [[ "$errors" -gt 0 ]]; then
  echo "$file: $errors problem(s); see the header of .trivyignore for the format." >&2
  exit 1
fi
echo "$file: OK"
