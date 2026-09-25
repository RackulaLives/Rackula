/**
 * The crop dialog leaves app shortcuts such as Delete and Ctrl+Z live while a
 * dialog button has focus, so the layout can change under an open dialog. A
 * confirmed crop must land on the device it was chosen for, or nowhere.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import EditPanelImage from "$lib/components/EditPanelImage.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import type { SelectedDeviceInfo } from "$lib/types";

vi.mock("$lib/components/ImageCropDialog.svelte", async () => ({
  default: (await import("./helpers/StubImageCropDialog.svelte")).default,
}));

function setup() {
  const layoutStore = getLayoutStore();
  const rackId = layoutStore.addRack("Test Rack", 42)!.id;
  const deviceType = layoutStore.addDeviceType({
    name: "Server Type",
    u_height: 1,
    category: "server",
    colour: "#4A90D9",
  });
  layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
  layoutStore.placeDevice(rackId, deviceType.slug, 5, "front");
  const devices = () => layoutStore.getRackById(rackId)!.devices;
  const infoFor = (deviceIndex: number): SelectedDeviceInfo => ({
    device: deviceType,
    placedDevice: devices()[deviceIndex]!,
    rack: layoutStore.getRackById(rackId)!,
    deviceIndex,
  });
  return { layoutStore, rackId, devices, infoFor };
}

async function chooseFrontFile() {
  const input = screen.getByLabelText(/choose front image override/i);
  const file = new File(["x"], "front.png", { type: "image/png" });
  await fireEvent.change(input, { target: { files: [file] } });
}

describe("EditPanelImage crop target after layout changes", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetImageStore();
  });

  it("saves the crop to the chosen device after an earlier device is removed", async () => {
    const { layoutStore, rackId, devices, infoFor } = setup();
    const target = devices()[1]!;
    render(EditPanelImage, { props: { selectedDeviceInfo: infoFor(1) } });

    await chooseFrontFile();
    layoutStore.removeDeviceFromRack(rackId, 0);
    await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const saved = devices().find((d) => d.id === target.id);
      expect(saved?.front_image).toBeDefined();
    });
  });

  it("does not write the crop to another device when the chosen device is removed", async () => {
    const { layoutStore, rackId, devices, infoFor } = setup();
    const other = devices()[1]!;
    render(EditPanelImage, { props: { selectedDeviceInfo: infoFor(0) } });

    await chooseFrontFile();
    layoutStore.removeDeviceFromRack(rackId, 0);
    await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const remaining = devices().find((d) => d.id === other.id);
    expect(remaining?.front_image).toBeUndefined();
  });
});
