/**
 * RackEditSheet Component Tests
 * Mobile bottom sheet for rack editing with feature parity to EditPanel
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import RackEditSheet from "$lib/components/RackEditSheet.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { createTestRack } from "./factories";

describe("RackEditSheet Component", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    getLayoutStore().markStarted();
  });

  describe("Form Fields", () => {
    it("renders rack name input with current value", () => {
      const rack = createTestRack({ name: "My Server Rack" });
      render(RackEditSheet, { props: { rack } });

      const nameInput = screen.getByLabelText("Name");
      expect(nameInput).toBeInTheDocument();
      expect(nameInput).toHaveValue("My Server Rack");
    });

    it("renders rack height input with current value", () => {
      const rack = createTestRack({ height: 42 });
      render(RackEditSheet, { props: { rack } });

      const heightInput = screen.getByLabelText("Height");
      expect(heightInput).toBeInTheDocument();
      expect(heightInput).toHaveValue(42);
    });

    it("renders notes textarea", () => {
      const rack = createTestRack({ notes: "Test notes" });
      render(RackEditSheet, { props: { rack } });

      const notesInput = screen.getByLabelText("Notes");
      expect(notesInput).toBeInTheDocument();
      expect(notesInput).toHaveValue("Test notes");
    });

    it("renders empty notes when rack has no notes", () => {
      const rack = createTestRack({ notes: undefined });
      render(RackEditSheet, { props: { rack } });

      const notesInput = screen.getByLabelText("Notes");
      expect(notesInput).toHaveValue("");
    });
  });

  describe("Height Presets", () => {
    it("renders common height preset buttons", () => {
      const rack = createTestRack();
      render(RackEditSheet, { props: { rack } });

      // Common rack heights from COMMON_RACK_HEIGHTS: [12, 18, 24, 42]
      expect(screen.getByRole("button", { name: "12U" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "18U" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "24U" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "42U" })).toBeInTheDocument();
    });

    it("marks current height preset as active", () => {
      const rack = createTestRack({ height: 42 });
      render(RackEditSheet, { props: { rack } });

      const activePreset = screen.getByRole("button", { name: "42U" });
      expect(activePreset).toHaveClass("active");
    });

    it("shows error when height change would conflict with devices", async () => {
      // Set up layout store with rack and device at high position
      const layoutStore = getLayoutStore();
      layoutStore.addRack("Test Rack", 42);

      // Add a device type and place it at position 20
      const deviceType = layoutStore.addDeviceType({
        name: "Server",
        u_height: 2,
        category: "server",
        colour: "#4A90D9",
      });
      layoutStore.placeDevice("rack-0", deviceType.slug, 20, "front");

      // Render with the rack from the store
      render(RackEditSheet, { props: { rack: layoutStore.rack! } });

      // Try to click 12U preset (should fail - device at position 20 would be out of bounds)
      const preset12 = screen.getByRole("button", { name: "12U" });
      await fireEvent.click(preset12);

      // Should show error message about conflict
      expect(screen.getByText(/cannot resize/i)).toBeInTheDocument();

      // Height input should retain original value
      const heightInput = screen.getByLabelText("Height");
      expect(heightInput).toHaveValue(42);
    });
  });

  describe("U Numbering Toggle", () => {
    it("renders U numbering control", () => {
      const rack = createTestRack();
      render(RackEditSheet, { props: { rack } });

      expect(screen.getByText("U Numbering")).toBeInTheDocument();
      expect(screen.getByText("U1 at bottom")).toBeInTheDocument();
      expect(screen.getByText("U1 at top")).toBeInTheDocument();
    });
  });

  describe("Show Rear View Toggle", () => {
    it("renders show rear view control", () => {
      const rack = createTestRack();
      render(RackEditSheet, { props: { rack } });

      expect(screen.getByText("Show Rear View")).toBeInTheDocument();
      expect(screen.getByText("Show")).toBeInTheDocument();
      expect(screen.getByText("Hide")).toBeInTheDocument();
    });
  });

  describe("Clear Rack Action", () => {
    it("renders clear rack button with device count", () => {
      const rack = createTestRack({
        devices: [
          { device_type: "server-1", position: 1, face: "front" },
          { device_type: "server-2", position: 3, face: "front" },
        ],
      });
      render(RackEditSheet, { props: { rack } });

      const clearButton = screen.getByRole("button", {
        name: /clear all devices from rack/i,
      });
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toHaveTextContent("2 devices");
    });

    it("disables clear button when rack is empty", () => {
      const rack = createTestRack({ devices: [] });
      render(RackEditSheet, { props: { rack } });

      const clearButton = screen.getByRole("button", {
        name: /clear all devices from rack/i,
      });
      expect(clearButton).toBeDisabled();
    });

    it("enables clear button when rack has devices", () => {
      const rack = createTestRack({
        devices: [{ device_type: "server-1", position: 1, face: "front" }],
      });
      render(RackEditSheet, { props: { rack } });

      const clearButton = screen.getByRole("button", {
        name: /clear all devices from rack/i,
      });
      expect(clearButton).not.toBeDisabled();
    });

    it("shows confirmation dialog when clear button is clicked", async () => {
      const rack = createTestRack({
        devices: [{ device_type: "server-1", position: 1, face: "front" }],
      });
      render(RackEditSheet, { props: { rack } });

      const clearButton = screen.getByRole("button", {
        name: /clear all devices from rack/i,
      });
      await fireEvent.click(clearButton);

      // Confirmation dialog should appear
      expect(screen.getByText("Clear Rack")).toBeInTheDocument();
      expect(screen.getByText(/remove all 1 device/i)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper form labels", () => {
      const rack = createTestRack();
      render(RackEditSheet, { props: { rack } });

      expect(screen.getByLabelText("Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Height")).toBeInTheDocument();
      expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    });

    it("clear button has accessible name", () => {
      const rack = createTestRack({ devices: [] });
      render(RackEditSheet, { props: { rack } });

      const clearButton = screen.getByRole("button", {
        name: /clear all devices from rack/i,
      });
      expect(clearButton).toBeInTheDocument();
    });
  });

  describe("Feature Parity", () => {
    it("includes all EditPanel rack editing features", () => {
      const rack = createTestRack();
      render(RackEditSheet, { props: { rack } });

      // Name editing
      expect(screen.getByLabelText("Name")).toBeInTheDocument();

      // Height editing with presets
      expect(screen.getByLabelText("Height")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "42U" })).toBeInTheDocument();

      // U numbering direction
      expect(screen.getByText("U Numbering")).toBeInTheDocument();

      // Show rear view toggle
      expect(screen.getByText("Show Rear View")).toBeInTheDocument();

      // Notes
      expect(screen.getByLabelText("Notes")).toBeInTheDocument();

      // Clear rack action (using aria-label)
      expect(
        screen.getByRole("button", { name: /clear all devices from rack/i }),
      ).toBeInTheDocument();
    });
  });
});
