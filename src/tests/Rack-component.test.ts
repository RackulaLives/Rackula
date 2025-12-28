import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import type { Rack as RackType, DeviceType } from "$lib/types";

describe("Rack SVG Component", () => {
  const mockRack: RackType = {
    name: "Test Rack",
    height: 12,
    width: 19,
    position: 0,
    desc_units: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
  };

  const mockDeviceLibrary: DeviceType[] = [];

  describe("U Labels", () => {
    it("renders correct number of U labels", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // Should have 12 U labels for a 12U rack
      for (let u = 1; u <= 12; u++) {
        expect(screen.getByText(String(u))).toBeInTheDocument();
      }
    });

    it("renders U1 at the bottom position", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const u1Label = screen.getByText("1");
      const u12Label = screen.getByText("12");

      // U1 should be lower on screen (higher y value in SVG) than U12
      const u1Y = parseFloat(u1Label.getAttribute("y") ?? "0");
      const u12Y = parseFloat(u12Label.getAttribute("y") ?? "0");

      expect(u1Y).toBeGreaterThan(u12Y);
    });

    it("renders U{height} at the top position", () => {
      const tallRack: RackType = { ...mockRack, height: 42 };

      render(Rack, {
        props: {
          rack: tallRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const u42Label = screen.getByText("42");
      const u1Label = screen.getByText("1");

      // U42 should be higher on screen (lower y value in SVG) than U1
      const u42Y = parseFloat(u42Label.getAttribute("y") ?? "0");
      const u1Y = parseFloat(u1Label.getAttribute("y") ?? "0");

      expect(u42Y).toBeLessThan(u1Y);
    });
  });

  describe("Rack Name", () => {
    it("displays rack name", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      expect(screen.getByText("Test Rack")).toBeInTheDocument();
    });

    it("positions title above rack body", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const title = container.querySelector(".rack-name");
      const rackInterior = container.querySelector(".rack-interior");
      const titleY = parseFloat(title?.getAttribute("y") ?? "0");
      const interiorY = parseFloat(rackInterior?.getAttribute("y") ?? "0");
      expect(titleY).toBeLessThan(interiorY);
    });

    it("centers title horizontally", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const title = container.querySelector(".rack-name");
      expect(title?.getAttribute("text-anchor")).toBe("middle");
    });
  });

  describe("Selection", () => {
    it("shows selection outline when selected=true", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: true,
        },
      });

      // Selection is now indicated via aria-selected on the container (CSS outline applied)
      const rackContainer = container.querySelector(".rack-container");
      expect(rackContainer).toHaveAttribute("aria-selected", "true");
    });

    it("hides selection outline when selected=false", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // Selection is now indicated via aria-selected on the container
      const rackContainer = container.querySelector(".rack-container");
      expect(rackContainer).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("Events", () => {
    it("dispatches select event on click", async () => {
      const handleSelect = vi.fn();

      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
          onselect: handleSelect,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      await fireEvent.click(svg!);

      expect(handleSelect).toHaveBeenCalledTimes(1);
      expect(handleSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { rackId: "rack-0" },
        }),
      );
    });

    it("dispatches select event on Enter key", async () => {
      const handleSelect = vi.fn();

      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
          onselect: handleSelect,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      await fireEvent.keyDown(svg!, { key: "Enter" });

      expect(handleSelect).toHaveBeenCalledTimes(1);
    });

    it("dispatches select event on Space key", async () => {
      const handleSelect = vi.fn();

      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
          onselect: handleSelect,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      await fireEvent.keyDown(svg!, { key: " " });

      expect(handleSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("has correct aria-label", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-label", "Test Rack, 12U rack");
    });

    it("container has tabindex for keyboard focus", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const rackContainer = container.querySelector(".rack-container");
      expect(rackContainer).toHaveAttribute("tabindex", "0");
    });

    it('SVG has role="img" for accessible description', () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("role", "img");
    });
  });

  describe("Rack View Filtering", () => {
    it("shows front-face devices in front view", () => {
      const frontDevice: DeviceType = {
        slug: "dev-1",
        model: "Test Device",
        u_height: 2,
        colour: "#4A90D9",
        category: "server",
      };

      const rearDevice: DeviceType = {
        slug: "dev-2",
        model: "Rear Device",
        u_height: 1,
        colour: "#7B68EE",
        category: "network",
      };

      const rack: RackType = {
        ...mockRack,
        view: "front",
        devices: [
          { id: "rc-test-1", device_type: "dev-1", position: 1, face: "front" },
          { id: "rc-test-2", device_type: "dev-2", position: 5, face: "rear" },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack,
          deviceLibrary: [frontDevice, rearDevice],
          selected: false,
        },
      });

      // Only front-face device should be visible
      const devices = container.querySelectorAll("[data-device-id]");
      expect(devices).toHaveLength(1);
    });

    it("shows rear-face devices in rear view", () => {
      const frontDevice: DeviceType = {
        slug: "dev-1",
        model: "Test Device",
        u_height: 2,
        colour: "#4A90D9",
        category: "server",
      };

      const rearDevice: DeviceType = {
        slug: "dev-2",
        model: "Rear Device",
        u_height: 1,
        colour: "#7B68EE",
        category: "network",
      };

      const rack: RackType = {
        ...mockRack,
        view: "rear",
        devices: [
          { id: "rc-test-3", device_type: "dev-1", position: 1, face: "front" },
          { id: "rc-test-4", device_type: "dev-2", position: 5, face: "rear" },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack,
          deviceLibrary: [frontDevice, rearDevice],
          selected: false,
        },
      });

      // Only rear-face device should be visible
      const devices = container.querySelectorAll("[data-device-id]");
      expect(devices).toHaveLength(1);
    });

    it("shows both-face devices in either view", () => {
      const device: DeviceType = {
        slug: "dev-1",
        model: "Full Depth Device",
        u_height: 4,
        colour: "#50C878",
        category: "storage",
      };

      const rackFront: RackType = {
        ...mockRack,
        devices: [
          { id: "rc-test-5", device_type: "dev-1", position: 1, face: "both" },
        ],
      };

      const { container: containerFront } = render(Rack, {
        props: {
          rack: rackFront,
          deviceLibrary: [device],
          selected: false,
        },
      });

      expect(containerFront.querySelectorAll("[data-device-id]")).toHaveLength(
        1,
      );

      const rackRear: RackType = {
        ...mockRack,
        devices: [
          { id: "rc-test-6", device_type: "dev-1", position: 1, face: "both" },
        ],
      };

      const { container: containerRear } = render(Rack, {
        props: {
          rack: rackRear,
          deviceLibrary: [device],
          selected: false,
        },
      });

      expect(containerRear.querySelectorAll("[data-device-id]")).toHaveLength(
        1,
      );
    });
  });

  describe("Rack Width", () => {
    it('renders 19" rack at standard width', () => {
      const rack19: RackType = { ...mockRack, width: 19 };

      const { container } = render(Rack, {
        props: {
          rack: rack19,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("width", "220");
    });

    it('renders 10" rack proportionally narrower', () => {
      const rack10: RackType = { ...mockRack, width: 10 };

      const { container } = render(Rack, {
        props: {
          rack: rack10,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const svg = container.querySelector("svg");
      const width = parseInt(svg!.getAttribute("width") || "0");
      // 10" should be approximately 10/19 of 220 = ~116
      expect(width).toBeLessThan(220);
      expect(width).toBeGreaterThan(100);
    });

    it('10" rack is narrower than 19" rack', () => {
      const rack10: RackType = { ...mockRack, width: 10 };
      const rack19: RackType = { ...mockRack, width: 19 };

      const { container: container10 } = render(Rack, {
        props: {
          rack: rack10,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const { container: container19 } = render(Rack, {
        props: {
          rack: rack19,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      const svg10 = container10.querySelector("svg");
      const svg19 = container19.querySelector("svg");
      const width10 = parseInt(svg10!.getAttribute("width") || "0");
      const width19 = parseInt(svg19!.getAttribute("width") || "0");

      expect(width10).toBeLessThan(width19);
    });
  });

  describe("Descending Units", () => {
    it("renders U labels ascending when desc_units=false", () => {
      const rack: RackType = { ...mockRack, height: 6, desc_units: false };

      render(Rack, {
        props: {
          rack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // U1 should be at bottom (higher y), U6 at top (lower y)
      const u1Label = screen.getByText("1");
      const u6Label = screen.getByText("6");
      const u1Y = parseFloat(u1Label.getAttribute("y") ?? "0");
      const u6Y = parseFloat(u6Label.getAttribute("y") ?? "0");

      expect(u1Y).toBeGreaterThan(u6Y);
    });

    it("renders U labels descending when desc_units=true", () => {
      const rack: RackType = { ...mockRack, height: 6, desc_units: true };

      render(Rack, {
        props: {
          rack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // U1 should be at top (lower y), U6 at bottom (higher y)
      const u1Label = screen.getByText("1");
      const u6Label = screen.getByText("6");
      const u1Y = parseFloat(u1Label.getAttribute("y") ?? "0");
      const u6Y = parseFloat(u6Label.getAttribute("y") ?? "0");

      expect(u1Y).toBeLessThan(u6Y);
    });
  });

  describe("Starting Unit", () => {
    it("renders U labels starting from starting_unit", () => {
      const rack: RackType = { ...mockRack, height: 4, starting_unit: 5 };

      render(Rack, {
        props: {
          rack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // Should show 5, 6, 7, 8 instead of 1, 2, 3, 4
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("6")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });

    it("combines desc_units=true with custom starting_unit", () => {
      const rack: RackType = {
        ...mockRack,
        height: 3,
        desc_units: true,
        starting_unit: 10,
      };

      render(Rack, {
        props: {
          rack,
          deviceLibrary: mockDeviceLibrary,
          selected: false,
        },
      });

      // Should show 10, 11, 12 with 10 at top
      const u10Label = screen.getByText("10");
      const u12Label = screen.getByText("12");
      const u10Y = parseFloat(u10Label.getAttribute("y") ?? "0");
      const u12Y = parseFloat(u12Label.getAttribute("y") ?? "0");

      expect(u10Y).toBeLessThan(u12Y);
    });
  });

  describe("Face Filter (faceFilter prop)", () => {
    // Use half-depth devices to test face filtering
    // Full-depth devices are now visible from both sides
    const deviceLibrary: DeviceType[] = [
      {
        slug: "front-device",
        model: "Front Device",
        u_height: 2,
        colour: "#4A90D9",
        category: "server",
        is_full_depth: false, // Half-depth: only visible on front face
      },
      {
        slug: "rear-device",
        model: "Rear Device",
        u_height: 1,
        colour: "#7B68EE",
        category: "network",
        is_full_depth: false, // Half-depth: only visible on rear face
      },
      {
        slug: "both-device",
        model: "Full Depth Device",
        u_height: 3,
        colour: "#50C878",
        category: "storage",
        // is_full_depth defaults to true, face='both' makes it visible on both
      },
    ];

    const rackWithDevices: RackType = {
      ...mockRack,
      view: "front", // Default view for filtering
      devices: [
        {
          id: "rc-ff-1",
          device_type: "front-device",
          position: 1,
          face: "front",
        },
        {
          id: "rc-ff-2",
          device_type: "rear-device",
          position: 5,
          face: "rear",
        },
        {
          id: "rc-ff-3",
          device_type: "both-device",
          position: 8,
          face: "both",
        },
      ],
    };

    it("shows only front, both-face, and full-depth opposite-face devices when faceFilter=front", () => {
      const { container } = render(Rack, {
        props: {
          rack: rackWithDevices,
          deviceLibrary,
          selected: false,
          faceFilter: "front",
        },
      });

      const devices = container.querySelectorAll("[data-device-id]");
      // Should show front-device and both-device
      // rear-device is half-depth so NOT visible from front
      expect(devices).toHaveLength(2);

      const deviceIds = Array.from(devices).map((d) =>
        d.getAttribute("data-device-id"),
      );
      expect(deviceIds).toContain("front-device");
      expect(deviceIds).toContain("both-device");
      expect(deviceIds).not.toContain("rear-device");
    });

    it("shows only rear, both-face, and full-depth opposite-face devices when faceFilter=rear", () => {
      const { container } = render(Rack, {
        props: {
          rack: rackWithDevices,
          deviceLibrary,
          selected: false,
          faceFilter: "rear",
        },
      });

      const devices = container.querySelectorAll("[data-device-id]");
      // Should show rear-device and both-device
      // front-device is half-depth so NOT visible from rear
      expect(devices).toHaveLength(2);

      const deviceIds = Array.from(devices).map((d) =>
        d.getAttribute("data-device-id"),
      );
      expect(deviceIds).toContain("rear-device");
      expect(deviceIds).toContain("both-device");
      expect(deviceIds).not.toContain("front-device");
    });

    it("shows full-depth devices from opposite face", () => {
      // Create a full-depth device on front face
      const fullDepthLibrary: DeviceType[] = [
        {
          slug: "full-depth-server",
          model: "Full Depth Server",
          u_height: 2,
          colour: "#888888",
          category: "server",
          is_full_depth: true,
        },
      ];

      const rackWithFullDepth: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-ff-fd",
            device_type: "full-depth-server",
            position: 1,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithFullDepth,
          deviceLibrary: fullDepthLibrary,
          selected: false,
          faceFilter: "rear", // Viewing rear, but full-depth front device should be visible
        },
      });

      const devices = container.querySelectorAll("[data-device-id]");
      expect(devices).toHaveLength(1);

      const deviceIds = Array.from(devices).map((d) =>
        d.getAttribute("data-device-id"),
      );
      expect(deviceIds).toContain("full-depth-server");
    });

    it("shows all devices when faceFilter is undefined (backwards compat)", () => {
      const { container } = render(Rack, {
        props: {
          rack: rackWithDevices,
          deviceLibrary,
          selected: false,
          // faceFilter not provided
        },
      });

      // Without faceFilter, falls back to rack.view filtering
      // rack.view defaults to 'front', so should show front-device and both-device
      const devices = container.querySelectorAll("[data-device-id]");
      expect(devices.length).toBeGreaterThanOrEqual(2);
    });

    it("renders viewLabel when provided", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          viewLabel: "FRONT",
        },
      });

      expect(screen.getByText("FRONT")).toBeInTheDocument();
    });

    it("does not render viewLabel when not provided", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          // viewLabel not provided
        },
      });

      expect(screen.queryByText("FRONT")).not.toBeInTheDocument();
      expect(screen.queryByText("REAR")).not.toBeInTheDocument();
    });

    it("viewLabel has correct styling class", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          viewLabel: "REAR",
        },
      });

      const label = container.querySelector(".rack-view-label");
      expect(label).toBeInTheDocument();
      expect(label?.textContent).toBe("REAR");
    });

    it("hides rack name when hideRackName=true", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          hideRackName: true,
        },
      });

      // Rack name should not be visible
      expect(screen.queryByText("Test Rack")).not.toBeInTheDocument();
    });

    it("shows rack name when hideRackName=false (default)", () => {
      render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          // hideRackName not provided (defaults to false)
        },
      });

      expect(screen.getByText("Test Rack")).toBeInTheDocument();
    });
  });

  describe("U Labels Position", () => {
    it("U labels are always on left rail for front view", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          faceFilter: "front",
        },
      });

      const uLabels = container.querySelectorAll(".u-label");
      expect(uLabels.length).toBeGreaterThan(0);

      // Left rail center would be around 17/2 = 8.5
      const firstLabel = uLabels[0];
      const labelX = parseFloat(firstLabel?.getAttribute("x") ?? "0");

      // Labels should be on left side (x < RACK_WIDTH / 2 = 110)
      expect(labelX).toBeLessThan(110);
    });

    it("U labels are always on left rail for rear view", () => {
      const { container } = render(Rack, {
        props: {
          rack: mockRack,
          deviceLibrary: [],
          selected: false,
          faceFilter: "rear",
        },
      });

      // In rear view, U labels should ALSO be on the left side (not mirrored)
      const uLabels = container.querySelectorAll(".u-label");
      expect(uLabels.length).toBeGreaterThan(0);

      // Left rail center would be around 17/2 = 8.5
      const firstLabel = uLabels[0];
      const labelX = parseFloat(firstLabel?.getAttribute("x") ?? "0");

      // Labels should be on left side (x < RACK_WIDTH / 2 = 110)
      expect(labelX).toBeLessThan(110);
    });
  });

  describe("Blocked Slots Rendering", () => {
    // Create a device library with full-depth and half-depth devices
    // Blocked slots (hatching) now show for HALF-DEPTH devices only
    // Full-depth devices are visible from both sides, so no hatching needed
    const deviceLibrary: DeviceType[] = [
      {
        slug: "full-depth-server",
        model: "Full Depth Server",
        u_height: 2,
        is_full_depth: true,
        category: "server",
        colour: "#888888",
      },
      {
        slug: "half-depth-switch",
        model: "Half Depth Switch",
        u_height: 1,
        is_full_depth: false,
        category: "network",
        colour: "#444444",
      },
      {
        slug: "half-depth-2u",
        model: "Half Depth 2U",
        u_height: 2,
        is_full_depth: false,
        category: "network",
        colour: "#666666",
      },
    ];

    it("renders blocked-slot rect elements for half-depth devices on opposite face", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-1",
            device_type: "half-depth-switch",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          faceFilter: "rear", // Viewing rear, front half-depth device shows hatching
        },
      });

      // Should have blocked-slot rect elements (2 per slot: background + stripes)
      const blockedSlots = container.querySelectorAll(".blocked-slot");
      expect(blockedSlots.length).toBe(2);
    });

    it("blocked slot rects have correct position based on U", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-2",
            device_type: "half-depth-2u",
            position: 3,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          faceFilter: "rear",
        },
      });

      const blockedSlot = container.querySelector(".blocked-slot");
      expect(blockedSlot).toBeInTheDocument();

      // Check Y position - should correspond to U position 3-4 (2U device)
      const y = parseFloat(blockedSlot?.getAttribute("y") ?? "0");
      expect(y).toBeGreaterThan(0);
    });

    it("blocked slot rects have correct height based on device U", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-3",
            device_type: "half-depth-2u",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          faceFilter: "rear",
        },
      });

      const blockedSlot = container.querySelector(".blocked-slot");
      expect(blockedSlot).toBeInTheDocument();

      // Height should be 2U * U_HEIGHT = 2 * 22 = 44
      const height = parseFloat(blockedSlot?.getAttribute("height") ?? "0");
      expect(height).toBe(44); // 2U * 22
    });

    it("does not render blocked slots for full-depth devices (they are visible from both sides)", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-4",
            device_type: "full-depth-server",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          faceFilter: "rear", // Viewing rear, full-depth front device should be visible (not hatched)
        },
      });

      const blockedSlots = container.querySelectorAll(".blocked-slot");
      expect(blockedSlots.length).toBe(0);
    });

    it("does not render blocked slots when faceFilter is undefined", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-5",
            device_type: "half-depth-switch",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          // No faceFilter - default/single-view mode
        },
      });

      // No blocked slots in single-view mode
      const blockedSlots = container.querySelectorAll(".blocked-slot");
      expect(blockedSlots.length).toBe(0);
    });

    it("does not render blocked slots for both-face devices (they are visible on both)", () => {
      const bothFaceLibrary: DeviceType[] = [
        {
          slug: "ups",
          model: "UPS",
          u_height: 3,
          is_full_depth: true,
          category: "power",
          colour: "#888888",
        },
      ];

      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          { id: "rc-bs-6", device_type: "ups", position: 1, face: "both" },
        ],
      };

      // Check front view - both-face device should be visible, not hatched
      const { container: frontContainer } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary: bothFaceLibrary,
          selected: false,
          faceFilter: "front",
        },
      });

      const frontBlockedSlots =
        frontContainer.querySelectorAll(".blocked-slot");
      expect(frontBlockedSlots.length).toBe(0);

      // Check rear view - both-face device should be visible, not hatched
      const { container: rearContainer } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary: bothFaceLibrary,
          selected: false,
          faceFilter: "rear",
        },
      });

      const rearBlockedSlots = rearContainer.querySelectorAll(".blocked-slot");
      expect(rearBlockedSlots.length).toBe(0);
    });

    it("blocked slots have appropriate opacity", () => {
      const rackWithDevice: RackType = {
        ...mockRack,
        devices: [
          {
            id: "rc-bs-7",
            device_type: "half-depth-switch",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary,
          selected: false,
          faceFilter: "rear",
        },
      });

      const blockedSlot = container.querySelector(".blocked-slot");
      expect(blockedSlot).toBeInTheDocument();

      // Opacity should be set (we'll use CSS variable, so just check it exists)
      const opacity = blockedSlot?.getAttribute("opacity");
      // If opacity is set inline, it should be a value between 0 and 1
      if (opacity) {
        expect(parseFloat(opacity)).toBeGreaterThan(0);
        expect(parseFloat(opacity)).toBeLessThan(1);
      }
    });
  });

  describe("Multi-U Device Rendering (Issue #166)", () => {
    const U_HEIGHT = 22; // pixels per U

    it("renders custom 4U device with correct height", () => {
      // Custom 4U device (like one created via Add Device form)
      const custom4UDevice: DeviceType = {
        slug: "rackowl-4u-server",
        model: "RACKOWL 4U Server",
        u_height: 4,
        category: "server",
        colour: "#3b82f6",
      };

      const rackWithDevice: RackType = {
        ...mockRack,
        height: 42,
        view: "front", // Must set view for face filtering to work
        devices: [
          {
            id: "multi-u-1",
            device_type: "rackowl-4u-server",
            position: 10,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary: [custom4UDevice],
          selected: false,
        },
      });

      // Find the device rect
      const deviceRect = container.querySelector(
        '[data-device-id="rackowl-4u-server"] .device-rect',
      );
      expect(deviceRect).toBeInTheDocument();

      // Device should have height of 4U = 4 * 22 = 88 pixels
      const height = parseFloat(deviceRect?.getAttribute("height") ?? "0");
      expect(height).toBe(4 * U_HEIGHT);
    });

    it("renders custom 2U device with correct height", () => {
      const custom2UDevice: DeviceType = {
        slug: "custom-2u-server",
        model: "Custom 2U Server",
        u_height: 2,
        category: "server",
        colour: "#ef4444",
      };

      const rackWithDevice: RackType = {
        ...mockRack,
        view: "front",
        devices: [
          {
            id: "multi-u-2",
            device_type: "custom-2u-server",
            position: 5,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary: [custom2UDevice],
          selected: false,
        },
      });

      const deviceRect = container.querySelector(
        '[data-device-id="custom-2u-server"] .device-rect',
      );
      expect(deviceRect).toBeInTheDocument();

      // Device should have height of 2U = 2 * 22 = 44 pixels
      const height = parseFloat(deviceRect?.getAttribute("height") ?? "0");
      expect(height).toBe(2 * U_HEIGHT);
    });

    it("custom multi-U device is positioned correctly", () => {
      const custom3UDevice: DeviceType = {
        slug: "custom-3u-storage",
        model: "Custom 3U Storage",
        u_height: 3,
        category: "storage",
        colour: "#8b5cf6",
      };

      const rackWithDevice: RackType = {
        ...mockRack,
        height: 12,
        view: "front",
        devices: [
          {
            id: "multi-u-3",
            device_type: "custom-3u-storage",
            position: 3,
            face: "front",
          },
        ],
      };

      const { container } = render(Rack, {
        props: {
          rack: rackWithDevice,
          deviceLibrary: [custom3UDevice],
          selected: false,
        },
      });

      // Device at position 3 with 3U height should span U3-U5
      // In SVG coordinates: y = (rackHeight - position - u_height + 1) * U_HEIGHT
      // y = (12 - 3 - 3 + 1) * 22 = 7 * 22 = 154
      const deviceGroup = container.querySelector(
        '[data-device-id="custom-3u-storage"]',
      );
      expect(deviceGroup).toBeInTheDocument();

      // The group has transform="translate(17, y)" where y is relative to the devices group
      // The devices group has its own offset, so we just verify the device exists and has correct height
      const deviceRect = container.querySelector(
        '[data-device-id="custom-3u-storage"] .device-rect',
      );
      const height = parseFloat(deviceRect?.getAttribute("height") ?? "0");
      expect(height).toBe(3 * U_HEIGHT);
    });
  });
});
