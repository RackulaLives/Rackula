#!/usr/bin/env bats
# coderabbit-review-gate.bats — Tests for scripts/coderabbit-review-gate.sh
#
# Run: bats scripts/coderabbit-review-gate.bats
#
# The gate is exercised by injecting a stub `coderabbit` binary via the
# CODERABBIT_BIN env var. Each stub emits a fixed NDJSON stream so the parsing
# and allow/block decision can be verified without touching the network.

# Resolve the gate under test and create a scratch dir for the per-test stub.
setup() {
  GATE="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)/coderabbit-review-gate.sh"
  STUB_DIR="$(mktemp -d)"
  STUB="$STUB_DIR/coderabbit"
}

# Remove the scratch dir created in setup.
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

@test "clean review (zero findings) allows the push" {
  make_stub '{"type":"heartbeat","status":"reviewing"}
{"type":"complete","status":"review_completed","findings":0}' 0
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

@test "real findings block the push and surface each finding" {
  make_stub '{"type":"finding","severity":"major","fileName":"src/foo.ts","line":42,"codegenInstructions":"possible null deref"}
{"type":"finding","severity":"minor","fileName":"src/bar.ts","codegenInstructions":"unused import"}
{"type":"complete","status":"review_completed","findings":2}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"2 issue"* ]]
  [[ "$output" == *"Push blocked"* ]]
  [[ "$output" == *"src/foo.ts:42"* ]]
  [[ "$output" == *"possible null deref"* ]]
  [[ "$output" == *"src/bar.ts"* ]]
  [[ "$output" == *"unused import"* ]]
}

@test "finding count is derived from events even if complete count disagrees" {
  # Three finding events but the complete event claims 99: the reported count must
  # come from the events (3), proving finding_count takes precedence over the
  # complete event's number.
  make_stub '{"type":"finding","severity":"major","fileName":"src/foo.ts","line":1,"codegenInstructions":"bug one"}
{"type":"finding","severity":"major","fileName":"src/bar.ts","line":2,"codegenInstructions":"bug two"}
{"type":"finding","severity":"major","fileName":"src/baz.ts","line":3,"codegenInstructions":"bug three"}
{"type":"complete","status":"review_completed","findings":99}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"3 issue"* ]]
  [[ "$output" != *"99 issue"* ]]
  [[ "$output" == *"bug one"* ]]
  [[ "$output" == *"bug two"* ]]
  [[ "$output" == *"bug three"* ]]
}

@test "findings with an unfamiliar shape still surface" {
  make_stub '{"type":"finding","weird":"x","nested":{"y":1}}
{"type":"complete","status":"review_completed","findings":1}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"1 issue"* ]]
  [[ "$output" == *"weird"* ]]
}

@test "positive complete count with no finding events blocks without faking detail" {
  make_stub '{"type":"complete","status":"review_completed","findings":4}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"4 issue"* ]]
  [[ "$output" == *"emitted no detail"* ]]
}

@test "string-typed complete count still blocks the push" {
  make_stub '{"type":"complete","status":"review_completed","findings":"4"}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"4 issue"* ]]
}

@test "unparseable complete count blocks the push (fail-safe), never passes" {
  make_stub '{"type":"complete","status":"review_completed","findings":null}' 0
  run env CODERABBIT_BIN="$STUB" "$GATE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fail-safe"* ]]
  [[ "$output" != *"No findings"* ]]
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
