# Server-mode Layouts Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Layouts panel list the layouts the server returns when `RACKULA_STORAGE_MODE=server`, fixing issue #3151.

**Architecture:** A new reactive `server-library.svelte.ts` store holds the server catalogue fetched from `listSavedLayouts()`. `buildLayoutRows` becomes catalogue-source agnostic: it takes an entry array plus an explicit `resolveOpenId` resolver, because server mode never sets `tab.layoutId`. The desktop panel and the mobile sheet pick their source by `getStorageMode()` and route server-mode open and delete through the existing `runOpenFileFlow` guard and the API, keeping server mode's single-working-copy model intact.

**Tech Stack:** Svelte 5 runes (`$state`, `$derived`, `$effect`), TypeScript strict mode, Vitest with @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-08-22-server-mode-layouts-panel-design.md`

**Issue:** [#3151](https://github.com/RackulaLives/Rackula/issues/3151)

## Global Constraints

- Work in the worktree `.worktree/Rackula-issue-3151` on branch `fix/3151-server-layouts-panel`. Never edit the main checkout.
- Every commit needs a DCO sign-off: `git commit -s`. Commit message format is `type: description` with types `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Svelte 5 runes only. No `svelte/store` imports.
- Testing rules from `CLAUDE.md` are enforced by ESLint and will fail the build: no `querySelector` or DOM node access in tests, no `toHaveClass()`, no `toHaveLength(<literal>)` without an `eslint-disable-next-line no-restricted-syntax` and a justification comment, no hardcoded colour assertions, no "renders without throwing" tests.
- User-facing copy: no em dashes, no en dashes, no smart quotes, no emoji.
- Run the main checkout's prettier before committing: `/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write <files>`. The worktree's pre-commit hook cannot resolve prettier.
- Do not change server mode's single-working-copy model. No per-layout `serverBaseUpdatedAt`, no per-tab server save.

---

### Task 1: Catalogue-source-agnostic `buildLayoutRows`

Makes the row builder take an entry array plus an explicit open-id resolver, so a server catalogue can feed it. Browser behaviour is unchanged. This task ships no server code.

**Files:**

- Modify: `src/lib/components/layouts-library.ts`
- Modify: `src/lib/components/LayoutsLibrary.svelte` (call site only, keep browser behaviour)
- Modify: `src/lib/components/mobile/MobileLayoutsSheet.svelte` (call site only, keep browser behaviour)
- Test: `src/tests/layouts-library.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `CatalogueEntry` (`{ id: string; name: string; rackCount?: number; deviceCount?: number; valid?: boolean }`), `LayoutRow.valid: boolean`, and `buildLayoutRows(tabs: readonly WorkspaceTab[], activeId: string, catalogue: readonly CatalogueEntry[], resolveOpenId: (tab: WorkspaceTab) => string | undefined): LayoutRow[]`. Tasks 4 and 5 call this. `resolveOpenId` is required, not optional with a default: omitting it in server mode is exactly the bug being fixed, so the compiler must force the decision at every call site.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/layouts-library.test.ts`, inside the existing `describe("buildLayoutRows", ...)` block:

```typescript
it("resolves open ids through the injected resolver, not tab.layoutId", () => {
  const ws = getWorkspaceStore();
  // Server mode's shape: a tab whose body carries the server id while the tab
  // record has no layoutId, because no server load path sets one.
  ws.clearThenLoad(createLayout("Homelab"));
  const openId = ws.activeStore.layout.metadata?.id ?? "";
  const catalogue = [{ id: openId, name: "Homelab" }];

  const rows = buildLayoutRows(
    ws.tabs,
    ws.activeId,
    catalogue,
    (t) => t.store.layout.metadata?.id,
  );

  expect(
    rows.filter((r) => r.layoutId === openId).map((r) => r.isOpen),
  ).toEqual([true]);
});

it("carries counts and validity from catalogue entries onto closed rows", () => {
  const ws = getWorkspaceStore();
  const catalogue = [
    { id: "srv-1", name: "Closet", rackCount: 3, deviceCount: 11, valid: true },
    { id: "srv-2", name: "Broken", valid: false },
  ];

  const rows = buildLayoutRows(
    ws.tabs,
    ws.activeId,
    catalogue,
    (t) => t.layoutId,
  );

  const closet = rows.find((r) => r.layoutId === "srv-1");
  expect(closet?.rackCount).toBe(3);
  expect(closet?.deviceCount).toBe(11);
  expect(rows.find((r) => r.layoutId === "srv-2")?.valid).toBe(false);
});

it("treats a catalogue entry with no validity flag as valid", () => {
  const ws = getWorkspaceStore();

  const rows = buildLayoutRows(
    ws.tabs,
    ws.activeId,
    [{ id: "local-1", name: "Local" }],
    (t) => t.layoutId,
  );

  expect(rows.find((r) => r.layoutId === "local-1")?.valid).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/layouts-library.test.ts` Expected: FAIL. TypeScript rejects the 4-argument calls and the object-array catalogue, and `r.valid` does not exist on `LayoutRow`.

- [ ] **Step 3: Change the types and the builder**

In `src/lib/components/layouts-library.ts`, add the entry type above `LayoutRow`:

```typescript
/**
 * One catalogue row's source data, independent of where the catalogue came
 * from: the browser workspace index or the server's layout list (#3151).
 */
export interface CatalogueEntry {
  id: string;
  name: string;
  /** Rack count, when the source knows it. The server list supplies it. */
  rackCount?: number;
  /** Device count, when the source knows it. The server list supplies it. */
  deviceCount?: number;
  /** False when the stored YAML is corrupted. Server catalogue only. */
  valid?: boolean;
}
```

Add `valid` to `LayoutRow`, after `deviceCount`:

