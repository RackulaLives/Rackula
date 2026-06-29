/**
 * Console-JSON logger seam for the Cloudflare Workers runtime (#2626).
 *
 * pino reads `process.stdout.isTTY` at module load and ships a stream/worker
 * transport that does not run on workerd. The Workers entry uses this instead:
 * a tiny structured-JSON logger that writes one JSON object per line via
 * `console.log`, matching the {@link Logger} surface the app uses (debug, info,
 * warn, error). The self-host / Bun path keeps pino unchanged (see logger.ts).
 *
 * Each method accepts either `(message)` or `(mergeObject, message)`, mirroring
 * pino's call shape so callers do not branch on the runtime.
 */

/** Numeric levels matching pino's defaults, so consumers can filter the same way. */
const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

type LevelName = keyof typeof LEVELS;

/** The subset of the pino logger surface the app relies on. */
export interface Logger {
  debug(message: string): void;
  debug(mergeObject: Record<string, unknown>, message: string): void;
  info(message: string): void;
  info(mergeObject: Record<string, unknown>, message: string): void;
  warn(message: string): void;
  warn(mergeObject: Record<string, unknown>, message: string): void;
  error(message: string): void;
  error(mergeObject: Record<string, unknown>, message: string): void;
}

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { type: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/**
 * Create a structured-JSON logger that writes to `console.log`.
 *
 * @param minLevel - Lowest level to emit (default "info"); levels below are dropped.
 * @returns A {@link Logger} that emits one JSON line per call.
 */
export function createConsoleJsonLogger(minLevel: LevelName = "info"): Logger {
  const threshold = LEVELS[minLevel] ?? LEVELS.info;

  function emit(
    level: LevelName,
    objOrMsg: Record<string, unknown> | string,
    maybeMsg?: string,
  ): void {
    if (LEVELS[level] < threshold) {
      return;
    }

    const record: Record<string, unknown> = {
      level: LEVELS[level],
      time: Date.now(),
    };

    if (typeof objOrMsg === "string") {
      record.msg = objOrMsg;
    } else {
      for (const [key, value] of Object.entries(objOrMsg)) {
        record[key] = key === "err" ? serializeError(value) : value;
      }
      if (maybeMsg !== undefined) {
        record.msg = maybeMsg;
      }
    }

    console.log(JSON.stringify(record));
  }

  return {
    debug: (objOrMsg: Record<string, unknown> | string, maybeMsg?: string) =>
      emit("debug", objOrMsg, maybeMsg),
    info: (objOrMsg: Record<string, unknown> | string, maybeMsg?: string) =>
      emit("info", objOrMsg, maybeMsg),
    warn: (objOrMsg: Record<string, unknown> | string, maybeMsg?: string) =>
      emit("warn", objOrMsg, maybeMsg),
    error: (objOrMsg: Record<string, unknown> | string, maybeMsg?: string) =>
      emit("error", objOrMsg, maybeMsg),
  };
}
