import { describe, it, expect } from "vitest";
import {
  adaptLegacyLayout,
  CARRIER_2COL_SLUG,
  CARRIER_2X2_SLUG,
} from "$lib/storage";
import { toInternalUnits } from "$lib/utils/position";
import { UNITS_PER_U } from "$lib/types/constants";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import {
  createTestContainerType,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";
import type { Layout, PlacedDevice } from "$lib/types";

/** All rack-level devices across all racks (no container_id). */
function rackLevel(layout: Layout): PlacedDevice[] {
  return layout.racks.flatMap((r) =>
    r.devices.filter((d) => d.container_id === undefined),
  );
}

/** All container-child devices across all racks (container_id set). */
function children(layout: Layout): PlacedDevice[] {
  return layout.racks.flatMap((r) =>
    r.devices.filter((d) => d.container_id !== undefined),
  );
}

describe("adaptLegacyLayout", () => {
  describe("fractional rail snapping", () => {
    it("snaps a device at a fractional rail position to the nearest whole U", () => {
      const dt = createTestDeviceType({ slug: "rb-1u", u_height: 1 });
      const layout = createTestLayout({
        device_types: [dt],
        racks: [
          createTestRack({
            devices: [
              // U5 1/3 == 5.333U == 32 internal units (not a multiple of 6)
              createTestDevice({
                id: "frac",
                device_type: "rb-1u",
                position: 32 / UNITS_PER_U, // factory re-applies toInternalUnits
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const device = rackLevel(adapted).find((d) => d.id === "frac");
      // 32 internal -> round(32/6)=5 -> 30 internal == U5
      expect(device?.position).toBe(toInternalUnits(5));
    });

    it("leaves a whole-U rail position unchanged", () => {
      const dt = createTestDeviceType({ slug: "srv-2u", u_height: 2 });
      const layout = createTestLayout({
        device_types: [dt],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "whole",
                device_type: "srv-2u",
                position: 10, // U10
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const device = rackLevel(adapted).find((d) => d.id === "whole");
      expect(device?.position).toBe(toInternalUnits(10));
    });
  });

  describe("half-width pair wrapping (legacy slot_position)", () => {
    it("wraps two co-located half-width devices into a carrier-1u-2col with two children", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "left-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
              createTestDevice({
                id: "right-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);

      // The two half-width devices are no longer rack-level placements.
      const carriers = rackLevel(adapted).filter(
        (d) => d.device_type === CARRIER_2COL_SLUG,
      );
      // eslint-disable-next-line no-restricted-syntax -- one synthesized carrier wraps the pair
      expect(carriers).toHaveLength(1);
      const carrier = carriers[0]!;
      expect(carrier.auto_created).toBe(true);
      expect(carrier.position).toBe(toInternalUnits(10));

      const kids = children(adapted);
      // eslint-disable-next-line no-restricted-syntax -- the pair becomes exactly two children
      expect(kids).toHaveLength(2);
      // Both children belong to the carrier and reference distinct slots.
      // The legacy slot_position marker is dropped: children are located by
      // slot_id alone in the carrier-first model.
      for (const kid of kids) {
        expect(kid.container_id).toBe(carrier.id);
        expect(kid.device_type).toBe("half-width");
        expect("slot_position" in kid).toBe(false);
      }
      const slotIds = kids.map((k) => k.slot_id);
      expect(slotIds).toContain("col-1");
      expect(slotIds).toContain("col-2");

      // The carrier device type was injected into device_types.
      expect(
        adapted.device_types.some((t) => t.slug === CARRIER_2COL_SLUG),
      ).toBe(true);
    });

    it("wraps a bare co-located pair (slot_position and slot_width both stripped) into a carrier", () => {
      // The dd25f4c serializer (#1248/#1602) dropped both slot_position and
      // slot_width. Two co-located rack-level devices with neither field is an
      // unambiguous half-width pair and must still become a carrier.
      const stripped = createTestDeviceType({
        slug: "stripped-half",
        u_height: 1,
        // slot_width intentionally omitted (stripped by the broken serializer)
      });
      const layout = createTestLayout({
        device_types: [stripped],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "p1",
                device_type: "stripped-half",
                position: 10,
              }),
              createTestDevice({
                id: "p2",
                device_type: "stripped-half",
                position: 10,
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const carriers = rackLevel(adapted).filter((d) => d.auto_created);
      // eslint-disable-next-line no-restricted-syntax -- a bare pair recovers to exactly one carrier
      expect(carriers).toHaveLength(1);
      expect(carriers[0]?.device_type).toBe(CARRIER_2COL_SLUG);
      // eslint-disable-next-line no-restricted-syntax -- both devices become children, none lost
      expect(children(adapted)).toHaveLength(2);
    });

    it("spills more than two co-located half-width devices across multiple carriers without dropping any", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "h1",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
              createTestDevice({
                id: "h2",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
              createTestDevice({
                id: "h3",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      // Three half-width devices, two slots per carrier: two carriers, no loss.
      const carriers = rackLevel(adapted).filter((d) => d.auto_created);
      // eslint-disable-next-line no-restricted-syntax -- 3 devices / 2 slots = 2 carriers
      expect(carriers).toHaveLength(2);
      // eslint-disable-next-line no-restricted-syntax -- every device survives as a child
      expect(children(adapted)).toHaveLength(3);
    });

    it("does not pair devices on different faces", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "front-half",
                device_type: "half-width",
                position: 10,
                face: "front",
              }),
              createTestDevice({
                id: "rear-half",
                device_type: "half-width",
                position: 10,
                face: "rear",
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      // Two separate carriers (one per face), each with one child.
      const carriers = rackLevel(adapted).filter((d) => d.auto_created);
      // eslint-disable-next-line no-restricted-syntax -- a front and a rear carrier, not a pair
      expect(carriers).toHaveLength(2);
    });
  });

  describe("sub-U single wrapping", () => {
    it("wraps a half-height device into a carrier-1u-2x2", () => {
      const subU = createTestDeviceType({
        slug: "tiny",
        u_height: 0.5,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [subU],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "tiny-dev",
                device_type: "tiny",
                position: 12,
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const carrier = rackLevel(adapted).find((d) => d.auto_created);
      expect(carrier?.device_type).toBe(CARRIER_2X2_SLUG);
      expect(carrier?.position).toBe(toInternalUnits(12));

      const kids = children(adapted);
      // eslint-disable-next-line no-restricted-syntax -- single sub-U device yields one child
      expect(kids).toHaveLength(1);
      expect(kids[0]?.container_id).toBe(carrier?.id);
      expect(kids[0]?.slot_id).toBeDefined();
    });
  });

  describe("idempotency", () => {
    it("is a no-op for a layout that is already carrier-first", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "left-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
              createTestDevice({
                id: "right-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
            ],
          }),
        ],
      });

      const once = adaptLegacyLayout(layout);
      const twice = adaptLegacyLayout(once);

      expect(rackLevel(twice)).toEqual(rackLevel(once));
      expect(children(twice)).toEqual(children(once));
    });

    it("leaves an all-whole-U full-width layout untouched", () => {
      const dt = createTestDeviceType({ slug: "srv-2u", u_height: 2 });
      const layout = createTestLayout({
        device_types: [dt],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "a",
                device_type: "srv-2u",
                position: 5,
              }),
              createTestDevice({
                id: "b",
                device_type: "srv-2u",
                position: 20,
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      // No carriers synthesized for a clean full-width whole-U layout.
      expect(children(adapted).length).toBe(0);
      expect(
        rackLevel(adapted)
          .map((d) => d.id)
          .sort(),
      ).toEqual(["a", "b"]);
    });
  });

  describe("idempotency", () => {
    it("does not re-wrap overflow carriers on a second run", () => {
      // Three co-located half-width devices spill into two carriers. Those two
      // carriers share a (position, face); a second adapter run must not treat
      // them as a bare co-located pair and wrap them again.
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "h1",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
              createTestDevice({
                id: "h2",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
              createTestDevice({
                id: "h3",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
            ],
          }),
        ],
      });

      const once = adaptLegacyLayout(layout);
      const twice = adaptLegacyLayout(once);
      // Carrier and child counts are stable; no nesting introduced.
      expect(rackLevel(twice).filter((d) => d.auto_created).length).toBe(
        rackLevel(once).filter((d) => d.auto_created).length,
      );
      expect(children(twice).length).toBe(children(once).length);
    });
  });

  describe("left/right ordering", () => {
    it("places an explicit left device in col-1 and right in col-2 regardless of input order", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const layout = createTestLayout({
        device_types: [half],
        racks: [
          createTestRack({
            devices: [
              // Right listed first to prove ordering is by slot_position, not index.
              createTestDevice({
                id: "right-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
              createTestDevice({
                id: "left-dev",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const kids = children(adapted);
      const leftKid = kids.find((k) => k.id === "left-dev");
      const rightKid = kids.find((k) => k.id === "right-dev");
      expect(leftKid?.slot_id).toBe("col-1");
      expect(rightKid?.slot_id).toBe("col-2");
    });
  });

  describe("defensive handling", () => {
    it("returns a safe empty-rack layout when racks is missing or malformed", () => {
      // Untrusted decode/restore paths can hand a structurally-odd object.
      // loadLayout maps over racks immediately, so racks must always be an array.
      const bogus = { name: "x", device_types: [] } as unknown as Layout;
      const adapted = adaptLegacyLayout(bogus);
      expect(Array.isArray(adapted.racks)).toBe(true);
    });

    it("does not throw on a null device entry in a rack", () => {
      const dt = createTestDeviceType({ slug: "srv", u_height: 1 });
      const layout = createTestLayout({
        device_types: [dt],
        racks: [
          createTestRack({
            devices: [
              null as unknown as PlacedDevice,
              createTestDevice({ id: "ok", device_type: "srv", position: 5 }),
            ],
          }),
        ],
      });
      expect(() => adaptLegacyLayout(layout)).not.toThrow();
    });
  });

  describe("golden-corpus round trip through share", () => {
    it("adapts a mixed legacy layout, survives encode/decode, and re-adapts stably", () => {
      const half = createTestDeviceType({
        slug: "half-width",
        u_height: 1,
        slot_width: 1,
      });
      const subU = createTestDeviceType({
        slug: "tiny",
        u_height: 0.5,
        slot_width: 1,
      });
      const full = createTestDeviceType({ slug: "srv-2u", u_height: 2 });

      const legacy = createTestLayout({
        device_types: [half, subU, full],
        racks: [
          createTestRack({
            id: "rack-0",
            devices: [
              // half-width pair -> carrier-1u-2col
              createTestDevice({
                id: "l",
                device_type: "half-width",
                position: 10,
                slot_position: "left",
              }),
              createTestDevice({
                id: "r",
                device_type: "half-width",
                position: 10,
                slot_position: "right",
              }),
              // sub-U single -> carrier-1u-2x2
              createTestDevice({
                id: "t",
                device_type: "tiny",
                position: 20,
              }),
              // full-width whole-U stays on rails
              createTestDevice({
                id: "s",
                device_type: "srv-2u",
                position: 30,
              }),
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(legacy);

      // Encode -> decode -> re-adapt (decode is not full-schema validated, so
      // it runs through the adapter on real ingress).
      const encoded = encodeLayout(adapted);
      expect(encoded).not.toBeNull();
      const decoded = decodeLayout(encoded!).layout;
      expect(decoded).not.toBeNull();
      const reAdapted = adaptLegacyLayout(decoded!);

      // No data loss: every wrapped device survives as a carrier child, the
      // full-width device stays on the rails, and the carrier count is stable.
      const kids = children(reAdapted);
      const carriers = rackLevel(reAdapted).filter((d) => d.auto_created);
      const railDevices = rackLevel(reAdapted).filter((d) => !d.auto_created);

      const childTypes = kids.map((k) => k.device_type).sort();
      expect(childTypes).toEqual(["half-width", "half-width", "tiny"]);

      const carrierTypes = carriers.map((c) => c.device_type).sort();
      expect(carrierTypes).toEqual([CARRIER_2COL_SLUG, CARRIER_2X2_SLUG]);

      const railTypes = railDevices.map((d) => d.device_type);
      expect(railTypes).toEqual(["srv-2u"]);

      // The decoded carrier device types must carry their slot grid so children
      // resolve to real slots (share links do not encode the slot grid; the
      // adapter rehydrates it from the starter library).
      for (const slug of [CARRIER_2COL_SLUG, CARRIER_2X2_SLUG]) {
        const carrierType = reAdapted.device_types.find((t) => t.slug === slug);
        expect(carrierType?.slots?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it("rehydrates a carrier type that lost its slot grid in transit", () => {
      // Simulate a decoded share link: a carrier placement plus a child, but the
      // carrier device type arrives with no slots.
      const child = createTestDeviceType({ slug: "half-width", u_height: 1 });
      const slotlessCarrier = createTestDeviceType({
        slug: CARRIER_2COL_SLUG,
        u_height: 1,
        // slots intentionally absent (not encoded in the share format)
      });
      const layout = createTestLayout({
        device_types: [slotlessCarrier, child],
        racks: [
          createTestRack({
            devices: [
              createTestDevice({
                id: "carrier",
                device_type: CARRIER_2COL_SLUG,
                position: 10,
                auto_created: true,
              }),
              {
                id: "kid",
                device_type: "half-width",
                position: 0,
                face: "front",
                container_id: "carrier",
                slot_id: "col-1",
              },
            ],
          }),
        ],
      });

      const adapted = adaptLegacyLayout(layout);
      const carrierType = adapted.device_types.find(
        (t) => t.slug === CARRIER_2COL_SLUG,
      );
      expect(carrierType?.slots?.length ?? 0).toBeGreaterThan(0);
    });

    it("round-trips a user-placed (non-auto-created) container's children through share", () => {
      // A user-placed shelf is a container whose children are NOT auto_created.
      // Share decode must still restore the parent linkage (not gate on the
      // auto_created flag), or the children collapse to rack-level placements.
      const shelf = createTestContainerType({
        slug: "shelf-2bay",
        u_height: 1,
        slots: [
          { id: "bay-1", position: { row: 0, col: 0 }, width_fraction: 0.5 },
          { id: "bay-2", position: { row: 0, col: 1 }, width_fraction: 0.5 },
        ],
      });
      const gear = createTestDeviceType({ slug: "gear", u_height: 1 });
      const layout = createTestLayout({
        device_types: [shelf, gear],
        racks: [
          createTestRack({
            id: "rack-0",
            devices: [
              createTestDevice({
                id: "shelf-1",
                device_type: "shelf-2bay",
                position: 5,
              }),
              {
                id: "child-1",
                device_type: "gear",
                position: 0,
                face: "front",
                container_id: "shelf-1",
                slot_id: "bay-1",
              },
            ],
          }),
        ],
      });

      const encoded = encodeLayout(layout);
      expect(encoded).not.toBeNull();
      const decoded = decodeLayout(encoded!).layout;
      expect(decoded).not.toBeNull();

      const decodedChild = decoded!.racks[0]?.devices.find(
        (d) => d.device_type === "gear",
      );
      // The child stays a child (container linkage preserved), not a rack-level
      // device whose raw 0-index position got reinterpreted as a rail U.
      expect(decodedChild?.container_id).toBeDefined();
      expect(decodedChild?.slot_id).toBe("bay-1");

      // The decoded parent type must still expose the referenced slot, or the
      // child has nowhere to render. Container slot grids round-trip in share.
      const decodedShelfType = decoded!.device_types.find(
        (t) => t.slug === "shelf-2bay",
      );
      expect(decodedShelfType?.slots?.some((s) => s.id === "bay-1")).toBe(true);
    });
  });
});
