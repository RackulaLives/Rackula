import type { MiddlewareHandler } from "hono";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type AuthMode = "none" | "oidc" | "local";

export interface AuthSessionClaims {
  sub: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface ApiSecurityConfig {
  corsOrigin: string | string[];
  allowInsecureCors: boolean;
  isProduction: boolean;
  writeAuthToken?: string;
  authMode: AuthMode;
  authEnabled: boolean;
  authSessionSecret?: string;
  authSessionCookieName: string;
  authLoginPath: string;
}

export type EnvMap = Record<string, string | undefined>;

const WRITE_METHODS = new Set(["PUT", "DELETE"]);
const AUTH_MODES = new Set<AuthMode>(["none", "oidc", "local"]);
const AUTH_PUBLIC_PATHS = new Set([
  "/health",
  "/api/health",
  "/auth/login",
  "/auth/callback",
  "/auth/check",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/check",
]);
const API_ROUTE_PREFIXES = ["/api", "/layouts", "/assets"];
const SESSION_SECRET_MIN_LENGTH = 32;
const MAX_SIGNED_AUTH_SESSION_TOKEN_BYTES = 8 * 1024;
const MAX_SESSION_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_AUTH_COOKIE_NAME = "rackula_auth_session";
const DEFAULT_AUTH_LOGIN_PATH = "/auth/login";
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

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

  if (origins.length === 1) {
    return origins[0] ?? "";
  }

  return origins;
}

function hasWildcardOrigin(origin: string | string[]): boolean {
  if (typeof origin === "string") {
    return origin === "*";
  }
  return origin.includes("*");
}

function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim().toLowerCase() ?? "none";
  if (AUTH_MODES.has(normalized as AuthMode)) {
    return normalized as AuthMode;
  }

  throw new Error(
    `Invalid auth mode: "${value}". Supported values: none, oidc, local.`,
  );
}

function parseAuthCookieName(value: string | undefined): string {
  const cookieName = value?.trim() || DEFAULT_AUTH_COOKIE_NAME;
  if (!COOKIE_NAME_PATTERN.test(cookieName)) {
    throw new Error(
      `Invalid auth session cookie name: "${cookieName}". Use alphanumeric, '-' or '_' characters only.`,
    );
  }
  return cookieName;
}

function parseLoginPath(value: string | undefined): string {
  const path = value?.trim() || DEFAULT_AUTH_LOGIN_PATH;
  if (!path.startsWith("/")) {
    throw new Error(
      `Invalid auth login path: "${path}". Expected an absolute path like "/auth/login".`,
    );
  }
  if (path.includes("://")) {
    throw new Error(
      `Invalid auth login path: "${path}". External URLs are not allowed.`,
    );
  }
  return path;
}

function isApiRequestPath(pathname: string): boolean {
  return API_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.has(pathname);
}

function buildLoginRedirectUrl(requestUrl: string, loginPath: string): string {
  const url = new URL(requestUrl);
  const next = `${url.pathname}${url.search}`;
  return `${loginPath}?next=${encodeURIComponent(next)}`;
}

function extractCookieValue(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";");
  for (const rawCookie of cookies) {
    const trimmed = rawCookie.trim();
    if (trimmed.length === 0) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const name = trimmed.slice(0, separatorIndex);
    if (name !== cookieName) continue;

    const value = trimmed.slice(separatorIndex + 1).trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function createSessionSignature(payloadPart: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadPart).digest();
}

interface AuthSessionPayload {
  v: number;
  sub: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export function createSignedAuthSessionToken(
  claims: AuthSessionClaims,
  secret: string,
): string {
  const subject = claims.sub.trim();
  if (!subject) {
    throw new Error("Auth session claims must include a non-empty subject.");
  }

  const payload: AuthSessionPayload = {
    v: 1,
    sub: subject,
  };

  if (claims.role) {
    payload.role = claims.role;
  }
  payload.iat =
    typeof claims.iat === "number"
      ? claims.iat
      : Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number") {
    payload.exp = claims.exp;
  }

  const payloadPart = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signaturePart = createSessionSignature(payloadPart, secret).toString(
    "base64url",
  );

  return `${payloadPart}.${signaturePart}`;
}

