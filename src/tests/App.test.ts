import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/svelte";
import App from "../App.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import { clearSession } from "$lib/utils/session-storage";

describe("App Component", () => {
  beforeEach(() => {
    // Clear any autosaved session to prevent interference
    clearSession();
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    // Note: resetUIStore applies the theme to the document
    // Mark as started so WelcomeScreen is not shown (tests assume rack is visible)
    getLayoutStore().markStarted();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Layout Structure", () => {
    it("renders toolbar", () => {
      render(App);
      // Toolbar should exist with action buttons
      // 'Rackula' text appears in toolbar branding
      expect(screen.getByText("Rackula")).toBeInTheDocument();
      // And main action buttons in toolbar
      expect(
        screen.getByRole("button", { name: /new rack/i }),
      ).toBeInTheDocument();
    });

    it("renders canvas with rack (v0.2 always has a rack)", () => {
      const { container } = render(App);
      // v0.2: Canvas always shows rack, not welcome screen
      expect(container.querySelector(".rack-container")).toBeInTheDocument();
      expect(
        container.querySelector(".welcome-screen"),
      ).not.toBeInTheDocument();
    });

    it("renders with correct layout structure", () => {
      render(App);
      // Main container should exist
      const main = document.querySelector(".app-layout");
      expect(main).toBeInTheDocument();
    });
  });

  describe("Device Library Sidebar", () => {
    it("device library sidebar is always visible", () => {
      render(App);

      // Sidebar should always be visible (not a drawer that toggles)
      const sidebar = document.querySelector("aside.sidebar");
      expect(sidebar).toBeInTheDocument();
      expect(sidebar).toBeVisible();
    });

    it("sidebar contains DevicePalette", () => {
      render(App);

      // Look for DevicePalette content inside sidebar
      const sidebar = document.querySelector("aside.sidebar");
      expect(sidebar).toBeInTheDocument();

      // DevicePalette should be inside - look for category icons or device items
      const palette = sidebar?.querySelector(".device-palette");
      expect(palette).toBeInTheDocument();
    });

    it("there is no toggle button for device library in toolbar", () => {
      render(App);

      // There should be no button named exactly "Device Library" anymore
      // (there is still an "Import device library" button in the sidebar, which is different)
      const paletteBtn = screen.queryByRole("button", {
        name: /^device library$/i,
      });
      expect(paletteBtn).not.toBeInTheDocument();
    });

    it("main area has proper grid/flex layout structure", () => {
      render(App);

      // App main should exist with proper structure
      const appMain = document.querySelector(".app-main");
      expect(appMain).toBeInTheDocument();
      // Should have the class that enables the layout
      expect(appMain).toHaveClass("app-main");
    });

    it("canvas exists alongside sidebar in main area", () => {
      render(App);

      // Both sidebar and canvas should exist in the main area
      const appMain = document.querySelector(".app-main");
      expect(appMain).toBeInTheDocument();

      // Check that canvas exists
      const canvas = document.querySelector(".canvas");
      expect(canvas).toBeInTheDocument();
    });
  });

  describe("Edit Panel", () => {
    it("edit panel opens when rack selected", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add a rack first
      layoutStore.addRack("Test Rack", 42);

      render(App);

      // Initially closed
      const rightDrawer = document.querySelector(".drawer-right");
      expect(rightDrawer).not.toHaveClass("open");

      // Select the rack
      selectionStore.selectRack(RACK_ID);

      // Wait for the effect to open the drawer
      await waitFor(() => {
        expect(rightDrawer).toHaveClass("open");
      });
    });

    it("edit panel closes when selection cleared", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add and select a rack
      layoutStore.addRack("Test Rack", 42);
      selectionStore.selectRack(RACK_ID);

      render(App);

      const rightDrawer = document.querySelector(".drawer-right");

      // Should be open initially (due to selection)
      await waitFor(() => {
        expect(rightDrawer).toHaveClass("open");
      });

      // Clear selection
      selectionStore.clearSelection();

      // Should close
      await waitFor(() => {
        expect(rightDrawer).not.toHaveClass("open");
      });
    });
  });

  describe("Theme Toggle", () => {
    it("theme toggle changes theme", async () => {
      render(App);

      const themeBtn = screen.getByRole("button", { name: /toggle theme/i });

      // Default theme is dark
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      // Toggle to light
      await fireEvent.click(themeBtn);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");

      // Toggle back to dark
      await fireEvent.click(themeBtn);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  describe("Beforeunload Handler", () => {
    it("shows confirmation when dirty and leaving page", () => {
      const layoutStore = getLayoutStore();

      render(App);

      // Make a change to trigger dirty state
      layoutStore.addRack("Test Rack", 42);
      expect(layoutStore.isDirty).toBe(true);

      // Create a beforeunload event
      const event = new Event("beforeunload", { cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      // Dispatch it
      window.dispatchEvent(event);

      // Should have called preventDefault
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("does not show confirmation when not dirty", async () => {
      const layoutStore = getLayoutStore();

      render(App);

      // Wait for component to fully mount and onMount effects to complete
      await waitFor(
        () => {
          // Component should be rendered
          expect(
            screen.getByRole("button", { name: /new rack/i }),
          ).toBeInTheDocument();
        },
        { timeout: 1000 },
      );

      // Give extra time for onMount and any async effects to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // No changes made, should not be dirty
      expect(layoutStore.isDirty).toBe(false);

      // Create a beforeunload event
      const event = new Event("beforeunload", { cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      // Dispatch it
      window.dispatchEvent(event);

      // Should NOT have called preventDefault
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe("Welcome Screen / Fresh Start", () => {
    it("fresh start shows new rack form directly (not replace dialog)", async () => {
      // Don't call markStarted - simulating fresh start
      clearSession(); // Ensure no autosaved session
      resetLayoutStore();
      const layoutStore = getLayoutStore();

      // Before user starts, rackCount is 0
      expect(layoutStore.rackCount).toBe(0);
      expect(layoutStore.hasStarted).toBe(false);

      render(App);

      // Wait for component to mount
      await waitFor(
        () => {
          expect(
            screen.getByRole("button", { name: /new rack/i }),
          ).toBeInTheDocument();
        },
        { timeout: 1000 },
      );

      // Click the "New Rack" button in toolbar
      const newRackBtn = screen.getByRole("button", { name: /new rack/i });
      await fireEvent.click(newRackBtn);

      // Should open NewRackForm directly, NOT replace dialog
      await waitFor(
        () => {
          const dialog = screen.getByRole("dialog");
          expect(dialog).toBeInTheDocument();
          // NewRackForm has title "New Rack" and name input
          expect(dialog.querySelector(".dialog-title")).toHaveTextContent(
            "New Rack",
          );
        },
        { timeout: 1000 },
      );

      expect(screen.getByLabelText(/rack name/i)).toBeInTheDocument();

      // Replace dialog has "Replace Current Rack?" - should NOT be present
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).not.toMatch(/replace current rack/i);
    });

    it("auto-opens NewRackForm dialog on first load when no racks exist", async () => {
      // Don't call markStarted - simulating fresh start
      clearSession(); // Ensure no autosaved session
      resetLayoutStore();
      const layoutStore = getLayoutStore();

      expect(layoutStore.rackCount).toBe(0);

      render(App);

      // NewRackForm should auto-open without any user interaction
      // Increase timeout for CI environments
      await waitFor(
        () => {
          const dialog = screen.getByRole("dialog");
          expect(dialog).toBeInTheDocument();
          expect(dialog.querySelector(".dialog-title")).toHaveTextContent(
            "New Rack",
          );
        },
        { timeout: 3000 },
      );
    });

    it("shows WelcomeScreen behind auto-opened dialog", async () => {
      // Don't call markStarted - simulating fresh start
      clearSession(); // Ensure no autosaved session
      resetLayoutStore();

      const { container } = render(App);

      // Both WelcomeScreen and NewRackForm dialog should be in DOM
      // Increase timeout for CI environments
      await waitFor(
        () => {
          expect(screen.getByRole("dialog")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // WelcomeScreen should also be present (behind the dialog)
      expect(container.querySelector(".welcome-screen")).toBeInTheDocument();
    });

    it(
      "returns to WelcomeScreen when dialog is dismissed without creating rack",
      async () => {
        // Don't call markStarted - simulating fresh start
        clearSession(); // Ensure no autosaved session
        resetLayoutStore();

        const { container } = render(App);

        // Wait for dialog to auto-open (increase timeout for CI)
        await waitFor(
          () => {
            expect(screen.getByRole("dialog")).toBeInTheDocument();
          },
          { timeout: 3000 },
        );

        // Click Cancel button to dismiss
        const cancelBtn = screen.getByRole("button", { name: /cancel/i });
        await fireEvent.click(cancelBtn);

        // Dialog should be closed
        await waitFor(
          () => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
          },
          { timeout: 2000 },
        );

        // WelcomeScreen should still be visible
        expect(container.querySelector(".welcome-screen")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    it("can re-open dialog by clicking WelcomeScreen after dismissing", async () => {
      // Don't call markStarted - simulating fresh start
      clearSession(); // Ensure no autosaved session
      resetLayoutStore();

      const { container } = render(App);

      // Wait for dialog to auto-open (increase timeout for CI)
      await waitFor(
        () => {
          expect(screen.getByRole("dialog")).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Dismiss the dialog
      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      await fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Click the WelcomeScreen to re-open
      const welcomeScreen = container.querySelector(".welcome-screen");
      expect(welcomeScreen).toBeInTheDocument();
      await fireEvent.click(welcomeScreen!);

      // Dialog should re-open (increase timeout for CI)
      await waitFor(
        () => {
          const dialog = screen.getByRole("dialog");
          expect(dialog).toBeInTheDocument();
          expect(dialog.querySelector(".dialog-title")).toHaveTextContent(
            "New Rack",
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe("New Rack Action", () => {
    it("new rack button opens replace dialog (v0.2 always has a rack)", async () => {
      render(App);

      // Click the "New Rack" button in toolbar
      const newRackBtn = screen.getByRole("button", { name: /new rack/i });
      expect(newRackBtn).toBeInTheDocument();
      await fireEvent.click(newRackBtn);

      // v0.2: Since there's always a rack, clicking New Rack opens replace dialog first
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      // The dialog asks to replace or save first
      expect(dialog.textContent).toMatch(/replace/i);
    });

    it("replace flow opens new rack form (v0.2)", async () => {
      const layoutStore = getLayoutStore();

      render(App);

      // v0.2: always has 1 rack
      expect(layoutStore.rackCount).toBe(1);
      const originalName = layoutStore.rack?.name;

      // Click the "New Rack" button in toolbar
      const newRackBtn = screen.getByRole("button", { name: /new rack/i });
      await fireEvent.click(newRackBtn);

      // Click "Replace" in the confirmation dialog
      const replaceBtn = screen.getByRole("button", { name: /^replace$/i });
      await fireEvent.click(replaceBtn);

      // Now the NewRackForm dialog should be open
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog.querySelector(".dialog-title")).toHaveTextContent(
          "New Rack",
        );
      });

      // Fill out the form
      const nameInput = screen.getByLabelText(/rack name/i);
      await fireEvent.input(nameInput, { target: { value: "Test Rack" } });

      // Submit the form
      const createBtn = screen.getByRole("button", { name: /create/i });
      await fireEvent.click(createBtn);

      // v0.2: rack is replaced, still 1 rack
      expect(layoutStore.rackCount).toBe(1);
      expect(layoutStore.rack?.name).toBe("Test Rack");
      expect(layoutStore.rack?.name).not.toBe(originalName);
    });
  });

  describe("Delete Action", () => {
    it("delete button opens confirmation dialog", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add a rack
      layoutStore.addRack("Test Rack", 42);
      selectionStore.selectRack(RACK_ID);

      render(App);

      expect(layoutStore.rackCount).toBe(1);

      // Click delete button in toolbar
      const toolbarDeleteBtn = document.querySelector(
        '.toolbar-center button[aria-label="Delete"]',
      ) as HTMLButtonElement;
      expect(toolbarDeleteBtn).toBeInTheDocument();
      await fireEvent.click(toolbarDeleteBtn);

      // Confirmation dialog should open
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog.querySelector(".dialog-title")).toHaveTextContent(
        "Delete Rack",
      );
    });

    it("delete confirmation clears rack devices (v0.2 cannot remove the only rack)", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const RACK_ID = "rack-0";

      // Add a rack with a device
      layoutStore.addRack("Test Rack", 42);
      // Add a device to the rack (use starter library directly since layout.device_types is empty)
      const starterLibrary = getStarterLibrary();
      const device = starterLibrary[0];
      if (device) {
        layoutStore.placeDevice(RACK_ID, device.slug, 1);
      }
      selectionStore.selectRack(RACK_ID);

      render(App);

      // v0.2: always has 1 rack
      expect(layoutStore.rackCount).toBe(1);
      expect(layoutStore.rack.devices.length).toBeGreaterThan(0);

      // Click delete button in toolbar
      const toolbarDeleteBtn = document.querySelector(
        '.toolbar-center button[aria-label="Delete"]',
      ) as HTMLButtonElement;
      await fireEvent.click(toolbarDeleteBtn);

      // Confirm the deletion - find the button within the dialog
      const dialog = screen.getByRole("dialog");
      const confirmBtn = dialog.querySelector(
        ".btn-destructive",
      ) as HTMLButtonElement;
      expect(confirmBtn).toBeInTheDocument();
      await fireEvent.click(confirmBtn);

      // v0.2: rack is not deleted, but devices are cleared
      expect(layoutStore.rackCount).toBe(1);
      expect(layoutStore.rack.devices.length).toBe(0);
    });
  });
});
