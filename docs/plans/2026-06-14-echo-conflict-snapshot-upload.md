# Echo-Based Conflict Handling and Snapshot Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's mtime-vs-browser-clock startup comparison with the server-echoed `updatedAt` model, keep the local working copy after server saves, and POST a losing local copy to the server snapshot store before discarding it.

**Architecture:** The localStorage session blob gains a `serverUpdatedAt` field (the server version the copy is based on). The API client sends it as the `X-Rackula-Updated-At` header on PUT and reads the server's echo back. A pure `reconcileSession()` decision function, matched by layout UUID, decides at startup whether to keep the local copy or load the server copy, and whether to snapshot the loser first. `clearSession()` is no longer called after a successful server save.

**Tech Stack:** TypeScript (strict), Svelte 5 runes, Zod, js-yaml, Vitest. Server contract is already implemented and tested in `api/src/snapshots.test.ts`.

---

## Server wire contract (already implemented; the frontend must match)

- `PUT /layouts/:uuid` request: optional header `X-Rackula-Updated-At` = the client's last-known `updatedAt`. Body: `text/yaml`, max 1 MB (413 `{error:"Layout data too large"}`).
- `PUT /layouts/:uuid` response: 201 (new) / 200 (update), JSON `{ id, updatedAt, message }`, plus response header `X-Rackula-Updated-At`. On echo mismatch the server snapshots the existing copy before writing. Never rejects (last-write-wins).
- `POST /layouts/:uuid/snapshots` request: body `text/yaml` (≤1 MB). Response: 201 `{ filename, message }`; **404 `{error:"Layout not found"}`** when the layout folder does not exist; 400 empty/invalid YAML; 413 too large. Auth-gated like PUT. Keeps the 5 most recent.
- `GET /layouts` response: `{ layouts: [{ id, name, version, updatedAt, rackCount, deviceCount, valid }] }`.
- `GET /layouts/:uuid` response: `text/yaml` body, header `X-Rackula-Updated-At`.
- Server parses YAML with `js-yaml` `JSON_SCHEMA`.

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/lib/storage/api.ts` | API client | PUT sends + returns echo (Zod-validated); add `uploadSnapshot()`; cap + echo on `loadSavedLayout` |
| `src/lib/utils/yaml.ts` | YAML parse | restrict `parseYaml` to `JSON_SCHEMA` |
| `src/lib/storage/working-copy.ts` | session blob | add `serverUpdatedAt`; `saveSession` persists it |
| `src/lib/storage/reconcile.ts` (new) | pure reconciliation decision | `reconcileSession()` state machine |
| `src/lib/storage/manager.svelte.ts` | save orchestration | hold `_serverBaseUpdatedAt`; keep copy after save; thread echo |
| `src/lib/storage/load-pipeline.ts` / `index.ts` | load sink | set base from loaded echo |
| `src/App.svelte` | startup reconciliation | use `reconcileSession()`; snapshot loser; toasts |

## Design decisions (confirm before execution)

1. **UUID-matched reconciliation.** Today reconciliation compares the local session against the single most-recent server layout regardless of identity. AC8 ("a working copy unknown to the server must be re-established via PUT, not shadowed by the server list") requires matching the server layout by the local copy's `metadata.id`. This is a deliberate behaviour change.
2. **Losing-copy snapshot is structure-only.** At startup the user image blobs are not yet loaded, so the snapshot POSTed for a losing local copy serialises the layout without embedded images. Image blobs remain in IndexedDB (not lost); only the snapshot YAML omits them. Acceptable for a v1 safety net.
3. **Load-response cap = 1 MB**, matching the server write cap (a server layout cannot exceed it). Implemented as a local constant in `api.ts`.

---

## Task 1: PUT sends and returns the server echo (Zod-validated)

**Files:**
- Modify: `src/lib/storage/api.ts` (`saveLayoutToServer`, lines 313-380; schemas near 62-77)
- Test: `src/tests/persistence-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/tests/persistence-api.test.ts` (follow the existing `fetch`-mock pattern in that file):

```typescript
import { saveLayoutToServer } from "$lib/storage/api";
// ... existing imports + setApiAvailable(true) in beforeEach ...

