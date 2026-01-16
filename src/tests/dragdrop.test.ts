import { describe, it, expect, vi } from "vitest";
import {
  calculateDropPosition,
  calculateDropSlotPosition,
  getDropFeedback,
  hideNativeDragGhost,
  type DragData,
} from "$lib/utils/dragdrop";
import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";

// Helper to create a placed device with internal unit position
function pd(
  id: string,
  device_type: string,
  positionU: number,
  face: "front" | "rear" | "both",
  slot_position?: "left" | "right" | "full",
): PlacedDevice {
  const device: PlacedDevice = {
    id,
    device_type,
    position: toInternalUnits(positionU),
    face,
  };
  if (slot_position) {
    device.slot_position = slot_position;
  }
  return device;
}

describe("Drag and Drop Utilities", () => {
  // Constants matching component implementation
  const U_HEIGHT = 22;
  const RACK_PADDING = 4;

  describe("calculateDropPosition", () => {
    // 12U rack: totalHeight = 12 * 22 = 264
    // SVG coordinate system: y=0 at top, y=264 at bottom
    // U12 is at top (y=0-22), U1 is at bottom (y=242-264)

    it("returns U1 for mouse near bottom of rack", () => {
      // Mouse at y=250 (near bottom, within U1 range)
      const position = calculateDropPosition(250, 12, U_HEIGHT, RACK_PADDING);
      expect(position).toBe(1);
    });

    it("returns correct U for mouse near top", () => {
      // Mouse at y=10 (near top, within U12 range)
      const position = calculateDropPosition(10, 12, U_HEIGHT, RACK_PADDING);
      expect(position).toBe(12);
    });

    it("returns correct U for mouse in middle", () => {
      // Mouse at y=132 (middle of rack, around U6-U7)
      const position = calculateDropPosition(132, 12, U_HEIGHT, RACK_PADDING);
      // Middle of 12U rack, y=132 should be around U6
      expect(position).toBeGreaterThanOrEqual(5);
      expect(position).toBeLessThanOrEqual(7);
    });

    it("snaps to nearest U boundary", () => {
      // Any Y position within a U range should snap to that U
      const position1 = calculateDropPosition(245, 12, U_HEIGHT, RACK_PADDING);
      const position2 = calculateDropPosition(255, 12, U_HEIGHT, RACK_PADDING);
      // Both should be U1 (bottom)
      expect(position1).toBe(1);
      expect(position2).toBe(1);
    });

    it("clamps to minimum U (1) for y beyond rack bottom", () => {
      const position = calculateDropPosition(500, 12, U_HEIGHT, RACK_PADDING);
      expect(position).toBe(1);
    });

    it("clamps to maximum U for y above rack top", () => {
      const position = calculateDropPosition(-50, 12, U_HEIGHT, RACK_PADDING);
      expect(position).toBe(12);
    });

    it("handles 42U rack correctly", () => {
      // 42U rack: totalHeight = 42 * 22 = 924
      const bottomPosition = calculateDropPosition(
        920,
        42,
        U_HEIGHT,
        RACK_PADDING,
      );
      const topPosition = calculateDropPosition(10, 42, U_HEIGHT, RACK_PADDING);

      expect(bottomPosition).toBe(1);
      expect(topPosition).toBe(42);
    });
  });

  describe("getDropFeedback", () => {
    const mockDevice: DeviceType = {
      slug: "device-1",
      model: "Test Server",
      u_height: 2,
      colour: "#4A90D9",
      category: "server",
    };

    const emptyRack: Rack = {
      name: "Test Rack",
      height: 12,
      width: 19,
      position: 0,
      desc_units: false,
      form_factor: "4-post",
      starting_unit: 1,
      devices: [],
    };

    const deviceLibrary: DeviceType[] = [mockDevice];

    it('returns "valid" for empty position in empty rack', () => {
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 2, 5);
      expect(feedback).toBe("valid");
    });

    it('returns "valid" for position 1 (bottom)', () => {
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 2, 1);
      expect(feedback).toBe("valid");
    });

    it('returns "invalid" for position exceeding rack height', () => {
      // 2U device at position 12 would occupy U12-U13 (out of bounds)
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 2, 12);
      expect(feedback).toBe("invalid");
    });

    it('returns "invalid" for position 0', () => {
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 2, 0);
      expect(feedback).toBe("invalid");
    });

    it('returns "invalid" for negative position', () => {
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 2, -1);
      expect(feedback).toBe("invalid");
    });

    it('returns "blocked" for collision with existing device', () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("dd-test-1", "device-1", 5, "front")], // Device at U5-U6
      };

      // Trying to place at U5 (would collide)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 5);
      expect(feedback).toBe("blocked");
    });

    it('returns "blocked" for partial collision', () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("dd-test-2", "device-1", 5, "front")], // Device at U5-U6
      };

      // 2U device at position 4 would occupy U4-U5 (collides with U5)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 4);
      expect(feedback).toBe("blocked");
    });

    it('returns "valid" for position adjacent to existing device', () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [pd("dd-test-3", "device-1", 5, "front")], // Device at U5-U6
      };

      // 2U device at position 7 would occupy U7-U8 (no collision)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 7);
      expect(feedback).toBe("valid");

      // 1U device at position 4 would only occupy U4 (no collision)
      const feedback2 = getDropFeedback(rackWithDevice, deviceLibrary, 1, 4);
      expect(feedback2).toBe("valid");
    });

    it('returns "valid" for 1U device at top of 12U rack', () => {
      const feedback = getDropFeedback(emptyRack, deviceLibrary, 1, 12);
      expect(feedback).toBe("valid");
    });
  });

  describe("getDropFeedback with face awareness (#168)", () => {
    // Half-depth device for testing
    const halfDepthDevice: DeviceType = {
      slug: "patch-panel",
      model: "Patch Panel",
      u_height: 1,
      colour: "#888888",
      category: "patch_panel",
      is_full_depth: false,
    };

    // Full-depth device for testing
    const fullDepthDevice: DeviceType = {
      slug: "full-server",
      model: "Full Server",
      u_height: 2,
      colour: "#4A90D9",
      category: "server",
      is_full_depth: true,
    };

    const deviceLibrary: DeviceType[] = [halfDepthDevice, fullDepthDevice];

    const emptyRack: Rack = {
      name: "Test Rack",
      height: 12,
      width: 19,
      position: 0,
      desc_units: false,
      form_factor: "4-post",
      starting_unit: 1,
      devices: [],
    };

    it("allows drop on rear when half-depth front device exists at same U", () => {
      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [pd("front-1", "patch-panel", 5, "front")],
      };

      // Dropping half-depth device on rear at U5 should be valid
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1, // device height
        5, // target U
        undefined, // excludeIndex
        "rear", // target face
      );
      expect(feedback).toBe("valid");
    });

    it("allows drop on front when half-depth rear device exists at same U", () => {
      const rackWithRearDevice: Rack = {
        ...emptyRack,
        devices: [pd("rear-1", "patch-panel", 5, "rear")],
      };

      // Dropping half-depth device on front at U5 should be valid
      const feedback = getDropFeedback(
        rackWithRearDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
      );
      expect(feedback).toBe("valid");
    });

    it("allows drop on rear when full-depth device has face set to front", () => {
      // Face-authoritative: face: "front" only blocks front, regardless of is_full_depth
      const rackWithFrontOnlyDevice: Rack = {
        ...emptyRack,
        devices: [pd("front-full", "full-server", 5, "front")],
      };

      // Dropping on rear at U5 should be valid (face: "front" doesn't block rear)
      const feedback = getDropFeedback(
        rackWithFrontOnlyDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
      );
      expect(feedback).toBe("valid");
    });

    it("blocks drop on rear when device has face set to both", () => {
      const rackWithBothFaceDevice: Rack = {
        ...emptyRack,
        devices: [pd("both-device", "full-server", 5, "both")],
      };

      // Dropping on rear at U5 should be blocked (face: "both" blocks everything)
      const feedback = getDropFeedback(
        rackWithBothFaceDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
      );
      expect(feedback).toBe("blocked");
    });

    it("allows drop on rear when existing device has face set to front", () => {
      // With face-authoritative model, face: "front" doesn't block rear
      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [pd("front-half", "patch-panel", 5, "front")],
      };

      // Dropping device on rear at U5 should be valid (existing device only blocks front)
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
      );
      expect(feedback).toBe("valid");
    });

    it("blocks drop when devices overlap on same face", () => {
      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [pd("front-1", "patch-panel", 5, "front")],
      };

      // Dropping device on front at U5 should be blocked (same face)
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
      );
      expect(feedback).toBe("blocked");
    });

    it("defaults to front face when targetFace not provided", () => {
      const rackWithRearDevice: Rack = {
        ...emptyRack,
        devices: [pd("rear-1", "patch-panel", 5, "rear")],
      };

      // Without face param, defaults to 'front' - opposite faces don't collide
      const feedback = getDropFeedback(rackWithRearDevice, deviceLibrary, 1, 5);
      expect(feedback).toBe("valid");
    });
  });

  describe("calculateDropSlotPosition (#146)", () => {
    const RACK_WIDTH = 200; // Example rack interior width

    it('returns "full" for full-width devices (slotWidth=2)', () => {
      const position = calculateDropSlotPosition(50, RACK_WIDTH, 2);
      expect(position).toBe("full");
    });

    it('returns "full" for full-width devices regardless of mouse position', () => {
      expect(calculateDropSlotPosition(10, RACK_WIDTH, 2)).toBe("full");
      expect(calculateDropSlotPosition(150, RACK_WIDTH, 2)).toBe("full");
      expect(calculateDropSlotPosition(0, RACK_WIDTH, 2)).toBe("full");
      expect(calculateDropSlotPosition(RACK_WIDTH, RACK_WIDTH, 2)).toBe("full");
    });

    it('returns "left" for half-width device when mouse is in left half', () => {
      const position = calculateDropSlotPosition(50, RACK_WIDTH, 1);
      expect(position).toBe("left");
    });

    it('returns "right" for half-width device when mouse is in right half', () => {
      const position = calculateDropSlotPosition(150, RACK_WIDTH, 1);
      expect(position).toBe("right");
    });

    it('returns "right" when mouse is exactly at midpoint', () => {
      // At midpoint (100), mouseX < midpoint is false, so returns 'right'
      const position = calculateDropSlotPosition(100, RACK_WIDTH, 1);
      expect(position).toBe("right");
    });

    it('returns "left" when mouse is at x=0', () => {
      const position = calculateDropSlotPosition(0, RACK_WIDTH, 1);
      expect(position).toBe("left");
    });

    it('returns "right" when mouse is at x=rackWidth', () => {
      const position = calculateDropSlotPosition(RACK_WIDTH, RACK_WIDTH, 1);
      expect(position).toBe("right");
    });

    it("defaults to full-width when slotWidth is not provided", () => {
      const position = calculateDropSlotPosition(50, RACK_WIDTH);
      expect(position).toBe("full");
    });
  });

  describe("getDropFeedback with slot position (#146)", () => {
    // Half-width device for testing
    const halfWidthDevice: DeviceType = {
      slug: "half-width-switch",
      model: "Half-Width Switch",
      u_height: 1,
      colour: "#4A90D9",
      category: "switch",
      slot_width: 1,
    };

    // Full-width device for testing
    const fullWidthDevice: DeviceType = {
      slug: "full-width-server",
      model: "Full Width Server",
      u_height: 2,
      colour: "#888888",
      category: "server",
      slot_width: 2,
    };

    const deviceLibrary: DeviceType[] = [halfWidthDevice, fullWidthDevice];

    const emptyRack: Rack = {
      name: "Test Rack",
      height: 12,
      width: 19,
      position: 0,
      desc_units: false,
      form_factor: "4-post",
      starting_unit: 1,
      devices: [],
    };

    it("allows two half-width devices in different slots at same U", () => {
      const rackWithLeftDevice: Rack = {
        ...emptyRack,
        devices: [pd("left-1", "half-width-switch", 5, "front", "left")],
      };

      // Dropping half-width device in right slot at U5 should be valid
      const feedback = getDropFeedback(
        rackWithLeftDevice,
        deviceLibrary,
        1, // device height
        5, // target U
        undefined, // excludeIndex
        "front", // target face
        "right", // target slot
      );
      expect(feedback).toBe("valid");
    });

    it("blocks half-width device in same slot at same U", () => {
      const rackWithLeftDevice: Rack = {
        ...emptyRack,
        devices: [pd("left-1", "half-width-switch", 5, "front", "left")],
      };

      // Dropping half-width device in left slot at U5 should be blocked
      const feedback = getDropFeedback(
        rackWithLeftDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        "left",
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks full-width device when half-width device exists in same U", () => {
      const rackWithHalfWidthDevice: Rack = {
        ...emptyRack,
        devices: [pd("half-1", "half-width-switch", 5, "front", "left")],
      };

      // Dropping full-width device at U5 should be blocked
      const feedback = getDropFeedback(
        rackWithHalfWidthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        "full",
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks half-width device when full-width device exists in same U", () => {
      const rackWithFullWidthDevice: Rack = {
        ...emptyRack,
        devices: [pd("full-1", "full-width-server", 5, "front", "full")],
      };

      // Dropping half-width device at U5 should be blocked (full occupies both slots)
      const feedback = getDropFeedback(
        rackWithFullWidthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        "left",
      );
      expect(feedback).toBe("blocked");
    });

    it("allows half-width device in empty U (no slot_position defaults to full)", () => {
      // Empty rack - should allow any placement
      const feedback = getDropFeedback(
        emptyRack,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        "left",
      );
      expect(feedback).toBe("valid");
    });

    it("allows devices on opposite faces at same U and slot", () => {
      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [pd("front-left", "half-width-switch", 5, "front", "left")],
      };

      // Dropping on rear at same U and slot should be valid
      // (opposite faces don't collide with face-authoritative model)
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
        "left",
      );
      expect(feedback).toBe("valid");
    });
  });

  describe("hideNativeDragGhost", () => {
    it("calls setDragImage with a 1x1 element", () => {
      const mockDataTransfer = {
        setDragImage: vi.fn(),
      } as unknown as DataTransfer;

      hideNativeDragGhost(mockDataTransfer);

      expect(mockDataTransfer.setDragImage).toHaveBeenCalledTimes(1);
      const [element, x, y] = (
        mockDataTransfer.setDragImage as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(element).toBeInstanceOf(HTMLCanvasElement);
      expect(x).toBe(0);
      expect(y).toBe(0);
    });
  });

  describe("DragData interface", () => {
    it("palette drag data has correct shape", () => {
      const dragData: DragData = {
        type: "palette",
        device: {
          slug: "device-1",
          model: "Test",
          u_height: 1,
          colour: "#000",
          category: "server",
        },
      };

      expect(dragData.type).toBe("palette");
      expect(dragData.device).toBeDefined();
      expect(dragData.sourceRackId).toBeUndefined();
      expect(dragData.sourceIndex).toBeUndefined();
    });

    it("rack-device drag data has correct shape", () => {
      const dragData: DragData = {
        type: "rack-device",
        device: {
          slug: "device-1",
          model: "Test",
          u_height: 1,
          colour: "#000",
          category: "server",
        },
        sourceRackId: "rack-1",
        sourceIndex: 0,
      };

      expect(dragData.type).toBe("rack-device");
      expect(dragData.sourceRackId).toBe("rack-1");
      expect(dragData.sourceIndex).toBe(0);
    });
  });
});
