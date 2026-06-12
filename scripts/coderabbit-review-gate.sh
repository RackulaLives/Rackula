#!/usr/bin/env bash
# coderabbit-review-gate.sh — pre-push CodeRabbit gate that tells transient
# errors apart from real review findings.
#
# Runs `coderabbit review --agent` (NDJSON output) and decides whether to block
# the push by inspecting the emitted events. The CLI emits one event per finding
# and a terminal "complete" event whose `findings` field is the COUNT:
#
#   {"type":"finding","severity":"major","fileName":"...","codegenInstructions":"..."}
#   {"type":"complete","status":"review_completed","findings":<count>}
#       count == 0  -> clean pass            (exit 0)
#       count  > 0  -> real findings         (exit 1, BLOCK)
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

# Pull the terminal complete event, if any (last one wins). Its presence is what
# distinguishes a finished review from an interrupted/transient one.
complete_event="$(printf '%s\n' "$output" \
  | jq -rc 'select(type=="object" and .type=="complete" and .status=="review_completed")' 2>/dev/null \
  | tail -n1)"

# Collect the per-finding events. The CLI emits each finding as its own event;
# the complete event only carries a count. Count and render from these.
finding_events="$(printf '%s\n' "$output" \
  | jq -rc 'select(type=="object" and .type=="finding")' 2>/dev/null)"
finding_count="$(printf '%s\n' "$finding_events" | grep -c '[^[:space:]]')"

# Read the complete event's count (normally the integer 8, but tolerate a numeric
# string too). This is a safety net so we never pass when the terminal event
# reports findings but the individual finding events were missed: blocking on a
# bad parse is safer than allowing a push past real findings. An unreadable count
# yields the sentinel -1, which is treated as ambiguous (block), never as zero.
complete_count="$(printf '%s\n' "$complete_event" \
  | jq -r '
      .findings as $f
      | if ($f | type) == "number" then $f
        elif ($f | type) == "string" and ($f | test("^[0-9]+$")) then ($f | tonumber)
        else -1 end' 2>/dev/null)"
# Guarantee a clean integer so the arithmetic tests below cannot error. Anything
# that is not the -1 sentinel or a run of digits collapses to the -1 sentinel.
case "$complete_count" in
  -1) ;;
  '' | *[!0-9]*) complete_count=-1 ;;
esac

if [ -n "$complete_event" ]; then
  if [ "$finding_count" -gt 0 ] || [ "$complete_count" -gt 0 ]; then
    decision="findings"
    if [ "$finding_count" -gt 0 ]; then note="$finding_count"; else note="$complete_count"; fi
  elif [ "$complete_count" -eq 0 ]; then
    decision="pass"
  fi
  # else: a finished review whose count we could not read (-1 sentinel). Leave
  # decision unset so the fail-safe block below blocks the push; an unreadable
  # count is ambiguous, not a clean pass.
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
    # on them without re-running the review. Render each finding event as
    # "severity file:line  summary". codegenInstructions can be long/multi-line,
    # so collapse whitespace and trim. Fall back to raw JSON for unfamiliar shapes.
    rendered="$(printf '%s\n' "$finding_events" | jq -r '
        "  - "
        + (if .severity then "[" + (.severity | tostring) + "] " else "" end)
        + (((.fileName // .file // .path // .location.path) // "?") | tostring)
        + (((.line // .location.line)) as $l | if $l != null then ":" + ($l | tostring) else "" end)
        + "  "
        + (((.codegenInstructions // .title // .message // .description // .body) // (. | tojson))
            | tostring | gsub("\\s+"; " ") | .[0:200])
      ' 2>/dev/null)"
    if [ -n "$rendered" ]; then
      printf '%s\n' "$rendered" >&2
    elif [ -n "${finding_events//[$'\t\r\n ']/}" ]; then
      # Render failed but we have the raw events; dump them verbatim.
      printf '%s\n' "$finding_events" >&2
    else
      # The terminal count reported findings but no per-finding events were
      # captured. Don't pretend to list them; point at the re-run instead.
      echo "  (the review reported findings but emitted no detail to display;" >&2
      echo "   re-run 'coderabbit review --agent --type committed --base ${base}' to see them)" >&2
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
