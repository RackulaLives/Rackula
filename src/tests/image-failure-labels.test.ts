import { describe, it, expect } from "vitest";
import { resolveImageFailureMessages } from "$lib/utils/image-failure-labels";
import { placementKey } from "$lib/utils/placement-key";
import {
  createTestLayout,
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

const LAYOUT_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";

function layoutWith(
  device: Parameters<typeof createTestDevice>[0],
  deviceType = createTestDeviceType({ slug: "test-device" }),
) {
  return createTestLayout({
    metadata: { id: LAYOUT_ID },
    device_types: [deviceType],
    racks: [createTestRack({ devices: [createTestDevice(device)] })],
  });
}

describe("resolveImageFailureMessages", () => {
  it("names the failed front face and the human device label", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "Synology NAS",
      front_image: "front.png",
    });

    const messages = resolveImageFailureMessages(
      [placementKey(LAYOUT_ID, DEVICE_ID)],
      layout,
    );

    expect(messages).toEqual(['Front image for "Synology NAS" failed to load']);
  });

  it("names the rear face when only the rear image is referenced", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "Edge Switch",
      rear_image: "rear.png",
    });

    const messages = resolveImageFailureMessages(
      [placementKey(LAYOUT_ID, DEVICE_ID)],
      layout,
    );

    expect(messages).toEqual(['Rear image for "Edge Switch" failed to load']);
  });

  it("reports both faces when the same key fails twice and both are referenced", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "Big Server",
      front_image: "front.png",
      rear_image: "rear.png",
    });
    const key = placementKey(LAYOUT_ID, DEVICE_ID);

    const messages = resolveImageFailureMessages([key, key], layout);

    expect(messages).toEqual([
      'Front and rear images for "Big Server" failed to load',
    ]);
  });

  it("falls back to the device type model when the placement has no custom name", () => {
    const layout = layoutWith(
      {
        id: DEVICE_ID,
        device_type: "poweredge-r740",
        front_image: "front.png",
      },
      createTestDeviceType({ slug: "poweredge-r740", model: "PowerEdge R740" }),
    );

    const messages = resolveImageFailureMessages(
      [placementKey(LAYOUT_ID, DEVICE_ID)],
      layout,
    );

    expect(messages).toEqual([
      'Front image for "PowerEdge R740" failed to load',
    ]);
  });

  it("uses a generic image phrase when the failed face cannot be determined", () => {
    // Both faces referenced but only one failure recorded: the specific face is
    // ambiguous, so the message stays generic rather than guessing.
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "Ambiguous Box",
      front_image: "front.png",
      rear_image: "rear.png",
    });

    const messages = resolveImageFailureMessages(
      [placementKey(LAYOUT_ID, DEVICE_ID)],
      layout,
    );

    expect(messages).toEqual(['An image for "Ambiguous Box" failed to load']);
  });

  it("skips a placement key whose device is not in the layout (never emits a bare UUID)", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "Present Device",
      front_image: "front.png",
    });
    const orphanKey = placementKey(
      LAYOUT_ID,
      "33333333-3333-4333-8333-333333333333",
    );

    const messages = resolveImageFailureMessages([orphanKey], layout);

    expect(messages).toEqual([]);
  });

  it("names a device-type slug key (non-placement) without inventing a face", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      front_image: "front.png",
    });

    const messages = resolveImageFailureMessages(["bundled-thing"], layout);

    expect(messages).toEqual(['An image for "bundled-thing" failed to load']);
  });

  it("de-dupes identical messages from repeated keys", () => {
    const layout = layoutWith({
      id: DEVICE_ID,
      device_type: "test-device",
      name: "One Face",
      front_image: "front.png",
    });
    const key = placementKey(LAYOUT_ID, DEVICE_ID);

    // Same single-face failure recorded twice -> one message, not two.
    const messages = resolveImageFailureMessages([key, key], layout);

    expect(messages).toEqual(['Front image for "One Face" failed to load']);
  });

  it("surfaces each failed device even when two share the same label", () => {
    const DEVICE_ID_2 = "44444444-4444-4444-8444-444444444444";
    const layout = createTestLayout({
      metadata: { id: LAYOUT_ID },
      device_types: [createTestDeviceType({ slug: "test-device" })],
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: DEVICE_ID,
              device_type: "test-device",
              name: "NAS",
              front_image: "front.png",
            }),
            createTestDevice({
              id: DEVICE_ID_2,
              device_type: "test-device",
              name: "NAS",
              front_image: "front.png",
            }),
          ],
        }),
      ],
    });

    // Two distinct devices with an identical label both fail: each must surface,
    // so the user is not told fewer images failed than actually did.
    const messages = resolveImageFailureMessages(
      [
        placementKey(LAYOUT_ID, DEVICE_ID),
        placementKey(LAYOUT_ID, DEVICE_ID_2),
      ],
      layout,
    );

    expect(messages).toEqual([
      'Front image for "NAS" failed to load',
      'Front image for "NAS" failed to load',
    ]);
  });
});
