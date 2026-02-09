import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import {
  createWriteAuthMiddleware,
  resolveApiSecurityConfig,
  type EnvMap,
} from "./security";

const DEFAULT_MAX_ASSET_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_LAYOUT_SIZE = 1 * 1024 * 1024; // 1MB

export function createApp(env: EnvMap = process.env): Hono {
  const app = new Hono();
  const securityConfig = resolveApiSecurityConfig(env);

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

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: securityConfig.corsOrigin,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Hono's "/path/*" pattern matches both "/path" and "/path/...".
  // Keep write-auth and body-limit middleware on matching wildcard path sets:
  // "/layouts/*", "/api/layouts/*", "/assets/*", "/api/assets/*".
  const writeAuth = createWriteAuthMiddleware(securityConfig.writeAuthToken);
  app.use("/layouts/*", writeAuth);
  app.use("/assets/*", writeAuth);
  app.use("/api/layouts/*", writeAuth);
  app.use("/api/assets/*", writeAuth);

  // Health check
  app.get("/health", (c) => c.text("OK"));
  app.get("/api/health", (c) => c.text("OK"));

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
