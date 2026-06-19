// src/tests/browser-upgrade.test.ts
// Guards two browser-specific upgrade risks:
//   1. migrateLayout (v0.6 single-`rack` -> `racks[]` + position scaling) must
//      preserve all distinctive values from the old body.
//   2. The Rackula:workspace key structure must still find seeded layout ids after
//      any future refactor; a key change silently orphans old browser data.
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadLayoutBody,
  loadWorkspaceIndex,
  type WorkspaceIndex,
} from "$lib/storage/browser-workspace";
import { findSilentLosses } from "./upgrade-corpus-helpers";

// In-memory localStorage stand-in (same pattern as browser-workspace.test.ts).
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
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// A v0.6-shaped layout: single `rack` (not `racks[]`), U-value position.
// migrateLayout converts `rack` -> `racks[0]` and scales position by UNITS_PER_U.
// Distinctive values used below: id "rack-a", name "Rack A", slug "switch-1u",
// device id "dev-1". These must survive intact so the test has real teeth.
const V06_BODY = {
  version: "0.6.0",
  name: "Old Browser Lab",
  rack: {
    id: "rack-a",
    name: "Rack A",
    height: 42,
    devices: [
      { id: "dev-1", device_type: "switch-1u", position: 5, face: "front" },
    ],
  },
  device_types: [
    {
      slug: "switch-1u",
      u_height: 1,
      manufacturer: "Acme",
      category: "network",
    },
  ],
};

// loadLayoutBody (browser-workspace.ts:200) checks:
//   `!isRecord(parsed) || !isRecord(parsed.layout)`
// so it expects a wrapper: { layout: <bare-layout>, ... }.
// Seeding a bare layout returns { ok: false }. We wrap it here.
const V06_WRAPPED = { layout: V06_BODY };

const LAYOUT_KEY = "Rackula:layout:old-1";
const WORKSPACE_KEY = "Rackula:workspace";

describe("browser upgrade: localStorage ingress", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("loadLayoutBody migrates a v0.6 body without dropping distinctive values", () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(V06_WRAPPED));
    const result = loadLayoutBody("old-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // position scales (5 -> 5 * UNITS_PER_U); migrateLayout also stamps the
    // current version string onto the layout after scaling, replacing "0.6.0".
    // Both are intentional transformations declared in the allow list.
    // All other distinctive values (ids, names, slugs, face) must survive.
    const losses = findSilentLosses(V06_BODY, result.layout, [
      {
        pathPattern: "position$",
        reason: "U value scaled to internal units by migrateLayout",
      },
      {
        pathPattern: "\\.version$",
        reason: "migrateLayout stamps current VERSION after position migration",
      },
    ]);
    expect(losses, `silent loss:\n${JSON.stringify(losses, null, 2)}`).toEqual(
      [],
    );
  });

  it("loadWorkspaceIndex still finds layouts under the current key structure", () => {
    // Seed a workspace index that references "old-1", as a previous release
    // would have written it. If the key name or the index schema changed,
    // loadWorkspaceIndex would return null or drop "old-1" from openTabs, which
    // is the orphaning we guard against.
    const seededIndex: WorkspaceIndex = {
      schemaVersion: 2,
      activeId: "old-1",
      openTabs: ["old-1"],
      library: {
        "old-1": {
          name: "Old Browser Lab",
          updatedAt: "2024-01-01T00:00:00.000Z",
          changesSinceExport: 0,
          hasEverExported: false,
          writeFailed: false,
          storageMode: "browser",
        },
      },
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(seededIndex));

    const index = loadWorkspaceIndex();

    expect(index).not.toBeNull();
    // openTabs is filtered to ids that have a library entry; if the key name or
    // schema changed, "old-1" would be dropped here and the layout would be lost.
    expect(index!.openTabs).toContain("old-1");
    expect(index!.library["old-1"]).toBeDefined();
    expect(index!.activeId).toBe("old-1");
  });
});
