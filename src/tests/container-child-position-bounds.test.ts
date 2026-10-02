// Load-time bound on a container child's position (#3456). A child whose
// position + height runs past its container's height is normalised back to
// position 0 on every ingress (file load, share decode), so a hand-edited file
// or crafted share link cannot land a child outside its carrier.
import { describe, it, expect } from "vitest";
import { parseLayoutYaml, serializeLayoutToYaml } from "$lib/utils/yaml";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import { toInternalUnits } from "$lib/utils/position";
import {
  createTestContainerChild,
  createTestContainerType,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
  createTestSlot,
} from "./factories";
import type { Layout } from "$lib/types";

/** A rack holding one container of the given height with one 1U child. */
function layoutWithChildAt(
  containerHeight: number,
  childPosition: number,
): Layout {
  return createTestLayout({
    device_types: [
      createTestContainerType({
        slug: "test-shelf",
        u_height: containerHeight,
        slots: [
          createTestSlot({
            id: "cell",
            width_fraction: 1,
            height_units: containerHeight,
          }),
        ],
      }),
      createTestDeviceType({ slug: "mini-box", u_height: 1 }),
    ],
    racks: [
      createTestRack({
        id: "rack-0",
        devices: [
          createTestDevice({
            id: "shelf",
            device_type: "test-shelf",
            position: toInternalUnits(5),
          }),
          createTestContainerChild({
            id: "box",
            name: "Box",
            device_type: "mini-box",
            container_id: "shelf",
            slot_id: "cell",
            position: childPosition,
          }),
        ],
      }),
    ],
  });
}

function childPosition(layout: Layout): number | undefined {
  return layout.racks[0]?.devices.find((d) => d.container_id)?.position;
}

describe("container child position bounds (#3456)", () => {
  describe("file load", () => {
    it("normalises a child sitting past the top of its 1U container to position 0", async () => {
      const yaml = await serializeLayoutToYaml(layoutWithChildAt(1, 2));

      const loaded = await parseLayoutYaml(yaml);

      expect(childPosition(loaded)).toBe(0);
    });

    it("keeps a child whose position is inside its container", async () => {
      const yaml = await serializeLayoutToYaml(layoutWithChildAt(2, 1));

      const loaded = await parseLayoutYaml(yaml);

      expect(childPosition(loaded)).toBe(1);
    });
  });

  describe("share decode", () => {
    it("does not decode to a child outside its container", () => {
      const encoded = encodeLayout(layoutWithChildAt(1, 2));
      expect(encoded).not.toBeNull();

      const { layout } = decodeLayout(encoded!);

      expect(layout).not.toBeNull();
      expect(childPosition(layout!)).toBe(0);
    });

    it("keeps an in-bounds child position through a round trip", () => {
      const encoded = encodeLayout(layoutWithChildAt(2, 1));

      const { layout } = decodeLayout(encoded!);

      expect(childPosition(layout!)).toBe(1);
    });
  });
});
