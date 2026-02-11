/**
 * Filesystem storage tests
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUuid } from "../schemas/layout";

// Override DATA_DIR before importing storage module
const testDir = await mkdtemp(join(tmpdir(), "rackula-test-"));
process.env.DATA_DIR = testDir;

const { listLayouts, getLayout, saveLayout, deleteLayout, slugify } =
  await import("./filesystem");

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Clean up all files/folders in the test directory
 */
async function cleanupTestDir(): Promise<void> {
  const files = await readdir(testDir);
  for (const file of files) {
    await rm(join(testDir, file), { recursive: true, force: true });
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

  it("falls back to untitled for empty string", () => {
    expect(slugify("")).toBe("untitled");
  });

  it("falls back to untitled for all-Unicode names", () => {
    expect(slugify("我的机架")).toBe("untitled");
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

  it("lists UUID-based folder layouts with counts", async () => {
    const yaml = createLayoutYaml({
      name: "Folder Layout",
      racks: [{ devices: [{ id: "d1" }] }],
    });
    const created = await saveLayout(yaml);

    const layouts = await listLayouts();
    const found = layouts.find((layout) => layout.id === created.id);

    expect(found).toBeDefined();
    expect(found?.name).toBe("Folder Layout");
    expect(found?.rackCount).toBe(1);
    expect(found?.deviceCount).toBe(1);
    expect(found?.valid).toBe(true);
    expect(isUuid(created.id)).toBe(true);
  });

  it("deduplicates legacy files when migrated folder layout exists", async () => {
    const yaml = createLayoutYaml({ name: "Duplicate Layout" });
    const created = await saveLayout(yaml);

    // Simulate interrupted migration where old flat file was not deleted yet.
    await writeFile(join(testDir, "duplicate-layout.yaml"), yaml);

    const layouts = await listLayouts();
    const folderLayout = layouts.find((layout) => layout.id === created.id);
    const legacyLayout = layouts.find((layout) => layout.id === "duplicate-layout");

    expect(folderLayout).toBeDefined();
    expect(legacyLayout).toBeUndefined();
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: duplicate migration state should return one logical layout
    expect(layouts).toHaveLength(1);
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

    expect(isUuid(result.id)).toBe(true);
    expect(result.isNew).toBe(true);

    const retrieved = await getLayout(result.id);
    expect(retrieved).toBe(yamlContent);
  });

  it("detects existing layout as not new", async () => {
    const yamlContent = createLayoutYaml({ name: "Existing" });

    // First save - should be new
    const first = await saveLayout(yamlContent);
    expect(first.isNew).toBe(true);

    // Second save with the same UUID - should be update, not create
    const second = await saveLayout(yamlContent, first.id);
    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("keeps the same UUID and updates content on rename", async () => {
    // Create original
    const originalContent = createLayoutYaml({ name: "Original" });
    const created = await saveLayout(originalContent);

    // Verify original exists via UUID
    const original = await getLayout(created.id);
    expect(original).not.toBeNull();

    // Rename by saving with same UUID but different name
    const renamedContent = createLayoutYaml({ name: "Renamed" });
    const renamed = await saveLayout(renamedContent, created.id);

    // UUID remains stable and content is updated
    expect(renamed.id).toBe(created.id);
    const current = await getLayout(created.id);
    expect(current).toContain("Renamed");
  });

  it("returns null for non-existent layout", async () => {
    const result = await getLayout("does-not-exist");
    expect(result).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const result = await getLayout("../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("does not use traversal-style existingId for legacy file migration", async () => {
    const marker = `rackula-traversal-${Date.now()}`;
    const outsidePath = join(testDir, "..", `${marker}.yaml`);
    await writeFile(outsidePath, "version: 1.0.0\nname: Outside\nracks: []");

    try {
      const yamlContent = createLayoutYaml({ name: "Safe Save" });
      const result = await saveLayout(yamlContent, `../${marker}`);

      expect(isUuid(result.id)).toBe(true);
      expect(result.isNew).toBe(true);
      expect(await readFile(outsidePath, "utf-8")).toContain("Outside");
    } finally {
      await rm(outsidePath, { force: true });
    }
  });

  it("restores legacy assets when migration rolls back", async () => {
    const slug = "legacy-layout";
    const yamlContent = createLayoutYaml({ name: "Legacy Layout" });

    await writeFile(join(testDir, `${slug}.yml`), yamlContent);
    await mkdir(join(testDir, `${slug}.yaml`));

    const legacyAssetsDir = join(testDir, "assets", slug);
    await mkdir(legacyAssetsDir, { recursive: true });
    await writeFile(join(legacyAssetsDir, "front.png"), "asset-data");

    await expect(saveLayout(yamlContent, slug)).rejects.toThrow();

    const restoredAsset = await readFile(join(legacyAssetsDir, "front.png"), "utf-8");
    expect(restoredAsset).toBe("asset-data");
  });
});

describe("deleteLayout", () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  it("deletes existing layout", async () => {
    const yaml = createLayoutYaml({ name: "To Delete" });
    const created = await saveLayout(yaml);

    const deleted = await deleteLayout(created.id);
    expect(deleted).toBe(true);

    const result = await getLayout(created.id);
    expect(result).toBeNull();
  });

  it("returns false for non-existent layout", async () => {
    const deleted = await deleteLayout(crypto.randomUUID());
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
