import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkApiHealth,
  loadSavedLayout,
  loadSnapshot,
  saveLayoutToServer,
  uploadSnapshot,
} from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { serializeLayoutToYaml } from "$lib/utils/yaml";
import { createMultiLayoutArchive } from "$lib/utils/archive";
import { placementKey } from "$lib/utils/placement-key";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
} from "./factories";

describe("checkApiHealth", () => {
  function stubBrowserGlobals(): void {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns true for valid persistence health JSON payload", async () => {
    stubBrowserGlobals();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            status: "ok",
            service: "rackula-persistence-api",
            version: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const healthy = await checkApiHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/health");
    expect(healthy).toBe(true);
  });

  it("returns false for non-JSON responses", async () => {
    stubBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("OK", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );

    const healthy = await checkApiHealth();
    expect(healthy).toBe(false);
  });

  it("returns false when JSON payload is malformed", async () => {
    stubBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{invalid-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const healthy = await checkApiHealth();
    expect(healthy).toBe(false);
  });

  it("returns false when required health fields are missing", async () => {
    stubBrowserGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, status: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const healthy = await checkApiHealth();
    expect(healthy).toBe(false);
  });
});

describe("saveLayoutToServer", () => {
  function stubBrowserGlobals(): void {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  }

  beforeEach(() => {
    setApiAvailable(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
  });

  it("sends the last-known updatedAt as X-Rackula-Updated-At and returns the echo", async () => {
    stubBrowserGlobals();
    const layout = {
      name: "L",
      racks: [],
      device_types: [],
      metadata: { id: "11111111-1111-4111-8111-111111111111" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          updatedAt: "2026-06-14T10:00:00.000Z",
          message: "Layout updated",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveLayoutToServer(
      layout as never,
      new Map(),
      "2026-06-14T09:00:00.000Z",
    );

    expect(result).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-14T10:00:00.000Z",
    });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-Rackula-Updated-At")).toBe(
      "2026-06-14T09:00:00.000Z",
    );
  });

  it("omits X-Rackula-Updated-At when no base updatedAt is known", async () => {
    stubBrowserGlobals();
    const layout = {
      name: "L",
      racks: [],
      device_types: [],
      metadata: { id: "11111111-1111-4111-8111-111111111111" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          updatedAt: "2026-06-14T10:00:00.000Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveLayoutToServer(layout as never, new Map(), null);

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has("X-Rackula-Updated-At")).toBe(false);
  });

  it("rejects a save response missing updatedAt", async () => {
    stubBrowserGlobals();
    const layout = {
      name: "L",
      racks: [],
      device_types: [],
      metadata: { id: "11111111-1111-4111-8111-111111111111" },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    await expect(
      saveLayoutToServer(layout as never, new Map(), null),
    ).rejects.toThrow();
  });
});

describe("uploadSnapshot", () => {
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

  it("returns true on 201", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            filename: "l~20260614-100000.yaml",
            message: "Snapshot saved",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    expect(
      await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n"),
    ).toBe(true);
  });

  it("returns false on 404 (layout unknown)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Layout not found" }), {
          status: 404,
        }),
      ),
    );
    expect(
      await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n"),
    ).toBe(false);
  });

  it("returns false when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(
      await uploadSnapshot("11111111-1111-4111-8111-111111111111", "name: L\n"),
    ).toBe(false);
  });
});

describe("loadSavedLayout", () => {
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

  it("rejects an oversized response", async () => {
    const huge = "a".repeat(1024 * 1024 + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(huge, {
          status: 200,
          headers: { "Content-Type": "text/yaml" },
        }),
      ),
    );
    await expect(
      loadSavedLayout("11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow(/too large/i);
  });

  it("returns the X-Rackula-Updated-At echo", async () => {
    const yaml = await serializeLayoutToYaml(createTestLayout(), "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(yaml, {
          status: 200,
          headers: {
            "Content-Type": "text/yaml",
            "X-Rackula-Updated-At": "2026-06-14T10:00:00.000Z",
          },
        }),
      ),
    );
    const result = await loadSavedLayout(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.updatedAt).toBe("2026-06-14T10:00:00.000Z");
  });
});

