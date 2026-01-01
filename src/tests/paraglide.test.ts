/**
 * Paraglide JS Integration Tests
 * Verifies that Paraglide JS is correctly configured and messages compile
 */

import { describe, it, expect } from "vitest";
import { hello, m } from "$lib/i18n/paraglide/messages.js";

describe("Paraglide JS Integration", () => {
  describe("Message Functions", () => {
    it("hello message returns expected string in default locale", () => {
      const result = hello();
      expect(result).toBe("Hello World");
    });

    it("hello message is exported via m namespace", () => {
      const result = m.hello();
      expect(result).toBe("Hello World");
    });
  });

  describe("Locale Support", () => {
    it("hello message returns English for explicit en locale", () => {
      const result = hello({}, { locale: "en" });
      expect(result).toBe("Hello World");
    });

    it("hello message falls back to English for de locale (no translation yet)", () => {
      const result = hello({}, { locale: "de" });
      // Falls back to English since we haven't added German translations
      expect(result).toBe("Hello World");
    });
  });
});
