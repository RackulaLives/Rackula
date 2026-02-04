/**
 * Rackula API Sidecar
 * Provides persistence layer for self-hosted deployments
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import layouts from "./routes/layouts";
import assets from "./routes/assets";
import { ensureDataDir } from "./storage/filesystem";

const app = new Hono();

// Middleware
app.use("*", logger());
// CORS: Default wildcard is intentional for self-hosted deployments where nginx
// reverse-proxies the API at /api/*, making frontend and API share the same origin.
// The wildcard only applies when accessing the API directly (development/testing).
// For production with external API access, set CORS_ORIGIN=https://your-domain.com
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Health check
app.get("/health", (c) => c.text("OK"));

// Apply body size limit to asset uploads (5MB default, configurable via env)
const DEFAULT_MAX_ASSET_SIZE = 5 * 1024 * 1024; // 5MB
const parsedMaxAssetSize = parseInt(process.env.MAX_ASSET_SIZE ?? "", 10);
const maxAssetSize =
  Number.isFinite(parsedMaxAssetSize) && parsedMaxAssetSize > 0
    ? parsedMaxAssetSize
    : DEFAULT_MAX_ASSET_SIZE;
// Body size limits for asset uploads
const assetBodyLimit = bodyLimit({
  maxSize: maxAssetSize,
  onError: (c) => c.json({ error: "File too large" }, 413),
});
app.use("/assets/*", assetBodyLimit);
app.use("/api/assets/*", assetBodyLimit);

// Body size limits for layout data (YAML)
const layoutBodyLimit = bodyLimit({
  maxSize: 1 * 1024 * 1024, // 1MB — rack layouts are typically 10-50KB
  onError: (c) => c.json({ error: "Layout data too large" }, 413),
});
app.use("/layouts/*", layoutBodyLimit);
app.use("/api/layouts/*", layoutBodyLimit);

// Mount routes at root paths (nginx strips /api prefix when proxying)
app.route("/layouts", layouts);
app.route("/assets", assets);

// Compatibility aliases for direct API access (without nginx proxy)
// These allow clients to use /api/* paths when accessing the API directly
app.route("/api/layouts", layouts);
app.route("/api/assets", assets);
app.get("/api/health", (c) => c.text("OK"));

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Startup
// RACKULA_API_PORT preferred, PORT for backwards compatibility
const portEnv = process.env.RACKULA_API_PORT ?? process.env.PORT ?? "3001";
const parsedPort = Number.parseInt(portEnv, 10);
const port = Number.isNaN(parsedPort) ? 3001 : parsedPort;

await ensureDataDir();

console.log(`Rackula API listening on port ${port}`);
console.log(`Data directory: ${process.env.DATA_DIR ?? "/data"}`);

export default {
  port,
  fetch: app.fetch.bind(app),
};
