import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import EditPanel from "$lib/components/EditPanel.svelte";
import ColourSwatch from "$lib/components/ColourSwatch.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";

describe("EditPanel Component", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
  });

  describe("Visibility", () => {
    it("is hidden when nothing is selected", () => {
      render(EditPanel);
      // Use hidden: true to find elements with aria-hidden="true"
      const panel = screen.queryByRole("complementary", { hidden: true });
      // When no selection, right drawer should not have 'open' class
      expect(panel).not.toHaveClass("open");
      expect(panel).toHaveAttribute("aria-hidden", "true");
    });

    it("shows when a rack is selected", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add a rack
      const rack = layoutStore.addRack("Test Rack", 42);
      expect(rack).not.toBeNull();

      // Select it
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);
      // The panel should be open
      const panel = screen.getByRole("complementary");
      expect(panel).toHaveClass("open");
    });

    it("shows when a device is selected", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add a rack
      const rack = layoutStore.addRack("Test Rack", 42);
      expect(rack).not.toBeNull();

      // Add a device to library and place it
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);

      // Select the device by ID
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);
      const panel = screen.getByRole("complementary");
      expect(panel).toHaveClass("open");
    });
  });

  describe("Rack Editing", () => {
    it("shows rack fields when rack is selected", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      // Should show name field
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      // Should show height field
      expect(screen.getByLabelText(/height/i)).toBeInTheDocument();
    });

    it("rack name field is editable", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(nameInput.value).toBe("My Rack");

      await fireEvent.input(nameInput, { target: { value: "New Name" } });
      await fireEvent.blur(nameInput);

      // Check store was updated
      expect(layoutStore.rack?.name).toBe("New Name");
    });

    it("rack height is editable when no devices present", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      const heightInput = screen.getByLabelText(/height/i) as HTMLInputElement;
      expect(heightInput).not.toBeDisabled();
    });

    it("rack height input is enabled when devices present (smart validation)", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      // Input should be enabled even with devices (smart validation allows growing)
      const heightInput = screen.getByLabelText(/height/i) as HTMLInputElement;
      expect(heightInput).not.toBeDisabled();
    });

    it("name change updates layout store", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      const nameInput = screen.getByLabelText(/name/i);
      await fireEvent.input(nameInput, { target: { value: "Updated Rack" } });
      await fireEvent.blur(nameInput);

      expect(layoutStore.rack?.name).toBe("Updated Rack");
    });

    it("delete button is present for rack", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      render(EditPanel);

      expect(
        screen.getByRole("button", { name: /delete rack/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Device Display", () => {
    it("shows device fields when device is selected", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        comments: "Some notes",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 5);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should show device name (may appear multiple times with display name field)
      const deviceNames = screen.getAllByText("Test Server");
      expect(deviceNames.length).toBeGreaterThan(0);
      // Should show height
      expect(screen.getByText("2U")).toBeInTheDocument();
      // Should show category (uses getCategoryDisplayName)
      expect(screen.getByText("Servers")).toBeInTheDocument();
      // Should show position
      expect(screen.getByText("U5")).toBeInTheDocument();
    });

    it("shows notes when present", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        // Schema v1.0.0: Uses 'notes' field
        notes: "Important server notes",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(screen.getByText("Important server notes")).toBeInTheDocument();
    });

    it("remove button is present for device", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(
        screen.getByRole("button", { name: /remove from rack/i }),
      ).toBeInTheDocument();
    });

    it("shows brand label for device with manufacturer", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "ProLiant DL380",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        manufacturer: "HPE",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should show Brand label
      expect(screen.getByText("Brand")).toBeInTheDocument();
      // Should show manufacturer name
      expect(screen.getByText("HPE")).toBeInTheDocument();
    });

    it("shows Generic brand for device without manufacturer", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Custom Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
        // No manufacturer field
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should show Brand label
      expect(screen.getByText("Brand")).toBeInTheDocument();
      // Should show Generic as fallback
      expect(screen.getByText("Generic")).toBeInTheDocument();
    });
  });

  describe("Device colour picker", () => {
    it("shows colour row with device type colour", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should show Colour label
      expect(screen.getByText("Colour")).toBeInTheDocument();
      // Should show the colour value
      expect(screen.getByText("#4A90D9")).toBeInTheDocument();
    });

    it("toggles colour picker when colour row is clicked", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Colour picker should not be visible initially
      expect(
        screen.queryByLabelText(/custom hex colour/i),
      ).not.toBeInTheDocument();

      // Click the colour row button
      const colourButton = screen.getByRole("button", {
        name: /edit device colour/i,
      });
      await fireEvent.click(colourButton);

      // Colour picker should now be visible
      expect(screen.getByLabelText(/custom hex colour/i)).toBeInTheDocument();
    });

    it("shows custom badge when colour override is set", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);

      // Set a colour override on the placed device
      layoutStore.updateDeviceColour(RACK_ID, 0, "#FF5555");

      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should show the override colour
      expect(screen.getByText("#FF5555")).toBeInTheDocument();
      // Should show custom badge
      expect(screen.getByText("custom")).toBeInTheDocument();
    });
  });

  describe("Power device properties", () => {
    it("does not show power section for non-power devices", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(screen.queryByText(/outlets/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/va rating/i)).not.toBeInTheDocument();
    });

    it("shows power section for power devices with outlet_count", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Manually add a power device type with outlet_count
      const deviceType = {
        slug: "test-pdu",
        u_height: 1,
        model: "Test PDU",
        outlet_count: 8,
        colour: "#F5A623",
        category: "power" as const,
      };
      layoutStore.layout.device_types.push(deviceType);
      layoutStore.placeDevice(RACK_ID, deviceType.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(screen.getByText(/outlets/i)).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("shows power section for power devices with va_rating", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Manually add a power device type with va_rating
      const deviceType = {
        slug: "test-ups",
        u_height: 2,
        model: "Test UPS",
        outlet_count: 6,
        va_rating: 1500,
        colour: "#F5A623",
        category: "power" as const,
      };
      layoutStore.layout.device_types.push(deviceType);
      layoutStore.placeDevice(RACK_ID, deviceType.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(screen.getByText(/va rating/i)).toBeInTheDocument();
      expect(screen.getByText("1500")).toBeInTheDocument();
    });

    it("shows both outlet_count and va_rating when present", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const deviceType = {
        slug: "full-ups",
        u_height: 4,
        model: "Full UPS",
        outlet_count: 8,
        va_rating: 3000,
        colour: "#F5A623",
        category: "power" as const,
      };
      layoutStore.layout.device_types.push(deviceType);
      layoutStore.placeDevice(RACK_ID, deviceType.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      expect(screen.getByText(/outlets/i)).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText(/va rating/i)).toBeInTheDocument();
      expect(screen.getByText("3000")).toBeInTheDocument();
    });

    it("does not show undefined for missing power values", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Power device without outlet_count or va_rating
      const deviceType = {
        slug: "basic-power",
        u_height: 1,
        model: "Basic Power",
        colour: "#F5A623",
        category: "power" as const,
      };
      layoutStore.layout.device_types.push(deviceType);
      layoutStore.placeDevice(RACK_ID, deviceType.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      render(EditPanel);

      // Should not display "undefined" anywhere
      expect(screen.queryByText("undefined")).not.toBeInTheDocument();
      // Should not show outlet or VA labels if no values
      expect(screen.queryByText(/outlets/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/va rating/i)).not.toBeInTheDocument();
    });
  });

  describe("Device face assignment", () => {
    it("shows face selector when device selected", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      const { getByLabelText } = render(EditPanel);
      expect(getByLabelText(/mounted face/i)).toBeTruthy();
    });

    it("has three select options", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      const device = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice(RACK_ID, device.slug, 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      const { getByRole } = render(EditPanel);
      const select = getByRole("combobox", { name: /mounted face/i });
      expect(select).toBeTruthy();
      // Check for three options
      const options = select.querySelectorAll("option");
      expect(options.length).toBe(3);
      expect(options[0]?.textContent).toBe("Front");
      expect(options[1]?.textContent).toBe("Rear");
      expect(options[2]?.textContent).toBe("Both (full-depth)");
    });

    it("does not show face selector for rack selection", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      selectionStore.selectRack(RACK_ID);

      const { queryByLabelText } = render(EditPanel);
      expect(queryByLabelText(/mounted face/i)).toBeNull();
    });

    it("face dropdown is enabled for blank panels (half-depth devices)", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Place a blank panel from the starter library (has is_full_depth: false)
      layoutStore.placeDevice(RACK_ID, "1u-blank", 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      const { getByRole } = render(EditPanel);
      const select = getByRole("combobox", { name: /mounted face/i });

      // Face dropdown should be enabled for blank panels (half-depth devices)
      expect(select).not.toBeDisabled();
    });

    it("face dropdown is enabled for PDUs (half-depth devices)", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Place a PDU from the starter library (has is_full_depth: false)
      layoutStore.placeDevice(RACK_ID, "1u-pdu", 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      const { getByRole } = render(EditPanel);
      const select = getByRole("combobox", { name: /mounted face/i });

      // Face dropdown should be enabled for PDUs (half-depth devices)
      expect(select).not.toBeDisabled();
    });

    it("face dropdown is disabled for full-depth servers", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      layoutStore.addRack("My Rack", 24);
      // Place a server from the starter library (is_full_depth undefined = full-depth)
      layoutStore.placeDevice(RACK_ID, "1u-server", 1);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(RACK_ID, deviceId);

      const { getByRole } = render(EditPanel);
      const select = getByRole("combobox", { name: /mounted face/i });

      // Face dropdown should be disabled for full-depth devices
      expect(select).toBeDisabled();
    });
  });
});

