// src/lib/storage/working-copy.test.ts
//
// The autosave door (loadSessionWithTimestamp) reads an untrusted layout body out
// of localStorage and routes it through the shared parseLayoutObject chokepoint.
// Before #2664 that door ran LayoutSchema but NOT the forward-compat version gate,
// so a future-major body in localStorage would load on the autosave path while the
// YAML file door refused it. These tests pin the door's behaviour on the RESULT
// object (never the DOM): a future-major body is refused (returns null), and
// current / prior-release bodies still load.
import { describe, it, expect, beforeEach } from "vitest";
import { loadSessionWithTimestamp } from "./working-copy";
import { createTestLayout } from "../../tests/factories";

const STORAGE_KEY = "Rackula:autosave";

/** Seed the autosave slot with a SessionData wrapper around the given body. */
function seedAutosave(body: unknown): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      layout: body,
      savedAt: "2026-06-29T00:00:00.000Z",
      serverUpdatedAt: null,
      changesSinceExport: 0,
      hasEverExported: false,
      storageMode: "browser",
    }),
  );
}

function bodyWithSchemaVersion(version: string): Record<string, unknown> {
  const layout = createTestLayout();
  return {
    ...layout,
    metadata: {
      id: "22222222-2222-4222-8222-222222222222",
      name: layout.name,
      schema_version: version,
    },
  };
}

describe("loadSessionWithTimestamp: forward-compat gate on the autosave door (#2664)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("refuses a future-major autosave body, returning null", () => {
    seedAutosave(bodyWithSchemaVersion("2.0"));
    expect(loadSessionWithTimestamp()).toBeNull();
  });

  it("loads a current-major autosave body", () => {
    seedAutosave(bodyWithSchemaVersion("1.0"));
    const result = loadSessionWithTimestamp();
    expect(result).not.toBeNull();
    expect(result?.savedAt).toBe("2026-06-29T00:00:00.000Z");
  });

  it("loads an autosave body with no schema_version (legacy predates versioning)", () => {
    seedAutosave(createTestLayout());
    const result = loadSessionWithTimestamp();
    expect(result).not.toBeNull();
  });
});
