import { describe, it, expect, beforeEach } from "vitest";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";
import { createTestDeviceTypeInput } from "./factories";

describe("Workspace Store", () => {
  beforeEach(() => {
    // The first tab shares the app-session history singleton; reset it so each
    // test starts with an empty undo/redo stack.
    resetHistoryStore();
    resetWorkspaceStore();
  });

  describe("initial state", () => {
    it("starts with exactly one open tab that is active", () => {
      const ws = getWorkspaceStore();
      expect(ws.tabs.length).toBe(1);
      expect(ws.activeId).toBe(ws.tabs[0]!.id);
      expect(ws.activeStore).toBe(ws.tabs[0]!.store);
    });
  });

  describe("openTab", () => {
    it("opens a new tab, makes it active, and loads the given layout", () => {
      const ws = getWorkspaceStore();
      const id = ws.openTab(createLayout("Homelab"));

      expect(ws.tabs.length).toBe(2);
      expect(ws.activeId).toBe(id);
      expect(ws.activeStore.layout.name).toBe("Homelab");
    });

    it("gives each tab its own independent history", () => {
      const ws = getWorkspaceStore();
      const firstId = ws.activeId;

      // Edit the first tab so it has undo history.
      ws.activeStore.addDeviceTypeRecorded(
        createTestDeviceTypeInput({ name: "Server A" }),
      );
      expect(ws.activeStore.canUndo).toBe(true);

      // Open a second tab. Its history is empty and independent.
      ws.openTab(createLayout("Second"));
      expect(ws.activeStore.canUndo).toBe(false);

      // The first tab's history is untouched.
      ws.switchTo(firstId);
      expect(ws.activeStore.canUndo).toBe(true);
    });
  });

  describe("switchTo is a pure focus change", () => {
    it("does not mutate either tab's undo or redo stacks", () => {
      const ws = getWorkspaceStore();
      const firstId = ws.activeId;

      // First tab: one edit, then undo, leaving a populated redo stack.
      ws.activeStore.addDeviceTypeRecorded(
        createTestDeviceTypeInput({ name: "Server A" }),
      );
      ws.activeStore.undo();
      expect(ws.activeStore.canRedo).toBe(true);
      expect(ws.activeStore.canUndo).toBe(false);

      // Switch away and back. The first tab's redo stack must survive the
      // round trip (no global cross-tab undo, no stack mutation on switch).
      const secondId = ws.openTab(createLayout("Second"));
      ws.switchTo(firstId);
      expect(ws.activeStore.canRedo).toBe(true);

      ws.switchTo(secondId);
      ws.switchTo(firstId);
      expect(ws.activeStore.canRedo).toBe(true);
    });

    it("ignores a switch to an unknown id", () => {
      const ws = getWorkspaceStore();
      const before = ws.activeId;
      ws.switchTo("does-not-exist");
      expect(ws.activeId).toBe(before);
    });
  });

  describe("closeTab", () => {
    it("removes the tab and falls back to a neighbour as active", () => {
      const ws = getWorkspaceStore();
      const firstId = ws.activeId;
      const secondId = ws.openTab(createLayout("Second"));

      expect(ws.activeId).toBe(secondId);
      ws.closeTab(secondId);

      expect(ws.tabs.length).toBe(1);
      expect(ws.activeId).toBe(firstId);
    });

    it("keeps an inactive tab active when closing a different tab", () => {
      const ws = getWorkspaceStore();
      const firstId = ws.activeId;
      ws.openTab(createLayout("Second"));
      const thirdId = ws.openTab(createLayout("Third"));

      // Active is the third tab. Close the first (inactive) tab.
      ws.closeTab(firstId);

      expect(ws.tabs.length).toBe(2);
      expect(ws.activeId).toBe(thirdId);
    });

    it("never leaves the workspace with zero tabs", () => {
      const ws = getWorkspaceStore();
      const onlyId = ws.activeId;

      ws.closeTab(onlyId);

      expect(ws.tabs.length).toBe(1);
      expect(ws.activeId).toBe(ws.tabs[0]!.id);
    });

    it("starts the replacement tab with a clean history when closing the last tab", () => {
      const ws = getWorkspaceStore();
      const onlyId = ws.activeId;

      // Build history on the only tab.
      ws.activeStore.addDeviceTypeRecorded(
        createTestDeviceTypeInput({ name: "Server A" }),
      );
      expect(ws.activeStore.canUndo).toBe(true);

      // Closing the last tab replaces it with a fresh blank tab. The fresh tab
      // must not inherit the closed tab's undo/redo stack (it shares the
      // app-session history singleton).
      ws.closeTab(onlyId);

      expect(ws.activeStore.canUndo).toBe(false);
      expect(ws.activeStore.canRedo).toBe(false);
    });
  });

  describe("reorderTabs", () => {
    it("moves a tab from one index to another", () => {
      const ws = getWorkspaceStore();
      const a = ws.activeId;
      const b = ws.openTab(createLayout("B"));
      const c = ws.openTab(createLayout("C"));

      // Order is [a, b, c]. Move c (index 2) to the front (index 0).
      ws.reorderTabs(2, 0);

      expect(ws.tabs.map((t) => t.id)).toEqual([c, a, b]);
      // Reorder does not change which tab is active.
      expect(ws.activeId).toBe(c);
    });

    it("ignores out-of-range indices", () => {
      const ws = getWorkspaceStore();
      ws.openTab(createLayout("B"));
      const order = ws.tabs.map((t) => t.id);

      ws.reorderTabs(0, 5);
      expect(ws.tabs.map((t) => t.id)).toEqual(order);
    });
  });

  describe("clearThenLoad", () => {
    it("clears the target tab's history then loads, with no cross-tab leak", () => {
      const ws = getWorkspaceStore();
      const firstId = ws.activeId;

      // Build history on the first tab.
      ws.activeStore.addDeviceTypeRecorded(
        createTestDeviceTypeInput({ name: "Server A" }),
      );
      expect(ws.activeStore.canUndo).toBe(true);

      // Swap new content into the same tab via the shared primitive.
      ws.clearThenLoad(firstId, createLayout("Reloaded"));

      expect(ws.activeStore.layout.name).toBe("Reloaded");
      expect(ws.activeStore.canUndo).toBe(false);
      expect(ws.activeStore.canRedo).toBe(false);
    });
  });
});
