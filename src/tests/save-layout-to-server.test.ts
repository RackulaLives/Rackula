import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveLayoutToServer } from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import {
  markPreCarrierMigrationPending,
  clearPreCarrierMigrationPending,
} from "$lib/storage/pre-carrier-migration-pending";
import { createTestLayout } from "./factories";
import type { ImageStoreMap, DeviceImageData } from "$lib/types/images";

// A 16-byte PNG body (full 8-byte signature plus tail) base64-encoded into a
// data URL, so detectImageMime sniffs it as image/png on both client and server.
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
const PNG_DATA_URL = `data:image/png;base64,${bytesToBase64(PNG_BYTES)}`;

// A distinct JPEG body (FF D8 FF signature) so its base64 differs from the PNG,
// letting a mixed-routing test prove WHICH image's base64 survives in the YAML.
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02,
  0x03, 0x04, 0x05,
]);
const JPEG_DATA_URL = `data:image/jpeg;base64,${bytesToBase64(JPEG_BYTES)}`;

/** A user image face carrying both a blob and the verbatim data URL. */
function userFace(): DeviceImageData {
  return {
    front: {
      blob: new Blob([PNG_BYTES], { type: "image/png" }),
      dataUrl: PNG_DATA_URL,
      filename: "front.png",
    },
  };
}

/** A distinct JPEG user image face, for tests that need two different payloads. */
function jpegFace(): DeviceImageData {
  return {
    front: {
      blob: new Blob([JPEG_BYTES], { type: "image/jpeg" }),
      dataUrl: JPEG_DATA_URL,
      filename: "front.jpg",
    },
  };
}

/** A migrate-on-save face: embedded data URL only, no blob. */
function embeddedOnlyFace(): DeviceImageData {
  return {
    front: {
      dataUrl: PNG_DATA_URL,
      filename: "front.png",
    },
  };
}

/** Build a user-image store map keyed by namespaced placement keys. */
function imageMap(entries: Array<[string, DeviceImageData]>): ImageStoreMap {
  return new Map(entries);
}

interface FetchCall {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
}

/**
 * Route-aware fetch mock for the server save path. Records every call and lets
 * a test fail specific asset PUTs. The YAML PUT and the asset listing succeed
 * unless overridden.
 */
