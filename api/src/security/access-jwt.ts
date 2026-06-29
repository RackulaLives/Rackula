/**
 * Cloudflare Access JWT validation for the Workers entry (#2626, folded in from
 * #2134).
 *
 * Cloudflare Access puts a signed assertion in the `Cf-Access-Jwt-Assertion`
 * request header. This module validates it with `jose`: it fetches the Access
 * application's JWKS (a remote, cached key set) and verifies the token's
 * signature, issuer, and audience (AUD tag). Service tokens (used by CI smoke
 * and machine clients) carry the same assertion, so they pass the same check.
 *
 * Validation is conditional. It is only enforced when the three inputs are
 * configured via environment variables:
 *
 *   CF_ACCESS_JWKS_URL  the Access application's JWKS endpoint
 *   CF_ACCESS_ISSUER    the expected `iss` (the team domain, e.g.
 *                       https://<team>.cloudflareaccess.com)
 *   CF_ACCESS_AUD       the Access application AUD tag (the expected `aud`)
 *
 * When any of these is absent (for example local `wrangler dev` with
 * AUTH_MODE=none and no Access in front), validation is skipped so the smoke
 * endpoints return 200. When configured, a missing or invalid assertion yields
 * 401 (missing) or 403 (present but invalid).
 *
 * No values are hardcoded; all three are read from env. The real values are set
 * later by the dev cutover (#2675 / #2134).
 */
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import type { EnvMap } from "./types";

/** The header Cloudflare Access uses to carry the signed assertion. */
export const CF_ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

/** Resolved, validated Access configuration. */
export interface AccessJwtConfig {
  jwksUrl: string;
  issuer: string;
  audience: string;
}

/** Outcome of an Access JWT check. */
export type AccessJwtResult =
  | { status: "skipped" }
  | { status: "valid"; payload: JWTPayload }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

/**
 * Resolve the Access JWT config from env.
 *
 * @param env - Environment map (defaults to `process.env`).
 * @returns The config when all three inputs are set and non-empty; otherwise
 *   `null`, which means validation is skipped.
 */
export function resolveAccessJwtConfig(
  env: EnvMap = typeof process !== "undefined" ? process.env : {},
): AccessJwtConfig | null {
  const jwksUrl = env.CF_ACCESS_JWKS_URL?.trim();
  const issuer = env.CF_ACCESS_ISSUER?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();

  const present = [jwksUrl, issuer, audience].filter(Boolean).length;

  // None set: Access is not configured. This is the local `wrangler dev` /
  // AUTH_MODE=none mode where validation is skipped so the smoke endpoints
  // return 200. Production Access enforcement config is wired by the dev
  // cutover (#2134).
  if (present === 0) {
    return null;
  }

  // Partially set: an incomplete config must never silently disable the auth
  // gate (fail open). Treat it as a deploy-time misconfiguration and fail
  // closed by throwing, so it is caught instead of leaving the app exposed.
  // (The `||` below also narrows all three to `string` for the return.)
  if (!jwksUrl || !issuer || !audience) {
    throw new Error(
      "Cloudflare Access is partially configured: set all of " +
        "CF_ACCESS_JWKS_URL, CF_ACCESS_ISSUER, and CF_ACCESS_AUD, or none.",
    );
  }

  return { jwksUrl, issuer, audience };
}

/** A validator that checks a request's Access assertion. */
export interface AccessJwtValidator {
  /** True when Access validation is configured and enforced. */
  readonly enabled: boolean;
  /** Validate the `Cf-Access-Jwt-Assertion` header on a request. */
  validate(request: Request): Promise<AccessJwtResult>;
}

/** Test seam: inject a key-set resolver instead of a remote JWKS fetch. */
export interface CreateAccessJwtValidatorOptions {
  /**
   * Override the JWKS resolver. Defaults to `createRemoteJWKSet(jwksUrl)`.
   * Tests pass a local key set so no network fetch happens.
   */
  jwks?: JWTVerifyGetKey;
}

/**
 * Build an Access JWT validator.
 *
 * @param config - Resolved Access config, or `null` to disable (skip) validation.
 * @param options - Optional overrides (a test JWKS resolver).
 * @returns A validator whose `validate` returns `skipped` when disabled.
 */
export function createAccessJwtValidator(
  config: AccessJwtConfig | null,
  options: CreateAccessJwtValidatorOptions = {},
): AccessJwtValidator {
  if (!config) {
    return {
      enabled: false,
      validate: async () => ({ status: "skipped" }),
    };
  }

  let jwks: JWTVerifyGetKey;
  if (options.jwks) {
    jwks = options.jwks;
  } else {
    let jwksUrl: URL;
    try {
      jwksUrl = new URL(config.jwksUrl);
    } catch {
      // A configured-but-malformed JWKS URL is an operator error. Fail closed
      // (deny every request with a controlled 403) rather than letting
      // `new URL` throw uncaught on each request (repeated 500s), or silently
      // skipping Access (which would expose the app unauthenticated). The
      // reason is for server-side logs only; the Worker returns a generic 403.
      return {
        enabled: true,
        validate: async () => ({
          status: "invalid",
          reason: `CF_ACCESS_JWKS_URL is not a valid URL: ${config.jwksUrl}`,
        }),
      };
    }
    jwks = createRemoteJWKSet(jwksUrl);
  }

  return {
    enabled: true,
    async validate(request: Request): Promise<AccessJwtResult> {
      const token = request.headers.get(CF_ACCESS_JWT_HEADER)?.trim();
      if (!token) {
        return { status: "missing" };
      }

      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: config.issuer,
          audience: config.audience,
          // Cloudflare Access signs assertions with RS256. Pinning the accepted
          // algorithm prevents algorithm-substitution attacks (e.g. a token
          // forged with `alg: none` or an HMAC variant).
          algorithms: ["RS256"],
        });
        return { status: "valid", payload };
      } catch (error) {
        return {
          status: "invalid",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
