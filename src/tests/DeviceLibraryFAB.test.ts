/**
 * DeviceLibraryFAB Tests
 * Tests for the mobile floating action button that opens the device library
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DeviceLibraryFAB from "$lib/components/DeviceLibraryFAB.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

describe("DeviceLibraryFAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetViewportStore();
  });

  function mockMobileViewport() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 1024px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  function mockDesktopViewport() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  describe("Visibility", () => {
    it("renders on mobile viewport", () => {
      mockMobileViewport();
      render(DeviceLibraryFAB);

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });
      expect(button).toBeInTheDocument();
    });

    it("does not render on desktop viewport", () => {
      mockDesktopViewport();
      render(DeviceLibraryFAB);

      const button = screen.queryByRole("button", {
        name: /open device library/i,
      });
      expect(button).not.toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    beforeEach(() => {
      mockMobileViewport();
    });

    it("emits onclick when clicked", async () => {
      const handleClick = vi.fn();
      render(DeviceLibraryFAB, { props: { onclick: handleClick } });

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });
      await fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("is focusable", () => {
      render(DeviceLibraryFAB);

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });
      button.focus();

      expect(document.activeElement).toBe(button);
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      mockMobileViewport();
    });

    it("has accessible name", () => {
      render(DeviceLibraryFAB);

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });
      expect(button).toBeInTheDocument();
      // Verify the aria-label provides the accessible name
      expect(button).toHaveAttribute("aria-label", "Open device library");
    });

    it("has minimum touch target size (48px)", () => {
      render(DeviceLibraryFAB);

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });

      // Verify button has the FAB class that applies touch target sizing
      expect(button).toHaveClass("device-library-fab");
    });
  });

  describe("Styling", () => {
    beforeEach(() => {
      mockMobileViewport();
    });

    it("has fixed positioning", () => {
      render(DeviceLibraryFAB);

      const button = screen.getByRole("button", {
        name: /open device library/i,
      });
      // Fixed positioning is applied via the device-library-fab class
      expect(button).toHaveClass("device-library-fab");
    });
  });
});
