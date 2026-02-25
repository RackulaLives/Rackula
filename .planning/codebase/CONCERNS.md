# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

### Layout Save/Load Metadata Loss (HIGH PRIORITY)

**Issue:** Save/load cycle loses half-width device placement metadata.

- Files: `src/lib/utils/yaml.ts:64,124,247`, `src/lib/schemas/index.ts:490,558`, `src/lib/stores/layout.svelte.ts:2731`
- Problem: YAML serialisation omits `DeviceType.slot_width` and `PlacedDevice.slot_position` fields during ordering, causing round-tripped layouts to lose placement metadata
- Impact: Half-width devices restore as full-width after save/load cycles, breaking carefully designed rack layouts
- Fix approach: Add `slot_width` to `orderDeviceTypeFields()` and `slot_position` to `orderPlacedDeviceFields()`, add regression tests for round-trip serialisation

### Share Payload Limited to Single Rack (HIGH PRIORITY)

**Issue:** Share URL encoding drops additional racks in multi-rack layouts and bayed groups.

- Files: `src/lib/utils/share.ts:46,88,135`, `src/lib/schemas/share.ts:103,117`
- Problem: Share schema hardcoded to single rack (`r` field) with no multi-rack or group metadata support
- Impact: Shared bayed rack layouts load only first bay as column rack, destroying layout structure on restore
- Fix approach: Implement share schema v2 with rack array + rack-group metadata while maintaining v1 decode compatibility

### Persistence API Offline Detection Inconsistency (HIGH PRIORITY)

**Issue:** Persistence degradation logic doesn't consistently detect API failures.

- Files: `src/App.svelte:597,1464`, `src/lib/stores/persistence.svelte.ts:132`, `src/lib/utils/persistence-api.ts:158`
- Problem: App has offline degradation logic, but StartScreen list/load/delete failures don't consistently call `setApiAvailable(false)`, leaving system in noisy pseudo-online state
- Impact: Users see inconsistent error states and autosave may continue attempting network calls during persistent network failures
- Fix approach: Route all persistence failures through shared error classification, call `setApiAvailable(false)` on 404/5xx/network errors, add tests for startup failure + autosave failure → offline transition

---

## Known Bugs

### E2E Test False Positives (HIGH PRIORITY)

**Issue:** E2E keyboard and focus tests validate existence instead of state changes.

- Files: `e2e/keyboard.spec.ts:83,109`, `e2e/rack-context-menu-focus.spec.ts:49`
- Symptoms: Tests pass but don't verify actual device movement or panzoom transform changes
- Trigger: Run keyboard arrow-key tests and focus tests
- Workaround: None—these tests will miss regressions
- Fix approach: Assert position/transform changes before/after (numerically for panzoom x/y/scale), never swallow download failures with `.catch(() => null)`

### Setup Smoke Test Overflow (MEDIUM PRIORITY)

**Issue:** Full App smoke test vulnerable to reactive depth loops.

- Files: `src/tests/setup.test.ts:15`, `src/App.svelte:1412,1443,1492`
- Symptoms: Occasional `effect_update_depth_exceeded` errors in CI
- Trigger: Run `npm run test:run` when app has heavy startup effects
- Cause: Smoke test renders full App component with all startup side effects, timers, and effects running
- Fix approach: Replace with minimal component sanity check, move App integration tests to focused tests with explicit mocks

---

## Performance Bottlenecks

### QR Code Generation Performance (MEDIUM PRIORITY)

**Issue:** QR code renders at high resolution with no cancellation or cache.

- Files: `src/lib/components/ShareDialog.svelte:45,67`, `src/lib/utils/qrcode.ts:50`
- Problem: QR code renders on dialog open at `width: 444` with no debounce, cache, or cancellation strategy
- Impact: Causes jank on low-end mobile devices, especially on repeated share dialog opens
- Improvement path: Add debounced QR generation, cache last payload, implement cancellation for dialog close before render completes

### Export Preview Sizing Calculation (MEDIUM PRIORITY)

**Issue:** Preview container uses fixed dimensions that can underutilise or clip mobile space.

- Files: `src/lib/components/ExportDialog.svelte:774,790,1029`
- Problem: Preview caps hardcoded (`--preview-max-width: 280px`, `max-height: 300px`) without viewport-aware calculation
- Impact: Mobile users see undersized previews or clipped action buttons, wasting screen real estate
- Improvement path: Replace with `clamp()` and available-height calculations, add mobile E2E assertions for portrait/landscape

### Startup Payload Measurement Not Enforced (MEDIUM PRIORITY)

**Issue:** Payload budget tooling exists but is not enforced in CI.

- Files: `scripts/measure-startup-payload.ts:33`, `package.json:14`
- Problem: Measurement script exists but `npm run build` doesn't check gzip thresholds, and YAML editor has no lazy-load contract
- Impact: Large dependencies can ship undetected, increasing startup time
- Improvement path: Add CI step to measure startup payload, enforce dynamic import for editor dependencies on dialog open only, set explicit gzip thresholds

