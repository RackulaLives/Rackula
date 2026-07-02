import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import MobileLayoutsSheet from "$lib/components/mobile/MobileLayoutsSheet.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import {
  ensureStartersLoaded,
  getStarterTemplates,
  resetStarterTemplatesForTest,
} from "$lib/stores/starter-templates.svelte";
import { createLayout } from "$lib/utils/serialization";

function renderSheet(
  overrides: Partial<{ onnewlayout: () => void; onclose: () => void }> = {},
) {
  const props = {
    onnewlayout: vi.fn(),
    onclose: vi.fn(),
    ...overrides,
  };
  render(MobileLayoutsSheet, { props });
  return props;
}

/** A minimal, schema-valid starter YAML (1 rack, 1 device), parameterised by name. */
/** A valid UUID baked into the test starter, mirroring the shipped YAML headers. */
const BAKED_METADATA_ID = "a1b2c3d4-0001-4001-8001-000000000001";

function validStarterYaml(name: string): string {
  return `metadata:
  id: "${BAKED_METADATA_ID}"
  name: "${name}"
  schema_version: "1.0"
version: "1.0.0"
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

/**
 * A mock fetcher that resolves each starter request with valid YAML named after
 * the file id in the URL, so the three starters load with distinct names (e.g.
 * "Home Lab", "Network Closet"). Distinct names keep the row queries unambiguous.
 */
function okFetcher() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const id = String(input).split("/").pop()!.replace(".rackula.yaml", "");
    const name = id
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return {
      ok: true,
      status: 200,
      text: async () => validStarterYaml(name),
    } as Response;
  });
}

describe("MobileLayoutsSheet", () => {
  beforeEach(() => {
    // The first tab shares the app-session history singleton; reset it so each
    // test starts with a clean workspace and undo/redo stack.
    resetHistoryStore();
    resetWorkspaceStore();
    resetToastStore();
    // Start each test from a cold starter cache so the mount-time lazy load and
    // the "New from template" affordance are deterministic per test.
    resetStarterTemplatesForTest();
    // openStarter schedules fitAll via rAF, which no-ops without a live panzoom;
    // stub rAF so it never runs and cannot touch a later test's workspace.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    // The sheet lazy-loads starters on mount via the default fetch. Stub it so
    // tests never hit the network; starter tests pass an explicit fetcher, so
    // this default only serves the tests that expect no starters (degrades to []).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("no network in tests");
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("switches the active layout when a different layout row is tapped", async () => {
    const ws = getWorkspaceStore();
    const firstId = ws.activeId;
    ws.activeStore.setLayoutName("Homelab");

    // Open a second layout; it becomes active.
    const secondId = ws.openTab(createLayout("Office"));
    expect(ws.activeId).toBe(secondId);

    renderSheet();

    // Tapping the first layout's row switches focus back to it.
    await fireEvent.click(screen.getByRole("option", { name: /Homelab/ }));

    expect(ws.activeId).toBe(firstId);
  });

  it("marks exactly the active layout as selected", () => {
    const ws = getWorkspaceStore();
    ws.activeStore.setLayoutName("Homelab");
    const secondId = ws.openTab(createLayout("Office"));

    renderSheet();

    expect(ws.activeId).toBe(secondId);
    expect(screen.getByRole("option", { name: /Office/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: /Homelab/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("creates and activates a new layout from the sheet", async () => {
    const ws = getWorkspaceStore();
    const startingTabIds = ws.tabs.map((t) => t.id);

    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /New layout/ }));

    const newTab = ws.tabs.find((t) => !startingTabIds.includes(t.id));
    expect(newTab).toBeDefined();
    expect(ws.activeId).toBe(newTab!.id);
  });

  it("closes the sheet after creating a new layout", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /New layout/ }));

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("closes the sheet after switching layouts", async () => {
    const ws = getWorkspaceStore();
    ws.activeStore.setLayoutName("Homelab");
    ws.openTab(createLayout("Office"));

    const props = renderSheet();

    await fireEvent.click(screen.getByRole("option", { name: /Homelab/ }));

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("opens a chosen starter as a fresh populated tab and closes the sheet", async () => {
    // Pre-load starters through the shared source so the mount-time load serves
    // the cache and the "New from template" affordance renders.
    await ensureStartersLoaded(okFetcher() as unknown as typeof fetch);
    const template = getStarterTemplates()[0]!;
    const templateName = template.layout.name;
    // Known baked id from the YAML header; the open path must regenerate it.
    const bakedId = template.layout.metadata!.id;

    const ws = getWorkspaceStore();
    const startingTabIds = ws.tabs.map((t) => t.id);

    renderSheet();

    // Reveal the starter list, then choose the first starter.
    await fireEvent.click(
      screen.getByRole("button", { name: /New from template/ }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: new RegExp(templateName) }),
    );

    const newTab = ws.tabs.find((t) => !startingTabIds.includes(t.id));
    expect(newTab).toBeDefined();
    // The starter opened as the active tab, populated with the starter's racks.
    expect(ws.activeId).toBe(newTab!.id);
    expect(newTab!.store.racks.length).toBeGreaterThan(0);
    // The open regenerated the id: the new tab is not keyed on the starter's
    // baked-in layout id, so repeat opens never alias one library entry.
    expect(newTab!.layoutId).not.toBe(bakedId);
  });

  it("dismisses the sheet when a starter is chosen", async () => {
    await ensureStartersLoaded(okFetcher() as unknown as typeof fetch);
    const templateName = getStarterTemplates()[0]!.layout.name;

    const props = renderSheet();

    await fireEvent.click(
      screen.getByRole("button", { name: /New from template/ }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: new RegExp(templateName) }),
    );

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });
});
