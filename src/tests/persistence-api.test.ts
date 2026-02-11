import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApiHealth } from "$lib/utils/persistence-api";

describe("checkApiHealth", () => {
  function stubBrowserGlobals(): void {
    vi.stubGlobal("window", { location: { origin: "https://example.com" } });
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/api/health");
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