---

## Fragile Areas

### Large Component Files (Architecture Concern)

**Files:**

- `src/lib/stores/layout.svelte.ts` (3349 lines) — Central state management with extensive CRUD logic
- `src/App.svelte` (1933 lines) — Main app component with dialog management, persistence, and lifecycle
- `src/lib/utils/export.ts` (1925 lines) — Export rendering with complex SVG/canvas logic
- `src/lib/components/EditPanel.svelte` (1752 lines) — Device editing with many field handlers
- `src/lib/components/Rack.svelte` (1807 lines) — Drag-drop and rendering with collision detection

**Why fragile:**

- Large files increase risk of unintended interactions between distant code paths
- Single-file refactors are high-risk and low-visibility
- Testing these files requires extensive mocking to cover all paths

**Safe modification approach:**

- Prioritise extracting utility functions into `src/lib/utils/` or helper modules
- For component logic, extract business logic to stores or hooks
- Add tests for any extracted logic before refactoring the parent
- Test coverage for these files should focus on integration behavior, not internal structure

### Layout Store Command Pattern (Architecture Concern)

**Files:** `src/lib/stores/layout.svelte.ts`, `src/lib/stores/commands/`

**Why fragile:**

- Command pattern with undo/redo stacks creates invisible state dependencies
- No visible invariant validation between command execution and state
- Cross-command side effects (e.g., device placement triggers group cleanup) are implicit

**Safe modification approach:**

- Add snapshot tests for command round-trip (execute + undo + redo)
- Document preconditions and postconditions for each command in comments
- When adding new commands, verify they don't conflict with cleanup operations

### Collision Detection with Multiple Variants (Algorithm Complexity)

**Files:** `src/lib/utils/collision.ts`, `src/lib/utils/blocked-slots.ts`, `src/tests/collision.test.ts`

**Why fragile:**

- Multiple collision detection variants (slot-based, position-based, container-based, face-aware)
- Edge cases: full-depth devices, sub-devices, dual-face placement
- Tests are extensive but algorithm is error-prone to modify

**Safe modification approach:**

- All collision changes REQUIRE corresponding test coverage update
- When modifying, include test case that previously failed before fix
- Document the specific collision scenario being fixed in commit message

### Drag-Drop and Touch Gesture Handlers (Browser API Complexity)

**Files:** `src/lib/components/Canvas.svelte:224-268` (touch listeners), `src/lib/components/Rack.svelte:487-702` (drag handlers), `src/lib/utils/dragdrop.ts`

**Why fragile:**

- Event handler cleanup is critical—missing cleanup causes memory leaks and duplicate handlers
- Browser drag-drop API is quirky; payload restrictions exist and vary across browsers
- Touch vs mouse vs pointer events require careful ordering

**Safe modification approach:**

- Always verify cleanup functions return from `$effect()` and properly remove listeners
- Test on mobile and desktop browsers when modifying
- Avoid adding new handlers without verifying corresponding cleanup exists

---

## Scaling Limits

### Test File Accumulation (Previous Memory Crisis)

**Current state:** 83 unit test files (~4000 LOC post-reduction)

**Previous crisis:** Project had 136 test files (46k LOC) causing OOM crashes and high token usage—57% reduction achieved by deleting low-value tests.

**Scaling risk:** Re-accumulation of low-value tests (static data assertions, DOM queries, existence checks)

**Safeguard:** ESLint rules block anti-patterns:

- `toHaveLength(literal)` on data arrays
- `toBe(#hexcolor)` hardcoded color assertions
- `toHaveClass()` CSS class assertions
- `typeof ... === 'function'` existence checks

**Scaling path:** If test LOC grows beyond 10k again, audit for test-value drift using ESLint violations as signal

### Bundled Image Manifest Growth (Data Scaling)

**Files:** `src/lib/data/bundledImages.ts` (1733 lines), brand pack files (600-1200 lines each)

**Current state:** ~3600 lines of bundled images across 20+ brand packs

**Scaling risk:** Image addition workflow has no automated integrity checks; drift between flags and manifest silently ships

**Current safeguard:** None automated; manual review only

