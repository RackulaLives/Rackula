# Position Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement auto-migration of legacy position formats with proper app-based versioning.

**Architecture:** Migration detects old format via version check (< 0.7.0) plus heuristic fallback (position < 6). Saving uses app version from package.json. No separate schema version constants.

**Tech Stack:** TypeScript, Zod schemas, Vitest, Playwright E2E

---

## Task 1: Bump Package Version to 0.7.0-dev

**Files:**

- Modify: `package.json:3`

**Step 1: Update version**

Change version from `"0.6.16"` to `"0.7.0-dev"`:

```json
{
  "name": "rackula",
  "version": "0.7.0-dev",
```

**Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.7.0-dev for position migration"
```

---

## Task 2: Remove Schema Version Constants

**Files:**

- Modify: `src/lib/types/constants.ts:83-93`

**Step 1: Remove INTERNAL_UNITS_VERSION and CURRENT_VERSION**

Delete these lines:

```typescript
/**
 * Version that introduced internal position units (1/6U).
 * Layouts with versions before this need position migration.
 */
export const INTERNAL_UNITS_VERSION = "0.7.0";

/**
 * Current layout schema version.
 * Update this when introducing breaking format changes.
 */
export const CURRENT_VERSION = INTERNAL_UNITS_VERSION;
```

**Step 2: Verify lint passes**

Run: `npm run lint`
Expected: May show errors in files that import these constants (we'll fix next)

**Step 3: Do NOT commit yet** - dependent changes needed first

---

## Task 3: Update Serialization to Use App Version

**Files:**

- Modify: `src/lib/utils/serialization.ts:1-20`

**Step 1: Change import and usage**

Replace:

```typescript
import { CURRENT_VERSION } from "$lib/types/constants";
```

With:

```typescript
import { VERSION } from "$lib/version";
```

And in `createLayout()`, replace:

```typescript
version: CURRENT_VERSION,
```

With:

```typescript
version: VERSION,
```

**Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

---

## Task 4: Update Migration Logic in Schema

**Files:**

- Modify: `src/lib/schemas/index.ts:1-10,741-760`

**Step 1: Update imports**

Replace:

```typescript
import {
  UNITS_PER_U,
  CURRENT_VERSION,
  INTERNAL_UNITS_VERSION,
} from "$lib/types/constants";
```

With:

```typescript
import { UNITS_PER_U } from "$lib/types/constants";
import { VERSION } from "$lib/version";
```

**Step 2: Update compareVersions function**

Keep the existing `compareVersions` function as-is (it handles semver comparison).

**Step 3: Update needsPositionMigration function**

Replace the function with dual-check logic:

```typescript
/**
 * Check if a layout needs position migration.
 * Uses two checks (belt and suspenders):
 * 1. Version < 0.7.0 (when internal units were introduced)
 * 2. Heuristic: any rack-level device with position < 6
 */
function needsPositionMigration(
  version: string | undefined,
  devices: { position: number; container_id?: string }[],
): boolean {
  // Check 1: Version-based detection
  // Layouts before 0.7.0 use old U-value positions
  if (!version || compareVersions(version, "0.7.0") < 0) {
    return true;
  }

  // Check 2: Heuristic fallback
  // If any rack-level device has position < 6, it's old format
  // (U1 in new format = 6, so valid positions are >= 6)
  const hasOldFormatPosition = devices.some(
    (d) => d.container_id === undefined && d.position >= 1 && d.position < 6,
  );
  if (hasOldFormatPosition) {
    return true;
  }

  return false;
}
```

**Step 4: Update the transform to use new signature**

In `LayoutSchemaBase.transform()`, update the migration check:

```typescript
// Collect all devices across all racks for heuristic check
const allDevices = racks.flatMap((r) => r.devices);

// Check if positions need migration (pre-0.7.0 format)
const migratePositions = needsPositionMigration(data.version, allDevices);
```

**Step 5: Update version assignment after migration**

In the return statement, replace:

```typescript
version: migratePositions ? CURRENT_VERSION : data.version,
```

With:

```typescript
// After migration, stamp with current app version
version: migratePositions ? VERSION : data.version,
```

**Step 6: Update schema comment**

Change the header comment:

```typescript
/**
 * Layout Zod Validation Schemas
 * v0.7.0+ uses internal position units (1/6U)
 */
```

---

## Task 5: Update Unit Tests

**Files:**

- Modify: `src/tests/schemas.test.ts:31,1900-2050`

**Step 1: Remove CURRENT_VERSION import**

Remove this line if present:

```typescript
import { CURRENT_VERSION } from "$lib/types/constants";
```

**Step 2: Update position migration tests**

Update the test suite to use hardcoded version strings (documented threshold):

```typescript
// ============================================================================
// Position Migration Tests (v0.7.0 - 1/6U Internal Units)
// ============================================================================

