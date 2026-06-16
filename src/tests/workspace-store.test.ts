import { describe, it, expect, beforeEach } from "vitest";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";
import { createTestDeviceTypeInput, createTestRack } from "./factories";
import type { WorkspaceIndex } from "$lib/storage/browser-workspace";
import type { Layout } from "$lib/types";

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

  describe("restoreWorkspace (lazy tab restore)", () => {
    function bodyFor(id: string, name: string): Layout {
      return { ...createLayout(name), metadata: { id, name } };
    }

    function makeIndex(): WorkspaceIndex {
      return {
        schemaVersion: 2,
        activeId: "id-a",
        openTabs: ["id-a", "id-b"],
        library: {
          "id-a": {
            name: "Alpha",
            updatedAt: "",
            changesSinceExport: 0,
            hasEverExported: false,
            writeFailed: false,
            storageMode: "browser",
          },
          "id-b": {
            name: "Beta",
            updatedAt: "",
            changesSinceExport: 0,
            hasEverExported: false,
            writeFailed: false,
            storageMode: "browser",
          },
        },
      };
    }

    it("restores one tab per open id, ordered, with the active id focused", () => {
      const ws = getWorkspaceStore();
      const loaded: string[] = [];
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => {
          loaded.push(id);
          return {
            ok: true,
            layout: bodyFor(id, id === "id-a" ? "Alpha" : "Beta"),
          };
        },
      });

      expect(ws.tabs.length).toBe(2);
      expect(ws.activeId).toBe(ws.tabs[0]!.id);
      // The active layout loaded eagerly; the inactive one did not.
      expect(loaded).toEqual(["id-a"]);
    });

    it("restores the active tab's durability from its library entry", () => {
      const ws = getWorkspaceStore();
      const index = makeIndex();
      index.library["id-a"].changesSinceExport = 5;
      index.library["id-a"].hasEverExported = true;
      ws.restoreWorkspace({
        index,
        loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body") }),
      });
      // The active tab's durability comes from the persisted library entry, not
      // reset to zero by the body load, so the chip/tab dot reflect true state.
      expect(ws.activeStore.changesSinceExport).toBe(5);
      expect(ws.activeStore.hasEverExported).toBe(true);
    });

    it("shows the persisted name on an unhydrated tab before its body loads", () => {
      const ws = getWorkspaceStore();
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body") }),
      });
      // Second (inactive) tab is a shell carrying the index name, no body read.
      expect(ws.tabs[1]!.store.layout.name).toBe("Beta");
    });

    it("hydrates an inactive tab lazily on first focus, then not again", () => {
      const ws = getWorkspaceStore();
      const loaded: string[] = [];
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => {
          loaded.push(id);
          return { ok: true, layout: bodyFor(id, "Body-" + id) };
        },
      });
      expect(loaded).toEqual(["id-a"]);

      const betaTabId = ws.tabs[1]!.id;
      ws.switchTo(betaTabId);
      expect(loaded).toEqual(["id-a", "id-b"]);
      expect(ws.activeStore.layout.name).toBe("Body-id-b");

      // Switching away and back does not re-read the body.
      ws.switchTo(ws.tabs[0]!.id);
      ws.switchTo(betaTabId);
      expect(loaded).toEqual(["id-a", "id-b"]);
    });

    it("hydrates a restored tab with empty undo history", () => {
      const ws = getWorkspaceStore();
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body") }),
      });
      const betaTabId = ws.tabs[1]!.id;
      ws.switchTo(betaTabId);
      expect(ws.activeStore.canUndo).toBe(false);
      expect(ws.activeStore.canRedo).toBe(false);
    });

    it("regenerates a restored device id that collides with a live id in another tab", () => {
      const ws = getWorkspaceStore();

      // Tab A is hydrated eagerly and holds a device with a fixed id.
      const sharedId = "shared-device-id";
      const aRack = createTestRack({
        id: "rack-a",
        devices: [
          {
            id: sharedId,
            device_type: "server",
            position: 0,
            face: "front",
          },
        ],
      });
      const bRack = createTestRack({
        id: "rack-b",
        devices: [
          {
            id: sharedId,
            device_type: "server",
            position: 0,
            face: "front",
          },
        ],
      });

      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) =>
          id === "id-a"
            ? {
                ok: true,
                layout: { ...bodyFor("id-a", "Alpha"), racks: [aRack] },
              }
            : {
                ok: true,
                layout: { ...bodyFor("id-b", "Beta"), racks: [bRack] },
              },
      });

      // Tab A keeps the shared id.
      expect(ws.tabs[0]!.store.racks[0]!.devices[0]!.id).toBe(sharedId);

      // Focus tab B: its colliding device id must be regenerated so the global
      // image store (keyed placement-<deviceId>) cannot alias across tabs.
      ws.switchTo(ws.tabs[1]!.id);
      const bId = ws.activeStore.racks[0]!.devices[0]!.id;
      expect(bId).not.toBe(sharedId);
    });

    it("leaves a tab as a recoverable shell when its body is unreadable on focus", () => {
      const ws = getWorkspaceStore();
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) =>
          id === "id-a"
            ? { ok: true, layout: bodyFor("id-a", "Alpha") }
            : { ok: false },
      });
      const betaTabId = ws.tabs[1]!.id;
      ws.switchTo(betaTabId);
      // Focus still moves to the tab (never silently vanishes); it is flagged
      // unreadable so the interaction layer can offer Retry/Remove (#2018).
      expect(ws.activeId).toBe(betaTabId);
      expect(ws.tabs[1]!.unreadable).toBe(true);
    });

    it("hydrates the fallback tab when closing the active tab onto a shell", () => {
      const ws = getWorkspaceStore();
      const loaded: string[] = [];
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => {
          loaded.push(id);
          return { ok: true, layout: bodyFor(id, "Body-" + id) };
        },
      });
      // Active tab (id-a) is hydrated; id-b is still an unhydrated shell.
      expect(loaded).toEqual(["id-a"]);

      // Close the active tab: focus falls back to the id-b shell, which must be
      // hydrated so the canvas shows the real layout, not the placeholder.
      ws.closeTab(ws.tabs[0]!.id);
      expect(loaded).toEqual(["id-a", "id-b"]);
      expect(ws.activeStore.layout.name).toBe("Body-id-b");
    });
  });

  describe("library set", () => {
    function bodyFor(id: string, name: string): Layout {
      return { ...createLayout(name), metadata: { id, name } };
    }

    function makeIndex(): WorkspaceIndex {
      return {
        schemaVersion: 2,
        activeId: "id-a",
        openTabs: ["id-a"],
        library: {
          "id-a": {
            name: "Alpha",
            updatedAt: "",
            changesSinceExport: 0,
            hasEverExported: false,
            writeFailed: false,
            storageMode: "browser",
          },
          "id-b": {
            name: "Beta",
            updatedAt: "",
            changesSinceExport: 0,
            hasEverExported: false,
            writeFailed: false,
            storageMode: "browser",
          },
        },
      };
    }

    it("exposes every saved layout, including ones with no open tab", () => {
      const ws = getWorkspaceStore();
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => ({ ok: true, layout: bodyFor(id, id) }),
      });

      // id-a is open; id-b is closed-but-saved. Both are in the library set.
      expect(Object.keys(ws.library).sort()).toEqual(["id-a", "id-b"]);
      expect(ws.library["id-b"]?.name).toBe("Beta");
    });

    it("adds a layout opened in-session to the library set", () => {
      const ws = getWorkspaceStore();
      const layout = bodyFor("fresh-id", "Fresh");
      ws.openTab(layout);

      expect(ws.library["fresh-id"]?.name).toBe("Fresh");
    });

    describe("openFromLibrary", () => {
      it("opens a closed layout into exactly one new tab and makes it active", () => {
        const ws = getWorkspaceStore();
        ws.restoreWorkspace({
          index: makeIndex(),
          loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body-" + id) }),
        });
        const tabsBefore = ws.tabs.length;

        ws.openFromLibrary("id-b");

        // Opening a closed layout must add exactly one tab (no duplicates).
        expect(ws.tabs.length).toBe(tabsBefore + 1);
        const active = ws.tabs.find((t) => t.id === ws.activeId)!;
        expect(active.layoutId).toBe("id-b");
        expect(ws.activeStore.layout.name).toBe("Body-id-b");
      });

      it("switches to an already-open layout without adding a tab", () => {
        const ws = getWorkspaceStore();
        ws.restoreWorkspace({
          index: makeIndex(),
          loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body-" + id) }),
        });
        // Open id-b so it has a tab, then focus id-a.
        ws.openFromLibrary("id-b");
        ws.switchTo(ws.tabs[0]!.id);
        const tabsBefore = ws.tabs.length;
        const idbTab = ws.tabs.find((t) => t.layoutId === "id-b")!;

        ws.openFromLibrary("id-b");

        expect(ws.tabs.length).toBe(tabsBefore);
        expect(ws.activeId).toBe(idbTab.id);
      });

      it("leaves an unreadable closed body recoverable in the library", () => {
        const ws = getWorkspaceStore();
        ws.restoreWorkspace({
          index: makeIndex(),
          loadBody: (id) =>
            id === "id-a"
              ? { ok: true, layout: bodyFor("id-a", "Alpha") }
              : { ok: false },
        });

        ws.openFromLibrary("id-b");

        // A bad body must not lose the library entry; the tab surfaces the
        // orphan/error state (#2018) rather than vanishing.
        expect(ws.library["id-b"]).toBeDefined();
        const idbTab = ws.tabs.find((t) => t.layoutId === "id-b");
        expect(idbTab?.unreadable).toBe(true);
      });
    });

    describe("deleteLayout", () => {
      it("removes a closed layout from the library set", () => {
        const ws = getWorkspaceStore();
        const deleted: string[] = [];
        ws.restoreWorkspace({
          index: makeIndex(),
          loadBody: (id) => ({ ok: true, layout: bodyFor(id, id) }),
          deleteBody: (id) => deleted.push(id),
        });

        ws.deleteLayout("id-b");

        expect(ws.library["id-b"]).toBeUndefined();
        expect(deleted).toContain("id-b");
        // The closed layout never had a tab, so the open set is untouched.
        expect(ws.tabs.every((t) => t.layoutId !== "id-b")).toBe(true);
      });

      it("removes an open layout from the library and closes its tab", () => {
        const ws = getWorkspaceStore();
        const deleted: string[] = [];
        ws.restoreWorkspace({
          index: makeIndex(),
          loadBody: (id) => ({ ok: true, layout: bodyFor(id, id) }),
          deleteBody: (id) => deleted.push(id),
        });
        ws.openFromLibrary("id-b");
        expect(ws.tabs.some((t) => t.layoutId === "id-b")).toBe(true);

        ws.deleteLayout("id-b");

        expect(ws.library["id-b"]).toBeUndefined();
        expect(deleted).toContain("id-b");
        expect(ws.tabs.some((t) => t.layoutId === "id-b")).toBe(false);
      });
    });

    it("keeps a closed layout retrievable from the library set", () => {
      const ws = getWorkspaceStore();
      ws.restoreWorkspace({
        index: makeIndex(),
        loadBody: (id) => ({ ok: true, layout: bodyFor(id, "Body-" + id) }),
      });
      // Open id-b, then close its tab. It must stay in the library (its name now
      // reflects the loaded body, not the stale index entry).
      ws.openFromLibrary("id-b");
      const idbTab = ws.tabs.find((t) => t.layoutId === "id-b")!;
      ws.closeTab(idbTab.id);

      expect(ws.tabs.some((t) => t.layoutId === "id-b")).toBe(false);
      expect(ws.library["id-b"]?.name).toBe("Body-id-b");
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
