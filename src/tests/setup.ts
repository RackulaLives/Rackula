import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach, vi } from "vitest";

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
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, // Default to full mode (not hamburger mode)
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

// Global cleanup after each test to prevent memory accumulation
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
