import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
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
// Spied on (not vi.mock'd) so the real abandonWorkingCopy runs: Finding 3
// needs to observe call order against the real deleteSavedLayout mock, not
// replace the function under test.
import * as manager from "$lib/storage/manager.svelte";

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

  it("drops the working copy before deleting the currently open row", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
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
    expect(abandonSpy).toHaveBeenCalled();
    // Ordering-sensitive: abandonWorkingCopy must run before the DELETE, or
    // the debounced autosave can PUT the layout straight back after it
    // lands (#3151).
    const abandonOrder = abandonSpy.mock.invocationCallOrder[0]!;
    const deleteOrder =
      vi.mocked(deleteSavedLayout).mock.invocationCallOrder[0]!;
    expect(abandonOrder).toBeLessThan(deleteOrder);
    // closeTab never leaves the workspace empty; it replaces the closed tab
    // with a fresh one, so assert the original tab id is gone rather than
    // asserting an empty tab list.
    await waitFor(() =>
      expect(ws.tabs.some((t) => t.id === openTabId)).toBe(false),
    );

    abandonSpy.mockRestore();
  });

  it("does not drop the working copy when deleting a background tab's row", async () => {
    // abandonWorkingCopy is global: it clears the active layout's save timer,
    // session, and base. A background tab's row is open (row.isOpen) but is
    // not the working copy being autosaved, so deleting it must not touch
    // the active layout's continuity copy (#3151).
    vi.mocked(listSavedLayouts).mockResolvedValue([]);
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
    expect(abandonSpy).not.toHaveBeenCalled();

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
    expect(screen.queryByText(/could not delete/i)).not.toBeInTheDocument();
  });

  it("shows an unavailable notice instead of an empty list when the server is down", async () => {
    vi.mocked(listSavedLayouts).mockRejectedValue(new Error("down"));

    render(LayoutsLibrary, { props: {} });

    expect(await screen.findByText(/cannot reach/i)).toBeInTheDocument();
  });
});
