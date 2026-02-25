# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**

- Vitest 4.0.17 (configured in `vitest.config.ts`)
- Environment: happy-dom (lightweight DOM implementation, not jsdom)
- Pool: forks (separate process per test batch for memory isolation)
- Max workers: CPU-aware (2-4 workers, configurable via `VITEST_MAX_WORKERS` env var)

**Assertion Library:**

- Vitest built-in assertions (no external library)
- Pattern: `expect(value).toBe(expected)`
- Available: `toBe`, `toEqual`, `toHaveLength`, `toContain`, `toBeDefined`, etc.

**Run Commands:**

```bash
npm run test              # Run all tests in watch mode (with 8GB memory)
npm run test:run         # Run all tests once (CI mode, with 8GB memory)
npm run test:coverage    # Run tests with coverage report (V8 provider)
npm run test:e2e         # Run Playwright E2E tests
npm run test:e2e:dev     # Run E2E in dev mode
npm run test:e2e:smoke   # Run smoke test suite
```

**Memory Configuration:**

- Tests use `NODE_OPTIONS=--max-old-space-size=8192` (8GB)
- Necessary due to large test suite (previously had OOM crashes with 136 files)
- Coverage thresholds: statements 75%, branches 70%, functions 75%, lines 75%

## Test File Organization

**Location:**

- Co-located in `src/tests/` directory (centralized, not scattered)
- NOT co-located with source files (convention differs from "next to source")
- Store tests: `src/tests/*-store.test.ts`
- Utility tests: `src/tests/*-*.test.ts`
- Component tests: rare (see TDD Protocol in project CLAUDE.md)

**Naming:**

- Match source module name with `.test.ts` suffix
- Examples: `layout-store.test.ts`, `device-lookup.test.ts`, `slot-collision.test.ts`
- Test files include descriptive test names that match functionality

**Structure:**

```
src/tests/
├── layout-store.test.ts       # Tests for layout.svelte.ts
├── device-lookup.test.ts      # Tests for device-lookup.ts utility
├── slot-collision.test.ts     # Tests for collision.ts utility
├── factories.ts               # Shared test data factories
├── setup.ts                   # Global test setup
└── ...
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";

describe("Layout Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("initial state", () => {
    it("initializes with correct app version", () => {
      const store = getLayoutStore();
      expect(store.layout.name).toBe("Racky McRackface");
      expect(store.layout.version).toBe(VERSION);
    });

    it("initializes isDirty as false", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
    });
  });

  describe("addRack", () => {
    it("creates rack with correct properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Main Rack", 42);
      expect(rack).not.toBeNull();
      expect(rack!.name).toBe("Main Rack");
    });
  });
});
```

**Patterns:**

- Use `describe()` to group related tests
- Nested `describe()` blocks for sub-features
- `beforeEach()` for test isolation (reset state before each test)
- One assertion per test, or logical group of related assertions

**Naming Convention:**

- Test name is a complete English sentence: `"initializes with correct app version"`
- Describe blocks are noun phrases: `"Layout Store"`, `"initial state"`, `"addRack"`

## Mocking

**Framework:** Vitest `vi` mock utilities

**Patterns:**

```typescript
import { vi } from "vitest";

// Mock a function
const mockCallback = vi.fn();
const mockCallback = vi.fn((x) => x * 2);

// Mock a module function
vi.mock("$lib/utils/analytics");

// Restore after test
vi.restoreAllMocks(); // Called automatically in afterEach (setup.ts)
vi.clearAllMocks();
```

**What to Mock:**

- External API calls (localStorage, fetch)
- Analytics tracking
- Optional: complex dependencies if testing in isolation

**What NOT to Mock:**

- Store methods (test real behavior)
- Utility functions (test actual implementation)
- Type validation (Zod schemas handle this)
- Device library data (use actual starter library)

**Example - localStorage Test:**

