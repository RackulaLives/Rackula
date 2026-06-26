import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SavedLayoutItem } from "$lib/storage";

const apiMocks = vi.hoisted(() => ({
  checkApiHealth: vi.fn(async () => true),
  saveLayoutToServer: vi.fn(async () => ({ id: "uuid-1", updatedAt: "t0" })),
  listSavedLayouts: vi.fn(async () => [] as SavedLayoutItem[]),
}));
vi.mock("$lib/storage/api", () => ({
  checkApiHealth: apiMocks.checkApiHealth,
  saveLayoutToServer: apiMocks.saveLayoutToServer,
  listSavedLayouts: apiMocks.listSavedLayouts,
}));

/** A server layout listing entry sharing the active layout's UUID by default. */
function serverItem(overrides: Partial<SavedLayoutItem> = {}): SavedLayoutItem {
  return {
    id: "uuid-1",
    name: "My Rack",
    version: "1",
    updatedAt: "t-server",
    rackCount: 2,
    deviceCount: 5,
    valid: true,
    ...overrides,
  };
}

const storeMocks = vi.hoisted(() => ({
  hasRack: true,
  layout: { name: "My Rack", metadata: { id: "uuid-1" } },
  images: new Map(),
}));
vi.mock("$lib/stores/layout.svelte", () => ({
  getLayoutStore: () => ({
    get layout() {
      return storeMocks.layout;
    },
    get hasRack() {
      return storeMocks.hasRack;
    },
  }),
}));
vi.mock("$lib/stores/images.svelte", () => ({
  getImageStore: () => ({ getUserImages: () => storeMocks.images }),
}));

// Partial mock: spy on clearSession (adopt clears the legacy slot so the fork is
// never left in a server-mode session) while keeping the real helpers.
const wcMocks = vi.hoisted(() => ({ clearSession: vi.fn() }));
vi.mock("$lib/storage/working-copy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/storage/working-copy")>();
  return { ...actual, clearSession: wcMocks.clearSession };
});

import {
  switchToServerMode,
  confirmServerOverwrite,
  adoptServerCopy,
} from "$lib/storage";
import {
  getStorageModeOverride,
  clearStorageModeOverride,
  isApiAvailable,
  resetAvailabilityState,
} from "$lib/storage/availability.svelte";

