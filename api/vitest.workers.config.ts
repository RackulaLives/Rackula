import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for the Workers-pool storage tests (#2625).
 *
 * Runs the shared storage contract against the R2 driver inside workerd via
 * Miniflare, with an in-memory R2 bucket bound as `LAYOUTS`. These specs are
 * named `*.workers.ts` (not `*.test.ts`) so `bun test` never picks them up; the
 * Bun runner owns the filesystem driver, this config owns the R2 driver.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2024-09-23",
        compatibilityFlags: ["nodejs_compat"],
        r2Buckets: ["LAYOUTS"],
      },
    }),
  ],
  test: {
    include: ["src/**/*.workers.ts"],
  },
});
