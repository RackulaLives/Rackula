import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("$lib/storage/server-library.svelte", () => ({
  upsertServerLibraryItem: vi.fn(),
  removeServerLibraryItem: vi.fn(),
  refreshServerLibrary: vi.fn(),
  getServerLibrary: () => ({ items: [], status: "idle" }),
}));
vi.mock("$lib/storage/api", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/storage/api")>(
      "$lib/storage/api",
    );
  return { ...actual, saveLayoutToServer: vi.fn() };
});

// Import order matters: the module under test must load before the mocked
// modules it imports, or its own bindings resolve to the unmocked instances.
import {
  finalizeSuccessfulSave,
  handleSaveToServer,
  abandonWorkingCopy,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { upsertServerLibraryItem } from "$lib/storage/server-library.svelte";
import { saveLayoutToServer } from "$lib/storage/api";
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "$lib/storage/server-base";
import {
  saveSession,
  clearSession,
  loadSessionWithTimestamp,
} from "$lib/storage/working-copy";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";
import { createTestRack, createTestDevice } from "./factories";
import type { Layout } from "$lib/types";

/** A layout with real racks and devices, so the recorded counts are non-zero. */
function populatedLayout(name = "Homelab"): Layout {
  return {
    ...createLayout(name),
    racks: [
      createTestRack({
        id: "rack-1",
        devices: [
          createTestDevice({ id: "device-1", position: 1 }),
          createTestDevice({ id: "device-2", position: 3 }),
        ],
      }),
      createTestRack({
        id: "rack-2",
        devices: [createTestDevice({ id: "device-3", position: 5 })],
      }),
    ],
  };
}

/** A saveLayoutToServer whose PUT stays in flight until the returned settle() runs. */
function deferSave(): (updatedAt: string) => void {
  let settle!: (result: { id: string; updatedAt: string }) => void;
  vi.mocked(saveLayoutToServer).mockReturnValue(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  return (updatedAt: string) => settle({ id: "srv-1", updatedAt });
}

/**
 * Run the mid-flight replacement race: layout A's PUT is still on the wire
 * when a server layout replaces the working copy, which is what loadFromApi
 * does, minus the network. loadFromApi does not bump the schedule id, so A's
 * save still finalizes as current against a working copy it never wrote.
 *
 * Resolves with A's layout id once A's save has finalized.
 */
async function replaceWorkingCopyMidSave(): Promise<string | undefined> {
  const ws = getWorkspaceStore();
  const layoutStore = getLayoutStore();
  ws.openTab(populatedLayout("Homelab"));
  const savedId = ws.activeStore.layout.metadata?.id;
  setServerBaseUpdatedAt("2026-08-22T09:00:00.000Z");
  const settle = deferSave();

  const inFlight = handleSaveToServer();
  layoutStore.loadLayout({
    ...createLayout("Office Rack"),
    racks: [createTestRack({ id: "rack-9" })],
  });
  // The state loadFromApi leaves behind: the opened layout's own base and a
  // cleared session slot, plus an edit the user has made to it since.
  setServerBaseUpdatedAt("2026-08-22T09:30:00.000Z");
  clearSession();
  layoutStore.markDirty();
  settle("2026-08-22T10:00:00.000Z");
  await inFlight;
  return savedId;
}

describe("save wiring to the server catalogue", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    clearSession();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records the saved layout, with its rack and device counts, when the server returns a timestamp", () => {
    const ws = getWorkspaceStore();
    const saved = populatedLayout();
    ws.openTab(saved);
    const id = ws.activeStore.layout.metadata?.id;

    finalizeSuccessfulSave(true, "2026-08-22T10:00:00.000Z", {
      layout: saved,
    });

    // The counts render straight into the Layouts panel row meta, so the
    // reduce over racks is asserted against real racks and devices, not the
    // 0/0 an empty layout would report either way.
    expect(upsertServerLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        name: "Homelab",
        valid: true,
        rackCount: 2,
        deviceCount: 3,
      }),
    );
  });

  it("skips the catalogue update when the server returned no new timestamp", () => {
    const ws = getWorkspaceStore();
    const saved = createLayout("Homelab");
    ws.openTab(saved);

    finalizeSuccessfulSave(true, null, { layout: saved });

    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });

  it("skips the catalogue update for a stale save even when the server returns a timestamp", () => {
    // clearDirtyState is false for a settling save whose captured snapshot is
    // older than the live layout (newer edits arrived while it was in flight).
    // The follow-up save that made this one stale will upsert instead.
    const ws = getWorkspaceStore();
    const saved = createLayout("Homelab");
    ws.openTab(saved);

    finalizeSuccessfulSave(false, "2026-08-22T10:00:00.000Z", {
      layout: saved,
    });

    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });

  it("records the layout the save actually sent, not the one that replaced the working copy", () => {
    // loadFromApi replaces the working copy without bumping the schedule id,
    // so a save still "current" by schedule id can finalize against a layout
    // it never wrote. The row must describe what was PUT (#3151).
    const ws = getWorkspaceStore();
    const layoutStore = getLayoutStore();
    ws.openTab(populatedLayout("Homelab"));
    const savedId = ws.activeStore.layout.metadata?.id;
    const settle = deferSave();

    const inFlight = handleSaveToServer();
    // A server layout is opened while the PUT is on the wire: one rack, no
    // devices, a different name and id.
    layoutStore.loadLayout({
      ...createLayout("Office Rack"),
      racks: [createTestRack({ id: "rack-9" })],
    });
    settle("2026-08-22T10:00:00.000Z");

    return inFlight.then(() => {
      expect(upsertServerLibraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: savedId,
          name: "Homelab",
          rackCount: 2,
          deviceCount: 3,
        }),
      );
    });
  });

  it("advances the base for a stale save of the layout that is still open (#2926)", () => {
    const ws = getWorkspaceStore();
    const saved = populatedLayout("Homelab");
    ws.openTab(saved);
    setServerBaseUpdatedAt("2026-08-22T09:00:00.000Z");

    // Stale, but the same working copy: newer edits arrived while the PUT was
    // in flight. The echo is still this tab's own write against the layout
    // that is still open, so the base must advance or a reconcile before the
    // follow-up save sees false divergence against it (#2926).
    finalizeSuccessfulSave(false, "2026-08-22T10:00:00.000Z", {
      layout: saved,
    });

    expect(getServerBaseUpdatedAt()).toBe("2026-08-22T10:00:00.000Z");
  });

  it("leaves the base, the dirty flag and the session alone when the working copy was replaced mid-flight", async () => {
    const layoutStore = getLayoutStore();

    await replaceWorkingCopyMidSave();

    // The base still belongs to the layout that is open now. Applying the
    // saved layout's echo would hand the next save of the open layout an
    // optimistic-concurrency timestamp that was never its own.
    expect(getServerBaseUpdatedAt()).toBe("2026-08-22T09:30:00.000Z");
    // The edit made to the layout that replaced the working copy is still
    // unsaved, and its session slot must not be rewritten under the saved
    // layout's base.
    expect(layoutStore.isDirty).toBe(true);
    expect(loadSessionWithTimestamp()).toBeNull();
  });

  it("still records the saved layout in the catalogue when the working copy was replaced mid-flight", async () => {
    // The half that stays independent of the guard above: the PUT did reach
    // the server, so the catalogue row for the layout it wrote is correct and
    // must still be recorded even though nothing is written back locally.
    const savedId = await replaceWorkingCopyMidSave();

    expect(upsertServerLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: savedId,
        name: "Homelab",
        updatedAt: "2026-08-22T10:00:00.000Z",
        rackCount: 2,
        deviceCount: 3,
      }),
    );
  });

  it("writes nothing back when a save settles after the working copy was abandoned", async () => {
    // The user deletes the open layout while its PUT is still on the wire.
    // Re-stamping the base or re-writing the session would leave a working
    // copy for a layout the server no longer has, which the next reload would
    // reconcile as unknown-to-server and restore (#3151).
    const ws = getWorkspaceStore();
    ws.openTab(populatedLayout());
    setServerBaseUpdatedAt("2026-08-22T09:00:00.000Z");
    saveSession(
      ws.activeStore.layout,
      { changesSinceExport: 1, hasEverExported: false },
      "2026-08-22T09:00:00.000Z",
    );
    const settle = deferSave();

    const inFlight = handleSaveToServer();
    abandonWorkingCopy();
    settle("2026-08-22T10:00:00.000Z");
    await inFlight;

    expect(getServerBaseUpdatedAt()).toBeNull();
    expect(loadSessionWithTimestamp()).toBeNull();
    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });
});
