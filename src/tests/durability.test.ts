import { describe, it, expect } from "vitest";
import {
  computeLayoutStatus,
  computeServerHint,
  rollupDurabilities,
  type LayoutDurability,
} from "$lib/storage/durability.svelte";
import type { SaveStatus } from "$lib/storage/manager.svelte";
import type { StorageMode } from "$lib/storage/availability.svelte";

/**
 * The storage status formula is the single source of truth for the chip (and,
 * later, the multi-layout tab dots #2079 / sidebar #2082). These tests lock the
 * two correctness-critical pieces: the per-layout status formula and the
 * worst-wins rollup. They assert returned status/label/icon, never DOM or
 * colour, per the project testing rules.
 */

const BROWSER: StorageMode = "browser";
const SERVER: StorageMode = "server";

function status(
  saveStatus: SaveStatus,
  consecutiveSaveFailures: number,
  storageMode: StorageMode,
  apiAvailable: boolean | null,
  changesSinceExport: number,
  hasEverExported: boolean,
  apiEverReached = false,
) {
  return computeLayoutStatus(
    saveStatus,
    consecutiveSaveFailures,
    storageMode,
    apiAvailable,
    changesSinceExport,
    hasEverExported,
    apiEverReached,
  );
}

describe("computeLayoutStatus — browser mode", () => {
  it("is saved only when exported and no changes since", () => {
    const result = status("idle", 0, BROWSER, null, 0, true);
    expect(result.status).toBe("saved");
    expect(result.icon).toBe("saved");
    expect(result.label).toBe("Saved");
  });

  it("a never-exported cold start (0 changes) is pending, not saved", () => {
    // hasEverExported guard: 0 changes alone does not mean durable.
    const result = status("idle", 0, BROWSER, null, 0, false);
    expect(result.status).toBe("pending");
    expect(result.icon).toBe("pending");
    expect(result.label).toBe("Unsaved changes");
  });

  it("is pending when there are changes since the last export", () => {
    const result = status("idle", 0, BROWSER, null, 3, true);
    expect(result.status).toBe("pending");
    expect(result.label).toBe("Unsaved changes");
  });

  it("ignores saveStatus and apiAvailable for the status in browser mode", () => {
    // Even a server "error" / reachable API is irrelevant to the durability
    // status in browser mode: the file is the durable home.
    const exported = status("error", 5, BROWSER, false, 0, true);
    expect(exported.status).toBe("saved");
    const dirty = status("saved", 0, BROWSER, true, 1, true);
    expect(dirty.status).toBe("pending");
  });

  it("a reachable API in browser mode never changes the status or label", () => {
    // The server-available hint is a passive popover line; it must not flip the
    // chip's dot, label, or kind. A backed-up browser layout stays saved even
    // when a server answers one header away.
    const withServer = status("idle", 0, BROWSER, true, 0, true);
    const withoutServer = status("idle", 0, BROWSER, false, 0, true);
    expect(withServer.status).toBe(withoutServer.status);
    expect(withServer.label).toBe(withoutServer.label);
    expect(withServer.kind).toBe(withoutServer.kind);
  });
});

describe("computeServerHint — browser mode misconfiguration", () => {
  it("hints when browser mode runs while a server is reachable", () => {
    // The misconfiguration: storage browser with a healthy API one header away.
    // Surfaced as a passive popover line only, never a toast.
    expect(computeServerHint(BROWSER, true)).toBe(true);
  });

  it("does not hint when no server answered the browser-mode probe", () => {
    // false is also the pre-probe default, so this covers the "before the probe
    // resolves" case too: no signal, no hint.
    expect(computeServerHint(BROWSER, false)).toBe(false);
  });

  it("never hints in server mode (a reachable server is expected there)", () => {
    expect(computeServerHint(SERVER, true)).toBe(false);
    expect(computeServerHint(SERVER, false)).toBe(false);
  });
});

