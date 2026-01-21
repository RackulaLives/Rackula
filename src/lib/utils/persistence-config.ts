/**
 * Persistence Configuration
 * Reads environment variables to determine persistence mode
 */

/**
 * Whether persistence is enabled
 * Set via VITE_PERSIST_ENABLED at build time
 */
export const PERSIST_ENABLED: boolean =
  import.meta.env.VITE_PERSIST_ENABLED === "true";

/**
 * API base URL for persistence endpoints
 * Defaults to /api (proxied by nginx in Docker)
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Check if persistence features should be shown
 */
export function isPersistenceAvailable(): boolean {
  return PERSIST_ENABLED;
}
