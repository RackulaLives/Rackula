import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Layout } from "$lib/types";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
  loadLayoutBody,
  saveLayoutBody,
  deleteLayoutBody,
  hasEverHadLayouts,
  markEverHadLayouts,
  adoptLegacyAutosave,
  type WorkspaceIndex,
} from "$lib/storage/browser-workspace";
import { detectForeignLayoutWrite } from "$lib/storage/twin-tab-guard";
import { createTestRack } from "./factories";

const WORKSPACE_KEY = "Rackula:workspace";
const AUTOSAVE_KEY = "Rackula:autosave";
const bodyKey = (id: string) => `Rackula:layout:${id}`;

// In-memory localStorage stand-in.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

function makeLayout(id: string, name: string): Layout {
  return {
    version: "1.0",
    name,
    racks: [createTestRack({ id: "rack-0", name: "R" })],
    device_types: [],
    settings: { display_mode: "label", show_labels_on_images: false },
    metadata: { id, name, schema_version: "1.0" },
  } as Layout;
}

function makeIndex(over: Partial<WorkspaceIndex> = {}): WorkspaceIndex {
  return {
    schemaVersion: 2,
    activeId: "a",
    openTabs: ["a"],
    library: {
      a: {
        name: "Homelab",
        updatedAt: "2026-06-14T09:00:00.000Z",
        changesSinceExport: 0,
        hasEverExported: true,
        writeFailed: false,
        storageMode: "browser",
      },
    },
    ...over,
  };
}

