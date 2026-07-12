import { describe, it, expect, vi, beforeEach } from "vitest";

const storageMocks = vi.hoisted(() => ({
  loadSessionWithTimestamp: vi.fn<() => unknown>(() => null),
  resolveBrowserLaunch: vi.fn<() => unknown>(),
}));

vi.mock("$lib/storage", () => ({
  loadSessionWithTimestamp: storageMocks.loadSessionWithTimestamp,
  resolveBrowserLaunch: storageMocks.resolveBrowserLaunch,
}));

import { hasUnrestoredLocalChanges } from "$lib/actions/share-entry-guard";
import type { BrowserLaunch, LibraryEntry } from "$lib/storage";

function libraryEntry(changesSinceExport: number): LibraryEntry {
  return {
    name: "Test layout",
    updatedAt: "2026-07-01T00:00:00.000Z",
    changesSinceExport,
    hasEverExported: changesSinceExport === 0,
    lastExportedAt: null,
    writeFailed: false,
    storageMode: "browser",
  };
}

describe("hasUnrestoredLocalChanges (#2988)", () => {
  beforeEach(() => {
    storageMocks.loadSessionWithTimestamp.mockReset();
    storageMocks.loadSessionWithTimestamp.mockReturnValue(null);
    storageMocks.resolveBrowserLaunch.mockReset();
  });

  describe("server mode", () => {
    it("is false when there is no local session", () => {
      storageMocks.loadSessionWithTimestamp.mockReturnValue(null);
      expect(hasUnrestoredLocalChanges(true)).toBe(false);
    });

    it("is false when the local session has no unexported changes", () => {
      storageMocks.loadSessionWithTimestamp.mockReturnValue({
        changesSinceExport: 0,
      });
      expect(hasUnrestoredLocalChanges(true)).toBe(false);
    });

    it("is true when the local session has unexported changes", () => {
      storageMocks.loadSessionWithTimestamp.mockReturnValue({
        changesSinceExport: 3,
      });
      expect(hasUnrestoredLocalChanges(true)).toBe(true);
    });

    it("never consults the browser workspace index", () => {
      storageMocks.loadSessionWithTimestamp.mockReturnValue({
        changesSinceExport: 1,
      });
      hasUnrestoredLocalChanges(true);
      expect(storageMocks.resolveBrowserLaunch).not.toHaveBeenCalled();
    });
  });

  describe("browser mode", () => {
    it("is false for a genuine fresh install (no persisted workspace)", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue({
        action: "empty",
        everHadLayouts: false,
      } satisfies BrowserLaunch);
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is false for a returning user whose workspace is empty", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue({
        action: "empty",
        everHadLayouts: true,
      } satisfies BrowserLaunch);
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is false when the active tab has no unexported changes", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue({
        action: "restore",
        index: {
          schemaVersion: 2,
          activeId: "layout-1",
          openTabs: ["layout-1"],
          library: { "layout-1": libraryEntry(0) },
        },
        loadBody: vi.fn(),
      } satisfies BrowserLaunch);
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is true when the active tab has unexported changes", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue({
        action: "restore",
        index: {
          schemaVersion: 2,
          activeId: "layout-1",
          openTabs: ["layout-1", "layout-2"],
          library: {
            "layout-1": libraryEntry(2),
            "layout-2": libraryEntry(0),
          },
        },
        loadBody: vi.fn(),
      } satisfies BrowserLaunch);
      expect(hasUnrestoredLocalChanges(false)).toBe(true);
    });

    it("is false when the index has open tabs but no active id", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue({
        action: "restore",
        index: {
          schemaVersion: 2,
          activeId: null,
          openTabs: [],
          library: {},
        },
        loadBody: vi.fn(),
      } satisfies BrowserLaunch);
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });
  });
});
