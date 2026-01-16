/**
 * Tests for Issue #450: Face Change Collision Detection
 *
 * Changing a device's mounted face to 'both' (full-depth) should check for
 * collisions with devices on the opposite face. If collision would occur,
 * the change should be blocked and an error toast displayed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import EditPanel from "$lib/components/EditPanel.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore, getToastStore } from "$lib/stores/toast.svelte";
import { canPlaceDevice, findCollisions } from "$lib/utils/collision";
import { toInternalUnits } from "$lib/utils/position";
import type { DeviceType, Rack } from "$lib/types";

describe("Face Change Collision Detection (#450)", () => {
  // For unit tests with manually created racks
  const TEST_RACK_ID = "test-rack";

  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  describe("Unit Tests: Core Collision Detection for Face Changes", () => {
    // Test fixtures
    const deviceLibrary: DeviceType[] = [
      {
        slug: "server-1u",
        model: "1U Server",
        u_height: 1,
        is_full_depth: false,
        form_factor: "rack-mount",
        category: "server",
      },
      {
        slug: "server-2u",
        model: "2U Server",
        u_height: 2,
        is_full_depth: false,
        form_factor: "rack-mount",
        category: "server",
      },
      {
        slug: "switch-half",
        model: "Half-Width Switch",
        u_height: 1,
        is_full_depth: false,
        form_factor: "rack-mount",
        category: "network",
      },
    ];

    it("should block front device changing to 'both' when rear device at same U", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear",
          },
        ],
      };

      // Try to place device at position 1 with face='both', excluding the front device (index 0)
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1, // u_height
        toInternalUnits(1), // position
        0, // excludeIndex (the front device)
        "both", // target face
      );

      expect(canPlace).toBe(false);
    });

    it("should block front device changing to 'both' with partial U overlap", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-2u",
            position: toInternalUnits(1), // U1-U2
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-2u",
            position: toInternalUnits(2), // U2-U3 (overlaps at U2)
            face: "rear",
          },
        ],
      };

      // Try to place device at position 1 with height 2 and face='both'
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        2, // u_height
        toInternalUnits(1), // position
        0, // excludeIndex (the front device)
        "both", // target face
      );

      expect(canPlace).toBe(false);
    });

    it("should allow front device changing to 'both' when no U overlap", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(3), // No overlap with U1
            face: "rear",
          },
        ],
      };

      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1, // u_height
        toInternalUnits(1), // position
        0, // excludeIndex
        "both", // target face
      );

      expect(canPlace).toBe(true);
    });

    it("should allow left-half front + right-half rear to both become 'both'", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "left-front",
            device_type: "switch-half",
            position: toInternalUnits(1),
            face: "front",
            slot_position: "left",
          },
          {
            id: "right-rear",
            device_type: "switch-half",
            position: toInternalUnits(1),
            face: "rear",
            slot_position: "right",
          },
        ],
      };

      // Left-half front device changing to 'both' should succeed (no slot overlap)
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "both",
        "left", // keep same slot
      );

      expect(canPlace).toBe(true);
    });

    it("should block full-width front + left-half rear when front changes to 'both'", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "full-front",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
            slot_position: "full",
          },
          {
            id: "left-rear",
            device_type: "switch-half",
            position: toInternalUnits(1),
            face: "rear",
            slot_position: "left",
          },
        ],
      };

      // Full-width front device changing to 'both' should fail (full overlaps left)
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "both",
        "full",
      );

      expect(canPlace).toBe(false);
    });

    it("should always allow changing from 'both' to 'front'", () => {
      // When a device is at 'both' and wants to change to 'front', it should succeed
      // even if there's a device on the rear at the same position (we're vacating the rear)
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "both-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "both",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear", // Device on rear - but we're moving TO front, so no conflict
          },
        ],
      };

      // Changing from 'both' to 'front' should work (reduces collision surface)
      // The rear device at position 1 won't conflict with our front-only placement
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "front",
      );

      expect(canPlace).toBe(true);
    });

    it("should always allow changing from 'both' to 'rear'", () => {
      // When a device is at 'both' and wants to change to 'rear', it should succeed
      // even if there's a device on the front at the same position (we're vacating the front)
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "both-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "both",
          },
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front", // Device on front - but we're moving TO rear, so no conflict
          },
        ],
      };

      // Changing from 'both' to 'rear' should work (reduces collision surface)
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "rear",
      );

      expect(canPlace).toBe(true);
    });

    it("should correctly exclude self from collision check", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "only-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
        ],
      };

      // Device should not collide with itself when checking face change
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "both",
      );

      expect(canPlace).toBe(true);
    });

    it("should find collisions with opposite face devices when changing to 'both'", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear",
          },
        ],
      };

      const collisions = findCollisions(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0, // exclude front device
        "both",
      );

      // eslint-disable-next-line no-restricted-syntax -- Testing collision detection (exactly 1 collision expected)
      expect(collisions).toHaveLength(1);
      expect(collisions[0]!.id).toBe("rear-device");
    });

    // Front↔Rear transition tests
    it("should block front device changing to 'rear' when rear device exists at same U", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear",
          },
        ],
      };

      // Front device trying to move to rear should be blocked
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "rear",
      );

      expect(canPlace).toBe(false);
    });

    it("should block rear device changing to 'front' when front device exists at same U", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear",
          },
        ],
      };

      // Rear device (index 1) trying to move to front should be blocked
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        1,
        "front",
      );

      expect(canPlace).toBe(false);
    });

    it("should allow front device changing to 'rear' when no rear device at same U", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "front",
          },
          {
            id: "rear-device-elsewhere",
            device_type: "server-1u",
            position: toInternalUnits(5), // Different U position
            face: "rear",
          },
        ],
      };

      // Front device can move to rear since no rear device at U1
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        0,
        "rear",
      );

      expect(canPlace).toBe(true);
    });

    it("should allow rear device changing to 'front' when no front device at same U", () => {
      const rack: Rack = {
        id: TEST_RACK_ID,
        name: "Test Rack",
        height: 42,
        rack_width: 19,
        desc_units: false,
        devices: [
          {
            id: "front-device-elsewhere",
            device_type: "server-1u",
            position: toInternalUnits(5), // Different U position
            face: "front",
          },
          {
            id: "rear-device",
            device_type: "server-1u",
            position: toInternalUnits(1),
            face: "rear",
          },
        ],
      };

      // Rear device (index 1) can move to front since no front device at U1
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        toInternalUnits(1),
        1,
        "front",
      );

      expect(canPlace).toBe(true);
    });
  });

  describe("Integration Tests: EditPanel Face Change with Toast", () => {
    it("should show error toast when face change to 'both' is blocked by collision", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      // Set up rack with two devices at same U, opposite faces
      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      // Add two half-depth device types for testing
      const frontDevice = layoutStore.addDeviceType({
        name: "Front Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      const rearDevice = layoutStore.addDeviceType({
        name: "Rear Server",
        u_height: 1,
        category: "server",
        colour: "#FF5555",
        is_full_depth: false,
      });

      // Place devices at same U, opposite faces
      layoutStore.placeDevice(rackId, frontDevice.slug, 1, "front");
      layoutStore.placeDevice(rackId, rearDevice.slug, 1, "rear");

      // Select the front device
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      // Change face to 'both'
      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "both" } });

      // Should show error toast
      await waitFor(() => {
        expect(toastStore.toasts.length).toBeGreaterThan(0);
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeDefined();
        expect(errorToast!.message).toContain("Cannot change to full-depth");
      });

      // Device face should NOT have changed
      expect(layoutStore.rack!.devices[0]!.face).toBe("front");
    });

    it("should successfully change face to 'both' when no collision", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const device = layoutStore.addDeviceType({
        name: "Lonely Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });

      layoutStore.placeDevice(rackId, device.slug, 1, "front");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "both" } });

      // No error toast should appear
      await waitFor(() => {
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeUndefined();
      });

      // Device face should have changed
      expect(layoutStore.rack!.devices[0]!.face).toBe("both");
    });

    it("should allow changing from 'both' to 'front' even with device at rear", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const mainDevice = layoutStore.addDeviceType({
        name: "Main Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      const rearDevice = layoutStore.addDeviceType({
        name: "Rear Device",
        u_height: 1,
        category: "server",
        colour: "#FF5555",
        is_full_depth: false,
      });

      // Place main device as 'both'
      layoutStore.placeDevice(rackId, mainDevice.slug, 1, "both");
      // Place another device at rear
      layoutStore.placeDevice(rackId, rearDevice.slug, 2, "rear");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "front" } });

      // No error toast
      await waitFor(() => {
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeUndefined();
      });

      // Face should change to front
      expect(layoutStore.rack!.devices[0]!.face).toBe("front");
    });

    it("toast message should include blocking device name", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const frontDevice = layoutStore.addDeviceType({
        name: "Front Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      const rearDevice = layoutStore.addDeviceType({
        name: "Blocking Device",
        u_height: 1,
        category: "server",
        colour: "#FF5555",
        is_full_depth: false,
      });

      layoutStore.placeDevice(rackId, frontDevice.slug, 1, "front");
      layoutStore.placeDevice(rackId, rearDevice.slug, 1, "rear");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "both" } });

      await waitFor(() => {
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeDefined();
        expect(errorToast!.message).toContain("Blocking Device");
      });
    });

    // Front↔Rear integration tests
    it("should show error toast when front→rear change blocked by collision", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const frontDevice = layoutStore.addDeviceType({
        name: "Front Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      const rearDevice = layoutStore.addDeviceType({
        name: "Rear Blocker",
        u_height: 1,
        category: "server",
        colour: "#FF5555",
        is_full_depth: false,
      });

      layoutStore.placeDevice(rackId, frontDevice.slug, 1, "front");
      layoutStore.placeDevice(rackId, rearDevice.slug, 1, "rear");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "rear" } });

      await waitFor(() => {
        expect(toastStore.toasts.length).toBeGreaterThan(0);
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeDefined();
        expect(errorToast!.message).toContain("Cannot change to rear");
        expect(errorToast!.message).toContain("Rear Blocker");
      });

      // Face should NOT have changed
      expect(layoutStore.rack!.devices[0]!.face).toBe("front");
    });

    it("should show error toast when rear→front change blocked by collision", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const frontDevice = layoutStore.addDeviceType({
        name: "Front Blocker",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });
      const rearDevice = layoutStore.addDeviceType({
        name: "Rear Server",
        u_height: 1,
        category: "server",
        colour: "#FF5555",
        is_full_depth: false,
      });

      layoutStore.placeDevice(rackId, frontDevice.slug, 1, "front");
      layoutStore.placeDevice(rackId, rearDevice.slug, 1, "rear");

      // Select the REAR device (index 1)
      const deviceId = layoutStore.rack!.devices[1]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "front" } });

      await waitFor(() => {
        expect(toastStore.toasts.length).toBeGreaterThan(0);
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeDefined();
        expect(errorToast!.message).toContain("Cannot change to front");
        expect(errorToast!.message).toContain("Front Blocker");
      });

      // Face should NOT have changed
      expect(layoutStore.rack!.devices[1]!.face).toBe("rear");
    });

    it("should successfully change front→rear when no collision", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const toastStore = getToastStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;

      const device = layoutStore.addDeviceType({
        name: "Lonely Front Server",
        u_height: 1,
        category: "server",
        colour: "#4A90D9",
        is_full_depth: false,
      });

      layoutStore.placeDevice(rackId, device.slug, 1, "front");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(EditPanel);

      const faceSelect = screen.getByLabelText(
        /mounted face/i,
      ) as HTMLSelectElement;
      await fireEvent.change(faceSelect, { target: { value: "rear" } });

      // No error toast
      await waitFor(() => {
        const errorToast = toastStore.toasts.find((t) => t.type === "warning");
        expect(errorToast).toBeUndefined();
      });

      // Face should change to rear
      expect(layoutStore.rack!.devices[0]!.face).toBe("rear");
    });
  });
});
