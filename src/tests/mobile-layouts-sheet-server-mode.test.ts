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

  it("refuses to open a corrupted server row", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([
      item({ name: "Broken Rack", valid: false }),
    ]);
    const user = userEvent.setup();

    render(MobileLayoutsSheet, { props: {} });
    await user.click(await screen.findByText("Broken Rack"));

    expect(loadFromApi).not.toHaveBeenCalled();
  });

  it("dismisses the sheet before running the replace guard", async () => {
    vi.mocked(listSavedLayouts).mockResolvedValue([item()]);
    const user = userEvent.setup();
    const onclose = vi.fn();

    render(MobileLayoutsSheet, { props: { onclose } });
    await user.click(await screen.findByText("Closet Rack"));

    await waitFor(() => expect(loadFromApi).toHaveBeenCalled());
    expect(onclose).toHaveBeenCalled();
    // Ordering-sensitive: onclose must fire before the guard runs, or the
    // replace-confirm dialog would be covered by a sheet still closing
    // (#3151). Comparing call order (not just that both ran) is what catches
    // a reversed sequence.
    const closeOrder = onclose.mock.invocationCallOrder[0]!;
    const loadOrder = vi.mocked(loadFromApi).mock.invocationCallOrder[0]!;
    expect(closeOrder).toBeLessThan(loadOrder);
  });
});
