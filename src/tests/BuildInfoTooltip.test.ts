import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import BuildInfoTooltip from "$lib/components/BuildInfoTooltip.svelte";

// Store original clipboard for restoration
const originalClipboard = navigator.clipboard;

describe("BuildInfoTooltip", () => {
  const mockWriteText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    // Mock clipboard API using defineProperty since it's read-only
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    mockWriteText.mockClear();
    // Restore original clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  describe("Visibility", () => {
    it("renders nothing when visible is false", () => {
      const { queryByTestId } = render(BuildInfoTooltip, {
        props: { visible: false },
      });

      expect(queryByTestId("build-info-tooltip")).not.toBeInTheDocument();
    });

    it("renders tooltip when visible is true", () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      expect(getByTestId("build-info-tooltip")).toBeInTheDocument();
    });
  });

  describe("Content Display", () => {
    it("shows version row", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const versionRow = container.querySelector(".info-row");
      expect(versionRow).toBeInTheDocument();
      expect(container.textContent).toContain("Version");
    });

    it("displays version value with v prefix", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      // Version value should start with 'v'
      const versionValue = container.querySelector(".info-value");
      expect(versionValue?.textContent).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("shows commit row when commit hash is available", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      // In test environment, __COMMIT_HASH__ is defined in vite.config.ts
      // The component should show the commit row
      const commitLink = container.querySelector(".commit-link");
      expect(commitLink).toBeInTheDocument();
    });

    it("shows branch row when branch name is available", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      // In test environment, __BRANCH_NAME__ is defined
      expect(container.textContent).toContain("Branch");
    });

    it("shows build time row", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      expect(container.textContent).toContain("Built");
    });
  });

  describe("Commit Link", () => {
    it("commit link points to GitHub", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const commitLink = container.querySelector(".commit-link");
      const href = commitLink?.getAttribute("href");

      expect(href).toContain("github.com/RackulaLives/Rackula/commit/");
    });

    it("commit link opens in new tab", () => {
      const { container } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const commitLink = container.querySelector(".commit-link");

      expect(commitLink).toHaveAttribute("target", "_blank");
      expect(commitLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Copy Functionality", () => {
    it("renders copy button", () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      expect(copyButton).toBeInTheDocument();
    });

    it("copy button has correct initial text", () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      expect(copyButton.textContent).toContain("Click to copy");
    });

    it("copies to clipboard when clicked", async () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      await fireEvent.click(copyButton);

      expect(mockWriteText).toHaveBeenCalled();
    });

    it("shows copied confirmation after click", async () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      await fireEvent.click(copyButton);

      await waitFor(() => {
        expect(copyButton.textContent).toContain("Copied!");
      });
    });

    it("copies correctly formatted version string", async () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      await fireEvent.click(copyButton);

      const copiedText = mockWriteText.mock.calls[0][0] as string;

      // Should contain "Rackula v" and version number
      expect(copiedText).toMatch(/Rackula v\d+\.\d+\.\d+/);
    });
  });

  describe("Accessibility", () => {
    it("tooltip has role=tooltip", () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const tooltip = getByTestId("build-info-tooltip");
      expect(tooltip).toHaveAttribute("role", "tooltip");
    });

    it("copy button has descriptive title", () => {
      const { getByTestId } = render(BuildInfoTooltip, {
        props: { visible: true },
      });

      const copyButton = getByTestId("copy-build-info");
      expect(copyButton).toHaveAttribute(
        "title",
        "Copy version info to clipboard",
      );
    });
  });
});
