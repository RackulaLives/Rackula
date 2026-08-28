import { describe, it, expect, beforeEach } from "vitest";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
  type WorkspaceTab,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
  createTestCatalogueEntry,
} from "./factories";
import {
  buildLayoutRows,
  nextDuplicateName,
  UNTITLED_LAYOUT_NAME,
  type CatalogueEntry,
} from "$lib/components/layouts-library";

/** Browser-mode catalogue shape, mirroring what the panel passes (#3151). */
function entriesFrom(
  library: Readonly<Record<string, { name: string }>>,
): CatalogueEntry[] {
  return Object.entries(library).map(([id, entry]) =>
    createTestCatalogueEntry({ id, name: entry.name }),
  );
}

/** Browser-mode open-id resolution: the tab record owns the identity. */
const byTabLayoutId = (t: WorkspaceTab) => t.layoutId;

describe("buildLayoutRows", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
  });

  it("returns one row per open tab, flagging the active tab", () => {
    const ws = getWorkspaceStore();
    const firstId = ws.activeId;
    const secondId = ws.openTab(createLayout("Homelab"));

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );

    expect(rows.map((r) => r.tabId)).toEqual([firstId, secondId]);
    expect(rows.find((r) => r.tabId === secondId)?.isActive).toBe(true);
    expect(rows.find((r) => r.tabId === firstId)?.isActive).toBe(false);
  });

  it("marks every open-tab row as open", () => {
    const ws = getWorkspaceStore();
    ws.openTab(createLayout("Homelab"));

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );

    expect(rows.every((r) => r.isOpen)).toBe(true);
  });

  it("reports the layout name and rack/device counts for each open row", () => {
    const ws = getWorkspaceStore();
    const layout = createTestLayout({
      name: "Rack Room",
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({ id: "d1", position: 1 }),
            createTestDevice({ id: "d2", position: 3 }),
          ],
        }),
        createTestRack({
          id: "rack-2",
          devices: [createTestDevice({ id: "d3", position: 1 })],
        }),
      ],
    });
    const tabId = ws.openTab(layout);

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );
    const row = rows.find((r) => r.tabId === tabId);

    expect(row?.name).toBe("Rack Room");
    expect(row?.rackCount).toBe(2);
    expect(row?.deviceCount).toBe(3);
  });

  it("falls back to a placeholder name for an unnamed open layout", () => {
    const ws = getWorkspaceStore();
    const tabId = ws.openTab(createTestLayout({ name: "" }));

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );

    expect(rows.find((r) => r.tabId === tabId)?.name).toBe("Untitled layout");
  });

  it("lists a saved layout that has no open tab as a closed row", () => {
    const ws = getWorkspaceStore();
    ws.restoreWorkspace({
      index: {
        activeId: "open-id",
        openTabs: ["open-id"],
        library: {
          "open-id": {
            name: "Open One",
            changesSinceExport: 0,
            hasEverExported: false,
          },
          "closed-id": {
            name: "Closed One",
            changesSinceExport: 0,
            hasEverExported: false,
          },
        },
      },
      loadBody: (id) => ({
        ok: true,
        layout: { ...createLayout(id), metadata: { id, name: id } },
      }),
    });

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );
    const closed = rows.find((r) => r.layoutId === "closed-id");
    const open = rows.find((r) => r.layoutId === "open-id");

    expect(closed).toBeDefined();
    expect(closed?.isOpen).toBe(false);
    expect(closed?.name).toBe("Closed One");
    expect(open?.isOpen).toBe(true);
  });

  it("does not duplicate a layout that is both in the library and open", () => {
    const ws = getWorkspaceStore();
    ws.restoreWorkspace({
      index: {
        activeId: "open-id",
        openTabs: ["open-id"],
        library: {
          "open-id": {
            name: "Open One",
            changesSinceExport: 0,
            hasEverExported: false,
          },
        },
      },
      loadBody: (id) => ({
        ok: true,
        layout: { ...createLayout(id), metadata: { id, name: id } },
      }),
    });

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      entriesFrom(ws.library),
      byTabLayoutId,
    );
    const matching = rows.filter((r) => r.layoutId === "open-id");

    // eslint-disable-next-line no-restricted-syntax -- one library layout that is open must yield exactly one row, never an open + closed pair
    expect(matching).toHaveLength(1);
    expect(matching[0]?.isOpen).toBe(true);
  });

  it("resolves open ids through the injected resolver, not tab.layoutId", () => {
    const ws = getWorkspaceStore();
    // Server mode's shape: a tab whose body carries the server id while the tab
    // record has no layoutId, because no server load path sets one.
    ws.clearThenLoad(ws.activeId, createLayout("Homelab"));
    const openId = ws.activeStore.layout.metadata?.id ?? "";
    const catalogue = [
      createTestCatalogueEntry({ id: openId, name: "Homelab" }),
    ];

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      catalogue,
      (t) => t.store.layout.metadata?.id,
    );

    expect(
      rows.filter((r) => r.layoutId === openId).map((r) => r.isOpen),
    ).toEqual([true]);
  });

  it("carries counts and validity from catalogue entries onto closed rows", () => {
    const ws = getWorkspaceStore();
    const catalogue = [
      createTestCatalogueEntry({
        id: "srv-1",
        name: "Closet",
        rackCount: 3,
        deviceCount: 11,
        valid: true,
      }),
      createTestCatalogueEntry({ id: "srv-2", name: "Broken", valid: false }),
    ];

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      catalogue,
      (t) => t.layoutId,
    );

    const closet = rows.find((r) => r.layoutId === "srv-1");
    expect(closet?.rackCount).toBe(3);
    expect(closet?.deviceCount).toBe(11);
    expect(rows.find((r) => r.layoutId === "srv-2")?.valid).toBe(false);
  });

  it("treats a catalogue entry with no validity flag as valid", () => {
    const ws = getWorkspaceStore();

    const rows = buildLayoutRows(
      ws.tabs,
      ws.activeId,
      [createTestCatalogueEntry({ id: "local-1", name: "Local" })],
      (t) => t.layoutId,
    );

    expect(rows.find((r) => r.layoutId === "local-1")?.valid).toBe(true);
  });
});

describe("nextDuplicateName", () => {
  it("appends ' Copy' when no copy exists yet", () => {
    expect(nextDuplicateName(["Homelab"], "Homelab")).toBe("Homelab Copy");
  });

  it("numbers subsequent copies to avoid collisions", () => {
    expect(nextDuplicateName(["Homelab", "Homelab Copy"], "Homelab")).toBe(
      "Homelab Copy 2",
    );
    expect(
      nextDuplicateName(
        ["Homelab", "Homelab Copy", "Homelab Copy 2"],
        "Homelab",
      ),
    ).toBe("Homelab Copy 3");
  });

  it("treats names case-insensitively when detecting collisions", () => {
    expect(nextDuplicateName(["homelab copy"], "Homelab")).toBe(
      "Homelab Copy 2",
    );
  });

  it("trims a whitespace-padded base name before appending Copy", () => {
    expect(nextDuplicateName(["Homelab"], "  Homelab  ")).toBe("Homelab Copy");
  });

  it("detects a collision against the trimmed base name", () => {
    expect(nextDuplicateName(["Homelab Copy"], " Homelab ")).toBe(
      "Homelab Copy 2",
    );
  });

  it("falls back to the untitled placeholder for a blank base name", () => {
    expect(nextDuplicateName([], "   ")).toBe(`${UNTITLED_LAYOUT_NAME} Copy`);
  });
});