function makeRoutedFetch(opts?: {
  listing?: Array<{
    deviceSlug: string;
    face: string;
    ext: string;
    size: number;
  }>;
  failAssetPut?: boolean;
}) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const u = typeof url === "string" ? url : url.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: u, method, body: init?.body ?? null });

      // GET /assets/:layoutId  (listing — no further path segments)
      if (method === "GET" && /\/assets\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({ assets: opts?.listing ?? [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // PUT/DELETE /assets/:layoutId/:deviceId/:face
      if (/\/assets\/[^/]+\/[^/]+\/[^/]+$/.test(u)) {
        if (method === "PUT" && opts?.failAssetPut) {
          return new Response(JSON.stringify({ error: "boom" }), {
            status: 500,
          });
        }
        return new Response(JSON.stringify({ message: "ok" }), { status: 200 });
      }
      // PUT /layouts/:uuid  (YAML save)
      return new Response(
        JSON.stringify({
          id: SERVER_UUID,
          updatedAt: "2026-06-20T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  );
  return { fetchMock, calls };
}

const SERVER_UUID = "33333333-3333-4333-8333-333333333333";

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

  /**
   * In server mode a save also lists assets (the reconcile). These tests pass an
   * empty image map, so the listing must answer with an empty set; everything
   * else delegates to the provided save-response factory.
   */
  function withListing(saveResponse: () => Response) {
    return vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && /\/assets\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({ assets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return saveResponse();
    });
  }

  /** All YAML-PUT requests (the layout save), in call order. */
  function yamlPutCalls(
    fetchMock: ReturnType<typeof vi.fn>,
  ): Array<{ headers: HeadersInit }> {
    return fetchMock.mock.calls
      .filter(([url, init]) => {
        const u = typeof url === "string" ? url : String(url);
        const method = (init?.method ?? "GET").toUpperCase();
        return method === "PUT" && /\/layouts\/[^/]+$/.test(u);
      })
      .map(([, init]) => init as { headers: HeadersInit });
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
    const fetchMock = withListing(() => okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      null,
    );

    const headers = new Headers(yamlPutCalls(fetchMock)[0].headers);
    expect(headers.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
  });

  it("does not re-attach the header on a subsequent save of the same uuid", async () => {
    // Fresh Response per call: a Response body can only be read once.
    const fetchMock = withListing(() => okSaveResponse(UUID));
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

    const secondHeaders = new Headers(yamlPutCalls(fetchMock)[1].headers);
    expect(secondHeaders.has("X-Rackula-Pre-Carrier-Migration")).toBe(false);
  });

  it("never attaches the header for a non-pending uuid", async () => {
    const fetchMock = withListing(() => okSaveResponse(OTHER_UUID));
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: OTHER_UUID } }),
      new Map(),
      null,
    );

    const headers = new Headers(yamlPutCalls(fetchMock)[0].headers);
    expect(headers.has("X-Rackula-Pre-Carrier-Migration")).toBe(false);
  });

  it("attaches the header alongside X-Rackula-Updated-At", async () => {
    const fetchMock = withListing(() => okSaveResponse(UUID));
    vi.stubGlobal("fetch", fetchMock);

    markPreCarrierMigrationPending(UUID);
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: UUID } }),
      new Map(),
      "2026-06-14T09:00:00.000Z",
    );

    const headers = new Headers(yamlPutCalls(fetchMock)[0].headers);
    expect(headers.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
    expect(headers.get("X-Rackula-Updated-At")).toBe(
      "2026-06-14T09:00:00.000Z",
    );
  });

  it("retries with the header after a failed save so the backup is not skipped", async () => {
    // First save fails at the YAML PUT (non-2xx), the retry succeeds. The
    // listing GET (reconcile) is answered with an empty set on the retry.
    let yamlPuts = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && /\/assets\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({ assets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      yamlPuts += 1;
      return yamlPuts === 1
        ? new Response("nope", { status: 503 })
        : okSaveResponse(UUID);
    });
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

    const retryHeaders = new Headers(yamlPutCalls(fetchMock)[1].headers);
    expect(retryHeaders.get("X-Rackula-Pre-Carrier-Migration")).toBe("1");
  });
});

/**
 * Server-mode save writes user images to disk via the asset API (#2530, #2513,
 * #1426). The layout YAML no longer carries the embedded base64 images block, so
 * an image-heavy layout stays under the 1MB layout PUT cap, and the save reaches
 * a clean state only after the YAML PUT and every asset PUT/DELETE resolve.
 */
