/**
 * Runs the shared storage contract (#2091) against the filesystem driver.
 *
 * Each driver instance binds to a fresh temp DATA_DIR. The same harness will
 * later run against the R2 driver (#2133) to prove both uphold the atomic
 * snapshot-on-mismatch invariant.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runStorageContract,
  type StorageContractDriver,
} from "./storage-contract";

async function makeFilesystemDriver(): Promise<{
  driver: StorageContractDriver;
  cleanup: () => Promise<void>;
}> {
  const dataDir = await mkdtemp(join(tmpdir(), "rackula-fs-contract-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  const { saveLayout, getLayout } = await import("./filesystem");

  async function snapshotContents(id: string): Promise<string[]> {
    const entries = await readdir(dataDir, { withFileTypes: true });
    const folder = entries.find(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toLowerCase().endsWith(id.toLowerCase()),
    );
    if (!folder) {
      return [];
    }
    const snapshotsDir = join(dataDir, folder.name, "snapshots");
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

  const driver: StorageContractDriver = {
    async saveLayout(id, yamlContent, echoedUpdatedAt) {
      const result = await saveLayout(yamlContent, id, echoedUpdatedAt);
      return { updatedAt: result.updatedAt };
    },
    getLayout(id) {
      return getLayout(id);
    },
    getSnapshotContents(id) {
      return snapshotContents(id);
    },
  };

  return {
    driver,
    async cleanup() {
      if (previousDataDir === undefined) {
        delete process.env.DATA_DIR;
      } else {
        process.env.DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

runStorageContract(makeFilesystemDriver);
