/**
 * Cloudflare R2 StorageDriver (#2625, slice 2 of #2133).
 *
 * Implements the same {@link StorageDriver} seam as the filesystem driver, but
 * backed by an R2 bucket binding, for the Workers runtime. Proven against the
 * shared storage contract (src/storage/r2-contract.workers.ts) under
 * vitest-pool-workers / Miniflare.
 *
 * Key layout (uuid lowercased so case-insensitive ids map to one object):
 *   layouts/{uuid}/layout.yaml                       the layout YAML
 *   layouts/{uuid}/snapshots/{base}~YYYYMMDD-HHMMSS[-N].yaml   pre-overwrite snapshots
 *   layouts/{uuid}/pre-carrier-backup.yaml           durable one-time backup
 *   layouts/{uuid}/assets/{deviceSlug}/{face}.{ext}  device images
 *
 * Concurrency model (per #2132 spike): R2 is strongly read-after-write
 * consistent and supports conditional PUT. saveLayout reads the current object,
 * snapshots it on echo divergence, then PUTs conditionally on the read etag; a
 * lost race returns null from put(), so the loser re-reads, snapshots the now
 * current copy, and retries. updatedAt is a strictly monotonic token in
 * customMetadata (R2 has no client-settable mtime).
 */
import * as yaml from "js-yaml";
import type { StorageDriver } from "./driver";
import {
  isUuid,
  slugify,
  LayoutFileSchema,
  type LayoutListItem,
} from "../schemas/layout";
import { SNAPSHOT_NAME_PATTERN } from "./snapshot-name";
import {
  ALLOWED_EXTS,
  validateAssetBytes,
  validateDeviceSlug,
  getContentTypeFromExt,
  type AssetFace,
  type AssetInfo,
} from "./asset-validation";

const MAX_SNAPSHOTS_PER_LAYOUT = 5;
const SAVE_MAX_ATTEMPTS = 6;
const PRE_CARRIER_BACKUP_KEY = "pre-carrier-backup.yaml";

/** The minimal R2 binding surface this driver uses (a subset of R2Bucket). */
export interface R2ObjectMeta {
  readonly key: string;
  readonly etag: string;
  readonly uploaded: Date;
  readonly size: number;
  readonly customMetadata?: Record<string, string>;
}
export interface R2ObjectBodyLike extends R2ObjectMeta {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2ListResult {
  objects: R2ObjectMeta[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}
export interface R2PutOnlyIf {
  etagMatches?: string;
  etagDoesNotMatch?: string;
}
export interface R2PutOptionsLike {
  onlyIf?: R2PutOnlyIf | Headers;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
}
export interface R2ListOptionsLike {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}
export interface R2BucketLike {
  head(key: string): Promise<R2ObjectMeta | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: R2PutOptionsLike,
  ): Promise<R2ObjectMeta | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptionsLike): Promise<R2ListResult>;
}

const LAYOUTS_PREFIX = "layouts/";

function layoutDir(uuid: string): string {
  return `${LAYOUTS_PREFIX}${uuid.toLowerCase()}/`;
}
function layoutKey(uuid: string): string {
  return `${layoutDir(uuid)}layout.yaml`;
}
function snapshotsPrefix(uuid: string): string {
  return `${layoutDir(uuid)}snapshots/`;
}
function assetsPrefix(uuid: string): string {
  return `${layoutDir(uuid)}assets/`;
}
function assetKey(
  uuid: string,
  deviceSlug: string,
  face: AssetFace,
  ext: string,
): string {
  return `${assetsPrefix(uuid)}${deviceSlug}/${face}.${ext}`;
}

/** Create-if-absent condition (If-None-Match: *). */
function ifAbsent(): Headers {
  return new Headers({ "If-None-Match": "*" });
}

/** Format a snapshot timestamp as YYYYMMDD-HHMMSS (UTC), matching the FS driver. */
function formatSnapshotTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * Mint a strictly-monotonic updatedAt token: at least the current time, and
 * always strictly greater than the previous token. R2 has no client-settable
 * mtime, so this token (stored in customMetadata) is the echo identity.
 */
function nextUpdatedAt(previous?: string): string {
  const now = Date.now();
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  const ms = Number.isNaN(previousMs) ? now : Math.max(now, previousMs + 1);
  return new Date(ms).toISOString();
}

