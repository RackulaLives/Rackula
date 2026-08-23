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