export function verifySignedAuthSessionToken(
  token: string,
  secret: string,
): AuthSessionClaims | null {
  if (
    token.length === 0 ||
    token.length > MAX_SIGNED_AUTH_SESSION_TOKEN_BYTES
  ) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    return null;
  }

  let presentedSignature: Buffer;
  try {
    presentedSignature = Buffer.from(signaturePart, "base64url");
  } catch {
    return null;
  }

  const expectedSignature = createSessionSignature(payloadPart, secret);
  if (
    presentedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(presentedSignature, expectedSignature)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    const decoded = Buffer.from(payloadPart, "base64url").toString("utf-8");
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const payload = parsed as Partial<AuthSessionPayload>;
  if (payload.v !== 1 || typeof payload.sub !== "string" || !payload.sub.trim()) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: AuthSessionClaims = { sub: payload.sub.trim() };
  if (typeof payload.role === "string" && payload.role.length > 0) {
    claims.role = payload.role;
  }
  if (typeof payload.iat === "number" && Number.isFinite(payload.iat)) {
    if (now - payload.iat > MAX_SESSION_AGE_SECONDS) {
      return null;
    }
    claims.iat = payload.iat;
  }
  if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
    if (payload.exp <= now) {
      return null;
    }
    claims.exp = payload.exp;
  }
  if (claims.exp === undefined && claims.iat === undefined) {
    return null;
  }

  return claims;
}

export function resolveAuthenticatedSessionClaims(
  request: Request,
  securityConfig: Pick<
    ApiSecurityConfig,
    "authEnabled" | "authSessionSecret" | "authSessionCookieName"
  >,
): AuthSessionClaims | null {
  if (!securityConfig.authEnabled || !securityConfig.authSessionSecret) {
    return null;
  }

  const cookieHeader = request.headers.get("cookie");
  const token = extractCookieValue(cookieHeader, securityConfig.authSessionCookieName);
  if (!token) {
    return null;
  }

  return verifySignedAuthSessionToken(token, securityConfig.authSessionSecret);
}

export function resolveApiSecurityConfig(
  env: EnvMap = process.env,
): ApiSecurityConfig {
  const isProduction = env.NODE_ENV === "production";
  const allowInsecureCors = parseBoolean(env.ALLOW_INSECURE_CORS);
  const configuredOrigin = env.CORS_ORIGIN?.trim();
  const authMode = parseAuthMode(env.RACKULA_AUTH_MODE ?? env.AUTH_MODE);
  const authEnabled = authMode !== "none";

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

  const authSessionCookieName = parseAuthCookieName(
    env.RACKULA_AUTH_SESSION_COOKIE_NAME ?? env.AUTH_SESSION_COOKIE_NAME,
  );
  const authLoginPath = parseLoginPath(env.RACKULA_AUTH_LOGIN_PATH);
  const authSessionSecretRaw =
    env.RACKULA_AUTH_SESSION_SECRET ?? env.AUTH_SESSION_SECRET;
  const authSessionSecret = authSessionSecretRaw?.trim() || undefined;

  if (authEnabled && !authSessionSecret) {
    throw new Error(
      "AUTH_MODE is enabled but RACKULA_AUTH_SESSION_SECRET is not set.",
    );
  }

  if (
    authEnabled &&
    authSessionSecret &&
    authSessionSecret.length < SESSION_SECRET_MIN_LENGTH
  ) {
    throw new Error(
      `RACKULA_AUTH_SESSION_SECRET must be at least ${SESSION_SECRET_MIN_LENGTH} characters when auth is enabled.`,
    );
  }

  return {
    corsOrigin,
    allowInsecureCors,
    isProduction,
    writeAuthToken,
    authMode,
    authEnabled,
    authSessionSecret,
    authSessionCookieName,
    authLoginPath,
  };
}

export function createAuthGateMiddleware(
  securityConfig: Pick<
    ApiSecurityConfig,
    "authEnabled" | "authLoginPath" | "authSessionSecret" | "authSessionCookieName"
  >,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!securityConfig.authEnabled) {
      await next();
      return;
    }

    const { pathname } = new URL(c.req.url);
    if (isAuthPublicPath(pathname)) {
      await next();
      return;
    }

    const claims = resolveAuthenticatedSessionClaims(c.req.raw, securityConfig);
    if (claims) {
      c.set("authSubject", claims.sub);
      await next();
      return;
    }

    if (isApiRequestPath(pathname)) {
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    }

    return c.redirect(buildLoginRedirectUrl(c.req.url, securityConfig.authLoginPath));
  };
}

export function createWriteAuthMiddleware(
  writeAuthToken?: string,
): MiddlewareHandler {
  return async (c, next): Promise<void | Response> => {
    if (!WRITE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    if (!writeAuthToken) {
      await next();
      return;
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

    await next();
  };
}
