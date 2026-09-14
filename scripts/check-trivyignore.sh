#!/usr/bin/env bash
# Enforce the .trivyignore entry format (#3231). Trivy accepts a bare id, so
# without this check an entry with no reason, link, or expiry would silently
# unblock the release gate in build-images.yml.
#
# Every active entry must start with a CVE or GHSA id, carry an exp:YYYY-MM-DD
# field with a real calendar date, and sit directly under a comment block that
# holds both of these lines:
#   # <package> in the <image> image: <reason>   ("images:" for several)
#   # https://github.com/RackulaLives/Rackula/<security/code-scanning, issues, or pull>/<number>
# Other comment lines in the block are allowed. A blank line or a bare "#" line
# ends a comment block.
#
# Usage: scripts/check-trivyignore.sh [file]   (default: .trivyignore)
set -euo pipefail

file="${1:-.trivyignore}"
id_re='^(CVE-[0-9]{4}-[0-9]{4,}|GHSA(-[23456789cfghjmpqrvwx]{4}){3})$'
reason_re='^#[[:space:]]+[^[:space:]]+ in the [^:]+ images?: [^[:space:]]'
link_re='(^|[[:space:]])https://github\.com/RackulaLives/Rackula/(security/code-scanning|issues|pull)/[0-9]+([?#[:space:]]|$)'
errors=0
n=0
has_link=0
has_reason=0

problem() {
  echo "$file:$n: $1" >&2
  errors=$((errors + 1))
}

real_date() {
  local y=$((10#$1)) m=$((10#$2)) d=$((10#$3))
  local days=(31 28 31 30 31 30 31 31 30 31 30 31)
  if ((y % 4 == 0 && (y % 100 != 0 || y % 400 == 0))); then days[1]=29; fi
  ((m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]))
}

while IFS= read -r raw || [[ -n "$raw" ]]; do
  n=$((n + 1))
  line="${raw#"${raw%%[![:space:]]*}"}"
  if [[ -z "$line" || "$line" =~ ^#[[:space:]]*$ ]]; then
    has_link=0
    has_reason=0
  elif [[ "$line" == \#* ]]; then
    if [[ "$line" =~ $link_re ]]; then
      has_link=1
    elif [[ "$line" =~ $reason_re ]]; then
      has_reason=1
    fi
  else
    if [[ ! "${line%%[[:space:]]*}" =~ $id_re ]]; then
      problem "first field is not a CVE or GHSA id: $line"
    fi
    if [[ ! " $line " =~ [[:space:]]exp:([0-9]{4})-([0-9]{2})-([0-9]{2})[[:space:]] ]]; then
      problem "missing exp:YYYY-MM-DD: $line"
    elif ! real_date "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"; then
      problem "exp: is not a real calendar date: $line"
    fi
    if [[ "$has_reason" -eq 0 ]]; then
      problem "no reason line (# <package> in the <image> image: <reason>) directly above: $line"
    fi
    if [[ "$has_link" -eq 0 ]]; then
      problem "no RackulaLives/Rackula alert, issue, or PR link directly above: $line"
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
