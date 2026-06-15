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

  it("skips a paused layout's body but still records it in the open set", async () => {
    // Pre-seed b's body so we can prove the paused write leaves it untouched.
    await persistBrowserWorkspace({
      tabs: [tab({ layoutId: "b", changesSinceExport: 9 })],
      activeLayoutId: "b",
    });

    await persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" }), tab({ layoutId: "b", changesSinceExport: 1 })],
      activeLayoutId: "a",
      isPaused: (layoutId) => layoutId === "b",
    });

    const index = loadWorkspaceIndex();
    // Both stay in the open set; a was written, b's body was skipped so its
    // pre-seeded durability survives untouched (no clobber of the peer's copy).
    expect(index!.openTabs).toEqual(["a", "b"]);
    expect(index!.library.b.changesSinceExport).toBe(9);
    expect(loadLayoutBody("a").ok).toBe(true);
  });

  it("keeps a paused tab in the library so it survives a persist+reload round-trip", async () => {
    // A tab that is already paused on its first persist never reaches
    // saveLayoutBody, which is the only path that writes its library entry. The
    // index loop must still record it, otherwise its id lands in openTabs with
    // no library entry and loadWorkspaceIndex drops it as dangling on reload,
    // losing the tab even though the peer's body is intact in localStorage.
    await persistBrowserWorkspace({
      tabs: [tab({ layoutId: "a" }), tab({ layoutId: "paused" })],
      activeLayoutId: "a",
      isPaused: (layoutId) => layoutId === "paused",
    });

    // Reload the index the way the next launch would: openTabs is filtered to
    // ids that have a library entry, so a surviving paused id proves the entry
    // was written.
    const index = loadWorkspaceIndex();
    expect(index!.openTabs).toContain("paused");
    expect(index!.library.paused).toBeDefined();
  });

  it("takes the per-layout lock for every hydrated body, not just the active one", async () => {
    const locked: string[] = [];
    const withLayoutLock = async <T>(
      layoutId: string,
      write: () => T,
    ): Promise<T> => {
      locked.push(layoutId);
      return write();
    };

    await persistBrowserWorkspace({
      tabs: [
        tab({ layoutId: "a" }),
        tab({ layoutId: "b" }),
        { layoutId: "shell", hydrated: false, name: "Shell" },
      ],
      activeLayoutId: "a",
      withLayoutLock,
    });

    // Both hydrated bodies (active a and non-active b) ran under their own lock;
    // the unhydrated shell has no body so it is never locked.
    expect(locked).toEqual(["a", "b"]);
    expect(loadLayoutBody("a").ok).toBe(true);
    expect(loadLayoutBody("b").ok).toBe(true);
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