```typescript
/** False only for a corrupted server layout, which cannot be opened. */
valid: boolean;
```

Replace the `buildLayoutRows` signature and body. The `library` parameter becomes `catalogue`, and open-id resolution moves to an injected resolver:

```typescript
/**
 * Build the library row list from the open tabs and a catalogue of saved
 * layouts.
 *
 * Open layouts come first, in tab order, so the panel and the tab strip stay in
 * sync; closed layouts (in the catalogue with no open tab) follow. An open
 * layout that is also in the catalogue renders once, as an open row, never as a
 * duplicate closed row. The active tab is flagged so the UI can highlight it
 * (paired with text, never colour-only).
 *
 * `resolveOpenId` says how a tab names the catalogue entry it holds, because
 * the two modes differ (#3151). Browser mode passes `t => t.layoutId`: a
 * lazily-restored shell has no loaded body, so the tab record is the only
 * identity available. Server mode passes `t => t.store.layout.metadata?.id`:
 * no server load path sets `tab.layoutId`, and reading the live body means a
 * tab whose contents were replaced resolves to the layout it now holds rather
 * than a stale id.
 */
export function buildLayoutRows(
  tabs: readonly WorkspaceTab[],
  activeId: string,
  catalogue: readonly CatalogueEntry[],
  resolveOpenId: (tab: WorkspaceTab) => string | undefined,
): LayoutRow[] {
  const openLayoutIds = new Set<string>();
  const openRows: LayoutRow[] = tabs.map((tab) => {
    const openId = resolveOpenId(tab);
    if (openId) openLayoutIds.add(openId);
    const { layout } = tab.store;
    const racks = layout.racks ?? [];
    const deviceCount = racks.reduce(
      (sum, rack) => sum + rack.devices.length,
      0,
    );
    return {
      tabId: tab.id,
      layoutId: openId ?? null,
      name: layout.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: tab.id === activeId,
      isOpen: true,
      rackCount: racks.length,
      deviceCount,
      valid: true,
    };
  });

  const closedRows: LayoutRow[] = catalogue
    .filter((entry) => !openLayoutIds.has(entry.id))
    .map((entry) => ({
      tabId: null,
      layoutId: entry.id,
      name: entry.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: false,
      isOpen: false,
      rackCount: entry.rackCount ?? 0,
      deviceCount: entry.deviceCount ?? 0,
      valid: entry.valid ?? true,
    }));

  return [...openRows, ...closedRows];
}
```

Note the open-row change: `layoutId` now comes from `resolveOpenId(tab)` rather than `tab.layoutId`, so a server-mode open row carries the server's id and the panel can act on it.

- [ ] **Step 4: Update the two component call sites, keeping browser behaviour**

In both `src/lib/components/LayoutsLibrary.svelte` and `src/lib/components/mobile/MobileLayoutsSheet.svelte`, replace the `rows` derivation with:

```typescript
const rows = $derived(
  buildLayoutRows(
    workspaceStore.tabs,
    workspaceStore.activeId,
    Object.entries(workspaceStore.library).map(([id, entry]) => ({
      id,
      name: entry.name,
    })),
    (t) => t.layoutId,
  ),
);
```

Task 4 replaces this with the mode-aware version in the desktop panel, and Task 5 does the same for mobile. This step exists so the tree compiles and browser mode keeps working between tasks.

- [ ] **Step 5: Update the existing test call sites**

`src/tests/layouts-library.test.ts` calls `buildLayoutRows(ws.tabs, ws.activeId, ws.library)` at six places. Add this helper just below the imports:

```typescript
/** Browser-mode catalogue shape, mirroring what the panel passes (#3151). */
function entriesFrom(
  library: Readonly<Record<string, { name: string }>>,
): CatalogueEntry[] {
  return Object.entries(library).map(([id, entry]) => ({
    id,
    name: entry.name,
  }));
}

/** Browser-mode open-id resolution: the tab record owns the identity. */
const byTabLayoutId = (t: WorkspaceTab) => t.layoutId;
```

Import `CatalogueEntry` from `$lib/components/layouts-library` and `WorkspaceTab` from `$lib/stores/workspace.svelte`. Then rewrite each of the six calls to:

```typescript
const rows = buildLayoutRows(
  ws.tabs,
  ws.activeId,
  entriesFrom(ws.library),
  byTabLayoutId,
);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/tests/layouts-library.test.ts` Expected: PASS, including the three new cases.

- [ ] **Step 7: Typecheck**

Run: `npm run check` Expected: no new errors. If a consumer of `LayoutRow` fails on the new required `valid` field, that consumer builds rows by hand and needs `valid: true` added.

- [ ] **Step 8: Commit**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write \
  src/lib/components/layouts-library.ts \
  src/lib/components/LayoutsLibrary.svelte \
  src/lib/components/mobile/MobileLayoutsSheet.svelte \
  src/tests/layouts-library.test.ts
