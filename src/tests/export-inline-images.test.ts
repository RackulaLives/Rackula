/**
 * Export image inlining (#2928)
 *
 * Bundled device images are served as site-relative static asset URLs
 * (vite.config.ts sets `assetsInlineLimit: 0`, so they are never data URLs).
 * Two export consumers cannot resolve a url-based <image> href:
 *  - Rasterizing to PNG/JPEG loads the serialized SVG through `new Image()`;
 *    browsers block external resource loads inside an SVG used as an image
 *    source.
 *  - A standalone SVG file opened outside the app's origin has nothing to
 *    resolve a relative href against.
 *
 * `inlineImageHrefs` walks a generated export SVG and replaces any url-based
 * <image> href with a self-contained data URL before either consumer runs.
 * User-uploaded images (already data: URLs) are left untouched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { inlineImageHrefs } from "$lib/utils/export/inline-images";

const SVG_NS = "http://www.w3.org/2000/svg";

function createImageElement(href: string) {
  const imageEl = document.createElementNS(SVG_NS, "image");
  imageEl.setAttribute("href", href);
  return imageEl;
}

function wrapInSvg(...elements: SVGElement[]) {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const el of elements) svg.appendChild(el);
  return svg;
}

describe("inlineImageHrefs (#2928)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces a url-based image href with a data URL", async () => {
    const imageEl = createImageElement("/assets/devices/server.webp");
    const svg = wrapInSvg(imageEl);

    const blob = new Blob(["fake-image-bytes"], { type: "image/webp" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    });
    vi.stubGlobal("fetch", fetchMock);

    await inlineImageHrefs(svg);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/assets/devices/server.webp",
    );
    expect(imageEl.getAttribute("href")).toMatch(/^data:image\/webp;base64,/);
  });

  it("leaves an already-inlined data URL untouched (no fetch)", async () => {
    const dataUrl = "data:image/png;base64,USERUPLOADED";
    const imageEl = createImageElement(dataUrl);
    const svg = wrapInSvg(imageEl);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await inlineImageHrefs(svg);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(imageEl.getAttribute("href")).toBe(dataUrl);
  });

  it("leaves the original href in place when the fetch fails", async () => {
    const href = "/assets/devices/missing.webp";
    const imageEl = createImageElement(href);
    const svg = wrapInSvg(imageEl);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    await expect(inlineImageHrefs(svg)).resolves.toBeUndefined();
    expect(imageEl.getAttribute("href")).toBe(href);
  });

  it("inlines multiple distinct images independently", async () => {
    const imageA = createImageElement("/assets/devices/a.webp");
    const imageB = createImageElement("/assets/devices/b.webp");
    const svg = wrapInSvg(imageA, imageB);

    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob([url], { type: "image/webp" })),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await inlineImageHrefs(svg);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(imageA.getAttribute("href")).toMatch(/^data:image\/webp;base64,/);
    expect(imageB.getAttribute("href")).toMatch(/^data:image\/webp;base64,/);
  });

  it("fetches a shared href only once and applies it to every element", async () => {
    // A layout with N identical devices produces N <image> elements with the
    // same bundled href; inlining must not fetch the same URL N times (#2952
    // CodeAnt finding).
    const sharedHref = "/assets/devices/shared.webp";
    const imageA = createImageElement(sharedHref);
    const imageB = createImageElement(sharedHref);
    const imageC = createImageElement(sharedHref);
    const svg = wrapInSvg(imageA, imageB, imageC);

    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob([url], { type: "image/webp" })),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await inlineImageHrefs(svg);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(sharedHref);
    for (const el of [imageA, imageB, imageC]) {
      expect(el.getAttribute("href")).toMatch(/^data:image\/webp;base64,/);
    }
  });
});
