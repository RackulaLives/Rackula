import { describe, it, expect, beforeEach } from "vitest";
import {
  partitionTabs,
  tabHasClose,
  type PartitionTab,
} from "$lib/components/layout-tabs";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";

const TAB_WIDTH = 160;

function tabs(...ids: string[]): PartitionTab[] {
  return ids.map((id) => ({ id }));
}

describe("partitionTabs", () => {
  it("keeps every tab visible when they all fit", () => {
    const all = tabs("a", "b", "c");
    const { visible, hidden } = partitionTabs(
      all,
      "a",
      TAB_WIDTH * 3,
      TAB_WIDTH,
    );

    expect(visible.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(hidden).toEqual([]);
  });

  it("overflows the tabs that exceed the available width", () => {
    const all = tabs("a", "b", "c", "d", "e");
    // Room for two tabs only.
    const { visible, hidden } = partitionTabs(
      all,
      "a",
      TAB_WIDTH * 2,
      TAB_WIDTH,
    );

    expect(visible.map((t) => t.id)).toEqual(["a", "b"]);
    expect(hidden.map((t) => t.id)).toEqual(["c", "d", "e"]);
  });

  it("always keeps the active tab visible even when it sits past the fold", () => {
    const all = tabs("a", "b", "c", "d", "e");
    // Room for two tabs, but the active tab is the last one.
    const { visible, hidden } = partitionTabs(
      all,
      "e",
      TAB_WIDTH * 2,
      TAB_WIDTH,
    );

    expect(visible.some((t) => t.id === "e")).toBe(true);
    expect(hidden.some((t) => t.id === "e")).toBe(false);
  });

  it("hidden count always equals total minus visible", () => {
    const all = tabs("a", "b", "c", "d", "e", "f");
    for (const activeId of ["a", "c", "f"]) {
      for (const width of [0, TAB_WIDTH, TAB_WIDTH * 3, TAB_WIDTH * 10]) {
        const { visible, hidden } = partitionTabs(
          all,
          activeId,
          width,
          TAB_WIDTH,
        );
        expect(hidden.length).toBe(all.length - visible.length);
        expect(visible.some((t) => t.id === activeId)).toBe(true);
      }
    }
  });

  it("pins the active tab when the lane is narrower than a single tab", () => {
    const all = tabs("a", "b", "c");
    const { visible, hidden } = partitionTabs(all, "b", 10, TAB_WIDTH);

    expect(visible.map((t) => t.id)).toEqual(["b"]);
    expect(hidden.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("returns empty sets for no tabs", () => {
    const { visible, hidden } = partitionTabs([], "a", TAB_WIDTH, TAB_WIDTH);
    expect(visible).toEqual([]);
    expect(hidden).toEqual([]);
  });
});

describe("tabHasClose", () => {
  it("hides the close affordance on the sole remaining tab", () => {
    expect(tabHasClose(1)).toBe(false);
  });

  it("exposes a close affordance once more than one tab is open", () => {
    expect(tabHasClose(2)).toBe(true);
    expect(tabHasClose(5)).toBe(true);
  });
});

describe("layout tab strip behaviour through the workspace store", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
  });

  it("the new-layout + adds an open tab and makes it active", () => {
    const ws = getWorkspaceStore();
    const firstId = ws.activeId;

    // The "+" calls openTab() with no layout: a fresh blank tab, activated.
    const newId = ws.openTab();

    expect(newId).not.toBe(firstId);
    expect(ws.activeId).toBe(newId);
    expect(ws.tabs.map((t) => t.id)).toContain(firstId);
    expect(ws.tabs.map((t) => t.id)).toContain(newId);
  });

  it("closing a non-last tab removes it from the open set and keeps the others", () => {
    const ws = getWorkspaceStore();
    const firstId = ws.activeId;
    const secondId = ws.openTab(createLayout("Homelab"));
    const thirdId = ws.openTab(createLayout("Rack 2"));

    ws.closeTab(secondId);

    const openIds = ws.tabs.map((t) => t.id);
    expect(openIds).not.toContain(secondId);
    expect(openIds).toContain(firstId);
    expect(openIds).toContain(thirdId);
  });

  it("never closes the sole remaining tab away (canvas always has an active layout)", () => {
    const ws = getWorkspaceStore();
    const onlyId = ws.activeId;

    // The close control is hidden on the last tab; even if closeTab is reached,
    // the workspace replaces it with a fresh tab rather than going empty.
    ws.closeTab(onlyId);

    // The workspace never goes empty: a sole tab closed is replaced, not removed.
    expect(ws.tabs.length).toBeGreaterThan(0);
    expect(ws.activeId).toBe(ws.tabs[0]!.id);
    expect(tabHasClose(ws.tabs.length)).toBe(false);
  });

  it("inline rename updates the active layout's name via the store", () => {
    const ws = getWorkspaceStore();
    ws.openTab(createLayout("Homelab"));

    ws.activeStore.setLayoutName("Renamed Lab");

    expect(ws.activeStore.layout.name).toBe("Renamed Lab");
  });
});
