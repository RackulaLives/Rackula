/**
 * Persistence Configuration
 * Runtime detection of API availability
 */

/**
 * API base URL for persistence endpoints
 * Defaults to /api (proxied by nginx in Docker)
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "/api";

// Note: PERSIST_ENABLED removed - use persistenceStore.isApiAvailable() instead
// See src/lib/stores/persistence.svelte.ts for runtime API detection