it("sends the last-known updatedAt as X-Rackula-Updated-At and returns the echo", async () => {
  const layout = { name: "L", racks: [], metadata: { id: "11111111-1111-4111-8111-111111111111" } };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-06-14T10:00:00.000Z", message: "Layout updated" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await saveLayoutToServer(layout as never, new Map(), "2026-06-14T09:00:00.000Z");

  expect(result).toEqual({ id: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-06-14T10:00:00.000Z" });
  const headers = new Headers(fetchMock.mock.calls[0][1].headers);
  expect(headers.get("X-Rackula-Updated-At")).toBe("2026-06-14T09:00:00.000Z");
});

it("omits X-Rackula-Updated-At when no base updatedAt is known", async () => {
  const layout = { name: "L", racks: [], metadata: { id: "11111111-1111-4111-8111-111111111111" } };
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-06-14T10:00:00.000Z" }), { status: 201, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await saveLayoutToServer(layout as never, new Map(), null);

  const headers = new Headers(fetchMock.mock.calls[0][1].headers);
  expect(headers.has("X-Rackula-Updated-At")).toBe(false);
});

it("rejects a save response missing updatedAt", async () => {
  const layout = { name: "L", racks: [], metadata: { id: "11111111-1111-4111-8111-111111111111" } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }), { status: 200, headers: { "Content-Type": "application/json" } }),
  ));
  await expect(saveLayoutToServer(layout as never, new Map(), null)).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: FAIL (saveLayoutToServer takes 2 args, returns a string, sends no echo header).

- [ ] **Step 3: Implement**

In `src/lib/storage/api.ts`, add a schema and result type near the other schemas (after line 77):

```typescript
const SaveLayoutResponseSchema = z.object({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
});

export interface SaveLayoutResult {
  id: string;
  updatedAt: string;
}
```

Change `saveLayoutToServer` signature and body (lines 313-380):

```typescript
export async function saveLayoutToServer(
  layout: Layout,
  userImages: ImageStoreMap,
  lastKnownUpdatedAt: string | null = null,
): Promise<SaveLayoutResult> {
  // ... unchanged up to building yamlContent and url ...

  const headers: Record<string, string> = { "Content-Type": "text/yaml" };
  if (lastKnownUpdatedAt) {
    headers["X-Rackula-Updated-At"] = lastKnownUpdatedAt;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: yamlContent,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    // ... unchanged error handling ...
  }

  try {
    const raw: unknown = await response.json();
    const { id, updatedAt } = SaveLayoutResponseSchema.parse(raw);
    log("saveLayoutToServer: saved uuid=%s updatedAt=%s", id, updatedAt);
    return { id, updatedAt };
  } catch (error) {
    log("saveLayoutToServer: invalid save response %O", error);
    throw new PersistenceError("Invalid response from API server");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: PASS. (Existing callers in `manager.svelte.ts` now mistype; fixed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/api.ts src/tests/persistence-api.test.ts
git commit -m "feat: PUT sends and returns the server updatedAt echo (#2041)"
```

---

## Task 2: `uploadSnapshot()` (keep the copy on any failure)

**Files:**
- Modify: `src/lib/storage/api.ts`
- Test: `src/tests/persistence-api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { uploadSnapshot } from "$lib/storage/api";

it("uploadSnapshot returns true on 201", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ filename: "l~20260614-100000.yaml", message: "Snapshot saved" }), { status: 201, headers: { "Content-Type": "application/json" } }),
  ));
  expect(await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n")).toBe(true);
});

it("uploadSnapshot returns false on 404 (layout unknown)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Layout not found" }), { status: 404 })));
  expect(await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n")).toBe(false);
});

it("uploadSnapshot returns false when fetch rejects", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  expect(await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: FAIL (`uploadSnapshot` is not exported).

- [ ] **Step 3: Implement**

Add to `src/lib/storage/api.ts`:

```typescript
/**
 * Upload a losing local copy to the server snapshot store before discarding it.
 * Returns true only when the snapshot was stored. Any failure (404 unknown
 * layout, network error, non-2xx) returns false so the caller keeps the copy.
 */
