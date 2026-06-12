#!/usr/bin/env bats
# coderabbit-review-gate.bats — Tests for scripts/coderabbit-review-gate.sh
#
# Run: bats scripts/coderabbit-review-gate.bats
#
# The gate is exercised by injecting a stub `coderabbit` binary via the
# CODERABBIT_BIN env var. Each stub emits a fixed NDJSON stream so the parsing
# and allow/block decision can be verified without touching the network.

setup() {
  GATE="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)/coderabbit-review-gate.sh"
  STUB_DIR="$(mktemp -d)"
  STUB="$STUB_DIR/coderabbit"
}

teardown() {
  rm -rf "$STUB_DIR"
}

# Write a stub coderabbit that prints $1 to stdout and exits with code $2.
make_stub() {
  local body="$1"
  local code="${2:-0}"
  {
    printf '#!/usr/bin/env bash\n'
    printf 'cat <<'\''STUB_EOF'\''\n%s\nSTUB_EOF\n' "$body"
    printf 'exit %s\n' "$code"
  } >"$STUB"
  chmod +x "$STUB"
}

@test "clean review (empty findings) allows the push" {
  make_stub '{"type":"heartbeat","status":"reviewing"}
{"type":"complete","status":"review_completed","findings":[]}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No findings"* ]]
}

@test "rate_limit error allows the push with a warning" {
  make_stub '{"type":"error","errorType":"rate_limit","message":"Rate limit exceeded","recoverable":true,"waitTime":"10 minutes and 29 seconds"}' 1
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNING"* ]]
  [[ "$output" == *"rate_limit"* ]]
}

@test "recoverable error (non-rate-limit) allows the push" {
  make_stub '{"type":"error","errorType":"connection_failed","message":"network down","recoverable":true}' 1
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNING"* ]]
}

@test "real findings block the push" {
  make_stub '{"type":"complete","status":"review_completed","findings":[{"title":"bug"},{"title":"smell"}]}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"2 issue"* ]]
  [[ "$output" == *"Push blocked"* ]]
}

@test "non-recoverable error blocks the push (fail-safe)" {
  make_stub '{"type":"error","errorType":"auth_failed","message":"bad token","recoverable":false}' 1
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fail-safe"* ]]
}

@test "empty output blocks the push (fail-safe)" {
  make_stub '' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"no parseable output"* ]] || [[ "$output" == *"fail-safe"* ]]
}

@test "garbage output blocks the push (fail-safe)" {
  make_stub 'not json at all
<<< partial garbage >>>' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fail-safe"* ]]
}

@test "no terminal event blocks the push (fail-safe)" {
  make_stub '{"type":"heartbeat","status":"reviewing"}
{"type":"heartbeat","status":"reviewing"}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fail-safe"* ]]
}
