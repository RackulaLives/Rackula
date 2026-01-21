/**
 * Persistence Configuration
 * Reads environment variables to determine persistence mode
 */

/**
 * Whether persistence is enabled
 * Set via VITE_PERSIST_ENABLED at build time
 * Uses global define from vite.config.ts (declared in vite-env.d.ts)
 */
export const PERSIST_ENABLED: boolean = __PERSIST_ENABLED__;

/**
 * API base URL for persistence endpoints
 * Defaults to /api (proxied by nginx in Docker)
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api";