git add src/lib/components/layouts-library.ts src/lib/components/LayoutsLibrary.svelte src/lib/components/mobile/MobileLayoutsSheet.svelte src/tests/layouts-library.test.ts
git commit -s -m "refactor: make buildLayoutRows catalogue-source agnostic (#3151)"
```

---

### Task 2: Server library store

The reactive catalogue of server layouts. Owns fetching, status, and in-place mutation. No UI, no tab semantics.

**Files:**

- Create: `src/lib/storage/server-library.svelte.ts`
- Test: `src/tests/server-library.test.ts`

**Interfaces:**

- Consumes: `CatalogueEntry` from Task 1 is not needed here; this store speaks `SavedLayoutItem`.
- Produces: `getServerLibrary(): { items: readonly SavedLayoutItem[]; status: ServerLibraryStatus }`, `refreshServerLibrary(): Promise<void>`, `upsertServerLibraryItem(item: SavedLayoutItem): void`, `removeServerLibraryItem(id: string): void`, `resetServerLibrary(): void`, and `type ServerLibraryStatus = "idle" | "loading" | "ready" | "unavailable"`. Tasks 3, 4, and 5 consume these.

**Import direction (do not violate):** this module may import from `./api` and `./availability.svelte`, never from `./manager.svelte`. `manager` imports this store, not the reverse. Catch `PersistenceError` here; do not import `handlePersistenceError`. Importing it would create the manager cycle that `server-base.ts` was deliberately kept a pure module to avoid.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/server-library.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { SavedLayoutItem } from "$lib/storage/api";

vi.mock("$lib/storage/api", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/storage/api")>(
      "$lib/storage/api",
    );
  return { ...actual, listSavedLayouts: vi.fn() };
});
vi.mock("$lib/storage/availability.svelte", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/storage/availability.svelte")
  >("$lib/storage/availability.svelte");
  return { ...actual, initializePersistence: vi.fn(), isApiAvailable: vi.fn() };
});

import { listSavedLayouts } from "$lib/storage/api";
import {
  initializePersistence,
  isApiAvailable,
} from "$lib/storage/availability.svelte";
import {
  getServerLibrary,
  refreshServerLibrary,
  upsertServerLibraryItem,
  removeServerLibraryItem,
  resetServerLibrary,
} from "$lib/storage/server-library.svelte";

function item(overrides: Partial<SavedLayoutItem> = {}): SavedLayoutItem {
  return {
    id: "srv-1",
    name: "Homelab",
    version: "26.7.0",
    updatedAt: "2026-08-01T00:00:00.000Z",
    rackCount: 1,
    deviceCount: 2,
    valid: true,
    ...overrides,
  };
}

describe("server library store", () => {
  beforeEach(() => {
    resetServerLibrary();
    vi.mocked(initializePersistence).mockResolvedValue(true);
    vi.mocked(isApiAvailable).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the server list and reports ready", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("ready");
    expect(getServerLibrary().items.map((i) => i.id)).toEqual(["srv-1"]);
  });

  it("waits for the health check before reading availability", async () => {
    // The panel can mount before the first health check resolves; reading
    // availability early would mark a healthy server unavailable (#3151).
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);

    await refreshServerLibrary();

    expect(initializePersistence).toHaveBeenCalled();
  });

  it("reports unavailable when the API is unreachable", async () => {
    vi.mocked(isApiAvailable).mockReturnValue(false);

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("unavailable");
  });

  it("reports unavailable when the fetch throws", async () => {
    vi.mocked(listSavedLayouts).mockRejectedValue(new Error("network down"));

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("unavailable");
  });

  it("replaces an existing item on upsert and appends an unseen one", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    await refreshServerLibrary();

    upsertServerLibraryItem(item({ name: "Renamed" }));
    upsertServerLibraryItem(item({ id: "srv-2", name: "Second" }));

    expect(getServerLibrary().items.map((i) => i.name)).toEqual([
      "Renamed",
      "Second",
    ]);
  });

  it("drops an item on remove", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([
      item(),
      item({ id: "srv-2" }),
    ]);
    await refreshServerLibrary();

    removeServerLibraryItem("srv-1");

    expect(getServerLibrary().items.map((i) => i.id)).toEqual(["srv-2"]);
  });

  it("keeps an upsert that lands while a refresh is in flight", async () => {
    // A GET issued before a save must not drop the row that save added
    // when it resolves afterwards (#3151).
    let resolveList: (items: SavedLayoutItem[]) => void = () => {};
    vi.mocked(listSavedLayouts).mockReturnValue(
      new Promise<SavedLayoutItem[]>((r) => {
        resolveList = r;
      }),
    );

    const inFlight = refreshServerLibrary();
    upsertServerLibraryItem(item({ id: "srv-new", name: "Created" }));
    resolveList([item()]);
    await inFlight;

    expect(getServerLibrary().items.map((i) => i.id)).toContain("srv-new");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/server-library.test.ts` Expected: FAIL with a module-not-found error for `$lib/storage/server-library.svelte`.

- [ ] **Step 3: Write the store**

Create `src/lib/storage/server-library.svelte.ts`:

