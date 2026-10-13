/**
 * Duplicate slot ids inside one container type (#3342) are schema-legal, but
 * everything that keys cells by id collapses them. The load path renames the
 * later duplicates to unique ids and moves each child that named an
 * ambiguous id onto one of its occurrences, so prior-release files keep
 * loading and every cell is reachable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/storage/pre-carrier-backup", () => ({
  ensurePreCarrierBackup: vi.fn(),
}));

import { adaptLegacyLayout } from "$lib/storage";
import { ensurePreCarrierBackup } from "$lib/storage/pre-carrier-backup";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import type { Layout, PlacedDevice, Slot } from "$lib/types";
import {
  createTestContainerChild,
  createTestContainerType,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
  createTestSlot,
} from "./factories";

const CHASSIS = "dup-chassis";

const oneU = createTestDeviceType({
  slug: "one-u",
  u_height: 1,
  slot_width: 1,
});
const twoU = createTestDeviceType({
  slug: "two-u",
  u_height: 2,
  slot_width: 1,
});

function layoutWith(slots: Slot[], children: PlacedDevice[]): Layout {
  return createTestLayout({
    device_types: [
      createTestContainerType({ slug: CHASSIS, u_height: 2, slots }),
      oneU,
      twoU,
    ],
    racks: [
      createTestRack({
        devices: [
          createTestDevice({
            id: "chassis",
            device_type: CHASSIS,
            position: 5,
          }),
          ...children,
        ],
      }),
    ],
  });
}

function slotIds(layout: Layout): string[] {
  return (
    layout.device_types
      .find((dt) => dt.slug === CHASSIS)
      ?.slots?.map((s) => s.id) ?? []
  );
}

function slotOf(layout: Layout, childId: string): string | undefined {
  return layout.racks[0]!.devices.find((d) => d.id === childId)?.slot_id;
}

function bay(col: number, heightUnits = 1): Slot {
  return createTestSlot({
    id: "bay",
    position: { row: 0, col },
    width_fraction: 0.5,
    height_units: heightUnits,
  });
}

function childIn(id: string, slotId: string, deviceType = "one-u") {
  return createTestContainerChild({
    id,
    device_type: deviceType,
    container_id: "chassis",
    slot_id: slotId,
  });
}

beforeEach(() => {
  vi.mocked(ensurePreCarrierBackup).mockClear();
});

describe("duplicate slot id normalisation on load", () => {
  it("keeps the first occurrence and renames later ones with a numeric suffix", () => {
    const adapted = adaptLegacyLayout(
      layoutWith([bay(0), bay(1)], [childIn("a", "bay")]),
    );

    expect(slotIds(adapted)).toEqual(["bay", "bay-2"]);
    expect(slotOf(adapted, "a")).toBe("bay");
  });

  it("skips a suffix another slot already uses", () => {
    const taken = createTestSlot({
      id: "bay-2",
      position: { row: 1, col: 0 },
    });
    const adapted = adaptLegacyLayout(layoutWith([bay(0), taken, bay(1)], []));

    expect(slotIds(adapted)).toEqual(["bay", "bay-2", "bay-3"]);
  });

  it("gives each child that named the ambiguous id its own occurrence, in device order", () => {
    const adapted = adaptLegacyLayout(
      layoutWith([bay(0), bay(1)], [childIn("a", "bay"), childIn("b", "bay")]),
    );

    expect(slotOf(adapted, "a")).toBe("bay");
    expect(slotOf(adapted, "b")).toBe("bay-2");
  });

  it("moves a child to the first free occurrence it fits", () => {
    const adapted = adaptLegacyLayout(
      layoutWith(
        [bay(0, 1), bay(1, 2)],
        [childIn("tall", "bay", "two-u"), childIn("short", "bay")],
      ),
    );

    expect(slotOf(adapted, "tall")).toBe("bay-2");
    expect(slotOf(adapted, "short")).toBe("bay");
  });

  it("leaves a child on the first occurrence when every occurrence is taken", () => {
    const adapted = adaptLegacyLayout(
      layoutWith(
        [bay(0), bay(1)],
        [childIn("a", "bay"), childIn("b", "bay"), childIn("c", "bay")],
      ),
    );

    expect(slotOf(adapted, "c")).toBe("bay");
  });

  it("does not take the pre-carrier-first backup", () => {
    adaptLegacyLayout(layoutWith([bay(0), bay(1)], [childIn("a", "bay")]));

    expect(ensurePreCarrierBackup).not.toHaveBeenCalled();
  });

  it("returns a layout with unique slot ids unchanged", () => {
    const layout = layoutWith(
      [
        createTestSlot({ id: "left", position: { row: 0, col: 0 } }),
        createTestSlot({ id: "right", position: { row: 0, col: 1 } }),
      ],
      [childIn("a", "right")],
    );

    expect(adaptLegacyLayout(layout)).toBe(layout);
  });

  it("normalises a container type carried in a share link", () => {
    const layout = layoutWith(
      [bay(0), bay(1)],
      [childIn("a", "bay"), childIn("b", "bay")],
    );
    const decoded = decodeLayout(encodeLayout(layout)!).layout!;
    const adapted = adaptLegacyLayout(decoded);

    expect(slotIds(adapted)).toEqual(["bay", "bay-2"]);
    const childSlots = adapted.racks[0]!.devices.filter(
      (d) => d.container_id,
    ).map((d) => d.slot_id);
    expect(childSlots.sort()).toEqual(["bay", "bay-2"]);
  });
});