```typescript
it("persists dirty state to localStorage", () => {
  const store = getLayoutStore();
  // localStorage is mocked in setup.ts
  store.markDirty();
  // Test the state change, not the localStorage call
  expect(store.isDirty).toBe(true);
});
```

## Fixtures and Factories

**Test Data:**
Located in `src/tests/factories.ts` - centralized factory functions

```typescript
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

// Simple usage
const rack = createTestRack();

// With overrides
const rack = createTestRack({ height: 24, width: 23 });
const device = createTestDeviceType({ u_height: 2, category: "server" });
const placed = createTestDevice({ position: 5, face: "rear" });
```

**Available Factories:**

- `createTestRack(overrides?)` - Creates Rack with defaults (height: 42, width: 19)
- `createTestDeviceType(overrides?)` or `createTestDeviceType(slug, height)` - Creates DeviceType
- `createTestDevice(overrides?)` - Creates PlacedDevice
- `createTestLayout(overrides?)` - Creates Layout
- `setupStoreWithDevice()` - Complete setup helper (returns store + rack + device)

**Guidelines:**

- Use factories instead of inline object literals
- Override specific properties, use defaults for the rest
- Factories provide type safety and reduce maintenance burden

**Example from layout-store.test.ts:**

```typescript
it("updates placed device notes", () => {
  const { store, rackId } = setupStoreWithDevice();

  // Device should not have notes initially
  expect(store.rack.devices[0]!.notes).toBeUndefined();

  // Set notes
  store.updateDeviceNotes(rackId, 0, "Production database server");
  expect(store.rack.devices[0]!.notes).toBe("Production database server");
});
```

## Coverage

**Requirements:** 75% for statements/functions/lines, 70% for branches

**View Coverage:**

```bash
npm run test:coverage
# Opens: coverage/index.html
```

**Coverage Strategy:**

- Focus on core logic (stores, collision detection, device placement)
- Skip coverage on visual components (rarely add value)
- Skip coverage on type-only code (already verified by TypeScript)

## Test Types

**Unit Tests:**

- Scope: Single store method or utility function
- Approach: Direct function calls with known inputs
- Examples: `placeDevice()`, `findDeviceType()`, `canPlaceDevice()`
- Location: `src/tests/*.test.ts`

**Integration Tests:**

- Scope: Store interactions (e.g., place device + undo + redo)
- Approach: Call multiple store methods in sequence
- Examples: Device placement with collision detection, undo/redo workflows
- Location: Same files as unit tests, identified by test name

**E2E Tests:**

- Framework: Playwright 1.58.2
- Location: `e2e/` directory
- Config: `playwright.config.ts`, `playwright.dev.config.ts`, `playwright.smoke.config.ts`
- Run: `npm run test:e2e`

## Common Patterns

**Async Testing:**
Not commonly used in unit tests (Vitest tests run synchronously for stores)

```typescript
// For async utilities (if needed)
it("resolves with data", async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});
```

**Error Testing:**

```typescript
it("returns false for invalid position (collision)", () => {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 42);
  const deviceType = store.addDeviceType({
    name: "Test",
    u_height: 2,
    category: "server",
    colour: "#4A90D9",
  });
  store.placeDevice(rack!.id, deviceType.slug, 5);

  // Second device at overlapping position should fail
  const deviceType2 = store.addDeviceType({
    name: "Another",
    u_height: 2,
    category: "server",
    colour: "#4A90D9",
  });
  const result = store.placeDevice(rack!.id, deviceType2.slug, 6);
  expect(result).toBe(false);
  // eslint-disable-next-line no-restricted-syntax -- Testing collision rejection
  expect(store.rack.devices).toHaveLength(1);
});
```

**State Transitions:**