```typescript
/**
 * Server-mode layout catalogue (#3151).
 *
 * The Layouts panel lists saved layouts from `workspaceStore.library` in
 * browser mode, which is fed by the localStorage workspace index. Server mode
 * has no such index: its catalogue is whatever `GET /api/layouts` returns. This
 * store holds that list reactively so the panel and the mobile sheet can render
 * it, and so a local save or delete can update it in place.
 *
 * Import direction: `manager` imports this module, never the reverse. Errors
 * are caught here rather than routed through `handlePersistenceError`, which
 * would create a cycle back into the manager.
 */
import { listSavedLayouts, type SavedLayoutItem } from "./api";
import { initializePersistence, isApiAvailable } from "./availability.svelte";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.api;

export type ServerLibraryStatus = "idle" | "loading" | "ready" | "unavailable";

let items = $state<SavedLayoutItem[]>([]);
let status = $state<ServerLibraryStatus>("idle");

// Request-sequence guard. A refresh that replaces the list wholesale must not
// drop rows an upsert recorded while its GET was in flight, so every mutation
// during a fetch is remembered and re-applied when the fetch lands.
let fetchSequence = 0;
let pendingUpserts: SavedLayoutItem[] = [];
let pendingRemovals: string[] = [];
let fetchInFlight = false;

function applyUpsert(list: SavedLayoutItem[], item: SavedLayoutItem) {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    list.push(item);
    return;
  }
  list[index] = item;
}

/** The reactive catalogue. Read inside a `$derived` to track it. */
export function getServerLibrary(): {
  items: readonly SavedLayoutItem[];
  status: ServerLibraryStatus;
} {
  return {
    get items() {
      return items;
    },
    get status() {
      return status;
    },
  };
}

/**
 * Fetch the server's layout list.
 *
 * Awaits `initializePersistence()` (cached and de-duplicated) before reading
 * availability: the panel can mount before the first health check resolves,
 * and reading `apiAvailable` while it is still null would report a healthy
 * server as unavailable.
 */
export async function refreshServerLibrary(): Promise<void> {
  const sequence = ++fetchSequence;
  status = "loading";
  fetchInFlight = true;
  pendingUpserts = [];
  pendingRemovals = [];

  try {
    await initializePersistence();
    if (!isApiAvailable()) {
      if (sequence === fetchSequence) status = "unavailable";
      return;
    }
    const fetched = await listSavedLayouts();
    if (sequence !== fetchSequence) return;

    const merged = [...fetched];
    for (const item of pendingUpserts) applyUpsert(merged, item);
    items = merged.filter((item) => !pendingRemovals.includes(item.id));
    status = "ready";
  } catch (error) {
    log("refreshServerLibrary: failed %O", error);
    if (sequence === fetchSequence) status = "unavailable";
  } finally {
    if (sequence === fetchSequence) {
      fetchInFlight = false;
      pendingUpserts = [];
      pendingRemovals = [];
    }
  }
}

/** Record a layout this client just saved, without a refetch. */
export function upsertServerLibraryItem(item: SavedLayoutItem): void {
  if (fetchInFlight) pendingUpserts.push(item);
  const next = [...items];
  applyUpsert(next, item);
  items = next;
}

/** Drop a layout this client just deleted. */
export function removeServerLibraryItem(id: string): void {
  if (fetchInFlight) pendingRemovals.push(id);
  items = items.filter((item) => item.id !== id);
}

/** Test seam: clear all state. */
export function resetServerLibrary(): void {
  items = [];
  status = "idle";
  fetchSequence = 0;
  fetchInFlight = false;
  pendingUpserts = [];
  pendingRemovals = [];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tests/server-library.test.ts` Expected: PASS, all seven cases.

- [ ] **Step 5: Commit**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write \
  src/lib/storage/server-library.svelte.ts src/tests/server-library.test.ts
git add src/lib/storage/server-library.svelte.ts src/tests/server-library.test.ts
git commit -s -m "feat: add server layout catalogue store (#3151)"
```

---

### Task 3: Manager wiring, save upsert and `abandonWorkingCopy`

Two additions to the persistence manager: successful server saves update the catalogue in place, and the panel gains a way to abandon the working copy before deleting it.

**Files:**

- Modify: `src/lib/storage/manager.svelte.ts` (`finalizeSuccessfulSave` at line 130, plus a new export)
- Modify: `src/lib/storage/index.ts` (re-export the new symbols)
- Test: `src/tests/server-library-save-wiring.test.ts`

**Interfaces:**

- Consumes: `upsertServerLibraryItem` from Task 2.
- Produces: `abandonWorkingCopy(): void`, exported from `manager.svelte.ts` and re-exported from `storage/index.ts`. Task 4 calls it.

Why `abandonWorkingCopy` is needed: deleting the open layout is not just a tab close. The working copy survives in `Rackula:autosave` with a live `serverBaseUpdatedAt`, so the debounced autosave (Effect 2, 2 second debounce) can PUT the layout straight back after the DELETE, and the next reload would reconcile the surviving session as `unknown-to-server` and restore it.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/server-library-save-wiring.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("$lib/storage/server-library.svelte", () => ({
  upsertServerLibraryItem: vi.fn(),
  removeServerLibraryItem: vi.fn(),
  refreshServerLibrary: vi.fn(),
  getServerLibrary: () => ({ items: [], status: "idle" }),
}));

import { upsertServerLibraryItem } from "$lib/storage/server-library.svelte";
import { finalizeSuccessfulSave } from "$lib/storage/manager.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";

describe("save wiring to the server catalogue", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records the saved layout in the catalogue when the server returns a timestamp", () => {
    const ws = getWorkspaceStore();
    ws.clearThenLoad(createLayout("Homelab"));
    const id = ws.activeStore.layout.metadata?.id;

    finalizeSuccessfulSave(true, "2026-08-22T10:00:00.000Z");

    expect(upsertServerLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ id, name: "Homelab", valid: true }),
    );
  });

  it("skips the catalogue update when the server returned no new timestamp", () => {
    const ws = getWorkspaceStore();
    ws.clearThenLoad(createLayout("Homelab"));

    finalizeSuccessfulSave(true, null);

    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/server-library-save-wiring.test.ts` Expected: FAIL. `upsertServerLibraryItem` is never called because the wiring does not exist.

- [ ] **Step 3: Wire the upsert into `finalizeSuccessfulSave`**

In `src/lib/storage/manager.svelte.ts`, add to the imports:

```typescript
import { upsertServerLibraryItem } from "./server-library.svelte";
```

Then, inside `finalizeSuccessfulSave`, immediately after the existing `if (newUpdatedAt) { setServerBaseUpdatedAt(newUpdatedAt); }` block, add:

```typescript
// Keep the server catalogue current without a refetch (#3151). Autosave
// fires every 2 seconds while editing, so invalidating on save would mean
// one GET /api/layouts per save. A null newUpdatedAt means the server
// returned no new timestamp, so there is nothing to record.
if (newUpdatedAt) {
  const saved = layoutStore.layout;
  const savedId = saved.metadata?.id;
  if (savedId) {
    const racks = saved.racks ?? [];
    upsertServerLibraryItem({
      id: savedId,
      name: saved.name,
      version: saved.version,
      updatedAt: newUpdatedAt,
      rackCount: racks.length,
      deviceCount: racks.reduce((sum, rack) => sum + rack.devices.length, 0),
      valid: true,
    });
  }
}
```

