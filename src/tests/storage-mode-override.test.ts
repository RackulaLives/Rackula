import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStorageMode,
  getStorageModeOverride,
  setStorageModeOverride,
  clearStorageModeOverride,
  isStorageModeFromOverride,
} from "$lib/storage/availability.svelte";

/**
 * The override may only upgrade browser to server. A config value of exactly
 * "server" is the source of truth and is never overridden down.
 */
describe("storage-mode override precedence", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    clearStorageModeOverride();
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    clearStorageModeOverride();
  });

  it("config server resolves to server with no override", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    expect(getStorageMode()).toBe("server");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("config browser with no override resolves to browser", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    expect(getStorageMode()).toBe("browser");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("override upgrades browser config to server", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    setStorageModeOverride();
    expect(getStorageModeOverride()).toBe("server");
    expect(getStorageMode()).toBe("server");
    expect(isStorageModeFromOverride()).toBe(true);
  });

  it("override never downgrades a config-declared server deployment", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setStorageModeOverride();
    expect(getStorageMode()).toBe("server");
    // The mode came from config, not the override.
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("clearing the override returns browser config to browser", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    setStorageModeOverride();
    clearStorageModeOverride();
    expect(getStorageModeOverride()).toBe(null);
    expect(getStorageMode()).toBe("browser");
    expect(isStorageModeFromOverride()).toBe(false);
  });

  it("ignores an unknown override value", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    localStorage.setItem("Rackula:storage-mode-override", "bogus");
    expect(getStorageModeOverride()).toBe(null);
    expect(getStorageMode()).toBe("browser");
  });
});
