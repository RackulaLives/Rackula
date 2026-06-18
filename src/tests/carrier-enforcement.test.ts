/**
 * Carrier-First Placement Enforcement Tests (C4, epic #2158)
 *
 * The keystone slice locks the carrier-first rule at three layers so it cannot
 * leak:
 * 1. Zod schema (PlacedDeviceSchema + LayoutSchema.superRefine): a sub-U /
 *    non-integer-height / half-width placement requires container_id + slot_id;
 *    rail placements sit at integer-U positions; one child per slot; child fits
 *    its cell.
 * 2. Store (placeDevice): a sub-U / half-width rail placement is refused.
 * 3. Exemption: a `category: "blank"` device (filler panel) may rail-mount at
 *    any height, since it is not functional gear that needs a carrier.
 *
 * A valid carrier-first layout always serialises without error.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { LayoutSchema } from "$lib/schemas";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

// =============================================================================
// Schema enforcement (LayoutSchema.superRefine)
// =============================================================================

/**
 * A modern-format layout (version >= 0.7.0) whose rack-level device positions
 * are already in internal units (U * 6). Build the device list per test.
 *
 * Using a >= 0.7.0 version avoids the position migration transform so the
 * placements under test reach superRefine exactly as written.
 */
function layoutWith(
  device_types: unknown[],
  devices: unknown[],
): Record<string, unknown> {
  return {
    version: "1.0.0",
    name: "Enforcement Test Layout",
    racks: [
      {
        id: "rack-1",
        name: "Test Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        show_rear: true,
        form_factor: "4-post" as const,
        starting_unit: 1,
        position: 0,
        devices,
      },
    ],
    device_types,
    settings: { display_mode: "label" as const, show_labels_on_images: false },
  };
}

/** A half-width full-height carrier (1U, two half-width cells). */
const carrier2col = {
  slug: "carrier-1u-2col",
  model: "Carrier (1U, 2 Column)",
  u_height: 1,
  category: "shelf",
  colour: "#888888",
  slots: [
    {
      id: "col-1",
      position: { row: 0, col: 0 },
      width_fraction: 0.5,
      height_units: 1,
    },
    {
      id: "col-2",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
      height_units: 1,
    },
  ],
};

/** A 2x2 carrier (1U, four half-width 0.5U cells). */
const carrier2x2 = {
  slug: "carrier-1u-2x2",
  model: "Carrier (1U, 2x2)",
  u_height: 1,
  category: "shelf",
  colour: "#888888",
  slots: [
    {
      id: "r0-c0",
      position: { row: 0, col: 0 },
      width_fraction: 0.5,
      height_units: 0.5,
    },
    {
      id: "r0-c1",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
      height_units: 0.5,
    },
    {
      id: "r1-c0",
      position: { row: 1, col: 0 },
      width_fraction: 0.5,
      height_units: 0.5,
    },
    {
      id: "r1-c1",
      position: { row: 1, col: 1 },
      width_fraction: 0.5,
      height_units: 0.5,
    },
  ],
};

const halfWidthDevice = {
  slug: "rb5009",
  model: "RB5009",
  u_height: 0.5,
  slot_width: 1,
  category: "network",
  colour: "#4A90D9",
};

const fullWidthServer = {
  slug: "server-1u",
  model: "Server",
  u_height: 1,
  slot_width: 2,
  category: "server",
  colour: "#4A90D9",
};

const blankHalfU = {
  slug: "0-5u-blank",
  model: "Blank Panel",
  u_height: 0.5,
  category: "blank",
  colour: "#888888",
};

