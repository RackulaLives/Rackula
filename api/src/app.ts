import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import {
  createSignedAuthSessionToken,
  createAuthGateMiddleware,
  createCsrfProtectionMiddleware,
  createExpiredAuthSessionCookieHeader,
  createRefreshedAuthSessionCookieHeader,
  createWriteAuthMiddleware,
  invalidateAuthSession,
  resolveAuthenticatedSessionClaims,
  resolveApiSecurityConfig,
  verifySignedAuthSessionToken,
  type AuthSessionClaims,
  type EnvMap,
} from "./security";
import { createAuthHandler } from "./middleware/auth";
import { createAuth } from "./auth/config";
import { createRequireAdminMiddleware } from "./authorization";
import { configureAuthLogHashKey, safeLogAuthEvent } from "./auth-logger";

const DEFAULT_MAX_ASSET_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_LAYOUT_SIZE = 1 * 1024 * 1024; // 1MB
const OIDC_PROVIDER_ID = "oidc";
const HEALTH_RESPONSE = {
  ok: true,
  status: "ok",
  service: "rackula-persistence-api",
  version: 1,
} as const;

type AppEnv = {
  Variables: {
    authSubject: string;
    authClaims: AuthSessionClaims | undefined;
  };
};

type BetterAuthSessionLike = {
  session: {
    id?: string;
    createdAt?: Date | string | number;
    expiresAt?: Date | string | number;
  };
  user: {
    id?: string | null;
    email?: string | null;
  };
};

type BetterAuthSessionApiResult = {
  headers?: Headers;
  response?: BetterAuthSessionLike | null;
};

function normalizeNextPath(next: string | undefined): string {
  if (!next) {
    return "/";
  }

  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) {
    return "/";
  }

  if (trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return "/";
  }

  return trimmed;
}

function readSetCookieHeaders(headers: Headers | undefined): string[] {
  if (!headers) {
    return [];
  }

  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  const rawSetCookie = headers.get("set-cookie");
  return rawSetCookie ? [rawSetCookie] : [];
}

function appendSetCookieHeaders(c: Context, headers: Headers | undefined): void {
  for (const setCookieHeader of readSetCookieHeaders(headers)) {
    c.header("Set-Cookie", setCookieHeader, { append: true });
  }
}

function toEpochSeconds(value: Date | string | number | undefined): number | null {
  if (value instanceof Date) {
    const epochSeconds = Math.floor(value.getTime() / 1000);
    return Number.isFinite(epochSeconds) ? epochSeconds : null;
  }

  if (typeof value === "string") {
    const epochSeconds = Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(epochSeconds) ? epochSeconds : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    // Handle millisecond timestamps (common for JS Date.getTime()) as well as second timestamps.
    const seconds = value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    return Number.isFinite(seconds) ? seconds : null;
  }

  return null;
}

function mapFallbackSessionClaims(
  session: BetterAuthSessionLike,
  authSessionConfig: {
    authSessionGeneration: number;
    authSessionIdleTimeoutSeconds: number;
  },
): AuthSessionClaims | null {
  const sessionId = session.session.id?.trim();
  if (!sessionId) {
    return null;
  }

  const issuedAt = toEpochSeconds(session.session.createdAt);
  const expiresAt = toEpochSeconds(session.session.expiresAt);
  if (!issuedAt || !expiresAt || expiresAt <= issuedAt) {
    return null;
  }

  // Use persisted creation metadata as fallback idle-timeout source of truth.
  // Do not derive idle expiry from request-time "now", which permits silent extension.
  const idleExpiresAt = Math.min(
    expiresAt,
    issuedAt + authSessionConfig.authSessionIdleTimeoutSeconds,
  );
  if (idleExpiresAt <= issuedAt) {
    return null;
  }

  const fallbackSubject =
    session.user.email?.trim() || session.user.id?.trim() || "oidc-user";
  if (!fallbackSubject) {
    return null;
  }

  return {
    sub: fallbackSubject,
    sid: sessionId,
    iat: issuedAt,
    exp: expiresAt,
    idleExp: idleExpiresAt,
    generation: authSessionConfig.authSessionGeneration,
    role: "admin",
  };
}

