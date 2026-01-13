import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import MobileWarningModal from "$lib/components/MobileWarningModal.svelte";

describe("MobileWarningModal", () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    // Reset window.innerWidth mock
    vi.restoreAllMocks();
  });

  function mockWindowWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  describe("Visibility", () => {
    it("shows modal on mobile viewport (< 1024px)", () => {
      mockWindowWidth(768);
      render(MobileWarningModal);

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(
        screen.getByText("Rackula works best on desktop"),
      ).toBeInTheDocument();
    });

    it("does not show modal on desktop viewport (>= 1024px)", () => {
      mockWindowWidth(1024);
      render(MobileWarningModal);

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("does not show modal on large desktop viewport", () => {
      mockWindowWidth(1920);
      render(MobileWarningModal);

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("does not show modal if previously dismissed in session", () => {
      mockWindowWidth(768);
      sessionStorage.setItem("rackula-mobile-warning-dismissed", "true");
      render(MobileWarningModal);

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  describe("Content", () => {
    beforeEach(() => {
      mockWindowWidth(768);
    });

    it("shows title", () => {
      render(MobileWarningModal);

      expect(
        screen.getByText("Rackula works best on desktop"),
      ).toBeInTheDocument();
    });

    it("shows description about screen size", () => {
      render(MobileWarningModal);

      expect(
        screen.getByText(/designed for screens 1024px or wider/i),
      ).toBeInTheDocument();
    });

    it("shows mobile support coming soon message", () => {
      render(MobileWarningModal);

      expect(
        screen.getByText(/mobile support is coming soon/i),
      ).toBeInTheDocument();
    });

    it("shows continue button", () => {
      render(MobileWarningModal);

      expect(
        screen.getByRole("button", { name: /continue anyway/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Dismissal", () => {
    beforeEach(() => {
      mockWindowWidth(768);
    });

    it("closes modal when continue button is clicked", async () => {
      render(MobileWarningModal);

      const button = screen.getByRole("button", { name: /continue anyway/i });
      await fireEvent.click(button);

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("saves dismissal to sessionStorage when continue is clicked", async () => {
      render(MobileWarningModal);

      const button = screen.getByRole("button", { name: /continue anyway/i });
      await fireEvent.click(button);

      expect(sessionStorage.getItem("rackula-mobile-warning-dismissed")).toBe(
        "true",
      );
    });

    it("closes modal on Escape key", async () => {
      render(MobileWarningModal);

      await fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("saves dismissal to sessionStorage on Escape key", async () => {
      render(MobileWarningModal);

      await fireEvent.keyDown(document, { key: "Escape" });

      expect(sessionStorage.getItem("rackula-mobile-warning-dismissed")).toBe(
        "true",
      );
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      mockWindowWidth(768);
    });

    it("has correct ARIA role", () => {
      render(MobileWarningModal);

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("has aria-labelledby attribute", () => {
      render(MobileWarningModal);

      const dialog = screen.getByRole("alertdialog");
      // bits-ui automatically generates and wires aria-labelledby to AlertDialog.Title
      expect(dialog).toHaveAttribute("aria-labelledby");
    });

    it("has aria-describedby attribute", () => {
      render(MobileWarningModal);

      const dialog = screen.getByRole("alertdialog");
      // bits-ui automatically generates and wires aria-describedby to AlertDialog.Description
      expect(dialog).toHaveAttribute("aria-describedby");
    });
  });
});
