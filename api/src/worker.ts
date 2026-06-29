/**
 * Cloudflare Workers entry for the Rackula persistence API (#2626, slice 3 of
 * #2133).
 *
 * Runs the shared Hono app (src/app.ts) with the R2 storage driver wired from
 * the `LAYOUTS` bucket binding. The Worker runs AUTH_MODE=none unless
 * RACKULA_AUTH_MODE is set in env, so the argon2 local-auth path is never
 * reached and never enters the bundle (app.ts loads it via dynamic import).
 *
 * Cloudflare Access JWT validation (folded in from #2134) runs in front of the
 * app on `/api/*` and `/*` when configured (CF_ACCESS_* env vars). When those
 * are absent (local `wrangler dev`), validation is skipped so the smoke
 * endpoints return 200.
 *
 * The self-host / Bun entry (src/index.ts) is separate and keeps its node:fs
 * imports; this module is the only one the Worker bundle ships.
 */
import { createApp } from "./app";
import { createR2Driver, type R2BucketLike } from "./storage/r2-driver";
import {
  createAccessJwtValidator,
  resolveAccessJwtConfig,
  type AccessJwtValidator,
} from "./security/access-jwt";
import type { EnvMap } from "./security";
import { logger } from "./logger";

/** The Worker env bindings this entry reads. */
export interface WorkerEnv {
  /** R2 bucket binding the storage driver reads/writes. */
  LAYOUTS: R2BucketLike;
  /** String env the shared app and Access validator read (RACKULA_*, CF_ACCESS_*). */
  [key: string]: unknown;
}

type FetchHandler = (request: Request) => Response | Promise<Response>;

let appPromise: Promise<{ fetch: FetchHandler }> | null = null;
let cachedValidator: AccessJwtValidator | null = null;

/**
 * Narrow the Worker env to the string-keyed map the app/security code expects.
 * Non-string bindings (the R2 bucket) are dropped; only string env is passed.
 */
function toEnvMap(env: WorkerEnv): EnvMap {
  const out: EnvMap = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const envMap = toEnvMap(env);

    // Cloudflare Access validation runs before the app when configured.
    // Skipped (returns 200-eligible) when CF_ACCESS_* env vars are absent.
    if (!cachedValidator) {
      try {
        cachedValidator = createAccessJwtValidator(
          resolveAccessJwtConfig(envMap),
        );
      } catch (error) {
        // Misconfigured Access (e.g. a partial CF_ACCESS_* set). Fail closed:
        // deny the request and do not cache, so a corrected config takes effect
        // on the next request without needing a redeploy.
        logger.error(
          { err: error },
          "Cloudflare Access is misconfigured; denying request",
        );
        return Response.json(
          {
            error: "Service Unavailable",
            message: "Server authentication is misconfigured.",
          },
          { status: 503 },
        );
      }
    }
    const accessResult = await cachedValidator.validate(request);
    if (accessResult.status === "missing") {
      return Response.json(
        { error: "Unauthorized", message: "Cloudflare Access token required." },
        { status: 401 },
      );
    }
    if (accessResult.status === "invalid") {
      return Response.json(
        { error: "Forbidden", message: "Invalid Cloudflare Access token." },
        { status: 403 },
      );
    }

    // Build the app once and share the in-flight promise so concurrent
    // cold-start requests await the same construction instead of each creating
    // (and discarding) their own instance. Reset on failure so a transient
    // construction error does not permanently wedge the Worker.
    if (!appPromise) {
      appPromise = createApp(envMap, {
        storage: createR2Driver(env.LAYOUTS),
      }).catch((error) => {
        appPromise = null;
        throw error;
      });
    }
    const app = await appPromise;

    return app.fetch(request);
  },
};
