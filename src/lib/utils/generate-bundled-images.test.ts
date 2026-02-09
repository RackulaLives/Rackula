/**
 * Tests for bundledImages.ts auto-generation
 */

import { describe, it, expect } from "vitest";
import {
  parseImagePath,
  generateImportName,
  generateImportStatement,
  generateManifestEntry,
  groupImagesBySlug,
} from "./generate-bundled-images";

describe("generate-bundled-images", () => {
  describe("parseImagePath", () => {
    it("parses a front image path correctly", () => {
      const result = parseImagePath("hpe/hpe-proliant-dl380-gen10.front.webp");
      expect(result).toEqual({
        vendor: "hpe",
        slug: "hpe-proliant-dl380-gen10",
        face: "front",
        filename: "hpe-proliant-dl380-gen10.front.webp",
      });
    });

    it("parses a rear image path correctly", () => {
      const result = parseImagePath(
        "ubiquiti/ubiquiti-unifi-dream-machine-pro.rear.webp",
      );
      expect(result).toEqual({
        vendor: "ubiquiti",
        slug: "ubiquiti-unifi-dream-machine-pro",
        face: "rear",
        filename: "ubiquiti-unifi-dream-machine-pro.rear.webp",
      });
    });

    it("handles slugs with multiple hyphens", () => {
      const result = parseImagePath("dell/dell-poweredge-r730xd.front.webp");
      expect(result).toEqual({
        vendor: "dell",
        slug: "dell-poweredge-r730xd",
        face: "front",
        filename: "dell-poweredge-r730xd.front.webp",
      });
    });

    it("returns null for invalid paths", () => {
      expect(parseImagePath("invalid.webp")).toBeNull();
      expect(parseImagePath("hpe/no-face.webp")).toBeNull();
      expect(
        parseImagePath("apple/apple-assets/apple-xserve.front.webp"),
      ).toBeNull();
    });
  });

  describe("generateImportName", () => {
    it("generates camelCase import name for front image", () => {
      const result = generateImportName("hpe-proliant-dl380-gen10", "front");
      expect(result).toBe("hpeProliantDl380Gen10Front");
    });

    it("generates camelCase import name for rear image", () => {
      const result = generateImportName(
        "ubiquiti-unifi-dream-machine-pro",
        "rear",
      );
      expect(result).toBe("ubiquitiUnifiDreamMachineProRear");
    });

    it("handles numbers in slugs", () => {
      const result = generateImportName("dell-poweredge-r730xd", "front");
      expect(result).toBe("dellPoweredgeR730xdFront");
    });
  });

  describe("generateImportStatement", () => {
    it("generates correct import statement", () => {
      const result = generateImportStatement(
        "hpe",
        "hpe-proliant-dl380-gen10",
        "front",
      );
      expect(result).toBe(
        "import hpeProliantDl380Gen10Front from '$lib/assets/device-images/hpe/hpe-proliant-dl380-gen10.front.webp';",
      );
    });
  });

  describe("generateManifestEntry", () => {
    it("generates manifest entry with front only", () => {
      const result = generateManifestEntry("hpe-proliant-dl380-gen10", {
        front: "hpeProliantDl380Gen10Front",
      });
      expect(result).toBe(
        "'hpe-proliant-dl380-gen10': { front: hpeProliantDl380Gen10Front }",
      );
    });

    it("generates manifest entry with front and rear", () => {
      const result = generateManifestEntry("hpe-proliant-dl380-gen10", {
        front: "hpeProliantDl380Gen10Front",
        rear: "hpeProliantDl380Gen10Rear",
      });
      expect(result).toBe(
        "'hpe-proliant-dl380-gen10': { front: hpeProliantDl380Gen10Front, rear: hpeProliantDl380Gen10Rear }",
      );
    });

    it("generates manifest entry with rear only", () => {
      const result = generateManifestEntry("some-device", {
        rear: "someDeviceRear",
      });
      expect(result).toBe("'some-device': { rear: someDeviceRear }");
    });
  });

  describe("groupImagesBySlug", () => {
    it("groups front and rear images by slug", () => {
      const images = [
        {
          vendor: "hpe",
          slug: "hpe-proliant-dl380-gen10",
          face: "front" as const,
          filename: "hpe-proliant-dl380-gen10.front.webp",
        },
        {
          vendor: "hpe",
          slug: "hpe-proliant-dl380-gen10",
          face: "rear" as const,
          filename: "hpe-proliant-dl380-gen10.rear.webp",
        },
        {
          vendor: "hpe",
          slug: "hpe-proliant-dl360-gen10",
          face: "front" as const,
          filename: "hpe-proliant-dl360-gen10.front.webp",
        },
      ];

      const result = groupImagesBySlug(images);

      expect(result).toEqual({
        "hpe-proliant-dl380-gen10": {
          vendor: "hpe",
          front: "hpe-proliant-dl380-gen10.front.webp",
          rear: "hpe-proliant-dl380-gen10.rear.webp",
        },
        "hpe-proliant-dl360-gen10": {
          vendor: "hpe",
          front: "hpe-proliant-dl360-gen10.front.webp",
        },
      });
    });
  });
});
