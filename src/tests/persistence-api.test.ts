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
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await checkApiHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/api/health");
  });
});
