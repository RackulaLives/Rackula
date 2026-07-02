import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
// Rendered through a thin wrapper that supplies the Tooltip.Provider context
// the verb buttons' tooltips need (App.svelte provides it in the real app).
import VerbBarOverlay from "./helpers/TestVerbBarOverlay.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { organizeRackRow } from "$lib/utils/rack-row";
import { createTestDeviceType } from "./factories";
import type { DeviceFace } from "$lib/types";

/** Row order as slot ids (a rack's id, or a group's id) for order assertions. */
function rowOrder(): string[] {
  const layout = getLayoutStore();
  return organizeRackRow(layout.racks, layout.rack_groups).map((item) =>
    item.kind === "rack" ? item.rack.id : item.group.id,
  );
}

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
  resetCanvasStore();
  resetUIStore();
}

function setupRackWithDevice(face: DeviceFace = "front") {
  const layout = getLayoutStore();
  const rack = layout.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack returned null");

  const dt = createTestDeviceType({
    slug: "test-switch",
    u_height: 1,
    is_full_depth: false,
  });
  layout.addDeviceTypeRaw(dt);

  if (!layout.placeDevice(rack.id, dt.slug, 10, face)) {
    throw new Error("placeDevice failed");
  }
  const placed = layout.getRackById(rack.id)!.devices[0]!;
  return { layout, rackId: rack.id, deviceId: placed.id };
}

// In jsdom there is no layout to measure, so the overlay cannot position
// itself and keeps the bar in a visibility:hidden wrapper. The buttons are
// still in the DOM and dispatchable; query with hidden:true and assert the
// click-to-action wiring, which is what this integration test covers. Pixel
// positioning is verified separately by verb-bar-position.test.ts.
function clickVerb(name: string) {
  return fireEvent.click(screen.getByRole("button", { name, hidden: true }));
}

describe("VerbBarOverlay", () => {
  beforeEach(resetAll);
  afterEach(cleanup);

  describe("device selection", () => {
    it("moves the selected device when the move-up verb is clicked", async () => {
      const { layout, rackId, deviceId } = setupRackWithDevice();
      getSelectionStore().selectDevice(rackId, deviceId);
      render(VerbBarOverlay, { props: { canvasEl: null } });

      const before = layout.getRackById(rackId)!.devices[0]!.position;
      await clickVerb("Move device up");
      const after = layout.getRackById(rackId)!.devices[0]!.position;

      expect(after).toBeGreaterThan(before);
    });

    it("flips the selected device's face when the flip verb is clicked", async () => {
      const { layout, rackId, deviceId } = setupRackWithDevice("front");
      getSelectionStore().selectDevice(rackId, deviceId);
      render(VerbBarOverlay, { props: { canvasEl: null } });

      await clickVerb("Flip face");

      expect(
        layout.getRackById(rackId)!.devices.find((d) => d.id === deviceId)!
          .face,
      ).toBe("rear");
    });
  });

  describe("rack selection", () => {
    it("routes rack verbs to the callbacks with the selected rack id", async () => {
      const { rackId } = setupRackWithDevice();
      getSelectionStore().selectRack(rackId);

      const onrackfocus = vi.fn();
      const onrackexport = vi.fn();
      const ondelete = vi.fn();
      render(VerbBarOverlay, {
        props: { canvasEl: null, onrackfocus, onrackexport, ondelete },
      });

      await clickVerb("Focus");
      expect(onrackfocus).toHaveBeenCalledWith([rackId]);

      await clickVerb("Export");
      expect(onrackexport).toHaveBeenCalledWith([rackId]);

      await clickVerb("Delete selected");
      expect(ondelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("rack reorder", () => {
    it("reorders the row when the move-rack-right verb is clicked", async () => {
      const layout = getLayoutStore();
      const a = layout.addRack("A", 42);
      const b = layout.addRack("B", 42);
      if (!a || !b) throw new Error("addRack returned null");
      getSelectionStore().selectRack(a.id);
      render(VerbBarOverlay, { props: { canvasEl: null } });

      expect(rowOrder()).toEqual([a.id, b.id]);
      await clickVerb("Move rack right");
      expect(rowOrder()).toEqual([b.id, a.id]);
    });

    it("shows no reorder chevrons for a single-rack row", () => {
      const layout = getLayoutStore();
      const solo = layout.addRack("Solo", 42);
      if (!solo) throw new Error("addRack returned null");
      getSelectionStore().selectRack(solo.id);
      render(VerbBarOverlay, { props: { canvasEl: null } });

      expect(
        screen.queryByRole("button", {
          name: "Move rack right",
          hidden: true,
        }),
      ).toBeNull();
    });
  });

  describe("read-only mode", () => {
    it("withholds the reorder chevrons and bay verb from a rack selection", () => {
      const ui = getUIStore();
      ui.setEnableBayedRacks(true);
      ui.setReadOnly(true);
      const layout = getLayoutStore();
      const a = layout.addRack("A", 42);
      const b = layout.addRack("B", 42);
      if (!a || !b) throw new Error("addRack returned null");
      // Two empty racks with baying on: chevrons and the bay verb would show in
      // edit mode, so their absence here proves read-only withholds them.
      getSelectionStore().selectRack(a.id);
      render(VerbBarOverlay, { props: { canvasEl: null } });

      expect(
        screen.queryByRole("button", { name: "Move rack left", hidden: true }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Move rack right", hidden: true }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Bay rack", hidden: true }),
      ).toBeNull();
      // The read-only-safe object verbs still render, so the bar is present.
      expect(
        screen.getByRole("button", { name: "Focus", hidden: true }),
      ).toBeTruthy();
    });
  });
});
