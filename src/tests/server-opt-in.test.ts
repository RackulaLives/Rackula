import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  checkApiHealth: vi.fn(async () => true),
  saveLayoutToServer: vi.fn(async () => ({ id: "uuid-1", updatedAt: "t0" })),
}));
vi.mock("$lib/storage/api", () => ({
  checkApiHealth: apiMocks.checkApiHealth,
  saveLayoutToServer: apiMocks.saveLayoutToServer,
}));

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

import { switchToServerMode } from "$lib/storage/server-opt-in.svelte";
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
    storeMocks.hasRack = true;
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    clearStorageModeOverride();
  });

  it("uploads the active layout and sets the override on success", async () => {
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
  });

  it("switches without uploading when there is no layout to move", async () => {
    storeMocks.hasRack = false;
    const result = await switchToServerMode();
    expect(result.switched).toBe(true);
    expect(apiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    expect(getStorageModeOverride()).toBe("server");
    expect(isApiAvailable()).toBe(true);
  });
});
