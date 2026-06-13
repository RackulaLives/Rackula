import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageMode } from "$lib/storage/availability.svelte";

/**
 * Storage mode is read explicitly from runtime config (window.__RACKULA_CONFIG__),
 * not probed. "server" only when the config says exactly "server"; everything
 * else (including missing/unknown values) is "browser". This is the single
 * source other modules read. Locks issue #2037 AC (a).
 */
describe("getStorageMode", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    delete window.__RACKULA_CONFIG__;
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
  });

  it("returns 'server' only when config.storage is exactly 'server'", () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    expect(getStorageMode()).toBe("server");
  });

  it("returns 'browser' when config.storage is 'browser'", () => {
    window.__RACKULA_CONFIG__ = { storage: "browser" };
    expect(getStorageMode()).toBe("browser");
  });

  it("returns 'browser' when config is missing entirely", () => {
    delete window.__RACKULA_CONFIG__;
    expect(getStorageMode()).toBe("browser");
  });

  it("returns 'browser' when storage key is undefined", () => {
    window.__RACKULA_CONFIG__ = { env: "dev" };
    expect(getStorageMode()).toBe("browser");
  });

  it("treats unknown storage values as 'browser'", () => {
    window.__RACKULA_CONFIG__ = { storage: "Server" };
    expect(getStorageMode()).toBe("browser");
    window.__RACKULA_CONFIG__ = { storage: "cloud" };
    expect(getStorageMode()).toBe("browser");
    window.__RACKULA_CONFIG__ = { storage: "" };
    expect(getStorageMode()).toBe("browser");
  });
});
