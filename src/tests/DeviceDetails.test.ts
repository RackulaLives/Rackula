/**
 * DeviceDetails Component Tests
 * Tests for device details display and action buttons
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DeviceDetails from "$lib/components/DeviceDetails.svelte";
import type { DeviceType, PlacedDevice } from "$lib/types";
import type { SelectionVerbItem } from "$lib/actions/verb-bars";
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
    // Verb items as the registry projection would produce them for a
    // selected device. Labels match the registry definitions.
    const allVerbs: SelectionVerbItem[] = [
      { id: "move-device-up", label: "Move device up", disabled: false },
      { id: "move-device-down", label: "Move device down", disabled: false },
      { id: "move-device-slot", label: "Move to next cell", disabled: true },
      { id: "flip-device-face", label: "Flip face", disabled: false },
      {
        id: "duplicate-selection",
        label: "Duplicate selection",
        disabled: false,
      },
      { id: "delete-selection", label: "Delete selected", disabled: false },
    ];

    it("does not show action buttons by default", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
        },
      });
      expect(
        screen.queryByRole("button", { name: /delete selected/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /move device up/i }),
      ).not.toBeInTheDocument();
    });

    it("does not show action buttons when showActions is true but no verbs are supplied", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
        },
      });
      expect(
        screen.queryByRole("button", { name: /delete selected/i }),
      ).not.toBeInTheDocument();
    });

    it("shows registry-projected action buttons when verbs are supplied", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          verbs: allVerbs,
        },
      });
      expect(
        screen.getByRole("button", { name: /move device up/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /move device down/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /flip face/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /duplicate selection/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete selected/i }),
      ).toBeInTheDocument();
    });

    it("dispatches move-device-up via onaction when Move Up is clicked", async () => {
      const onaction = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          verbs: allVerbs,
          onaction,
        },
      });

      await fireEvent.click(
        screen.getByRole("button", { name: /move device up/i }),
      );
      expect(onaction).toHaveBeenCalledWith("move-device-up");
    });

    it("dispatches delete-selection via onaction when Delete is clicked", async () => {
      const onaction = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          verbs: allVerbs,
          onaction,
        },
      });

      await fireEvent.click(
        screen.getByRole("button", { name: /delete selected/i }),
      );
      expect(onaction).toHaveBeenCalledWith("delete-selection");
    });

    it("renders disabled state from the registry projection", () => {
      const verbsWithDisabledUp: SelectionVerbItem[] = allVerbs.map((v) =>
        v.id === "move-device-up" ? { ...v, disabled: true } : v,
      );
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          verbs: verbsWithDisabledUp,
        },
      });

      expect(
        screen.getByRole("button", { name: /move device up/i }),
      ).toBeDisabled();
    });

    it("enables move buttons when the projection says they are enabled", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          verbs: allVerbs,
        },
      });

      expect(
        screen.getByRole("button", { name: /move device up/i }),
      ).not.toBeDisabled();
      expect(
        screen.getByRole("button", { name: /move device down/i }),
      ).not.toBeDisabled();
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