describe("loadSavedLayout server-mode image eager-fetch", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";
  const DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  // Minimal but valid PNG byte sequence (8-byte signature + a marker byte).
  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
  ]);

  const originalConfig = window.__RACKULA_CONFIG__;

  function stubBrowserGlobals(): void {
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
  }

  /**
   * A server-mode layout: one rack, one placed device whose `front_image`
   * reference points at an on-disk face. The YAML carries no embedded `images:`
   * block (the migrated, disk-backed shape).
   */
  async function serverLayoutYaml(): Promise<string> {
    const layout = createTestLayout({
      metadata: { id: UUID },
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: DEVICE_ID,
              front_image: `${DEVICE_ID}.front.png`,
            }),
          ],
        }),
      ],
    });
    return serializeLayoutToYaml(layout, "");
  }

  /**
   * Route fetches by URL: the layout GET returns the YAML; an asset GET returns
   * the PNG bytes unless `failAsset` is set, in which case it 404s.
   */
  function routedFetch(yaml: string, opts: { failAsset?: boolean } = {}) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/assets/")) {
        if (opts.failAsset) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(PNG_BYTES, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      return new Response(yaml, {
        status: 200,
        headers: { "Content-Type": "text/yaml" },
      });
    });
  }

  beforeEach(() => {
    setApiAvailable(true);
    stubBrowserGlobals();
    window.__RACKULA_CONFIG__ = { storage: "server" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setApiAvailable(false);
    window.__RACKULA_CONFIG__ = originalConfig;
  });

  it("eager-fetches each custom face to a blob-bearing store entry keyed by placement key", async () => {
    const yaml = await serverLayoutYaml();
    vi.stubGlobal("fetch", routedFetch(yaml));

    const { images, failedKeys, failedImagesCount } =
      await loadSavedLayout(UUID);

    const key = placementKey(UUID, DEVICE_ID);
    const entry = images.get(key);
    expect(entry?.front?.blob).toBeInstanceOf(Blob);
    expect(failedKeys).toEqual([]);
    expect(failedImagesCount).toBe(0);
  });

  it("gives each eager-fetched face a dataUrl so the server YAML encoder round-trips it", async () => {
    const yaml = await serverLayoutYaml();
    vi.stubGlobal("fetch", routedFetch(yaml));

    const { images } = await loadSavedLayout(UUID);

    // The store entry must carry a base64 dataUrl, not just a blob/object URL:
    // encodeUserImagesToYaml embeds from dataUrl and silently drops faces that
    // lack one, so a load -> edit -> autosave round-trip would otherwise lose
    // the image. The encoder serializing it back proves the entry survives.
    const key = placementKey(UUID, DEVICE_ID);
    const front = images.get(key)?.front;
    expect(front?.dataUrl).toMatch(/^data:image\/png;base64,/);

    const { encodeUserImagesToYaml } =
      await import("$lib/utils/image-encoding");
    const { serialized } = encodeUserImagesToYaml(images);
    expect(serialized[key]?.front).toBe(front?.dataUrl);
  });

  it("populates blobs so a subsequent export archive carries the image bytes", async () => {
    const yaml = await serverLayoutYaml();
    vi.stubGlobal("fetch", routedFetch(yaml));

    const { layout, images } = await loadSavedLayout(UUID);

    // The store now holds a blob, satisfying createMultiLayoutArchive's .blob
    // gate, so a load -> export round-trip preserves the bytes.
    const archive = await createMultiLayoutArchive([{ layout, images }]);
    expect(archive.size).toBeGreaterThan(0);

    const { getJSZip } = await import("$lib/utils/archive");
    const JSZip = await getJSZip();
    const zip = await JSZip.loadAsync(archive);
    const assetPaths = Object.keys(zip.files).filter(
      (p) => p.includes("/assets/") && p.includes(DEVICE_ID),
    );
    expect(assetPaths.length).toBeGreaterThan(0);
  });

  it("treats a 404 face as non-fatal: the layout still loads and the key is reported", async () => {
    const yaml = await serverLayoutYaml();
    vi.stubGlobal("fetch", routedFetch(yaml, { failAsset: true }));

    const { layout, images, failedKeys, failedImagesCount } =
      await loadSavedLayout(UUID);

    // The layout itself parsed fine.
    expect(layout.racks[0]?.devices[0]?.id).toBe(DEVICE_ID);
    // The missing face produced no blob entry but was recorded, not thrown.
    const key = placementKey(UUID, DEVICE_ID);
    expect(images.get(key)?.front?.blob).toBeUndefined();
    expect(failedKeys).toContain(key);
    expect(failedImagesCount).toBeGreaterThan(0);
  });
});

describe("loadSnapshot", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";
  const FILENAME = "my-layout~20260615-143005.yaml";

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

  it("parses snapshot YAML through the same validated pipeline as file load", async () => {
    const yaml = await serializeLayoutToYaml(
      createTestLayout({ name: "From Snapshot" }),
      "",
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(yaml, {
        status: 200,
        headers: { "Content-Type": "text/yaml" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadSnapshot(UUID, FILENAME);

    // A valid snapshot resolves to a parsed Layout: it went through
    // parseLayoutYamlWithImages (LayoutSchema), not a raw passthrough.
    expect(result.layout.name).toBe("From Snapshot");
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      `/snapshots/${encodeURIComponent(FILENAME)}`,
    );
  });

  it("rejects a snapshot whose YAML fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("name: broken\nracks: not-a-list", {
          status: 200,
          headers: { "Content-Type": "text/yaml" },
        }),
      ),
    );

    await expect(loadSnapshot(UUID, FILENAME)).rejects.toThrow(/corrupted/i);
  });
});
