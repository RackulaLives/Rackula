/**
 * Tests for Issue #3411: the crop dialog's frame must stay on the device the
 * file was chosen for. A workspace jump (Alt+1-9) while the dialog is open
 * changes the selected device, but the confirmed crop is written to the
 * original device, so the frame must not reframe for the new selection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import EditPanelImage from "$lib/components/EditPanelImage.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import {
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";
import type { SelectedDeviceInfo } from "$lib/types";

function deviceInfo(uHeight: number, rackWidth: number): SelectedDeviceInfo {
  const device = createTestDeviceType({
    slug: `device-${uHeight}u`,
    u_height: uHeight,
  });
  const placedDevice = createTestDevice({ device_type: device.slug });
  const rack = createTestRack({ width: rackWidth, devices: [placedDevice] });
  return { device, placedDevice, rack, deviceIndex: 0 };
}

describe("EditPanelImage crop frame + selection switch (#3411)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetImageStore();
  });

  it("keeps the crop frame on the chosen device when the selection changes", async () => {
    const { rerender } = render(EditPanelImage, {
      props: { selectedDeviceInfo: deviceInfo(1, 19) },
    });

    const input = screen.getByLabelText(/choose front image override/i);
    const file = new File(["x"], "front.png", { type: "image/png" });
    await fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText(/frame matches a 1U device in a 19 inch rack/i),
    ).toBeInTheDocument();

    // Workspace jump while the dialog is open: a different device is selected.
    await rerender({ selectedDeviceInfo: deviceInfo(4, 10) });

    expect(
      screen.getByText(/frame matches a 1U device in a 19 inch rack/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/frame matches a 4U device/i),
    ).not.toBeInTheDocument();
  });
});