`SavedLayoutItem` requires `version`, `valid`, and a non-null `updatedAt`, which is why the null branch is skipped rather than passed through.

- [ ] **Step 4: Add `abandonWorkingCopy`**

In `src/lib/storage/manager.svelte.ts`, add these imports if not already present:

```typescript
import { clearSession } from "./working-copy";
```

Add this exported function next to `flushSessionSave`:

```typescript
/**
 * Drop the working copy without saving it (#3151).
 *
 * Deleting the layout that is currently open must not leave a live working
 * copy behind: the debounced autosave would PUT it straight back after the
 * DELETE, and the next reload would reconcile the surviving session as
 * unknown-to-server and restore the layout the user just deleted.
 *
 * Bumping the schedule id marks any settling save stale so its success cannot
 * clear dirty state or re-record a base. A PUT already on the wire can still
 * reach the server; that sub-second window is accepted rather than adding a
 * save barrier.
 */
export function abandonWorkingCopy(): void {
  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }
  _serverSavePending = false;
  _serverSaveScheduleId++;
  cancelSessionSave();
  clearSession();
  setServerBaseUpdatedAt(null);
}
```

- [ ] **Step 5: Re-export from the storage barrel**

In `src/lib/storage/index.ts`, add `abandonWorkingCopy` to the existing `manager.svelte` export block, and add a new export line for the catalogue store:

```typescript
export {
  getServerLibrary,
  refreshServerLibrary,
  upsertServerLibraryItem,
  removeServerLibraryItem,
  type ServerLibraryStatus,
} from "./server-library.svelte";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/tests/server-library-save-wiring.test.ts` Expected: PASS, both cases.

- [ ] **Step 7: Check for an import cycle**

Run: `npm run check` Expected: no errors. If a cycle warning appears, `server-library.svelte.ts` is importing from `manager.svelte.ts`; remove that import and handle the error locally instead.

- [ ] **Step 8: Commit**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write \
  src/lib/storage/manager.svelte.ts src/lib/storage/index.ts src/tests/server-library-save-wiring.test.ts
git add src/lib/storage/manager.svelte.ts src/lib/storage/index.ts src/tests/server-library-save-wiring.test.ts
git commit -s -m "feat: record server saves in the catalogue and add abandonWorkingCopy (#3151)"
```

---

### Task 4: Desktop Layouts panel, server mode

The panel picks its catalogue by mode, opens server rows through the replace guard, deletes through the API, blocks corrupted rows, and shows an offline notice with recovery.

**Files:**

- Modify: `src/lib/components/LayoutsLibrary.svelte`
- Test: `src/tests/layouts-library-server-mode.test.ts`

**Interfaces:**

- Consumes: `buildLayoutRows` and `CatalogueEntry` from Task 1; `getServerLibrary`, `refreshServerLibrary`, `removeServerLibraryItem` from Task 2; `abandonWorkingCopy` from Task 3.
- Produces: nothing consumed by later tasks. Task 5 mirrors this behaviour on mobile.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/layouts-library-server-mode.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import type { SavedLayoutItem } from "$lib/storage/api";

vi.mock("$lib/storage/availability.svelte", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/storage/availability.svelte")
  >("$lib/storage/availability.svelte");
  return {
    ...actual,
    getStorageMode: vi.fn(() => "server"),
    isApiAvailable: vi.fn(() => true),
    getApiAvailableState: vi.fn(() => true),
    initializePersistence: vi.fn(async () => true),
  };
});
vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
}));
vi.mock("$lib/storage/api", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/storage/api")>(
      "$lib/storage/api",
    );
  return {
    ...actual,
    listSavedLayouts: vi.fn(),
    deleteSavedLayout: vi.fn(async () => undefined),
  };
});

import LayoutsLibrary from "$lib/components/LayoutsLibrary.svelte";
import { listSavedLayouts, deleteSavedLayout } from "$lib/storage/api";
import { loadFromApi } from "$lib/storage/load-pipeline";
import { resetServerLibrary } from "$lib/storage/server-library.svelte";
import { resetWorkspaceStore } from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";

function item(overrides: Partial<SavedLayoutItem> = {}): SavedLayoutItem {
  return {
    id: "srv-1",
    name: "Closet Rack",
    version: "26.7.0",
    updatedAt: "2026-08-01T00:00:00.000Z",
    rackCount: 1,
    deviceCount: 2,
    valid: true,
    ...overrides,
  };
}

describe("Layouts panel in server mode", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetServerLibrary();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the layouts the server returns", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([
      item(),
      item({ id: "srv-2", name: "Office Rack" }),
    ]);

    render(LayoutsLibrary, { props: {} });

    expect(await screen.findByText("Closet Rack")).toBeInTheDocument();
    expect(await screen.findByText("Office Rack")).toBeInTheDocument();
  });

  it("opens a server row through the replace guard", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    await user.click(await screen.findByText("Closet Rack"));

    expect(loadFromApi).toHaveBeenCalledWith("srv-1", expect.anything());
  });

  it("refuses to open a corrupted server row", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([
      item({ name: "Broken Rack", valid: false }),
    ]);
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    await user.click(await screen.findByText("Broken Rack"));

    expect(loadFromApi).not.toHaveBeenCalled();
  });

  it("deletes a server row through the API", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    await screen.findByText("Closet Rack");
    await user.keyboard("{Escape}");

    // Delete is reached through the row's context menu; the panel exposes it
    // as a named menu item, so query by role and name rather than structure.
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("Closet Rack"),
    });
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete/i }));

    expect(deleteSavedLayout).toHaveBeenCalledWith("srv-1");
  });

  it("shows an unavailable notice instead of an empty list when the server is down", async () => {
    vi.mocked(listSavedLayouts).mockRejectedValue(new Error("down"));

    render(LayoutsLibrary, { props: {} });

    expect(await screen.findByText(/cannot reach/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/layouts-library-server-mode.test.ts` Expected: FAIL. The panel still reads `workspaceStore.library`, so no server rows render.

