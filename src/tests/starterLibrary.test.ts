import { describe, it, expect } from "vitest";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { createLayout } from "$lib/utils/serialization";

describe("Starter Device Type Library", () => {
  describe("getStarterLibrary", () => {
    it("returns 43 generic device types", () => {
      const deviceTypes = getStarterLibrary();
      expect(deviceTypes).toHaveLength(43);
    });

    it("all categories have at least one starter device type", () => {
      const deviceTypes = getStarterLibrary();
      const categoriesWithDevices = new Set(deviceTypes.map((d) => d.category));

      // All categories should be represented
      expect(categoriesWithDevices.has("server")).toBe(true);
      expect(categoriesWithDevices.has("network")).toBe(true);
      expect(categoriesWithDevices.has("storage")).toBe(true);
      expect(categoriesWithDevices.has("power")).toBe(true);
      expect(categoriesWithDevices.has("patch-panel")).toBe(true);
      expect(categoriesWithDevices.has("kvm")).toBe(true);
      expect(categoriesWithDevices.has("av-media")).toBe(true);
      expect(categoriesWithDevices.has("cooling")).toBe(true);
      expect(categoriesWithDevices.has("shelf")).toBe(true);
      expect(categoriesWithDevices.has("blank")).toBe(true);
      expect(categoriesWithDevices.has("cable-management")).toBe(true);
    });

    it("all device types have valid properties", () => {
      const deviceTypes = getStarterLibrary();

      deviceTypes.forEach((deviceType) => {
        expect(deviceType.slug).toBeTruthy();
        expect(deviceType.u_height).toBeGreaterThanOrEqual(0.5);
        expect(deviceType.u_height).toBeLessThanOrEqual(42);
        expect(deviceType.colour).toBeTruthy();
        expect(deviceType.category).toBeTruthy();
      });
    });

    it("device type slugs are unique", () => {
      const deviceTypes = getStarterLibrary();
      const slugs = deviceTypes.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);

      expect(uniqueSlugs.size).toBe(slugs.length);
    });

    it("device types have correct category colours", () => {
      const deviceTypes = getStarterLibrary();

      deviceTypes.forEach((deviceType) => {
        expect(deviceType.colour).toBe(CATEGORY_COLOURS[deviceType.category]);
      });
    });

    it("device type slugs are kebab-case", () => {
      const deviceTypes = getStarterLibrary();

      deviceTypes.forEach((deviceType) => {
        expect(deviceType.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      });
    });

    it("no devices have manufacturer (all generic)", () => {
      const deviceTypes = getStarterLibrary();

      deviceTypes.forEach((deviceType) => {
        expect(deviceType.manufacturer).toBeUndefined();
      });
    });
  });

  describe("server category (4 items)", () => {
    it("includes Server (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Server" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("server");
    });

    it("includes Server (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Server" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("server");
    });

    it("includes Server (3U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Server" && d.u_height === 3,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("server");
    });

    it("includes Server (4U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Server" && d.u_height === 4,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("server");
    });
  });

  describe("network category (4 items)", () => {
    it("includes Switch (24-Port)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Switch (24-Port)");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("network");
    });

    it("includes Switch (48-Port)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Switch (48-Port)");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("network");
    });

    it("includes Router/Firewall (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Router/Firewall" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("network");
    });

    it("includes Router/Firewall (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Router/Firewall" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("network");
    });
  });

  describe("storage category (4 items)", () => {
    it("includes Storage (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Storage" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("storage");
    });

    it("includes Storage (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Storage" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("storage");
    });

    it("includes Storage (3U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Storage" && d.u_height === 3,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("storage");
    });

    it("includes Storage (4U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Storage" && d.u_height === 4,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("storage");
    });
  });

  describe("power category (4 items)", () => {
    it("includes PDU (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "PDU" && d.u_height === 1);
      expect(device).toBeDefined();
      expect(device?.category).toBe("power");
    });

    it("includes PDU (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "PDU" && d.u_height === 2);
      expect(device).toBeDefined();
      expect(device?.category).toBe("power");
    });

    it("includes UPS (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "UPS" && d.u_height === 2);
      expect(device).toBeDefined();
      expect(device?.category).toBe("power");
    });

    it("includes UPS (4U)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "UPS" && d.u_height === 4);
      expect(device).toBeDefined();
      expect(device?.category).toBe("power");
    });
  });

  describe("patch-panel category (3 items)", () => {
    it("includes Fiber Patch Panel", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Fiber Patch Panel");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("patch-panel");
    });

    it("includes Patch Panel (24-Port)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Patch Panel (24-Port)");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("patch-panel");
    });

    it("includes Patch Panel (48-Port)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Patch Panel (48-Port)");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(2);
      expect(device?.category).toBe("patch-panel");
    });
  });

  describe("kvm category (2 items)", () => {
    it("includes KVM Switch", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "KVM Switch");
      expect(device).toBeDefined();
      expect(device?.category).toBe("kvm");
    });

    it("includes Console Drawer", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Console Drawer");
      expect(device).toBeDefined();
      expect(device?.category).toBe("kvm");
    });
  });

  describe("av-media category (8 items)", () => {
    it("includes Amplifier (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Amplifier" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("av-media");
    });

    it("includes Amplifier (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Amplifier" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("av-media");
    });

    it("includes AV Receiver (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "AV Receiver" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("av-media");
    });

    it("includes Power Amplifier (3U)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Power Amplifier");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(3);
      expect(device?.category).toBe("av-media");
    });

    it("has 8 av-media devices total", () => {
      const library = getStarterLibrary();
      const avDevices = library.filter((d) => d.category === "av-media");
      expect(avDevices).toHaveLength(8);
    });
  });

  describe("cooling category (2 items)", () => {
    it("includes Fan Panel (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Fan Panel" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("cooling");
    });

    it("includes Fan Panel (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Fan Panel" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("cooling");
    });
  });

  describe("shelf category (4 items)", () => {
    it("includes Cantilever Shelf", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Cantilever Shelf");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("shelf");
    });

    it("includes Shelf (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Shelf" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("shelf");
    });

    it("includes Shelf (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Shelf" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("shelf");
    });

    it("includes Vented Shelf", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Vented Shelf");
      expect(device).toBeDefined();
      expect(device?.category).toBe("shelf");
    });

    it("shelf device types have Dracula comment colour", () => {
      const library = getStarterLibrary();
      const shelves = library.filter((d) => d.category === "shelf");

      shelves.forEach((shelf) => {
        expect(shelf.colour).toBe("#6272A4");
      });
    });
  });

  describe("blank category (5 items)", () => {
    it("includes Blank Panel (0.5U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 0.5,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("blank");
    });

    it("includes Blank Panel (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("blank");
    });

    it("includes Blank Panel (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("blank");
    });

    it("includes Blank Panel (3U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 3,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("blank");
    });

    it("includes Blank Panel (4U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 4,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("blank");
    });

    it("blank panels are half-depth (is_full_depth: false)", () => {
      const library = getStarterLibrary();
      const blanks = library.filter((d) => d.category === "blank");

      expect(blanks.length).toBe(5);
      blanks.forEach((blank) => {
        expect(blank.is_full_depth).toBe(false);
      });
    });
  });

  describe("cable-management category (3 items)", () => {
    it("includes Brush Panel", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Brush Panel");
      expect(device).toBeDefined();
      expect(device?.u_height).toBe(1);
      expect(device?.category).toBe("cable-management");
    });

    it("includes Cable Manager (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Cable Manager" && d.u_height === 1,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("cable-management");
    });

    it("includes Cable Manager (2U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Cable Manager" && d.u_height === 2,
      );
      expect(device).toBeDefined();
      expect(device?.category).toBe("cable-management");
    });

    it("cable-management devices have Dracula comment colour", () => {
      const library = getStarterLibrary();
      const cableDevices = library.filter(
        (d) => d.category === "cable-management",
      );

      expect(cableDevices).toHaveLength(3);
      cableDevices.forEach((device) => {
        expect(device.colour).toBe("#6272A4");
      });
    });
  });

  describe("slug generation", () => {
    it("generates correct slug for Router/Firewall (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Router/Firewall" && d.u_height === 1,
      );
      expect(device?.slug).toBe("1u-router-firewall");
    });

    it("generates correct slug for Switch (24-Port)", () => {
      const library = getStarterLibrary();
      const device = library.find((d) => d.model === "Switch (24-Port)");
      expect(device?.slug).toBe("24-port-switch");
    });

    it("generates correct slug for Blank Panel (0.5U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Blank Panel" && d.u_height === 0.5,
      );
      expect(device?.slug).toBe("0-5u-blank");
    });

    it("generates correct slug for Cable Manager (1U)", () => {
      const library = getStarterLibrary();
      const device = library.find(
        (d) => d.model === "Cable Manager" && d.u_height === 1,
      );
      expect(device?.slug).toBe("1u-cable-manager");
    });
  });

  describe("all devices have required properties", () => {
    it("every device has a slug", () => {
      const library = getStarterLibrary();
      library.forEach((device) => {
        expect(device.slug).toBeDefined();
        expect(device.slug.length).toBeGreaterThan(0);
      });
    });

    it("every device has u_height > 0", () => {
      const library = getStarterLibrary();
      library.forEach((device) => {
        expect(device.u_height).toBeGreaterThan(0);
      });
    });

    it("every device has a category color", () => {
      const library = getStarterLibrary();
      library.forEach((device) => {
        expect(device.colour).toBeDefined();
        expect(device.colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe("Layout integration", () => {
    it("new layout has empty device_types (starter library is runtime constant)", () => {
      const layout = createLayout();

      // device_types starts empty - starter library is a runtime constant
      expect(layout.device_types.length).toBe(0);
    });

    it("starter library contains only generic devices", () => {
      const starterLibrary = getStarterLibrary();

      // Library should have 43 generic devices
      expect(starterLibrary.length).toBe(43);
      expect(starterLibrary[0]?.slug).toBeTruthy();
    });

    it("starter device types have valid structure", () => {
      const starterLibrary = getStarterLibrary();
      const starterDeviceType = starterLibrary[0];

      expect(starterDeviceType).toBeDefined();
      expect(starterDeviceType!.slug).toBeTruthy();
      expect(starterDeviceType!.u_height).toBeGreaterThan(0);
      expect(starterDeviceType!.category).toBeTruthy();
    });
  });
});
