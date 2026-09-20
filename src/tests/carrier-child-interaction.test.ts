/**
 * Carrier children on the canvas (#3340).
 *
 * A device inside a carrier could not be selected, focused or dragged: its
 * <g> had role="img" and no handlers, and only the carrier's hitbox started a
 * press. These tests drive a rendered child the way a user does and check the
 * store outcome.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { hideDragTooltip } from "$lib/stores/dragTooltip.svelte";
import { attachPointerDragListeners } from "$lib/utils/rack-pointer-drag";
import { RAIL_WIDTH } from "$lib/constants/layout";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { toInternalUnits } from "$lib/utils/position";
import type { PlacedDevice } from "$lib/types";

const RACK_HEIGHT = 12;
const U_PX = 20;
const INTERIOR_WIDTH = 200;
const RACK_WIDTH = INTERIOR_WIDTH + RAIL_WIDTH * 2;

type Store = ReturnType<typeof getLayoutStore>;

function snapshotRack(store: Store, rackId: string) {
  return (
    JSON.parse(
      JSON.stringify(store.getRackById(rackId)!.devices),
    ) as PlacedDevice[]
  ).sort((a, b) => a.id.localeCompare(b.id));
}

/** A 12U rack with a half-width switch dropped at U5 (an auto-created carrier). */
function setup() {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", RACK_HEIGHT)!;
  const switchType = store.addDeviceType({
    name: "Mini Switch",
    u_height: 1,
    category: "network",
    colour: CATEGORY_COLOURS.network,
    slot_width: 1,
  });
  store.placeDeviceSmart(rack.id, switchType.slug, 5);
  const devices = () => store.getRackById(rack.id)!.devices;
  const carrier = devices().find((d) => !d.container_id)!;
  const child = devices().find((d) => d.container_id)!;
  return { store, rackId: rack.id, slug: switchType.slug, carrier, child };
}

function renderCarrier(
  store: Store,
  rackId: string,
  carrierId: string,
  extra: Record<string, unknown> = {},
) {
  const rack = store.getRackById(rackId)!;
  const carrierIndex = rack.devices.findIndex((d) => d.id === carrierId);
  const carrier = rack.devices[carrierIndex]!;
  const children = rack.devices
    .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
    .filter(({ placedDevice }) => placedDevice.container_id === carrierId);
  return render(RackDevice, {
    props: {
      device: store.device_types.find((dt) => dt.slug === carrier.device_type)!,
      position: carrier.position,
      rackHeight: RACK_HEIGHT,
      rackId,
      deviceIndex: carrierIndex,
      selected: false,
      uHeight: U_PX,
      rackWidth: RACK_WIDTH,
      placedDeviceId: carrier.id,
      deviceLibrary: store.device_types,
      containerChildDevices: children,
      ...extra,
    },
  });
}

function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  button = 0,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      clientX: x,
      clientY: y,
      button,
    }),
  );
}

function tap(target: Element, button = 0) {
  pointer(target, "pointerdown", 0, 0, button);
  pointer(target, "pointerup", 0, 0, button);
}

/** Press on the child, cross the drag threshold, then release at (x, y). */
async function dragTo(target: Element, x: number, y: number) {
  pointer(target, "pointerdown", 0, 0);
  pointer(target, "pointermove", 20, 0);
  await tick();
  pointer(target, "pointermove", x, y);
  pointer(target, "pointerup", x, y);
  await tick();
}

function childButton(slotName: string) {
  return screen.getByRole("button", {
    name: new RegExp(`Mini Switch.* in ${slotName} of`),
  });
}

// Client coordinates for the rack under the fake SVG below: the SVG sits at
// the viewport origin with no viewBox scaling or top padding, so a client
// point maps straight onto rack pixels. The U grid starts below the top rail
// (RackFrame draws row i at i * uHeight + rackPadding + railWidth), so both
// helpers below clear a rail: yForU the top one, xForColumn the left one.
const yForU = (u: number) => RAIL_WIDTH + (RACK_HEIGHT - u) * U_PX + U_PX / 2;
const xForColumn = (col: 1 | 2) =>
  RAIL_WIDTH + (col === 1 ? INTERIOR_WIDTH * 0.25 : INTERIOR_WIDTH * 0.75);

