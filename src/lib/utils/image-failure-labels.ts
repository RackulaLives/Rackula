/**
 * Turn the device-level failure keys from a load into human-readable, per-device
 * messages naming the device and (when determinable) the face (#2532).
 *
 * The load path records a failure as a bare store key (a placement key
 * `placement-{layoutId}:{deviceId}`, or a device-type slug for an embedded
 * image), once per failed face. The key alone does not carry the face, so this
 * resolver cross-references the layout: a placement that references only one of
 * `front_image`/`rear_image` pins the failed face; a placement that references
 * both names a single face only when both failed (count >= 2), and otherwise
 * stays generic rather than guessing. A key whose device is absent from the
 * layout is dropped so a bare UUID never reaches the user.
 */
import type { Layout, PlacedDevice } from "$lib/types";
import {
  isPlacementKey,
  deviceIdFromPlacementKey,
} from "$lib/utils/placement-key";

/** Find a placed device by its UUID across every rack (container children are flat). */
function findPlacedDevice(
  layout: Layout,
  deviceId: string,
): PlacedDevice | undefined {
  for (const rack of layout.racks) {
    const match = rack.devices.find((device) => device.id === deviceId);
    if (match) return match;
  }
  return undefined;
}

/** Human label for a placement: custom name, then device-type model, then slug. */
function deviceLabel(layout: Layout, placed: PlacedDevice): string {
  const type = layout.device_types.find((t) => t.slug === placed.device_type);
  return placed.name ?? type?.model ?? placed.device_type;
}

/** Phrase the failed face(s) for a placement, given how many of its faces failed. */
function facePhrase(placed: PlacedDevice, failureCount: number): string {
  const hasFront = !!placed.front_image;
  const hasRear = !!placed.rear_image;

  // Exactly one face carries an image: only it could have failed.
  if (hasFront && !hasRear) return "Front image";
  if (hasRear && !hasFront) return "Rear image";

  // Both faces carry images. Name both only when both failed; a single failure
  // is ambiguous as to which face, so stay generic.
  if (hasFront && hasRear && failureCount >= 2) return "Front and rear images";
  return "An image";
}

function message(facePhrase: string, label: string): string {
  return `${facePhrase} for "${label}" failed to load`;
}

/**
 * @param failedKeys - Device-level store keys, one entry per failed face.
 * @param layout - The loaded layout, used to resolve labels and faces.
 * @returns One message per failed device. Repeated keys for the same device are
 * aggregated, but two distinct devices each surface a message even when their
 * labels match, so the toast count never under-reports failed devices.
 */
export function resolveImageFailureMessages(
  failedKeys: string[],
  layout: Layout,
): string[] {
  const counts = new Map<string, number>();
  for (const key of failedKeys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // One message per device key (counts already de-duped repeated keys above).
  // Collect into an array, not a Set: two distinct devices that resolve to the
  // same label must each surface, or the user under-counts failed devices.
  const messages: string[] = [];
  for (const [key, count] of counts) {
    if (isPlacementKey(key)) {
      const placed = findPlacedDevice(layout, deviceIdFromPlacementKey(key));
      // Device gone from the layout: drop it rather than surface a bare UUID.
      if (!placed) continue;
      messages.push(
        message(facePhrase(placed, count), deviceLabel(layout, placed)),
      );
    } else {
      // A device-type slug key (embedded image): the face is not encoded, so
      // the slug is the most specific label we can name.
      messages.push(message("An image", key));
    }
  }

  return messages;
}