**Scaling path:** Add CI check to validate `front_image`/`rear_image` flags match manifest availability (issue #1189)

---

## Test Coverage Gaps

### Brand Pack Image Manifests (Moderate Risk)

**What's not tested:** `front_image`/`rear_image` flags consistency with bundled manifest

- Files: `src/lib/data/brandPacks/index.ts:321`, `src/lib/data/bundledImages.ts:1707`
- Risk: Stale flags or missing manifest entries ship without detection
- Priority: Medium—covered by issue #1189, requires automated cross-validation test

### Offline Persistence Transitions (Moderate Risk)

**What's not tested:** Consistent state machine from online → pseudo-online → offline across all failure modes

- Files: `src/App.svelte:597,1464`, `src/lib/stores/persistence.svelte.ts:132`
- Risk: Edge cases where system gets stuck in inconsistent state, e.g. autosave succeeds but UI shows offline
- Priority: High—covered by issue #1088, requires comprehensive failure scenario testing

### Export Preview Responsive Behavior (Low-Moderate Risk)

**What's not tested:** Preview sizing across actual mobile viewports (portrait/landscape transitions)

- Files: `src/lib/components/ExportDialog.svelte:774,790,1029`
- Risk: Mobile users experience clipped content or unreachable buttons
- Priority: Medium—mobile E2E tests needed

### Share Dialog Keyboard/Screen-Reader Close (Low Risk)

**What's not tested:** Consistent close behavior across Escape, overlay click, Cancel button, and screen-reader interaction

- Files: `src/lib/components/ShareDialog.svelte:100,170`
- Risk: Inconsistent keyboard/accessibility experience
- Priority: Low-Medium—covered by issue #1133

---

## Security Considerations

### Session Invalidation Not Shared Across Instances (CHORE - Architecture)

**Risk:** API instances cannot revoke sessions in real-time

- Files: `api/src/security.ts:54,90`, `api/src/app.ts:51`
- Current approach: Process-local token checking with no shared invalidation
- Impact: Multi-instance deployments cannot safely revoke compromised sessions simultaneously
- Recommendations: Implement `SessionInvalidationStore` interface backed by Redis/KV/DB, inject into auth middleware

### Session/Cookie Security Hardening Incomplete (HIGH - Chore #1106)

**Risk:** Auth path lacks hardened session layer

- Files: `api/src/security.ts:90`, `api/src/app.ts:38`, `deploy/nginx.conf.template:18`
- Current approach: Bearer token for write routes, no HttpOnly/Secure/SameSite cookie handling
- Missing: Session model with secure cookie defaults, rotation/revocation middleware
- Recommendations: Define session model with `HttpOnly`, `Secure`, `SameSite=Strict`, implement issuance/rotation/revocation without breaking existing bearer-token workflow

### Markdown Link Rendering (LOW - Already Mitigated)

**Status:** Secured with `rel="noopener noreferrer"` and target="\_blank"

- Files: `src/lib/utils/markdown.ts:20,75,81,86`
- Current safeguard: Custom renderer adds security attributes to links
- No action needed—already handled

---

## Missing Critical Features

### No Automated Image Manifest Integrity Checks (CHORE)

**Problem:** Image addition workflow requires manual validation that flags match manifest

- Files: `src/lib/data/brandPacks/index.ts:321`, `src/lib/data/bundledImages.ts:1707`
- Blocks: Confident image pack updates; risk of shipping stale flags
- Fix: Issue #1189—add cross-validation test in CI

### No CI Startup Budget Enforcement (CHORE)

**Problem:** Startup payload measurement script exists but not enforced

- Files: `scripts/measure-startup-payload.ts:33`
- Blocks: Proactive prevention of large dependency additions
- Fix: Issue #1177—add CI step + explicit gzip thresholds

---

## Dependencies at Risk

### Node Memory Management (Operational Risk)

**Issue:** Test suite requires high memory allocation (`NODE_OPTIONS=--max-old-space-size=8192`)

- Evidence: `package.json:18,19` hardcoded 8GB heap
- Risk: CI pipelines with tight memory budgets will fail; indicates potential memory leak or inefficient test patterns
- Current mitigation: ESLint rules prevent test file accumulation
- Recommendation: Monitor test execution memory usage, investigate root cause of high baseline

### Build Tooling Stability

**Current:** Svelte 5.53.0, Vite 7.2.2, TypeScript 5.9.3

**Risk areas:**

- Svelte 5 is pre-1.0 (runes syntax subject to breaking changes)
- Early-stage minor versions may have undiscovered bugs
- TypeScript strict mode is enforced—any upgrade requiring suppressions is risky

**Mitigation:** Pin minor versions, test major upgrades before merging

---

## Architectural Concerns

### Persistence API Coupling (Design Concern)

**Issue:** App.svelte tightly coupled to persistence state machine with multiple conditional paths

- Files: `src/App.svelte:597,1464`, persistence handling scattered across app
- Risk: Adding new persistence states (e.g., "syncing") requires changes in multiple places
- Improvement: Extract persistence state machine to dedicated store/effect with explicit transitions

### RackDevice Component Complexity (Component Concern)

**File:** `src/lib/components/RackDevice.svelte` (883 lines)

**Why complex:**

- Handles device rendering, drag interaction, port display, label sizing
- Multiple conditional branches for display modes, face variants, container slots
- Tight coupling to multiple store interactions

**Improvement path:** Extract port/container rendering to separate components, move drag logic to reusable gesture hook

---

_Concerns audit: 2026-02-19_
