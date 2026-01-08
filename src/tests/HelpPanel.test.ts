import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HelpPanel from "$lib/components/HelpPanel.svelte";
import { VERSION } from "$lib/version";

// Helper to mock platform
function mockPlatform(userAgent: string) {
  vi.stubGlobal("navigator", { userAgent });
}

describe("HelpPanel", () => {
  describe("Visibility", () => {
    it("renders when open=true", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("hidden when open=false", () => {
      render(HelpPanel, { props: { open: false } });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("App Information", () => {
    it("shows app name", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText("Rackula")).toBeInTheDocument();
    });

    it("shows version number", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText(new RegExp(VERSION))).toBeInTheDocument();
    });
  });

  describe("Build Info Section", () => {
    it("shows Version label", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText("Version")).toBeInTheDocument();
    });

    it("shows version with v prefix", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText(`v${VERSION}`)).toBeInTheDocument();
    });

    it("shows Browser label", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText("Browser")).toBeInTheDocument();
    });

    it("shows user agent info", () => {
      render(HelpPanel, { props: { open: true } });

      // Verify user agent value is displayed (not just the label)
      const userAgentValue = screen.getByText(/Mozilla|Chrome|Safari|Firefox/i);
      expect(userAgentValue).toBeInTheDocument();
    });

    it("shows copy button", () => {
      render(HelpPanel, { props: { open: true } });

      expect(
        screen.getByRole("button", { name: /copy for bug report/i }),
      ).toBeInTheDocument();
    });

    it("copies build info when copy button is clicked", async () => {
      const originalIsSecureContext = window.isSecureContext;
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: { writeText: mockWriteText },
      });
      // Mock isSecureContext to allow clipboard API usage
      Object.defineProperty(window, "isSecureContext", {
        value: true,
        configurable: true,
      });

      render(HelpPanel, { props: { open: true } });

      const copyBtn = screen.getByRole("button", {
        name: /copy for bug report/i,
      });
      await fireEvent.click(copyBtn);

      expect(mockWriteText).toHaveBeenCalled();
      const copiedText = mockWriteText.mock.calls[0][0] as string;
      expect(copiedText).toContain(`Rackula v${VERSION}`);
      expect(copiedText).toContain("Browser:");

      vi.unstubAllGlobals();
      Object.defineProperty(window, "isSecureContext", {
        value: originalIsSecureContext,
        configurable: true,
      });
    });
  });

  describe("Keyboard Shortcuts", () => {
    it("shows shortcut categories", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("Editing")).toBeInTheDocument();
      expect(screen.getByText("File")).toBeInTheDocument();
    });

    it("lists common shortcuts", () => {
      render(HelpPanel, { props: { open: true } });

      // Check for some key shortcuts
      expect(screen.getByText("Escape")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    describe("on macOS", () => {
      beforeEach(() => {
        mockPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it("shows Cmd modifier", () => {
        render(HelpPanel, { props: { open: true } });
        expect(screen.getByText("Cmd + S")).toBeInTheDocument();
        expect(screen.getByText("Cmd + Shift + Z")).toBeInTheDocument();
      });
    });

    describe("on Windows/Linux", () => {
      beforeEach(() => {
        mockPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it("shows Ctrl modifier", () => {
        render(HelpPanel, { props: { open: true } });
        expect(screen.getByText("Ctrl + S")).toBeInTheDocument();
        expect(screen.getByText("Ctrl + Shift + Z")).toBeInTheDocument();
      });
    });
  });

  describe("Quick Links", () => {
    it("shows Project link with GitHub logo", () => {
      render(HelpPanel, { props: { open: true } });

      const projectLink = screen.getByRole("link", { name: /project/i });
      expect(projectLink).toBeInTheDocument();
    });

    it("Project link points to GitHub repository", () => {
      render(HelpPanel, { props: { open: true } });

      const projectLink = screen.getByRole("link", { name: /project/i });
      expect(projectLink.getAttribute("href")).toBe(
        "https://github.com/RackulaLives/Rackula",
      );
    });

    it("shows Report Bug link", () => {
      render(HelpPanel, { props: { open: true } });

      const bugLink = screen.getByRole("link", { name: /report bug/i });
      expect(bugLink).toBeInTheDocument();
    });

    it("Report Bug link pre-fills browser info", () => {
      render(HelpPanel, { props: { open: true } });

      const bugLink = screen.getByRole("link", { name: /report bug/i });
      const href = bugLink.getAttribute("href");
      expect(href).toContain("template=bug-report.yml");
      expect(href).toContain("browser=");
      // URLSearchParams encodes spaces as + not %20
      expect(href).toContain(`Rackula+v${VERSION}`);
    });

    it("shows Request Feature link", () => {
      render(HelpPanel, { props: { open: true } });

      const featureLink = screen.getByRole("link", {
        name: /request feature/i,
      });
      expect(featureLink).toBeInTheDocument();
    });

    it("Request Feature link uses correct template", () => {
      render(HelpPanel, { props: { open: true } });

      const featureLink = screen.getByRole("link", {
        name: /request feature/i,
      });
      expect(featureLink.getAttribute("href")).toContain(
        "template=feature-request.yml",
      );
    });

    it("all quick links open in new tab", () => {
      render(HelpPanel, { props: { open: true } });

      const projectLink = screen.getByRole("link", { name: /project/i });
      const bugLink = screen.getByRole("link", { name: /report bug/i });
      const featureLink = screen.getByRole("link", {
        name: /request feature/i,
      });

      expect(projectLink.getAttribute("target")).toBe("_blank");
      expect(bugLink.getAttribute("target")).toBe("_blank");
      expect(featureLink.getAttribute("target")).toBe("_blank");
    });

    it('all quick links have rel="noopener noreferrer" for security', () => {
      render(HelpPanel, { props: { open: true } });

      const projectLink = screen.getByRole("link", { name: /project/i });
      const bugLink = screen.getByRole("link", { name: /report bug/i });
      const featureLink = screen.getByRole("link", {
        name: /request feature/i,
      });

      expect(projectLink.getAttribute("rel")).toContain("noopener");
      expect(bugLink.getAttribute("rel")).toContain("noopener");
      expect(featureLink.getAttribute("rel")).toContain("noopener");
    });
  });

  describe("Close Actions", () => {
    it("escape key dispatches close event", async () => {
      const onClose = vi.fn();

      render(HelpPanel, {
        props: { open: true, onclose: onClose },
      });

      await fireEvent.keyDown(window, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Easter Eggs Section", () => {
    it("shows Easter Eggs section heading", () => {
      render(HelpPanel, { props: { open: true } });

      expect(screen.getByText("Easter Eggs")).toBeInTheDocument();
    });

    it("shows banana toggle checkbox", () => {
      render(HelpPanel, { props: { open: true } });

      const bananaToggle = screen.getByRole("checkbox", {
        name: /banana for scale/i,
      });
      expect(bananaToggle).toBeInTheDocument();
    });

    it("banana toggle starts unchecked", () => {
      render(HelpPanel, { props: { open: true } });

      const bananaToggle = screen.getByRole("checkbox", {
        name: /banana for scale/i,
      });
      expect(bananaToggle).not.toBeChecked();
    });

    it("banana toggle calls ontogglebanana when clicked", async () => {
      const onToggleBanana = vi.fn();

      render(HelpPanel, {
        props: { open: true, ontogglebanana: onToggleBanana },
      });

      const bananaToggle = screen.getByRole("checkbox", {
        name: /banana for scale/i,
      });
      await fireEvent.click(bananaToggle);

      expect(onToggleBanana).toHaveBeenCalledTimes(1);
    });

    it("banana toggle reflects showBanana prop", () => {
      render(HelpPanel, {
        props: { open: true, showBanana: true },
      });

      const bananaToggle = screen.getByRole("checkbox", {
        name: /banana for scale/i,
      });
      expect(bananaToggle).toBeChecked();
    });
  });
});
