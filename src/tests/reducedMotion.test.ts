import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read the CSS file directly
const appCss = readFileSync(join(__dirname, "../app.css"), "utf-8");

describe("Reduced Motion Support", () => {
  describe("CSS Media Query", () => {
    it("app.css has prefers-reduced-motion media query", () => {
      expect(appCss).toContain("@media (prefers-reduced-motion: reduce)");
    });

    it("reduced motion disables animations", () => {
      expect(appCss).toMatch(
        /prefers-reduced-motion: reduce[\s\S]*animation-duration:\s*0\.01ms\s*!important/,
      );
    });

    it("reduced motion disables transitions", () => {
      expect(appCss).toMatch(
        /prefers-reduced-motion: reduce[\s\S]*transition-duration:\s*0\.01ms\s*!important/,
      );
    });

    it("reduced motion disables animation iterations", () => {
      expect(appCss).toMatch(
        /prefers-reduced-motion: reduce[\s\S]*animation-iteration-count:\s*1\s*!important/,
      );
    });

    it("reduced motion sets scroll-behavior to auto", () => {
      expect(appCss).toMatch(
        /prefers-reduced-motion: reduce[\s\S]*scroll-behavior:\s*auto\s*!important/,
      );
    });
  });
});

describe("Motion Preference Utilities", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock matchMedia
    mockMatchMedia = vi.fn();
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Clear module cache to re-import with fresh mock
    vi.resetModules();
  });

  it("prefersReducedMotion returns true when motion is reduced", async () => {
    mockMatchMedia.mockReturnValue({ matches: true });

    const { prefersReducedMotion } = await import("$lib/utils/motion");
    expect(prefersReducedMotion()).toBe(true);
  });

  it("prefersReducedMotion returns false when motion is not reduced", async () => {
    mockMatchMedia.mockReturnValue({ matches: false });

    const { prefersReducedMotion } = await import("$lib/utils/motion");
    expect(prefersReducedMotion()).toBe(false);
  });

  it("prefersReducedMotion calls matchMedia with correct query", async () => {
    mockMatchMedia.mockReturnValue({ matches: false });

    const { prefersReducedMotion } = await import("$lib/utils/motion");
    prefersReducedMotion();

    expect(mockMatchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it("getAnimationDuration returns 0 when reduced motion is preferred", async () => {
    mockMatchMedia.mockReturnValue({ matches: true });

    const { getAnimationDuration } = await import("$lib/utils/motion");
    expect(getAnimationDuration(200)).toBe(0);
    expect(getAnimationDuration(500)).toBe(0);
  });

  it("getAnimationDuration returns normal duration when motion is not reduced", async () => {
    mockMatchMedia.mockReturnValue({ matches: false });

    const { getAnimationDuration } = await import("$lib/utils/motion");
    expect(getAnimationDuration(200)).toBe(200);
    expect(getAnimationDuration(500)).toBe(500);
  });
});

describe("Motion Utility Edge Cases", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefersReducedMotion returns false when window is undefined (SSR)", async () => {
    // Simulate SSR environment by setting window to undefined
    vi.stubGlobal("window", undefined);

    const { prefersReducedMotion } = await import("$lib/utils/motion");
    expect(prefersReducedMotion()).toBe(false);
  });
});
