import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach, vi } from "vitest";

/*
 * Targeted bits-ui error suppression
 *
 * bits-ui's body-scroll-lock sets timeouts that can fire after test teardown,
 * causing "document is not defined" errors. This is benign in tests.
 *
 * Strategy:
 * 1. vi.clearAllTimers() in afterEach prevents most timer-related errors
 * 2. Console.error filter catches remaining scroll lock messages
 * 3. Process uncaughtException handler catches async cleanup errors
 *
 * This targeted approach replaces the blanket dangerouslyIgnoreUnhandledErrors.
 */
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const message = String(args[0]);
  if (
    message.includes("resetBodyStyle") ||
    message.includes("body-scroll-lock")
  ) {
    return; // Suppress bits-ui scroll lock errors
  }
  originalConsoleError.apply(console, args);
};

// Also handle uncaught exceptions from bits-ui cleanup
if (typeof process !== "undefined" && process.on) {
  process.on("uncaughtException", (error: Error) => {
    if (
      error.message?.includes("document is not defined") &&
      error.stack?.includes("body-scroll-lock")
    ) {
      // Suppress bits-ui scroll lock cleanup errors
      return;
    }
    throw error;
  });
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
