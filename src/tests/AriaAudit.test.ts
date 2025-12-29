import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Toolbar from "$lib/components/Toolbar.svelte";
import Dialog from "$lib/components/Dialog.svelte";
import Drawer from "$lib/components/Drawer.svelte";
import DrawerHeader from "$lib/components/DrawerHeader.svelte";
import ToolbarButton from "$lib/components/ToolbarButton.svelte";
import DevicePalette from "$lib/components/DevicePalette.svelte";
import Canvas from "$lib/components/Canvas.svelte";

describe("ARIA Labels Audit", () => {
  describe("Toolbar buttons", () => {
    it("all toolbar buttons have aria-label", () => {
      const { container } = render(Toolbar);

      const buttons = container.querySelectorAll("button");
      buttons.forEach((button) => {
        // Every button should have aria-label
        expect(button).toHaveAttribute("aria-label");
        // aria-label should not be empty
        expect(button.getAttribute("aria-label")?.trim()).not.toBe("");
      });
    });

    // Note: Device Library toggle button was removed in v0.1.0
    // The sidebar is now always visible (not toggleable)
  });

  describe("ToolbarButton component", () => {
    it("ToolbarButton has aria-label from label prop", () => {
      render(ToolbarButton, { props: { label: "Test Action" } });

      const button = screen.getByRole("button", { name: "Test Action" });
      expect(button).toHaveAttribute("aria-label", "Test Action");
    });

    it("ToolbarButton has aria-pressed when toggle", () => {
      render(ToolbarButton, { props: { label: "Toggle", active: true } });

      const button = screen.getByRole("button", { name: "Toggle" });
      expect(button).toHaveAttribute("aria-pressed", "true");
    });

    it("ToolbarButton has aria-expanded when expandable", () => {
      render(ToolbarButton, { props: { label: "Menu", expanded: true } });

      const button = screen.getByRole("button", { name: "Menu" });
      expect(button).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("Dialog accessibility", () => {
    it("dialog has aria-labelledby pointing to title", () => {
      render(Dialog, { props: { open: true, title: "Test Dialog" } });

      const dialog = screen.getByRole("dialog");
      const labelledById = dialog.getAttribute("aria-labelledby");
      expect(labelledById).toBeTruthy();

      const title = document.getElementById(labelledById!);
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toBe("Test Dialog");
    });

    it("dialog close button has aria-label", () => {
      render(Dialog, { props: { open: true, title: "Test" } });

      const closeButton = screen.getByRole("button", { name: /close/i });
      expect(closeButton).toHaveAttribute("aria-label", "Close dialog");
    });

    it("dialog has aria-modal", () => {
      render(Dialog, { props: { open: true, title: "Test" } });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });
  });

  describe("Drawer accessibility", () => {
    it("drawer has aria-label matching title", () => {
      const { container } = render(Drawer, {
        props: { side: "left", open: true, title: "Device Library" },
      });

      const drawer = container.querySelector("aside");
      expect(drawer).toHaveAttribute("aria-label", "Device Library");
    });

    it("drawer has aria-hidden when closed", () => {
      const { container } = render(Drawer, {
        props: { side: "left", open: false, title: "Device Library" },
      });

      const drawer = container.querySelector("aside");
      expect(drawer).toHaveAttribute("aria-hidden", "true");
    });

    it("drawer is not aria-hidden when open", () => {
      const { container } = render(Drawer, {
        props: { side: "left", open: true, title: "Device Library" },
      });

      const drawer = container.querySelector("aside");
      expect(drawer).toHaveAttribute("aria-hidden", "false");
    });
  });

  describe("DrawerHeader close button", () => {
    it("close button has aria-label", () => {
      render(DrawerHeader, { props: { title: "Test", showClose: true } });

      const closeButton = screen.getByRole("button", { name: /close/i });
      expect(closeButton).toHaveAttribute("aria-label", "Close drawer");
    });

    it("close button SVG has aria-hidden", () => {
      const { container } = render(DrawerHeader, {
        props: { title: "Test", showClose: true },
      });

      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Form inputs have labels", () => {
    it("search input in DevicePalette has aria-label", () => {
      render(DevicePalette);

      const searchInput = screen.getByRole("searchbox");
      expect(searchInput).toHaveAttribute("aria-label", "Search devices");
    });

    it("file input in DevicePalette has aria-label", () => {
      const { container } = render(DevicePalette);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute(
        "aria-label",
        "Import device library file",
      );
    });
  });

  describe("Canvas accessibility", () => {
    it('canvas has role="application" for interactive widget semantics', () => {
      const { container } = render(Canvas);

      const canvas = container.querySelector(".canvas");
      // role="application" is correct for interactive canvas widgets per WAI-ARIA
      // Reverted from role="region" (#145) to fix a11y warnings (#208)
      expect(canvas).toHaveAttribute("role", "application");
    });

    it("canvas has dynamic aria-label describing rack state", () => {
      const { container } = render(Canvas);

      const canvas = container.querySelector(".canvas");
      expect(canvas).toHaveAttribute("aria-label");
      // Dynamic label includes rack name, height, and device count
      expect(canvas?.getAttribute("aria-label")).toContain("rack");
    });
  });

  describe("Interactive SVG elements", () => {
    // Note: Rack and RackDevice tests require proper store initialization
    // and are better tested in integration tests (Rack.test.ts, RackDevice.test.ts)
    // This section documents the expected accessibility attributes

    it("documents Rack SVG accessibility requirements", () => {
      // Rack.svelte should have:
      // - Container: role="option", aria-selected, tabindex="0"
      // - SVG: role="img", aria-label="{rack.name}, {rack.height}U rack"
      expect(true).toBe(true);
    });

    it("documents RackDevice accessibility requirements", () => {
      // RackDevice.svelte should have:
      // - Drag handle: role="button", aria-label, aria-pressed, tabindex="0"
      expect(true).toBe(true);
    });
  });

  describe("Decorative icons have aria-hidden", () => {
    it("toolbar separator is aria-hidden", () => {
      const { container } = render(Toolbar);

      const separators = container.querySelectorAll(".separator");
      separators.forEach((separator) => {
        expect(separator).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("All close buttons have aria-label", () => {
    it("all close buttons in app have appropriate aria-labels", () => {
      // Test Dialog close button
      const { container: dialogContainer } = render(Dialog, {
        props: { open: true, title: "Test" },
      });
      const dialogClose = dialogContainer.querySelector(".dialog-close");
      expect(dialogClose).toHaveAttribute("aria-label", "Close dialog");

      // Test DrawerHeader close button
      const { container: drawerContainer } = render(DrawerHeader, {
        props: { title: "Test", showClose: true },
      });
      const drawerClose = drawerContainer.querySelector(".close-button");
      expect(drawerClose).toHaveAttribute("aria-label", "Close drawer");
    });
  });
});
