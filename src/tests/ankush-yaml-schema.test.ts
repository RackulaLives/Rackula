/**
 * YAML Schema Metadata Validation Tests
 * Named in honor of Ankush who originally proposed YAML schema formalization.
 *
 * Tests for the metadata section of the layout schema:
 * - id: UUID, required, stable identity across renames
 * - name: string, required, human-readable layout name
 * - schema_version: string, required, format version for migrations
 * - description: string, optional, empty string default
 */

import { describe, it, expect } from "vitest";
import { LayoutSchema, LayoutMetadataSchema } from "$lib/schemas";
import { createTestRack, createTestLayoutSettings } from "./factories";

// ============================================================================
// LayoutMetadataSchema Tests
// ============================================================================

describe("LayoutMetadataSchema", () => {
  describe("valid metadata", () => {
    it("accepts complete valid metadata", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "1.0",
        description: "Basement setup for home automation and media server",
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });

    it("accepts metadata with empty description", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "1.0",
        description: "",
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });

    it("accepts metadata without description (optional)", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "1.0",
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });

    it.each([
      ["550e8400-e29b-41d4-a716-446655440000", "standard format"],
      ["6ba7b810-9dad-11d1-80b4-00c04fd430c8", "another valid UUID"],
      ["f47ac10b-58cc-4372-a567-0e02b2c3d479", "generated UUID"],
    ])("accepts valid UUID: %s (%s)", (uuid) => {
      const metadata = { id: uuid, name: "Test", schema_version: "1.0" };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });
  });

  describe("id validation", () => {
    it("rejects missing id", () => {
      const metadata = {
        name: "My Homelab",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects empty id", () => {
      const metadata = {
        id: "",
        name: "My Homelab",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects non-UUID format id", () => {
      const metadata = {
        id: "not-a-valid-uuid",
        name: "My Homelab",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects UUID without hyphens", () => {
      const metadata = {
        id: "550e8400e29b41d4a716446655440000",
        name: "My Homelab",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("rejects missing name", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "",
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("accepts name up to 100 characters", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "a".repeat(100),
        schema_version: "1.0",
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });

    it("rejects name over 100 characters", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "a".repeat(101),
        schema_version: "1.0",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe("schema_version validation", () => {
    it("rejects missing schema_version", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("rejects empty schema_version", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "",
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it.each([
      ["1.0", "major.minor"],
      ["1.0.0", "major.minor.patch"],
      ["2.0", "major version 2"],
      ["1.1.0", "minor update"],
    ])("accepts semantic version format: %s (%s)", (version) => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Test",
        schema_version: version,
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });
  });

  describe("description validation", () => {
    it("accepts description up to 1000 characters", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "1.0",
        description: "a".repeat(1000),
      };
      expect(LayoutMetadataSchema.safeParse(metadata).success).toBe(true);
    });

    it("rejects description over 1000 characters", () => {
      const metadata = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Homelab",
        schema_version: "1.0",
        description: "a".repeat(1001),
      };
      const result = LayoutMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// LayoutSchema Metadata Integration Tests
// ============================================================================

describe("LayoutSchema metadata integration", () => {
  /** Create a layout with metadata, optionally omitting certain fields */
  const createValidLayoutWithMetadata = (options?: {
    metadataOverrides?: Partial<{
      id: string;
      name: string;
      schema_version: string;
      description: string;
    }>;
    omitDescription?: boolean;
    omitSchemaVersion?: boolean;
  }) => {
    const baseMetadata = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "My Homelab",
      schema_version: "1.0",
      ...(options?.omitDescription
        ? {}
        : { description: "Basement setup for home automation" }),
      ...options?.metadataOverrides,
    };

    // Handle omitSchemaVersion by excluding schema_version from the object
    const metadata = options?.omitSchemaVersion
      ? {
          id: baseMetadata.id,
          name: baseMetadata.name,
          ...(options?.omitDescription
            ? {}
            : { description: baseMetadata.description }),
        }
      : baseMetadata;

    return {
      version: "0.7.0",
      name: "My Homelab",
      metadata,
      racks: [createTestRack({ id: "rack-1" })],
      device_types: [],
      settings: createTestLayoutSettings({ show_labels_on_images: true }),
    };
  };

  describe("layouts with metadata", () => {
    it("accepts layout with complete metadata", () => {
      const layout = createValidLayoutWithMetadata();
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toBeDefined();
        expect(result.data.metadata?.id).toBe(
          "550e8400-e29b-41d4-a716-446655440000",
        );
        expect(result.data.metadata?.name).toBe("My Homelab");
        expect(result.data.metadata?.schema_version).toBe("1.0");
        expect(result.data.metadata?.description).toBe(
          "Basement setup for home automation",
        );
      }
    });

    it("accepts layout with metadata without description", () => {
      const layout = createValidLayoutWithMetadata({ omitDescription: true });
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
    });

    it("rejects layout with invalid metadata id", () => {
      const layout = createValidLayoutWithMetadata({
        metadataOverrides: { id: "invalid-id" },
      });
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
    });

    it("rejects layout with missing metadata fields", () => {
      const layout = createValidLayoutWithMetadata({ omitSchemaVersion: true });
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
    });
  });

  describe("backwards compatibility", () => {
    it("accepts layout without metadata section (legacy format)", () => {
      const legacyLayout = {
        version: "0.7.0",
        name: "My Homelab",
        racks: [createTestRack({ id: "rack-1" })],
        device_types: [],
        settings: createTestLayoutSettings({ show_labels_on_images: true }),
      };
      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        // metadata should be undefined for legacy layouts
        expect(result.data.metadata).toBeUndefined();
      }
    });

    it("parsing legacy layout preserves existing behavior", () => {
      const legacyLayout = {
        version: "0.6.0",
        name: "Old Layout",
        racks: [
          createTestRack({
            id: "rack-1",
            devices: [
              {
                id: "device-1",
                device_type: "server",
                position: 10, // Old format position
                face: "front" as const,
              },
            ],
          }),
        ],
        device_types: [],
        settings: createTestLayoutSettings({ show_labels_on_images: true }),
      };
      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position migrates from human-readable U (1-indexed) to internal units (6 per U).
        // Legacy position 10 (U10) becomes 60 internal units (10 * 6).
        // This migration is handled by LayoutSchema's transform for version < 0.7.0.
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
        // metadata should be undefined
        expect(result.data.metadata).toBeUndefined();
      }
    });
  });
});
