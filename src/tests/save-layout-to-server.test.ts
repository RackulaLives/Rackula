import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveLayoutToServer } from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import {
  markPreCarrierMigrationPending,
  clearPreCarrierMigrationPending,
} from "$lib/storage/pre-carrier-migration-pending";
import { createTestLayout } from "./factories";

/**
 * In server-storage mode, a layout whose carrier-first migration was marked
 * pending (by adapt-legacy-layout) carries the X-Rackula-Pre-Carrier-Migration
 * header on its next save. The mark is cleared only after a save succeeds, so a
 * failed save retries with the header and the durable backup is never skipped.
 * The header coexists with X-Rackula-Updated-At.
 */
describe("saveLayoutToServer pre-carrier migration header", () => {
  const originalConfig = window.__RACKULA_CONFIG__;
  const UUID = "11111111-1111-4111-8111-111111111111";
  const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

  function stubBrowserGlobals(): void {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  }

  function okSaveResponse(id: string): Response {
    return new Response(
      JSON.stringify({ id, updatedAt: "2026-06-14T10:00:00.000Z" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  beforeEach(() => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setApiAvailable(true);
    stubBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
    window.__RACKULA_CONFIG__ = originalConfig;
    clearPreCarrierMigrationPending(UUID);
    clearPreCarrierMigrationPending(OTHER_UUID);
  });

  it("attaches the header when the uuid is pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      null,
    );

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
  });

  it("does not re-attach the header on a subsequent save of the same uuid", async () => {
    // Fresh Response per call: a Response body can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      null,
    );
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      null,
    );

    const secondHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(secondHeaders.has("X-Rackula-Pre-Carrier-Migration")).toBe(false);
  });

  it("never attaches the header for a non-pending uuid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okSaveResponse(OTHER_UUID));
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: OTHER_UUID } }),
      new Map(),
      null,
    );

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has("X-Rackula-Pre-Carrier-Migration")).toBe(false);
  });

  it("attaches the header alongside X-Rackula-Updated-At", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      "2026-06-14T09:00:00.000Z",
    );

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
    expect(headers.get("X-Rackula-Updated-At")).toBe(
      "2026-06-14T09:00:00.000Z",
    );
  });

  it("retries with the header after a failed save so the backup is not skipped", async () => {
    // First save fails (non-2xx), the retry succeeds.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response("nope", { status: 503 }))
      .mockImplementationOnce(async () => okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);

    await expect(
      saveLayoutToServer(
        createTestLayout({ metadata: { id: UUID } }),
        new Map(),
        null,
      ),
    ).rejects.toThrow();

    // The failed save must not have consumed the mark.
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      null,
    );

    const retryHeaders = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(retryHeaders.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
  });
});
