/**
 * Filesystem-backed StorageDriver (#2624).
 *
 * A thin adapter over the api/src/storage/filesystem.ts free functions;
 * behaviour is unchanged (per-layout write locks, atomic snapshot-on-mismatch,
 * monotonic updatedAt all live in filesystem.ts). This is the default driver
 * for the self-host / Bun runtime; the Workers runtime binds an R2 driver
 * (#2625) behind the same interface.
 */
import type { StorageDriver } from "./driver";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  listSnapshots,
  getSnapshot,
  saveSnapshot,
  getPreCarrierBackup,
} from "./filesystem";

/** Construct the filesystem storage driver. */
export function createFilesystemDriver(): StorageDriver {
  return {
    listLayouts,
    getLayout,
    saveLayout,
    deleteLayout,
    listSnapshots,
    getSnapshot,
    saveSnapshot,
    getPreCarrierBackup,
  };
}