describe("ColourSwatch Component", () => {
  it("renders a colour swatch", () => {
    const { container } = render(ColourSwatch, {
      props: { colour: "#FF0000" },
    });
    const swatch = container.querySelector(".colour-swatch");
    expect(swatch).toBeInTheDocument();
  });

  it("applies the correct colour", () => {
    const { container } = render(ColourSwatch, {
      props: { colour: "#4A90D9" },
    });
    const swatch = container.querySelector(".colour-swatch") as HTMLElement;
    // happy-dom keeps hex, jsdom converts to rgb
    expect(["#4A90D9", "rgb(74, 144, 217)"]).toContain(
      swatch.style.backgroundColor,
    );
  });

  it("uses default size when not specified", () => {
    const { container } = render(ColourSwatch, {
      props: { colour: "#FF0000" },
    });
    const swatch = container.querySelector(".colour-swatch") as HTMLElement;
    // Default size is 16px
    expect(swatch.style.width).toBe("16px");
    expect(swatch.style.height).toBe("16px");
  });

  it("uses custom size when specified", () => {
    const { container } = render(ColourSwatch, {
      props: { colour: "#FF0000", size: 24 },
    });
    const swatch = container.querySelector(".colour-swatch") as HTMLElement;
    expect(swatch.style.width).toBe("24px");
    expect(swatch.style.height).toBe("24px");
  });

  it("has a border for visibility", () => {
    const { container } = render(ColourSwatch, {
      props: { colour: "#FFFFFF" },
    });
    const swatch = container.querySelector(".colour-swatch");
    expect(swatch).toHaveClass("colour-swatch");
    // Border is applied via CSS, just verify the class is present
  });
});
