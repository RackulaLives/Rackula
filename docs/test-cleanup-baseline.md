# Test Cleanup Baseline Measurements

This document tracks the metrics for the test suite cleanup to fix OOM crashes and improve token efficiency.

## Before (Baseline)

**Measurement Date:** 2026-01-10
**Commit:** `88b0e666` (before deletion)

### Test Files

- **Unit tests:** 136 files
- **E2E tests:** 18 files
- **Total:** 154 test files

### Lines of Code

- **Test LOC:** 45,997
- **Source LOC:** 37,056
- **Ratio:** 1.24:1 (test:source)

### Test Execution

- **Status:** All tests passing with NODE_OPTIONS=--max-old-space-size=8192
- **OOM status:** Tests pass but require increased heap size
- **Unit test count:** 3,064 tests passing
- **E2E test results:** 272 passed, 2 flaky, 28 skipped

---

## After (Deletion)

**Measurement Date:** 2026-01-10
**Commit:** `4c2530e9` (after deletion)

### Test Files

- **Unit tests:** 58 files (-78 files, -57%)
- **E2E tests:** 18 files (unchanged)
- **Total:** 76 test files (-78 files, -51%)

### Lines of Code

- **Test LOC:** 21,604 (-24,393 lines, -53%)
- **Source LOC:** 37,056 (unchanged)
- **Ratio:** 0.58:1 (test:source) ⭐ **Improved by 53%**

### Test Execution

- **Status:** All tests passing
- **OOM status:** No OOM crashes
- **Unit test count:** 1,453 tests passing
- **E2E test results:** 272 passed, 2 flaky, 28 skipped
- **Stability:** 3/3 consecutive runs passed (no flaky failures)

---

## Summary of Improvements

| Metric            | Before                 | After         | Improvement |
| ----------------- | ---------------------- | ------------- | ----------- |
| Unit test files   | 136                    | 58            | -57%        |
| Total test files  | 154                    | 76            | -51%        |
| Test LOC          | 45,997                 | 21,604        | -53%        |
| Test:source ratio | 1.24:1                 | 0.58:1        | -53%        |
| OOM crashes       | Required heap increase | None          | ✅ Fixed    |
| Test stability    | Not verified           | 3/3 runs pass | ✅ Stable   |

## Files Deleted (78 total)

Component tests and tests with banned patterns were removed:

- All component tests (App, Toolbar, Panels, Dialogs, Buttons, etc.)
- Tests with exact length assertions
- Tests with hardcoded color values
- Tests with CSS class assertions
- Tests with DOM structure queries

## Files Kept (58 unit tests + 18 E2E tests)

High-value tests were preserved:

- **Store tests** (7 files): Pure logic, stable API
- **Core algorithms** (6+ files): Collision detection, schemas, undo/redo
- **E2E tests** (18 files): Real user flows
- **Integration tests**: Multi-store interactions
- **Utilities**: Layout helpers, parameterized tests

---

## Next Steps

1. ✅ Deletion committed
2. ✅ Stability verified (3 runs)
3. ⏳ Update CLAUDE.md with test writing rules
4. ⏳ Add CI checks (file size + ratio gates)
5. ⏳ Update TESTING.md documentation
6. ⏳ Create PR and close issue #459
