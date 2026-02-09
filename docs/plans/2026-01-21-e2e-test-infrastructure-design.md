# E2E Test Infrastructure Design

**Date:** 2026-01-21
**Status:** Ready for implementation
**Related Issue:** #901 (superseded by this design)

> Note: this design remains under `docs/plans/` to preserve existing issue links. Roadmap-level docs continue to live in `docs/planning/`.

## Problem

Multiple E2E tests fail because the `beforeEach` hook expects a rack to exist, but the app shows the "New Rack" wizard instead. Setting `hasStarted=true` in localStorage doesn't create racks - it only controls UI visibility.

### Root Cause

1. Tests clear storage and set `Rackula_has_started = true`
2. App reads `hasStarted = true` but `layout.racks.length === 0`
3. `rackCount = hasStarted ? layout.racks.length : 0` evaluates to `0`
4. App triggers: `if (layoutStore.rackCount === 0) { dialogStore.open("newRack"); }`
5. Test waits for `.rack-container` which never appears

## Solution

Use the existing share link mechanism (`?l=<encoded>`) to load pre-built test layouts. This:

- Reuses production code paths
- Requires no storage manipulation
- Is deterministic and version-aware

## Design

### 1. Test Layout Fixtures

Create `e2e/helpers/test-layouts.ts` with pre-encoded share links:

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pako from "pako";
import type { MinimalLayout } from "../../src/lib/schemas/share";

const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { version: MinimalLayout["v"] };

const EMPTY_RACK_MINIMAL = {
  v: APP_VERSION,
  n: "Test Layout",
  r: { n: "Test Rack", h: 42, w: 19, d: [] },
  dt: [],
} satisfies MinimalLayout;

const EMPTY_12U_RACK: MinimalLayout = {
  ...EMPTY_RACK_MINIMAL,
  n: "Small Test Layout",
  r: { ...EMPTY_RACK_MINIMAL.r, n: "Small Rack", h: 12 },
};

export const EMPTY_RACK_SHARE = encodeMinimal(EMPTY_RACK_MINIMAL);
export const SMALL_RACK_SHARE = encodeMinimal(EMPTY_12U_RACK);
```

### 2. Test Usage Pattern

```typescript
import { EMPTY_RACK_SHARE } from "./helpers/test-layouts";

test.beforeEach(async ({ page }) => {
  await page.goto(`/?l=${EMPTY_RACK_SHARE}`);
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
});
```

### 3. Helper Organization

```
e2e/
├── helpers/
│   ├── index.ts           # Re-exports
│   ├── test-layouts.ts    # Pre-encoded share links
│   ├── rack-setup.ts      # Wizard completion helpers
│   ├── device-actions.ts  # Drag-drop, select, delete
│   └── assertions.ts      # Common expect patterns
└── *.spec.ts
```

### 4. Wizard Keyboard Shortcuts

Add keyboard support to NewRackWizard for both testing and UX:

**Step 1: Rack Configuration**
| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move between fields |
| `←` / `→` | Switch layout type (Column/Bayed) |
| `1` | Select 12U |
| `2` | Select 18U |
| `3` | Select 24U |
| `4` | Select 42U |
| `Enter` | Next step |
| `Escape` | Cancel wizard |

**Step 2: Bay Selection (if Bayed)**
| Key | Action |
|-----|--------|
| `←` / `→` | Select bay count |
| `Enter` | Create rack |
| `Backspace` | Go back |
| `Escape` | Cancel |

### 5. Keyboard Helper for Tests

```typescript
export async function completeWizardWithKeyboard(
  page: Page,
  options?: {
    name?: string;
    heightPreset?: 1 | 2 | 3 | 4;
    layout?: "column" | "bayed";
    bayCount?: 2 | 3;
  },
) {
  if (options?.name) {
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(options.name);
  }
  if (options?.layout === "bayed") {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Enter");
  if (options?.heightPreset) {
    await page.keyboard.press(String(options.heightPreset));
  }
  if (options?.layout === "bayed" && options.bayCount === 3) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Enter");
  await page.locator(".rack-container").first().waitFor({ state: "visible" });
}
```

## Files to Modify

| File                                             | Action | Purpose                 |
| ------------------------------------------------ | ------ | ----------------------- |
| `e2e/helpers/test-layouts.ts`                    | Create | Pre-encoded share links |
| `e2e/helpers/rack-setup.ts`                      | Create | Wizard helpers          |
| `e2e/helpers/device-actions.ts`                  | Create | Unified drag-drop       |
| `e2e/helpers/index.ts`                           | Create | Re-exports              |
| `src/lib/components/wizard/NewRackWizard.svelte` | Modify | Keyboard shortcuts      |
| `e2e/device-metadata.spec.ts`                    | Modify | Use new helpers         |
| `e2e/basic-workflow.spec.ts`                     | Modify | Use new helpers         |
| `e2e/smoke.spec.ts`                              | Modify | Use new helpers         |
| `docs/guides/TESTING.md`                         | Modify | Document patterns       |

## Acceptance Criteria

- [ ] `e2e/helpers/test-layouts.ts` exports `EMPTY_RACK_SHARE` and variants
- [ ] Tests navigate to `/?l=${EMPTY_RACK_SHARE}` and have working rack
- [ ] `completeWizardWithKeyboard()` helper works for Column and Bayed
- [ ] Wizard responds to number keys 1-4 for height presets
- [ ] Wizard responds to Enter/Escape for confirm/cancel
- [ ] The Damien test passes reliably
- [ ] `basic-workflow.spec.ts` passes reliably
- [ ] `smoke.spec.ts` passes reliably
- [ ] `docs/guides/TESTING.md` documents the share link pattern
- [ ] No duplicate helper implementations across test files
