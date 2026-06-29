/**
 * Workers-only stub for `./storage/filesystem-driver` (#2626).
 *
 * The filesystem driver pulls in `node:fs` (via filesystem.ts / assets.ts),
 * which does not run on workerd. app.ts loads it via dynamic import only as the
 * default when no storage driver is injected; the Worker entry always injects
 * the R2 driver, so this default is never reached on Workers. Aliasing the
 * module to this stub (wrangler.jsonc `alias`) keeps the filesystem driver and
 * its `node:fs` dependency out of the Worker graph entirely. The factory throws
 * so any accidental reach fails loudly instead of silently degrading.
 */
import type { StorageDriver } from "../storage/driver";

export function createFilesystemDriver(): StorageDriver {
  throw new Error(
    "The filesystem storage driver is unavailable on Cloudflare Workers; the Worker entry must inject the R2 driver.",
  );
}
