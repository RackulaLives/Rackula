import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assetUrl,
  deviceKeyForWire,
  putAsset,
  getAssetBlob,
  deleteAsset,
  listAssets,
} from "$lib/storage/assets-api";
import { PersistenceError } from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import {
  placementKey,
  deviceIdFromPlacementKey,
} from "$lib/utils/placement-key";

const LAYOUT_ID = "11111111-1111-4111-8111-111111111111";

/**
 * The server backstop, pinned to `api/src/storage/assets.ts` (DeviceSlugSchema).
 * Mirrored here (not imported) because the server module pulls in node-only
 * deps (pino) that do not resolve in the frontend test env. The wire-safety
 * contract is that a bare lowercase UUID passes this and a colon-namespaced
 * placement key does not, with zero loosening of the pattern.
 */
const SERVER_DEVICE_SLUG = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/;

describe("deviceKeyForWire", () => {
  it("round-trips the namespaced placement key back to the bare device UUID and placement key", () => {
    const deviceId = crypto.randomUUID();
    const key = placementKey(LAYOUT_ID, deviceId);
    // placementKey(layoutId, uuid) -> uuid
    const wire = deviceKeyForWire(key);
    expect(wire).toBe(deviceId);
    // uuid -> placementKey(layoutId, uuid)
    expect(placementKey(LAYOUT_ID, wire)).toBe(key);
  });

  it("round-trips the legacy un-namespaced placement key back to the bare device UUID", () => {
    const deviceId = crypto.randomUUID();
    // legacy shape: placementKey("", deviceId) === `placement-${deviceId}`
    const key = placementKey("", deviceId);
    expect(key).toBe(`placement-${deviceId}`);
    const wire = deviceKeyForWire(key);
    expect(wire).toBe(deviceId);
    expect(deviceIdFromPlacementKey(key)).toBe(deviceId);
  });

  it("accepts a bare lowercase crypto.randomUUID()", () => {
    const deviceId = crypto.randomUUID();
    expect(deviceKeyForWire(placementKey(LAYOUT_ID, deviceId))).toBe(deviceId);
  });

  it("rejects a device segment that still carries a colon", () => {
    // A malformed key whose device portion contains a colon must not slip
    // through onto the wire (would widen path-traversal surface).
    const bad = `placement-${LAYOUT_ID}:${LAYOUT_ID}:evil`;
    expect(() => deviceKeyForWire(bad)).toThrow();
  });

  it("rejects path characters in the device segment", () => {
    for (const segment of ["..", "../etc", "a/b", "a\\b", "a.png"]) {
      expect(() =>
        deviceKeyForWire(`placement-${LAYOUT_ID}:${segment}`),
      ).toThrow();
    }
  });

  it("rejects an uppercase UUID (the server slug validator is lowercase-only)", () => {
    const upper = crypto.randomUUID().toUpperCase();
    expect(() => deviceKeyForWire(placementKey(LAYOUT_ID, upper))).toThrow();
  });

  it("rejects a key without the placement- prefix before extracting", () => {
    // A bare or mis-prefixed key would mis-slice in deviceIdFromPlacementKey;
    // the prefix guard fails fast rather than relying on the UUID assertion.
    const uuid = crypto.randomUUID();
    expect(() => deviceKeyForWire(uuid)).toThrow();
    expect(() => deviceKeyForWire(`evil:${uuid}`)).toThrow();
  });
});

describe("assetUrl", () => {
  it("addresses the device-UUID face path with every segment percent-encoded", () => {
    const deviceId = crypto.randomUUID();
    const url = assetUrl(LAYOUT_ID, deviceId, "front");
    expect(url).toContain(`/assets/${LAYOUT_ID}/${deviceId}/front`);
    expect(url).not.toContain("placement-");
  });

  it("percent-encodes a path-traversal attempt in the device segment", () => {
    // Defense in depth: even if a caller bypasses deviceKeyForWire, the URL
    // builder must not emit raw traversal characters into the path.
    const url = assetUrl(LAYOUT_ID, "../etc/passwd", "front");
    expect(url).not.toContain("../");
    expect(url).toContain("%2F");
  });
});

describe("server DeviceSlugSchema agreement", () => {
  it("accepts a bare lowercase UUID with zero validator changes", () => {
    const deviceId = crypto.randomUUID();
    expect(SERVER_DEVICE_SLUG.test(deviceId)).toBe(true);
  });

  it("rejects the colon-namespaced placement key", () => {
    const key = placementKey(LAYOUT_ID, crypto.randomUUID());
    expect(SERVER_DEVICE_SLUG.test(key)).toBe(false);
  });

  it("the wire key produced from a placement key passes the server validator", () => {
    const key = placementKey(LAYOUT_ID, crypto.randomUUID());
    const wire = deviceKeyForWire(key);
    expect(SERVER_DEVICE_SLUG.test(wire)).toBe(true);
  });
});

