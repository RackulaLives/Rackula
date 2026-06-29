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
import { parseLayoutYaml, parseYaml, serializeToYaml } from "$lib/utils/yaml";
import { UNITS_PER_U } from "$lib/types/constants";
import { findSilentLosses } from "./upgrade-corpus-helpers";

// The current-version multi-rack body added to the upgrade corpus (#2657). The
// browser read door (loadLayoutBody) now validates through LayoutSchema, so a
// representative current-format body must load through it cleanly.
const multiRackYaml = (
  await import("./fixtures/upgrade-corpus/v26.5.0-multi-rack.rackula.yaml?raw")
).default as string;

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
// The browser read door now validates through LayoutSchema (#2657), so this body
// carries the full rack fields and device-type colour a real v0.6 app wrote (the
// schema requires them); it is no longer the artificially-loose shape that only
// the old unvalidated cast accepted. Loading still converts `rack` -> `racks[0]`
// and scales position by UNITS_PER_U.
// Distinctive values used below: id "rack-a", name "Rack A", slug "switch-1u",
// device id "dev-1". These must survive intact so the test has real teeth.
const V06_BODY = {
  version: "0.6.0",
  name: "Old Browser Lab",
  rack: {
    id: "rack-a",
    name: "Rack A",
    height: 42,
    width: 19,
    desc_units: false,
    form_factor: "4-post-cabinet",
    starting_unit: 1,
    position: 0,
    devices: [
      { id: "dev-1", device_type: "switch-1u", position: 5, face: "front" },
    ],
  },
  device_types: [
    {
      slug: "switch-1u",
      u_height: 1,
      manufacturer: "Acme",
      colour: "#336699",
      category: "network",
    },
  ],
  settings: { display_mode: "label", show_labels_on_images: false },
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

  it("loadLayoutBody loads a current-version multi-rack body through the schema gate (#2657)", async () => {
    // Drive the corpus's current-format multi-rack fixture through the browser
    // read door. The body is the real localStorage wrapper shape: { layout }.
    const parsed = await parseYaml(multiRackYaml);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ layout: parsed }));

    const result = loadLayoutBody("old-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both racks and their distinctive ids survive the schema validation pass.
    const rackIds = result.layout.racks.map((r) => r.id);
    expect(rackIds).toContain("rack-a");
    expect(rackIds).toContain("rack-b");

    const losses = findSilentLosses(parsed, result.layout, []);
    expect(losses, `silent loss:\n${JSON.stringify(losses, null, 2)}`).toEqual(
      [],
    );
  });

  // Parity guard (#2451): the YAML import path must migrate a v0.6 single-`rack`
  // layout the same way the browser localStorage path does. The browser path runs
  // migrateLayout; the YAML path runs the same structural conversion + position
  // scaling inside LayoutSchemaBase.transform. Both reach a single migrated rack
  // with both devices, positions scaled to internal units, and the legacy `rack`
  // key gone. A v0.6 YAML import must NOT be schema-rejected.
  it("YAML import migrates a v0.6 single-rack layout to parity with the browser path", async () => {
    // A v0.6 file: single `rack`, U-value positions. device_types and settings
    // carry the fields the strict YAML schema requires (the localStorage body in
    // V06_BODY is looser; the file ingress validates against LayoutSchema).
    const v06File = {
      version: "0.6.0",
      name: "Old Single-Rack Lab",
      rack: {
        id: "rack-a",
        name: "Rack A",
        height: 42,
        width: 19,
        desc_units: false,
        form_factor: "4-post-cabinet",
        starting_unit: 1,
        position: 0,
        devices: [
          {
            id: "dev-switch",
            device_type: "switch-1u",
            position: 5,
            face: "front",
          },
          {
            id: "dev-server",
            device_type: "server-2u",
            position: 10,
            face: "front",
          },
        ],
      },
      device_types: [
        {
          slug: "switch-1u",
          u_height: 1,
          colour: "#336699",
          category: "network",
        },
        {
          slug: "server-2u",
          u_height: 2,
          colour: "#996633",
          category: "server",
        },
      ],
      settings: { display_mode: "label", show_labels_on_images: false },
    };

    const yaml = await serializeToYaml(v06File);
    const layout = await parseLayoutYaml(yaml);

    // Single `rack` collapsed into a one-element `racks[]`; legacy key is gone.
    expect(layout.racks.length).toBe(1);
    expect("rack" in (layout as Record<string, unknown>)).toBe(false);

    // Both devices survive the migration (no silent loss of placements).
    const rack = layout.racks[0];
    expect(rack.devices.length).toBe(2);
    const ids = rack.devices.map((d) => d.id);
    expect(ids).toContain("dev-switch");
    expect(ids).toContain("dev-server");

    // Pre-0.7.0 U-value positions are scaled to internal units (U5 -> 30, U10 -> 60).
    const positions = Object.fromEntries(
      rack.devices.map((d) => [d.id, d.position]),
    );
    expect(positions["dev-switch"]).toBe(5 * UNITS_PER_U);
    expect(positions["dev-server"]).toBe(10 * UNITS_PER_U);

    // Distinctive identity values (rack id/name, slugs) survive intact.
    expect(rack.id).toBe("rack-a");
    expect(rack.name).toBe("Rack A");
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
