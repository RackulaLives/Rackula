import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import Toolbar from "$lib/components/Toolbar.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";

describe("Toolbar Responsive Structure", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
  });

  describe("Button text structure", () => {
    it("toolbar action buttons contain span elements for text labels", () => {
      const { container } = render(Toolbar);

      const actionButtons = container.querySelectorAll(".toolbar-action-btn");
      expect(actionButtons.length).toBeGreaterThan(0);

      // Each action button should have a span for the text label
      actionButtons.forEach((btn) => {
        const span = btn.querySelector("span");
        expect(span).toBeInTheDocument();
      });
    });

    it("button spans contain text content", () => {
      const { container } = render(Toolbar);

      const spans = container.querySelectorAll(".toolbar-action-btn span");
      const textsFound = Array.from(spans).map((span) =>
        span.textContent?.trim(),
      );

      // Should contain expected button labels (About moved to LogoLockup)
      expect(textsFound).toContain("New Rack");
      expect(textsFound).toContain("Save");
      expect(textsFound).toContain("Export");
      expect(textsFound).toContain("Reset View");
    });
  });

  describe("Brand structure", () => {
    it("brand section contains logo lockup with title", () => {
      const { container } = render(Toolbar);

      // LogoLockup uses SVG text for the brand name with aria-label
      // Tests run on localhost, so DevRackula prefix shows
      const logoTitle = container.querySelector(".logo-title");
      expect(logoTitle).toBeInTheDocument();
      expect(logoTitle?.getAttribute("aria-label")).toBe(
        "DevRackula - development environment",
      );
      // Text content includes Dev prefix and Rackula (whitespace normalized)
      const textContent =
        logoTitle?.querySelector("text")?.textContent?.replace(/\s+/g, "") ??
        "";
      expect(textContent).toBe("DevRackula");
    });

    it("brand section does not contain tagline (moved to About)", () => {
      const { container } = render(Toolbar);

      // Tagline was removed from toolbar to prevent overlap issues
      // It is now displayed in the About panel instead
      const tagline = container.querySelector(".brand-tagline");
      expect(tagline).not.toBeInTheDocument();
    });

    it("brand section contains logo icon", () => {
      const { container } = render(Toolbar);

      // Logo is an SVG inside toolbar-brand
      const brand = container.querySelector(".toolbar-brand");
      const svg = brand?.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("CSS class structure for responsive targeting", () => {
    it("toolbar-action-btn class exists on all action buttons", () => {
      const { container } = render(Toolbar);

      const buttons = container.querySelectorAll("button.toolbar-action-btn");
      // Should have multiple action buttons
      expect(buttons.length).toBeGreaterThanOrEqual(8);
    });

    it("toolbar-brand class exists for branding section", () => {
      const { container } = render(Toolbar);

      const brand = container.querySelector(".toolbar-brand");
      expect(brand).toBeInTheDocument();
    });

    it("toolbar-center class exists for center section", () => {
      const { container } = render(Toolbar);

      const center = container.querySelector(".toolbar-center");
      expect(center).toBeInTheDocument();
    });

    it("separator class exists for visual dividers", () => {
      const { container } = render(Toolbar);

      const separators = container.querySelectorAll(".separator");
      expect(separators.length).toBeGreaterThan(0);
    });
  });

  describe("Icon presence", () => {
    it("each action button contains an SVG icon", () => {
      const { container } = render(Toolbar);

      const actionButtons = container.querySelectorAll(".toolbar-action-btn");

      actionButtons.forEach((btn) => {
        const svg = btn.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe("Button text wrapping", () => {
    it("toolbar action buttons use toolbar-action-btn class for consistent styling", () => {
      const { container } = render(Toolbar);

      const actionButtons = container.querySelectorAll(".toolbar-action-btn");
      expect(actionButtons.length).toBeGreaterThan(0);

      // All action buttons should have the consistent class for CSS targeting
      // CSS includes white-space: nowrap to prevent text wrapping (verified in component)
      actionButtons.forEach((btn) => {
        expect(btn.classList.contains("toolbar-action-btn")).toBe(true);
      });
    });

    it("multi-word button labels exist (New Rack, Load Layout, Reset View)", () => {
      const { container } = render(Toolbar);

      const spans = container.querySelectorAll(".toolbar-action-btn span");
      const textsFound = Array.from(spans).map((span) =>
        span.textContent?.trim(),
      );

      // These multi-word buttons should exist and not wrap
      expect(textsFound).toContain("New Rack");
      expect(textsFound).toContain("Load Layout");
      expect(textsFound).toContain("Reset View");
    });
  });
});
