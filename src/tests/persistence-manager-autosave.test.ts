import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  finalizeSuccessfulSave,
  handlePersistenceError,
  handleSaveToServer,
  getConsecutiveSaveFailures,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "$lib/storage/server-base";
import { loadSessionWithTimestamp } from "$lib/storage/working-copy";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { getImageStore, resetImageStore } from "$lib/stores/images.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { createTestLayout } from "./factories";

/**
 * A successful server save must leave the layout clean regardless of which
 * path performed it. The debounced auto-save and the manual save share
 * finalizeSuccessfulSave, so a successful auto-save matches a manual one:
 * dirty cleared, failure counter reset, lingering error toast dismissed.
 * A failed save must NOT clear the dirty flag. Regression guard for #2057.
 */
describe("successful save epilogue", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    setApiAvailable(true);
  });

  it("clears the dirty flag on save success", () => {
    const layoutStore = getLayoutStore();
    layoutStore.markDirty();
    expect(layoutStore.isDirty).toBe(true);

    finalizeSuccessfulSave();

    expect(layoutStore.isDirty).toBe(false);
  });

  it("resets the consecutive-failure counter and dismisses the error toast", () => {
    // Two failures leave a counter and a lingering error toast behind.
    handlePersistenceError(new PersistenceError("boom", 503), true);
    handlePersistenceError(new PersistenceError("boom", 503), true);
    expect(getConsecutiveSaveFailures()).toBeGreaterThan(0);
    const errorToast = getToastStore().toasts.at(-1);
    expect(errorToast).toBeDefined();

    finalizeSuccessfulSave();

    expect(getConsecutiveSaveFailures()).toBe(0);
    expect(getToastStore().toasts.some((t) => t.id === errorToast?.id)).toBe(
      false,
    );
  });

  it("leaves the layout dirty when a save fails", () => {
    const layoutStore = getLayoutStore();
    layoutStore.markDirty();

    handlePersistenceError(new PersistenceError("boom", 503), true);

    expect(layoutStore.isDirty).toBe(true);
  });

  it("records server health but preserves dirty state on a stale save", () => {
    const layoutStore = getLayoutStore();
    // A prior failure leaves a counter and error toast behind.
    handlePersistenceError(new PersistenceError("boom", 503), true);
    layoutStore.markDirty();

    // Stale completion: the save succeeded, but newer edits arrived in flight.
    finalizeSuccessfulSave(false);

    expect(getConsecutiveSaveFailures()).toBe(0); // server health recorded
    expect(layoutStore.isDirty).toBe(true); // newer unsaved edits preserved
  });

  it("advances the server base and re-stamps the session on a stale save (#2926)", () => {
    const layoutStore = getLayoutStore();
    layoutStore.loadLayout(createTestLayout());
    layoutStore.markStarted();
    layoutStore.markDirty();
    setServerBaseUpdatedAt("2026-06-14T09:00:00.000Z");

    // Stale completion: the PUT succeeded and the server echoed a new
    // updatedAt, but newer edits arrived in flight (clearDirtyState=false).
    // The echo is still this tab's own write and must become the new base,
    // or the next reconcile sees false divergence against it and can
    // discard the newer local edits (#2926).
    finalizeSuccessfulSave(false, "2026-06-14T10:00:00.000Z");

    expect(getServerBaseUpdatedAt()).toBe("2026-06-14T10:00:00.000Z");
    // The stale path must still preserve the dirty flag for the newer
    // in-flight edits; advancing the base must not clear it.
    expect(layoutStore.isDirty).toBe(true);
    const session = loadSessionWithTimestamp();
    expect(session?.serverUpdatedAt).toBe("2026-06-14T10:00:00.000Z");
  });

  it("keeps the working copy and records the server echo on a durable save", () => {
    const layoutStore = getLayoutStore();
    // A started layout with a rack: the conditions under which the working copy
    // is autosaved and a server PUT is echoed back.
    layoutStore.loadLayout(createTestLayout());
    layoutStore.markStarted();
    layoutStore.markDirty();
    expect(layoutStore.hasRack).toBe(true);

    finalizeSuccessfulSave(true, "2026-06-14T10:00:00.000Z");

    // The echo becomes the new base for subsequent PUTs.
    expect(getServerBaseUpdatedAt()).toBe("2026-06-14T10:00:00.000Z");
    // The working copy is re-stamped, not removed: it survives a reload and
    // carries the echo so divergence can be detected next session.
    const session = loadSessionWithTimestamp();
    expect(session).not.toBeNull();
    expect(session?.serverUpdatedAt).toBe("2026-06-14T10:00:00.000Z");
  });
});

