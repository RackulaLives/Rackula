/**
 * Inline url-based device image hrefs to data URLs (#2928)
 *
 * Bundled device photos are served as site-relative static asset URLs
 * (vite.config.ts sets `assetsInlineLimit: 0`, so they are never data URLs).
 * Two export consumers of a generated export SVG cannot resolve a url-based
 * <image> href:
 *  - Rasterizing to PNG/JPEG loads the serialized SVG through `new Image()`;
 *    browsers block external resource loads inside an SVG used as an image
 *    source, so the image silently fails to render.
 *  - A standalone SVG file opened outside the app's origin has nothing to
 *    resolve a site-relative href against.
 *
 * Call this on a generated export SVG before rasterizing or serializing it,
 * to replace every url-based <image> href with a self-contained data URL.
 * User-uploaded images (already data: URLs) are left untouched.
 */
import { appDebug } from "$lib/utils/debug";

export async function inlineImageHrefs(svg: SVGElement): Promise<void> {
  const imageElements = Array.from(svg.getElementsByTagName("image"));

  // Group elements by href so each unique url is fetched once. A layout with
  // many devices sharing one bundled image produces many <image> elements
  // pointing at the same url; fetching per element would download it N times.
  const elementsByHref = new Map<string, SVGImageElement[]>();
  for (const imageEl of imageElements) {
    const href = imageEl.getAttribute("href");
    if (!href || href.startsWith("data:")) continue;
    const group = elementsByHref.get(href);
    if (group) {
      group.push(imageEl);
    } else {
      elementsByHref.set(href, [imageEl]);
    }
  }

  await Promise.all(
    Array.from(elementsByHref, ([href, elements]) =>
      inlineHref(href, elements),
    ),
  );
}

async function inlineHref(
  href: string,
  elements: SVGImageElement[],
): Promise<void> {
  try {
    const response = await fetch(href);
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    for (const imageEl of elements) {
      imageEl.setAttribute("href", dataUrl);
    }
  } catch (error) {
    // Leave the original href if inlining fails (offline, 404, CORS); the
    // image simply won't render in the export rather than breaking it.
    appDebug.export("failed to inline image href %s: %O", href, error);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}