describe("browser-workspace storage", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("index round-trip", () => {
    it("saves and loads the workspace index", () => {
      const index = makeIndex();
      expect(saveWorkspaceIndex(index)).toBe(true);
      expect(loadWorkspaceIndex()).toEqual(index);
    });

    it("returns null when no index exists", () => {
      expect(loadWorkspaceIndex()).toBeNull();
    });
  });

  describe("defensive index parsing (untrusted localStorage)", () => {
    it("returns null on invalid JSON", () => {
      localStorage.setItem(WORKSPACE_KEY, "{not json");
      expect(loadWorkspaceIndex()).toBeNull();
    });

    it("returns null when the parsed value is not an object", () => {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify([1, 2, 3]));
      expect(loadWorkspaceIndex()).toBeNull();
    });

    it("returns null when openTabs is not an array", () => {
      localStorage.setItem(
        WORKSPACE_KEY,
        JSON.stringify({ ...makeIndex(), openTabs: "a" }),
      );
      expect(loadWorkspaceIndex()).toBeNull();
    });

    it("drops openTabs ids that have no library entry", () => {
      const loaded = saveWorkspaceIndex(
        makeIndex({ openTabs: ["a", "ghost"], activeId: "a" }),
      );
      expect(loaded).toBe(true);
      const index = loadWorkspaceIndex();
      expect(index!.openTabs).toEqual(["a"]);
    });

    it("falls back activeId to the first open tab when it is not open", () => {
      saveWorkspaceIndex(makeIndex({ activeId: "ghost", openTabs: ["a"] }));
      const index = loadWorkspaceIndex();
      expect(index!.activeId).toBe("a");
    });

    it("ignores a prototype-polluting library key without corrupting Object.prototype", () => {
      localStorage.setItem(
        WORKSPACE_KEY,
        JSON.stringify({
          schemaVersion: 2,
          activeId: "a",
          openTabs: ["a", "__proto__"],
          library: {
            a: { name: "Safe", changesSinceExport: 0, storageMode: "browser" },
            __proto__: { name: "evil", polluted: true },
          },
        }),
      );
      const index = loadWorkspaceIndex();
      expect(index).not.toBeNull();
      // The hostile key is dropped from both library and openTabs.
      expect(index!.openTabs).toEqual(["a"]);
      // Object.prototype is untouched.
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("coerces a malformed library entry into safe defaults", () => {
      localStorage.setItem(
        WORKSPACE_KEY,
        JSON.stringify({
          schemaVersion: 2,
          activeId: "a",
          openTabs: ["a"],
          library: { a: { name: 123, changesSinceExport: "lots" } },
        }),
      );
      const index = loadWorkspaceIndex();
      expect(index).not.toBeNull();
      const entry = index!.library.a;
      expect(typeof entry.name).toBe("string");
      expect(entry.changesSinceExport).toBe(0);
      expect(entry.hasEverExported).toBe(false);
      expect(entry.storageMode).toBe("browser");
    });
  });

  describe("body round-trip", () => {
    it("saves a body and updates the index entry", () => {
      saveWorkspaceIndex(makeIndex());
      const layout = makeLayout("a", "Homelab");
      expect(saveLayoutBody("a", layout, { changesSinceExport: 3 })).toBe(true);

      const result = loadLayoutBody("a");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.layout.name).toBe("Homelab");

      const index = loadWorkspaceIndex();
      expect(index!.library.a.changesSinceExport).toBe(3);
    });

    it("stamps the writer tab id so a peer detects the write as foreign without corrupting the body (#2044)", () => {
      saveLayoutBody("a", makeLayout("a", "Homelab"), {
        changesSinceExport: 0,
      });

      // The peer reads the raw body off localStorage and runs the guard's
      // detection against a different tab id: this real write must register as a
      // foreign write for layout "a".
      const newValue = localStorage.getItem(bodyKey("a"));
      const result = detectForeignLayoutWrite(
        { key: bodyKey("a"), newValue },
        "a-different-tab",
      );
      expect(result).toEqual({ foreign: true, layoutId: "a" });

      // The stamp is a sibling of the layout, so loadLayoutBody still returns a
      // clean layout (the writerTabId never reaches the schema/body).
      const loaded = loadLayoutBody("a");
      expect(loaded.ok).toBe(true);
      if (loaded.ok) expect(loaded.layout.name).toBe("Homelab");
    });

    it("returns unreadable for a missing body", () => {
      expect(loadLayoutBody("nope").ok).toBe(false);
    });

    it("returns unreadable for a corrupt body", () => {
      localStorage.setItem(bodyKey("a"), "garbage{");
      expect(loadLayoutBody("a").ok).toBe(false);
    });

    it("runs migrateLayout on the loaded body (legacy rack -> racks)", () => {
      localStorage.setItem(
        bodyKey("a"),
        JSON.stringify({
          schemaVersion: 2,
          layout: {
            version: "0.6.16",
            name: "Legacy",
            rack: { id: "rack-1", name: "Main", height: 42, devices: [] },
            device_types: [],
            settings: { display_mode: "label", show_labels_on_images: false },
          },
          savedAt: "2026-06-14T09:00:00.000Z",
        }),
      );
      const result = loadLayoutBody("a");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.layout.racks).toBeDefined();
        expect((result.layout as Record<string, unknown>).rack).toBeUndefined();
      }
    });

    it("does not re-migrate positions when a legacy body is loaded twice", () => {
      // A pre-0.7.0 body: positions are U-values (1, 10) that migrate to
      // internal units (x6). Loading the body twice must not multiply twice;
      // migrateLayout stamps the current version so it is idempotent.
      localStorage.setItem(
        bodyKey("a"),
        JSON.stringify({
          schemaVersion: 2,
          layout: {
            version: "0.6.16",
            name: "Legacy",
            racks: [
              {
                id: "rack-1",
                name: "Main",
                height: 42,
                devices: [
                  {
                    id: "d1",
                    device_type: "server",
                    position: 1,
                    face: "front",
                  },
                ],
              },
            ],
            device_types: [],
            settings: { display_mode: "label", show_labels_on_images: false },
          },
          savedAt: "2026-06-14T09:00:00.000Z",
        }),
      );

      const first = loadLayoutBody("a");
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const firstPos = first.layout.racks[0]!.devices[0]!.position;

      // Persist the (now migrated) body back, then load it again. The second
      // load must yield the same position, not a doubly-migrated one.
      saveLayoutBody("a", first.layout, { changesSinceExport: 0 });
      const second = loadLayoutBody("a");
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.layout.racks[0]!.devices[0]!.position).toBe(firstPos);
    });

    it("propagates a quota failure from saveLayoutBody", () => {
      saveWorkspaceIndex(makeIndex());
      const original = localStorage.setItem;
      // Fail only the body write, not the index write.
      localStorage.setItem = vi.fn((key: string, value: string) => {
        if (key === bodyKey("a")) {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        original.call(localStorage, key, value);
      });
      expect(
        saveLayoutBody("a", makeLayout("a", "Homelab"), {
          changesSinceExport: 0,
        }),
      ).toBe(false);
      localStorage.setItem = original;
    });

    it("deletes a body key and its library entry", () => {
      saveWorkspaceIndex(makeIndex());
      saveLayoutBody("a", makeLayout("a", "Homelab"), {
        changesSinceExport: 0,
      });
      deleteLayoutBody("a");
      expect(loadLayoutBody("a").ok).toBe(false);
      expect(loadWorkspaceIndex()!.library.a).toBeUndefined();
    });
  });

  describe("everHadLayouts marker", () => {
    it("is false before any layout exists", () => {
      expect(hasEverHadLayouts()).toBe(false);
    });

    it("is true after marking and survives an index wipe", () => {
      markEverHadLayouts();
      expect(hasEverHadLayouts()).toBe(true);
      localStorage.removeItem(WORKSPACE_KEY);
      expect(hasEverHadLayouts()).toBe(true);
    });
  });

  describe("one-time adoption off Rackula:autosave", () => {
    it("returns null when there is neither a workspace nor an autosave", () => {
      expect(adoptLegacyAutosave()).toBeNull();
    });

    it("does not run when a workspace index already exists", () => {
      saveWorkspaceIndex(makeIndex());
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({ layout: makeLayout("a", "Old"), savedAt: "x" }),
      );
      // Adoption is a no-op: it returns null and leaves the autosave in place
      // (the existing index is authoritative).
      expect(adoptLegacyAutosave()).toBeNull();
      expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
    });

    it("adopts an autosave into a single-tab workspace and removes the legacy slot", () => {
      const layout = makeLayout("uuid-old", "Migrated");
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({
          layout,
          savedAt: "2026-06-14T09:00:00.000Z",
          changesSinceExport: 2,
          hasEverExported: true,
          storageMode: "browser",
        }),
      );

      const index = adoptLegacyAutosave();
      expect(index).not.toBeNull();
      expect(index!.openTabs).toEqual(["uuid-old"]);
      expect(index!.activeId).toBe("uuid-old");
      expect(index!.library["uuid-old"].name).toBe("Migrated");
      expect(index!.library["uuid-old"].changesSinceExport).toBe(2);
      expect(index!.library["uuid-old"].hasEverExported).toBe(true);

      // Index and body landed.
      expect(loadWorkspaceIndex()).not.toBeNull();
      const body = loadLayoutBody("uuid-old");
      expect(body.ok).toBe(true);

      // Legacy slot removed after both writes succeeded.
      expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
      // Returning-user marker set.
      expect(hasEverHadLayouts()).toBe(true);
    });

    it("keeps the legacy slot intact when the body write fails (never delete the only copy)", () => {
      const layout = makeLayout("uuid-old", "Migrated");
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({ layout, savedAt: "2026-06-14T09:00:00.000Z" }),
      );
      const original = localStorage.setItem;
      localStorage.setItem = vi.fn((key: string, value: string) => {
        if (key.startsWith("Rackula:layout:")) {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        original.call(localStorage, key, value);
      });

      expect(adoptLegacyAutosave()).toBeNull();
      localStorage.setItem = original;

      // The durable fallback survives; nothing was migrated.
      expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
      expect(loadWorkspaceIndex()).toBeNull();
    });

    it("mints an id when the autosaved layout has no metadata id", () => {
      const layout = makeLayout("", "NoId");
      delete (layout as { metadata?: unknown }).metadata;
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({ layout, savedAt: "2026-06-14T09:00:00.000Z" }),
      );
      const index = adoptLegacyAutosave();
      expect(index).not.toBeNull();
      const id = index!.activeId;
      expect(id).toBeTruthy();
      expect(id!.length).toBeGreaterThan(0);
      expect(index!.openTabs).toEqual([id]);
      expect(loadLayoutBody(id!).ok).toBe(true);
    });
  });
});
