/**
 * Server-mode load: eager-fetch each placed device's custom faces from disk as
 * blobs (#2531, part of epic #2513).
 *
 * On a server-mode load, every placed device whose `front_image`/`rear_image`
 * reference is set has its face bytes fetched up front via {@link getAssetBlob}
 * and stored in the returned map as a blob-bearing {@link ImageData}, keyed by
 * `placement-{layoutId}:{deviceId}`. Holding the bytes (not a lazy URL) is what
 * lets render and export reuse the existing blob path: the multi-layout export
 * archive gates entirely on entries carrying a `.blob`, so a load -> export
 * round-trip preserves the image bytes.
 *
 * A face that 404s or otherwise fails to fetch is non-fatal: its placement key
 * is collected into `failedKeys` and the count incremented, and the rest of the
 * layout keeps loading. Surfacing those failures to the user (placeholder,
 * toast, retry) is a separate frontend issue (#2532); this layer only exposes
 * the failure data.
 *
 * Server-mode only. The browser, file-import, and snapshot load paths keep
 * decoding embedded images via `parseLayoutYamlWithImages` unchanged.
 */
import type { Layout } from "$lib/types";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { getAssetBlob, type AssetFace, deviceKeyForWire } from "./assets-api";
import { placementKey } from "$lib/utils/placement-key";
import { getImageExtension } from "$lib/utils/archive";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.api;

/** The two physical faces a placed device can carry a custom image on. */
const FACES: readonly AssetFace[] = ["front", "rear"];

/**
 * The on-disk image reference a placed device carries for one face. Server-mode
 * saves write an opaque filename marker into `front_image`/`rear_image`; this
 * layer treats its presence as the signal that a face exists on disk and
 * addresses the byte fetch by `(layoutId, deviceId, face)`.
 */
function faceReference(
  device: { front_image?: string; rear_image?: string },
  face: AssetFace,
): string | undefined {
  return face === "front" ? device.front_image : device.rear_image;
}

/** Read a blob's bytes as a base64 data URL. Rejects on a read error. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Unexpected FileReader result type"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build a store entry that both renders and exports from the fetched bytes.
 *
 * Holds `blob` (the export archive gates on it) and `dataUrl` (render reads
 * `url ?? dataUrl`, never the blob; the server YAML encoder also embeds from
 * `dataUrl` until the disk reconcile lands). Using a base64 `dataUrl` rather
 * than an object URL matches the embedded-decode path and needs no revoke.
 */
async function imageDataFromBlob(
  blob: Blob,
  key: string,
  face: AssetFace,
): Promise<ImageData> {
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    filename: `${key}-${face}.${getImageExtension(blob.type)}`,
  };
}

/**
 * Eager-fetch every placed device's custom faces for a server-mode load.
 *
 * @param layout - The parsed layout (placed devices carry the face references).
 * @param layoutId - The layout's stable UUID, used to build placement keys and
 *   to address the asset endpoint. The save path persisted faces under this id.
 * @param base - The image entries already decoded from the YAML (for a legacy
 *   embedded `images:` block). Eager-fetched faces are merged on top so a
 *   migrated layout displays from disk while a not-yet-migrated one still shows
 *   its embedded bytes.
 * @returns The merged image map plus the failure data for non-fatal misses.
 */
export async function eagerFetchServerImages(
  layout: Layout,
  layoutId: string,
  base: ImageStoreMap,
): Promise<{
  images: ImageStoreMap;
  failedImagesCount: number;
  failedKeys: string[];
}> {
  const images: ImageStoreMap = new Map(base);
  const failedKeys: string[] = [];

  // Container children live flat in the same rack.devices[] array (linked by
  // container_id), so a single flatMap reaches every placed device.
  const devices = layout.racks.flatMap((rack) => rack.devices);

  // One fetch task per placed face that carries a reference. Fetching every
  // face concurrently (rather than awaiting in a loop) keeps total load time
  // flat in face count, and one face's 10s timeout never blocks the rest.
  const tasks: Promise<{ key: string; face: AssetFace; entry?: ImageData }>[] =
    [];

  for (const device of devices) {
    const key = placementKey(layoutId, device.id);

    // The placement key feeds a network fetch addressed by the device id path
    // segment. deviceKeyForWire asserts that segment is a bare UUID, so a
    // malformed id can never widen the server's path-traversal surface. A key
    // that fails the gate yields a recorded failure for each referenced face,
    // never a throw and never a request.
    let wireDeviceId: string | null = null;
    try {
      wireDeviceId = deviceKeyForWire(key);
    } catch (error) {
      log("eagerFetchServerImages: unsafe key %s rejected %O", key, error);
    }

    for (const face of FACES) {
      if (!faceReference(device, face)) continue;

      if (wireDeviceId === null) {
        tasks.push(Promise.resolve({ key, face }));
        continue;
      }

      const safeDeviceId = wireDeviceId;
      tasks.push(
        (async () => {
          try {
            const blob = await getAssetBlob(layoutId, safeDeviceId, face);
            return {
              key,
              face,
              entry: await imageDataFromBlob(blob, key, face),
            };
          } catch (error) {
            log(
              "eagerFetchServerImages: face %s of %s failed %O",
              face,
              key,
              error,
            );
            return { key, face };
          }
        })(),
      );
    }
  }

  // Merge after the concurrent phase so the map is mutated single-threaded and
  // a device's two faces never race each other's read-modify-write.
  for (const { key, face, entry } of await Promise.all(tasks)) {
    if (entry) {
      const existing = images.get(key) ?? {};
      images.set(key, { ...existing, [face]: entry });
    } else {
      failedKeys.push(key);
    }
  }

  return { images, failedImagesCount: failedKeys.length, failedKeys };
}