describe("computeLayoutStatus — server mode", () => {
  it("trips to error after the circuit breaker opens (>= 3 failures)", () => {
    const result = status("saving", 3, SERVER, true, 0, false);
    expect(result.status).toBe("error");
    expect(result.label).toBe("Server unavailable");
  });

  it("is pending while the health check has not resolved (apiAvailable null)", () => {
    const result = status("idle", 0, SERVER, null, 0, false);
    expect(result.status).toBe("pending");
    expect(result.label).toBe("Checking connection");
  });

  it("is the outage state when the API was reached then lost", () => {
    // apiEverReached true: the server answered earlier this session, then went
    // away. This is the transient-outage treatment the drop toast covers.
    const result = status("idle", 0, SERVER, false, 0, false, true);
    expect(result.status).toBe("error");
    expect(result.label).toBe("Offline");
    expect(result.kind).toBe("offline");
  });

  it("is the misconfiguration state when the API was never reached", () => {
    // apiEverReached false: server mode was declared but the API has not
    // answered once since load. That is a broken deployment, not a transient
    // outage, so it gets a distinct state and copy, not the drop toast.
    const result = status("idle", 0, SERVER, false, 0, false, false);
    expect(result.status).toBe("error");
    expect(result.label).toBe("Server not found");
    expect(result.kind).toBe("server-not-found");
    expect(result.detail).toMatch(/api container/i);
  });

  it("distinguishes never-reached from reached-then-lost by kind", () => {
    const neverReached = status("idle", 0, SERVER, false, 0, false, false);
    const reachedThenLost = status("idle", 0, SERVER, false, 0, false, true);
    expect(neverReached.kind).not.toBe(reachedThenLost.kind);
  });

  it("circuit-breaker trip is always reached-then-lost, never misconfiguration", () => {
    // The breaker only opens after save attempts, which require a reachable
    // server, so a never-reached deployment can never reach this branch. Even
    // with apiEverReached false it must read as the outage state, not
    // server-not-found.
    const result = status("saving", 3, SERVER, false, 0, false, false);
    expect(result.status).toBe("error");
    expect(result.label).toBe("Server unavailable");
    expect(result.kind).toBe("offline");
  });

  it("is error when the last save failed but the server is reachable", () => {
    const result = status("error", 0, SERVER, true, 0, false);
    expect(result.status).toBe("error");
    expect(result.label).toBe("Save error");
  });

  it("is pending while a save is in flight", () => {
    const result = status("saving", 0, SERVER, true, 0, false);
    expect(result.status).toBe("pending");
    expect(result.label).toBe("Saving");
  });

  it("is saved when the last save succeeded", () => {
    const result = status("saved", 0, SERVER, true, 0, false);
    expect(result.status).toBe("saved");
    expect(result.label).toBe("Saved");
  });

  it("is pending for any other reachable, non-saving state", () => {
    const result = status("idle", 0, SERVER, true, 0, false);
    expect(result.status).toBe("pending");
    expect(result.label).toBe("Pending save");
  });

  it("never uses changesSinceExport in server mode", () => {
    // changesSinceExport is reset only on export, not on a server save, so it
    // must not influence server-mode status. A reachable, saved server with a
    // high changesSinceExport is still "saved".
    const result = status("saved", 0, SERVER, true, 99, false);
    expect(result.status).toBe("saved");
  });
});

describe("rollupDurabilities — worst-wins", () => {
  function durability(status: LayoutDurability["status"]): LayoutDurability {
    return {
      status,
      kind: status === "error" ? "offline" : status,
      mode: BROWSER,
      changesSinceExport: 0,
      hasEverExported: true,
      isHealthy: status !== "error",
      label: status,
      detail: "",
      icon: status,
      serverHint: false,
    };
  }

  it("an empty workspace rolls up to saved", () => {
    const result = rollupDurabilities([]);
    expect(result.status).toBe("saved");
    expect(result.label).toBe("All saved");
  });

  it("error beats pending and saved", () => {
    const result = rollupDurabilities([
      durability("saved"),
      durability("pending"),
      durability("error"),
    ]);
    expect(result.status).toBe("error");
  });

  it("pending beats saved", () => {
    const result = rollupDurabilities([
      durability("saved"),
      durability("pending"),
    ]);
    expect(result.status).toBe("pending");
  });

  it("all saved rolls up to saved", () => {
    const result = rollupDurabilities([
      durability("saved"),
      durability("saved"),
    ]);
    expect(result.status).toBe("saved");
  });
});