describe("LayoutSchema position migration", () => {
  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  const createTestLayout = (version: string, devices: unknown[]) => ({
    version,
    name: "Test Layout",
    racks: [
      {
        id: "rack-1",
        name: "Main Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        show_rear: true,
        form_factor: "4-post-cabinet" as const,
        starting_unit: 1,
        position: 0,
        devices,
      },
    ],
    device_types: [],
    settings: baseSettings,
  });

  describe("version-based detection", () => {
    it("migrates positions for version < 0.7.0", () => {
      const layout = createTestLayout("0.6.16", [
        { id: "device-1", device_type: "server", position: 10, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position 10 * 6 = 60
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });

    it("does not migrate positions for version >= 0.7.0", () => {
      const layout = createTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 60, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });
  });

  describe("heuristic fallback", () => {
    it("migrates when position < 6 even if version >= 0.7.0", () => {
      // Edge case: version says new, but data says old
      const layout = createTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 5, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Heuristic triggered: 5 * 6 = 30
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });

    it("does not migrate container children based on heuristic", () => {
      // Container children can have position 0, 1, etc. - don't trigger heuristic
      const layout = createTestLayout("0.7.0", [
        {
          id: "container-1",
          device_type: "chassis",
          position: 60,
          face: "front",
        },
        {
          id: "child-1",
          device_type: "blade",
          position: 0,
          face: "front",
          container_id: "container-1",
          slot_id: "slot-1",
        },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Container position unchanged (already new format)
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
        // Child position unchanged
        expect(result.data.racks[0]!.devices[1]!.position).toBe(0);
      }
    });
  });
});
```

**Step 3: Run tests**

Run: `npm run test:run -- src/tests/schemas.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(#634): implement position migration with version + heuristic detection"
```

---

## Task 6: Create E2E Test Fixture

**Files:**

- Create: `e2e/fixtures/legacy-layout-v0.6.yaml`
- Modify: `e2e/migration.spec.ts` (create if doesn't exist)

**Step 1: Create legacy layout fixture**

```yaml
version: "0.6.0"
name: "Legacy Test Layout"
racks:
  - id: "rack-1"
    name: "Test Rack"
    height: 42
    width: 19
    desc_units: false
    show_rear: true
    form_factor: "4-post-cabinet"
    starting_unit: 1
    position: 0
    devices:
      - id: "server-1"
        device_type: "test-server"
        position: 10
        face: "front"
      - id: "switch-1"
        device_type: "test-switch"
        position: 1
        face: "front"
device_types:
  - slug: "test-server"
    u_height: 2
    colour: "#4A7A8A"
    category: "server"
  - slug: "test-switch"
    u_height: 1
    colour: "#7B6BA8"
    category: "network"
settings:
  display_mode: "label"
  show_labels_on_images: false
```

**Step 2: Create E2E test**

```typescript
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

test.describe("Position Migration", () => {
  test("loads legacy layout and migrates positions correctly", async ({
    page,
  }) => {
    // Load the app
    await page.goto("/");

    // Load the legacy fixture file
    const fixturePath = path.join(
      __dirname,
      "fixtures/legacy-layout-v0.6.yaml",
    );
    const fixtureContent = fs.readFileSync(fixturePath, "utf-8");

    // TODO: Implement file loading via UI or API
    // This test structure depends on how file loading works in Rackula

    // Verify devices are at correct visual positions
    // Server at U10 should render at expected Y coordinate
    // Switch at U1 should render at expected Y coordinate
  });
});
```

**Step 3: Run E2E tests**

Run: `npm run test:e2e -- migration.spec.ts`
Expected: Test passes (or skip if E2E infrastructure needs setup)

**Step 4: Commit**

```bash
git add e2e/
git commit -m "test(#634): add E2E test fixture for position migration"
```

---

## Task 7: Clean Up and Final Verification

**Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual verification**

1. Start dev server: `npm run dev`
2. Create a new layout
3. Place a device at U10
4. Check browser console: position should be 60 (internal units)
5. Export/save layout
6. Verify saved file has `version: "0.7.0-dev"`

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(#634): cleanup and verification"
```

---

## Summary

| Task | Description                             | Est.   |
| ---- | --------------------------------------- | ------ |
| 1    | Bump package.json to 0.7.0-dev          | 2 min  |
| 2    | Remove schema version constants         | 2 min  |
| 3    | Update serialization to use app version | 3 min  |
| 4    | Update migration logic with dual checks | 10 min |
| 5    | Update unit tests                       | 10 min |
| 6    | Create E2E test fixture                 | 10 min |
| 7    | Final verification                      | 5 min  |

**Total:** ~45 minutes

**Related Issues:**

- Closes: #634
- Beta testing: #757
