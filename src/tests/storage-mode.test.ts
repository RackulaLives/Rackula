import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  checkApiHealth: vi.fn(async () => false),
}));
vi.mock("$lib/storage/api", () => ({
  checkApiHealth: apiMocks.checkApiHealth,
}));

import {
  getStorageMode,
  setApiAvailable,
  getApiEverReached,
  resetAvailabilityState,
  getApiAvailableState,
  isServerReachableInBrowser,
  probeServerForBrowserHint,
} from "$lib/storage/availability.svelte";

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

/**
 * The "ever reached" latch is what lets the chip tell a broken deployment
 * (server mode, API never answered) apart from a transient outage (reached,
 * then lost). It must latch true on the first reach and never fall back to
 * false on a later loss, so a reconnect-then-drop reads as an outage, not a
 * misconfiguration. Locks issue #2063.
 */
describe("getApiEverReached latch", () => {
  beforeEach(() => {
    resetAvailabilityState();
  });

  it("starts false before the API is ever reached", () => {
    expect(getApiEverReached()).toBe(false);
  });

  it("latches true the first time availability becomes true", () => {
    setApiAvailable(true);
    expect(getApiEverReached()).toBe(true);
  });

  it("stays true after a later loss (reached then lost)", () => {
    setApiAvailable(true);
    setApiAvailable(false);
    expect(getApiEverReached()).toBe(true);
  });

  it("stays false while availability has only ever been false", () => {
    setApiAvailable(false);
    setApiAvailable(false);
    expect(getApiEverReached()).toBe(false);
  });
});

/**
 * The browser-mode probe is the only thing that lets the chip notice a server is
 * reachable while the instance is configured for browser storage (#2063). It must
 * stay silent and leave the durability status untouched on the common case (no
 * server), only flipping availability on a positive result, and never run in
 * server mode (which has its own probe).
 */
describe("probeServerForBrowserHint", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    resetAvailabilityState();
    apiMocks.checkApiHealth.mockReset();
    delete window.__RACKULA_CONFIG__;
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
  });

  it("flags a reachable server when one answers in browser mode", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(true);
    await probeServerForBrowserHint();
    expect(isServerReachableInBrowser()).toBe(true);
  });

  it("never touches apiAvailable, so it cannot wake server autosave", async () => {
    // Regression guard (#2063): apiAvailable is the server-mode write/load gate.
    // The browser probe must leave it null even on a positive result, or
    // browser-mode layouts would start auto-saving to the reachable server.
    apiMocks.checkApiHealth.mockResolvedValue(true);
    await probeServerForBrowserHint();
    expect(getApiAvailableState()).toBeNull();
  });

  it("leaves the signal off when no server answers", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(false);
    await probeServerForBrowserHint();
    expect(isServerReachableInBrowser()).toBe(false);
    expect(getApiAvailableState()).toBeNull();
  });

  it("does not probe in server mode (it has its own probe)", async () => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    await probeServerForBrowserHint();
    expect(apiMocks.checkApiHealth).not.toHaveBeenCalled();
  });

  it("does not re-probe once a server has already been found", async () => {
    apiMocks.checkApiHealth.mockResolvedValue(true);
    await probeServerForBrowserHint();
    apiMocks.checkApiHealth.mockClear();
    await probeServerForBrowserHint();
    expect(apiMocks.checkApiHealth).not.toHaveBeenCalled();
  });
});
