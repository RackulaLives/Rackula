import { describe, it, expect, vi } from "vitest";
import {
  reconcileSession,
  applyReconcile,
  type ReconcileAction,
  type ReconcileDeps,
} from "$lib/storage/reconcile";
import type { SavedLayoutItem } from "$lib/storage/api";

function server(overrides: Partial<SavedLayoutItem> = {}): SavedLayoutItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Layout",
    version: "26.5.0",
    updatedAt: "2026-06-14T12:00:00.000Z",
    rackCount: 1,
    deviceCount: 0,
    valid: true,
    ...overrides,
  };
}

describe("reconcileSession", () => {
  it("keeps local when the UUID is unknown to the server", () => {
    const action = reconcileSession({
      localUuid: "22222222-2222-4222-8222-222222222222",
      localSavedAt: "2026-06-14T11:00:00.000Z",
      localServerUpdatedAt: null,
      serverLayouts: [
        server({ id: "11111111-1111-4111-8111-111111111111" }),
      ],
    });
    expect(action).toEqual({
      kind: "restore-local",
      reason: "unknown-to-server",
    });
  });

  it("keeps local when the server list is empty", () => {
    const action = reconcileSession({
      localUuid: "22222222-2222-4222-8222-222222222222",
      localSavedAt: "2026-06-14T11:00:00.000Z",
      localServerUpdatedAt: null,
      serverLayouts: [],
    });
    expect(action).toEqual({
      kind: "restore-local",
      reason: "unknown-to-server",
    });
  });

  it("keeps local when it is ahead of an unchanged server base", () => {
    const uuid = "33333333-3333-4333-8333-333333333333";
    const base = "2026-06-14T12:00:00.000Z";
    const action = reconcileSession({
      localUuid: uuid,
      localSavedAt: "2026-06-14T13:00:00.000Z",
      localServerUpdatedAt: base,
      serverLayouts: [server({ id: uuid, updatedAt: base })],
    });
    expect(action).toEqual({ kind: "restore-local", reason: "ahead" });
  });

  it("loads the server copy when it diverged and is newer", () => {
    const uuid = "44444444-4444-4444-8444-444444444444";
    const match = server({
      id: uuid,
      updatedAt: "2026-06-14T15:00:00.000Z",
    });
    const action = reconcileSession({
      localUuid: uuid,
      localSavedAt: "2026-06-14T10:00:00.000Z",
      localServerUpdatedAt: "2026-06-14T09:00:00.000Z",
      serverLayouts: [match],
    });
    expect(action).toEqual({
      kind: "load-server",
      server: match,
      snapshotLocalUuid: uuid,
    });
  });

  it("keeps local when it diverged but is newer than the server", () => {
    const uuid = "55555555-5555-4555-8555-555555555555";
    const action = reconcileSession({
      localUuid: uuid,
      localSavedAt: "2026-06-14T16:00:00.000Z",
      localServerUpdatedAt: "2026-06-14T09:00:00.000Z",
      serverLayouts: [
        server({ id: uuid, updatedAt: "2026-06-14T12:00:00.000Z" }),
      ],
    });
    expect(action).toEqual({ kind: "restore-local", reason: "local-newer" });
  });

  it("loads the server copy and snapshots local when the base is unknown", () => {
    const uuid = "66666666-6666-4666-8666-666666666666";
    // A legacy session with a UUID match but no recorded base must not silently
    // overwrite the server: load the server copy, snapshot the local one.
    const match = server({ id: uuid, updatedAt: "2026-06-14T12:00:00.000Z" });
    const action = reconcileSession({
      localUuid: uuid,
      localSavedAt: "2026-06-14T16:00:00.000Z",
      localServerUpdatedAt: null,
      serverLayouts: [match],
    });
    expect(action).toEqual({
      kind: "load-server",
      server: match,
      snapshotLocalUuid: uuid,
    });
  });
});

describe("applyReconcile", () => {
  function deps(overrides: Partial<ReconcileDeps> = {}): ReconcileDeps {
    return {
      serializeLosingCopy: vi.fn().mockResolvedValue("losing: yaml"),
      uploadSnapshot: vi.fn().mockResolvedValue(true),
      loadServer: vi.fn().mockResolvedValue(undefined),
      restoreLocal: vi.fn(),
      toast: vi.fn(),
      ...overrides,
    };
  }

  it("snapshots the loser then loads the server when the upload succeeds", async () => {
    const uuid = "66666666-6666-4666-8666-666666666666";
    const item = server({ id: uuid });
    const action: ReconcileAction = {
      kind: "load-server",
      server: item,
      snapshotLocalUuid: uuid,
    };
    const d = deps();
    await applyReconcile(action, d);

    expect(d.serializeLosingCopy).toHaveBeenCalledOnce();
    expect(d.uploadSnapshot).toHaveBeenCalledWith(uuid, "losing: yaml");
    expect(d.loadServer).toHaveBeenCalledWith(item);
    expect(d.restoreLocal).not.toHaveBeenCalled();
  });

  it("keeps the local copy and never loads the server when the snapshot upload fails", async () => {
    const uuid = "77777777-7777-4777-8777-777777777777";
    const action: ReconcileAction = {
      kind: "load-server",
      server: server({ id: uuid }),
      snapshotLocalUuid: uuid,
    };
    const d = deps({ uploadSnapshot: vi.fn().mockResolvedValue(false) });
    await applyReconcile(action, d);

    expect(d.restoreLocal).toHaveBeenCalledWith("local-newer");
    expect(d.loadServer).not.toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith(expect.any(String), "warning");
  });

  it("restores local without touching the server for a restore-local action", async () => {
    const action: ReconcileAction = {
      kind: "restore-local",
      reason: "unknown-to-server",
    };
    const d = deps();
    await applyReconcile(action, d);

    expect(d.restoreLocal).toHaveBeenCalledWith("unknown-to-server");
    expect(d.loadServer).not.toHaveBeenCalled();
    expect(d.uploadSnapshot).not.toHaveBeenCalled();
  });
});
