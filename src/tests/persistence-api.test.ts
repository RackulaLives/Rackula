import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApiHealth } from "$lib/utils/persistence-api";

describe("checkApiHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves health URL against API_BASE_URL path", async () => {
    vi.stubGlobal("window", { location: { origin: "https://example.com" } });
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const healthy = await checkApiHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/api/health");
    expect(healthy).toBe(true);
  });

  it("returns false for HTML fallback responses", async () => {
    vi.stubGlobal("window", { location: { origin: "https://example.com" } });
    vi.stubGlobal("AbortSignal", {
      timeout: () => new AbortController().signal,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html><html><body>spa</body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );

    const healthy = await checkApiHealth();
    expect(healthy).toBe(false);
  });
});
