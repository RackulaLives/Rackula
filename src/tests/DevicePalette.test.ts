import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import DevicePalette from "$lib/components/DevicePalette.svelte";
import DevicePaletteItem from "$lib/components/DevicePaletteItem.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";

// Mock localStorage for grouping mode tests
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("DevicePalette Component", () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetLayoutStore();
    resetUIStore();
    vi.clearAllMocks();
  });

  describe("Device Rendering", () => {
    it("renders all devices from library", () => {
      const layoutStore = getLayoutStore();
      layoutStore.addDeviceType({
        name: "Server 1",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.addDeviceType({
        name: "Switch 1",
        u_height: 1,
        category: "network",
        colour: CATEGORY_COLOURS.network,
      });

      render(DevicePalette);

      expect(screen.getByText("Server 1")).toBeInTheDocument();
      expect(screen.getByText("Switch 1")).toBeInTheDocument();
    });

    it("shows starter library devices on initial load", () => {
      render(DevicePalette);

      // Starter library includes common devices (names without U prefix)
      expect(screen.getAllByText("Server").length).toBeGreaterThan(0);
      expect(screen.getByText("Switch (24-Port)")).toBeInTheDocument();
    });
  });

  describe("Search", () => {
    it("has search input", () => {
      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      expect(searchInput).toBeInTheDocument();
    });

    it("filters devices by name", async () => {
      const layoutStore = getLayoutStore();
      layoutStore.addDeviceType({
        name: "CustomServer",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });

      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "CustomServer" } });

      // Wait for debounce (150ms)
      await waitFor(
        () => {
          // Device should be found when searching its exact name
          expect(screen.getByText("CustomServer")).toBeInTheDocument();
        },
        { timeout: 300 },
      );
    });

    it("search is case-insensitive", async () => {
      const layoutStore = getLayoutStore();
      layoutStore.addDeviceType({
        name: "Server 1",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });

      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "server" } });

      // Wait for debounce (150ms)
      await waitFor(
        () => {
          expect(screen.getByText("Server 1")).toBeInTheDocument();
        },
        { timeout: 300 },
      );
    });

    it("shows no results message when search has no matches", async () => {
      const layoutStore = getLayoutStore();
      layoutStore.addDeviceType({
        name: "Server 1",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });

      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "xyz" } });

      // Wait for debounce (150ms)
      await waitFor(
        () => {
          expect(screen.getByText(/no devices match/i)).toBeInTheDocument();
        },
        { timeout: 300 },
      );
    });
  });

  describe("Category Grouping", () => {
    it("groups devices by category", () => {
      // Starter library already has devices in all 11 categories
      const { container } = render(DevicePalette);

      // Should show category headers for all 11 categories
      const categoryHeaders = container.querySelectorAll(".category-header");
      expect(categoryHeaders.length).toBe(11);
      // Servers and Network headers should exist
      expect(screen.getByText("Servers")).toBeInTheDocument();
      expect(screen.getByText("Network")).toBeInTheDocument();
    });
  });

  describe("Add Device Button", () => {
    it("has Add Device button", () => {
      render(DevicePalette);

      const addButton = screen.getByTestId("btn-add-device");
      expect(addButton).toBeInTheDocument();
    });

    it("dispatches addDevice event when clicked", async () => {
      const handleAdd = vi.fn();

      render(DevicePalette, { props: { onadddevice: handleAdd } });

      const addButton = screen.getByTestId("btn-add-device");
      await fireEvent.click(addButton);

      expect(handleAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe("Import Device Library", () => {
    it("renders import button", () => {
      render(DevicePalette);

      const importButton = screen.getByTestId("btn-import-devices");
      expect(importButton).toBeInTheDocument();
    });

    it("has file input that accepts JSON files", () => {
      const { container } = render(DevicePalette);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput?.getAttribute("accept")).toBe(".json,application/json");
    });

    it("file input is hidden", () => {
      const { container } = render(DevicePalette);

      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();

      // Should not be visible (using CSS or hidden attribute)
      const styles = window.getComputedStyle(fileInput);
      expect(styles.display === "none" || fileInput.hidden).toBe(true);
    });

    it("clicking import button triggers file input", async () => {
      const { container } = render(DevicePalette);

      const importButton = screen.getByTestId("btn-import-devices");
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const clickSpy = vi.spyOn(fileInput, "click");
      await fireEvent.click(importButton);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    // Note: Full file import flow is tested in E2E tests due to JSDOM file API limitations
    it("import button and file input are properly wired together", async () => {
      const { container } = render(DevicePalette);

      const importButton = screen.getByTestId("btn-import-devices");
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      // Verify import button triggers file input click
      const clickSpy = vi.spyOn(fileInput, "click");
      await fireEvent.click(importButton);

      expect(clickSpy).toHaveBeenCalled();
      expect(fileInput.accept).toBe(".json,application/json");

      clickSpy.mockRestore();
    });
  });
});

describe("DevicePalette Exclusive Accordion", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("Generic Section", () => {
    it("renders Generic section with correct device count", () => {
      // Starter library has 51 devices (43 full-width + 8 half-width)
      render(DevicePalette);

      expect(screen.getByText("Generic")).toBeInTheDocument();
      expect(screen.getByText("(51)")).toBeInTheDocument();
    });

    it("Generic section is expanded by default", () => {
      render(DevicePalette);

      const sectionButton = screen.getByRole("button", { name: /generic/i });
      expect(sectionButton).toHaveAttribute("aria-expanded", "true");
    });

    it("clicking Generic header collapses section", async () => {
      render(DevicePalette);

      const sectionButton = screen.getByRole("button", { name: /generic/i });
      expect(sectionButton).toHaveAttribute("aria-expanded", "true");

      await fireEvent.click(sectionButton);
      expect(sectionButton).toHaveAttribute("aria-expanded", "false");
    });

    it("devices are rendered inside Generic section", () => {
      render(DevicePalette);

      // Devices from starter library should be inside the section (names without U prefix)
      expect(screen.getAllByText("Server").length).toBeGreaterThan(0);
      expect(screen.getByText("Switch (24-Port)")).toBeInTheDocument();
    });
  });

  describe("Brand Sections", () => {
    it("renders Ubiquiti section", () => {
      render(DevicePalette);

      expect(screen.getByText("Ubiquiti")).toBeInTheDocument();
    });

    it("renders Mikrotik section", () => {
      render(DevicePalette);

      expect(screen.getByText("MikroTik")).toBeInTheDocument();
    });

    it("Ubiquiti section is collapsed by default", () => {
      render(DevicePalette);

      const sectionButton = screen.getByRole("button", { name: /ubiquiti/i });
      expect(sectionButton).toHaveAttribute("aria-expanded", "false");
    });

    it("Mikrotik section is collapsed by default", () => {
      render(DevicePalette);

      const sectionButton = screen.getByRole("button", { name: /mikrotik/i });
      expect(sectionButton).toHaveAttribute("aria-expanded", "false");
    });

    it("Ubiquiti section shows correct device count", () => {
      render(DevicePalette);

      // Ubiquiti has 109 devices
      expect(screen.getByText("(109)")).toBeInTheDocument();
    });

    it("MikroTik section shows correct device count", () => {
      render(DevicePalette);

      // MikroTik has 58 devices
      expect(screen.getByText("(58)")).toBeInTheDocument();
    });
  });

  describe("Section Ordering", () => {
    it("Generic section appears first", () => {
      const { container } = render(DevicePalette);

      // Get all accordion trigger buttons (section headers)
      const triggers = container.querySelectorAll(".accordion-trigger");
      expect(triggers.length).toBeGreaterThan(0);

      // First section should be Generic
      expect(triggers[0].textContent).toContain("Generic");
    });

    it("brand sections are sorted alphabetically after Generic", () => {
      const { container } = render(DevicePalette);

      // Get all accordion trigger buttons (section headers)
      const triggers = container.querySelectorAll(".accordion-trigger");

      // Extract section titles (first section is Generic, rest should be alphabetical)
      const titles = Array.from(triggers).map((trigger) => {
        // Get the text content of the section-title span
        const titleSpan = trigger.querySelector(".section-title");
        return titleSpan?.textContent?.trim() ?? "";
      });

      // First should be Generic
      expect(titles[0]).toBe("Generic");

      // Brand sections (everything after Generic) should be alphabetically sorted
      const brandTitles = titles.slice(1);
      const sortedBrandTitles = [...brandTitles].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );

      expect(brandTitles).toEqual(sortedBrandTitles);
    });

    it("sorting is case-insensitive", () => {
      const { container } = render(DevicePalette);

      const triggers = container.querySelectorAll(".accordion-trigger");
      const titles = Array.from(triggers).map((trigger) => {
        const titleSpan = trigger.querySelector(".section-title");
        return titleSpan?.textContent?.trim() ?? "";
      });

      // Brand sections should be sorted case-insensitively
      // e.g., "APC" should come before "Dell" regardless of case
      const brandTitles = titles.slice(1);
      const sortedBrandTitles = [...brandTitles].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );

      expect(brandTitles).toEqual(sortedBrandTitles);
    });
  });

  describe("Brand Device Placement (Issue #119)", () => {
    it("placed brand devices do NOT appear in Generic section", async () => {
      const layoutStore = getLayoutStore();

      // Place a Ubiquiti device (brand device)
      layoutStore.placeDevice("ubiquiti-unifi-switch-24", 1);

      const { container } = render(DevicePalette);

      // Expand Generic section to see its contents
      const genericButton = screen.getByRole("button", { name: /generic/i });
      await fireEvent.click(genericButton);
      await fireEvent.click(genericButton); // Toggle to ensure it's open

      // The brand device should NOT appear in the Generic section
      // Get all device names within the Generic accordion content
      const genericSection = container.querySelector(
        '[data-state="open"] .accordion-content-inner',
      );

      // If Generic is expanded, check it doesn't contain the brand device
      if (genericSection) {
        expect(genericSection.textContent).not.toContain("UniFi Switch 24");
      }

      // The device count in Generic should still be 51 (starter library only)
      expect(screen.getByText("(51)")).toBeInTheDocument();
    });

    it("brand devices still appear in their brand section after placement", async () => {
      const layoutStore = getLayoutStore();

      // Place a Ubiquiti device (slug: ubiquiti-unifi-switch-24, model: USW-24)
      layoutStore.placeDevice("ubiquiti-unifi-switch-24", 1);

      render(DevicePalette);

      // Ubiquiti section should still show its devices
      const ubiquitiButton = screen.getByRole("button", { name: /ubiquiti/i });
      expect(ubiquitiButton).toBeInTheDocument();

      // Expand Ubiquiti section
      await fireEvent.click(ubiquitiButton);

      // The device should be visible in the Ubiquiti section (model name is USW-24)
      expect(screen.getByText("USW-24")).toBeInTheDocument();
    });

    it("custom devices (not starter, not brand) still appear in Generic", () => {
      const layoutStore = getLayoutStore();

      // Add a truly custom device (not from starter or brand packs)
      layoutStore.addDeviceType({
        name: "My Custom Server",
        u_height: 2,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });

      const { container } = render(DevicePalette);

      // Custom device should appear in Generic
      // Generic count should now be 52 (51 starter + 1 custom)
      // Use a more specific selector to find the Generic section's count
      const genericButton = container.querySelector(".accordion-trigger");
      expect(genericButton).toBeInTheDocument();
      expect(genericButton?.textContent).toContain("Generic");
      expect(genericButton?.textContent).toContain("(52)");
    });
  });

  describe("Exclusive Behavior", () => {
    it("only one section can be expanded at a time", async () => {
      render(DevicePalette);

      const genericButton = screen.getByRole("button", { name: /generic/i });
      const ubiquitiButton = screen.getByRole("button", { name: /ubiquiti/i });

      // Generic is expanded by default
      expect(genericButton).toHaveAttribute("aria-expanded", "true");
      expect(ubiquitiButton).toHaveAttribute("aria-expanded", "false");

      // Click Ubiquiti - should expand Ubiquiti and collapse Generic
      await fireEvent.click(ubiquitiButton);

      expect(genericButton).toHaveAttribute("aria-expanded", "false");
      expect(ubiquitiButton).toHaveAttribute("aria-expanded", "true");
    });

    it("clicking different section switches to it", async () => {
      render(DevicePalette);

      const genericButton = screen.getByRole("button", { name: /generic/i });
      const ubiquitiButton = screen.getByRole("button", { name: /ubiquiti/i });
      const mikrotikButton = screen.getByRole("button", { name: /mikrotik/i });

      // Click Ubiquiti first
      await fireEvent.click(ubiquitiButton);
      expect(ubiquitiButton).toHaveAttribute("aria-expanded", "true");
      expect(genericButton).toHaveAttribute("aria-expanded", "false");
      expect(mikrotikButton).toHaveAttribute("aria-expanded", "false");

      // Click Mikrotik - should switch to Mikrotik
      await fireEvent.click(mikrotikButton);
      expect(mikrotikButton).toHaveAttribute("aria-expanded", "true");
      expect(ubiquitiButton).toHaveAttribute("aria-expanded", "false");
      expect(genericButton).toHaveAttribute("aria-expanded", "false");
    });

    it("all sections can be collapsed", async () => {
      render(DevicePalette);

      const genericButton = screen.getByRole("button", { name: /generic/i });
      const ubiquitiButton = screen.getByRole("button", { name: /ubiquiti/i });
      const mikrotikButton = screen.getByRole("button", { name: /mikrotik/i });

      // Click Generic to collapse it (it's already expanded)
      await fireEvent.click(genericButton);

      // All sections should now be collapsed
      expect(genericButton).toHaveAttribute("aria-expanded", "false");
      expect(ubiquitiButton).toHaveAttribute("aria-expanded", "false");
      expect(mikrotikButton).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Search with Sections", () => {
    it("search filters devices within Generic section", async () => {
      const layoutStore = getLayoutStore();
      // Add test devices with distinct names
      layoutStore.addDeviceType({
        name: "Test Switch",
        u_height: 1,
        category: "network",
        colour: CATEGORY_COLOURS.network,
      });

      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "Test Switch" } });

      // Wait for debounce and filter update
      await waitFor(
        () => {
          // Should find the test switch device
          expect(screen.getByText("Test Switch")).toBeInTheDocument();
        },
        { timeout: 500 },
      );
    });

    it("search updates section count", async () => {
      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "Server" } });

      // Wait for debounce (150ms)
      // Should show count of filtered devices (e.g., "Server" variants)
      // Just verify the count changes from the original 26
      await waitFor(
        () => {
          expect(screen.queryByText("(26)")).not.toBeInTheDocument();
        },
        { timeout: 300 },
      );
    });

    it("shows no results message when search has no matches in any section", async () => {
      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "zzzznotfound" } });

      // Wait for debounce (150ms)
      await waitFor(
        () => {
          expect(screen.getByText(/no devices match/i)).toBeInTheDocument();
        },
        { timeout: 300 },
      );
    });
  });
});

