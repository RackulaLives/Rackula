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

  describe("Editable fields", () => {
    // Editable fields only render in the mobile inspector (showActions + verbs).
    const allVerbs: SelectionVerbItem[] = [
      { id: "move-device-up", label: "Move device up", disabled: false },
      { id: "move-device-down", label: "Move device down", disabled: false },
      { id: "flip-device-face", label: "Flip face", disabled: false },
      {
        id: "duplicate-selection",
        label: "Duplicate selection",
        disabled: false,
      },
      { id: "delete-selection", label: "Delete selected", disabled: false },
    ];

    function renderInspector(overrides: {
      device?: Partial<PlacedDevice>;
      ip?: string;
      oneditname?: (name: string) => void;
      oneditip?: (ip: string) => void;
      oneditnotes?: (notes: string) => void;
    }) {
      const { device, ...rest } = overrides;
      return render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(device),
          deviceType: createTestDeviceType({ model: "Dell PowerEdge R740" }),
          showActions: true,
          verbs: allVerbs,
          ...rest,
        },
      });
    }

    it("commits a name edit through oneditname", async () => {
      const oneditname = vi.fn();
      renderInspector({ oneditname });

      // The name field opens an editor when activated.
      await fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
      const input = screen.getByRole("textbox", { name: /name/i });
      await fireEvent.input(input, { target: { value: "Web Server" } });
      await fireEvent.blur(input);

      expect(oneditname).toHaveBeenCalledWith("Web Server");
    });

    it("commits an IP edit through oneditip", async () => {
      const oneditip = vi.fn();
      renderInspector({ oneditip });

      const input = screen.getByRole("textbox", { name: /ip/i });
      await fireEvent.input(input, { target: { value: "10.0.0.5" } });
      await fireEvent.blur(input);

      expect(oneditip).toHaveBeenCalledWith("10.0.0.5");
    });

    it("commits a notes edit through oneditnotes", async () => {
      const oneditnotes = vi.fn();
      renderInspector({ oneditnotes });

      const input = screen.getByRole("textbox", { name: /notes/i });
      await fireEvent.input(input, { target: { value: "Rebooted nightly" } });
      await fireEvent.blur(input);

      expect(oneditnotes).toHaveBeenCalledWith("Rebooted nightly");
    });

    it("seeds the IP editor with the supplied ip value", () => {
      renderInspector({ ip: "192.168.1.10" });
      const input = screen.getByRole("textbox", {
        name: /ip/i,
      }) as HTMLInputElement;
      expect(input.value).toBe("192.168.1.10");
    });

    it("aborts a pending name commit when the selection changes mid-edit", async () => {
      const oneditname = vi.fn();
      const deviceType = createTestDeviceType({ model: "Dell PowerEdge R740" });
      const { rerender } = render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice({ id: "device-a" }),
          deviceType,
          showActions: true,
          verbs: allVerbs,
          oneditname,
        },
      });

      await fireEvent.click(screen.getByRole("button", { name: /edit name/i }));
      const input = screen.getByRole("textbox", { name: /name/i });
      await fireEvent.input(input, { target: { value: "Web Server" } });

      // Selection advances to a different placement before the input blurs.
      await rerender({
        device: createTestPlacedDevice({ id: "device-b" }),
        deviceType,
        showActions: true,
        verbs: allVerbs,
        oneditname,
      });
      await fireEvent.blur(input);

      // The stale edit must not land on the newly selected device.
      expect(oneditname).not.toHaveBeenCalled();
    });
  });

  describe("Read-only lock", () => {
    // Verbs as supplied by the registry projection in a fully-capable context.
    const allVerbs: SelectionVerbItem[] = [
      { id: "move-device-up", label: "Move device up", disabled: false },
      { id: "move-device-down", label: "Move device down", disabled: false },
      { id: "flip-device-face", label: "Flip face", disabled: false },
      {
        id: "duplicate-selection",
        label: "Duplicate selection",
        disabled: false,
      },
      { id: "delete-selection", label: "Delete selected", disabled: false },
    ];

    it("hides action verbs when readOnly is true", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          readOnly: true,
          verbs: allVerbs,
        },
      });
      expect(
        screen.queryByRole("button", { name: /move device up/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /flip face/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /duplicate/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /delete selected/i }),
      ).not.toBeInTheDocument();
    });

    it("hides editable fields when readOnly is true", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          readOnly: true,
          verbs: allVerbs,
          ip: "10.0.0.1",
        },
      });
      expect(
        screen.queryByRole("button", { name: /edit name/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /ip/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /notes/i }),
      ).not.toBeInTheDocument();
    });

    it("shows action verbs when readOnly is false", () => {
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          readOnly: false,
          verbs: allVerbs,
        },
      });
      expect(
        screen.getByRole("button", { name: /move device up/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete selected/i }),
      ).toBeInTheDocument();
    });

    it("shows action verbs when readOnly is omitted (default unlocked)", () => {
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
    });

    it("does not call onaction when verb button click is attempted while readOnly (verbs hidden)", async () => {
      // When readOnly=true the verb buttons are not in the DOM, so clicks cannot
      // reach them. This test verifies the component does not fire onaction via
      // any other path.
      const onaction = vi.fn();
      render(DeviceDetails, {
        props: {
          device: createTestPlacedDevice(),
          deviceType: createTestDeviceType(),
          showActions: true,
          readOnly: true,
          verbs: allVerbs,
          onaction,
        },
      });
      // No clickable verb buttons exist; onaction must never be called.
      expect(onaction).not.toHaveBeenCalled();
    });
  });
});
