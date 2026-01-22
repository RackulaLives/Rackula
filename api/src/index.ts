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
const maxAssetSize = parseInt(process.env.MAX_ASSET_SIZE ?? "5242880", 10);
app.use(
  "/api/assets/*",
  bodyLimit({
    maxSize: maxAssetSize,
    onError: (c) => c.json({ error: "File too large" }, 413),
  }),
);

// Mount routes
app.route("/api/layouts", layouts);
app.route("/api/assets", assets);

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Startup
const parsedPort = Number.parseInt(process.env.PORT ?? "3001", 10);
const port = Number.isNaN(parsedPort) ? 3001 : parsedPort;

await ensureDataDir();

console.log(`Rackula API listening on port ${port}`);
console.log(`Data directory: ${process.env.DATA_DIR ?? "/data"}`);

export default {
  port,
  fetch: app.fetch.bind(app),
};