- [ ] **Step 3: Add the mode-aware catalogue and refresh effect**

In `src/lib/components/LayoutsLibrary.svelte`, add to the script imports:

```typescript
import {
  getStorageMode,
  getApiAvailableState,
} from "$lib/storage/availability.svelte";
import {
  getServerLibrary,
  refreshServerLibrary,
  removeServerLibraryItem,
} from "$lib/storage/server-library.svelte";
import { abandonWorkingCopy } from "$lib/storage/manager.svelte";
import { deleteSavedLayout } from "$lib/storage/api";
import { loadFromApi } from "$lib/storage/load-pipeline";
import { runOpenFileFlow } from "$lib/actions/open-file-trigger";
import type { CatalogueEntry } from "./layouts-library";
```

Replace the `rows` derivation added in Task 1 with:

```typescript
const serverMode = getStorageMode() === "server";
const serverLibrary = getServerLibrary();

// Server mode has no localStorage workspace index, so its catalogue is the
// server's list; browser mode keeps the workspace library (#3151).
const catalogue = $derived<CatalogueEntry[]>(
  serverMode
    ? serverLibrary.items.map((item) => ({
        id: item.id,
        name: item.name,
        rackCount: item.rackCount,
        deviceCount: item.deviceCount,
        valid: item.valid,
      }))
    : Object.entries(workspaceStore.library).map(([id, entry]) => ({
        id,
        name: entry.name,
      })),
);

const rows = $derived(
  buildLayoutRows(
    workspaceStore.tabs,
    workspaceStore.activeId,
    catalogue,
    // Server mode never sets tab.layoutId, and a New-layout tab keeps the id
    // createLayout generated even after loadFromApi replaces its contents, so
    // the live body is the only correct identity there (#3151).
    serverMode ? (t) => t.store.layout.metadata?.id : (t) => t.layoutId,
  ),
);

// The panel is mounted only while its sidebar tab is selected, so mount is
// the panel-open hook. Re-running when availability flips true is what makes
// a recovered server repopulate the list: effect 3 in the manager only marks
// the API available, it refills no list.
$effect(() => {
  if (!serverMode) return;
  getApiAvailableState();
  void refreshServerLibrary();
});
```

- [ ] **Step 4: Route open, delete, and the disabled actions**

Replace `activateRow` so a closed row in server mode goes through the guard, and a corrupted row is refused before the guard runs:

```typescript
function activateRow(row: LayoutRow) {
  if (row.isOpen && row.tabId) {
    workspaceStore.switchTo(row.tabId);
    return;
  }
  if (!row.layoutId) return;
  if (!serverMode) {
    workspaceStore.openFromLibrary(row.layoutId);
    return;
  }
  if (!row.valid) {
    toastStore.showToast(
      `"${row.name}" is corrupted and cannot be opened`,
      "error",
    );
    return;
  }
  const layoutId = row.layoutId;
  // Opening replaces the working copy, the same guard the Open dialog uses.
  runOpenFileFlow(async (guarded) => {
    await loadFromApi(
      layoutId,
      guarded ? { successMessage: "Previous layout kept in Layouts" } : {},
    );
  });
}
```

Replace `confirmDelete` so server deletes hit the API and abandon the working copy first:

```typescript
async function confirmDelete() {
  const row = rowToDelete;
  deleteConfirmOpen = false;
  rowToDelete = null;
  if (!row) return;

  if (!serverMode) {
    if (row.layoutId) {
      workspaceStore.deleteLayout(row.layoutId);
    } else if (row.tabId) {
      workspaceStore.closeTab(row.tabId);
    }
    toastStore.showToast(`Deleted "${row.name}"`, "info");
    return;
  }

  if (!row.layoutId) {
    if (row.tabId) workspaceStore.closeTab(row.tabId);
    return;
  }

  // Deleting the open copy must drop the working copy first, or the
  // debounced autosave PUTs it straight back after the DELETE (#3151).
  if (row.isOpen) abandonWorkingCopy();
  try {
    await deleteSavedLayout(row.layoutId);
    removeServerLibraryItem(row.layoutId);
    if (row.tabId) workspaceStore.closeTab(row.tabId);
    toastStore.showToast(`Deleted "${row.name}"`, "info");
  } catch {
    toastStore.showToast(`Could not delete "${row.name}"`, "error");
  }
}
```

In the markup, gate the three body-reading actions off closed server rows by passing `undefined`, which `LayoutContextMenu` already treats as "do not render this item":

```svelte
      <LayoutContextMenu
        onopen={() => activateRow(row)}
        onrename={serverMode && !row.isOpen ? undefined : () => openRename(row)}
        onduplicate={serverMode && !row.isOpen
          ? undefined
          : () => duplicateLayout(row)}
        onexport={onexport && !(serverMode && !row.isOpen)
          ? () => exportLayout(row)
          : undefined}
        ondelete={() => initiateDelete(row)}
      >
```

- [ ] **Step 5: Add the offline notice**

Replace the existing empty state block so an unreachable server explains itself instead of rendering as "No saved layouts":