function attachDropListeners(store: Store, rackId: string) {
  const svg = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: RACK_WIDTH,
      bottom: RACK_HEIGHT * U_PX,
      width: RACK_WIDTH,
      height: RACK_HEIGHT * U_PX,
    }),
    viewBox: { baseVal: { width: 0, height: 0 } },
  } as unknown as SVGSVGElement;

  return attachPointerDragListeners({
    getSvgElement: () => svg,
    getRack: () => store.getRackById(rackId)!,
    getDeviceLibrary: () => store.device_types,
    getRackDims: () => ({
      rackHeight: RACK_HEIGHT,
      rackWidth: RACK_WIDTH,
      interiorWidth: INTERIOR_WIDTH,
      uHeight: U_PX,
      rackPadding: 0,
      railWidth: RAIL_WIDTH,
    }),
    getFaceFilter: () => "front",
    getSelectedDeviceId: () => null,
    getEventCallbacks: () => ({}),
    setDropPreview: vi.fn(),
    setContainerHoverInfo: vi.fn(),
    onDragFinished: vi.fn(),
    layoutStore: store,
    toastStore: getToastStore(),
  });
}

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
  resetSelectionStore();
});

afterEach(() => {
  hideDragTooltip();
});

describe("selecting a carrier child on the canvas (#3340)", () => {
  it("a tap on a child selects the child, not the carrier", () => {
    const { store, rackId, carrier, child } = setup();
    const onselect = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect });

    tap(childButton("Column 1"));

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(child.id);
  });

  it("a tap on the carrier outside its children still selects the carrier", () => {
    const { store, rackId, carrier } = setup();
    const onselect = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect });

    tap(screen.getByTestId("rack-device-hitbox"));

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(carrier.id);
  });

  it("a right-click on a child selects the carrier and opens the carrier's context menu", async () => {
    const { store, rackId, carrier } = setup();
    const onselect = vi.fn();
    const oncontextmenuopen = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect, oncontextmenuopen });
    const button = childButton("Column 1");

    tap(button, 2);
    await fireEvent.contextMenu(button, { clientX: 0, clientY: 0 });

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(carrier.id);
    expect(oncontextmenuopen).toHaveBeenCalledTimes(1);
    expect(oncontextmenuopen.mock.calls[0]![0].detail).toMatchObject({
      rackId,
      deviceIndex: store
        .getRackById(rackId)!
        .devices.findIndex((d) => d.id === carrier.id),
    });
  });

  it("a keyboard context menu on a child selects the carrier before opening its menu", async () => {
    // No pointer press first: the menu key or Shift+F10 on a focused child.
    const { store, rackId, carrier } = setup();
    const onselect = vi.fn();
    const oncontextmenuopen = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect, oncontextmenuopen });

    await fireEvent.contextMenu(childButton("Column 1"));

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(carrier.id);
    expect(oncontextmenuopen).toHaveBeenCalledTimes(1);
  });

  it("a Ctrl+click context menu on a child leaves the carrier selected after the release", async () => {
    // On macOS the menu opens on the press, before the release that would
    // otherwise complete a tap on the child.
    const { store, rackId, carrier } = setup();
    const onselect = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect });
    const button = childButton("Column 1");

    pointer(button, "pointerdown", 0, 0);
    await fireEvent.contextMenu(button, { ctrlKey: true });
    pointer(button, "pointerup", 0, 0);

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(carrier.id);
  });

  it("a child is its own control, not part of the carrier's button", () => {
    // Content inside a role="button" is presentational, so assistive
    // technology would not expose a child nested in its carrier's button.
    const { store, rackId, carrier } = setup();
    renderCarrier(store, rackId, carrier.id);

    const carrierButton = screen.getByRole("button", { name: /^Carrier/ });
    expect(
      within(carrierButton).queryByRole("button", { name: /Mini Switch/ }),
    ).not.toBeInTheDocument();
    expect(childButton("Column 1")).toBeInTheDocument();
  });

  it("a child takes keyboard focus and Enter selects it, not the carrier", async () => {
    const { store, rackId, carrier, child } = setup();
    const onselect = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect });

    const button = childButton("Column 1");
    button.focus();
    expect(button).toHaveFocus();

    await fireEvent.keyDown(button, { key: "Enter" });

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(child.id);
  });

  it("a selected child is announced as selected", () => {
    const { store, rackId, carrier, child } = setup();
    renderCarrier(store, rackId, carrier.id, { selectedChildId: child.id });

    expect(
      screen.getByRole("button", {
        name: /Mini Switch.* in Column 1 of.*, selected$/,
        pressed: true,
      }),
    ).toBeInTheDocument();
  });
});

