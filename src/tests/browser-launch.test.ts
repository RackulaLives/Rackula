import { describe, it, expect, beforeEach } from "vitest";
import type { Layout } from "$lib/types";
import { resolveBrowserLaunch } from "$lib/storage/browser-launch";
import { createTestLayout } from "./factories";

const WORKSPACE_KEY = "Rackula:workspace";
const EVER_KEY = "Rackula:everHadLayouts";
const AUTOSAVE_KEY = "Rackula:autosave";
const bodyKey = (id: string) => `Rackula:layout:${id}`;

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
  return createTestLayout({
    name,
    metadata: { id, name, schema_version: "1.0" },
  });
}

function seedAutosave(id: string, name: string): void {
  localStorageMock.setItem(
    AUTOSAVE_KEY,
    JSON.stringify({
      layout: makeLayout(id, name),
      savedAt: "2026-06-14T09:00:00.000Z",
      changesSinceExport: 0,
      hasEverExported: false,
      storageMode: "browser",
    }),
  );
}

describe("resolveBrowserLaunch", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("routes to the fresh-install empty state when nothing is stored", () => {
    const result = resolveBrowserLaunch();
    expect(result.action).toBe("empty");
    expect(result.everHadLayouts).toBe(false);
  });

  it("adopts a legacy autosave and routes to restore", () => {
    seedAutosave("uuid-old", "Migrated");

    const result = resolveBrowserLaunch();

    expect(result.action).toBe("restore");
    if (result.action === "restore") {
      expect(result.index.openTabs).toEqual(["uuid-old"]);
      expect(result.index.activeId).toBe("uuid-old");
      // loadBody resolves the adopted body.
      const body = result.loadBody("uuid-old");
      expect(body.ok).toBe(true);
      if (body.ok) expect(body.layout.name).toBe("Migrated");
    }
    // Legacy slot consumed.
    expect(localStorageMock.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it("restores an existing multi-layout workspace without adoption", () => {
    localStorageMock.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeId: "a",
        openTabs: ["a", "b"],
        library: {
          a: { name: "Alpha", changesSinceExport: 0, storageMode: "browser" },
          b: { name: "Beta", changesSinceExport: 0, storageMode: "browser" },
        },
      }),
    );
    localStorageMock.setItem(
      bodyKey("a"),
      JSON.stringify({ schemaVersion: 2, layout: makeLayout("a", "Alpha") }),
    );

    const result = resolveBrowserLaunch();
    expect(result.action).toBe("restore");
    if (result.action === "restore") {
      expect(result.index.openTabs).toEqual(["a", "b"]);
    }
  });

  it("routes to empty when a returning user's workspace has no open tabs (lost data)", () => {
    localStorageMock.setItem(EVER_KEY, "1");
    localStorageMock.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeId: null,
        openTabs: [],
        library: {},
      }),
    );

    const result = resolveBrowserLaunch();
    expect(result.action).toBe("empty");
    expect(result.everHadLayouts).toBe(true);
  });

  it("does not adopt when a workspace already exists", () => {
    seedAutosave("uuid-old", "Should not migrate");
    localStorageMock.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeId: "a",
        openTabs: ["a"],
        library: {
          a: { name: "Existing", changesSinceExport: 0, storageMode: "browser" },
        },
      }),
    );

    const result = resolveBrowserLaunch();
    expect(result.action).toBe("restore");
    // Autosave untouched because adoption did not run.
    expect(localStorageMock.getItem(AUTOSAVE_KEY)).not.toBeNull();
  });
});
