import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import VerbBarOverlay from "$lib/components/VerbBarOverlay.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { createTestDeviceType } from "./factories";
import type { DeviceFace } from "$lib/types";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
  resetCanvasStore();
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
});
