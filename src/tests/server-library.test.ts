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