```svelte
{#if serverMode && serverLibrary.status === "unavailable"}
  <div class="empty-state">
    <p class="empty-message">Cannot reach {getServerInstanceLabel()}</p>
    <p class="empty-hint">Your open layout is safe. Retry to list the rest.</p>
    <Button variant="secondary" onclick={() => void refreshServerLibrary()}>
      Retry
    </Button>
  </div>
{:else if rows.length === 0}
  <div class="empty-state">
    <p class="empty-message">No saved layouts</p>
    <p class="empty-hint">Create a layout to get started</p>
  </div>
{/if}
```

Add `getServerInstanceLabel` to the `$lib/storage/api` import.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/tests/layouts-library-server-mode.test.ts` Expected: PASS, all five cases.

- [ ] **Step 7: Confirm browser mode did not regress**

Run: `npx vitest run src/tests/layouts-library.test.ts` Expected: PASS.

- [ ] **Step 8: Commit**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write \
  src/lib/components/LayoutsLibrary.svelte src/tests/layouts-library-server-mode.test.ts
git add src/lib/components/LayoutsLibrary.svelte src/tests/layouts-library-server-mode.test.ts
git commit -s -m "fix: list server layouts in the Layouts panel (#3151)"
```

---

### Task 5: Mobile layouts sheet, server mode

The mobile sheet has the same defect plus a worse one: its closed-row activation opens an unreadable empty tab in server mode.

**Files:**

- Modify: `src/lib/components/mobile/MobileLayoutsSheet.svelte`
- Test: `src/tests/mobile-layouts-sheet-server-mode.test.ts`

**Interfaces:**

- Consumes: the same symbols as Task 4.
- Produces: nothing consumed by later tasks.

The bug being fixed here: `activateRow` sends any row with a `layoutId` to `workspaceStore.openFromLibrary`. In server mode `loadBodyFn` is null, so that falls to the unreadable-shell branch and opens an empty tab flagged unreadable, with no replace guard and no server fetch.

- [ ] **Step 1: Write the failing test**

Create `src/tests/mobile-layouts-sheet-server-mode.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import type { SavedLayoutItem } from "$lib/storage/api";

vi.mock("$lib/storage/availability.svelte", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/storage/availability.svelte")
  >("$lib/storage/availability.svelte");
  return {
    ...actual,
    getStorageMode: vi.fn(() => "server"),
    isApiAvailable: vi.fn(() => true),
    getApiAvailableState: vi.fn(() => true),
    initializePersistence: vi.fn(async () => true),
  };
});
vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
}));
vi.mock("$lib/storage/api", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/storage/api")>(
      "$lib/storage/api",
    );
  return { ...actual, listSavedLayouts: vi.fn(), deleteSavedLayout: vi.fn() };
});

import MobileLayoutsSheet from "$lib/components/mobile/MobileLayoutsSheet.svelte";
import { listSavedLayouts } from "$lib/storage/api";
import { loadFromApi } from "$lib/storage/load-pipeline";
import { resetServerLibrary } from "$lib/storage/server-library.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";

function item(overrides: Partial<SavedLayoutItem> = {}): SavedLayoutItem {
  return {
    id: "srv-1",
    name: "Closet Rack",
    version: "26.7.0",
    updatedAt: "2026-08-01T00:00:00.000Z",
    rackCount: 1,
    deviceCount: 2,
    valid: true,
    ...overrides,
  };
}

describe("mobile layouts sheet in server mode", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetServerLibrary();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the layouts the server returns", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);

    render(MobileLayoutsSheet, { props: {} });

    expect(await screen.findByText("Closet Rack")).toBeInTheDocument();
  });

  it("loads a server row instead of opening an unreadable shell tab", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    const user = userEvent.setup();
    const ws = getWorkspaceStore();
    const tabsBefore = ws.tabs.length;

    render(MobileLayoutsSheet, { props: {} });
    await user.click(await screen.findByText("Closet Rack"));

    expect(loadFromApi).toHaveBeenCalledWith("srv-1", expect.anything());
    expect(ws.tabs.every((t) => !t.unreadable)).toBe(true);
    expect(ws.tabs.length).toBe(tabsBefore);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/tests/mobile-layouts-sheet-server-mode.test.ts` Expected: FAIL. No server rows render, and activation would call `openFromLibrary`.

- [ ] **Step 3: Apply the same catalogue and activation changes**

In `src/lib/components/mobile/MobileLayoutsSheet.svelte`, add these imports to the script block. The sheet has no toast store today, so `getToastStore` is a new import here:

```typescript
import {
  getStorageMode,
  getApiAvailableState,
} from "$lib/storage/availability.svelte";
import {
  getServerLibrary,
  refreshServerLibrary,
} from "$lib/storage/server-library.svelte";
import { loadFromApi } from "$lib/storage/load-pipeline";
import { runOpenFileFlow } from "$lib/actions/open-file-trigger";
import { getToastStore } from "$lib/stores/toast.svelte";
import type { CatalogueEntry } from "../layouts-library";
```

Add the toast store next to the existing `const workspaceStore = getWorkspaceStore();`:

```typescript
const toastStore = getToastStore();
```

Replace the `rows` derivation with the mode-aware catalogue, rows, and refresh effect:

