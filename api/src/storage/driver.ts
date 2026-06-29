/**
 * Storage driver interface (#2624 seam, #2625 R2 + quota/asset surface).
 *
 * The seam that lets the API serve layouts from different backends: the
 * filesystem (self-host / Bun) today, Cloudflare R2 (#2625) on Workers. Routes
 * and middleware resolve the driver per-request from the Hono context instead
 * of importing the filesystem free functions directly, so the backend is
 * selected once at the edge (createApp / the Workers entry) rather than baked
 * into every handler. The R2 driver implements this same interface and is
 * proven against the shared storage contract (#2091).
 */
import type { LayoutListItem } from "../schemas/layout";
import type { SnapshotListItem } from "./filesystem";
import type { AssetFace, AssetInfo } from "./asset-validation";

export interface StorageDriver {
  /** List all stored layouts. */
  listLayouts(): Promise<LayoutListItem[]>;
  /** Read a layout by UUID, or null if it does not exist. */
  getLayout(
    uuid: string,
  ): Promise<{ content: string; updatedAt: string } | null>;
  /**
   * Create or update a layout. `existingId` is the UUID from the URL (the
   * authoritative identity); when absent a new UUID is minted. `echoedUpdatedAt`
   * is the updatedAt the client last received; a mismatch with the stored copy
   * snapshots the diverged copy before overwriting it. Returns the stored copy's
   * new (strictly monotonic) updatedAt.
   */
  saveLayout(
    yamlContent: string,
    existingId?: string,
    echoedUpdatedAt?: string,
    options?: { preCarrierMigration?: boolean },
  ): Promise<{ id: string; isNew: boolean; updatedAt: string }>;
  /** Delete a layout by UUID. Returns false if it did not exist. */
  deleteLayout(uuid: string): Promise<boolean>;
  /** Whether a layout with this UUID exists. */
  layoutExists(uuid: string): Promise<boolean>;
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

  // Quota counts (#2625). The quota middleware consumes these instead of
  // scanning the filesystem, so it never imports a storage backend directly.
  /** Number of stored layouts (for the layout-count quota). */
  countLayouts(): Promise<number>;
  /** Number of image assets stored for a layout (for the per-layout quota). */
  countAssets(uuid: string): Promise<number>;

  // Asset storage (#2625). The magic-byte sniff is the shared write chokepoint
  // (asset-validation.ts); each driver only stores already-validated bytes.
  /** Read a device-image asset, or null if absent. */
  getAsset(
    layoutUuid: string,
    deviceSlug: string,
    face: AssetFace,
  ): Promise<{ data: Uint8Array; contentType: string } | null>;
  /**
   * Validate (magic-byte sniff, size cap, type allowlist) and store a
   * device-image asset. Throws on a bad upload; the extension is derived from
   * the sniffed bytes, never the declared content type.
   */
  saveAsset(
    layoutUuid: string,
    deviceSlug: string,
    face: AssetFace,
    data: ArrayBuffer,
    contentType: string,
  ): Promise<void>;
  /** Delete a device-image asset. Returns false if nothing was deleted. */
  deleteAsset(
    layoutUuid: string,
    deviceSlug: string,
    face: AssetFace,
  ): Promise<boolean>;
  /** List a layout's stored assets. */
  listLayoutAssets(layoutUuid: string): Promise<AssetInfo[]>;
}

/** Hono context Variables carrying the per-request storage driver. */
export type StorageVariables = { storage: StorageDriver };