describe("dragging a carrier child on the canvas (#3340)", () => {
  it("dropping a child on bare rack moves it into a new carrier, keeping its identity, in one undo step", async () => {
    const { store, rackId, carrier, child } = setup();
    const detach = attachDropListeners(store, rackId);
    renderCarrier(store, rackId, carrier.id);
    const before = snapshotRack(store, rackId);

    await dragTo(childButton("Column 1"), xForColumn(1), yForU(9));

    const devices = store.getRackById(rackId)!.devices;
    const moved = devices.find((d) => d.id === child.id)!;
    const newCarrier = devices.find((d) => d.id === moved.container_id)!;
    expect(newCarrier.position).toBe(toInternalUnits(9));
    // The emptied auto-created carrier goes with the move.
    expect(devices.some((d) => d.id === carrier.id)).toBe(false);

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
    detach();
  });

  it("dropping a child on another carrier's free cell moves it into that cell", async () => {
    const { store, rackId, carrier, child } = setup();
    store.placeDevice(rackId, carrier.device_type, 9);
    const target = store
      .getRackById(rackId)!
      .devices.find((d) => !d.container_id && d.id !== carrier.id)!;
    const detach = attachDropListeners(store, rackId);
    renderCarrier(store, rackId, carrier.id);

    await dragTo(childButton("Column 1"), xForColumn(2), yForU(9));

    const moved = store
      .getRackById(rackId)!
      .devices.find((d) => d.id === child.id)!;
    expect(moved.container_id).toBe(target.id);
    expect(moved.slot_id).toBe("col-2");
    detach();
  });

  it("releasing a child drag over its own cell leaves it where it was", async () => {
    // The carrier has a free second cell, so resolving the release as a drop
    // would move the child there. Only the carrier's box is laid out: the
    // test is on the cell, which can be larger than the child in it.
    const { store, rackId, carrier } = setup();
    const detach = attachDropListeners(store, rackId);
    renderCarrier(store, rackId, carrier.id);
    const before = snapshotRack(store, rackId);

    vi.spyOn(
      screen.getByTestId("rack-device-hitbox"),
      "getBoundingClientRect",
    ).mockReturnValue(
      new DOMRect(RAIL_WIDTH, yForU(5) - U_PX / 2, INTERIOR_WIDTH, U_PX),
    );
    await dragTo(childButton("Column 1"), xForColumn(1), yForU(5));

    expect(snapshotRack(store, rackId)).toEqual(before);
    detach();
  });

  it("resolves the cell under a release the way drop targeting does, whatever the slot order", async () => {
    // Slots listed right to left: the cell test must still pick cells by
    // column index, as drop targeting does, so a release over the free right
    // cell moves the child and one over its own left cell keeps it.
    const store = getLayoutStore();
    const rack = store.addRack("Test Rack", RACK_HEIGHT)!;
    const shelf = store.addDeviceType({
      name: "Reversed Shelf",
      u_height: 1,
      category: "shelf",
      colour: CATEGORY_COLOURS.shelf,
      slots: [
        {
          id: "right",
          name: "Right",
          position: { row: 0, col: 1 },
          width_fraction: 0.5,
          height_units: 1,
        },
        {
          id: "left",
          name: "Left",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
          height_units: 1,
        },
      ],
    });
    const switchType = store.addDeviceType({
      name: "Mini Switch",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
    store.placeDevice(rack.id, shelf.slug, 5);
    const container = store.getRackById(rack.id)!.devices[0]!;
    store.placeInContainer(rack.id, switchType.slug, container.id, "left", 0);
    const childId = store
      .getRackById(rack.id)!
      .devices.find((d) => d.container_id)!.id;
    const detach = attachDropListeners(store, rack.id);
    renderCarrier(store, rack.id, container.id);
    vi.spyOn(
      screen.getByTestId("rack-device-hitbox"),
      "getBoundingClientRect",
    ).mockReturnValue(
      new DOMRect(RAIL_WIDTH, yForU(5) - U_PX / 2, INTERIOR_WIDTH, U_PX),
    );
    const slotOf = () =>
      store.getRackById(rack.id)!.devices.find((d) => d.id === childId)!
        .slot_id;

    await dragTo(childButton("Left"), xForColumn(1), yForU(5));
    expect(slotOf()).toBe("left");

    await dragTo(childButton("Left"), xForColumn(2), yForU(5));
    expect(slotOf()).toBe("right");
    detach();
  });
});
