/**
 * Tests for Issue #2438: promote create-custom-device to a labelled bottom
 * button.
 *
 * The create-custom-device action moved from a cramped "+" icon in the search
 * row to a full-width "Add custom device" button pinned at the panel bottom.
 * The behavioural contract is unchanged: activating the button invokes the
 * existing create-custom-device flow (the oncreatedevice callback the parent
 * wires to its dialog handler).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("DevicePalette add-custom-device button (#2438)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
    resetToastStore();
  });

  it("activating the Add custom device button opens the create-custom-device flow", async () => {
    const oncreatedevice = vi.fn();
    render(TestDevicePalette, { props: { oncreatedevice } });

    const button = screen.getByRole("button", {
      name: /add custom device/i,
    });
    await fireEvent.click(button);

    expect(oncreatedevice).toHaveBeenCalledTimes(1);
  });
});