/**
 * End-to-end echo threading: a durable save records the server's updatedAt echo
 * (finalizeSuccessfulSave -> setServerBaseUpdatedAt), and the next save threads
 * that echo back as the X-Rackula-Updated-At PUT header so the server can detect
 * divergence. This closes the gap between the unit tests for finalize (records
 * the echo) and saveLayoutToServer (forwards the header) by proving the stored
 * base actually reaches a subsequent request. Coverage for #2041.
 */
describe("echo threads into the next PUT header", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    setApiAvailable(true);
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setServerBaseUpdatedAt(null);
    setApiAvailable(false);
  });

  function putResponse(updatedAt: string): Response {
    return new Response(JSON.stringify({ id: UUID, updatedAt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("threads the first save's echo into the second save's X-Rackula-Updated-At", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.loadLayout(createTestLayout({ metadata: { id: UUID } }));
    layoutStore.markStarted();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(putResponse("2026-06-14T10:00:00.000Z"))
      .mockResolvedValueOnce(putResponse("2026-06-14T11:00:00.000Z"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await handleSaveToServer(false)).toBe(true);
    // The first save's echo becomes the base for the next PUT.
    layoutStore.markDirty();
    expect(await handleSaveToServer(false)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(firstHeaders.has("X-Rackula-Updated-At")).toBe(false);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(secondHeaders.get("X-Rackula-Updated-At")).toBe(
      "2026-06-14T10:00:00.000Z",
    );
  });
});

/**
 * The originating bug (#1426): in server mode the save chip flipped to "saved"
 * (markClean) immediately after the YAML PUT, before the images persisted, so a
 * crash between the YAML save and the image write lost the images silently. The
 * fix folds the asset writes into saveLayoutToServer, so a save reaches a clean
 * state only after the YAML PUT and every asset PUT/DELETE resolve. A failed
 * asset PUT must leave the layout dirty so the next autosave retries.
 */
describe("server-mode save stays dirty when an asset write fails (#1426)", () => {
  const UUID = "44444444-4444-4444-8444-444444444444";
  const PLACEMENT_KEY = `placement-${UUID}:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
  const originalConfig = window.__RACKULA_CONFIG__;
  const PNG_BYTES = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);

  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetImageStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setApiAvailable(true);
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetImageStore();
    setServerBaseUpdatedAt(null);
    setApiAvailable(false);
    window.__RACKULA_CONFIG__ = originalConfig;
  });

  it("does not markClean when the YAML PUT succeeds but the asset PUT fails", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.loadLayout(createTestLayout({ metadata: { id: UUID } }));
    layoutStore.markStarted();

    // One user image so the save attempts an asset PUT.
    getImageStore().setDeviceImage(PLACEMENT_KEY, "front", {
      blob: new Blob([PNG_BYTES], { type: "image/png" }),
      dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`,
      filename: "front.png",
    });
    layoutStore.markDirty();

    // YAML PUT succeeds; the asset PUT fails (500). The reconcile listing GET
    // returns an empty set.
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && /\/assets\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({ assets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (/\/assets\/[^/]+\/[^/]+\/[^/]+$/.test(u) && method === "PUT") {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      return new Response(
        JSON.stringify({ id: UUID, updatedAt: "2026-06-20T00:00:00.000Z" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await handleSaveToServer(false);

    expect(ok).toBe(false);
    expect(layoutStore.isDirty).toBe(true);
  });
});
