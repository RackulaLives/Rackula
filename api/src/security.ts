import type { MiddlewareHandler } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";

export interface ApiSecurityConfig {
  corsOrigin: string | string[];
  allowInsecureCors: boolean;
  isProduction: boolean;
  writeAuthToken?: string;
}

export type EnvMap = Record<string, string | undefined>;

const WRITE_METHODS = new Set(["PUT", "DELETE"]);

function timingSafeTokenCompare(
  presentedToken: string,
  expectedToken: string,
): boolean {
  const presentedHash = createHash("sha256").update(presentedToken).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(presentedHash, expectedHash);
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function parseCorsOrigins(raw: string): string | string[] {
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(
      "CORS_ORIGIN is set but empty. Provide at least one origin.",
    );
  }

  return origins.length === 1 ? origins[0] : origins;
}

function hasWildcardOrigin(origin: string | string[]): boolean {
  if (typeof origin === "string") {
    return origin === "*";
  }
  return origin.includes("*");
}

export function resolveApiSecurityConfig(env: EnvMap = process.env): ApiSecurityConfig {
  const isProduction = env.NODE_ENV === "production";
  const allowInsecureCors = parseBoolean(env.ALLOW_INSECURE_CORS);
  const configuredOrigin = env.CORS_ORIGIN?.trim();

  let corsOrigin: string | string[];

  if (configuredOrigin) {
    corsOrigin = parseCorsOrigins(configuredOrigin);
  } else if (!isProduction) {
    corsOrigin = "*";
  } else if (allowInsecureCors) {
    corsOrigin = "*";
  } else {
    throw new Error(
      "Refusing to start in production without CORS_ORIGIN. Set CORS_ORIGIN=https://your-domain.com (or ALLOW_INSECURE_CORS=true to explicitly allow wildcard CORS).",
    );
  }

  if (isProduction && hasWildcardOrigin(corsOrigin) && !allowInsecureCors) {
    throw new Error(
      "Refusing to use wildcard CORS in production. Set ALLOW_INSECURE_CORS=true to opt in explicitly.",
    );
  }

  const writeAuthTokenRaw = env.RACKULA_API_WRITE_TOKEN ?? env.API_WRITE_TOKEN;
  const writeAuthToken = writeAuthTokenRaw?.trim() || undefined;

  return {
    corsOrigin,
    allowInsecureCors,
    isProduction,
    writeAuthToken,
  };
}

export function createWriteAuthMiddleware(
  writeAuthToken?: string,
): MiddlewareHandler {
  return (c, next) => {
    if (!WRITE_METHODS.has(c.req.method)) {
      return next();
    }

    if (!writeAuthToken) {
      return next();
    }

    const authorization = c.req.header("Authorization");
    if (!authorization) {
      return c.json(
        {
          error: "Unauthorized",
          message:
            "Missing write auth token. Provide Authorization: Bearer <token>.",
        },
        401,
      );
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json(
        {
          error: "Unauthorized",
          message:
            "Malformed Authorization header. Expected format: Bearer <token>.",
        },
        401,
      );
    }

    const presentedToken = match[1]?.trim();
    if (
      !presentedToken ||
      !timingSafeTokenCompare(presentedToken, writeAuthToken)
    ) {
      return c.json(
        {
          error: "Forbidden",
          message: "Invalid write auth token.",
        },
        403,
      );
    }

    return next();
  };
}
