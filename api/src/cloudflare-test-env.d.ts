/**
 * Ambient typing for the `cloudflare:test` virtual module provided by
 * vitest-pool-workers (#2625). Declared here (not in the spec) so the spec is a
 * plain module and the binding is typed against the minimal R2 surface the
 * driver uses; the real Miniflare binding is a structural superset.
 */
declare module "cloudflare:test" {
  import type { R2BucketLike } from "./storage/r2-driver";
  export const env: { LAYOUTS: R2BucketLike };
}
