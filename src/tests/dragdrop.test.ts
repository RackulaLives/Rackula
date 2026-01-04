import { describe, it, expect } from "vitest";
import {
  calculateDropPosition,
  calculateDropSlotPosition,
  getDropFeedback,
  type DragData,
} from "$lib/utils/dragdrop";
import type { Rack, DeviceType } from "$lib/types";

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
        devices: [
          {
            id: "dd-test-1",
            device_type: "device-1",
            position: 5,
            face: "front",
          },
        ], // Device at U5-U6
      };

      // Trying to place at U5 (would collide)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 5);
      expect(feedback).toBe("blocked");
    });

    it('returns "blocked" for partial collision', () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "dd-test-2",
            device_type: "device-1",
            position: 5,
            face: "front",
          },
        ], // Device at U5-U6
      };

      // 2U device at position 4 would occupy U4-U5 (collides with U5)
      const feedback = getDropFeedback(rackWithDevice, deviceLibrary, 2, 4);
      expect(feedback).toBe("blocked");
    });

    it('returns "valid" for position adjacent to existing device', () => {
      const rackWithDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "dd-test-3",
            device_type: "device-1",
            position: 5,
            face: "front",
          },
        ], // Device at U5-U6
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
        devices: [
          {
            id: "front-1",
            device_type: "patch-panel",
            position: 5,
            face: "front",
          },
        ],
      };

      // Dropping half-depth device on rear at U5 should be valid
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1, // device height
        5, // target U
        undefined, // excludeIndex
        "rear", // target face
        false, // is half-depth
      );
      expect(feedback).toBe("valid");
    });

    it("allows drop on front when half-depth rear device exists at same U", () => {
      const rackWithRearDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "rear-1",
            device_type: "patch-panel",
            position: 5,
            face: "rear",
          },
        ],
      };

      // Dropping half-depth device on front at U5 should be valid
      const feedback = getDropFeedback(
        rackWithRearDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        false,
      );
      expect(feedback).toBe("valid");
    });

    it("blocks drop on rear when full-depth front device exists at same U", () => {
      const rackWithFullDepthDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "front-full",
            device_type: "full-server",
            position: 5,
            face: "front",
          },
        ],
      };

      // Dropping any device on rear at U5 should be blocked (full-depth occupies both faces)
      const feedback = getDropFeedback(
        rackWithFullDepthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
        false,
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks drop when full-depth device dropped over half-depth device", () => {
      const rackWithHalfDepthDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "front-half",
            device_type: "patch-panel",
            position: 5,
            face: "front",
          },
        ],
      };

      // Dropping full-depth device on rear at U5 should be blocked
      const feedback = getDropFeedback(
        rackWithHalfDepthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "rear",
        true, // full-depth device being dropped
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks drop when half-depth devices overlap on same face", () => {
      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "front-1",
            device_type: "patch-panel",
            position: 5,
            face: "front",
          },
        ],
      };

      // Dropping half-depth device on front at U5 should be blocked (same face)
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        false,
      );
      expect(feedback).toBe("blocked");
    });

    it("defaults to front face when targetFace not provided (backward compatibility)", () => {
      const rackWithRearDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "rear-1",
            device_type: "patch-panel",
            position: 5,
            face: "rear",
          },
        ],
      };

      // Without face param, should default to 'front' and allow placement
      // (rear device doesn't block front for half-depth)
      const feedback = getDropFeedback(rackWithRearDevice, deviceLibrary, 1, 5);
      // Note: Default isFullDepth=true means it will block rear device
      expect(feedback).toBe("blocked");
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
        devices: [
          {
            id: "left-1",
            device_type: "half-width-switch",
            position: 5,
            face: "front",
            slot_position: "left",
          },
        ],
      };

      // Dropping half-width device in right slot at U5 should be valid
      const feedback = getDropFeedback(
        rackWithLeftDevice,
        deviceLibrary,
        1, // device height
        5, // target U
        undefined, // excludeIndex
        "front", // target face
        true, // isFullDepth (doesn't matter for slot collision)
        "right", // target slot
      );
      expect(feedback).toBe("valid");
    });

    it("blocks half-width device in same slot at same U", () => {
      const rackWithLeftDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "left-1",
            device_type: "half-width-switch",
            position: 5,
            face: "front",
            slot_position: "left",
          },
        ],
      };

      // Dropping half-width device in left slot at U5 should be blocked
      const feedback = getDropFeedback(
        rackWithLeftDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        true,
        "left",
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks full-width device when half-width device exists in same U", () => {
      const rackWithHalfWidthDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "half-1",
            device_type: "half-width-switch",
            position: 5,
            face: "front",
            slot_position: "left",
          },
        ],
      };

      // Dropping full-width device at U5 should be blocked
      const feedback = getDropFeedback(
        rackWithHalfWidthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        true,
        "full",
      );
      expect(feedback).toBe("blocked");
    });

    it("blocks half-width device when full-width device exists in same U", () => {
      const rackWithFullWidthDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "full-1",
            device_type: "full-width-server",
            position: 5,
            face: "front",
            slot_position: "full",
          },
        ],
      };

      // Dropping half-width device at U5 should be blocked (full occupies both slots)
      const feedback = getDropFeedback(
        rackWithFullWidthDevice,
        deviceLibrary,
        1,
        5,
        undefined,
        "front",
        true,
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
        true,
        "left",
      );
      expect(feedback).toBe("valid");
    });

    it("allows half-depth half-width devices on opposite faces at same U and slot", () => {
      // Use a half-depth device for this test
      const halfDepthHalfWidthDevice: DeviceType = {
        slug: "half-depth-switch",
        model: "Half-Depth Switch",
        u_height: 1,
        colour: "#4A90D9",
        category: "switch",
        slot_width: 1,
        is_full_depth: false,
      };

      const libraryWithHalfDepth = [halfDepthHalfWidthDevice, ...deviceLibrary];

      const rackWithFrontDevice: Rack = {
        ...emptyRack,
        devices: [
          {
            id: "front-left",
            device_type: "half-depth-switch",
            position: 5,
            face: "front",
            slot_position: "left",
          },
        ],
      };

      // Dropping half-depth device on rear, left slot at U5 should be valid
      // (different face, half-depth devices don't collide)
      const feedback = getDropFeedback(
        rackWithFrontDevice,
        libraryWithHalfDepth,
        1,
        5,
        undefined,
        "rear",
        false, // half-depth device being dropped
        "left",
      );
      expect(feedback).toBe("valid");
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
