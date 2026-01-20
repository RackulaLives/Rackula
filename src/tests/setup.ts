import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach, vi } from "vitest";

/*
 * Targeted error suppression for test noise
 *
 * 1. bits-ui's body-scroll-lock sets timeouts that can fire after test teardown,
 *    causing "document is not defined" errors. This is benign in tests.
 *
 * 2. Happy-DOM's AsyncTaskManager.abortAll() logs DOMException [AbortError]
 *    when aborting pending fetch operations during teardown. This is expected
 *    cleanup behavior and not indicative of test failures.
 *
 * Strategy:
 * 1. vi.clearAllTimers() in afterEach prevents most timer-related errors
 * 2. Console.error filter catches remaining scroll lock and abort messages
 * 3. Process uncaughtException handler catches async cleanup errors
 *
 * This targeted approach replaces the blanket dangerouslyIgnoreUnhandledErrors.
 */
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const message = String(args[0]);
  if (
    message.includes("resetBodyStyle") ||
    message.includes("body-scroll-lock") ||
    message.includes("AbortError") ||
    message.includes("The operation was aborted")
  ) {
    return; // Suppress bits-ui scroll lock and Happy-DOM abort errors
  }
  originalConsoleError.apply(console, args);
};

// Handle uncaught exceptions and unhandled rejections from cleanup
if (typeof process !== "undefined" && process.on) {
  const isAbortError = (error: Error): boolean =>
    error.name === "AbortError" ||
    (error.message?.includes("The operation was aborted") &&
      error.stack?.includes("happy-dom"));

  const isScrollLockError = (error: Error): boolean =>
    error.message?.includes("document is not defined") &&
    error.stack?.includes("body-scroll-lock");

  process.on("uncaughtException", (error: Error) => {
    if (isScrollLockError(error) || isAbortError(error)) {
      return;
    }
    throw error;
  });

  process.on("unhandledRejection", (reason: unknown) => {
    if (reason instanceof Error) {
      if (isScrollLockError(reason) || isAbortError(reason)) {
        return;
      }
    }
    // Re-throw as uncaught exception to maintain default behavior for real errors
    throw reason;
  });
}

// Suppress Happy-DOM AbortError messages written to stderr during cleanup
// These occur when AsyncTaskManager.abortAll() cancels pending fetch/stream operations
if (typeof process !== "undefined" && process.stderr) {
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((
    chunk: Uint8Array | string,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void,
  ): boolean => {
    const message = typeof chunk === "string" ? chunk : chunk.toString();
    if (
      message.includes("AbortError") ||
      message.includes("The operation was aborted")
    ) {
      // Suppress Happy-DOM abort errors, but still call callback if provided
      const cb =
        typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
      if (cb) cb();
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalStderrWrite(chunk, encodingOrCallback as any, callback);
  }) as typeof process.stderr.write;
}

// Global test setup for Rackula
// This file is loaded before all tests via vitest.config.ts setupFiles

// Mock localStorage and sessionStorage - happy-dom's implementation can be unreliable
const createStorageMock = (): Storage => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
});

// Clear storage before each test for isolation
beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
});

// Mock window.matchMedia for responsive component testing
// Note: addListener/removeListener are deprecated but included for legacy compatibility
const createMatchMediaMock = (query: string): MediaQueryList => ({
  matches: false, // Default to full mode (not hamburger mode)
  media: query,
  onchange: null,
  addListener: () => {}, // Deprecated but needed for some libraries
  removeListener: () => {}, // Deprecated but needed for some libraries
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: createMatchMediaMock,
});

// Global cleanup after each test to prevent memory accumulation
// Clearing timers prevents bits-ui cleanup timers from firing after test teardown
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.restoreAllMocks();
});
