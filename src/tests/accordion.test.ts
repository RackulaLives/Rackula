import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import TestAccordion from "./helpers/TestAccordion.svelte";

describe("Accordion Component", () => {
  beforeEach(() => {
    // Reset any state between tests
  });

  describe("Rendering", () => {
    it("renders with provided sections", () => {
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
        { id: "section-3", title: "Section 3", content: "Content 3" },
      ];

      render(TestAccordion, { props: { sections } });

      expect(
        screen.getByRole("button", { name: "Section 1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Section 2" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Section 3" }),
      ).toBeInTheDocument();
    });

    it("renders default expanded section", () => {
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // The first section should be expanded
      expect(screen.getByText("Content 1")).toBeVisible();
    });
  });

  describe('Exclusive Behavior (type="single")', () => {
    it("only allows one section to be open at a time", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // Section 1 is open
      expect(screen.getByText("Content 1")).toBeVisible();

      // Click Section 2
      await user.click(screen.getByRole("button", { name: "Section 2" }));

      // Now Section 2 should be open, Section 1 should be closed
      expect(screen.getByText("Content 2")).toBeVisible();
      expect(screen.queryByText("Content 1")).not.toBeVisible();
    });

    it("clicking open section closes it", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // Section 1 is open
      expect(screen.getByText("Content 1")).toBeVisible();

      // Click Section 1 trigger to close it
      await user.click(screen.getByRole("button", { name: "Section 1" }));

      // Section 1 should now be closed
      expect(screen.queryByText("Content 1")).not.toBeVisible();
    });

    it("clicking different section switches to it", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
        { id: "section-3", title: "Section 3", content: "Content 3" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // Click Section 3
      await user.click(screen.getByRole("button", { name: "Section 3" }));

      // Only Section 3 should be visible
      expect(screen.queryByText("Content 1")).not.toBeVisible();
      expect(screen.queryByText("Content 2")).not.toBeVisible();
      expect(screen.getByText("Content 3")).toBeVisible();
    });
  });

  describe("Keyboard Accessibility", () => {
    it("triggers can receive focus via Tab", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections } });

      // Tab to first trigger
      await user.tab();
      expect(screen.getByRole("button", { name: "Section 1" })).toHaveFocus();

      // Tab to second trigger
      await user.tab();
      expect(screen.getByRole("button", { name: "Section 2" })).toHaveFocus();
    });

    it("Enter key toggles section", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections } });

      // Tab to first trigger and press Enter
      await user.tab();
      await user.keyboard("{Enter}");

      // Section 1 should now be open
      expect(screen.getByText("Content 1")).toBeVisible();
    });

    it("Space key toggles section", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections } });

      // Tab to second trigger and press Space
      await user.tab();
      await user.tab();
      await user.keyboard(" ");

      // Section 2 should now be open
      expect(screen.getByText("Content 2")).toBeVisible();
    });
  });

  describe("ARIA Attributes", () => {
    it("triggers have aria-expanded attribute", () => {
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      const trigger1 = screen.getByRole("button", { name: "Section 1" });
      const trigger2 = screen.getByRole("button", { name: "Section 2" });

      expect(trigger1).toHaveAttribute("aria-expanded", "true");
      expect(trigger2).toHaveAttribute("aria-expanded", "false");
    });

    it("content regions are accessible", () => {
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // Content should be accessible when section is expanded
      const content1 = screen.getByText("Content 1");
      expect(content1).toBeInTheDocument();
      expect(content1).toBeVisible();

      // Collapsed content should not be visible
      const content2 = screen.queryByText("Content 2");
      expect(content2).not.toBeVisible();
    });

    it("aria-expanded updates when section is toggled", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections } });

      const trigger1 = screen.getByRole("button", { name: "Section 1" });

      // Initially collapsed
      expect(trigger1).toHaveAttribute("aria-expanded", "false");

      // Click to expand
      await user.click(trigger1);
      expect(trigger1).toHaveAttribute("aria-expanded", "true");

      // Click to collapse
      await user.click(trigger1);
      expect(trigger1).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Data Attributes", () => {
    it("items have data-state attribute", () => {
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      // Find items by their triggers and check parent data attributes
      const trigger1 = screen.getByRole("button", { name: "Section 1" });
      const trigger2 = screen.getByRole("button", { name: "Section 2" });

      // Triggers should have data-state
      expect(trigger1).toHaveAttribute("data-state", "open");
      expect(trigger2).toHaveAttribute("data-state", "closed");
    });

    it("data-state updates when sections toggle", async () => {
      const user = userEvent.setup();
      const sections = [
        { id: "section-1", title: "Section 1", content: "Content 1" },
        { id: "section-2", title: "Section 2", content: "Content 2" },
      ];

      render(TestAccordion, { props: { sections, defaultValue: "section-1" } });

      const trigger1 = screen.getByRole("button", { name: "Section 1" });
      const trigger2 = screen.getByRole("button", { name: "Section 2" });

      // Initial state
      expect(trigger1).toHaveAttribute("data-state", "open");
      expect(trigger2).toHaveAttribute("data-state", "closed");

      // Click Section 2
      await user.click(trigger2);

      // State should swap
      expect(trigger1).toHaveAttribute("data-state", "closed");
      expect(trigger2).toHaveAttribute("data-state", "open");
    });
  });
});
