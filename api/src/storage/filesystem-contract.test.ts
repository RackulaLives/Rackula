/**
 * Runs the shared storage contract (#2091) against the filesystem driver.
 *
 * Each driver instance binds to a fresh temp DATA_DIR. The R2 driver runs the
 * same harness (src/storage/r2-contract.workers.ts) under vitest-pool-workers
 * to prove both uphold the atomic snapshot-on-mismatch invariant.
 */
import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStorageContract, type MakeDriver } from "./storage-contract";

const makeFilesystemDriver: MakeDriver = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "rackula-fs-contract-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  const restore = async () => {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  };

  // Restore DATA_DIR and remove the tempdir even if driver setup throws, so a
  // setup failure does not leak env state or the directory into later tests.
  try {
    const { createFilesystemDriver } = await import("./filesystem-driver");
    const driver = createFilesystemDriver();
    return { driver, cleanup: restore };
  } catch (error) {
    await restore();
    throw error;
  }
};

runStorageContract(makeFilesystemDriver, { describe, it, expect });
