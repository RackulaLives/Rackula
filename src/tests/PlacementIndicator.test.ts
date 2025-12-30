/**
 * PlacementIndicator Tests
 * Tests for the visual placement mode indicator banner
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import PlacementIndicator from "$lib/components/PlacementIndicator.svelte";
import type { DeviceType } from "$lib/types";

describe("PlacementIndicator", () => {
  const mockDevice: DeviceType = {
    slug: "test-server",
    manufacturer: "Test",
    model: "Server 2U",
    u_height: 2,
    category: "server",
    colour: "#333333",
    is_full_depth: true,
  };

  describe("Visibility", () => {
    it("does not render when isPlacing is false", () => {
      render(PlacementIndicator, {
        props: {
          isPlacing: false,
          device: null,
        },
      });

      expect(screen.queryByText(/tap rack to place/i)).not.toBeInTheDocument();
    });

    it("does not render when device is null", () => {
      render(PlacementIndicator, {
        props: {
          isPlacing: true,
          device: null,
        },
      });

      expect(screen.queryByText(/tap rack to place/i)).not.toBeInTheDocument();
    });

    it("renders when isPlacing is true and device is set", () => {
      render(PlacementIndicator, {
        props: {
          isPlacing: true,
          device: mockDevice,
        },
      });

      expect(screen.getByText(/tap rack to place/i)).toBeInTheDocument();
    });
  });

  describe("Content", () => {
    beforeEach(() => {
      render(PlacementIndicator, {
        props: {
          isPlacing: true,
          device: mockDevice,
        },
      });
    });

    it("shows device model name", () => {
      expect(screen.getByText(/Server 2U/)).toBeInTheDocument();
    });

    it("shows placement instruction", () => {
      expect(screen.getByText(/tap rack to place/i)).toBeInTheDocument();
    });

    it("shows cancel button", () => {
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    it("emits oncancel when cancel button is clicked", async () => {
      const handleCancel = vi.fn();
      render(PlacementIndicator, {
        props: {
          isPlacing: true,
          device: mockDevice,
          oncancel: handleCancel,
        },
      });

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await fireEvent.click(cancelButton);

      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      render(PlacementIndicator, {
        props: {
          isPlacing: true,
          device: mockDevice,
        },
      });
    });

    it("cancel button has accessible name", () => {
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it("has role status for screen reader announcements", () => {
      const banner = screen.getByRole("status");
      expect(banner).toBeInTheDocument();
    });
  });
});
