import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { handleDelete, handleConfirmDelete } from "$lib/utils/dialog-actions";
import * as appActions from "$lib/utils/app-actions";
import {
  moveSelectedDeviceUp,
  moveSelectedDeviceDown,
  duplicateSelection,
  flipSelectedDeviceFace,
} from "$lib/actions/selection-actions";
import { createTestDeviceType, createTestDeviceTypeInput } from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { DeviceFace } from "$lib/types";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
  dialogStore.close();
}

/**
 * Set up a rack with a single half-depth device placed on the given face.
 * Returns the layout store, rack id, device id, and initial position.
 */
function setupHalfDepthDevice(face: DeviceFace = "front") {
  const layout = getLayoutStore();
  const rack = layout.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack returned null");

  const dt = createTestDeviceType({
    slug: "half-depth-switch",
    u_height: 1,
    is_full_depth: false,
  });
  layout.addDeviceTypeRaw(dt);

  const ok = layout.placeDevice(rack.id, dt.slug, 10, face);
  if (!ok) throw new Error("placeDevice failed");

  const placed = layout.getRackById(rack.id)!.devices[0]!;
  return { layout, rackId: rack.id, deviceId: placed.id };
}

describe("selection-actions", () => {
  beforeEach(resetAll);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // moveSelectedDeviceUp
  // ---------------------------------------------------------------------------

  describe("moveSelectedDeviceUp", () => {
    it("moves selected device to a higher U position", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice();
      getSelectionStore().selectDevice(rackId, deviceId);

      const posBefore = layout.getRackById(rackId)!.devices[0]!.position;
      moveSelectedDeviceUp();
      const posAfter = layout.getRackById(rackId)!.devices[0]!.position;

      expect(posAfter).toBeGreaterThan(posBefore);
    });

    it("is a no-op when no device is selected", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      const posBefore = layout.getRackById(rackId)!.devices[0]!.position;

      moveSelectedDeviceUp();

      expect(layout.getRackById(rackId)!.devices[0]!.position).toBe(posBefore);
    });

    it("is a no-op for a container child (carrier guard)", () => {
      const layout = getLayoutStore();
      const rack = layout.addRack("Test Rack", 42);
      if (!rack) throw new Error("addRack returned null");

      const containerType = layout.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Shelf",
          u_height: 2,
          category: "server",
          colour: "#8B4513",
          slots: [
            {
              id: "slot-left",
              position: { row: 0, col: 0 },
              width_fraction: 0.5,
            },
          ],
        }),
      );
      const childType = layout.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
          slot_width: 1,
          is_full_depth: false,
        }),
      );

      layout.placeDevice(rack.id, containerType.slug, 10);
      const container = layout.activeRack!.devices[0]!;

      layout.placeInContainer(
        rack.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );
      const child = layout.activeRack!.devices[1]!;

      getSelectionStore().selectDevice(rack.id, child.id);

      const posBefore = child.position;
      moveSelectedDeviceUp();
      const posAfter = layout
        .getRackById(rack.id)!
        .devices.find((d) => d.id === child.id)!.position;

      expect(posAfter).toBe(posBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // moveSelectedDeviceDown
  // ---------------------------------------------------------------------------

  describe("moveSelectedDeviceDown", () => {
    it("moves selected device to a lower U position", () => {
      const layout = getLayoutStore();
      const rack = layout.addRack("Test Rack", 42);
      if (!rack) throw new Error("addRack returned null");

      const dt = createTestDeviceType({
        slug: "switch-down",
        u_height: 1,
        is_full_depth: false,
      });
      layout.addDeviceTypeRaw(dt);

      layout.placeDevice(rack.id, dt.slug, 20);
      const placed = layout.getRackById(rack.id)!.devices[0]!;

      getSelectionStore().selectDevice(rack.id, placed.id);

      const posBefore = placed.position;
      moveSelectedDeviceDown();
      const posAfter = layout.getRackById(rack.id)!.devices[0]!.position;

      expect(posAfter).toBeLessThan(posBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // Shared handler: collision and bounds (desktop + mobile + keyboard all
  // route through moveSelectedDeviceUp/Down from selection-actions, so these
  // tests cover the shared handler that EditPanelPosition now delegates to).
  // ---------------------------------------------------------------------------

  describe("shared move handler - collision rejection", () => {
    it("does not move up when the next position is occupied on the same face", () => {
      const layout = getLayoutStore();
      const rack = layout.addRack("Test Rack", 42);
      if (!rack) throw new Error("addRack returned null");

      const dt = createTestDeviceType({
        slug: "blocker-server",
        u_height: 1,
        is_full_depth: true,
      });
      layout.addDeviceTypeRaw(dt);

      // Place device at U10 and a full-rack-of-blockers above it: U11-U42
      layout.placeDevice(rack.id, dt.slug, 10, "front");
      for (let u = 11; u <= 42; u++) {
        layout.placeDevice(rack.id, dt.slug, u, "front");
      }
      // devices[0] is at U10 (all others are the blockers)
      const deviceUnderTest = layout.getRackById(rack.id)!.devices[0]!;
      const posBefore = deviceUnderTest.position;

      getSelectionStore().selectDevice(rack.id, deviceUnderTest.id);
      moveSelectedDeviceUp();

      const posAfter = layout
        .getRackById(rack.id)!
        .devices.find((d) => d.id === deviceUnderTest.id)!.position;
      expect(posAfter).toBe(posBefore);
    });

    it("does not move down when at the bottom boundary (U1)", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice();
      const rack = layout.getRackById(rackId)!;
      // Place the device at U1 explicitly
      const deviceIndex = rack.devices.findIndex((d) => d.id === deviceId);
      layout.moveDevice(rackId, deviceIndex, 1);
      const posBefore = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!.position;

      getSelectionStore().selectDevice(rackId, deviceId);
      moveSelectedDeviceDown();

      const posAfter = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!.position;
      expect(posAfter).toBe(posBefore);
    });

    it("does not move up when at the top boundary", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice();
      const rack = layout.getRackById(rackId)!;
      // Move device to rack height (top U)
      const deviceIndex = rack.devices.findIndex((d) => d.id === deviceId);
      layout.moveDevice(rackId, deviceIndex, rack.height);
      const posBefore = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!.position;

      getSelectionStore().selectDevice(rackId, deviceId);
      moveSelectedDeviceUp();

      const posAfter = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!.position;
      expect(posAfter).toBe(posBefore);
    });

    it("leapfrogs over a blocking device to the next free slot", () => {
      const layout = getLayoutStore();
      const rack = layout.addRack("Test Rack", 42);
      if (!rack) throw new Error("addRack returned null");

      const dt = createTestDeviceType({
        slug: "leap-device",
        u_height: 1,
        is_full_depth: false,
      });
      layout.addDeviceTypeRaw(dt);

      // Place target at U10, blocker at U11 (same face), U12 is free
      layout.placeDevice(rack.id, dt.slug, 10, "front");
      layout.placeDevice(rack.id, dt.slug, 11, "front");
      const target = layout.getRackById(rack.id)!.devices[0]!;

      getSelectionStore().selectDevice(rack.id, target.id);
      moveSelectedDeviceUp();

      // Should leapfrog to U12
      const posAfter = layout
        .getRackById(rack.id)!
        .devices.find((d) => d.id === target.id)!.position;
      expect(posAfter).toBe(toInternalUnits(12));
    });
  });

  // ---------------------------------------------------------------------------
  // duplicateSelection
  // ---------------------------------------------------------------------------

  describe("duplicateSelection", () => {
    it("duplicates selected device and selects the new copy", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice();
      const selection = getSelectionStore();
      selection.selectDevice(rackId, deviceId);

      const countBefore = layout.getRackById(rackId)!.devices.length;
      duplicateSelection();
      const countAfter = layout.getRackById(rackId)!.devices.length;

      expect(countAfter).toBe(countBefore + 1);
      expect(selection.selectedDeviceId).not.toBe(deviceId);
      expect(selection.selectedDeviceId).not.toBeNull();
    });

    it("shows a success toast after duplicating a device", () => {
      const { rackId, deviceId } = setupHalfDepthDevice();
      getSelectionStore().selectDevice(rackId, deviceId);

      duplicateSelection();

      expect(getToastStore().toasts.some((t) => t.type === "success")).toBe(
        true,
      );
    });

    it("duplicates selected rack when a rack is selected", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      getSelectionStore().selectRack(rackId);

      const rackCountBefore = layout.racks.length;
      duplicateSelection();
      const rackCountAfter = layout.racks.length;

      expect(rackCountAfter).toBe(rackCountBefore + 1);
    });

    it("is a no-op when nothing is selected", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      const rackCountBefore = layout.racks.length;
      const deviceCountBefore = layout.getRackById(rackId)!.devices.length;

      duplicateSelection();

      expect(layout.racks.length).toBe(rackCountBefore);
      expect(layout.getRackById(rackId)!.devices.length).toBe(
        deviceCountBefore,
      );
    });

    // #3003 (J4-F3): duplicateRack activates the copy but previously left the
    // selection store pointed at the source, so the sidebar (active) and the
    // canvas outline / edit panel / delete target (selected) disagreed about
    // which rack was "current". Both must point at the copy.
    it("keeps active and selected in sync on the copy after duplicating a rack", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      const layoutStore = layout;
      const selection = getSelectionStore();
      selection.selectRack(rackId);

      duplicateSelection();

      const newRack = layoutStore.racks.find((r) => r.id !== rackId);
      expect(newRack).toBeDefined();
      expect(layoutStore.activeRackId).toBe(newRack!.id);
      expect(selection.selectedRackId).toBe(newRack!.id);
    });

    // #3003 (J4-F3): with active and selected desynced, pressing Delete right
    // after a duplicate destroyed the original rack instead of the copy the
    // user just made (delete reads selectedRackId). This drives the delete
    // affordance end-to-end (handleDelete -> confirm) to prove the copy is
    // the one removed.
    it("targets the copy, not the source, when Delete is pressed right after duplicating", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      const layoutStore = layout;
      const selection = getSelectionStore();
      selection.selectRack(rackId);

      duplicateSelection();
      const newRack = layoutStore.racks.find((r) => r.id !== rackId)!;

      handleDelete();
      expect(dialogStore.deleteTarget?.rackId).toBe(newRack.id);
      handleConfirmDelete();

      expect(layoutStore.getRackById(newRack.id)).toBeUndefined();
      expect(layoutStore.getRackById(rackId)).toBeDefined();
    });

    // Fix round 1 (#3003): the post-duplicate selectRack() call landed
    // outside the command/history system, so Ctrl+D then Ctrl+Z restored
    // activeRackId to the source (via the command's previousActiveRackId,
    // #2976) but left selectedRackId dangling on the now-deleted copy's id.
    // Undo must leave both pointing at the source; redo must put both back
    // on the copy.
    it("keeps active and selected coherent through duplicate undo and redo", () => {
      const { layout, rackId } = setupHalfDepthDevice();
      const layoutStore = layout;
      const selection = getSelectionStore();
      selection.selectRack(rackId);

      duplicateSelection();
      const newRack = layoutStore.racks.find((r) => r.id !== rackId);
      expect(newRack).toBeDefined();
      expect(layoutStore.activeRackId).toBe(newRack!.id);
      expect(selection.selectedRackId).toBe(newRack!.id);

      layoutStore.undo();
      expect(layoutStore.activeRackId).toBe(rackId);
      expect(selection.selectedRackId).toBe(rackId);
      expect(layoutStore.getRackById(newRack!.id)).toBeUndefined();

      layoutStore.redo();
      expect(layoutStore.activeRackId).toBe(newRack!.id);
      expect(selection.selectedRackId).toBe(newRack!.id);
    });

    // #3003 (J4-F5): the copy was appended beyond the viewport edge with no
    // re-fit, silently becoming active while invisible. Mirrors handleNewRack,
    // which fits the canvas after creating and selecting a rack.
    it("fits the copy into view after duplicating a rack", () => {
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
      const fitAllSpy = vi
        .spyOn(appActions, "handleFitAll")
        .mockReturnValue(undefined);
      const { rackId } = setupHalfDepthDevice();
      getSelectionStore().selectRack(rackId);

      duplicateSelection();

      expect(fitAllSpy).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  // ---------------------------------------------------------------------------
  // flipSelectedDeviceFace
  // ---------------------------------------------------------------------------

  describe("flipSelectedDeviceFace", () => {
    it("flips front to rear", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice("front");
      getSelectionStore().selectDevice(rackId, deviceId);

      flipSelectedDeviceFace();

      const updated = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!;
      expect(updated.face).toBe("rear");
    });

    it("flips rear to front", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice("rear");
      getSelectionStore().selectDevice(rackId, deviceId);

      flipSelectedDeviceFace();

      const updated = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!;
      expect(updated.face).toBe("front");
    });

    it("flips a both-face device to rear", () => {
      const { layout, rackId, deviceId } = setupHalfDepthDevice("both");
      getSelectionStore().selectDevice(rackId, deviceId);

      flipSelectedDeviceFace();

      const updated = layout
        .getRackById(rackId)!
        .devices.find((d) => d.id === deviceId)!;
      expect(updated.face).toBe("rear");
    });

    it("is a no-op when no device is selected", () => {
      const { layout, rackId } = setupHalfDepthDevice("front");
      const faceBefore = layout.getRackById(rackId)!.devices[0]!.face;

      flipSelectedDeviceFace();

      expect(layout.getRackById(rackId)!.devices[0]!.face).toBe(faceBefore);
    });

    it("shows a success toast after flipping", () => {
      const { rackId, deviceId } = setupHalfDepthDevice("front");
      getSelectionStore().selectDevice(rackId, deviceId);

      flipSelectedDeviceFace();

      expect(getToastStore().toasts.some((t) => t.type === "success")).toBe(
        true,
      );
    });
  });
});