describe("asset transport wrappers", () => {
  const DEVICE_ID = "22222222-2222-4222-8222-222222222222";

  function stubBrowserGlobals(): void {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  }

  beforeEach(() => {
    setApiAvailable(true);
    stubBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
  });

  it("getAssetBlob returns the image bytes as a Blob", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      ),
    );

    const blob = await getAssetBlob(LAYOUT_ID, DEVICE_ID, "front");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    const roundTrip = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(roundTrip)).toEqual([1, 2, 3, 4]);
  });

  it("getAssetBlob targets the per-placement device UUID path segment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAssetBlob(LAYOUT_ID, DEVICE_ID, "rear");
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain(`/assets/${LAYOUT_ID}/${DEVICE_ID}/rear`);
    expect(calledUrl).not.toContain("placement-");
    // Assert on the path only: a colon in the device segment would be the wire
    // hazard, but an absolute API_BASE_URL legitimately carries a scheme colon
    // (http:), so check the resolved pathname rather than the whole URL.
    const path = new URL(calledUrl, "http://test.local").pathname;
    expect(path).not.toContain(":");
  });

  it("putAsset surfaces 507 (quota) as a typed PersistenceError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "quota exceeded" }), {
          status: 507,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    const err = await putAsset(
      LAYOUT_ID,
      DEVICE_ID,
      "front",
      blob,
      "image/png",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect((err as PersistenceError).statusCode).toBe(507);
  });

  it("putAsset surfaces 413 (oversize) as a typed PersistenceError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "too large" }), {
          status: 413,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    const err = await putAsset(
      LAYOUT_ID,
      DEVICE_ID,
      "front",
      blob,
      "image/png",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect((err as PersistenceError).statusCode).toBe(413);
  });

  it("putAsset PUTs with the supplied content type to the device-UUID path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Asset uploaded" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    await putAsset(LAYOUT_ID, DEVICE_ID, "front", blob, "image/png");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(`/assets/${LAYOUT_ID}/${DEVICE_ID}/front`);
    expect((init as RequestInit).method).toBe("PUT");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("image/png");
  });

  it("putAsset rejects an oversize blob client-side before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // 5MB + 1 byte; the client must fail fast, not issue a doomed PUT.
    const oversize = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
      type: "image/png",
    });
    const err = await putAsset(
      LAYOUT_ID,
      DEVICE_ID,
      "front",
      oversize,
      "image/png",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PersistenceError);
    expect((err as PersistenceError).statusCode).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("putAsset rejects a content type outside the raster allowlist before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });
    await expect(
      putAsset(LAYOUT_ID, DEVICE_ID, "front", blob, "image/svg+xml"),
    ).rejects.toBeInstanceOf(PersistenceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deleteAsset resolves on 200 and surfaces non-2xx as PersistenceError", async () => {
    const okFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Asset deleted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", okFetch);
    await expect(
      deleteAsset(LAYOUT_ID, DEVICE_ID, "front"),
    ).resolves.toBeUndefined();

    const errFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", errFetch);
    await expect(
      deleteAsset(LAYOUT_ID, DEVICE_ID, "front"),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it("deleteAsset treats 404 as an idempotent no-op", async () => {
    // An already-absent face is the reconcile's desired end state, so a 404
    // must resolve rather than abort the save loop.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Asset not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      deleteAsset(LAYOUT_ID, DEVICE_ID, "front"),
    ).resolves.toBeUndefined();
  });

  it("listAssets returns the on-disk face set for the reconcile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            assets: [
              { deviceSlug: DEVICE_ID, face: "front", ext: "png", size: 12 },
              { deviceSlug: DEVICE_ID, face: "rear", ext: "webp", size: 34 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const assets = await listAssets(LAYOUT_ID);
    expect(assets).toContainEqual(
      expect.objectContaining({ deviceSlug: DEVICE_ID, face: "front" }),
    );
    expect(assets).toContainEqual(
      expect.objectContaining({ deviceSlug: DEVICE_ID, face: "rear" }),
    );
  });

  it("listAssets rejects a malformed listing body as a PersistenceError", async () => {
    // A response that parses as JSON but violates the listing schema (wrong
    // face enum, missing fields) must not flow through unvalidated.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ assets: [{ face: "both" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(listAssets(LAYOUT_ID)).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });

  it("each wrapper throws when the API is unavailable", async () => {
    setApiAvailable(false);
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    await expect(
      putAsset(LAYOUT_ID, DEVICE_ID, "front", blob, "image/png"),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(
      getAssetBlob(LAYOUT_ID, DEVICE_ID, "front"),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(
      deleteAsset(LAYOUT_ID, DEVICE_ID, "front"),
    ).rejects.toBeInstanceOf(PersistenceError);
    await expect(listAssets(LAYOUT_ID)).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });
});
