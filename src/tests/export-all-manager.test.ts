/**
 * Export-all orchestration tests (#2045)
 *
 * The load-bearing behaviour is the per-mode framing: browser mode is a backup
 * that resets the chip's change counter, server mode is a portable copy that
 * leaves chip state untouched and pulls authoritative YAML from the server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  handleExportAll,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { listSavedLayouts, loadSavedLayout } from "$lib/storage/api";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { createMultiLayoutArchive } from "$lib/utils/archive";
import { createTestLayout, createTestRack } from "./factories";
import type { ImageStoreMap } from "$lib/types/images";

vi.mock("browser-fs-access", () => ({
  fileSave: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/utils/archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/utils/archive")>();
  return {
    ...actual,
    createMultiLayoutArchive: vi
      .fn()
      .mockResolvedValue(new Blob(["zip"], { type: "application/zip" })),
  };
});

vi.mock("$lib/storage/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/storage/api")>();
  return {
    ...actual,
    listSavedLayouts: vi.fn(),
    loadSavedLayout: vi.fn(),
    saveLayoutToServer: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedBuild = vi.mocked(createMultiLayoutArchive);
const mockedList = vi.mocked(listSavedLayouts);
const mockedLoad = vi.mocked(loadSavedLayout);

function setMode(mode: "browser" | "server"): void {
  (
    window as unknown as { __RACKULA_CONFIG__?: { storage: string } }
  ).__RACKULA_CONFIG__ = { storage: mode };
}

describe("handleExportAll", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetImageStore();
    resetPersistenceManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Leave no ambient mode or availability state for the next file/test.
    setApiAvailable(false);
    delete (window as unknown as { __RACKULA_CONFIG__?: unknown })
      .__RACKULA_CONFIG__;
  });

  describe("browser mode (backup)", () => {
    beforeEach(() => setMode("browser"));

    it("bundles the open layout and resets the chip counter on success", async () => {
      const store = getLayoutStore();
      store.addRack("Rack", 42);
      store.markDirty();
      expect(store.changesSinceExport).toBeGreaterThan(0);

      const ok = await handleExportAll();

      expect(ok).toBe(true);
      // Degraded form: exactly the one open layout goes into the archive.
      const entries = mockedBuild.mock.calls[0]![0];
      // eslint-disable-next-line no-restricted-syntax -- degraded browser form bundles exactly one layout
      expect(entries).toHaveLength(1);
      // Backup framing: a successful run is the green boundary.
      expect(store.changesSinceExport).toBe(0);
      expect(store.hasEverExported).toBe(true);
    });

    it("never reads the server list in browser mode", async () => {
      getLayoutStore().addRack("Rack", 42);
      await handleExportAll();
      expect(mockedList).not.toHaveBeenCalled();
    });
  });

  describe("server mode (portable copy)", () => {
    beforeEach(() => {
      setMode("server");
      setApiAvailable(true);
    });

    it("pulls authoritative YAML for every valid layout and leaves the chip alone", async () => {
      const store = getLayoutStore();
      store.addRack("Rack", 42);
      // Mark clean so the pre-list flush is skipped: this test asserts the
      // authoritative pull and chip-untouched behaviour. The flush routes
      // through real manager internals (handleSaveToServer + image store), so
      // it is exercised end-to-end rather than unit-pinned here.
      store.markClean();
      const before = store.changesSinceExport;

      mockedList.mockResolvedValue([
        item("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "One"),
        item("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Two", false), // corrupt
      ]);
      mockedLoad.mockResolvedValue(loaded("One"));

      const ok = await handleExportAll();

      expect(ok).toBe(true);
      // Only the valid layout is fetched and bundled; the corrupt one is skipped.
      expect(mockedLoad).toHaveBeenCalledTimes(1);
      const entries = mockedBuild.mock.calls[0]![0];
      // eslint-disable-next-line no-restricted-syntax -- one valid + one corrupt server layout means one bundled entry
      expect(entries).toHaveLength(1);
      // Portable-copy framing must not move the backup boundary.
      expect(store.changesSinceExport).toBe(before);
      expect(store.hasEverExported).toBe(false);
    });

    it("does nothing when the server has no exportable layouts", async () => {
      getLayoutStore().addRack("Rack", 42);
      mockedList.mockResolvedValue([]);

      const ok = await handleExportAll();

      expect(ok).toBe(false);
      expect(mockedBuild).not.toHaveBeenCalled();
    });

    it("does not treat an unreachable server as an empty library", async () => {
      getLayoutStore().addRack("Rack", 42);
      setApiAvailable(false);

      const ok = await handleExportAll();

      expect(ok).toBe(false);
      // Offline must short-circuit before the list call, not fall through to
      // the "no layouts" empty-library message.
      expect(mockedList).not.toHaveBeenCalled();
      expect(mockedBuild).not.toHaveBeenCalled();
    });
  });
});

function item(id: string, name: string, valid = true) {
  return {
    id,
    name,
    version: "1.0",
    updatedAt: "2026-06-14T00:00:00.000Z",
    rackCount: 1,
    deviceCount: 0,
    valid,
  };
}

function loaded(name: string) {
  return {
    layout: createTestLayout({
      name,
      racks: [createTestRack({ id: `${name}-rack`, name: `${name} Rack` })],
    }),
    images: new Map() as ImageStoreMap,
    failedImagesCount: 0,
    failedKeys: [] as string[],
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
}
