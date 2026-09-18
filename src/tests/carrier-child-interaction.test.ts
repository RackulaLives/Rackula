/**
 * Carrier children on the canvas (#3340).
 *
 * A device inside a carrier could not be selected, focused or dragged: its
 * <g> had role="img" and no handlers, and only the carrier's hitbox started a
 * press. These tests drive a rendered child the way a user does and check the
 * store outcome.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
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
// point maps straight onto rack pixels.
const yForU = (u: number) => (RACK_HEIGHT - u) * U_PX + U_PX / 2;
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

  it("a right-click on a child selects the carrier, whose context menu it opens", () => {
    const { store, rackId, carrier } = setup();
    const onselect = vi.fn();
    renderCarrier(store, rackId, carrier.id, { onselect });

    tap(childButton("Column 1"), 2);

    expect(onselect).toHaveBeenCalledTimes(1);
    expect(onselect.mock.calls[0]![0].detail.deviceId).toBe(carrier.id);
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
});