```typescript
it("supports undo/redo for name changes", () => {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 42);
  const deviceType = store.addDeviceType({
    name: "Generic Server",
    u_height: 2,
    category: "server",
    colour: "#4A90D9",
  });
  store.placeDevice(rack!.id, deviceType.slug, 5);

  // Set a custom name
  store.updateDeviceName(rack!.id, 0, "Primary DB Server");
  expect(store.rack.devices[0]!.name).toBe("Primary DB Server");

  // Undo should restore undefined
  store.undo();
  expect(store.rack.devices[0]!.name).toBeUndefined();

  // Redo should restore the name
  store.redo();
  expect(store.rack.devices[0]!.name).toBe("Primary DB Server");
});
```

## ESLint Test Rules

**BLOCKED Patterns (will fail build):**

1. **No exact length assertions on data arrays**

   ```typescript
   // ❌ BAD - breaks when you add a device to brand pack
   expect(dellDevices).toHaveLength(68);

   // ✅ GOOD - test existence or behavioral invariant
   expect(dellDevices.length).toBeGreaterThan(0);

   // ✅ GOOD with eslint-disable - behavioral invariant
   // eslint-disable-next-line no-restricted-syntax
   // -- behavioral invariant: deduplication should leave exactly 2 unique devices
   expect(deduplicateDevices([device1, device1, device2])).toHaveLength(2);
   ```

2. **No hardcoded color assertions**

   ```typescript
   // ❌ BAD - breaks on design token changes
   expect(element).toHaveStyle("color: #4A7A8A");
   expect(color).toBe("#FFFFFF");

   // ✅ GOOD - test computed style or user-visible behavior
   expect(element).toHaveStyle("color: var(--primary)");
   ```

3. **No CSS class assertions**

   ```typescript
   // ❌ BAD - tests implementation detail
   expect(button).toHaveClass("primary");

   // ✅ GOOD - test user-visible behavior
   expect(button).toHaveTextContent("Click Me");
   expect(button).toBeEnabled();
   ```

4. **No component render assertions**

   ```typescript
   // ❌ BAD - if it compiles, it renders
   expect(container.querySelector(".rack")).toBeInTheDocument();

   // ✅ GOOD - test actual behavior or state
   expect(store.rack.devices).toHaveLength(1);
   ```

5. **No querySelector in tests**

   ```typescript
   // ❌ BAD - blocked by testing-library/no-node-access
   const header = container.querySelector(".panel-header");

   // ✅ GOOD - use testing-library queries
   const header = screen.getByRole("heading");
   ```

## Test Isolation

**Reset Patterns:**

- `resetLayoutStore()` - clears all layout state
- `resetImageStore()` - clears all image uploads
- Called in `beforeEach()` blocks

**localStorage/sessionStorage:**

- Mocked globally in `src/tests/setup.ts`
- Cleared before each test automatically
- Safe to test without side effects

**Global Cleanup:**

- `afterEach()` in setup.ts calls:
  - `cleanup()` - cleanup @testing-library components
  - `vi.clearAllTimers()` - prevent bits-ui cleanup errors
  - `vi.restoreAllMocks()` - clear mock state

## Setup and Configuration

**Setup File:** `src/tests/setup.ts`

Global configuration:

- Error suppression for benign teardown errors (bits-ui scroll lock, happy-dom abort)
- localStorage/sessionStorage mocks
- window.matchMedia mock
- Element.animate() polyfill
- Auto-cleanup after each test

**Configuration:**

- Test timeout: 10 seconds per test (increase per-test for slow tests via `testTimeout`)
- Environment: happy-dom (lightweight, faster than jsdom)
- Pool: forks (process isolation for memory safety)

## Deprecations & Anti-Patterns

**AVOID:**

- Testing that components render (low value, TypeScript catches compilation errors)
- Asserting exact array lengths on data that can grow
- Mocking store methods (defeats the purpose of integration testing)
- Testing internal implementation details (CSS classes, DOM structure)

**TEST INSTEAD:**

- User-visible behavior (can user place a device? can they undo?)
- Core algorithms (collision detection, coordinate transforms)
- Error conditions and edge cases
- State machine transitions (undo/redo, dirty tracking)

---

_Testing analysis: 2026-02-19_
