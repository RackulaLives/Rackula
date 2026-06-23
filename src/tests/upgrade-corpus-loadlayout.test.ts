// src/tests/upgrade-corpus-loadlayout.test.ts
// The YAML corpus (upgrade-corpus.test.ts) stops at parseLayoutYaml. The real UI
// ingress continues into layoutStore.loadLayout (layout-lifecycle.ts), which runs
// a SECOND pass: a re-adaptLegacyLayout, per-rack ID regeneration/dedup, and
// defensive position/view defaulting. ID remapping that drops a value is exactly
// the silent change the harness exists to catch, and it lives one layer below
// where the corpus stops (#2450).
//
// This file routes a corpus fixture through the real store ingress
// (parseLayoutYaml -> getLayoutStore().loadLayout) and asserts the loadLayout pass
// preserves every distinctive value. It compares the parsed Layout (loadLayout's
// input) against the loaded store layout (loadLayout's output) using the same
// value-based findSilentLosses detector the corpus uses, so it is robust to
// legitimate restructuring and only fails when a value actually disappears.
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { parseLayoutYaml } from "$lib/utils/yaml";
import { findSilentLosses } from "./upgrade-corpus-helpers";

// A representative fixture with distinct, stable ids (dev-switch, dev-server,
// rack-a) so loadLayout's dedup/regeneration does NOT fire: every id, name,
// slug, and colour must survive the store pass verbatim. This is the same
// fixture the YAML corpus exercises; here we drive it one layer deeper.
const representativeYaml = (
  await import("./fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: store ingress via loadLayout", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("loadLayout preserves every distinctive value from a parsed fixture", async () => {
    // Step one: the YAML ingress the corpus already covers.
    const parsed = await parseLayoutYaml(representativeYaml);

    // Step two: the store pass the corpus does NOT cover. Compare loadLayout's
    // input against its output: any distinctive value (id, name, slug, colour)
    // that vanishes here is an uncaught silent loss in the second pass.
    const store = getLayoutStore();
    store.loadLayout(parsed);

    const losses = findSilentLosses(parsed, store.layout, []);
    expect(
      losses,
      `silent data loss in loadLayout pass:\n${JSON.stringify(losses, null, 2)}`,
    ).toEqual([]);
  });

  it("loadLayout preserves device and rack counts from a parsed fixture", async () => {
    const parsed = await parseLayoutYaml(representativeYaml);
    const parsedDeviceCount = parsed.racks.reduce(
      (sum, r) => sum + r.devices.length,
      0,
    );

    const store = getLayoutStore();
    store.loadLayout(parsed);

    const loadedDeviceCount = store.layout.racks.reduce(
      (sum, r) => sum + r.devices.length,
      0,
    );
    expect(store.layout.racks.length).toBe(parsed.racks.length);
    expect(loadedDeviceCount).toBe(parsedDeviceCount);
  });
});
