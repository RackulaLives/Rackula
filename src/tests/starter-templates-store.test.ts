import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openStarter,
  openStarterById,
  ensureStartersLoaded,
  getStarterTemplates,
  resetStarterTemplatesForTest,
} from "$lib/stores/starter-templates.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createLayout } from "$lib/utils/serialization";
import { createTestRack } from "./factories";
import type {
  StarterTemplate,
  StarterTemplateId,
} from "$lib/templates/starter-templates";
import type { Layout } from "$lib/types";

/**
 * Build a starter carrying a fixed baked-in metadata.id, mirroring the shipped
 * YAML (each starter file bakes an id). The open path must regenerate that id so
 * the workspace library never aliases repeat opens of the same starter (#2829).
 */
function makeStarter(): StarterTemplate {
  const layout: Layout = createLayout("Home Lab");
  layout.racks = [createTestRack({ id: "rack-1" })];
  layout.metadata = { ...layout.metadata, id: "baked-starter-id" };
  return { id: "home-lab", layout, colour: "var(--dracula-purple)" };
}

/** A minimal, schema-valid starter YAML, parameterised by name. */
function validStarterYaml(name: string): string {
  return `version: "1.0.0"
name: "${name}"
racks:
  - id: "rack-1"
    name: "${name}"
    height: 4
    width: 19
    desc_units: false
    show_rear: true
    form_factor: "4-post-cabinet"
    starting_unit: 1
    position: 0
    devices:
      - id: "dev-1"
        device_type: "1u-server"
        position: 1
        face: "front"
device_types:
  - slug: "1u-server"
    u_height: 1
    colour: "#4A7A8A"
    category: "server"
settings:
  display_mode: "label"
  show_labels_on_images: false
`;
}

/** A vitest mock fetcher that resolves every request with valid starter YAML. */
function okFetcher(name: string) {
  const yaml = validStarterYaml(name);
  return vi.fn(
    async () => ({ ok: true, status: 200, text: async () => yaml }) as Response,
  );
}

describe("openStarter", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetStarterTemplatesForTest();
    // fitAll is scheduled via rAF and no-ops without a live panzoom; stub rAF so
    // the schedule never runs and cannot touch a later test's workspace.
    vi.stubGlobal("requestAnimationFrame", () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the same starter twice as two independent layouts with distinct ids", () => {
    const ws = getWorkspaceStore();
    const before = ws.tabs.length;
    const starter = makeStarter();

    openStarter(starter);
    openStarter(starter);

    expect(ws.tabs.length).toBe(before + 2);
    const [first, second] = ws.tabs.slice(before);
    // Each open regenerated the id: distinct from each other and from the baked
    // starter id, so neither aliases the other in the workspace library.
    expect(first!.layoutId).not.toBe(second!.layoutId);
    expect(first!.layoutId).not.toBe("baked-starter-id");
    expect(second!.layoutId).not.toBe("baked-starter-id");
    // Independence, not a fixed count: the two stores hold distinct rack
    // arrays (separate clones), each carrying the starter's rack content.
    expect(first!.store.racks).not.toBe(second!.store.racks);
    expect(first!.store.racks.length).toBeGreaterThan(0);
    expect(second!.store.racks.length).toBeGreaterThan(0);
  });

  it("makes the opened starter the active tab", () => {
    const ws = getWorkspaceStore();
    const starter = makeStarter();

    openStarter(starter);

    expect(ws.activeId).toBe(ws.tabs[ws.tabs.length - 1]!.id);
    expect(ws.activeStore.layout.name).toBe("Home Lab");
  });

  it("opens a starter read back from the reactive source (state proxy)", async () => {
    // The shared source holds starters in $state, so a template read via
    // getStarterTemplates() is a reactive proxy. openStarter must snapshot it
    // before structuredClone, which throws on a Proxy. This guards that path,
    // which makeStarter() (a plain object) does not exercise.
    const fetcher = okFetcher("Home Lab") as unknown as typeof fetch;
    await ensureStartersLoaded(fetcher);

    const ws = getWorkspaceStore();
    const before = ws.tabs.length;
    const loaded = getStarterTemplates();
    expect(loaded.length).toBeGreaterThan(0);

    openStarter(loaded[0]!);

    expect(ws.tabs.length).toBe(before + 1);
    expect(ws.activeStore.layout.name).toBe("Home Lab");
  });
});

describe("ensureStartersLoaded", () => {
  beforeEach(() => {
    resetStarterTemplatesForTest();
  });

  it("caches a successful load, so a repeat open does not refetch", async () => {
    const fetcher = okFetcher("Home Lab");

    const first = await ensureStartersLoaded(
      fetcher as unknown as typeof fetch,
    );
    expect(first.length).toBeGreaterThan(0);
    // Cardinality-immune: snapshot the real fetch count, then assert a second
    // open adds none, rather than pinning a literal tied to TEMPLATE_FILES.length.
    const callsAfterFirst = fetcher.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await ensureStartersLoaded(fetcher as unknown as typeof fetch);

    expect(fetcher.mock.calls.length).toBe(callsAfterFirst);
  });

  it("does not cache a failed load, so the next open retries and recovers", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });

    const failed = await ensureStartersLoaded(
      failing as unknown as typeof fetch,
    );
    expect(failed).toEqual([]);
    expect(getStarterTemplates()).toEqual([]);
    const failingCalls = failing.mock.calls.length;

    // The failure was not cached: a later open retries. Give it a working
    // fetcher and confirm the starters populate.
    const working = okFetcher("Home Lab");
    const recovered = await ensureStartersLoaded(
      working as unknown as typeof fetch,
    );

    expect(recovered.length).toBeGreaterThan(0);
    expect(getStarterTemplates().length).toBeGreaterThan(0);
    // The retry issued fresh fetches rather than reusing the failed attempt.
    expect(failing.mock.calls.length).toBe(failingCalls);
    expect(working.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("openStarterById", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetWorkspaceStore();
    resetStarterTemplatesForTest();
    vi.stubGlobal("requestAnimationFrame", () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op when starters cannot be loaded", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    // openStarterById loads via the default global fetch; stub it to fail so the
    // internal load degrades to [] and there is no matching starter to open.
    vi.stubGlobal("fetch", failing);

    const ws = getWorkspaceStore();
    const before = ws.tabs.length;

    openStarterById("home-lab");
    // Flush the internal ensureStartersLoaded().then chain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.tabs.length).toBe(before);
  });

  it("opens the matching starter after a successful load", async () => {
    const fetcher = okFetcher("Home Lab") as unknown as typeof fetch;
    await ensureStartersLoaded(fetcher);

    const ws = getWorkspaceStore();
    const before = ws.tabs.length;

    openStarterById("home-lab");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.tabs.length).toBe(before + 1);
    expect(ws.activeStore.layout.name).toBe("Home Lab");
  });

  it("is a no-op for an unknown id after a successful load", async () => {
    const fetcher = okFetcher("Home Lab") as unknown as typeof fetch;
    await ensureStartersLoaded(fetcher);

    const ws = getWorkspaceStore();
    const before = ws.tabs.length;

    openStarterById("not-a-real-starter" as StarterTemplateId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.tabs.length).toBe(before);
  });
});
