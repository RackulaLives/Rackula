import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import { createTestLayout, createTestRack } from "./factories";
import { generateId } from "$lib/utils/device";
import type { Layout } from "$lib/types";

/**
 * Reject-newer-major schema gate (#2205).
 *
 * Policy (docs/reference/SCHEMA.md): a reader gates strictly on the MAJOR
 * component of metadata.schema_version. A document whose MAJOR is newer than
 * the running app understands is rejected non-destructively at the shared
 * validation ingress (parseLayoutYaml / LayoutSchema). Same-MAJOR (any MINOR)
 * loads; older MAJOR continues to migrate; absent schema_version reads as 1.0.
 */
function yamlWithSchemaVersion(
  schema_version: string | undefined,
): Promise<string> {
  const layout: Layout = createTestLayout({
    racks: [createTestRack({ devices: [] })],
    metadata:
      schema_version === undefined
        ? undefined
        : {
            id: generateId(),
            name: "Test Layout",
            schema_version,
          },
  });
  return serializeLayoutToYaml(layout);
}

describe("schema_version reject-newer-major gate (#2205)", () => {
  it("rejects a layout whose schema_version MAJOR is newer than the app", async () => {
    const yaml = await yamlWithSchemaVersion("2.0");
    await expect(parseLayoutYaml(yaml)).rejects.toThrow(/newer/i);
  });

  it("rejects a far-newer MAJOR (boundary is MAJOR, not exact match)", async () => {
    const yaml = await yamlWithSchemaVersion("99.0");
    await expect(parseLayoutYaml(yaml)).rejects.toThrow(/newer/i);
  });

  it("loads a same-MAJOR newer-MINOR layout (tolerant reader)", async () => {
    const yaml = await yamlWithSchemaVersion("1.5");
    const layout = await parseLayoutYaml(yaml);
    expect(layout.name).toBeTruthy();
  });

  it("loads when schema_version is absent (treated as 1.0)", async () => {
    const yaml = await yamlWithSchemaVersion(undefined);
    const layout = await parseLayoutYaml(yaml);
    expect(layout.name).toBeTruthy();
  });

  it("does not reject on the app version (top-level `version`) alone", async () => {
    // A future app `version` bump must never trigger the gate: it bumps every
    // release and is provenance only. schema_version stays at the current MAJOR.
    const layout: Layout = createTestLayout({
      version: "999.0.0",
      racks: [createTestRack({ devices: [] })],
      metadata: {
        id: generateId(),
        name: "Test Layout",
        schema_version: "1.0",
      },
    });
    const yaml = await serializeLayoutToYaml(layout);
    const restored = await parseLayoutYaml(yaml);
    expect(restored.name).toBeTruthy();
  });

  it("does not write or mutate the input YAML on the reject path", async () => {
    const yaml = await yamlWithSchemaVersion("2.0");
    const before = yaml;
    await expect(parseLayoutYaml(yaml)).rejects.toThrow();
    // The reject path is read-only: the input string is untouched.
    expect(yaml).toBe(before);
  });

  it("does not reject an older MAJOR (older majors migrate, never gate-reject)", async () => {
    // schema_version started at 1.0, so MAJOR 0 is the only older major. It must
    // fall through to the migration path, not be rejected by the newer-major gate.
    const yaml = await yamlWithSchemaVersion("0.9");
    const layout = await parseLayoutYaml(yaml);
    expect(layout.name).toBeTruthy();
  });
});
