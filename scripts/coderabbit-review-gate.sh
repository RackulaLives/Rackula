#!/usr/bin/env bash
# coderabbit-review-gate.sh — pre-push CodeRabbit gate that tells transient
# errors apart from real review findings.
#
# Runs `coderabbit review --agent` (NDJSON output) and decides whether to block
# the push by inspecting the emitted events:
#
#   {"type":"complete","status":"review_completed","findings":[...]}
#       findings == []  -> clean pass        (exit 0)
#       findings != []  -> real findings     (exit 1, BLOCK)
#
#   {"type":"error","errorType":"rate_limit","recoverable":true,...}
#   {"type":"error","recoverable":true,...}        (any recoverable error)
#   {"type":"error","errorType":"<network/connection>",...}
#       transient                            (exit 0, WARN + allow)
#
#   anything else: empty output, unparseable JSON, an "error" event that is not
#   recoverable, or no terminal event at all
#       FAIL SAFE                            (exit 1, BLOCK)
#
# Default-deny: only an explicit clean pass or an explicit transient/recoverable
# error allows the push. Everything ambiguous blocks.
#
# Env:
#   CODERABBIT_BIN   override the coderabbit binary (default: coderabbit). Used
#                    by tests to inject a stub. May contain a command + args.
#   CODERABBIT_BASE  base ref to compare against (default: origin/main).

set -u

bin="${CODERABBIT_BIN:-coderabbit}"
base="${CODERABBIT_BASE:-origin/main}"

if ! command -v jq >/dev/null 2>&1; then
  echo "coderabbit-review-gate: 'jq' is required to parse review output. Push blocked." >&2
  echo "Install jq, or use 'git push --no-verify' to skip the gate." >&2
  exit 1
fi

echo "Running CodeRabbit review on committed changes..."

# Capture the raw NDJSON stream. We do not block on the CLI's own exit code:
# a rate-limited run exits non-zero but is still a transient outcome we want to
# parse and forgive. The decision is driven entirely by the emitted events.
output="$(${bin} review --agent --type committed --base "${base}" 2>/dev/null)"

# Empty output is never a clean pass. Default-deny.
if [ -z "${output//[$'\t\r\n ']/}" ]; then
  echo "" >&2
  echo "CodeRabbit produced no parseable output. Push blocked (fail-safe)." >&2
  echo "Re-run 'coderabbit review --agent' locally, or use 'git push --no-verify' to skip." >&2
  exit 1
fi

# Inspect the stream. Process events newest-relevant-first:
#   1. A clean complete event allows the push.
#   2. A complete event with findings blocks.
#   3. A recoverable/transient error event warns and allows.
#   4. Anything else falls through to the fail-safe block.
#
# `decision` is set by the jq pass below to one of: pass | findings | transient.
# `note` carries a human-readable detail (finding count or error reason).
decision=""
note=""

# Pull the terminal complete event, if any (last one wins). Keep the whole event
# object so its findings can be surfaced verbatim when the push is blocked.
complete_event="$(printf '%s\n' "$output" \
  | jq -rc 'select(type=="object" and .type=="complete" and .status=="review_completed")' 2>/dev/null \
  | tail -n1)"
complete_findings="$(printf '%s\n' "$complete_event" | jq -r '.findings | length' 2>/dev/null)"

if [ -n "$complete_findings" ]; then
  if [ "$complete_findings" -eq 0 ] 2>/dev/null; then
    decision="pass"
  else
    decision="findings"
    note="$complete_findings"
  fi
fi

# If there was no clean/findings verdict, look for a transient error event.
if [ -z "$decision" ]; then
  transient="$(printf '%s\n' "$output" \
    | jq -rc '
        select(type=="object" and .type=="error")
        | select(
            (.recoverable == true)
            or (.errorType == "rate_limit")
            or (.errorType // "" | test("(?i)(rate|network|connection|timeout|econn|enotfound|temporar)"))
          )
        | (.errorType // "error")
      ' 2>/dev/null \
    | tail -n1)"
  if [ -n "$transient" ]; then
    decision="transient"
    note="$transient"
  fi
fi

case "$decision" in
  pass)
    echo "CodeRabbit review complete. No findings."
    exit 0
    ;;
  transient)
    echo "" >&2
    echo "WARNING: CodeRabbit review could not complete (${note})." >&2
    echo "This is a transient/recoverable error, not a review failure, so the push is allowed." >&2
    echo "Please re-review locally later: 'coderabbit review --agent --type committed --base ${base}'." >&2
    exit 0
    ;;
  findings)
    echo "" >&2
    echo "CodeRabbit found ${note} issue(s). Push blocked." >&2
    echo "" >&2
    # Surface the actual findings, not just the count, so the developer can act
    # on them without re-running the review (restores the pre-extraction hook
    # behaviour). Best-effort render of common fields; fall back to the raw
    # finding JSON when the shape is unfamiliar.
    rendered="$(printf '%s\n' "$complete_event" | jq -r '
        .findings[]
        | "  - "
          + (((.file // .path // .location.path) // "?") | tostring)
          + (((.line // .location.line)) as $l | if $l != null then ":" + ($l | tostring) else "" end)
          + "  "
          + (((.title // .message // .description // .body) // (. | tojson)) | tostring)
      ' 2>/dev/null)"
    if [ -n "$rendered" ]; then
      printf '%s\n' "$rendered" >&2
    else
      printf '%s\n' "$complete_event" | jq -rc '.findings[]' 2>/dev/null >&2
    fi
    echo "" >&2
    echo "Fix the issues above or use 'git push --no-verify' to skip." >&2
    exit 1
    ;;
  *)
    echo "" >&2
    echo "CodeRabbit output could not be classified as a clean pass or a transient error. Push blocked (fail-safe)." >&2
    echo "Inspect with 'coderabbit review --agent --type committed --base ${base}', or use 'git push --no-verify' to skip." >&2
    exit 1
    ;;
esac
