/**
 * Rackula API Sidecar
 * Provides persistence layer for self-hosted deployments
 */
import { createApp } from "./app";
import { ensureDataDir } from "./storage/filesystem";

const app = createApp();

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
