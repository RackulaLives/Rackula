/**
 * Shared application logger for the API.
 *
 * Built on pino, which gives real log levels (debug/info/warn/error), so debug
 * output is off by default in production and verbosity is controllable per
 * environment via the LOG_LEVEL environment variable.
 *
 * - level: LOG_LEVEL (default "info") so debug tracing is opt-in
 * - interactive terminal (TTY): pino-pretty transport for readable output
 * - everywhere else (production, CI, systemd, Docker): structured JSON to stdout
 *
 * Pretty output is gated on stdout being a TTY rather than on NODE_ENV, so CI,
 * test runs, and non-interactive production launches never spawn the pino-pretty
 * worker thread or require pino-pretty (a devDependency absent from production
 * installs).
 *
 * Usage:
 *   import { logger } from "./logger";
 *   logger.warn("quota exceeded");
 *   logger.error({ err }, "Failed to save layout");
 */
import pino from "pino";

const usePrettyOutput =
  process.env.NODE_ENV !== "production" && Boolean(process.stdout.isTTY);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(usePrettyOutput
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
});
