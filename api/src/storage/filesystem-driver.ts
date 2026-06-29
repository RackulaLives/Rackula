/**
 * Filesystem-backed StorageDriver (#2624 seam, #2625 quota/asset surface).
 *
 * A thin adapter over the filesystem free functions; behaviour is unchanged
 * (per-layout write locks, atomic snapshot-on-mismatch, monotonic updatedAt,
 * magic-byte-sniffed assets all live in filesystem.ts / assets.ts). This is the
 * default driver for the self-host / Bun runtime; the Workers runtime binds an
 * R2 driver behind the same interface.
 */
import type { StorageDriver } from "./driver";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  layoutExists,
  listSnapshots,
  getSnapshot,
  saveSnapshot,
  getPreCarrierBackup,
  countLayouts,
  countAssets,
} from "./filesystem";
import { getAsset, saveAsset, deleteAsset, listLayoutAssets } from "./assets";

/** Construct the filesystem storage driver. */
export function createFilesystemDriver(): StorageDriver {
  return {
    listLayouts,
    getLayout,
    saveLayout,
    deleteLayout,
    layoutExists,
    listSnapshots,
    getSnapshot,
    saveSnapshot,
    getPreCarrierBackup,
    countLayouts,
    countAssets,
    getAsset,
    saveAsset,
    deleteAsset,
    listLayoutAssets,
  };
}
