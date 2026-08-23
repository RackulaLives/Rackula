import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

vi.mock("$lib/storage/server-library.svelte", () => ({
  upsertServerLibraryItem: vi.fn(),
  removeServerLibraryItem: vi.fn(),
  refreshServerLibrary: vi.fn(),
  getServerLibrary: () => ({ items: [], status: "idle" }),
}));

import { upsertServerLibraryItem } from "$lib/storage/server-library.svelte";
import { finalizeSuccessfulSave } from "$lib/storage/manager.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";

describe("save wiring to the server catalogue", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records the saved layout in the catalogue when the server returns a timestamp", () => {
    const ws = getWorkspaceStore();
    ws.openTab(createLayout("Homelab"));
    const id = ws.activeStore.layout.metadata?.id;

    finalizeSuccessfulSave(true, "2026-08-22T10:00:00.000Z");

    expect(upsertServerLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ id, name: "Homelab", valid: true }),
    );
  });

  it("skips the catalogue update when the server returned no new timestamp", () => {
    const ws = getWorkspaceStore();
    ws.openTab(createLayout("Homelab"));

    finalizeSuccessfulSave(true, null);

    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });

  it("skips the catalogue update for a stale save even when the server returns a timestamp", () => {
    // clearDirtyState is false for a settling save whose captured snapshot is
    // older than the live layout (newer edits, an abandon, or a loadFromApi
    // swap arrived while it was in flight). The live layout's name and counts
    // no longer describe what this save actually wrote, so recording them
    // would corrupt the catalogue row; the follow-up save that made this one
    // stale will upsert correctly instead.
    const ws = getWorkspaceStore();
    ws.openTab(createLayout("Homelab"));

    finalizeSuccessfulSave(false, "2026-08-22T10:00:00.000Z");

    expect(upsertServerLibraryItem).not.toHaveBeenCalled();
  });
});
