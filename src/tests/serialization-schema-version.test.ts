/**
 * Guards that every writer stamps metadata.schema_version (issues #2227, #3108).
 *
 * A layout re-saved after load and migration is in the current format, so the
 * writers stamp SCHEMA_VERSION over an older or absent stamp. A newer same-MAJOR
 * stamp is kept: unknown fields round-trip on save, so the file still carries
 * that format's additions. These tests exercise the real writer paths (YAML
 * serializer and the multi-layout archive builder) and read the stamp back out
 * of the saved bytes, asserting against the imported SCHEMA_VERSION so a future
 * bump needs no test changes.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { SCHEMA_VERSION, schemaVersionForWrite } from "$lib/schemas/migrations";
import { createLayout } from "$lib/utils/serialization";
import {
  parseLayoutYaml,
  parseYaml,
  serializeLayoutToYaml,
} from "$lib/utils/yaml";
import { createMultiLayoutArchive } from "$lib/utils/archive";
import type { ImageStoreMap } from "$lib/types/images";
import type { Layout, LayoutMetadata } from "$lib/types";
import { createTestLayout, createTestRack } from "./factories";

/** A 1.0-stamped upgrade-corpus fixture, exactly as a prior release wrote it. */
const priorReleaseYaml = (
  await import("./fixtures/upgrade-corpus/v26.7.0-representative.rackula.yaml?raw")
).default as string;

/** The stamp every release before #3108 wrote, whatever its actual format. */
const PRIOR_RELEASE_STAMP = "1.0";

/** A same-MAJOR stamp one MINOR newer than this app. */
function newerMinorStamp(): string {
  const [major, minor] = SCHEMA_VERSION.split(".").map(Number);
  return `${major}.${minor! + 1}`;
}

/** Layout metadata with the given stamp, or no schema_version key at all. */
function metadata(schemaVersion?: string): LayoutMetadata {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Homelab",
    ...(schemaVersion !== undefined && { schema_version: schemaVersion }),
  } as LayoutMetadata;
}

function layoutWith(layoutMetadata: LayoutMetadata): Layout {
  return createTestLayout({
    name: "Homelab",
    racks: [createTestRack({ id: "rack-1" })],
    metadata: layoutMetadata,
  });
}

/** Read metadata.schema_version out of saved YAML bytes. */
async function stampOf(yaml: string): Promise<unknown> {
  const doc = await parseYaml<{ metadata?: { schema_version?: unknown } }>(
    yaml,
  );
  return doc.metadata?.schema_version;
}

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

describe("createLayout schema_version", () => {
  it("stamps a new layout with the current SCHEMA_VERSION", () => {
    expect(createLayout("Homelab").metadata?.schema_version).toBe(
      SCHEMA_VERSION,
    );
  });
});

describe("schema_version in serialized YAML", () => {
  it("restamps a prior-release layout with SCHEMA_VERSION when re-saved", async () => {
    expect(await stampOf(priorReleaseYaml)).toBe(PRIOR_RELEASE_STAMP);

    const loaded = await parseLayoutYaml(priorReleaseYaml);
    const resaved = await serializeLayoutToYaml(loaded);

    expect(await stampOf(resaved)).toBe(SCHEMA_VERSION);
  });

  it("falls back to SCHEMA_VERSION when metadata omits schema_version", async () => {
    const yaml = await serializeLayoutToYaml(layoutWith(metadata()));

    expect(await stampOf(yaml)).toBe(SCHEMA_VERSION);
  });

  it("keeps a newer same-MAJOR stamp so round-tripped additions are not misdescribed", async () => {
    const newer = newerMinorStamp();

    const yaml = await serializeLayoutToYaml(layoutWith(metadata(newer)));

    expect(await stampOf(yaml)).toBe(newer);
  });
});

describe("schema_version in a generated archive", () => {
  it("restamps a prior-release stamp in supplied entry metadata", async () => {
    const blob = await createMultiLayoutArchive([
      {
        layout: layoutWith(metadata()),
        images: new Map() as ImageStoreMap,
        metadata: metadata(PRIOR_RELEASE_STAMP),
      },
    ]);

    expect(await stampOf(await readArchiveYaml(blob))).toBe(SCHEMA_VERSION);
  });

  it("restamps a prior-release stamp when no entry metadata is given", async () => {
    const blob = await createMultiLayoutArchive([
      {
        layout: layoutWith(metadata(PRIOR_RELEASE_STAMP)),
        images: new Map() as ImageStoreMap,
      },
    ]);

    expect(await stampOf(await readArchiveYaml(blob))).toBe(SCHEMA_VERSION);
  });

  it("falls back to SCHEMA_VERSION when schema_version is omitted", async () => {
    const blob = await createMultiLayoutArchive([
      {
        layout: layoutWith(metadata()),
        images: new Map() as ImageStoreMap,
      },
    ]);

    expect(await stampOf(await readArchiveYaml(blob))).toBe(SCHEMA_VERSION);
  });
});

describe("schemaVersionForWrite", () => {
  it("stamps SCHEMA_VERSION over an older, absent, empty, or malformed stamp", () => {
    for (const stamp of [PRIOR_RELEASE_STAMP, undefined, "", "not-a-version"]) {
      expect(schemaVersionForWrite(stamp), String(stamp)).toBe(SCHEMA_VERSION);
    }
  });

  it("does not keep a malformed stamp even when its numeric prefix is newer", () => {
    const newer = newerMinorStamp();
    for (const stamp of [`${newer}x`, `${newer}-beta`, `${newer}.0`]) {
      expect(schemaVersionForWrite(stamp), stamp).toBe(SCHEMA_VERSION);
    }
  });

  it("restamps a newer-MAJOR stamp instead of keeping it", () => {
    const [major] = SCHEMA_VERSION.split(".").map(Number);

    expect(schemaVersionForWrite(`${major! + 1}.0`)).toBe(SCHEMA_VERSION);
  });
});