function validateFallbackSessionClaims(
  claims: AuthSessionClaims,
  authSessionConfig: {
    authSessionSecret?: string;
    authSessionGeneration: number;
    authSessionMaxAgeSeconds: number;
    authSessionIdleTimeoutSeconds: number;
  },
): AuthSessionClaims | null {
  if (!authSessionConfig.authSessionSecret) {
    return null;
  }

  try {
    const token = createSignedAuthSessionToken(
      claims,
      authSessionConfig.authSessionSecret,
      {
        sessionGeneration: authSessionConfig.authSessionGeneration,
        sessionMaxAgeSeconds: authSessionConfig.authSessionMaxAgeSeconds,
        sessionIdleTimeoutSeconds: authSessionConfig.authSessionIdleTimeoutSeconds,
      },
    );

    return verifySignedAuthSessionToken(token, authSessionConfig.authSessionSecret, {
      expectedGeneration: authSessionConfig.authSessionGeneration,
      maxSessionMaxAgeSeconds: authSessionConfig.authSessionMaxAgeSeconds,
    });
  } catch {
    return null;
  }
}

export function createApp(env: EnvMap = process.env): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const securityConfig = resolveApiSecurityConfig(env);
  configureAuthLogHashKey(securityConfig.authLogHashKey);

  if (securityConfig.isProduction && securityConfig.allowInsecureCors) {
    console.warn(
      "⚠ Running with wildcard CORS in production because ALLOW_INSECURE_CORS=true.",
    );
  }

  if (securityConfig.isProduction && !securityConfig.writeAuthToken) {
    console.warn(
      "⚠ Write-route auth token is not configured. Set RACKULA_API_WRITE_TOKEN to protect PUT/DELETE routes.",
    );
  }

  if (securityConfig.authEnabled) {
    console.warn(
      `🔒 Authentication gate enabled (mode=${securityConfig.authMode}). Anonymous access is blocked by default.`,
    );
  }

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: securityConfig.corsOrigin,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Better Auth instance — created with validated session secret
  const auth = securityConfig.authSessionSecret
    ? createAuth(securityConfig.authSessionSecret, env)
    : undefined;
  const authApi = (auth?.api ?? {}) as Record<string, unknown>;

  const authSessionConfig = {
    authEnabled: securityConfig.authEnabled,
    authSessionSecret: securityConfig.authSessionSecret,
    authSessionCookieName: securityConfig.authSessionCookieName,
    authSessionCookieSecure: securityConfig.authSessionCookieSecure,
    authSessionCookieSameSite: securityConfig.authSessionCookieSameSite,
    authSessionIdleTimeoutSeconds: securityConfig.authSessionIdleTimeoutSeconds,
    authSessionGeneration: securityConfig.authSessionGeneration,
    authSessionMaxAgeSeconds: securityConfig.authSessionMaxAgeSeconds,
  };

  const resolveFallbackClaims = async (
    requestHeaders: Headers,
  ): Promise<AuthSessionClaims | null> => {
    const getSession = authApi.getSession as
      | ((options: {
          headers: Headers;
          returnHeaders: boolean;
        }) => Promise<BetterAuthSessionApiResult>)
      | undefined;

    if (typeof getSession !== "function") {
      return null;
    }

    try {
      const fallbackSessionResult = await getSession({
        headers: requestHeaders,
        returnHeaders: true,
      });

      const mappedFallbackClaims = fallbackSessionResult.response
        ? mapFallbackSessionClaims(fallbackSessionResult.response, authSessionConfig)
        : null;
      return mappedFallbackClaims
        ? validateFallbackSessionClaims(mappedFallbackClaims, authSessionConfig)
        : null;
    } catch (error) {
      console.debug("auth: fallback session check failed", error);
      return null;
    }
  };

  if (securityConfig.authEnabled) {
    app.use(
      "*",
      createAuthGateMiddleware({
        ...authSessionConfig,
        authLoginPath: securityConfig.authLoginPath,
      }, (request) => resolveFallbackClaims(request.headers)),
    );
  }

  app.use(
    "*",
    createCsrfProtectionMiddleware({
      authEnabled: securityConfig.authEnabled,
      csrfProtectionEnabled: securityConfig.csrfProtectionEnabled,
      csrfTrustedOrigins: securityConfig.csrfTrustedOrigins,
      authSessionCookieName: securityConfig.authSessionCookieName,
    }),
  );

  if (securityConfig.authEnabled) {
    const authPlugins = Array.isArray(auth?.options?.plugins)
      ? auth?.options?.plugins
      : [];
    const oidcApiAvailable =
      Boolean(auth) &&
      securityConfig.authMode === "oidc" &&
      authPlugins.some(
        (plugin) => (plugin as { id?: unknown }).id === "generic-oauth",
      ) &&
      typeof authApi.signInWithOAuth2 === "function" &&
      typeof authApi.oAuth2Callback === "function";

    const authUnavailableRouteHandler = (c: Context<AppEnv>) =>
      c.json(
        {
          error: "Auth provider not configured",
          message:
            "Authentication is enabled, but login/callback handlers are not available.",
        },
        501,
      );

    const authLoginRouteHandler = async (c: Context<AppEnv>) => {
      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      try {
        const signInWithOAuth2 = authApi.signInWithOAuth2 as (options: {
          headers: Headers;
          body: {
            providerId: string;
            callbackURL: string;
          };
          returnHeaders: boolean;
        }) => Promise<{ headers?: Headers; response?: { url?: string } }>;

        const signInResult = await signInWithOAuth2({
          headers: c.req.raw.headers,
          body: {
            providerId: OIDC_PROVIDER_ID,
            callbackURL: normalizeNextPath(c.req.query("next")),
          },
          returnHeaders: true,
        });

        appendSetCookieHeaders(c, signInResult.headers);

        const redirectUrl = signInResult.response?.url;
        if (!redirectUrl) {
          throw new Error("OIDC provider did not return an authorization URL.");
        }

        return c.redirect(redirectUrl, 302);
      } catch (error) {
        console.error("OIDC login initiation failed:", error);
        return c.json(
          {
            error: "Authentication failed",
            message: "Unable to initiate OIDC login.",
          },
          502,
        );
      }
    };

    const authCallbackRouteHandler = async (c: Context<AppEnv>) => {
      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      const callbackUrl = new URL(c.req.url);
      callbackUrl.pathname = "/api/auth/oauth2/callback/oidc";
      const proxyRequest = new Request(callbackUrl.toString(), {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
      });
      return auth!.handler(proxyRequest);
    };

    const authCheckRouteHandler = async (c: Context<AppEnv>) => {
      const signedClaims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );

      if (signedClaims) {
        c.set("authSubject", signedClaims.sub);
        c.set("authClaims", signedClaims);

        const refreshedCookie = createRefreshedAuthSessionCookieHeader(
          signedClaims,
          authSessionConfig,
        );
        if (refreshedCookie) {
          c.header("Set-Cookie", refreshedCookie, { append: true });
        }

        return c.body(null, 204);
      }

      const fallbackClaims = await resolveFallbackClaims(c.req.raw.headers);
      if (fallbackClaims) {
        c.set("authSubject", fallbackClaims.sub);
        c.set("authClaims", fallbackClaims);
        return c.body(null, 204);
      }

      safeLogAuthEvent("auth.session.invalid", c.req.raw, {
        reason: "missing or invalid session cookie",
      });
      return c.json(
        {
          error: "Unauthorized",
          message: "Authentication required.",
        },
        401,
      );
    };

    const authLogoutRouteHandler = async (c: Context<AppEnv>) => {
      const signedClaims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );
      let logoutSubject: string | undefined = signedClaims?.sub;

      if (signedClaims) {
        c.set("authSubject", signedClaims.sub);
        c.set("authClaims", signedClaims);
        invalidateAuthSession(signedClaims.sid, signedClaims.exp);
      }

      const fallbackClaims = await resolveFallbackClaims(c.req.raw.headers);
      if (fallbackClaims) {
        invalidateAuthSession(fallbackClaims.sid, fallbackClaims.exp);
        if (!logoutSubject) {
          logoutSubject = fallbackClaims.sub;
        }
      }

      const signOut = authApi.signOut as
        | ((options: {
            headers: Headers;
            returnHeaders: boolean;
          }) => Promise<{ headers?: Headers }>)
        | undefined;
      if (typeof signOut === "function") {
        try {
          const signOutResult = await signOut({
            headers: c.req.raw.headers,
            returnHeaders: true,
          });
          appendSetCookieHeaders(c, signOutResult.headers);
        } catch (error) {
          console.debug("auth: provider sign-out failed", error);
        }
      }

      if (logoutSubject) {
        safeLogAuthEvent("auth.logout", c.req.raw, { subject: logoutSubject });
      }

      c.header(
        "Set-Cookie",
        createExpiredAuthSessionCookieHeader(authSessionConfig),
        { append: true },
      );
      return c.body(null, 204);
    };

    app.get("/auth/login", authLoginRouteHandler);
    app.get("/auth/callback", authCallbackRouteHandler);
    app.get("/auth/check", authCheckRouteHandler);
    app.post("/auth/logout", authLogoutRouteHandler);

    app.get("/api/auth/login", authLoginRouteHandler);
    app.get("/api/auth/callback", authCallbackRouteHandler);
    app.get("/api/auth/check", authCheckRouteHandler);
    app.post("/api/auth/logout", authLogoutRouteHandler);
  }

  // Better Auth routes handle auth endpoints for API consumers.
  if (auth) {
    const authHandler = createAuthHandler(auth);
    app.on(["POST", "GET"], "/api/auth/*", authHandler);
  }

  // Hono's "/path/*" pattern matches both "/path" and "/path/...".
  // Keep write-auth and body-limit middleware on matching wildcard path sets:
  // "/layouts/*", "/api/layouts/*", "/assets/*", "/api/assets/*".
  const writeAuth = createWriteAuthMiddleware(securityConfig.writeAuthToken);
  app.use("/layouts/*", writeAuth);
  app.use("/assets/*", writeAuth);
  app.use("/api/layouts/*", writeAuth);
  app.use("/api/assets/*", writeAuth);

  // Admin authorization for write operations when auth is enabled.
  // Runs after auth gate (which sets authClaims) and write-token auth.
  if (securityConfig.authEnabled) {
    const requireAdmin = createRequireAdminMiddleware();
    app.use("/layouts/*", requireAdmin);
    app.use("/assets/*", requireAdmin);
    app.use("/api/layouts/*", requireAdmin);
    app.use("/api/assets/*", requireAdmin);
  }

  // Health check
  app.get("/health", (c) => c.json(HEALTH_RESPONSE));
  app.get("/api/health", (c) => c.json(HEALTH_RESPONSE));

  // Apply body size limit to asset uploads (5MB default, configurable via env)
  const parsedMaxAssetSize = Number.parseInt(env.MAX_ASSET_SIZE ?? "", 10);
  const maxAssetSize =
    Number.isFinite(parsedMaxAssetSize) && parsedMaxAssetSize > 0
      ? parsedMaxAssetSize
      : DEFAULT_MAX_ASSET_SIZE;

  const assetBodyLimit = bodyLimit({
    maxSize: maxAssetSize,
    onError: (c) => c.json({ error: "File too large" }, 413),
  });

  app.use("/assets/*", assetBodyLimit);
  app.use("/api/assets/*", assetBodyLimit);

  // Body size limits for layout data (YAML)
  const layoutBodyLimit = bodyLimit({
    maxSize: DEFAULT_MAX_LAYOUT_SIZE,
    onError: (c) => c.json({ error: "Layout data too large" }, 413),
  });

  app.use("/layouts/*", layoutBodyLimit);
  app.use("/api/layouts/*", layoutBodyLimit);

  // Mount routes at root paths (nginx strips /api prefix when proxying)
  app.route("/layouts", layouts);
  app.route("/assets", assets);

  // Compatibility aliases for direct API access (without nginx proxy)
  app.route("/api/layouts", layouts);
  app.route("/api/assets", assets);

  // 404 handler
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // Error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
