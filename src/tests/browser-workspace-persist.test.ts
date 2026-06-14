import { describe, it, expect, beforeEach } from "vitest";
import type { Layout } from "$lib/types";
import {
  persistBrowserWorkspace,
  type PersistTab,
} from "$lib/storage/browser-workspace-persist";
import {
  loadWorkspaceIndex,
  loadLayoutBody,
} from "$lib/storage/browser-workspace";

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
    racks: [{ id: "rack-0", name: "R", height: 42, devices: [] }],
    device_types: [],
    settings: { display_mode: "label", show_labels_on_images: false },
    metadata: { id, name, schema_version: "1.0" },
  } as Layout;
}

function tab(over: Partial<PersistTab> & { layoutId: string }): PersistTab {
  return {
    hydrated: true,
    layout: makeLayout(over.layoutId, "Layout " + over.layoutId),
    changesSinceExport: 0,
    hasEverExported: false,
    ...over,
  };
}

describe("persistBrowserWorkspace", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("writes the ordered open set and active id to the index", () => {
    persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" }), tab({ layoutId: "b" })],
      activeLayoutId: "b",
    });

    const index = loadWorkspaceIndex();
    expect(index).not.toBeNull();
    expect(index!.openTabs).toEqual(["a", "b"]);
    expect(index!.activeId).toBe("b");
  });

  it("writes each hydrated tab's body so a later launch can restore it", () => {
    persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" })],
      activeLayoutId: "a",
    });
    const body = loadLayoutBody("a");
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.layout.name).toBe("Layout a");
  });

  it("carries per-tab durability into the library entries", () => {
    persistBrowserWorkspace({
      tabs: [
        tab({ layoutId: "a", changesSinceExport: 4, hasEverExported: true }),
      ],
      activeLayoutId: "a",
    });
    const entry = loadWorkspaceIndex()!.library.a;
    expect(entry.changesSinceExport).toBe(4);
    expect(entry.hasEverExported).toBe(true);
  });

  it("keeps an unhydrated shell in the open set without rewriting its body", () => {
    // Pre-seed a body for the shell so we can prove it is left untouched.
    persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" })],
      activeLayoutId: "a",
    });

    // Now persist with the shell present but unhydrated (no layout to write).
    persistBrowserWorkspace({
      tabs: [
        tab({ layoutId: "a" }),
        { layoutId: "shell", hydrated: false, name: "Shell" },
      ],
      activeLayoutId: "a",
    });

    const index = loadWorkspaceIndex();
    expect(index!.openTabs).toEqual(["a", "shell"]);
    // The shell keeps a library entry carrying its name (so the tab shell can
    // still render on the next launch) but no body was written for it.
    expect(index!.library.shell.name).toBe("Shell");
    expect(loadLayoutBody("shell").ok).toBe(false);
  });

  it("keeps a closed layout's durable copy when it leaves the open set", () => {
    persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" }), tab({ layoutId: "b" })],
      activeLayoutId: "a",
    });
    expect(loadLayoutBody("b").ok).toBe(true);

    // b is closed: persist without it. Closing keeps the durable copy (spike
    // #2179: only openTabs loses the id; the library entry and body survive so
    // the layout can be reopened from the sidebar).
    persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" })],
      activeLayoutId: "a",
    });

    const index = loadWorkspaceIndex();
    expect(index!.openTabs).toEqual(["a"]);
    expect(index!.library.b).toBeDefined();
    expect(loadLayoutBody("b").ok).toBe(true);
  });
});
