# Position Migration & Versioning Design

**Date:** 2025-01-18
**Status:** Approved
**Related Issues:** #634, #753

## Problem

Rackula 0.7.0 introduces internal position units (1/6U precision). Old layouts store positions as U values (1, 2, 42), new layouts store them as internal units (6, 12, 252).

When loading a file, we must detect whether it uses the old or new format and migrate if necessary.

## Design Decisions

### 1. Version Field = App Version

The `version` field in saved layouts represents the app version that saved it:

- `version: "0.6.16"` means "saved with Rackula 0.6.16"
- `version: "0.7.0"` means "saved with Rackula 0.7.0"

No separate schema version. Single source of truth from package.json.

### 2. Migration Detection (Belt and Suspenders)

Two checks, either triggers migration:

1. **Version check:** `version < "0.7.0"` → old format
2. **Heuristic fallback:** Any rack-level device with `position < 6` → old format

The heuristic catches edge cases where version might be missing or incorrect.

### 3. Saving Uses Current App Version

When saving a layout, write the current app version from package.json:

- Development: `0.7.0-dev`
- Release: `0.7.0`

### 4. No Constants for Version Thresholds

Keep it simple. The migration logic documents the threshold inline:

```typescript
// Layouts saved before 0.7.0 use U values (1, 2, 42)
// Layouts saved with 0.7.0+ use internal units (6, 12, 252)
if (compareVersions(version, "0.7.0") < 0) {
  return true; // needs migration
}
```

## Implementation

### Files to Change

1. **package.json** - Bump version to `0.7.0-dev`
2. **src/lib/types/constants.ts** - Remove `CURRENT_VERSION`, `INTERNAL_UNITS_VERSION`
3. **src/lib/utils/serialization.ts** - Use `VERSION` from package.json
4. **src/lib/schemas/index.ts** - Update migration logic with dual checks

### Migration Logic

```typescript
function needsPositionMigration(
  version: string | undefined,
  devices: PlacedDevice[],
): boolean {
  // Check 1: Version-based detection
  // Layouts before 0.7.0 use old U-value positions
  if (!version || compareVersions(version, "0.7.0") < 0) {
    return true;
  }

  // Check 2: Heuristic fallback
  // If any rack-level device has position < 6, it's old format
  // (U1 in new format = 6, so position < 6 means old format)
  const hasOldFormatPosition = devices.some(
    (d) => d.container_id === undefined && d.position < 6 && d.position >= 1,
  );
  if (hasOldFormatPosition) {
    return true;
  }

  return false;
}
```

## Testing

### Unit Tests

- Version < 0.7.0 triggers migration
- Version >= 0.7.0 does not trigger migration
- Position heuristic triggers migration when version check passes
- Container children positions are not migrated

### E2E Test

- Sample old-format YAML file in test fixtures
- Load file → verify positions migrated correctly
- Save file → verify version is current app version
- Reload → verify no double migration

## Release Process

1. Merge to main as `0.7.0-dev`
2. Create beta testing issue for user validation
3. Beta testers load their existing layouts, confirm they work
4. Bump to `0.7.0` and release

## Appendix: Version Comparison

Simple semver comparison function:

```typescript
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((p) => parseInt(p) || 0);
  const partsB = b.split(".").map((p) => parseInt(p) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}
```

Note: `0.7.0-dev` compares as `0.7.0` (pre-release suffix ignored for simplicity).
