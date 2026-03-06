# Post-v0.9.0 Gap Analysis — New Issues

**Date:** 2026-03-05
**Context:** After triaging v0.9.0 leftovers, we identified 4 areas of real pain not covered by existing issues.

## Method

1. Codebase exploration: TODOs, error handling, a11y, TypeScript, dead code, performance, test coverage, docs
2. Cross-referenced findings against all 160+ open issues
3. Filtered through devil's advocate lens: "Does this change what you do, or just feel good to know?"
4. User confirmed pain points: silent failures, E2E brittleness, CI reliability, large file navigation

## Gap 1: Error Handling Epic (v0.10.0)

**Problem:** 8+ locations where operations fail silently — `console.error()` instead of user feedback.

**Epic:** User-Facing Error Handling Audit

**Children:**

1. **Export failures surface to user** — ExportDialog.svelte and export.ts catch errors and log them. PDF generation, SVG rendering, QR code failures should show toast notifications.

2. **Persistence errors surface to user** — persistence-api.ts and persistence.svelte.ts log API failures. Save indicator hangs. Should show error state with retry.

3. **Import/load failures surface to user** — import.ts returns empty arrays on parse failure. share.ts logs decode failures. User sees empty rack with no explanation.

4. **Storage resilience (localStorage/sessionStorage)** — MobileWarningModal.svelte crashes in private browsing. Add consistent try/catch wrapper utility for all storage access.

## Gap 2: E2E Testing Architecture Spike (v0.9.1)

**Problem:** Existing sub-issues (#1228, #1224, #1226) fix symptoms but no issue defines the testing architecture that prevents future drift.

**Research spike scope:**

- Define `data-testid` convention for interactive elements (replaces CSS class selectors)
- Evaluate page object pattern (e2e/helpers/ is a start but not formalized)
- Define test fixture strategy (pre-encoded share links are fragile on schema changes)
- Document testing architecture for new test authors

**Output:** Design doc with recommendations. Implementation follows via existing sub-issues.

## Gap 3: CI/Build Reliability (v0.10.0)

**Problem:** No parent issue tracks CI health. 17 workflows, 32+ minute E2E runs, lockfile sync failures.

**Umbrella issue scope:**

- [ ] Lockfile sync root cause (not just the `refresh-lockfile` workaround)
- [ ] E2E flakiness analysis (retries mask real failures)
- [ ] Workflow audit (17 workflows — which are redundant or stale?)
- [ ] CI run time optimization

## Gap 4: Component Decomposition Epic (v0.10.0)

**Problem:** 4 files over 1,750 lines each with no refactoring issues. Existing #910 + #1077-1080 only cover layout.svelte.ts.

**Epic:** Component Decomposition

**Children:**

1. **refactor: Split App.svelte** (1,984 lines → ~4-5 files)
   - DialogOrchestrator component
   - Keyboard shortcut module
   - PersistenceManager component
   - App.svelte becomes thin shell

2. **refactor: Split Rack.svelte** (1,807 lines → ~3-4 files)
   - SVG rendering (rack frame, units, rails)
   - Drop zone / drag handling
   - Context menu logic

3. **refactor: Split EditPanel.svelte** (1,752 lines → ~4-5 files)
   - Device metadata section
   - Image upload section
   - Position/placement section
   - Tab container shell

4. **refactor: Split export.ts** (1,925 lines → ~4-5 files)
   - SVG generation module
   - PDF export (jsPDF)
   - PNG/JPEG export (canvas rasterization)
   - Legend/QR generation
   - Shared export-utils.ts

## Existing Issue Overlap

These areas are already covered and do NOT need new issues:

- Accessibility: #1231, #1133, #106, #767
- Layout store refactoring: #910, #1077-1080
- Performance: #1130, #114, #1177
- Documentation: #1107, #821, #843, #629
- Offline degradation: #1088
- Bulk operations: Not confirmed as real pain — deferred
- Tab sync / conflict resolution: Not confirmed as real pain — deferred
- SPEC.md drift: Not confirmed as real pain — deferred
