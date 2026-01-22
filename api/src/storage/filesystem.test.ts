/**
 * Filesystem storage tests
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Override DATA_DIR before importing storage module
const testDir = await mkdtemp(join(tmpdir(), "rackula-test-"));
process.env.DATA_DIR = testDir;

const { listLayouts, getLayout, saveLayout, deleteLayout, slugify } =
  await import("./filesystem");

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clean up all YAML files in the test directory
 */
async function cleanupTestDir(): Promise<void> {
  const files = await readdir(testDir);
  for (const file of files) {
    if (file.endsWith(".yaml") || file.endsWith(".yml")) {
      await rm(join(testDir, file));
    }
  }
}

interface DeviceInput {
  id: string;
}

interface RackInput {
  devices?: DeviceInput[];
}

interface LayoutYamlOptions {
  name: string;
  racks?: RackInput[];
}

/**
 * Create valid layout YAML for testing
 */
function createLayoutYaml(options: LayoutYamlOptions): string {
  const { name, racks = [] } = options;

  const racksYaml =
    racks.length === 0
      ? "racks: []"
      : `racks:\n${racks
          .map((rack) => {
            if (!rack.devices || rack.devices.length === 0) {
              return "  - devices: []";
            }
            const devicesYaml = rack.devices
              .map((d) => `      - id: ${d.id}`)
              .join("\n");
            return `  - devices:\n${devicesYaml}`;
          })
          .join("\n")}`;

  return `version: "1.0.0"\nname: ${name}\n${racksYaml}`;
}

describe("slugify", () => {
  it("converts name to lowercase slug", () => {
    expect(slugify("My Home Lab")).toBe("my-home-lab");
  });

  it("handles special characters", () => {
    expect(slugify("Rack #1 (Main)")).toBe("rack-1-main");
  });

  it("handles empty string with UUID suffix", () => {
    const result = slugify("");
    expect(result).toMatch(/^untitled-[a-f0-9]{8}$/);
  });

  it("handles all-Unicode names with UUID suffix", () => {
    const result = slugify("我的机架");
    expect(result).toMatch(/^untitled-[a-f0-9]{8}$/);
  });

  it("truncates long names", () => {
    const longName = "a".repeat(200);
    expect(slugify(longName).length).toBeLessThanOrEqual(100);
  });
});

describe("listLayouts", () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  it("returns empty array when no layouts exist", async () => {
    const layouts = await listLayouts();
    expect(layouts).toEqual([]);
  });

  it("lists valid YAML files with counts", async () => {
    const yaml = createLayoutYaml({
      name: "Test Layout",
      racks: [
        { devices: [{ id: "d1" }, { id: "d2" }] },
        { devices: [{ id: "d3" }] },
      ],
    });
    await writeFile(join(testDir, "test-layout.yaml"), yaml);

    const layouts = await listLayouts();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: one file created = one layout returned
    expect(layouts).toHaveLength(1);
    expect(layouts[0]?.id).toBe("test-layout");
    expect(layouts[0]?.name).toBe("Test Layout");
    expect(layouts[0]?.rackCount).toBe(2);
    expect(layouts[0]?.deviceCount).toBe(3);
    expect(layouts[0]?.valid).toBe(true);
  });

  it("marks invalid YAML files with valid: false", async () => {
    await writeFile(join(testDir, "invalid-layout.yaml"), `not valid yaml: [`);

    const layouts = await listLayouts();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: one file created = one layout returned
    expect(layouts).toHaveLength(1);
    expect(layouts[0]?.id).toBe("invalid-layout");
    expect(layouts[0]?.valid).toBe(false);
  });
});

describe("saveLayout and getLayout", () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  it("saves and retrieves layout", async () => {
    const yamlContent = createLayoutYaml({ name: "My Layout" });
    const result = await saveLayout(yamlContent);

    expect(result.id).toBe("my-layout");
    expect(result.isNew).toBe(true);

    const retrieved = await getLayout("my-layout");
    expect(retrieved).toBe(yamlContent);
  });

  it("detects existing layout as not new", async () => {
    const yamlContent = createLayoutYaml({ name: "Existing" });

    // First save - should be new
    const first = await saveLayout(yamlContent);
    expect(first.isNew).toBe(true);

    // Second save - should not be new
    const second = await saveLayout(yamlContent);
    expect(second.isNew).toBe(false);
  });

  it("handles rename by deleting old file", async () => {
    // Create original
    const originalContent = createLayoutYaml({ name: "Original" });
    await saveLayout(originalContent);

    // Verify original exists
    const original = await getLayout("original");
    expect(original).not.toBeNull();

    // Rename by saving with new name but passing old ID
    const renamedContent = createLayoutYaml({ name: "Renamed" });
    await saveLayout(renamedContent, "original");

    // Old file should be gone
    const oldLayout = await getLayout("original");
    expect(oldLayout).toBeNull();

    // New file should exist
    const newLayout = await getLayout("renamed");
    expect(newLayout).toContain("Renamed");
  });

  it("returns null for non-existent layout", async () => {
    const result = await getLayout("does-not-exist");
    expect(result).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const result = await getLayout("../../../etc/passwd");
    expect(result).toBeNull();
  });
});

describe("deleteLayout", () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  it("deletes existing layout", async () => {
    const yaml = createLayoutYaml({ name: "To Delete" });
    await writeFile(join(testDir, "to-delete.yaml"), yaml);

    const deleted = await deleteLayout("to-delete");
    expect(deleted).toBe(true);

    const result = await getLayout("to-delete");
    expect(result).toBeNull();
  });

  it("returns false for non-existent layout", async () => {
    const deleted = await deleteLayout("does-not-exist");
    expect(deleted).toBe(false);
  });

  it("rejects path traversal attempts", async () => {
    const deleted = await deleteLayout("../../../etc/passwd");
    expect(deleted).toBe(false);
  });
});

// Cleanup
afterAll(async () => {
  await rm(testDir, { recursive: true });
});
