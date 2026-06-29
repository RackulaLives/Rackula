/**
 * Shared application logger for the API.
 *
 * Two runtimes share one `logger` surface so callers never branch:
 *
 * - Self-host / Bun: pino, which gives real log levels (debug/info/warn/error),
 *   so debug output is off by default in production and verbosity is
 *   controllable per environment via the LOG_LEVEL environment variable.
 *   - level: LOG_LEVEL (default "info") so debug tracing is opt-in
 *   - non-production interactive terminal (TTY): pino-pretty transport
 *   - everywhere else (production, CI, systemd, Docker): structured JSON to stdout
 * - Cloudflare Workers (#2626): a console.log JSON seam (logger-console.ts).
 *   pino reads `process.stdout.isTTY` at module load and ships a stream/worker
 *   transport that does not run on workerd, so the Workers path logs structured
 *   JSON via `console.log` instead. The Worker build also aliases `pino` to the
 *   console seam (wrangler.jsonc) so pino and its `node:fs` deps never enter the
 *   Worker bundle.
 *
 * Pretty output requires both a non-production environment and an interactive
 * TTY. The TTY check keeps CI, test runs, and non-interactive launches on JSON
 * (no pino-pretty worker thread), while the NODE_ENV check ensures production
 * never attempts pino-pretty (a devDependency absent from production installs)
 * even when attached to a terminal, e.g. `docker run -it`.
 *
 * Usage:
 *   import { logger } from "./logger";
 *   logger.warn("quota exceeded");
 *   logger.error({ err }, "Failed to save layout");
 */
import pino from "pino";
import { createConsoleJsonLogger, type Logger } from "./logger-console";

/**
 * Detect the Cloudflare Workers / workerd runtime.
 *
 * On Workers there is no `process.stdout`, which pino reads at module load. When
 * absent, fall back to the console-JSON seam.
 */
function isWorkersRuntime(): boolean {
  return (
    typeof process === "undefined" ||
    typeof process.stdout === "undefined" ||
    process.stdout === null
  );
}

function createLogger(): Logger {
  const level =
    (typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined) ??
    "info";

  if (isWorkersRuntime()) {
    return createConsoleJsonLogger(level as never);
  }

  const usePrettyOutput =
    process.env.NODE_ENV !== "production" && Boolean(process.stdout.isTTY);

  return pino({
    level,
    ...(usePrettyOutput
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, ignore: "pid,hostname" },
          },
        }
      : {}),
  });
}

export const logger = createLogger();
