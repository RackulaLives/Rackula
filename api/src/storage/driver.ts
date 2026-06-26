/**
 * Storage driver interface (#2624, slice 1 of #2133).
 *
 * The seam that lets the API serve layouts from different backends: the
 * filesystem (self-host / Bun) today, Cloudflare R2 (#2625) next. Routes resolve
 * the driver per-request from the Hono context instead of importing the
 * filesystem free functions directly, so the backend is selected once at the
 * edge (createApp / the future Workers entry) rather than baked into every
 * handler. The R2 driver implements this same interface and is proven against
 * the shared storage contract (#2091).
 */
import type { LayoutListItem } from "../schemas/layout";
import type { SnapshotListItem } from "./filesystem";

export interface StorageDriver {
  /** List all stored layouts. */
  listLayouts(): Promise<LayoutListItem[]>;
  /** Read a layout by UUID, or null if it does not exist. */
  getLayout(
    uuid: string,
  ): Promise<{ content: string; updatedAt: string } | null>;
  /**
   * Create or update a layout. `echoedUpdatedAt` is the updatedAt the client
   * last received; a mismatch with the stored copy snapshots the diverged copy
   * before overwriting it. Returns the stored copy's new updatedAt.
   *
   * Argument order is (yamlContent, existingId, ...), matching the filesystem
   * free function. The #2091 contract harness (StorageContractDriver) takes
   * (id, yamlContent, ...), so its adapter swaps the two; keep that swap when
   * wiring a new driver into the contract. Slice 2 (#2625) aligns the orders.
   */
  saveLayout(
    yamlContent: string,
    existingId?: string,
    echoedUpdatedAt?: string,
    options?: { preCarrierMigration?: boolean },
  ): Promise<{ id: string; isNew: boolean; updatedAt: string }>;
  /** Delete a layout by UUID. Returns false if it did not exist. */
  deleteLayout(uuid: string): Promise<boolean>;
  /** List a layout's pre-overwrite snapshots, or null if the layout is missing. */
  listSnapshots(uuid: string): Promise<SnapshotListItem[] | null>;
  /** Read a single snapshot's YAML content, or null if not found. */
  getSnapshot(uuid: string, filename: string): Promise<string | null>;
  /**
   * Persist a losing local copy as a snapshot, or null if the layout is
   * missing.
   */
  saveSnapshot(
    uuid: string,
    yamlContent: string,
  ): Promise<{ filename: string } | null>;
  /** Read the durable pre-carrier-migration backup, or null if absent. */
  getPreCarrierBackup(uuid: string): Promise<string | null>;
}

/** Hono context Variables carrying the per-request storage driver. */
export type StorageVariables = { storage: StorageDriver };
