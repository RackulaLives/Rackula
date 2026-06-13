/**
 * Concurrency regression test for the pre-overwrite snapshot TOCTOU (#2091).
 *
 * Two overlapping saveLayout calls hit the same layout. The second carries a
 * stale echoed updatedAt, so it must snapshot the diverged copy before
 * overwriting. Without a write lock the snapshot decision (stat + read) and
 * the overwrite use separate handles, so a write landing between them is lost
 * without ever being snapshotted.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDataDir = process.env.DATA_DIR;
let testDir: string;

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const STALE_UPDATED_AT = "1999-01-01T00:00:00.000Z";

function createLayoutYaml(marker: string): string {
  return `version: "1.0.0"\nname: My Layout\ndescription: ${marker}\nracks: []`;
}

async function snapshotContents(uuid: string): Promise<string[]> {
  const entries = await readdir(testDir, { withFileTypes: true });
  const folder = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith(uuid),
  );
  if (!folder) {
    return [];
  }
  const snapshotsDir = join(testDir, folder.name, "snapshots");
  let files: string[];
  try {
    files = await readdir(snapshotsDir);
  } catch {
    return [];
  }
  return Promise.all(
    files.map((file) => readFile(join(snapshotsDir, file), "utf-8")),
  );
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "rackula-save-concurrency-"));
  process.env.DATA_DIR = testDir;
});

afterEach(async () => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
});

describe("saveLayout concurrency", () => {
  it("snapshots a diverged copy when a stale-echo write races a concurrent write", async () => {
    const { saveLayout } = await import("./filesystem");

    // Seed v1 so the folder exists.
    const seeded = await saveLayout(createLayoutYaml("v1"), TEST_UUID);

    const v2 = createLayoutYaml("v2");
    const v3 = createLayoutYaml("v3");

    // writerA echoes the real updatedAt: a no-conflict overwrite to v2.
    // writerB echoes a stale updatedAt and must snapshot whatever it is
    // about to overwrite. Launched together, the two saves interleave at
    // their await points. The bug: writerB's snapshot check can read the
    // pre-v2 copy (matching nothing it snapshots) while its later write
    // clobbers v2 (or A clobbers B) without that diverged copy surviving.
    const [, resB] = await Promise.all([
      saveLayout(v2, TEST_UUID, seeded.updatedAt),
      saveLayout(v3, TEST_UUID, STALE_UPDATED_AT),
    ]);

    expect(resB.updatedAt).toBeTruthy();

    // Whatever the final on-disk content is, the OTHER diverged copy that
    // got overwritten must have been captured as a snapshot. With the lock,
    // writes serialize and the stale-echo writer always snapshots the copy
    // it overwrites.
    const stored = await import("./filesystem").then((m) =>
      m.getLayout(TEST_UUID),
    );
    const finalContent = stored?.content ?? "";

    const snapshots = await snapshotContents(TEST_UUID);

    // The stale-echo save must always produce a snapshot of the copy it
    // overwrote, and that copy must differ from the final stored content
    // (no data silently lost).
    expect(snapshots.length).toBeGreaterThan(0);
    const overwrittenCopies = [v2, v3].filter((c) => c !== finalContent);
    for (const lost of overwrittenCopies) {
      expect(snapshots).toContain(lost);
    }
  });
});
