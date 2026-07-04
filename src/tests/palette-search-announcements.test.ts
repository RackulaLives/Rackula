/**
 * Palette search must announce its outcome to screen readers: a status
 * region reports the match count after the debounce settles, reports
 * "No devices match" for a miss, and stays silent while search is empty.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("palette search result announcements", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
    resetToastStore();
  });

  it("stays silent while search is empty", () => {
    render(TestDevicePalette);
    expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
      /^$/,
    );
  });

  it("announces no matches for a miss", async () => {
    render(TestDevicePalette);
    await fireEvent.input(screen.getByTestId("search-devices"), {
      target: { value: "zzz-no-such-device" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
        "No devices match",
      );
    });
  });

  it("announces a match count for a hit", async () => {
    render(TestDevicePalette);
    await fireEvent.input(screen.getByTestId("search-devices"), {
      target: { value: "shelf" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
        /\d+ devices? found/,
      );
    });
  });
});
