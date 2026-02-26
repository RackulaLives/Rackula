import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import {
  createCsrfProtectionMiddleware,
  createWriteAuthMiddleware,
  resolveApiSecurityConfig,
  type AuthSessionClaims,
  type EnvMap,
} from "./security";
import {
  createAuthHandler,
  createOptionalAuthMiddleware,
} from "./middleware/auth";
import { createAuth } from "./auth/config";
import { createRequireAdminMiddleware } from "./authorization";
import { configureAuthLogHashKey } from "./auth-logger";

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

  // Better Auth optional middleware - attaches session if present, never blocks
  // This preserves core value: "design with zero friction" (unauthenticated read access)
  if (auth) {
    app.use("*", createOptionalAuthMiddleware(auth));
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

  // Better Auth routes handle all authentication endpoints
  // Mounted at both /auth/* and /api/auth/* for compatibility
  if (auth) {
    const authHandler = createAuthHandler(auth);
    app.on(["POST", "GET"], "/auth/*", authHandler);
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
