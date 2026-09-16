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
import type { Layout } from "$lib/types";
import { loadSessionWithTimestamp, saveSession } from "./working-copy";
import {
  MEASURED_WIDTH_SCHEMA_VERSION,
  SCHEMA_VERSION,
} from "$lib/schemas/migrations";
import { createTestDeviceType, createTestLayout } from "../../tests/factories";

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
    seedAutosave(bodyWithSchemaVersion("3.0"));
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

describe("saveSession: data-format stamp on the autosave door (#3310)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** The schema_version the autosave slot currently holds. */
  function storedStamp(): unknown {
    const raw = localStorage.getItem(STORAGE_KEY);
    return JSON.parse(raw ?? "{}").layout?.metadata?.schema_version;
  }

  const backup = { changesSinceExport: 0, hasEverExported: false };

  /** A layout with the complete metadata section createLayout gives every layout. */
  function layoutWithMetadata(overrides: Partial<Layout> = {}): Layout {
    return createTestLayout({
      metadata: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Homelab",
        schema_version: SCHEMA_VERSION,
      },
      ...overrides,
    });
  }

  it("stamps the measured-width format when a device type has width_mm", () => {
    const layout = layoutWithMetadata({
      device_types: [createTestDeviceType({ width_mm: 72 })],
    });

    expect(saveSession(layout, backup)).toBe(true);
    // Without the stamp an older release passes the version gate and then fails
    // on the placement refinement, which is the orphan state the MAJOR avoids.
    expect(storedStamp()).toBe(MEASURED_WIDTH_SCHEMA_VERSION);
  });

  it("leaves a layout without measured widths readable by the current format", () => {
    expect(saveSession(layoutWithMetadata(), backup)).toBe(true);
    expect(storedStamp()).toBe(SCHEMA_VERSION);
  });

  it("does not invent a metadata section for a body that has none", () => {
    // LayoutMetadataSchema requires id and name, so a stamp-only section would
    // make the saved body fail validation when the autosave door reads it back.
    expect(saveSession(createTestLayout(), backup)).toBe(true);
    expect(storedStamp()).toBeUndefined();
    expect(loadSessionWithTimestamp()).not.toBeNull();
  });
});