describe("switchToServerMode", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    clearStorageModeOverride();
    resetAvailabilityState();
    apiMocks.checkApiHealth.mockClear().mockResolvedValue(true);
    apiMocks.saveLayoutToServer
      .mockClear()
      .mockResolvedValue({ id: "uuid-1", updatedAt: "t0" });
    apiMocks.listSavedLayouts.mockClear().mockResolvedValue([]);
    wcMocks.clearSession.mockClear();
    storeMocks.hasRack = true;
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    clearStorageModeOverride();
  });

  it("uploads the active layout and sets the override on success", async () => {
    // Regression guard for Finding 1: the override must be set BEFORE the upload
    // so saveLayoutToServer sees server mode and routes images to the asset API
    // instead of embedding them inline (which would blow the 1MB PUT cap).
    apiMocks.saveLayoutToServer.mockImplementation(async () => {
      expect(getStorageModeOverride()).toBe("server");
      return { id: "uuid-1", updatedAt: "t0" };
    });
    const result = await switchToServerMode();
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).toHaveBeenCalledTimes(1);
    expect(getStorageModeOverride()).toBe("server");
    expect(isApiAvailable()).toBe(true);
  });

  it("does not switch when the server is no longer reachable", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(false);
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("unreachable");
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
  });

  it("does not switch and keeps browser data when the upload fails", async () => {
    apiMocks.saveLayoutToServer.mockRejectedValue(new Error("boom"));
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("upload-failed");
    expect(getStorageModeOverride()).toBe(null);
    // Regression guard for Finding 3: catch block must revert availability so the
    // user is not left stranded with apiAvailable=true in browser mode.
    expect(isApiAvailable()).toBe(false);
  });

  it("switches an empty workspace without uploading and clears the legacy session", async () => {
    storeMocks.hasRack = false;
    const result = await switchToServerMode();
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe("server");
    // Clear the legacy session so a stale/empty layout cannot autosave over a
    // server copy; leave the API unavailable in-session (no upload).
    expect(wcMocks.clearSession).toHaveBeenCalled();
    expect(isApiAvailable()).toBe(false);
  });

  it("does not switch when the override cannot be persisted", async () => {
    const setItemSpy = vi
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    try {
      const result = await switchToServerMode();
      expect(result.switched).toBe(false);
      if (!result.switched) expect(result.reason).toBe("override-failed");
      expect(getStorageModeOverride()).toBe(null);
      expect(isApiAvailable()).toBe(false);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("returns a conflict instead of overwriting when a server copy exists", async () => {
    apiMocks.listSavedLayouts.mockResolvedValue([
      serverItem({ updatedAt: "t-server", rackCount: 3, deviceCount: 7 }),
    ]);
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    if (!result.switched && result.reason === "conflict") {
      expect(result.serverCopy.id).toBe("uuid-1");
      expect(result.serverCopy.name).toBe("My Rack");
      expect(result.serverCopy.updatedAt).toBe("t-server");
      expect(result.serverCopy.rackCount).toBe(3);
      expect(result.serverCopy.deviceCount).toBe(7);
    } else {
      expect.unreachable("expected a conflict result");
    }
    // Must not overwrite, and must leave a clean browser baseline for the prompt.
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(wcMocks.clearSession).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
  });

  it("matches the server copy case-insensitively by UUID", async () => {
    storeMocks.layout = { name: "My Rack", metadata: { id: "UUID-1" } };
    apiMocks.listSavedLayouts.mockResolvedValue([serverItem({ id: "uuid-1" })]);
    try {
      const result = await switchToServerMode();
      expect(result.switched).toBe(false);
      if (!result.switched) expect(result.reason).toBe("conflict");
      expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    } finally {
      storeMocks.layout = { name: "My Rack", metadata: { id: "uuid-1" } };
    }
  });

  it("confirmServerOverwrite uploads with the server's updatedAt as the base", async () => {
    const result = await confirmServerOverwrite(
      serverItem({ updatedAt: "t-server" }),
    );
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).toHaveBeenCalledTimes(1);
    // The probed updatedAt is threaded as the optimistic-concurrency base.
    expect(apiMocks.saveLayoutToServer.mock.calls[0]?.[2]).toBe("t-server");
    expect(getStorageModeOverride()).toBe("server");
    expect(isApiAvailable()).toBe(true);
  });

  it("confirmServerOverwrite bails out when the active layout changed since the prompt", async () => {
    const result = await confirmServerOverwrite(serverItem({ id: "other-id" }));
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("probe-failed");
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
  });

  it("confirmServerOverwrite does not overwrite when the server is no longer reachable", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(false);
    const result = await confirmServerOverwrite(
      serverItem({ updatedAt: "t-server" }),
    );
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("unreachable");
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
  });

  it("confirmServerOverwrite bails out if the active layout changes during the health check", async () => {
    // The layout swaps under us while checkApiHealth is in flight (TOCTOU).
    apiMocks.checkApiHealth.mockImplementation(async () => {
      storeMocks.layout = { name: "Other", metadata: { id: "changed-id" } };
      return true;
    });
    try {
      const result = await confirmServerOverwrite(serverItem());
      expect(result.switched).toBe(false);
      if (!result.switched) expect(result.reason).toBe("probe-failed");
      expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
      expect(getStorageModeOverride()).toBe(null);
      expect(isApiAvailable()).toBe(false);
    } finally {
      storeMocks.layout = { name: "My Rack", metadata: { id: "uuid-1" } };
    }
  });

  it("adoptServerCopy keeps the server copy: switches without uploading and clears the legacy slot", async () => {
    const result = await adoptServerCopy(serverItem());
    expect(result.switched).toBe(true);
    expect(apiMocks.checkApiHealth).toHaveBeenCalled();
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe("server");
    // Clearing the legacy session means the fork is never left in a server-mode
    // session, so nothing can autosave it over the kept server copy.
    expect(wcMocks.clearSession).toHaveBeenCalled();
    // Deliberately unavailable in-session: avoids waking server autosave to PUT
    // the fork over the server copy before the reload adopts it.
    expect(isApiAvailable()).toBe(false);
  });

  it("adoptServerCopy bails out when the active layout changed since the prompt", async () => {
    const result = await adoptServerCopy(serverItem({ id: "other-id" }));
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("probe-failed");
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
    expect(wcMocks.clearSession).not.toHaveBeenCalled();
  });

  it("adoptServerCopy does not switch when the server is no longer reachable", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(false);
    const result = await adoptServerCopy(serverItem());
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("unreachable");
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
    expect(wcMocks.clearSession).not.toHaveBeenCalled();
  });

  it("fails closed when the server cannot be queried for an existing copy", async () => {
    apiMocks.listSavedLayouts.mockRejectedValue(new Error("network"));
    const result = await switchToServerMode();
    expect(result.switched).toBe(false);
    if (!result.switched) expect(result.reason).toBe("probe-failed");
    // Never blind-overwrite when existence is unknown; stay cleanly in browser.
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(wcMocks.clearSession).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe(null);
    expect(isApiAvailable()).toBe(false);
  });
});