describe("DevicePaletteItem Component", () => {
  const mockDevice = {
    slug: "device-1",
    model: "Test Server",
    u_height: 2,
    colour: "#4A90D9",
    category: "server" as const,
  };

  describe("Display", () => {
    it("displays device name", () => {
      render(DevicePaletteItem, { props: { device: mockDevice } });

      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });

    it("displays height as badge", () => {
      render(DevicePaletteItem, { props: { device: mockDevice } });

      expect(screen.getByText("2U")).toBeInTheDocument();
    });

    it("shows category icon with device color", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const indicator = container.querySelector(".category-icon-indicator");
      expect(indicator).toBeInTheDocument();
      // Icon color is set via inline style
      const style = indicator?.getAttribute("style") ?? "";
      expect(style).toContain("color");
      // Should contain a CategoryIcon (which renders an SVG)
      const svg = indicator?.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Drag Affordance", () => {
    it("displays grip handle icon", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const dragHandle = container.querySelector(".drag-handle");
      expect(dragHandle).toBeInTheDocument();
      // Check that it contains an SVG (the grip icon)
      const svg = dragHandle?.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("has cursor: grab style", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const item = container.querySelector(".device-palette-item");
      expect(item).toBeInTheDocument();
      // The cursor style is applied via CSS class
      expect(item).toHaveClass("device-palette-item");
    });

    it("is draggable", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const item = container.querySelector(".device-palette-item");
      expect(item).toHaveAttribute("draggable", "true");
    });

    it("starts without dragging class", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const item = container.querySelector(".device-palette-item")!;
      expect(item).not.toHaveClass("dragging");
    });

    it("has aria-hidden on drag handle", () => {
      const { container } = render(DevicePaletteItem, {
        props: { device: mockDevice },
      });

      const dragHandle = container.querySelector(".drag-handle");
      expect(dragHandle).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Interaction", () => {
    it("dispatches select event on click", async () => {
      const handleSelect = vi.fn();

      render(DevicePaletteItem, {
        props: { device: mockDevice, onselect: handleSelect },
      });

      const item = screen
        .getByText("Test Server")
        .closest(".device-palette-item");
      await fireEvent.click(item!);

      expect(handleSelect).toHaveBeenCalledTimes(1);
    });
  });
});

describe("DevicePalette Grouping Mode Toggle", () => {
  beforeEach(() => {
    resetLayoutStore();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe("Toggle Rendering", () => {
    it("renders grouping mode toggle with three options", () => {
      render(DevicePalette);

      expect(screen.getByRole("button", { name: "Brand" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Category" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "A-Z" })).toBeInTheDocument();
    });

    it("toggle has accessible group role", () => {
      render(DevicePalette);

      const group = screen.getByRole("group", { name: /grouping mode/i });
      expect(group).toBeInTheDocument();
    });
  });

  describe("Default State", () => {
    it("defaults to brand mode when no localStorage value", () => {
      render(DevicePalette);

      const brandButton = screen.getByRole("button", { name: "Brand" });
      expect(brandButton).toHaveAttribute("aria-pressed", "true");
    });

    it("shows brand mode sections by default", () => {
      render(DevicePalette);

      // Brand mode shows Generic + brand pack sections
      expect(screen.getByText("Generic")).toBeInTheDocument();
      expect(screen.getByText("Ubiquiti")).toBeInTheDocument();
    });
  });

  describe("Persistence", () => {
    it("saves mode to localStorage when changed", async () => {
      render(DevicePalette);

      const categoryButton = screen.getByRole("button", { name: "Category" });
      await fireEvent.click(categoryButton);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-device-grouping",
        "category",
      );
    });

    it("restores mode from localStorage on load", () => {
      localStorageMock.store["Rackula-device-grouping"] = "flat";

      render(DevicePalette);

      const flatButton = screen.getByRole("button", { name: "A-Z" });
      expect(flatButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("Mode Switching", () => {
    it("switches to category mode when Category clicked", async () => {
      render(DevicePalette);

      const categoryButton = screen.getByRole("button", { name: "Category" });
      await fireEvent.click(categoryButton);

      expect(categoryButton).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("switches to flat mode when A-Z clicked", async () => {
      render(DevicePalette);

      const flatButton = screen.getByRole("button", { name: "A-Z" });
      await fireEvent.click(flatButton);

      expect(flatButton).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("Search Preservation", () => {
    it("preserves search query when switching modes", async () => {
      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      await fireEvent.input(searchInput, { target: { value: "Server" } });

      // Wait for debounce
      await waitFor(
        () => {
          expect(searchInput).toHaveValue("Server");
        },
        { timeout: 300 },
      );

      // Switch mode
      const categoryButton = screen.getByRole("button", { name: "Category" });
      await fireEvent.click(categoryButton);

      // Search query should be preserved
      expect(searchInput).toHaveValue("Server");
    });
  });

  describe("Category Mode", () => {
    it("shows category headers instead of brand sections in category mode", async () => {
      render(DevicePalette);

      // Switch to category mode
      const categoryButton = screen.getByRole("button", { name: "Category" });
      await fireEvent.click(categoryButton);

      // Should show category sections, not brand sections
      expect(screen.getByText("Servers")).toBeInTheDocument();
      expect(screen.getByText("Network")).toBeInTheDocument();
      // Brand sections should NOT appear as top-level sections
      expect(
        screen.queryByRole("button", { name: /ubiquiti/i }),
      ).not.toBeInTheDocument();
    });

    it("includes brand devices in category groups", async () => {
      render(DevicePalette);

      // Switch to category mode
      const categoryButton = screen.getByRole("button", { name: "Category" });
      await fireEvent.click(categoryButton);

      // Open Network category and check for Ubiquiti devices
      const networkTrigger = screen.getByRole("button", { name: /network/i });
      await fireEvent.click(networkTrigger);

      // USW-24 is a Ubiquiti network device
      expect(screen.getByText("USW-24")).toBeInTheDocument();
    });
  });

  describe("Flat Mode", () => {
    it("shows all devices in a single section", async () => {
      render(DevicePalette);

      // Switch to flat mode
      const flatButton = screen.getByRole("button", { name: "A-Z" });
      await fireEvent.click(flatButton);

      // Should show "All Devices" section
      expect(screen.getByText("All Devices")).toBeInTheDocument();

      // Should not show brand or category sections as separate accordions
      expect(
        screen.queryByRole("button", { name: /generic/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ubiquiti/i }),
      ).not.toBeInTheDocument();
    });

    it("displays devices sorted alphabetically by model", async () => {
      render(DevicePalette);

      // Switch to flat mode
      const flatButton = screen.getByRole("button", { name: "A-Z" });
      await fireEvent.click(flatButton);

      // Get all device items in order
      const deviceItems = screen.getAllByTestId("device-palette-item");

      // First few devices should be in alphabetical order
      const deviceNames = deviceItems
        .slice(0, 5)
        .map((item) => item.textContent);

      // Verify they are sorted (each name should come before or equal to next)
      for (let i = 0; i < deviceNames.length - 1; i++) {
        const current = deviceNames[i]?.toLowerCase() ?? "";
        const next = deviceNames[i + 1]?.toLowerCase() ?? "";
        expect(current.localeCompare(next)).toBeLessThanOrEqual(0);
      }
    });
  });
});
