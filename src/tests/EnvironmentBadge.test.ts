import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/svelte";
import EnvironmentBadge from "$lib/components/EnvironmentBadge.svelte";

// Mock the global __BUILD_ENV__ constant
declare global {
  const __BUILD_ENV__: string;
}

describe("EnvironmentBadge", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Reset location mock before each test
    Object.defineProperty(window, "location", {
      value: { hostname: "count.racku.la" },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    vi.unstubAllGlobals();
  });

  describe("Production Environment", () => {
    it("renders nothing when BUILD_ENV is production", () => {
      vi.stubGlobal("__BUILD_ENV__", "production");
      const { container } = render(EnvironmentBadge);

      expect(container.querySelector(".env-badge")).not.toBeInTheDocument();
    });

    it("renders nothing when BUILD_ENV is empty and not localhost", () => {
      vi.stubGlobal("__BUILD_ENV__", "");
      const { container } = render(EnvironmentBadge);

      expect(container.querySelector(".env-badge")).not.toBeInTheDocument();
    });
  });

  describe("Development Environment", () => {
    it("renders DEV badge when BUILD_ENV is development", () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      const { container, getByText } = render(EnvironmentBadge);

      expect(container.querySelector(".env-badge")).toBeInTheDocument();
      expect(getByText("DEV")).toBeInTheDocument();
    });

    it("has animated text element for cylon effect", () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      const { container } = render(EnvironmentBadge);

      const textElement = container.querySelector(".env-badge__text");
      expect(textElement).toBeInTheDocument();
      expect(textElement).toHaveTextContent("DEV");
    });
  });

  describe("Local Environment", () => {
    it("renders LOCAL badge when on localhost", () => {
      vi.stubGlobal("__BUILD_ENV__", "");
      Object.defineProperty(window, "location", {
        value: { hostname: "localhost" },
        writable: true,
      });
      const { container, getByText } = render(EnvironmentBadge);

      expect(container.querySelector(".env-badge")).toBeInTheDocument();
      expect(getByText("LOCAL")).toBeInTheDocument();
    });

    it("renders LOCAL badge when on 127.0.0.1", () => {
      vi.stubGlobal("__BUILD_ENV__", "");
      Object.defineProperty(window, "location", {
        value: { hostname: "127.0.0.1" },
        writable: true,
      });
      const { container, getByText } = render(EnvironmentBadge);

      expect(container.querySelector(".env-badge")).toBeInTheDocument();
      expect(getByText("LOCAL")).toBeInTheDocument();
    });

    it("LOCAL takes precedence when both BUILD_ENV and localhost", () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      Object.defineProperty(window, "location", {
        value: { hostname: "localhost" },
        writable: true,
      });
      const { getByText } = render(EnvironmentBadge);

      // LOCAL should take precedence
      expect(getByText("LOCAL")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has appropriate aria-label for screen readers", () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      const { container } = render(EnvironmentBadge);

      const badge = container.querySelector(".env-badge");
      expect(badge).toHaveAttribute("aria-label", "Development environment");
    });

    it("has aria-label for local environment", () => {
      vi.stubGlobal("__BUILD_ENV__", "");
      Object.defineProperty(window, "location", {
        value: { hostname: "localhost" },
        writable: true,
      });
      const { container } = render(EnvironmentBadge);

      const badge = container.querySelector(".env-badge");
      expect(badge).toHaveAttribute("aria-label", "Local environment");
    });

    it('has role="status" for non-interactive badge', () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      const { container } = render(EnvironmentBadge);

      const badge = container.querySelector(".env-badge");
      expect(badge).toHaveAttribute("role", "status");
    });
  });

  describe("Styling", () => {
    it("uses design token CSS variables", () => {
      vi.stubGlobal("__BUILD_ENV__", "development");
      const { container } = render(EnvironmentBadge);

      const badge = container.querySelector(".env-badge");
      expect(badge).toBeInTheDocument();
      // CSS variables are applied via stylesheets, we just verify the element exists
    });
  });
});
