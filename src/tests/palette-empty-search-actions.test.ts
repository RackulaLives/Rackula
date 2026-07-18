/**
 * The empty device-search-results state used to dead-end: "No devices match
 * your search" with no next step, even though "Add custom device" sits right
 * below in the footer (#3007/R28a). This asserts the two actions the empty
 * state now offers: "Clear search" resets the query so the full list
 * reappears, and "Create custom device named <query>" opens the
 * create-custom-device flow pre-filled with the search text that returned no
 * matches.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
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
    // The empty-state actions disappearing isn't proof the list came back:
    // assert actual device rows are present, not just an absent empty state.
    await waitFor(() => {
      expect(
        screen.getAllByTestId("device-palette-item").length,
      ).toBeGreaterThan(0);
    });
  });

  it("Clear search wins even when a debounced search update was already pending", async () => {
    vi.useFakeTimers();
    try {
      render(TestDevicePalette);
      const input = screen.getByTestId("search-devices");

      // Settle the first debounced update so the empty state (and its Clear
      // search action) actually renders.
      await fireEvent.input(input, {
        target: { value: "zzz-no-such-device" },
      });
      await vi.advanceTimersByTimeAsync(150);
      await tick();
      const clearButton = screen.getByRole("button", {
        name: /clear search/i,
      });

      // A further edit schedules a new debounced update that has NOT fired
      // yet: this is the stale value a race would restore.
      await fireEvent.input(input, {
        target: { value: "zzz-no-such-device-still-no-match" },
      });

      // Click Clear inside the still-pending 150ms window.
      await fireEvent.click(clearButton);
      expect((input as HTMLInputElement).value).toBe("");

      // Let the stale pending update's timer elapse. If it were not
      // cancelled, it would reassign the query back to the stale text and
      // the empty state (and its Clear search button) would reappear.
      await vi.advanceTimersByTimeAsync(150);
      await tick();

      expect(
        screen.queryByRole("button", { name: /clear search/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByTestId("device-palette-item").length,
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
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