/** A snapshot filename is a bare {base}~YYYYMMDD-HHMMSS[-N].yaml with no path. */
function isSafeSnapshotFilename(filename: string): boolean {
  if (filename.includes("/") || filename.includes("\\")) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- reject control chars (C0 + DEL)
  if (/[\u0000-\u001f\u007f]/.test(filename)) {
    return false;
  }
  return SNAPSHOT_NAME_PATTERN.test(filename);
}

/** Derive a snapshot base name from a layout body, mirroring the FS slug. */
function deriveSnapshotBase(yamlContent: string): string {
  try {
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA }) as
      | { name?: unknown; metadata?: { name?: unknown } }
      | null
      | undefined;
    const name = parsed?.metadata?.name ?? parsed?.name;
    return typeof name === "string" && name ? slugify(name) : "untitled";
  } catch {
    return "untitled";
  }
}

function countDevices(racks: Array<{ devices?: unknown[] }>): number {
  return racks.reduce((sum, rack) => sum + (rack.devices?.length ?? 0), 0);
}

/** Build a LayoutListItem from a stored layout body, mirroring the FS reader. */
function buildListItem(
  uuid: string,
  content: string,
  updatedAt: string,
): LayoutListItem {
  try {
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as unknown;
    const metadata = LayoutFileSchema.safeParse(parsed);
    if (metadata.success) {
      const racks = metadata.data.racks ?? [];
      return {
        id: uuid,
        name: metadata.data.name,
        version: metadata.data.version,
        updatedAt,
        rackCount: racks.length,
        deviceCount: countDevices(racks),
        valid: true,
      };
    }
  } catch {
    // fall through to the invalid shape below
  }
  return {
    id: uuid,
    name: uuid,
    version: "unknown",
    updatedAt,
    rackCount: 0,
    deviceCount: 0,
    valid: false,
  };
}

