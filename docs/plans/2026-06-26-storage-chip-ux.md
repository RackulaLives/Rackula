# Storage chip UX redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace storage chip show save state and storage location inline, with a hover/tap popover carrying honest, mode-aware last-save facts.

**Architecture:** Add one new field (`lastExportedAt`) to the layout store and thread it through the live browser multi-tab persistence schema. Extend the existing single durability source (`getLayoutDurability`) with an inline short label, a location-visibility flag, and the export timestamp. Render a two-tone inline chip (status colour + muted location) that becomes a bits-ui Popover trigger; the popover content is a small, prop-driven component formatting timestamps with a new relative-time util.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Vitest + @testing-library/svelte, bits-ui Popover, CSS custom properties (tokens.css).

## Global Constraints

- Svelte 5 runes only (`$state`, `$derived`, `$effect`); no Svelte 4 stores.
- TypeScript strict mode; no `any`.
- User-facing copy: no em dashes, en dashes, or smart quotes; no emoji; be succinct.
- Tests must follow the project testing rules: assert behaviour and text content, never DOM nodes (`querySelector`), class names (`toHaveClass`), exact data-array lengths (`toHaveLength(literal)`), or hardcoded colours. ESLint hard-blocks these.
- Accessibility (#2064): chip state is never colour-only; the accessible name includes the current state; the settled state is announced via the existing debounced live region.
- Storage mode is fixed for the session (read once via `getStorageMode()`); switching reloads the page.
- Commits: `type: description`; sign off with `-s` (DCO) and include `Co-Authored-By`.
- The chip carries no actions; export/restore actions stay in the app menu (#2446).

## Post-review refinements

The following deltas were applied during PR review and are reflected in the snippets below:

- Failed-write guard in `getLayoutSavedAt`: returns null when the entry's `writeFailed` flag is set, so the chip never shows a fresh autosave time after a failed write.
- Explicit-null clear in `saveLayoutBody`: `lastExportedAt` uses a `!== undefined` check rather than nullish coalescing, so an intentional null (layout reset or load) clears the stored timestamp rather than preserving a stale one.
- `formatRelativeTime` renamed to `formatTimeAgo`; absolute-elapsed (`const abs = Math.abs(elapsed)`) replaces the raw elapsed check so future timestamps (small clock skew or genuinely future) format as "in X ..." rather than returning unexpected values.
- `StorageDetailsPopover` gained a `kind: DurabilityKind` prop; `neverReached` and `degraded` derive from `kind` (not `icon === "error"`), and the server-not-found state shows honest copy ("This layout has not been saved to the server") rather than falling into the "Last saved" row.
- Popover-open integration test: the test cases for `StorageDetailsPopover` include a `kind` prop on every render call.

## File structure

- `src/lib/stores/layout/persistence.ts` (modify): add `lastExportedAt` to `BackupState`.
- `src/lib/stores/layout.svelte.ts` (modify): track, set, expose, restore, and reset `lastExportedAt`.
- `src/lib/storage/browser-workspace.ts` (modify): add `lastExportedAt` to `LibraryEntry` and `DurabilityInput`; write it in the index entry; add a `getLayoutSavedAt` read helper.
- `src/lib/storage/browser-workspace-persist.ts` (modify): carry `lastExportedAt` through `PersistTab` and the shell/paused entry writes.
- `src/lib/components/PersistenceEffects.svelte` (modify): include `lastExportedAt` in the tab snapshot.
- `src/lib/stores/workspace.svelte.ts` (modify): restore `lastExportedAt`.
- `src/lib/utils/relative-time.ts` (create): `formatTimeAgo`.
- `src/lib/storage/durability.svelte.ts` (modify): add `shortLabel`, `showLocation`, `lastExportedAt` to the durability source.
- `src/lib/components/StorageStatusChip.svelte` (modify): two-tone inline rendering; become a popover trigger; wire hover/tap.
- `src/lib/components/StorageDetailsPopover.svelte` (create): prop-driven popover content.
- Tests: extend `src/tests/changes-since-export.test.ts`, `src/tests/StorageStatusChip.test.ts`; create `src/tests/relative-time.test.ts`, `src/tests/durability-inline-labels.test.ts`, `src/tests/storage-details-popover.test.ts`.

## Scoping decisions (carry into implementation)

- Server mode never displays "Last exported", so `lastExportedAt` is threaded only through the browser multi-tab schema, not the legacy `working-copy.ts` session path.
- The existing `ServerAvailableBanner` and the "Switch back to browser mode" button stay exactly as they are. The popover does not duplicate the #2063 server-reachable hint; the amber attention chip plus the existing banner already cover it. This is a deliberate deviation from the spec mock to avoid a redundant second surface.
- Export-age colour: the popover "Last exported" value renders in the warning colour whenever `changesSinceExport > 0`, not on a wall-clock age threshold.

---

### Task 1: Track `lastExportedAt` in the layout store

**Files:**

- Modify: `src/lib/stores/layout/persistence.ts:15-18`
- Modify: `src/lib/stores/layout.svelte.ts` (state ~140-142, getters ~233-238, `markExported` ~836-839, `restoreBackupState` ~845-847, resets ~170-173 and ~212-215)
- Test: `src/tests/changes-since-export.test.ts`

**Interfaces:**

- Produces: `BackupState` gains optional `lastExportedAt?: string | null`. The layout store gains a `lastExportedAt: string | null` getter, `markExported()` stamps it with the current ISO time, and `restoreBackupState(state)` restores it (coercing `undefined` to `null`).

- [ ] Step 1: Write the failing tests

Add to `src/tests/changes-since-export.test.ts` (inside the existing top-level `describe`):

```typescript
it("stamps lastExportedAt on markExported and clears it on load", () => {
  const store = getLayoutStore();
  expect(store.lastExportedAt).toBeNull();

  store.markExported();
  expect(store.lastExportedAt).not.toBeNull();
  expect(() => new Date(store.lastExportedAt as string)).not.toThrow();

  store.loadLayout(store.layout);
  expect(store.lastExportedAt).toBeNull();
});

it("restores lastExportedAt through restoreBackupState", () => {
  const store = getLayoutStore();
  const stamp = "2026-06-26T12:00:00.000Z";
  store.restoreBackupState({
    changesSinceExport: 4,
    hasEverExported: true,
    lastExportedAt: stamp,
  });
  expect(store.lastExportedAt).toBe(stamp);
  expect(store.changesSinceExport).toBe(4);
  expect(store.hasEverExported).toBe(true);
});
```

- [ ] Step 2: Run the tests to verify they fail

Run: `npm run test:run -- src/tests/changes-since-export.test.ts` Expected: FAIL (`store.lastExportedAt` is `undefined`; `restoreBackupState` ignores the new field).

- [ ] Step 3: Add `lastExportedAt` to `BackupState`

In `src/lib/stores/layout/persistence.ts`, change the interface (currently lines 15-18):

```typescript
/** Backup state tracked alongside the layout for the storage chip. */
export interface BackupState {
  changesSinceExport: number;
  hasEverExported: boolean;
  /** ISO timestamp of the last successful export to a file; null if never exported. */
  lastExportedAt?: string | null;
}
```

- [ ] Step 4: Track, set, expose, restore, and reset the field in the store

In `src/lib/stores/layout.svelte.ts`:

Add the state declaration next to the others (after line 142):

```typescript
let lastExportedAt = $state<string | null>(null);
```

Add a getter in the returned store object, after the `hasEverExported` getter (after line 238):

```typescript
    get lastExportedAt() {
      return lastExportedAt;
    },
```

Update `markExported()` (currently lines 836-839) to stamp the time:

```typescript
function markExported(): void {
  changesSinceExport = 0;
  hasEverExported = true;
  lastExportedAt = new Date().toISOString();
}
```

Update `restoreBackupState()` (currently lines 845-847) to restore it (undefined coerces to null):

```typescript
function restoreBackupState(state: BackupState): void {
  changesSinceExport = state.changesSinceExport;
  hasEverExported = state.hasEverExported;
  lastExportedAt = state.lastExportedAt ?? null;
}
```

In `resetBackupTracking` (the object method around lines 170-173), add the reset:

```typescript
    resetBackupTracking: () => {
      isDirty = false;
      changesSinceExport = 0;
      hasEverExported = false;
      lastExportedAt = null;
    },
```

In `resetLayout` (around lines 212-215), add the reset after `hasEverExported = false;`:

```typescript
changesSinceExport = 0;
hasEverExported = false;
lastExportedAt = null;
```

- [ ] Step 5: Run the tests to verify they pass

Run: `npm run test:run -- src/tests/changes-since-export.test.ts` Expected: PASS (all tests, including the two new ones).

- [ ] Step 6: Type-check

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5` Expected: no new errors from these files.

- [ ] Step 7: Commit

```bash
git add src/lib/stores/layout/persistence.ts src/lib/stores/layout.svelte.ts src/tests/changes-since-export.test.ts
git commit -s -m "feat: track lastExportedAt in the layout store"
```

---

### Task 2: Persist `lastExportedAt` across reload (browser multi-tab schema)

**Files:**

- Modify: `src/lib/storage/browser-workspace.ts` (`LibraryEntry` ~45-52, `DurabilityInput` ~69-73, index write ~250-258, add helper near other exports)
- Modify: `src/lib/storage/browser-workspace-persist.ts` (`PersistTab` ~25-38, `saveLayoutBody` call ~82-85, paused/shell entries ~113-130)
- Modify: `src/lib/components/PersistenceEffects.svelte` (snapshot ~88-95)
- Modify: `src/lib/stores/workspace.svelte.ts` (restore ~291-298)
- Test: `src/tests/changes-since-export.test.ts`

**Interfaces:**

- Consumes: `layoutStore.lastExportedAt` (Task 1).
- Produces: `LibraryEntry` and `DurabilityInput` gain `lastExportedAt: string | null`. New export `getLayoutSavedAt(id: string): string | null` returns a layout's last localStorage write time (the library entry `updatedAt`, or null when absent or empty).

- [ ] Step 1: Write the failing test

Add to `src/tests/changes-since-export.test.ts`. It exercises the real persist+restore round-trip through the multi-tab schema for the active layout. Add the import at the top of the file if not present:

```typescript
import {
  saveLayoutBody,
  getLayoutSavedAt,
  loadWorkspaceIndex,
} from "$lib/storage/browser-workspace";
```

Then add the test:

```typescript
it("persists and reads back lastExportedAt via the workspace library", () => {
  const id = "test-layout-id";
  const stamp = "2026-06-26T12:00:00.000Z";
  const layout = getLayoutStore().layout;

  saveLayoutBody(id, layout, {
    changesSinceExport: 2,
    hasEverExported: true,
    lastExportedAt: stamp,
  });

  const index = loadWorkspaceIndex();
  expect(index?.library[id]?.lastExportedAt).toBe(stamp);
  // updatedAt is the autosave write time, exposed for the "Auto-saved" line.
  expect(getLayoutSavedAt(id)).toBe(index?.library[id]?.updatedAt);
});
```

- [ ] Step 2: Run the test to verify it fails

Run: `npm run test:run -- src/tests/changes-since-export.test.ts` Expected: FAIL (`DurabilityInput` has no `lastExportedAt`; `getLayoutSavedAt` is not exported).

- [ ] Step 3: Add the field to `LibraryEntry` and `DurabilityInput`, write it, and add the helper

In `src/lib/storage/browser-workspace.ts`:

Extend `LibraryEntry` (lines 45-52):

```typescript
export interface LibraryEntry {
  name: string;
  updatedAt: string;
  changesSinceExport: number;
  hasEverExported: boolean;
  /** ISO timestamp of the last export to a file; null if never exported. */
  lastExportedAt: string | null;
  writeFailed: boolean;
  storageMode: StorageMode;
}
```

Extend `DurabilityInput` (lines 69-73):

```typescript
export interface DurabilityInput {
  changesSinceExport: number;
  hasEverExported?: boolean;
  lastExportedAt?: string | null;
  writeFailed?: boolean;
}
```

Update the index entry write inside `saveLayoutBody` (lines 250-258) to carry the field, preserving a prior value when the caller omits it:

```typescript
index.library[id] = {
  name: layout.name,
  updatedAt: wrote ? savedAt : (previous?.updatedAt ?? ""),
  changesSinceExport: durability.changesSinceExport,
  hasEverExported:
    durability.hasEverExported ?? previous?.hasEverExported ?? false,
  // Distinguish an explicit null (clear, e.g. after a layout reset/load) from
  // an omitted value (undefined, preserve the prior timestamp). Nullish
  // coalescing alone would treat the intentional null as "keep previous" and
  // leave a stale "Last exported" time in the entry.
  lastExportedAt:
    durability.lastExportedAt !== undefined
      ? durability.lastExportedAt
      : (previous?.lastExportedAt ?? null),
  writeFailed: durability.writeFailed ?? !wrote,
  storageMode: previous?.storageMode ?? "browser",
};
```

Add the read helper (place it after `saveLayoutBody`, before `deleteLayoutBody` near line 264):

```typescript
/**
 * The last time a layout's working copy was written to localStorage, as an ISO
 * timestamp, or null when the layout has no library entry, has never been
 * written (an empty updatedAt), or the last write failed. Surfaces the
 * "Auto-saved" time in the chip popover; excludes failed writes so the chip
 * never reports a fresh autosave time after a failed write.
 */
export function getLayoutSavedAt(id: string): string | null {
  const entry = loadWorkspaceIndex()?.library[id];
  return entry && !entry.writeFailed && entry.updatedAt
    ? entry.updatedAt
    : null;
}
```

- [ ] Step 4: Thread the field through the persist path

In `src/lib/storage/browser-workspace-persist.ts`:

Extend the hydrated `PersistTab` variant (lines 26-32):

```typescript
  | {
      layoutId: string;
      hydrated: true;
      layout: Layout;
      changesSinceExport: number;
      hasEverExported: boolean;
      lastExportedAt: string | null;
    }
```

Pass it into the body write (lines 81-85):

```typescript
const write = () =>
  saveLayoutBody(tab.layoutId, tab.layout, {
    changesSinceExport: tab.changesSinceExport,
    hasEverExported: tab.hasEverExported,
    lastExportedAt: tab.lastExportedAt,
  });
```

Add it to the paused-hydrated entry (lines 113-120):

```typescript
library[tab.layoutId] = {
  name: tab.layout.name,
  updatedAt: "",
  changesSinceExport: tab.changesSinceExport,
  hasEverExported: tab.hasEverExported,
  lastExportedAt: tab.lastExportedAt,
  writeFailed: false,
  storageMode: "browser",
};
```

Add it to the shell entry (lines 123-130), carrying forward any prior value:

```typescript
library[tab.layoutId] = {
  name: tab.name,
  updatedAt: previous?.updatedAt ?? "",
  changesSinceExport: previous?.changesSinceExport ?? 0,
  hasEverExported: previous?.hasEverExported ?? false,
  lastExportedAt: previous?.lastExportedAt ?? null,
  writeFailed: previous?.writeFailed ?? false,
  storageMode: previous?.storageMode ?? "browser",
};
```

- [ ] Step 5: Populate the field in the tab snapshot

In `src/lib/components/PersistenceEffects.svelte`, the hydrated branch of `snapshotWorkspaceTabs` (lines 89-95):

```typescript
tabs.push({
  layoutId,
  hydrated: true,
  layout: $state.snapshot(tab.store.layout),
  changesSinceExport: tab.store.changesSinceExport,
  hasEverExported: tab.store.hasEverExported,
  lastExportedAt: tab.store.lastExportedAt,
});
```

- [ ] Step 6: Restore the field

In `src/lib/stores/workspace.svelte.ts`, the restore block (lines 291-298):

```typescript
const entry = tab.layoutId ? restoreLibrary[tab.layoutId] : undefined;
if (entry) {
  tab.store.markDirty();
  tab.store.restoreBackupState({
    changesSinceExport: entry.changesSinceExport,
    hasEverExported: entry.hasEverExported,
    lastExportedAt: entry.lastExportedAt,
  });
}
```

- [ ] Step 7: Run the test and the type-check

Run: `npm run test:run -- src/tests/changes-since-export.test.ts` Expected: PASS.

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5` Expected: no new errors. (If any other `LibraryEntry` literal is reported as missing `lastExportedAt`, add `lastExportedAt: null` there.)

- [ ] Step 8: Commit

```bash
git add src/lib/storage/browser-workspace.ts src/lib/storage/browser-workspace-persist.ts src/lib/components/PersistenceEffects.svelte src/lib/stores/workspace.svelte.ts src/tests/changes-since-export.test.ts
git commit -s -m "feat: persist lastExportedAt in the browser workspace library"
```

---

### Task 3: Relative-time util

**Files:**

- Create: `src/lib/utils/relative-time.ts`
- Test: `src/tests/relative-time.test.ts`

**Interfaces:**

- Produces: `formatTimeAgo(iso: string | null, nowMs?: number): string | null` returning `null` for null/invalid input, `"just now"` under 45 seconds (or small future skew), else a relative-time string. Deterministic when `nowMs` is supplied.

- [ ] Step 1: Write the failing test

Create `src/tests/relative-time.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatTimeAgo } from "$lib/utils/relative-time";

const NOW = Date.parse("2026-06-26T12:00:00.000Z");
const at = (iso: string) => formatTimeAgo(iso, NOW);

describe("formatTimeAgo", () => {
  it("returns null for null or unparseable input", () => {
    expect(formatTimeAgo(null, NOW)).toBeNull();
    expect(formatTimeAgo("not-a-date", NOW)).toBeNull();
  });

  it("says 'just now' under 45 seconds, including small future skew", () => {
    expect(at("2026-06-26T11:59:30.000Z")).toBe("just now");
    expect(at("2026-06-26T12:00:10.000Z")).toBe("just now");
  });

  it("formats minutes, hours, and days as elapsed time", () => {
    expect(at("2026-06-26T11:58:00.000Z")).toBe("2 minutes ago");
    expect(at("2026-06-26T09:00:00.000Z")).toBe("3 hours ago");
    expect(at("2026-06-23T12:00:00.000Z")).toBe("3 days ago");
  });
});
```

- [ ] Step 2: Run the test to verify it fails

Run: `npm run test:run -- src/tests/relative-time.test.ts` Expected: FAIL ("Cannot find module '$lib/utils/relative-time'").

- [ ] Step 3: Implement the util

Create `src/lib/utils/relative-time.ts`:

```typescript
/**
 * Format an ISO timestamp as elapsed time relative to now, for the storage chip
 * popover. Returns null for null or unparseable input so the caller can choose
 * its own copy (for example "Never exported"). Under 45 seconds (including small
 * negative skew) it returns "just now". `nowMs` is injectable for deterministic
 * tests.
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });

export function formatTimeAgo(
  iso: string | null,
  nowMs: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const elapsed = nowMs - then;
  const abs = Math.abs(elapsed);
  if (abs < 45 * SECOND) return "just now";
  if (abs < HOUR) return rtf.format(-Math.round(elapsed / MINUTE), "minute");
  if (abs < DAY) return rtf.format(-Math.round(elapsed / HOUR), "hour");
  return rtf.format(-Math.round(elapsed / DAY), "day");
}
```

- [ ] Step 4: Run the test to verify it passes

Run: `npm run test:run -- src/tests/relative-time.test.ts` Expected: PASS.

- [ ] Step 5: Commit

```bash
git add src/lib/utils/relative-time.ts src/tests/relative-time.test.ts
git commit -s -m "feat: add formatTimeAgo util for the storage chip"
```

---

### Task 4: Extend the durability source with inline label, location flag, and export time

**Files:**

- Modify: `src/lib/storage/durability.svelte.ts` (`LayoutDurability` ~42-58, `computeLayoutStatus` return type ~78-84 and all return branches ~90-187, `getLayoutDurability` getters ~226-256)
- Test: `src/tests/durability-inline-labels.test.ts`

**Interfaces:**

- Consumes: `layoutStore.lastExportedAt` (Task 1).
- Produces: `computeLayoutStatus(...)` returns two extra fields: `shortLabel: string` (the inline state word) and `showLocation: boolean` (false for self-describing error states). `LayoutDurability` gains `shortLabel: string`, `showLocation: boolean`, and `lastExportedAt: string | null`.

- [ ] Step 1: Write the failing test

Create `src/tests/durability-inline-labels.test.ts`. `computeLayoutStatus` is a pure exported function (signature: `(saveStatus, consecutiveSaveFailures, storageMode, apiAvailable, changesSinceExport, hasEverExported, apiEverReached)`):

```typescript
import { describe, it, expect } from "vitest";
import { computeLayoutStatus } from "$lib/storage/durability.svelte";

describe("computeLayoutStatus inline fields", () => {
  it("browser clean: short 'Saved', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "browser", null, 0, true, false);
    expect(r.shortLabel).toBe("Saved");
    expect(r.showLocation).toBe(true);
  });

  it("browser dirty: short 'Unsaved', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "browser", null, 3, false, false);
    expect(r.shortLabel).toBe("Unsaved");
    expect(r.showLocation).toBe(true);
  });

  it("server saved: short 'Saved', location shown", () => {
    const r = computeLayoutStatus("saved", 0, "server", true, 0, true, true);
    expect(r.shortLabel).toBe("Saved");
    expect(r.showLocation).toBe(true);
  });

  it("server checking: short 'Connecting', location shown", () => {
    const r = computeLayoutStatus("idle", 0, "server", null, 0, true, false);
    expect(r.shortLabel).toBe("Connecting");
    expect(r.showLocation).toBe(true);
  });

  it("server never reached: 'Server not found' stands alone", () => {
    const r = computeLayoutStatus("idle", 0, "server", false, 0, true, false);
    expect(r.shortLabel).toBe("Server not found");
    expect(r.showLocation).toBe(false);
  });

  it("server breaker open: 'Server unavailable' stands alone", () => {
    const r = computeLayoutStatus("error", 3, "server", true, 0, true, true);
    expect(r.shortLabel).toBe("Server unavailable");
    expect(r.showLocation).toBe(false);
  });
});
```

- [ ] Step 2: Run the test to verify it fails

Run: `npm run test:run -- src/tests/durability-inline-labels.test.ts` Expected: FAIL (`shortLabel` / `showLocation` are undefined).

- [ ] Step 3: Add the fields to the `computeLayoutStatus` return type and every branch

In `src/lib/storage/durability.svelte.ts`, extend the return type annotation (lines 78-84):

```typescript
): {
  status: DurabilityStatus;
  kind: DurabilityKind;
  label: string;
  shortLabel: string;
  showLocation: boolean;
  detail: string;
  icon: DurabilityStatus;
} {
```

Then add `shortLabel` and `showLocation` to each of the eight return objects. Use these exact values (insert the two new properties into each existing object; keep the existing comments):

```typescript
// browser, durable (line ~91)
return {
  status: "saved",
  kind: "saved",
  label: "Saved",
  shortLabel: "Saved",
  showLocation: true,
  detail: "Stored in this browser",
  icon: "saved",
};
// browser, pending (line ~99)
return {
  status: "pending",
  kind: "pending",
  label: "Unsaved changes",
  shortLabel: "Unsaved",
  showLocation: true,
  detail: "Stored in this browser",
  icon: "pending",
};
// server, breaker open (line ~113)
return {
  status: "error",
  kind: "offline",
  label: "Server unavailable",
  shortLabel: "Server unavailable",
  showLocation: false,
  detail: "Working from your browser; reload to retry.",
  icon: "error",
};
// server, checking (line ~122)
return {
  status: "pending",
  kind: "pending",
  label: "Checking connection",
  shortLabel: "Connecting",
  showLocation: true,
  detail: "Looking for the server.",
  icon: "pending",
};
// server, reached-then-lost (line ~137)
return {
  status: "error",
  kind: "offline",
  label: "Offline",
  shortLabel: "Offline",
  showLocation: true,
  detail: "Working from your browser; reload to retry.",
  icon: "error",
};
// server, never-reached (line ~145)
return {
  status: "error",
  kind: "server-not-found",
  label: "Server not found",
  shortLabel: "Server not found",
  showLocation: false,
  detail:
    "Check that the API container is running and RACKULA_STORAGE_MODE matches the deployment.",
  icon: "error",
};
// server, save error (line ~155)
return {
  status: "error",
  kind: "offline",
  label: "Save error",
  shortLabel: "Save error",
  showLocation: true,
  detail: "The last save did not go through.",
  icon: "error",
};
// server, saving (line ~164)
return {
  status: "pending",
  kind: "pending",
  label: "Saving",
  shortLabel: "Saving",
  showLocation: true,
  detail: "Saving to server.",
  icon: "pending",
};
// server, saved (line ~173)
return {
  status: "saved",
  kind: "saved",
  label: "Saved",
  shortLabel: "Saved",
  showLocation: true,
  detail: "Saved to server",
  icon: "saved",
};
// server, fallback pending (line ~181)
return {
  status: "pending",
  kind: "pending",
  label: "Pending save",
  shortLabel: "Pending",
  showLocation: true,
  detail: "Saving to server.",
  icon: "pending",
};
```

- [ ] Step 4: Add the fields to `LayoutDurability` and the durability getters

Extend the `LayoutDurability` interface (lines 42-58) by adding, after `label: string;`:

```typescript
shortLabel: string;
showLocation: boolean;
```

and, after `hasEverExported: boolean;`:

```typescript
lastExportedAt: string | null;
```

In `getLayoutDurability` (lines 226-256), add getters alongside the existing ones (after the `label` getter and after the `hasEverExported` getter respectively):

```typescript
    get shortLabel(): string {
      return compute().shortLabel;
    },
    get showLocation(): boolean {
      return compute().showLocation;
    },
```

```typescript
    get lastExportedAt(): string | null {
      return layoutStore.lastExportedAt;
    },
```

- [ ] Step 5: Run the test and the type-check

Run: `npm run test:run -- src/tests/durability-inline-labels.test.ts` Expected: PASS.

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5` Expected: no new errors.

- [ ] Step 6: Commit

```bash
git add src/lib/storage/durability.svelte.ts src/tests/durability-inline-labels.test.ts
git commit -s -m "feat: add inline label, location flag, and export time to durability"
```

---

### Task 5: Two-tone inline chip and accessible name

**Files:**

- Modify: `src/lib/components/StorageStatusChip.svelte` (markup ~99-133, styles ~135-191)
- Test: `src/tests/StorageStatusChip.test.ts`

**Interfaces:**

- Consumes: `durability.shortLabel`, `durability.showLocation`, `durability.status`, `durability.icon`, `durability.serverHint` (Task 4); `isServerMode` (already computed in the component).
- Produces: the chip renders `[icon] [shortLabel] . [location]` with the status colour on the state word and a muted location. Accessible name is `Storage status: {label}` plus `, Browser` or `, Server` when `showLocation` is true.

- [ ] Step 1: Update the test for the new accessible name

Replace the assertion in `src/tests/StorageStatusChip.test.ts` (the existing test expects `/storage status: unsaved changes/i`). A fresh browser-mode store is dirty, so:

```typescript
it("exposes the current storage state and location in its accessible name", () => {
  render(StorageStatusChip);
  const chip = screen.getByTestId("storage-status-chip");
  expect(chip).toHaveAccessibleName(
    /storage status: unsaved changes, browser/i,
  );
});
```

- [ ] Step 2: Run the test to verify it fails

Run: `npm run test:run -- src/tests/StorageStatusChip.test.ts` Expected: FAIL (current accessible name has no location).

- [ ] Step 3: Add a derived accessible name and split the inline text

In `src/lib/components/StorageStatusChip.svelte`, add a derived value in the `<script>` (after the `durability` constant, near line 36):

```typescript
const locationWord = $derived(isServerMode ? "Server" : "Browser");
const accessibleName = $derived(
  durability.showLocation
    ? `Storage status: ${durability.label}, ${locationWord}`
    : `Storage status: ${durability.label}`,
);
```

Replace the chip markup (lines 99-133) so the label splits into a coloured state word and a muted location, and the `aria-label` uses the derived name:

```svelte
<div
  class="storage-chip storage-chip-{durability.status}"
  class:storage-chip--attention={durability.serverHint}
  role="status"
  aria-live="off"
  aria-label={accessibleName}
  data-testid="storage-status-chip"
>
  {#if durability.icon === "saved"}
    <IconCheck size={ICON_SIZE.sm} />
  {:else if durability.icon === "pending"}
    <IconClock size={ICON_SIZE.sm} />
  {:else}
    <IconWarningTriangle size={ICON_SIZE.sm} />
  {/if}
  <span class="storage-chip-state">{durability.shortLabel}</span>
  {#if durability.showLocation}
    <span class="storage-chip-sep" aria-hidden="true">.</span>
    <span class="storage-chip-loc">{locationWord}</span>
  {/if}
</div>
```

- [ ] Step 4: Make the location and separator muted

In the `<style>` block, the status classes currently colour the whole chip; keep that (so the icon and state word inherit the status colour) and override the location and separator to muted. Add after the `.storage-chip-error` rule:

```css
.storage-chip-state {
  font-weight: 600;
}

/* Location is secondary: muted so the coloured state word leads. */
.storage-chip-sep,
.storage-chip-loc {
  color: var(--colour-text-muted);
  font-weight: 500;
}
```

- [ ] Step 5: Run the test to verify it passes

Run: `npm run test:run -- src/tests/StorageStatusChip.test.ts` Expected: PASS.

- [ ] Step 6: Commit

```bash
git add src/lib/components/StorageStatusChip.svelte src/tests/StorageStatusChip.test.ts
git commit -s -m "feat: show storage location inline on the chip"
```

---

### Task 6: Details popover (content component + hover/tap wiring)

**Files:**

- Create: `src/lib/components/StorageDetailsPopover.svelte`
- Modify: `src/lib/components/StorageStatusChip.svelte` (wrap the chip in a Popover; add hover/tap and the refresh timer)
- Test: `src/tests/storage-details-popover.test.ts`

**Interfaces:**

- Consumes: `formatTimeAgo` (Task 3); `getLayoutSavedAt` (Task 2); `getServerBaseUpdatedAt` (existing, exported from `$lib/storage`); `durability.lastExportedAt`, `durability.label`, `durability.icon`, `durability.changesSinceExport` (Task 4).
- Produces: `StorageDetailsPopover` renders mode-aware facts from plain props (so it is testable without opening a popover).

- [ ] Step 1: Write the failing test for the content component

Create `src/tests/storage-details-popover.test.ts`. It renders the content component directly with props and asserts on copy (text assertions are allowed):

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import StorageDetailsPopover from "$lib/components/StorageDetailsPopover.svelte";

const NOW = Date.parse("2026-06-26T12:00:00.000Z");

describe("StorageDetailsPopover", () => {
  it("browser mode shows both timestamps and 'Never exported' when null", () => {
    render(StorageDetailsPopover, {
      mode: "browser",
      kind: "pending",
      headline: "Unsaved changes",
      icon: "pending",
      changesSinceExport: 3,
      lastExportedAt: null,
      autosaveAt: "2026-06-26T11:59:50.000Z",
      serverSavedAt: null,
      nowMs: NOW,
    });
    expect(screen.getByText(/auto-saved/i)).toBeInTheDocument();
    expect(screen.getByText(/never exported/i)).toBeInTheDocument();
    expect(
      screen.getByText(/stored in this browser only/i),
    ).toBeInTheDocument();
  });

  it("browser mode formats a real export time", () => {
    render(StorageDetailsPopover, {
      mode: "browser",
      kind: "saved",
      headline: "Saved",
      icon: "saved",
      changesSinceExport: 0,
      lastExportedAt: "2026-06-23T12:00:00.000Z",
      autosaveAt: "2026-06-26T11:59:50.000Z",
      serverSavedAt: null,
      nowMs: NOW,
    });
    expect(screen.getByText(/last exported/i)).toBeInTheDocument();
    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });

  it("server mode shows the last server save and storage location", () => {
    render(StorageDetailsPopover, {
      mode: "server",
      kind: "saved",
      headline: "Saved",
      icon: "saved",
      changesSinceExport: 0,
      lastExportedAt: null,
      autosaveAt: null,
      serverSavedAt: "2026-06-26T11:58:00.000Z",
      nowMs: NOW,
    });
    expect(screen.getByText(/last saved/i)).toBeInTheDocument();
    expect(screen.getByText(/2 minutes ago/i)).toBeInTheDocument();
    expect(screen.getByText(/stored on the server/i)).toBeInTheDocument();
  });

  it("server mode error reframes the time as last reached", () => {
    render(StorageDetailsPopover, {
      mode: "server",
      kind: "offline",
      headline: "Offline",
      icon: "error",
      changesSinceExport: 0,
      lastExportedAt: null,
      autosaveAt: null,
      serverSavedAt: "2026-06-26T11:52:00.000Z",
      nowMs: NOW,
    });
    expect(screen.getByText(/last reached server/i)).toBeInTheDocument();
  });
});
```

- [ ] Step 2: Run the test to verify it fails

Run: `npm run test:run -- src/tests/storage-details-popover.test.ts` Expected: FAIL ("Cannot find module '.../StorageDetailsPopover.svelte'").

- [ ] Step 3: Create the content component

Create `src/lib/components/StorageDetailsPopover.svelte`:

```svelte
<!--
  StorageDetailsPopover
  Read-only facts for the storage chip popover. Prop-driven so it renders the
  same way from the chip and from a unit test. Facts only: no actions (those
  live in the app menu, #2446). Browser mode shows the autosave time and the
  last-export time, labelled, so a recent autosave never reads as a durable
  backup. Server mode shows the last server save, reframed as "last reached"
  when the connection is degraded.
-->
<script lang="ts">
  import { IconCheck, IconClock, IconWarningTriangle } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatTimeAgo } from "$lib/utils/relative-time";
  import type { DurabilityKind } from "$lib/storage";

  interface Props {
    mode: "browser" | "server";
    kind: DurabilityKind;
    headline: string;
    icon: "saved" | "pending" | "error";
    changesSinceExport: number;
    lastExportedAt: string | null;
    autosaveAt: string | null;
    serverSavedAt: string | null;
    nowMs: number;
  }

  let {
    mode,
    kind,
    headline,
    icon,
    changesSinceExport,
    lastExportedAt,
    autosaveAt,
    serverSavedAt,
    nowMs,
  }: Props = $props();

  const autosaveRel = $derived(formatTimeAgo(autosaveAt, nowMs));
  const exportRel = $derived(formatTimeAgo(lastExportedAt, nowMs));
  const serverRel = $derived(formatTimeAgo(serverSavedAt, nowMs));
  const neverReached = $derived(kind === "server-not-found");
  const degraded = $derived(kind === "offline");
</script>

<div class="storage-details">
  <div class="storage-details-head storage-details-{icon}">
    {#if icon === "saved"}
      <IconCheck size={ICON_SIZE.sm} />
    {:else if icon === "pending"}
      <IconClock size={ICON_SIZE.sm} />
    {:else}
      <IconWarningTriangle size={ICON_SIZE.sm} />
    {/if}
    <span>{headline}</span>
  </div>

  <div class="storage-details-divider"></div>

  {#if mode === "browser"}
    {#if autosaveRel}
      <div class="storage-details-row">
        <span class="storage-details-label">Auto-saved</span>
        <span class="storage-details-value">{autosaveRel}</span>
      </div>
    {/if}
    <div class="storage-details-row">
      <span class="storage-details-label">Last exported</span>
      <span
        class="storage-details-value"
        class:storage-details-warn={changesSinceExport > 0}
      >
        {exportRel ?? "Never exported"}
      </span>
    </div>
    {#if changesSinceExport > 0}
      <p class="storage-details-note storage-details-warn">
        {changesSinceExport}
        {changesSinceExport === 1 ? "change" : "changes"} since last export
      </p>
    {/if}
    <p class="storage-details-foot">Stored in this browser only</p>
  {:else if neverReached}
    <p class="storage-details-note storage-details-warn">
      This layout has not been saved to the server.
    </p>
    <p class="storage-details-foot">Not saved to the server</p>
  {:else}
    <div class="storage-details-row">
      <span class="storage-details-label">
        {degraded ? "Last reached server" : "Last saved"}
      </span>
      <span class="storage-details-value" class:storage-details-warn={degraded}>
        {serverRel ?? "Not yet saved"}
      </span>
    </div>
    {#if degraded}
      <p class="storage-details-note storage-details-warn">
        Your most recent edits may not be saved.
      </p>
    {/if}
    <p class="storage-details-foot">Stored on the server</p>
  {/if}
</div>

<style>
  .storage-details {
    min-width: 224px;
    padding: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--colour-text);
  }
  .storage-details-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 600;
  }
  .storage-details-saved {
    color: var(--colour-success);
  }
  .storage-details-pending {
    color: var(--colour-warning);
  }
  .storage-details-error {
    color: var(--colour-error);
  }
  .storage-details-divider {
    height: 1px;
    background: var(--colour-border);
    margin: var(--space-2) calc(-1 * var(--space-3));
  }
  .storage-details-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 2px 0;
  }
  .storage-details-label {
    color: var(--colour-text-muted);
  }
  .storage-details-value {
    font-variant-numeric: tabular-nums;
  }
  .storage-details-warn {
    color: var(--colour-warning);
  }
  .storage-details-note {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-xs);
  }
  .storage-details-foot {
    margin: var(--space-2) 0 0;
    color: var(--colour-text-muted);
  }
</style>
```

- [ ] Step 4: Run the content-component test to verify it passes

Run: `npm run test:run -- src/tests/storage-details-popover.test.ts` Expected: PASS.

- [ ] Step 5: Commit the content component

```bash
git add src/lib/components/StorageDetailsPopover.svelte src/tests/storage-details-popover.test.ts
git commit -s -m "feat: add StorageDetailsPopover content component"
```

- [ ] Step 6: Wire the popover into the chip with hover and tap

In `src/lib/components/StorageStatusChip.svelte`:

Add imports (with the existing imports):

```typescript
import { Popover } from "$lib/components/ui/Popover";
import StorageDetailsPopover from "./StorageDetailsPopover.svelte";
import { getServerBaseUpdatedAt } from "$lib/storage";
import { getLayoutSavedAt } from "$lib/storage/browser-workspace";
```

Add the open state, the relative-time refresh, and the hover handlers in the `<script>`:

```typescript
let open = $state(false);
let nowMs = $state(Date.now());
let closeTimer: ReturnType<typeof setTimeout> | undefined;

// Recompute the popover's relative times only while it is open.
$effect(() => {
  if (!open) return;
  nowMs = Date.now();
  const id = setInterval(() => {
    nowMs = Date.now();
  }, 30_000);
  return () => clearInterval(id);
});

function hoverOpen(event: PointerEvent) {
  if (event.pointerType === "touch") return; // touch uses tap
  clearTimeout(closeTimer);
  open = true;
}
function hoverClose(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    open = false;
  }, 150);
}

// Timestamp sources for the popover, read on open. Browser: the layout's last
// localStorage write (autosave) plus its last export. Server: the last server save.
const layoutId = $derived(layoutStore.layout.metadata?.id ?? null);
const autosaveAt = $derived(
  open && !isServerMode && layoutId ? getLayoutSavedAt(layoutId) : null,
);
const serverSavedAt = $derived(
  open && isServerMode ? getServerBaseUpdatedAt() : null,
);
```

Replace the chip `<div>` (the block from Step 3 of Task 5) by wrapping it in a Popover, turning the chip into the trigger button via the `child` snippet (mirroring `Tooltip.svelte`):

```svelte
<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="storage-chip storage-chip-{durability.status}"
        class:storage-chip--attention={durability.serverHint}
        aria-label={accessibleName}
        data-testid="storage-status-chip"
        onpointerenter={hoverOpen}
        onpointerleave={hoverClose}
      >
        {#if durability.icon === "saved"}
          <IconCheck size={ICON_SIZE.sm} />
        {:else if durability.icon === "pending"}
          <IconClock size={ICON_SIZE.sm} />
        {:else}
          <IconWarningTriangle size={ICON_SIZE.sm} />
        {/if}
        <span class="storage-chip-state">{durability.shortLabel}</span>
        {#if durability.showLocation}
          <span class="storage-chip-sep" aria-hidden="true">.</span>
          <span class="storage-chip-loc">{locationWord}</span>
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="storage-chip-popover"
      side="bottom"
      sideOffset={8}
      onpointerenter={() => clearTimeout(closeTimer)}
      onpointerleave={hoverClose}
    >
      <StorageDetailsPopover
        mode={isServerMode ? "server" : "browser"}
        kind={durability.kind}
        headline={durability.label}
        icon={durability.icon}
        changesSinceExport={durability.changesSinceExport}
        lastExportedAt={durability.lastExportedAt}
        {autosaveAt}
        {serverSavedAt}
        {nowMs}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
```

Note: the chip is now a `<button>`, so the old `role="status"` / `aria-live="off"` move off it; the existing hidden `sr-only` live region (the `announced` span at the end of the file) stays and keeps announcing settled state. Leave the `ServerAvailableBanner` and the override `<button>` blocks unchanged.

- [ ] Step 7: Update the chip styles for the interactive trigger

In the `<style>` block, replace the base `.storage-chip` rule so it is a borderless, interactive pill with a hover wash and a focus ring (the chip is a button now), and ensure the attention state still shows a border:

```css
.storage-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 28px;
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--colour-text);
  font-size: var(--font-size-xs);
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
}
.storage-chip:hover,
.storage-chip[data-state="open"] {
  background: var(--colour-surface-hover);
}
.storage-chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-glow);
}
```

Add a popover surface rule (this targets the `Popover.Content` via its class):

```css
:global(.storage-chip-popover) {
  background: var(--colour-bg);
  border: 1px solid var(--colour-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, 0 12px 30px rgba(0, 0, 0, 0.45));
  z-index: var(--z-popover, 50);
}
```

- [ ] Step 8: Validate the Svelte components

Use the Svelte MCP `svelte-autofixer` on `StorageStatusChip.svelte` and `StorageDetailsPopover.svelte`; apply any fixes and re-run it until clean.

Run: `npm run test:run -- src/tests/StorageStatusChip.test.ts src/tests/storage-details-popover.test.ts` Expected: PASS.

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5` Expected: no new errors.

- [ ] Step 9: Commit

```bash
git add src/lib/components/StorageStatusChip.svelte
git commit -s -m "feat: reveal storage details on chip hover and tap"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] Step 1: Run the full unit suite

Run: `npm run test:run` Expected: PASS. If any other `LibraryEntry` or `BackupState` literal site fails to compile, add `lastExportedAt: null` (entries) or omit it (optional on `BackupState`) and re-run.

- [ ] Step 2: Lint and type-check

Run: `npm run lint` Expected: PASS (no `no-restricted-syntax` test violations, no querySelector/toHaveClass/colour assertions).

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | tail -5` Expected: no errors.

- [ ] Step 3: Manual smoke (dev server)

Run: `npm run dev`, open the app, and confirm:

- Browser mode: chip reads `Unsaved . Browser` then `Saved . Browser` after an export; hovering (mouse) and tapping (touch) both open the popover; the popover shows "Auto-saved", "Last exported" (or "Never exported"), and "Stored in this browser only".
- The popover closes on Escape, on click-away, and on mouse-leave (after the short delay), and stays open while the pointer is inside it.
- Keyboard: Tab to the chip, press Enter or Space to open, Escape to close; the focus ring shows.

- [ ] Step 4: Stop for review

Stop here and hand back for review. Do not open a PR until the branch is reviewed per the project workflow (CodeRabbit + CodeAnt).

## Self-review

Spec coverage:

- Inline two-tone state + location: Task 5 (rendering), Task 4 (`shortLabel`, `showLocation`).
- De-dup rule for self-describing errors: Task 4 (`showLocation: false` for "Server not found" and "Server unavailable").
- Popover facts, mode-aware: Task 6 (`StorageDetailsPopover`), with browser "show both, labelled" and server "last saved" / degraded "last reached".
- Data model `lastExportedAt`: Task 1 (store) and Task 2 (persistence), threaded through the live multi-tab schema.
- Relative time computed on open, refreshed only while open: Task 6 (`$effect` gated on `open`).
- Interaction and a11y: Task 6 (button trigger, hybrid hover/tap, focus ring); the existing debounced live region is preserved.
- Default decisions: export-age amber tied to `changesSinceExport > 0` (Task 6 content component); "Connecting"/"Unsaved"/"Pending" wording (Task 4); calm clock for "Saving" (unchanged icons).

Deviations recorded: server-mode working-copy path is not threaded (server never shows "Last exported"); the #2063 server hint stays in the existing `ServerAvailableBanner` rather than being duplicated in the popover.

Placeholder scan: every code step shows complete code; no TBD/TODO; test code is concrete.

Type consistency: `lastExportedAt: string | null` is consistent across `BackupState` (optional), `LibraryEntry`, `DurabilityInput`, the layout store getter, and `LayoutDurability`. `getLayoutSavedAt(id: string): string | null` and `formatTimeAgo(iso, nowMs?)` signatures match their call sites. `StorageDetailsPopover` props match the test and the chip's usage.
