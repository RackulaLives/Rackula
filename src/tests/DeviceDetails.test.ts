/**
 * DeviceDetails Component Tests
 * Tests for device details display and action buttons
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DeviceDetails from "$lib/components/DeviceDetails.svelte";
import type { DeviceType, PlacedDevice } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";

describe("DeviceDetails", () => {
  // Helper to create test device type
  function createTestDeviceType(
    overrides: Partial<DeviceType> = {},
  ): DeviceType {
    return {
      slug: "test-server",
      u_height: 2,
      model: "Test Server",
      colour: "#4A90D9",
      category: "server",
      ...overrides,
    };
  }

  // Helper to create test placed device
  // Position is expected in human U and converted to internal units
  function createTestPlacedDevice(
    overrides: Partial<PlacedDevice> = {},
  ): PlacedDevice {
    const humanPosition = overrides.position ?? 5;
    return {
      device_type: "test-server",
      position: toInternalUnits(humanPosition),
      face: "front",
      ...overrides,
      // Ensure position override is converted
      ...(overrides.position !== undefined
        ? { position: toInternalUnits(overrides.position) }
        : {}),
    };
  }

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
        },
      });
      expect(screen.getByText("Test Server")).toBeTruthy();
    });

    it("displays device model name", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType({ model: "Dell PowerEdge R740" }),
        },
      });
      expect(screen.getByText("Dell PowerEdge R740")).toBeTruthy();
    });

    it("displays custom device name when set", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ name: "My Custom Server" }),
          deviceType: createTestDeviceType({ model: "Dell PowerEdge R740" }),
        },
      });
      expect(screen.getByText("My Custom Server")).toBeTruthy();
    });

    it("displays device height", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType({ u_height: 4 }),
        },
      });
      expect(screen.getByText("4U")).toBeTruthy();
    });

    it("displays device position", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ position: 10 }),
          deviceType: createTestDeviceType({ u_height: 2 }),
        },
      });
      expect(screen.getByText("U10-U11, Front")).toBeTruthy();
    });

    it("displays single U position for 1U device", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ position: 5 }),
          deviceType: createTestDeviceType({ u_height: 1 }),
        },
      });
      expect(screen.getByText("U5, Front")).toBeTruthy();
    });

    it("displays both faces label correctly", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ face: "both" }),
          deviceType: createTestDeviceType(),
        },
      });
      expect(screen.getByText(/Both Faces/)).toBeTruthy();
    });
  });

  describe("Action Buttons", () => {
    it("does not show action buttons by default", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
        },
      });
      expect(
        screen.queryByRole("button", { name: /remove/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /move up/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /move down/i }),
      ).not.toBeInTheDocument();
    });

    it("shows action buttons when showActions is true", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
        },
      });
      expect(
        screen.getByRole("button", { name: /remove device from rack/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /move device up/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /move device down/i }),
      ).toBeInTheDocument();
    });

    it("calls onremove when Remove button is clicked", async () => {
      const handleRemove = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          onremove: handleRemove,
        },
      });

      const removeButton = screen.getByRole("button", {
        name: /remove device from rack/i,
      });
      await fireEvent.click(removeButton);

      expect(handleRemove).toHaveBeenCalledTimes(1);
    });

    it("calls onmoveup when Move Up button is clicked", async () => {
      const handleMoveUp = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          onmoveup: handleMoveUp,
        },
      });

      const moveUpButton = screen.getByRole("button", {
        name: /move device up/i,
      });
      await fireEvent.click(moveUpButton);

      expect(handleMoveUp).toHaveBeenCalledTimes(1);
    });

    it("calls onmovedown when Move Down button is clicked", async () => {
      const handleMoveDown = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          onmovedown: handleMoveDown,
        },
      });

      const moveDownButton = screen.getByRole("button", {
        name: /move device down/i,
      });
      await fireEvent.click(moveDownButton);

      expect(handleMoveDown).toHaveBeenCalledTimes(1);
    });

    it("disables Move Up button when canMoveUp is false", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          canMoveUp: false,
        },
      });

      const moveUpButton = screen.getByRole("button", {
        name: /move device up/i,
      });
      expect(moveUpButton).toBeDisabled();
    });

    it("disables Move Down button when canMoveDown is false", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          canMoveDown: false,
        },
      });

      const moveDownButton = screen.getByRole("button", {
        name: /move device down/i,
      });
      expect(moveDownButton).toBeDisabled();
    });

    it("enables both move buttons by default when showActions is true", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
        },
      });

      const moveUpButton = screen.getByRole("button", {
        name: /move device up/i,
      });
      const moveDownButton = screen.getByRole("button", {
        name: /move device down/i,
      });

      expect(moveUpButton).not.toBeDisabled();
      expect(moveDownButton).not.toBeDisabled();
    });
  });

  describe("Optional Info", () => {
    it("displays manufacturer when provided", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType({ manufacturer: "Dell" }),
        },
      });
      expect(screen.getByText("Dell")).toBeTruthy();
    });

    it("displays part number when provided", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType({ part_number: "R740-XD" }),
        },
      });
      expect(screen.getByText("R740-XD")).toBeTruthy();
    });

    it("displays notes when provided", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ notes: "Primary database server" }),
          deviceType: createTestDeviceType(),
        },
      });
      expect(screen.getByText("Primary database server")).toBeTruthy();
    });
  });
});
