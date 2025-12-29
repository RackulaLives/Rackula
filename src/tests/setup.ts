import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// Global test setup for Rackula
// This file is loaded before all tests via vitest.config.ts setupFiles

// Mock localStorage - happy-dom's implementation can be unreliable
const localStorageMock = (() => {
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
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Also mock sessionStorage for consistency
Object.defineProperty(globalThis, "sessionStorage", {
  value: localStorageMock,
  writable: true,
});

// Clear storage before each test for isolation
beforeEach(() => {
  localStorageMock.clear();
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
