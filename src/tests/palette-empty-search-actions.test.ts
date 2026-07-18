/**
 * The empty device-search-results state used to dead-end: "No devices match
 * your search" with no next step, even though "Add custom device" sits right
 * below in the footer (#3007/R28a). This asserts the two actions the empty
 * state now offers: "Clear search" resets the query so the full list
 * reappears, and "Create custom device named <query>" opens the
 * create-custom-device flow pre-filled with the search text that returned no
 * matches.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("device palette empty search state actions (#3007/R28a)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
    resetToastStore();
  });

  async function searchForNoMatches() {
    const input = screen.getByTestId("search-devices");
    await fireEvent.input(input, {
      target: { value: "zzz-no-such-device" },
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /clear search/i }),
      ).toBeInTheDocument();
    });
    return input;
  }

  it("Clear search resets the query and the full device list returns", async () => {
    render(TestDevicePalette);
    const input = await searchForNoMatches();

    await fireEvent.click(
      screen.getByRole("button", { name: /clear search/i }),
    );

    expect((input as HTMLInputElement).value).toBe("");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /clear search/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("Create custom device named <query> opens the create flow pre-filled with the query", async () => {
    let receivedName: string | undefined;
    render(TestDevicePalette, {
      props: { oncreatedevice: (name?: string) => (receivedName = name) },
    });
    await searchForNoMatches();

    await fireEvent.click(
      screen.getByRole("button", {
        name: /create custom device named "zzz-no-such-device"/i,
      }),
    );

    expect(receivedName).toBe("zzz-no-such-device");
  });
});