describe("LayoutSchema carrier-first enforcement", () => {
  describe("sub-U / half-width rail placements", () => {
    it("rejects a sub-U device placed directly on the rail (no container)", () => {
      const layout = layoutWith(
        [halfWidthDevice],
        [
          {
            id: "d1",
            device_type: "rb5009",
            position: 30, // U5 in internal units
            face: "front" as const,
          },
        ],
      );

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => /carrier/i.test(i.message)),
        ).toBe(true);
      }
    });

    it("rejects a half-width full-height device placed directly on the rail", () => {
      const halfWidthFullHeight = {
        ...halfWidthDevice,
        slug: "mini-1u",
        u_height: 1,
      };
      const layout = layoutWith(
        [halfWidthFullHeight],
        [
          {
            id: "d1",
            device_type: "mini-1u",
            position: 30,
            face: "front" as const,
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });

    it("accepts a sub-U half-width device when mounted inside a carrier", () => {
      const layout = layoutWith(
        [carrier2x2, halfWidthDevice],
        [
          {
            id: "carrier-1",
            device_type: "carrier-1u-2x2",
            position: 30,
            face: "front" as const,
          },
          {
            id: "child-1",
            device_type: "rb5009",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "r0-c0",
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("blank exemption", () => {
    it("accepts a 0.5U full-width blank panel placed directly on the rail", () => {
      const layout = layoutWith(
        [blankHalfU],
        [
          {
            id: "d1",
            device_type: "0-5u-blank",
            position: 30, // integer-U boundary
            face: "front" as const,
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("integer-U rail position", () => {
    it("rejects a full-width device at a fractional rail position", () => {
      const layout = layoutWith(
        [fullWidthServer],
        [
          {
            id: "d1",
            device_type: "server-1u",
            position: 33, // U5.5 - not an integer-U boundary
            face: "front" as const,
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });

    it("accepts a full-width device at an integer-U rail position", () => {
      const layout = layoutWith(
        [fullWidthServer],
        [
          {
            id: "d1",
            device_type: "server-1u",
            position: 30,
            face: "front" as const,
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("cell occupancy and fit", () => {
    it("rejects two children sharing one slot", () => {
      const layout = layoutWith(
        [carrier2col, { ...halfWidthDevice, u_height: 1 }],
        [
          {
            id: "carrier-1",
            device_type: "carrier-1u-2col",
            position: 30,
            face: "front" as const,
          },
          {
            id: "child-1",
            device_type: "rb5009",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "col-1",
          },
          {
            id: "child-2",
            device_type: "rb5009",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "col-1", // same slot as child-1
          },
        ],
      );

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            /already occupied|one child/i.test(i.message),
          ),
        ).toBe(true);
      }
    });

    it("rejects a child taller than its slot cell", () => {
      const tallChild = {
        slug: "tall-half",
        model: "Tall Half",
        u_height: 1, // taller than the 0.5U cell
        slot_width: 1,
        category: "network",
        colour: "#4A90D9",
      };
      const layout = layoutWith(
        [carrier2x2, tallChild],
        [
          {
            id: "carrier-1",
            device_type: "carrier-1u-2x2",
            position: 30,
            face: "front" as const,
          },
          {
            id: "child-1",
            device_type: "tall-half",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "r0-c0",
          },
        ],
      );

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            /fit|too (tall|wide)/i.test(i.message),
          ),
        ).toBe(true);
      }
    });

    it("rejects a child wider than its slot cell", () => {
      const wideChild = {
        slug: "wide-child",
        model: "Wide Child",
        u_height: 0.5,
        slot_width: 2, // full-width, wider than the half-width cell
        category: "network",
        colour: "#4A90D9",
      };
      const layout = layoutWith(
        [carrier2x2, wideChild],
        [
          {
            id: "carrier-1",
            device_type: "carrier-1u-2x2",
            position: 30,
            face: "front" as const,
          },
          {
            id: "child-1",
            device_type: "wide-child",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "r0-c0",
          },
        ],
      );

      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });
  });

  describe("a valid carrier-first layout always serialises", () => {
    it("round-trips a carrier with a fitting child", () => {
      const layout = layoutWith(
        [carrier2col, { ...halfWidthDevice, u_height: 1 }],
        [
          {
            id: "carrier-1",
            device_type: "carrier-1u-2col",
            position: 30,
            face: "front" as const,
          },
          {
            id: "child-1",
            device_type: "rb5009",
            position: 0,
            face: "front" as const,
            container_id: "carrier-1",
            slot_id: "col-1",
          },
        ],
      );

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Store enforcement (placeDevice)
// =============================================================================

describe("placeDevice store enforcement", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  function setupRack(height = 12): { store: Store; rackId: string } {
    const store = getLayoutStore()!;
    const rack = store.addRack("Test Rack", height);
    return { store, rackId: rack!.id };
  }

  it("rejects a sub-U half-width device placed directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "RB5009",
      u_height: 0.5,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(false);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      false,
    );
  });

  it("rejects a half-width full-height device placed directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Mini 1U",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(false);
  });

  it("places a full-width whole-U device directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Server 1U",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(true);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      true,
    );
  });

  it("places a sub-U blank panel directly via placeDevice (exemption)", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Blank Panel",
      u_height: 0.5,
      category: "blank",
      colour: CATEGORY_COLOURS.blank,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(true);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      true,
    );
  });
});

describe("moveDevice store enforcement (carrier-first parity)", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  /** Seed a carrier holding one half-width child; return store + ids. */
  function setupCarrierWithChild(): {
    store: Store;
    rackId: string;
    childIndex: number;
  } {
    const store = getLayoutStore()!;
    const carrierType = store.addDeviceType({
      name: "Carrier",
      u_height: 1,
      category: "shelf",
      colour: CATEGORY_COLOURS.shelf,
      slots: [
        {
          id: "col-1",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
          height_units: 1,
        },
        {
          id: "col-2",
          position: { row: 0, col: 1 },
          width_fraction: 0.5,
          height_units: 1,
        },
      ],
    });
    const childType = store.addDeviceType({
      name: "Half",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
    const rack = store.addRack("Rack", 42)!;
    store.placeDevice(rack.id, carrierType.slug, 5);
    const carrier = store.rack!.devices.find(
      (d) => d.device_type === carrierType.slug,
    )!;
    store.placeInContainer(rack.id, childType.slug, carrier.id, "col-1", 0);
    const child = store.rack!.devices.find(
      (d) => d.container_id === carrier.id,
    )!;
    return {
      store,
      rackId: rack.id,
      childIndex: store.rack!.devices.indexOf(child),
    };
  }

  it("refuses to move a half-width child out onto a bare rail", () => {
    const { store, rackId, childIndex } = setupCarrierWithChild();
    const child = store.rack!.devices[childIndex]!;
    const containerId = child.container_id;

    expect(store.moveDevice(rackId, childIndex, 10)).toBe(false);

    // The child stays in its carrier; it is not detached onto the rail.
    const after = store.rack!.devices.find((d) => d.id === child.id)!;
    expect(after.container_id).toBe(containerId);
  });

  it("still moves a full-width rail device", () => {
    const store = getLayoutStore()!;
    const dt = store.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    const rack = store.addRack("Rack", 42)!;
    store.placeDevice(rack.id, dt.slug, 5);
    const idx = store.rack!.devices.findIndex((d) => d.device_type === dt.slug);

    expect(store.moveDevice(rack.id, idx, 10)).toBe(true);
  });
});

describe("LayoutSchema slot.accepts enforcement (canPlaceInSlot parity)", () => {
  it("rejects a child whose category is not accepted by the slot", () => {
    const restrictedCarrier = {
      slug: "server-only-carrier",
      model: "Server-Only Carrier",
      u_height: 1,
      category: "shelf",
      colour: "#888888",
      slots: [
        {
          id: "bay-1",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
          accepts: ["server"],
        },
      ],
    };
    const networkChild = {
      slug: "switch",
      model: "Switch",
      u_height: 1,
      category: "network",
      colour: "#4A90D9",
    };
    const layout = layoutWith(
      [restrictedCarrier, networkChild],
      [
        {
          id: "carrier-1",
          device_type: "server-only-carrier",
          position: 30,
          face: "front" as const,
        },
        {
          id: "child-1",
          device_type: "switch",
          position: 0,
          face: "front" as const,
          container_id: "carrier-1",
          slot_id: "bay-1",
        },
      ],
    );

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /not accepted/i.test(i.message)),
      ).toBe(true);
    }
  });
});