export function createR2Driver(bucket: R2BucketLike): StorageDriver {
  /** Collect every object under a prefix, following pagination. */
  async function listAll(prefix: string): Promise<R2ObjectMeta[]> {
    const out: R2ObjectMeta[] = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor });
      out.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  /** Collect the layout sub-prefixes (one per layout), following pagination. */
  async function listLayoutPrefixes(): Promise<string[]> {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({
        prefix: LAYOUTS_PREFIX,
        delimiter: "/",
        cursor,
      });
      out.push(...page.delimitedPrefixes);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  /** Delete oldest snapshots so at most MAX_SNAPSHOTS_PER_LAYOUT remain. */
  async function pruneSnapshots(uuid: string): Promise<void> {
    const objects = await listAll(snapshotsPrefix(uuid));
    objects.sort(
      (a, b) =>
        b.uploaded.getTime() - a.uploaded.getTime() ||
        b.key.localeCompare(a.key),
    );
    const stale = objects
      .slice(MAX_SNAPSHOTS_PER_LAYOUT)
      .map((object) => object.key);
    if (stale.length > 0) {
      await bucket.delete(stale);
    }
  }

  /** Write a snapshot with an exclusive (If-None-Match: *) create, then prune. */
  async function writeSnapshot(uuid: string, content: string): Promise<string> {
    const base = deriveSnapshotBase(content);
    const timestamp = formatSnapshotTimestamp(new Date());
    const prefix = snapshotsPrefix(uuid);
    let filename = `${base}~${timestamp}.yaml`;
    for (let suffix = 1; ; suffix += 1) {
      const put = await bucket.put(prefix + filename, content, {
        onlyIf: ifAbsent(),
      });
      if (put !== null) {
        break;
      }
      if (suffix > 1000) {
        throw new Error("writeSnapshot: too many snapshot-name collisions");
      }
      filename = `${base}~${timestamp}-${suffix}.yaml`;
    }
    await pruneSnapshots(uuid);
    return filename;
  }

  async function getLayout(uuid: string) {
    if (!isUuid(uuid)) {
      return null;
    }
    const object = await bucket.get(layoutKey(uuid));
    if (!object) {
      return null;
    }
    return {
      content: await object.text(),
      updatedAt:
        object.customMetadata?.updatedAt ?? object.uploaded.toISOString(),
    };
  }

  async function layoutExists(uuid: string): Promise<boolean> {
    if (!isUuid(uuid)) {
      return false;
    }
    return (await bucket.head(layoutKey(uuid))) !== null;
  }

  async function saveLayout(
    yamlContent: string,
    existingId?: string,
    echoedUpdatedAt?: string,
    options?: { preCarrierMigration?: boolean },
  ): Promise<{ id: string; isNew: boolean; updatedAt: string }> {
    // Parse + validate, matching the filesystem driver's error contract so the
    // route maps failures to 400 the same way on both backends.
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid YAML: ${message}`, { cause: e });
    }
    const layout = LayoutFileSchema.safeParse(parsed);
    if (!layout.success) {
      const issues = layout.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid layout metadata: ${issues}`);
    }

    // existingId is the authoritative URL identity. If it is present but not a
    // valid UUID, reject rather than silently minting a new layout under a
    // different id (the route validates the UUID, so this is defense in depth).
    if (existingId !== undefined && !isUuid(existingId)) {
      throw new Error(`Invalid layout UUID: ${existingId}`);
    }
    const metadataId = layout.data.metadata?.id;
    const validMetadataId =
      metadataId && isUuid(metadataId) ? metadataId : null;
    const uuid = existingId ?? validMetadataId ?? crypto.randomUUID();
    const key = layoutKey(uuid);

    for (let attempt = 0; attempt < SAVE_MAX_ATTEMPTS; attempt += 1) {
      const current = await bucket.get(key);
      const isNew = current === null;
      // Use the same token getLayout returns (customMetadata, falling back to
      // the R2 upload time) so the echo the client received matches what the
      // divergence check compares against, even for objects written without
      // customMetadata.updatedAt.
      const storedUpdatedAt = current
        ? (current.customMetadata?.updatedAt ?? current.uploaded.toISOString())
        : undefined;
      const updatedAt = nextUpdatedAt(storedUpdatedAt);

      if (current) {
        const diverged =
          echoedUpdatedAt !== undefined && storedUpdatedAt !== echoedUpdatedAt;
        // Read the prior bytes once if either the rolling snapshot (echo
        // divergence) or the durable pre-carrier backup needs them.
        const existingContent =
          diverged || options?.preCarrierMigration
            ? await current.text()
            : undefined;
        if (diverged && existingContent !== undefined) {
          await writeSnapshot(uuid, existingContent);
        }
        // Durable one-time pre-carrier backup: exclusive create, so a later
        // migrating save never clobbers the original (idempotent no-op).
        if (options?.preCarrierMigration && existingContent !== undefined) {
          await bucket.put(
            layoutDir(uuid) + PRE_CARRIER_BACKUP_KEY,
            existingContent,
            {
              onlyIf: ifAbsent(),
            },
          );
        }
      }

      const onlyIf: R2PutOnlyIf | Headers = current
        ? { etagMatches: current.etag }
        : ifAbsent();
      const put = await bucket.put(key, yamlContent, {
        onlyIf,
        customMetadata: { updatedAt },
        httpMetadata: { contentType: "text/yaml" },
      });
      if (put !== null) {
        return { id: uuid, isNew, updatedAt };
      }
      // Lost the conditional write: another writer changed the object between
      // our read and our PUT. Re-read, snapshot the now-current copy (the next
      // pass sees the divergence), and retry.
    }
    throw new Error(
      "saveLayout: too many conflicting concurrent writes for this layout",
    );
  }

  async function deleteLayout(uuid: string): Promise<boolean> {
    if (!isUuid(uuid)) {
      return false;
    }
    const existed = (await bucket.head(layoutKey(uuid))) !== null;
    const objects = await listAll(layoutDir(uuid));
    if (objects.length > 0) {
      await bucket.delete(objects.map((object) => object.key));
    }
    return existed;
  }

  async function listSnapshots(uuid: string) {
    if (!(await layoutExists(uuid))) {
      return null;
    }
    const prefix = snapshotsPrefix(uuid);
    const objects = await listAll(prefix);
    return objects
      .map((object) => ({
        filename: object.key.slice(prefix.length),
        timestamp: object.uploaded.toISOString(),
        size: object.size,
      }))
      .sort(
        (a, b) =>
          b.timestamp.localeCompare(a.timestamp) ||
          b.filename.localeCompare(a.filename),
      );
  }

  async function getSnapshot(
    uuid: string,
    filename: string,
  ): Promise<string | null> {
    if (!isUuid(uuid) || !isSafeSnapshotFilename(filename)) {
      return null;
    }
    const object = await bucket.get(snapshotsPrefix(uuid) + filename);
    return object ? object.text() : null;
  }

  async function saveSnapshot(uuid: string, yamlContent: string) {
    if (!(await layoutExists(uuid))) {
      return null;
    }
    const filename = await writeSnapshot(uuid, yamlContent);
    return { filename };
  }

  async function getPreCarrierBackup(uuid: string): Promise<string | null> {
    if (!isUuid(uuid)) {
      return null;
    }
    const object = await bucket.get(layoutDir(uuid) + PRE_CARRIER_BACKUP_KEY);
    return object ? object.text() : null;
  }

  async function listLayouts(): Promise<LayoutListItem[]> {
    const prefixes = await listLayoutPrefixes();
    const items: LayoutListItem[] = [];
    for (const prefix of prefixes) {
      const uuid = prefix.slice(LAYOUTS_PREFIX.length).replace(/\/$/, "");
      const object = await bucket.get(`${prefix}layout.yaml`);
      if (!object) {
        continue;
      }
      const content = await object.text();
      const updatedAt =
        object.customMetadata?.updatedAt ?? object.uploaded.toISOString();
      items.push(buildListItem(uuid, content, updatedAt));
    }
    return items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async function countLayouts(): Promise<number> {
    // Count actual layout.yaml objects (not raw prefixes) so the quota count
    // matches listLayouts: an orphan prefix left behind (e.g. assets/snapshots
    // without a layout file) must not count as a layout.
    const objects = await listAll(LAYOUTS_PREFIX);
    return objects.filter((object) => {
      const match = object.key.match(/^layouts\/([^/]+)\/layout\.yaml$/);
      return match?.[1] !== undefined && isUuid(match[1]);
    }).length;
  }

  async function countAssets(uuid: string): Promise<number> {
    if (!isUuid(uuid)) {
      return 0;
    }
    return (await listAll(assetsPrefix(uuid))).length;
  }

  async function getAsset(uuid: string, deviceSlug: string, face: AssetFace) {
    if (!isUuid(uuid) || !validateDeviceSlug(deviceSlug)) {
      return null;
    }
    for (const ext of ALLOWED_EXTS) {
      const object = await bucket.get(assetKey(uuid, deviceSlug, face, ext));
      if (object) {
        return {
          data: new Uint8Array(await object.arrayBuffer()),
          contentType: getContentTypeFromExt(ext),
        };
      }
    }
    return null;
  }

  async function saveAsset(
    uuid: string,
    deviceSlug: string,
    face: AssetFace,
    data: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    // Shared chokepoint (type allowlist, size cap, magic-byte sniff); the
    // extension comes from the sniffed bytes.
    const { ext } = validateAssetBytes(data, contentType);
    if (!isUuid(uuid)) {
      throw new Error(`Invalid layout UUID: ${uuid}`);
    }
    if (!validateDeviceSlug(deviceSlug)) {
      throw new Error(`Invalid device slug: ${deviceSlug}`);
    }
    if (!(await layoutExists(uuid))) {
      throw new Error(`Layout not found: ${uuid}`);
    }

    await bucket.put(assetKey(uuid, deviceSlug, face, ext), data, {
      httpMetadata: { contentType: getContentTypeFromExt(ext) },
    });

    // Remove any prior copy stored under a different extension for this face.
    for (const oldExt of ALLOWED_EXTS) {
      if (oldExt !== ext) {
        await bucket.delete(assetKey(uuid, deviceSlug, face, oldExt));
      }
    }
  }

  async function deleteAsset(
    uuid: string,
    deviceSlug: string,
    face: AssetFace,
  ): Promise<boolean> {
    if (!isUuid(uuid) || !validateDeviceSlug(deviceSlug)) {
      return false;
    }
    let deleted = false;
    for (const ext of ALLOWED_EXTS) {
      const key = assetKey(uuid, deviceSlug, face, ext);
      if (await bucket.head(key)) {
        await bucket.delete(key);
        deleted = true;
      }
    }
    return deleted;
  }

  async function listLayoutAssets(uuid: string): Promise<AssetInfo[]> {
    if (!isUuid(uuid)) {
      throw new Error(`Invalid layout UUID: ${uuid}`);
    }
    const prefix = assetsPrefix(uuid);
    const objects = await listAll(prefix);
    const assets: AssetInfo[] = [];
    for (const object of objects) {
      const rest = object.key.slice(prefix.length); // {deviceSlug}/{face}.{ext}
      const slash = rest.indexOf("/");
      if (slash < 0) {
        continue;
      }
      const deviceSlug = rest.slice(0, slash);
      const file = rest.slice(slash + 1);
      const match = file.match(/^(front|rear)\.(png|jpg|webp)$/);
      if (!match || !match[1] || !match[2] || !validateDeviceSlug(deviceSlug)) {
        continue;
      }
      assets.push({
        layoutId: uuid,
        deviceSlug,
        face: match[1] as AssetFace,
        ext: match[2],
        size: object.size,
      });
    }
    return assets;
  }

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
