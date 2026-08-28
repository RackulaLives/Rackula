import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as api from "$lib/storage/api";
import * as availability from "$lib/storage/availability.svelte";
import {
  getServerLibrary,
  refreshServerLibrary,
  upsertServerLibraryItem,
  removeServerLibraryItem,
  resetServerLibrary,
} from "$lib/storage/server-library.svelte";
import { createTestSavedLayoutItem as item } from "./factories";

describe("server library store", () => {
  beforeEach(() => {
    resetServerLibrary();
    vi.spyOn(api, "listSavedLayouts");
    vi.spyOn(availability, "initializePersistence").mockResolvedValue(true);
    vi.spyOn(availability, "isApiAvailable").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the server list and reports ready", async () => {
    vi.mocked(api.listSavedLayouts).mockResolvedValue([item()]);

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("ready");
    expect(getServerLibrary().items.map((i) => i.id)).toEqual(["srv-1"]);
  });

  it("reads availability only after the health check resolves", async () => {
    // The panel can mount before the first health check resolves; reading
    // availability early would mark a healthy server unavailable (#3151).
    // isApiAvailable mirrors the real store's pre-check state (apiAvailable
    // === null -> false) until the health check settles, so a regression
    // that reads it before awaiting initializePersistence() sees false and
    // short-circuits to "unavailable" even though the server is healthy.
    let resolveInit: (value: boolean) => void = () => {};
    vi.mocked(availability.initializePersistence).mockReturnValue(
      new Promise<boolean>((r) => {
        resolveInit = r;
      }),
    );
    vi.mocked(availability.isApiAvailable).mockReturnValue(false);
    vi.mocked(api.listSavedLayouts).mockResolvedValue([item()]);

    const refreshing = refreshServerLibrary();
    // A correct implementation is now suspended on
    // `await initializePersistence()` and has not read isApiAvailable() yet.
    // Flip it true and resolve the health check before awaiting completion.
    vi.mocked(availability.isApiAvailable).mockReturnValue(true);
    resolveInit(true);
    await refreshing;

    expect(availability.initializePersistence).toHaveBeenCalled();
    expect(getServerLibrary().status).toBe("ready");
  });

  it("reports unavailable when the API is unreachable", async () => {
    vi.mocked(availability.isApiAvailable).mockReturnValue(false);

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("unavailable");
  });

  it("reports unavailable when the fetch throws", async () => {
    vi.mocked(api.listSavedLayouts).mockRejectedValue(
      new Error("network down"),
    );

    await refreshServerLibrary();

    expect(getServerLibrary().status).toBe("unavailable");
  });

  it("replaces an existing item on upsert and appends an unseen one", async () => {
    vi.mocked(api.listSavedLayouts).mockResolvedValue([item()]);
    await refreshServerLibrary();

    upsertServerLibraryItem(item({ name: "Renamed" }));
    upsertServerLibraryItem(item({ id: "srv-2", name: "Second" }));

    expect(getServerLibrary().items.map((i) => i.name)).toEqual([
      "Renamed",
      "Second",
    ]);
  });

  it("drops an item on remove", async () => {
    vi.mocked(api.listSavedLayouts).mockResolvedValue([
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
    vi.mocked(api.listSavedLayouts).mockReturnValue(
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

  it("keeps a pending upsert when a second refresh starts before the first settles", async () => {
    // Overlapping refreshes must not wipe the pending-mutation queue
    // collected while an earlier fetch is still in flight (#3151). Both
    // calls share one pending GET so the second refresh's start can be
    // observed racing the first's in-flight window.
    let resolveList: (items: SavedLayoutItem[]) => void = () => {};
    vi.mocked(api.listSavedLayouts).mockReturnValue(
      new Promise<SavedLayoutItem[]>((r) => {
        resolveList = r;
      }),
    );

    const first = refreshServerLibrary();
    upsertServerLibraryItem(item({ id: "srv-new", name: "Created" }));
    const second = refreshServerLibrary();
    resolveList([item()]);
    await Promise.all([first, second]);

    expect(getServerLibrary().items.map((i) => i.id)).toContain("srv-new");
  });
});
