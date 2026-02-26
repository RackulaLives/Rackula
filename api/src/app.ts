import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import {
  createAuthGateMiddleware,
  createCsrfProtectionMiddleware,
  createExpiredAuthSessionCookieHeader,
  createRefreshedAuthSessionCookieHeader,
  createWriteAuthMiddleware,
  invalidateAuthSession,
  resolveAuthenticatedSessionClaims,
  resolveApiSecurityConfig,
  type AuthSessionClaims,
  type EnvMap,
} from "./security";
import { createAuthHandler } from "./middleware/auth";
import { createAuth } from "./auth/config";
import { createRequireAdminMiddleware } from "./authorization";
import { configureAuthLogHashKey, safeLogAuthEvent } from "./auth-logger";

const DEFAULT_MAX_ASSET_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_LAYOUT_SIZE = 1 * 1024 * 1024; // 1MB
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
    ? createAuth(securityConfig.authSessionSecret)
    : undefined;

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

  if (securityConfig.authEnabled) {
    app.use(
      "*",
      createAuthGateMiddleware({
        ...authSessionConfig,
        authLoginPath: securityConfig.authLoginPath,
      }),
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

  /** Sets canonical auth context consumed by authorization middleware. */
  const setCanonicalAuthContext = (
    c: Context<AppEnv>,
    claims: AuthSessionClaims,
  ): void => {
    c.set("authSubject", claims.sub);
    c.set("authClaims", claims);
  };

  if (securityConfig.authEnabled) {
    const authApi = (auth?.api ?? {}) as Record<string, unknown>;
    const authPlugins = Array.isArray(auth?.options?.plugins)
      ? auth?.options?.plugins
      : [];
    const oidcApiAvailable =
      Boolean(auth) &&
      authPlugins.some(
        (plugin) => (plugin as { id?: unknown }).id === "generic-oauth",
      ) &&
      typeof authApi.signInSocial === "function" &&
      typeof authApi.callbackOAuth === "function";

    const authUnavailableRouteHandler = (c: Context<AppEnv>) =>
      c.json(
        {
          error: "Auth provider not configured",
          message:
            "Authentication is enabled, but login/callback handlers are not available.",
        },
        501,
      );

    const authLoginRouteHandler = (c: Context<AppEnv>) => {
      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      const loginTarget = new URL("/api/auth/sign-in/social", c.req.url);
      loginTarget.searchParams.set("provider", "oidc");
      return c.redirect(`${loginTarget.pathname}${loginTarget.search}`);
    };

    const authCallbackRouteHandler = (c: Context<AppEnv>) => {
      if (!oidcApiAvailable) {
        return authUnavailableRouteHandler(c);
      }

      const requestUrl = new URL(c.req.url);
      const callbackTarget = new URL("/api/auth/callback/oidc", c.req.url);
      callbackTarget.search = requestUrl.search;
      return c.redirect(`${callbackTarget.pathname}${callbackTarget.search}`);
    };

    const authCheckRouteHandler = (c: Context<AppEnv>) => {
      const claims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );
      if (!claims) {
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
      }

      setCanonicalAuthContext(c, claims);

      const refreshedCookie = createRefreshedAuthSessionCookieHeader(
        claims,
        authSessionConfig,
      );
      if (refreshedCookie) {
        c.header("Set-Cookie", refreshedCookie, { append: true });
      }

      return c.body(null, 204);
    };

    const authLogoutRouteHandler = (c: Context<AppEnv>) => {
      const claims = resolveAuthenticatedSessionClaims(
        c.req.raw,
        authSessionConfig,
      );
      if (claims) {
        setCanonicalAuthContext(c, claims);
        invalidateAuthSession(claims.sid, claims.exp);
        safeLogAuthEvent("auth.logout", c.req.raw, { subject: claims.sub });
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
