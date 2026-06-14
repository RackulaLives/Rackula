import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkApiHealth,
  loadSavedLayout,
  saveLayoutToServer,
  uploadSnapshot,
} from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { serializeLayoutToYaml } from "$lib/utils/yaml";
import { createTestLayout } from "./factories";

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
    expect(headers.get("X-Rackula-Updated-At")).toBe("2026-06-14T09:00:00.000Z");
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
      vi.fn().mockResolvedValue(
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
      await uploadSnapshot(
        "11111111-1111-4111-8111-111111111111",
        "name: L\n",
      ),
    ).toBe(true);
  });

  it("returns false on 404 (layout unknown)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "Layout not found" }), {
            status: 404,
          }),
        ),
    );
    expect(
      await uploadSnapshot(
        "11111111-1111-4111-8111-111111111111",
        "name: L\n",
      ),
    ).toBe(false);
  });

  it("returns false when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    expect(
      await uploadSnapshot(
        "11111111-1111-4111-8111-111111111111",
        "name: L\n",
      ),
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
