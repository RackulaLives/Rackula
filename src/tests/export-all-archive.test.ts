/**
 * Export-all archive tests (#2045)
 *
 * Covers the multi-layout ZIP builder and its filename helper. These bundle
 * each layout's existing folder-archive form into one artifact, so the round
 * trip (build -> re-extract one layout's folder) and the single-layout
 * degraded path are the load-bearing behaviours.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  createMultiLayoutArchive,
  extractFolderArchive,
  generateExportAllFilename,
  type LayoutArchiveEntry,
} from "$lib/utils/archive";
import type { ImageStoreMap } from "$lib/types/images";
import type { LayoutMetadata } from "$lib/types";
import { createTestLayout, createTestRack } from "./factories";

function entry(
  name: string,
  id: string,
  overrides: Partial<LayoutArchiveEntry> = {},
): LayoutArchiveEntry {
  return {
    layout: createTestLayout({
      name,
      racks: [createTestRack({ id: `${id}-rack`, name: `${name} Rack` })],
    }),
    images: new Map() as ImageStoreMap,
    metadata: { id, name, schema_version: "1.0" } satisfies LayoutMetadata,
    ...overrides,
  };
}

/** Read the top-level folder names inside a generated ZIP blob. */
async function topLevelFolders(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const folders = new Set<string>();
  for (const path of Object.keys(zip.files)) {
    const top = path.split("/")[0];
    if (top) folders.add(top);
  }
  return [...folders];
}

describe("createMultiLayoutArchive", () => {
  it("bundles one folder per layout into a single ZIP", async () => {
    const blob = await createMultiLayoutArchive([
      entry("Homelab", "11111111-1111-4111-8111-111111111111"),
      entry("Closet", "22222222-2222-4222-8222-222222222222"),
    ]);

    const folders = await topLevelFolders(blob);
    expect(folders).toContain("Homelab-11111111-1111-4111-8111-111111111111");
    expect(folders).toContain("Closet-22222222-2222-4222-8222-222222222222");
    // eslint-disable-next-line no-restricted-syntax -- two layouts in -> exactly two folders out
    expect(folders).toHaveLength(2);
  });

  it("keeps each layout independently extractable from the bundle", async () => {
    const blob = await createMultiLayoutArchive([
      entry("Homelab", "11111111-1111-4111-8111-111111111111"),
    ]);

    // A single entry degrades to today's single-layout archive shape, so the
    // existing extractor reads it back without special-casing export-all.
    const result = await extractFolderArchive(blob);
    expect(result.layout.name).toBe("Homelab");
    expect(result.failedImages).toEqual([]);
  });

  it("rejects an empty layout set rather than emitting an empty ZIP", async () => {
    await expect(createMultiLayoutArchive([])).rejects.toThrow();
  });
});

describe("generateExportAllFilename", () => {
  it("stamps the artifact with a sortable local timestamp", () => {
    const at = new Date(2026, 5, 14, 9, 3, 7); // 2026-06-14 09:03:07 local
    expect(generateExportAllFilename(at)).toBe(
      "rackula-export-20260614-090307.zip",
    );
  });
});