```typescript
const serverMode = getStorageMode() === "server";
const serverLibrary = getServerLibrary();

// Server mode has no localStorage workspace index, so its catalogue is the
// server's list; browser mode keeps the workspace library (#3151).
const catalogue = $derived<CatalogueEntry[]>(
  serverMode
    ? serverLibrary.items.map((item) => ({
        id: item.id,
        name: item.name,
        rackCount: item.rackCount,
        deviceCount: item.deviceCount,
        valid: item.valid,
      }))
    : Object.entries(workspaceStore.library).map(([id, entry]) => ({
        id,
        name: entry.name,
      })),
);

const rows = $derived(
  buildLayoutRows(
    workspaceStore.tabs,
    workspaceStore.activeId,
    catalogue,
    // Server mode never sets tab.layoutId, and a New-layout tab keeps the id
    // createLayout generated even after loadFromApi replaces its contents, so
    // the live body is the only correct identity there (#3151).
    serverMode ? (t) => t.store.layout.metadata?.id : (t) => t.layoutId,
  ),
);

// The sheet mounts when it opens, so mount is the open hook. Re-running when
// availability flips true is what makes a recovered server repopulate the
// list: effect 3 in the manager only marks the API available, it refills no
// list.
$effect(() => {
  if (!serverMode) return;
  getApiAvailableState();
  void refreshServerLibrary();
});
```

Replace `activateRow`:

```typescript
function activateRow(row: LayoutRow) {
  if (row.isOpen && row.tabId) {
    workspaceStore.switchTo(row.tabId);
    onclose?.();
    return;
  }
  if (!row.layoutId) return;
  if (!serverMode) {
    workspaceStore.openFromLibrary(row.layoutId);
    onclose?.();
    return;
  }
  if (!row.valid) {
    toastStore.showToast(
      `"${row.name}" is corrupted and cannot be opened`,
      "error",
    );
    return;
  }
  const layoutId = row.layoutId;
  // Dismiss first, then run the guard: the confirm dialog must not be
  // covered by a sheet that is still closing.
  onclose?.();
  runOpenFileFlow(async (guarded) => {
    await loadFromApi(
      layoutId,
      guarded ? { successMessage: "Previous layout kept in Layouts" } : {},
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/tests/mobile-layouts-sheet-server-mode.test.ts` Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write \
  src/lib/components/mobile/MobileLayoutsSheet.svelte src/tests/mobile-layouts-sheet-server-mode.test.ts
git add src/lib/components/mobile/MobileLayoutsSheet.svelte src/tests/mobile-layouts-sheet-server-mode.test.ts
git commit -s -m "fix: list server layouts in the mobile layouts sheet (#3151)"
```

---

### Task 6: Full verification and stale-comment cleanup

Removes the false comment that sent the reporter to the Layouts tab, and runs every gate before the PR.

**Files:**

- Modify: `src/App.svelte:366-367`

**Interfaces:**

- Consumes: everything from Tasks 1 to 5.
- Produces: a verified branch ready for a PR.

- [ ] **Step 1: Correct the stale comment**

The comment at `src/App.svelte:366-367` currently reads "The server library is reachable through the sidebar Layouts tab and the app menu". That was false until this change. It is now true, so keep it but make it specific:

```typescript
// No local session: open straight to the canvas empty state. The server
// library is listed in the sidebar Layouts tab, which fetches it on open
// (#3151), and is also reachable through the app menu; there is no
// blocking modal while the health check resolves.
```

- [ ] **Step 2: Lint**

Run: `npm run lint` Expected: no errors. The testing-rule ESLint checks run here; a failure naming `querySelector`, `toHaveClass`, or `toHaveLength` means a test needs rewriting to assert behaviour instead.

- [ ] **Step 3: Typecheck**

Run: `npm run check` Expected: no errors. This is the gate the `validate` script does not include, so run it explicitly.

- [ ] **Step 4: Full unit suite**

Run: `VITEST_MAX_WORKERS=2 npm run test:run` Expected: PASS. The worker cap avoids the memory pressure the suite has hit before.

- [ ] **Step 5: Production build**

Run: `npm run build` Expected: success.

- [ ] **Step 6: Commit and push**

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --write src/App.svelte
git add src/App.svelte
git commit -s -m "docs: correct the server-library reachability comment (#3151)"
git push -u origin fix/3151-server-layouts-panel
```

- [ ] **Step 7: Open the PR**

```bash
gh pr create --fill --title "fix: list server layouts in the Layouts panel (#3151)" --body "$(cat <<'BODY'
Closes #3151.

In server storage mode the Layouts panel never consumed `GET /api/layouts`, so it listed only the current working copy. A fresh browser or a second device showed none of the saved layouts.

Design: `docs/superpowers/specs/2026-08-22-server-mode-layouts-panel-design.md`

- New `server-library.svelte.ts` holds the server catalogue reactively
- `buildLayoutRows` takes a catalogue array plus an explicit `resolveOpenId`, because server mode never sets `tab.layoutId`
- Desktop panel and mobile sheet select their source by storage mode; server rows open through the existing replace guard and delete through the API
- Deleting the open copy abandons the working copy first, so autosave cannot PUT it back
- Corrupted layouts are refused before the guard; an unreachable server shows a notice instead of an empty list

Scope note: server mode keeps its single-working-copy model. Unifying it onto the multi-layout workspace is deliberately out of scope.
BODY
)"
```

- [ ] **Step 8: Wait for both review bots**

Run: `gh pr checks <number> --watch`

Do not merge until CodeRabbit has approved. CodeAnt reviews as a PR comment rather than a status check, and posts inline findings after its "finished reviewing" comment, so read the inline comments too. Address findings in follow-up commits and wait for re-review.

## Notes for the implementer

- Server mode is single-working-copy by design. If a change starts to need per-layout `serverBaseUpdatedAt` or per-tab saves, stop: that is out of scope and belongs to a separate issue.
- Closed server rows always show the hatched placeholder thumbnail, because `previewFor` reads `workspaceStore.peekLibraryBody`, which returns null in server mode. This is intentional. Do not "fix" it by fetching a body per row: that is one GET per listed layout.
- Duplicating an open row still routes through `openTab`, which creates a second server-mode tab. That hazard is pre-existing and out of scope here.
