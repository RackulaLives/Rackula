/**
 * Guards that every writer emits metadata.schema_version (issue #2227).
 *
 * The writers default schema_version to "1.0", so a happy-path layout always
 * carries it. The real failure mode is a refactor that drops the field from a
 * serializer: the saved file would then have no schema_version and a future
 * reader could not tell which format it is. These tests exercise the real
 * writer paths (YAML serializer and the multi-layout archive builder) and
 * assert schema_version survives into the bytes a user would save.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { serializeLayoutToYaml } from "$lib/utils/yaml";
import { createMultiLayoutArchive } from "$lib/utils/archive";
import type { ImageStoreMap } from "$lib/types/images";
import type { LayoutMetadata } from "$lib/types";
import { createTestLayout, createTestRack } from "./factories";

/** Read a generated archive blob and return the contents of its single YAML entry. */
async function readArchiveYaml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const yamlPath = Object.keys(zip.files).find((path) =>
    path.endsWith(".rackula.yaml"),
  );
  if (!yamlPath) {
    throw new Error("Archive contained no .rackula.yaml entry");
  }
  return zip.files[yamlPath]!.async("string");
}

describe("schema_version in serialized output", () => {
  it("appears in serialized YAML from the real writer", async () => {
    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1" })],
      metadata: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Homelab",
        schema_version: "1.0",
      },
    });

    const yaml = await serializeLayoutToYaml(layout);

    // Assert the value, not just the key: a serializer emitting an empty or
    // wrong value would still contain "schema_version" but defeat the guard.
    expect(yaml).toMatch(/schema_version:\s*["']?1\.0["']?/);
  });

  it("appears in the YAML inside a generated archive", async () => {
    const blob = await createMultiLayoutArchive([
      {
        layout: createTestLayout({
          name: "Homelab",
          racks: [createTestRack({ id: "rack-1" })],
        }),
        images: new Map() as ImageStoreMap,
        metadata: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Homelab",
          schema_version: "1.0",
        } satisfies LayoutMetadata,
      },
    ]);

    const yaml = await readArchiveYaml(blob);

    // Assert the value, not just the key: a serializer emitting an empty or
    // wrong value would still contain "schema_version" but defeat the guard.
    expect(yaml).toMatch(/schema_version:\s*["']?1\.0["']?/);
  });

  it("falls back to a default when metadata omits schema_version", async () => {
    // A layout whose metadata never set schema_version must still serialize one,
    // so saves and programmatic layouts are never written without it.
    const layout = createTestLayout({
      racks: [createTestRack({ id: "rack-1" })],
      metadata: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Homelab",
      } as LayoutMetadata,
    });

    const yaml = await serializeLayoutToYaml(layout);

    // Assert the value, not just the key: an empty string would still contain
    // "schema_version" but defeats the fallback this test guards.
    expect(yaml).toMatch(/schema_version:\s*["']?1\.0["']?/);
  });

  it("falls back to a default in the archive when schema_version is omitted", async () => {
    // Omit the entry metadata and the layout's schema_version so the archive
    // writer itself must supply the "1.0" default (addLayoutFolderToZip), the
    // same guarantee the YAML serializer gives above for the archive path.
    const blob = await createMultiLayoutArchive([
      {
        layout: createTestLayout({
          racks: [createTestRack({ id: "rack-1" })],
          metadata: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Homelab",
          } as LayoutMetadata,
        }),
        images: new Map() as ImageStoreMap,
      },
    ]);

    const yaml = await readArchiveYaml(blob);

    expect(yaml).toMatch(/schema_version:\s*["']?1\.0["']?/);
  });
});
