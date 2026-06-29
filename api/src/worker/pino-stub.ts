/**
 * Workers-only stub for `pino` (#2626).
 *
 * Aliased in place of `pino` for the Worker bundle (wrangler.jsonc `alias`) so
 * pino and its `node:fs` / worker-thread transport never enter the workerd
 * graph. The Workers logger path (logger.ts) selects the console-JSON seam at
 * runtime, so this default export is never actually called on Workers; it
 * returns a console-JSON logger purely so the shape stays valid if it ever is.
 */
import { createConsoleJsonLogger, type Logger } from "../logger-console";

export default function pino(): Logger {
  return createConsoleJsonLogger();
}
