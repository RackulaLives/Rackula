/**
 * Dev Build Toast
 *
 * Decides whether to show the dev-environment build info toast on app load
 * and formats its message. Detection is runtime via window.__RACKULA_CONFIG__
 * (written by container entrypoints), with the local Vite dev server always
 * showing the toast.
 */

import { formatRelativeTime } from "./buildTime";

/**
 * Read the deployment environment from the runtime config.
 * Returns undefined outside the browser or when the key is absent.
 */
export function getRuntimeEnv(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__RACKULA_CONFIG__?.env;
}

/**
 * Decide whether the dev build toast should be shown.
 *
 * @param configEnv - env value from the runtime config (window.__RACKULA_CONFIG__.env)
 * @param isViteDev - true when running under the local Vite dev server (import.meta.env.DEV)
 * @returns true only for the dev environment; absent or any other value suppresses
 */
export function shouldShowDevBuildToast(
  configEnv: string | undefined,
  isViteDev: boolean,
): boolean {
  if (isViteDev) return true;
  return configEnv === "dev";
}

/**
 * Format the dev build toast message, omitting unavailable build details.
 *
 * @param version - app version (e.g. "26.5.0")
 * @param commitHash - short commit hash, or "" when unavailable
 * @param buildTime - ISO 8601 build timestamp, or "" when unavailable
 * @param now - current time (defaults to new Date())
 * @returns e.g. "Dev build v26.5.0 (9e14975e, built 23 min ago)"
 */
export function formatDevBuildMessage(
  version: string,
  commitHash: string,
  buildTime: string,
  now: Date = new Date(),
): string {
  const details: string[] = [];
  if (commitHash) {
    details.push(commitHash);
  }
  if (buildTime) {
    details.push(`built ${formatRelativeTime(buildTime, now)} ago`);
  }
  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  return `Dev build v${version}${suffix}`;
}
