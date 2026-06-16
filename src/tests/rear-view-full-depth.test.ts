/**
 * Issue #2337: Rear rack view shows nothing for full-depth devices.
 *
 * A full-depth device physically occupies both the front and the rear of the
 * rack, so it must render under both the front and the rear face filters.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { createTestDeviceTypeInput } from "./factories";

describe("Rear view visibility for full-depth devices (#2337)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
  });

  function placeFullDepthDevice() {
    const store = getLayoutStore();
    const rack = store.addRack("Test Rack", 42);
    // Full-depth (is_full_depth omitted -> defaults to full-depth) full-width,
    // whole-U device. A short model so the rendered label is not truncated.
    const deviceType = store.addDeviceType(
      createTestDeviceTypeInput({
        name: "PDU",
        u_height: 1,
        category: "power",
        colour: "#4A90D9",
      }),
    );
    store.placeDevice(rack!.id, deviceType.slug, 5);
    return { store, rackId: rack!.id };
  }

  it("renders a full-depth device under the front face filter", () => {
    const { store } = placeFullDepthDevice();
    render(Rack, {
      props: {
        rack: store.rack,
        deviceLibrary: store.layout.device_types,
        selected: false,
        faceFilter: "front",
      },
    });
    expect(screen.getByText("PDU")).toBeInTheDocument();
  });

  it("renders a full-depth device under the rear face filter", () => {
    const { store } = placeFullDepthDevice();
    render(Rack, {
      props: {
        rack: store.rack,
        deviceLibrary: store.layout.device_types,
        selected: false,
        faceFilter: "rear",
      },
    });
    expect(screen.getByText("PDU")).toBeInTheDocument();
  });
});
