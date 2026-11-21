import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eagerFetchServerImages } from "$lib/storage/server-load-images";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { createTestDeviceType, createTestLayout } from "./factories";

const LAYOUT_ID = "11111111-1111-4111-8111-111111111111";
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Asset API mock: the listing returns `listing` (or fails when it is null) and
 * every face GET returns PNG bytes. Records the face URLs that were fetched.
 */
function stubAssetApi(
  listing: Array<{ deviceSlug: string; face: string }> | null,
) {
  const faceGets: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL): Promise<Response> => {
      const u = url.toString();
      if (/\/assets\/[^/]+$/.test(u)) {
        if (listing === null) return new Response("boom", { status: 500 });
        return new Response(
          JSON.stringify({
            assets: listing.map((a) => ({ ...a, ext: "png", size: 8 })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      faceGets.push(u);
      return new Response(new Blob([PNG_BYTES], { type: "image/png" }), {
        status: 200,
      });
    }),
  );
  return { faceGets };
}

describe("eagerFetchServerImages: custom device-type faces", () => {
  beforeEach(() => {
    setApiAvailable(true);
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
  });

  it("fetches an on-disk device-type face and keys it by the slug", async () => {
    const { faceGets } = stubAssetApi([
      { deviceSlug: "server-1u", face: "front" },
    ]);
    const layout = createTestLayout({
      metadata: { id: LAYOUT_ID },
      device_types: [createTestDeviceType("server-1u")],
    });

    const { images, failedImagesCount } = await eagerFetchServerImages(
      layout,
      LAYOUT_ID,
      new Map(),
    );

    expect(faceGets).toEqual([
      expect.stringMatching(`/assets/${LAYOUT_ID}/server-1u/front$`),
    ]);
    expect(images.get("server-1u")?.front?.blob).toBeInstanceOf(Blob);
    expect(failedImagesCount).toBe(0);
  });

  it("ignores an on-disk folder for a slug that is not a device type in the layout", async () => {
    const { faceGets } = stubAssetApi([
      { deviceSlug: "server-1u", face: "front" },
    ]);
    const layout = createTestLayout({ metadata: { id: LAYOUT_ID } });

    const { images } = await eagerFetchServerImages(
      layout,
      LAYOUT_ID,
      new Map(),
    );

    expect(faceGets).toEqual([]);
    expect(images.has("server-1u")).toBe(false);
  });

  it("keeps the embedded images and reports a failure when the listing fails", async () => {
    stubAssetApi(null);
    const layout = createTestLayout({
      metadata: { id: LAYOUT_ID },
      device_types: [createTestDeviceType("server-1u")],
    });
    const embedded = { dataUrl: "data:image/png;base64,AA==", filename: "f" };

    const { images, failedImagesCount } = await eagerFetchServerImages(
      layout,
      LAYOUT_ID,
      new Map([["server-1u", { front: embedded }]]),
    );

    expect(images.get("server-1u")?.front).toBe(embedded);
    expect(failedImagesCount).toBe(1);
  });
});
