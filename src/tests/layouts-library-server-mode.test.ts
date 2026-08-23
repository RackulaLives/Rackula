import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";

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
import {
  listSavedLayouts,
  deleteSavedLayout,
  PersistenceError,
} from "$lib/storage/api";
import { loadFromApi } from "$lib/storage/load-pipeline";
import { resetServerLibrary } from "$lib/storage/server-library.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "$lib/storage/server-base";
import {
  saveSession,
  clearSession,
  loadSessionWithTimestamp,
} from "$lib/storage/working-copy";
import {
  createTestSavedLayoutItem as item,
  createTestLayout,
} from "./factories";
// Spied on (not vi.mock'd) so the real suspend/abandon pair runs: the delete
// flow's ordering is observed against the real deleteSavedLayout mock, not
// replaced by stubs.
import * as manager from "$lib/storage/manager.svelte";

describe("Layouts panel in server mode", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetServerLibrary();
    resetToastStore();
    setServerBaseUpdatedAt(null);
    clearSession();
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

  it("opens a server row through the replace guard, never opening a new tab", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    const ws = getWorkspaceStore();
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    await screen.findByText("Closet Rack");
    const tabCountBefore = ws.tabs.length;
    await user.click(screen.getByText("Closet Rack"));

    expect(loadFromApi).toHaveBeenCalledWith("srv-1", expect.anything());
    // Server mode is single-working-copy: two open server layouts would share
    // one global serverBaseUpdatedAt, so opening a closed row must replace the
    // active tab's contents, never add a tab (#3151).
    expect(ws.tabs.length).toBe(tabCountBefore);
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

  it("suspends autosave before the delete and drops the working copy after it", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
    const suspendSpy = vi.spyOn(manager, "suspendServerAutosave");
    const abandonSpy = vi.spyOn(manager, "abandonWorkingCopy");
    const ws = getWorkspaceStore();
    const openTabId = ws.activeId;
    const openLayoutId = ws.activeStore.layout.metadata?.id;
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    const row = await screen.findByTestId(`layout-item-${openTabId}`);

    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(deleteSavedLayout).toHaveBeenCalledWith(openLayoutId),
    );
    expect(suspendSpy).toHaveBeenCalled();
    expect(abandonSpy).toHaveBeenCalled();
    // Ordering-sensitive in both directions (#3151). Autosave must be
    // suspended before the DELETE, or the debounced save can PUT the layout
    // straight back after it lands. The working copy must be dropped only
    // after it, or a DELETE that fails destroys local state for a layout that
    // still exists on the server.
    const suspendOrder = suspendSpy.mock.invocationCallOrder[0]!;
    const abandonOrder = abandonSpy.mock.invocationCallOrder[0]!;
    const deleteOrder =
      vi.mocked(deleteSavedLayout).mock.invocationCallOrder[0]!;
    expect(suspendOrder).toBeLessThan(deleteOrder);
    expect(abandonOrder).toBeGreaterThan(deleteOrder);
    // closeTab never leaves the workspace empty; it replaces the closed tab
    // with a fresh one, so assert the original tab id is gone rather than
    // asserting an empty tab list.
    await waitFor(() =>
      expect(ws.tabs.some((t) => t.id === openTabId)).toBe(false),
    );

    suspendSpy.mockRestore();
    abandonSpy.mockRestore();
  });

  it("does not drop the working copy when deleting a background tab's row", async () => {
    // abandonWorkingCopy is global: it clears the active layout's save timer,
    // session, and base. A background tab's row is open (row.isOpen) but is
    // not the working copy being autosaved, so deleting it must not touch
    // the active layout's continuity copy (#3151).
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
    const suspendSpy = vi.spyOn(manager, "suspendServerAutosave");
    const abandonSpy = vi.spyOn(manager, "abandonWorkingCopy");
    const ws = getWorkspaceStore();
    const backgroundTabId = ws.activeId;
    const backgroundLayoutId = ws.activeStore.layout.metadata?.id;
    ws.openTab(); // opens and activates a second tab; the first becomes background
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    const row = await screen.findByTestId(`layout-item-${backgroundTabId}`);

    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(deleteSavedLayout).toHaveBeenCalledWith(backgroundLayoutId),
    );
    expect(suspendSpy).not.toHaveBeenCalled();
    expect(abandonSpy).not.toHaveBeenCalled();

    suspendSpy.mockRestore();
    abandonSpy.mockRestore();
  });

  it("treats deleting a layout the server has never heard of as already gone", async () => {
    // Reachable for a brand-new tab, a tab closed inside the autosave
    // debounce, or any zero-rack layout (autosave Effect 2 never PUTs one):
    // the client-generated metadata.id is truthy but the server 404s (#3151).
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
    vi.mocked(deleteSavedLayout).mockRejectedValue(
      new PersistenceError("Layout not found", 404),
    );
    const ws = getWorkspaceStore();
    const openTabId = ws.activeId;
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    const row = await screen.findByTestId(`layout-item-${openTabId}`);

    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete/i }));

    // The tab still closes cleanly...
    await waitFor(() =>
      expect(ws.tabs.some((t) => t.id === openTabId)).toBe(false),
    );
    // ...and the 404 is treated as already-deleted, not surfaced as a failure.
    expect(
      getToastStore().toasts.some((t) => /could not delete/i.test(t.message)),
    ).toBe(false);
  });

  it("keeps the working copy and the server base when the delete fails", async () => {
    // The DELETE failed, so the layout still exists on the server and the
    // working copy is still its local copy. Dropping the session and nulling
    // the base would lose the offline continuity copy and make the next edit
    // PUT with no base, which is the unknown-to-server shape rather than an
    // ordinary update (#3151).
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
    vi.mocked(deleteSavedLayout).mockRejectedValue(
      new PersistenceError("Server error", 503),
    );
    const ws = getWorkspaceStore();
    const openTabId = ws.activeId;
    // A real, schema-valid working copy: the session is only recoverable if
    // it round-trips through the same schema gate a reload reads it with.
    ws.clearThenLoad(
      ws.activeId,
      createTestLayout({
        name: "Homelab",
        metadata: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Homelab",
          schema_version: "1.0",
        },
      }),
    );
    setServerBaseUpdatedAt("2026-08-01T00:00:00.000Z");
    saveSession(
      ws.activeStore.layout,
      { changesSinceExport: 1, hasEverExported: false },
      "2026-08-01T00:00:00.000Z",
    );
    const user = userEvent.setup();

    render(LayoutsLibrary, { props: {} });
    const row = await screen.findByTestId(`layout-item-${openTabId}`);

    await user.pointer({ keys: "[MouseRight]", target: row });
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteSavedLayout).toHaveBeenCalled());
    // The panel renders no toast host, so the failure is asserted on the
    // toast store rather than on the DOM.
    await waitFor(() =>
      expect(
        getToastStore().toasts.some((t) => /could not delete/i.test(t.message)),
      ).toBe(true),
    );
    expect(getServerBaseUpdatedAt()).toBe("2026-08-01T00:00:00.000Z");
    expect(loadSessionWithTimestamp()).not.toBeNull();
    // The layout is still on the server, so its tab stays open.
    expect(ws.tabs.some((t) => t.id === openTabId)).toBe(true);
  });

  it("shows an unavailable notice instead of an empty list when the server is down", async () => {
    vi.mocked(listSavedLayouts).mockRejectedValue(new Error("down"));

    render(LayoutsLibrary, { props: {} });

    expect(await screen.findByText(/cannot reach/i)).toBeInTheDocument();
  });
});