export async function uploadSnapshot(
  uuid: string,
  yamlContent: string,
): Promise<boolean> {
  if (!isApiAvailable()) return false;
  const url = `${API_BASE_URL}/layouts/${encodeURIComponent(uuid)}/snapshots`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/yaml" },
      body: yamlContent,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      log("uploadSnapshot: failed uuid=%s status=%d", uuid, response.status);
      return false;
    }
    return true;
  } catch (error) {
    log("uploadSnapshot: error uuid=%s %O", uuid, error);
    return false;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/api.ts src/tests/persistence-api.test.ts
git commit -m "feat: add uploadSnapshot, keep copy on any failure (#2041)"
```

---

## Task 3: Cap the load response and return its echo

**Files:**
- Modify: `src/lib/storage/api.ts` (`loadSavedLayout`, lines 254-305)
- Test: `src/tests/persistence-api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { loadSavedLayout } from "$lib/storage/api";

it("loadSavedLayout rejects an oversized response", async () => {
  const huge = "a".repeat(1024 * 1024 + 1);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(huge, { status: 200, headers: { "Content-Type": "text/yaml" } }),
  ));
  await expect(loadSavedLayout("11111111-1111-4111-8111-111111111111")).rejects.toThrow(/too large/i);
});

it("loadSavedLayout returns the X-Rackula-Updated-At echo", async () => {
  const yaml = "name: L\nversion: 1.0.0\nracks: []\n";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(yaml, { status: 200, headers: { "Content-Type": "text/yaml", "X-Rackula-Updated-At": "2026-06-14T10:00:00.000Z" } }),
  ));
  const result = await loadSavedLayout("11111111-1111-4111-8111-111111111111");
  expect(result.updatedAt).toBe("2026-06-14T10:00:00.000Z");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: FAIL (no cap; return shape has no `updatedAt`).

- [ ] **Step 3: Implement**

In `src/lib/storage/api.ts`, add a constant near `API_TIMEOUT_MS`:

```typescript
/** Max bytes accepted for a layout GET, matching the server's 1MB PUT cap. */
const MAX_LAYOUT_RESPONSE_BYTES = 1024 * 1024;
```

Update `loadSavedLayout` return type and body (after the `!response.ok` block):

