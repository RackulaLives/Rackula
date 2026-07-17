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
import {
  createTestLibraryEntry,
  createTestEmptyBrowserLaunch,
  createTestRestoreBrowserLaunch,
} from "./factories";

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
      storageMocks.resolveBrowserLaunch.mockReturnValue(
        createTestEmptyBrowserLaunch({ everHadLayouts: false }),
      );
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is false for a returning user whose workspace is empty", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue(
        createTestEmptyBrowserLaunch({ everHadLayouts: true }),
      );
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is false when the active tab has no unexported changes", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue(
        createTestRestoreBrowserLaunch({
          index: {
            schemaVersion: 2,
            activeId: "layout-1",
            openTabs: ["layout-1"],
            library: {
              "layout-1": createTestLibraryEntry({ changesSinceExport: 0 }),
            },
          },
        }),
      );
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });

    it("is true when the active tab has unexported changes", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue(
        createTestRestoreBrowserLaunch({
          index: {
            schemaVersion: 2,
            activeId: "layout-1",
            openTabs: ["layout-1", "layout-2"],
            library: {
              "layout-1": createTestLibraryEntry({ changesSinceExport: 2 }),
              "layout-2": createTestLibraryEntry({ changesSinceExport: 0 }),
            },
          },
        }),
      );
      expect(hasUnrestoredLocalChanges(false)).toBe(true);
    });

    // #2988 fix-round finding 4: this fixture previously named "open tabs"
    // while supplying openTabs: [] -- an impossible restore fixture, since
    // resolveBrowserLaunch() only ever returns action: "restore" when
    // openTabs.length > 0 (browser-launch.ts). Use a genuinely nonempty
    // openTabs with a matching (and dirty) library entry, so this proves the
    // false result comes specifically from the missing activeId rather than
    // from there being no unexported changes anywhere in the workspace.
    it("is false when the index has open tabs but no active id", () => {
      storageMocks.resolveBrowserLaunch.mockReturnValue(
        createTestRestoreBrowserLaunch({
          index: {
            schemaVersion: 2,
            activeId: null,
            openTabs: ["layout-1"],
            library: {
              "layout-1": createTestLibraryEntry({ changesSinceExport: 2 }),
            },
          },
        }),
      );
      expect(hasUnrestoredLocalChanges(false)).toBe(false);
    });
  });
});