describe("saveLayoutToServer asset reconcile (server mode)", () => {
  const originalConfig = window.__RACKULA_CONFIG__;
  const PLACEMENT_KEY = `placement-${SERVER_UUID}:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
  const DEVICE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  beforeEach(() => {
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setApiAvailable(true);
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
    window.__RACKULA_CONFIG__ = originalConfig;
  });

  function yamlBodyOf(calls: FetchCall[]): string {
    const yamlPut = calls.find(
      (c) => c.method === "PUT" && /\/layouts\/[^/]+$/.test(c.url),
    );
    return typeof yamlPut?.body === "string" ? yamlPut.body : "";
  }

  it("PUTs each user image to the asset API per (deviceId, face)", async () => {
    const { fetchMock, calls } = makeRoutedFetch();
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([[PLACEMENT_KEY, userFace()]]),
      null,
    );

    const assetPut = calls.find(
      (c) => c.method === "PUT" && c.url.includes(`/assets/${SERVER_UUID}/`),
    );
    expect(assetPut).toBeDefined();
    expect(assetPut?.url).toContain(
      `/assets/${SERVER_UUID}/${DEVICE_ID}/front`,
    );
  });

  it("omits the embedded base64 images block from the YAML body", async () => {
    const { fetchMock, calls } = makeRoutedFetch();
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([[PLACEMENT_KEY, userFace()]]),
      null,
    );

    const body = yamlBodyOf(calls);
    expect(body).not.toContain("data:image/png;base64");
  });

  it("a failed asset PUT rejects the save so the layout stays dirty for retry", async () => {
    const { fetchMock } = makeRoutedFetch({ failAssetPut: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveLayoutToServer(
        createTestLayout({ metadata: { id: SERVER_UUID } }),
        imageMap([[PLACEMENT_KEY, userFace()]]),
        null,
      ),
    ).rejects.toThrow();
  });

  it("deletes an on-disk face that is not in the desired set (orphan reconcile)", async () => {
    // Disk has a rear face for the device; the layout no longer has any rear
    // image, so the reconcile must DELETE it.
    const { fetchMock, calls } = makeRoutedFetch({
      listing: [
        { deviceSlug: DEVICE_ID, face: "front", ext: "png", size: 16 },
        { deviceSlug: DEVICE_ID, face: "rear", ext: "png", size: 16 },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([[PLACEMENT_KEY, userFace()]]),
      null,
    );

    // The rear orphan is deleted and never re-PUT.
    const rearDelete = calls.find(
      (c) =>
        c.method === "DELETE" &&
        c.url.endsWith(`/assets/${SERVER_UUID}/${DEVICE_ID}/rear`),
    );
    expect(rearDelete).toBeDefined();
    const rearPut = calls.find(
      (c) =>
        c.method === "PUT" &&
        c.url.endsWith(`/assets/${SERVER_UUID}/${DEVICE_ID}/rear`),
    );
    expect(rearPut).toBeUndefined();
    // The desired front face is re-PUT (DELETE-then-PUT dodges the 507 on an
    // at-limit replace).
    const frontPut = calls.find(
      (c) =>
        c.method === "PUT" &&
        c.url.endsWith(`/assets/${SERVER_UUID}/${DEVICE_ID}/front`),
    );
    expect(frontPut).toBeDefined();
  });

  it("migrate-on-save: writes an embedded-only image to disk and drops the embed", async () => {
    const { fetchMock, calls } = makeRoutedFetch();
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([[PLACEMENT_KEY, embeddedOnlyFace()]]),
      null,
    );

    const assetPut = calls.find(
      (c) =>
        c.method === "PUT" &&
        c.url.endsWith(`/assets/${SERVER_UUID}/${DEVICE_ID}/front`),
    );
    expect(assetPut).toBeDefined();
    expect(yamlBodyOf(calls)).not.toContain("data:image/png;base64");
  });

  it("keeps a slug-keyed device-type image embedded and never aborts the save", async () => {
    // Custom device-type images are keyed by the bare device-type slug (e.g.
    // "server-1u"), not a placement key. They must not be routed to the asset
    // API (deviceKeyForWire would throw on a non-placement key and abort the
    // whole save); they stay embedded in the YAML.
    const { fetchMock, calls } = makeRoutedFetch();
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([["server-1u", userFace()]]),
      null,
    );

    // No asset PUT for a slug-keyed image.
    const assetPut = calls.find(
      (c) => c.method === "PUT" && c.url.includes(`/assets/${SERVER_UUID}/`),
    );
    expect(assetPut).toBeUndefined();
    // The slug-keyed image stays embedded in the YAML.
    expect(yamlBodyOf(calls)).toContain("data:image/png;base64");
  });

  it("routes a placement-keyed image to disk while keeping a slug-keyed image embedded", async () => {
    const { fetchMock, calls } = makeRoutedFetch();
    vi.stubGlobal("fetch", fetchMock);

    // Distinct payloads (PNG for the placement, JPEG for the slug) so the body
    // assertions can prove WHICH image's bytes survive: the placement PNG must
    // be dropped (on disk), the slug JPEG must remain embedded.
    await saveLayoutToServer(
      createTestLayout({ metadata: { id: SERVER_UUID } }),
      imageMap([
        [PLACEMENT_KEY, userFace()],
        ["server-1u", jpegFace()],
      ]),
      null,
    );

    // Placement PNG goes to disk.
    const assetPut = calls.find(
      (c) =>
        c.method === "PUT" &&
        c.url.endsWith(`/assets/${SERVER_UUID}/${DEVICE_ID}/front`),
    );
    expect(assetPut).toBeDefined();
    // The slug JPEG stays embedded; the placement PNG's base64 is gone.
    const body = yamlBodyOf(calls);
    expect(body).toContain(JPEG_DATA_URL);
    expect(body).not.toContain(PNG_DATA_URL);
  });
});