```typescript
export async function loadSavedLayout(uuid: string): Promise<{
  layout: Layout;
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
  updatedAt: string | null;
}> {
  // ... unchanged through the !response.ok handling ...

  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_LAYOUT_RESPONSE_BYTES) {
    throw new PersistenceError("Layout data too large");
  }

  const yamlContent = await response.text();
  if (new TextEncoder().encode(yamlContent).length > MAX_LAYOUT_RESPONSE_BYTES) {
    throw new PersistenceError("Layout data too large");
  }

  const updatedAt = response.headers.get("X-Rackula-Updated-At");
  try {
    const { layout, images, failedImagesCount, failedKeys } =
      await parseLayoutYamlWithImages(yamlContent);
    return { layout, images, failedImagesCount, failedKeys, updatedAt };
  } catch (error) {
    log("loadSavedLayout: failed to parse uuid=%s %O", uuid, error);
    throw new PersistenceError("Layout data is corrupted - could not parse");
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/persistence-api.test.ts`
Expected: PASS. (Callers consuming `loadSavedLayout` already destructure a subset; the extra `updatedAt` is additive. `App.svelte` and `load-pipeline.ts` are updated in Tasks 6-7.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/api.ts src/tests/persistence-api.test.ts
git commit -m "feat: cap layout load size and surface the updatedAt echo (#2041)"
```

---

## Task 4: Restrict YAML parsing to JSON_SCHEMA

**Files:**
- Modify: `src/lib/utils/yaml.ts` (`parseYaml`, lines 73-75)
- Test: `src/tests/yaml.test.ts` (or the nearest existing yaml test; create the case there)

- [ ] **Step 1: Write the failing test**

In the yaml test file:

```typescript
import { parseYaml, parseLayoutYaml } from "$lib/utils/yaml";

it("rejects non-JSON YAML tags (matches the server JSON_SCHEMA)", async () => {
  await expect(parseYaml("danger: !!js/function 'function(){}'")).rejects.toThrow();
});

it("still parses a plain layout YAML document", async () => {
  const layout = await parseLayoutYaml("name: L\nversion: 1.0.0\nracks: []\n");
  expect(layout.name).toBe("L");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/yaml.test.ts`
Expected: FAIL on the first case (DEFAULT_SCHEMA tolerates the tag).

- [ ] **Step 3: Implement**

In `src/lib/utils/yaml.ts` change `parseYaml` (line 74-75):

```typescript
export async function parseYaml<T = unknown>(yamlString: string): Promise<T> {
  const yaml = await getYaml();
  return yaml.load(yamlString, { schema: yaml.JSON_SCHEMA }) as T;
}
```

- [ ] **Step 4: Run to verify it passes, and the wider suite still parses**

Run: `npm run test:run -- src/tests/yaml.test.ts`
Then run the parse-adjacent suites: `npm run test:run -- src/tests/archive-format.test.ts src/tests/netbox`
Expected: PASS. If a NetBox/import fixture relies on a non-JSON tag, narrow the change to `parseLayoutYaml`/`parseLayoutYamlWithImages` by threading a `schema` arg instead of changing `parseYaml` globally, and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/yaml.ts src/tests/yaml.test.ts
git commit -m "feat: parse layout YAML with JSON_SCHEMA to match the server (#2041)"
```

---

## Task 5: Session blob stores `serverUpdatedAt`

**Files:**
- Modify: `src/lib/storage/working-copy.ts` (`SessionData` 19-25, `SessionLoadResult` 30-37, `saveSession` 128-148, `loadSessionWithTimestamp` 177-205)
- Test: `src/tests/session-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { saveSession, loadSessionWithTimestamp } from "$lib/storage/working-copy";
import { createTestLayout } from "./factories"; // if present; else inline a minimal layout

it("round-trips serverUpdatedAt through the session blob", () => {
  const layout = { name: "L", version: "1.0.0", racks: [] } as never;
  saveSession(layout, { changesSinceExport: 0, hasEverExported: false }, "2026-06-14T10:00:00.000Z");
  const loaded = loadSessionWithTimestamp();
  expect(loaded?.serverUpdatedAt).toBe("2026-06-14T10:00:00.000Z");
});

it("defaults serverUpdatedAt to null when not provided", () => {
  const layout = { name: "L", version: "1.0.0", racks: [] } as never;
  saveSession(layout, { changesSinceExport: 0, hasEverExported: false });
  expect(loadSessionWithTimestamp()?.serverUpdatedAt).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/session-storage.test.ts`
Expected: FAIL (`serverUpdatedAt` absent; `saveSession` takes 2 args).

- [ ] **Step 3: Implement**

In `src/lib/storage/working-copy.ts`:

```typescript
interface SessionData {
  layout: Layout;
  savedAt: string;
  serverUpdatedAt: string | null; // server version this copy is based on
  changesSinceExport: number;
  hasEverExported: boolean;
  storageMode: StorageMode;
}

export interface SessionLoadResult {
  layout: Layout;
  savedAt: string | null;
  serverUpdatedAt: string | null;
  changesSinceExport: number;
  hasEverExported: boolean;
  storageMode: StorageMode;
}

export function saveSession(
  layout: Layout,
  backup: BackupState,
  serverUpdatedAt: string | null = null,
): boolean {
  try {
    const sessionData: SessionData = {
      layout,
      savedAt: new Date().toISOString(),
      serverUpdatedAt,
      changesSinceExport: backup.changesSinceExport,
      hasEverExported: backup.hasEverExported,
      storageMode: getStorageMode(),
    };
    // ... unchanged serialize/save ...
  } /* ... unchanged catch ... */
}
```

In `loadSessionWithTimestamp`, in the new-format branch return (around line 194), add:

```typescript
      return {
        layout,
        savedAt: obj.savedAt as string,
        serverUpdatedAt:
          typeof obj.serverUpdatedAt === "string" ? obj.serverUpdatedAt : null,
        // ... existing fields ...
      };
```

And in the legacy-format return (around line 210) add `serverUpdatedAt: null,`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/session-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/working-copy.ts src/tests/session-storage.test.ts
git commit -m "feat: store the server updatedAt base in the session blob (#2041)"
```

---

## Task 6: Pure `reconcileSession()` decision function

**Files:**
- Create: `src/lib/storage/reconcile.ts`
- Test: `src/tests/reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { reconcileSession } from "$lib/storage/reconcile";
import type { SavedLayoutItem } from "$lib/storage/api";

const server = (over: Partial<SavedLayoutItem> = {}): SavedLayoutItem => ({
  id: "AAAA1111-1111-4111-8111-111111111111", name: "L", version: "1.0.0",
  updatedAt: "2026-06-14T10:00:00.000Z", rackCount: 1, deviceCount: 0, valid: true, ...over,
});

it("restores local when the working copy UUID is unknown to the server", () => {
  const action = reconcileSession({ localUuid: "BBBB2222-2222-4222-8222-222222222222", localSavedAt: "2026-06-14T11:00:00.000Z", localServerUpdatedAt: null, serverLayouts: [server()] });
  expect(action).toEqual({ kind: "restore-local", reason: "unknown-to-server" });
});

it("restores local (ahead) when the base matches the server version", () => {
  const action = reconcileSession({ localUuid: server().id, localSavedAt: "2026-06-14T11:00:00.000Z", localServerUpdatedAt: "2026-06-14T10:00:00.000Z", serverLayouts: [server()] });
  expect(action).toEqual({ kind: "restore-local", reason: "ahead" });
});

it("loads server and snapshots the loser when diverged and the server is newer", () => {
  const action = reconcileSession({ localUuid: server().id, localSavedAt: "2026-06-14T09:00:00.000Z", localServerUpdatedAt: "2026-06-14T08:00:00.000Z", serverLayouts: [server({ updatedAt: "2026-06-14T10:00:00.000Z" })] });
  expect(action).toEqual({ kind: "load-server", server: server({ updatedAt: "2026-06-14T10:00:00.000Z" }), snapshotLocalUuid: server().id });
});

it("restores local when diverged but the local copy is newer", () => {
  const action = reconcileSession({ localUuid: server().id, localSavedAt: "2026-06-14T12:00:00.000Z", localServerUpdatedAt: "2026-06-14T08:00:00.000Z", serverLayouts: [server({ updatedAt: "2026-06-14T10:00:00.000Z" })] });
  expect(action).toEqual({ kind: "restore-local", reason: "local-newer" });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/reconcile.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement**

Create `src/lib/storage/reconcile.ts`:

```typescript
import type { SavedLayoutItem } from "./api";
import { isServerNewer } from "./working-copy";

export type ReconcileAction =
  | { kind: "restore-local"; reason: "ahead" | "unknown-to-server" | "local-newer" }
  | { kind: "load-server"; server: SavedLayoutItem; snapshotLocalUuid: string | null };

/**
 * Decide how to reconcile the local working copy with the server, matched by
 * layout UUID and the server-echoed updatedAt the copy is based on.
 *
 * - No matching server layout: the copy is unknown to the server; keep it
 *   (autosave re-establishes it via PUT).
 * - Base matches the server version: local edits are simply ahead; keep local.
 * - Diverged (base differs, or no base recorded): last-write-wins by recency.
 *   When the server is newer, load it and snapshot the losing local copy first.
 */
export function reconcileSession(args: {
  localUuid: string | null;
  localSavedAt: string | null;
  localServerUpdatedAt: string | null;
  serverLayouts: SavedLayoutItem[];
}): ReconcileAction {
  const { localUuid, localSavedAt, localServerUpdatedAt, serverLayouts } = args;

  const match = localUuid
    ? serverLayouts.find((l) => l.id === localUuid)
    : undefined;

  if (!match) {
    return { kind: "restore-local", reason: "unknown-to-server" };
  }

  if (localServerUpdatedAt !== null && localServerUpdatedAt === match.updatedAt) {
    return { kind: "restore-local", reason: "ahead" };
  }

  if (isServerNewer(localSavedAt, match.updatedAt)) {
    return { kind: "load-server", server: match, snapshotLocalUuid: localUuid };
  }
  return { kind: "restore-local", reason: "local-newer" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/reconcile.ts src/tests/reconcile.test.ts
git commit -m "feat: add UUID-matched echo reconciliation decision (#2041)"
```

---

## Task 7: Manager keeps the working copy and threads the echo

**Files:**
- Modify: `src/lib/storage/manager.svelte.ts` (state near 29-46; `finalizeSuccessfulSave` 113-128; `handleSaveToServer` 237-261; Effect 1 328-353; Effect 2 356-396; `flushSessionSave` 310-319)
- Modify: `src/lib/storage/load-pipeline.ts` + `index.ts` (set base after a server load)
- Test: `src/tests/persistence-manager-autosave.test.ts`

- [ ] **Step 1: Write the failing test**

Update `persistence-manager-autosave.test.ts` so the success epilogue keeps (not clears) the session and records the echo:

```typescript
import { finalizeSuccessfulSave, getServerBaseUpdatedAt } from "$lib/storage/manager.svelte";
import { loadSessionWithTimestamp } from "$lib/storage/working-copy";

it("a durable save keeps the working copy stamped with the server echo", () => {
  // arrange: a started layout with a rack in the store (use existing test setup helpers)
  finalizeSuccessfulSave(true, "2026-06-14T10:00:00.000Z");
  expect(getServerBaseUpdatedAt()).toBe("2026-06-14T10:00:00.000Z");
  expect(loadSessionWithTimestamp()?.serverUpdatedAt).toBe("2026-06-14T10:00:00.000Z");
});
```

(Adjust to the file's existing arrange/store helpers; the assertion that matters is: session is NOT removed and carries the echo.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/persistence-manager-autosave.test.ts`
Expected: FAIL (`finalizeSuccessfulSave` clears the session; no `getServerBaseUpdatedAt`).

- [ ] **Step 3: Implement**

In `manager.svelte.ts` add base state and accessors near the other module state:

```typescript
let _serverBaseUpdatedAt = $state<string | null>(null);
export function getServerBaseUpdatedAt(): string | null {
  return _serverBaseUpdatedAt;
}
export function setServerBaseUpdatedAt(value: string | null): void {
  _serverBaseUpdatedAt = value;
}
```

Rewrite `finalizeSuccessfulSave` to keep the copy and re-stamp it (replace lines 113-128):

```typescript
export function finalizeSuccessfulSave(
  clearDirtyState = true,
  newUpdatedAt: string | null = null,
): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  _consecutiveSaveFailures = 0;
  setApiAvailable(true);
  if (_errorToastId) {
    toastStore.dismissToast(_errorToastId);
    _errorToastId = undefined;
  }
  if (clearDirtyState) {
    _saveStatus = "saved";
    layoutStore.markClean();
    cancelSessionSave();
    if (newUpdatedAt) _serverBaseUpdatedAt = newUpdatedAt;
    // Keep the working copy (no clearSession); re-stamp with the server echo so
    // the next startup reconciles against the version we just wrote.
    saveSession(
      layoutStore.layout,
      {
        changesSinceExport: layoutStore.changesSinceExport,
        hasEverExported: layoutStore.hasEverExported,
      },
      _serverBaseUpdatedAt,
    );
  }
}
```

Capture and pass the echo at the two save sites:

```typescript
// handleSaveToServer (around line 250):
const result = await saveLayoutToServer(snapshot, imagesSnapshot, _serverBaseUpdatedAt);
finalizeSuccessfulSave(scheduleId === _serverSaveScheduleId, result.updatedAt);

// Effect 2 auto-save (around line 380):
const result = await saveLayoutToServer(snapshot, imagesSnapshot, _serverBaseUpdatedAt);
finalizeSuccessfulSave(scheduleId === _serverSaveScheduleId, result.updatedAt);
```

Thread the base into the local autosave writes (Effect 1 setTimeout body ~337 and `flushSessionSave` ~314):

```typescript
saveSession(currentLayout, {
  changesSinceExport: layoutStore.changesSinceExport,
  hasEverExported: layoutStore.hasEverExported,
}, _serverBaseUpdatedAt);
```

Remove the now-unused `clearSession` import only if no other call remains (Effect 1 line 349 still uses it when the layout is emptied, and `handleSaveAsArchive` line 275 keeps it for file export, so the import stays).

In `load-pipeline.ts` `loadFromApi`, set the base from the loaded echo (and reset to null in `loadFromFile`):

```typescript
// loadFromApi: const { layout, images, failedImagesCount, updatedAt } = await loadSavedLayout(uuid);
setServerBaseUpdatedAt(updatedAt ?? null);
// loadFromFile: setServerBaseUpdatedAt(null);
```

Export `setServerBaseUpdatedAt`/`getServerBaseUpdatedAt` from `src/lib/storage/index.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/persistence-manager-autosave.test.ts src/tests/persistence-api.test.ts`
Expected: PASS. Fix any other tests that asserted `clearSession()` was called after a server save (update them to assert the copy is kept + stamped).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/manager.svelte.ts src/lib/storage/load-pipeline.ts src/lib/storage/index.ts src/tests/persistence-manager-autosave.test.ts
git commit -m "feat: keep the working copy after server saves, stamped with the echo (#2041)"
```

---

## Task 8: Wire reconciliation + snapshot upload + toasts in App.svelte

**Files:**
- Modify: `src/App.svelte` (reconciliation block lines 363-448; imports 32-41)
- Test: `src/tests/load-pipeline.test.ts` (reconciliation integration) or a focused `src/tests/app-reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

Prefer testing the wiring through the pieces already unit-tested (Task 6 covers the decision; Task 2 covers snapshot keep-on-failure). Add one integration check that the server-newer path uploads a snapshot before loading:

```typescript
// In a test that can drive the reconciliation helper extracted below.
import { applyReconcileServerNewer } from "$lib/storage/reconcile";
// asserts: uploadSnapshot is called with the local UUID + local YAML, and only
// on success does finalizeLayoutLoad run; on failure the local copy is restored.
```

If extracting an async helper is cleaner than testing `App.svelte` directly, add `applyReconcile(action, deps)` to `reconcile.ts` with injected `deps` (uploadSnapshot, loadServer, restoreLocal, toast) and unit-test it. Keep `App.svelte` a thin caller.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- src/tests/reconcile.test.ts`
Expected: FAIL (`applyReconcile` not defined).

- [ ] **Step 3: Implement**

Add `applyReconcile(action, deps)` to `reconcile.ts`:

```typescript
export interface ReconcileDeps {
  serializeLosingCopy: () => Promise<string>;
  uploadSnapshot: (uuid: string, yaml: string) => Promise<boolean>;
  loadServer: (item: SavedLayoutItem) => Promise<void>;
  restoreLocal: () => void;
  toast: (message: string, type: "success" | "info" | "warning") => void;
  serverLabel: string;
}

export async function applyReconcile(action: ReconcileAction, deps: ReconcileDeps): Promise<void> {
  if (action.kind === "restore-local") {
    deps.restoreLocal();
    return;
  }
  if (action.snapshotLocalUuid) {
    const yaml = await deps.serializeLosingCopy();
    const ok = await deps.uploadSnapshot(action.snapshotLocalUuid, yaml);
    if (!ok) {
      // AC7: a snapshot failure must never discard the local copy.
      deps.restoreLocal();
      deps.toast("Could not back up your local copy; keeping it. Reload to retry.", "warning");
      return;
    }
  }
  await deps.loadServer(action.server);
  deps.toast(`Server had a newer version. Your previous copy was saved as a snapshot.`, "info");
}
```

In `src/App.svelte`, replace the `isServerNewer` block (lines 365-443) with:

```typescript
if (apiAvailable) {
  try {
    const savedLayouts = await listSavedLayouts();
    const localUuid = localSession.layout.metadata?.id ?? null;
    const action = reconcileSession({
      localUuid,
      localSavedAt: localSession.savedAt,
      localServerUpdatedAt: localSession.serverUpdatedAt,
      serverLayouts: savedLayouts,
    });
    await applyReconcile(action, {
      serializeLosingCopy: () => serializeLayoutToYaml(localSession.layout, ""),
      uploadSnapshot,
      loadServer: async (item) => {
        const { layout, images, failedImagesCount, failedKeys, updatedAt } = await loadSavedLayout(item.id);
        if (failedKeys.length > 0) persistenceDebug.api("reconciliation: %d image(s) failed", failedKeys.length);
        setServerBaseUpdatedAt(updatedAt ?? null);
        finalizeLayoutLoad(layout, images, failedImagesCount, { successMessage: null });
      },
      restoreLocal: () => {
        setServerBaseUpdatedAt(localSession.serverUpdatedAt);
        restoreLocalSession(localSession);
      },
      toast: (m, t) => toastStore.showToast(m, t),
      serverLabel: instanceLabel,
    });
    return;
  } catch (error) {
    persistenceDebug.api("failed to reconcile saved layouts: %O", error);
    setApiAvailable(false);
    showStorageToast(`Cannot reach ${instanceLabel}. Working from your local copy; reload to retry.`, "warning", 0);
  }
}
```

Update the imports at the top of `App.svelte` (remove `isServerNewer`; add `reconcileSession`, `applyReconcile`, `uploadSnapshot`, `setServerBaseUpdatedAt`, `serializeLayoutToYaml`). When `savedLayouts` is empty, `reconcileSession` returns `restore-local (unknown-to-server)`, preserving the previous "no server layouts -> restore local" behaviour, so the separate empty-list branch is removed.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- src/tests/reconcile.test.ts src/tests/load-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte src/lib/storage/reconcile.ts src/tests/reconcile.test.ts
git commit -m "feat: reconcile by echo, snapshot the loser, keep copy on failure (#2041)"
```

---

## Task 9: Full verification

- [ ] **Step 1: Type, lint, unit, build**

Run, in order:
```bash
npm run check        # svelte-check / tsc
npm run lint
npm run test:run
npm run build
```
Expected: all green. Fix any remaining callers of `saveLayoutToServer`/`loadSavedLayout`/`saveSession`/`isServerNewer` that the signature changes touched (search: `grep -rn "saveLayoutToServer\|loadSavedLayout\|isServerNewer\|saveSession" src`).

- [ ] **Step 2: Manual smoke (server mode)**

With the API sidecar running: save a layout (working copy persists, no flicker), edit in a second tab, reload the first tab, confirm the older copy is offered/loaded with a "saved as a snapshot" toast and the snapshot appears under `GET /layouts/:uuid/snapshots`.

- [ ] **Step 3: Commit any fixups, then open the PR**

---

## Self-review against the acceptance criteria

- AC1 server-echoed updatedAt stored in session + sent on PUT -> Tasks 1, 5, 7.
- AC2 clearSession no longer called after server saves -> Task 7.
- AC3 isServerNewer startup comparison replaced with the echo model -> Tasks 6, 8.
- AC4 losing local copy POSTed to snapshots before discard -> Tasks 2, 8.
- AC5 conflict toasts name the snapshot path -> Task 8.
- AC6 Zod-validate the save response incl. the echo shape -> Task 1.
- AC7 snapshot POST failure never discards the local copy -> Tasks 2, 8.
- AC8 working copy unknown to the server re-established via PUT -> Tasks 6, 8 (`restore-local`/`unknown-to-server` + autosave PUT).
- AC9 cap load response + restricted YAML schema -> Tasks 3, 4.
