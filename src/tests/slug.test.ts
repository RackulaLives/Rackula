/**
 * Slug Utilities Tests
 * TDD: Tests written first, implementation follows
 */

import { describe, it, expect } from "vitest";
import {
  slugify,
  generateDeviceSlug,
  isValidSlug,
  ensureUniqueSlug,
} from "$lib/utils/slug";

describe("Slug Utilities", () => {
  describe("slugify", () => {
    it("converts name to lowercase slug", () => {
      expect(slugify("Synology DS920+")).toBe("synology-ds920-plus");
    });

    it("handles UniFi product names", () => {
      expect(slugify("UniFi Dream Machine")).toBe("unifi-dream-machine");
    });

    it("collapses multiple hyphens", () => {
      expect(slugify("Some---Thing")).toBe("some-thing");
    });

    it("removes leading hyphens", () => {
      expect(slugify("-test")).toBe("test");
    });

    it("removes trailing hyphens", () => {
      expect(slugify("test-")).toBe("test");
    });

    it("removes leading and trailing hyphens", () => {
      expect(slugify("-test-")).toBe("test");
    });

    it("converts uppercase to lowercase", () => {
      expect(slugify("UPPERCASE")).toBe("uppercase");
    });

    it("handles multiple spaces", () => {
      expect(slugify("with  spaces")).toBe("with-spaces");
    });

    it("removes special characters", () => {
      expect(slugify("special!@#chars")).toBe("special-chars");
    });

    it("handles empty string", () => {
      expect(slugify("")).toBe("");
    });

    it("handles numbers", () => {
      expect(slugify("Server 2U Rack")).toBe("server-2u-rack");
    });

    it("handles plus sign specially", () => {
      expect(slugify("DS920+")).toBe("ds920-plus");
    });

    it("handles ampersand", () => {
      expect(slugify("Audio & Video")).toBe("audio-video");
    });

    it("handles dots", () => {
      expect(slugify("Version 2.0")).toBe("version-2-0");
    });

    it("handles underscores", () => {
      expect(slugify("some_thing")).toBe("some-thing");
    });
  });

  describe("generateDeviceSlug", () => {
    it("generates from manufacturer and model", () => {
      expect(generateDeviceSlug("Synology", "DS920+")).toBe(
        "synology-ds920-plus",
      );
    });

    it("generates from manufacturer and model with spaces", () => {
      expect(generateDeviceSlug("Ubiquiti", "USG Pro 4")).toBe(
        "ubiquiti-usg-pro-4",
      );
    });

    it("generates from name only when no manufacturer", () => {
      expect(generateDeviceSlug(undefined, undefined, "Custom Server")).toBe(
        "custom-server",
      );
    });

    it("generates from name when manufacturer is empty", () => {
      expect(generateDeviceSlug("", "", "My Device")).toBe("my-device");
    });

    it("prefers manufacturer+model over name", () => {
      expect(generateDeviceSlug("Dell", "PowerEdge R740", "Main Server")).toBe(
        "dell-poweredge-r740",
      );
    });

    it("generates fallback for empty inputs", () => {
      const result = generateDeviceSlug();
      expect(result).toMatch(/^device-\d+$/);
    });

    it("generates fallback for all undefined", () => {
      const result = generateDeviceSlug(undefined, undefined, undefined);
      expect(result).toMatch(/^device-\d+$/);
    });
  });

  describe("isValidSlug", () => {
    it("returns true for valid slug", () => {
      expect(isValidSlug("valid-slug")).toBe(true);
    });

    it("returns true for slug with numbers", () => {
      expect(isValidSlug("also-valid-123")).toBe(true);
    });

    it("returns true for simple slug", () => {
      expect(isValidSlug("simple")).toBe(true);
    });

    it("returns true for numbers only", () => {
      expect(isValidSlug("123")).toBe(true);
    });

    it("returns false for uppercase", () => {
      expect(isValidSlug("Invalid-Slug")).toBe(false);
    });

    it("returns false for spaces", () => {
      expect(isValidSlug("invalid slug")).toBe(false);
    });

    it("returns false for leading hyphen", () => {
      expect(isValidSlug("-invalid")).toBe(false);
    });

    it("returns false for trailing hyphen", () => {
      expect(isValidSlug("invalid-")).toBe(false);
    });

    it("returns false for consecutive hyphens", () => {
      expect(isValidSlug("invalid--slug")).toBe(false);
    });

    it("returns false for special characters", () => {
      expect(isValidSlug("invalid@slug")).toBe(false);
    });

    it("returns false for underscores", () => {
      expect(isValidSlug("invalid_slug")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidSlug("")).toBe(false);
    });
  });

  describe("ensureUniqueSlug", () => {
    it("returns original if unique", () => {
      const existing = new Set(["other-slug", "another-slug"]);
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug");
    });

    it("returns original if set is empty", () => {
      const existing = new Set<string>();
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug");
    });

    it("appends -2 for first duplicate", () => {
      const existing = new Set(["my-slug"]);
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug-2");
    });

    it("increments to -3 when -2 exists", () => {
      const existing = new Set(["my-slug", "my-slug-2"]);
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug-3");
    });

    it("increments until unique", () => {
      const existing = new Set([
        "my-slug",
        "my-slug-2",
        "my-slug-3",
        "my-slug-4",
      ]);
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug-5");
    });

    it("handles gaps in numbering", () => {
      const existing = new Set(["my-slug", "my-slug-3"]);
      // Should still return -2 since it checks sequentially
      expect(ensureUniqueSlug("my-slug", existing)).toBe("my-slug-2");
    });
  });
});
