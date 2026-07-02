/**
 * Starter-template menu source (#2829).
 *
 * One shared, lazily-loaded source of the starter templates for every "new
 * layout" surface: the split "+" menus on the tab bar and Layouts panel, the
 * command palette, and (later) mobile. Loading is deferred until the first menu
 * open and cached, so the fetch never runs for users who never open the menu,
 * and repeat opens reuse the same result.
 *
 * Opening a starter always produces an independent layout in a new tab. The
 * shipped YAML carries a baked-in metadata.id, and the workspace library keys
 * identity on that id, so the open path regenerates the id per open. Without
 * that, opening the same starter twice would alias one library entry (#2829, D2).
 */
import type { Layout } from "$lib/types";
import {
  loadStarterTemplates,
  type StarterTemplate,
  type StarterTemplateId,
} from "$lib/templates/starter-templates";
import { getWorkspaceStore } from "./workspace.svelte";
import { getCanvasStore } from "./canvas.svelte";
import { generateId } from "$lib/utils/device";

// The loaded starters, empty until the first load resolves. Reactive so every
// menu that reads it re-renders when the lazy load completes.
let templates = $state<StarterTemplate[]>([]);
let loaded = $state(false);
// The in-flight (or resolved) load promise, so concurrent first-opens share one
// fetch and later opens skip the network entirely.
let loadPromise: Promise<StarterTemplate[]> | null = null;

/**
 * Load the starters once and cache a successful, non-empty result. Safe to call
 * on every menu open: after a successful load later opens serve the cache, and
 * concurrent opens share one in-flight fetch. A total failure (an empty result,
 * since loadStarterTemplates is best-effort and resolves to [] rather than
 * rejecting) is NOT cached, so the next open retries and the "From template"
 * section can recover without a reload. `fetcher` is injectable for tests.
 */
export function ensureStartersLoaded(
  fetcher: typeof fetch = fetch,
): Promise<StarterTemplate[]> {
  // Already loaded a non-empty set once: serve it without refetching.
  if (loaded) return Promise.resolve(templates);
  // A load is in flight: share it so concurrent opens fetch only once.
  if (loadPromise) return loadPromise;
  const pending = loadStarterTemplates(fetcher).then(
    (result) => {
      if (result.length > 0) {
        // Cache a successful, non-empty load for the rest of the session.
        templates = result;
        loaded = true;
      } else {
        // Every template failed to load. Do not cache the failure: clear the
        // shared promise and leave `loaded` false so the next open retries.
        if (loadPromise === pending) loadPromise = null;
      }
      return result;
    },
    () => {
      // Defensive: loadStarterTemplates does not reject today, but if it ever
      // does, drop the shared promise so a later open retries instead of reusing
      // the failure, and degrade to an empty set so no caller sees a rejection.
      if (loadPromise === pending) loadPromise = null;
      return [] as StarterTemplate[];
    },
  );
  loadPromise = pending;
  return pending;
}

/** The starters loaded so far. Empty until {@link ensureStartersLoaded} resolves. */
export function getStarterTemplates(): StarterTemplate[] {
  return templates;
}

/**
 * Open a starter template in a new tab (#2829, D2). Clones the loaded layout so
 * repeat opens never share state, regenerates metadata.id so the workspace
 * library treats each open as a distinct layout, and opens it in a fresh tab
 * (fresh undo history by construction). fitAll runs after the tab is live so the
 * whole rack is framed on arrival.
 */
export function openStarter(template: StarterTemplate): void {
  const workspace = getWorkspaceStore();
  // The shared source holds starters in $state, so template.layout may be a
  // reactive proxy; snapshot to a plain object before structuredClone, which
  // throws on a Proxy. Snapshot is a no-op on the plain layouts tests pass in.
  const clone: Layout = structuredClone($state.snapshot(template.layout));
  clone.metadata = { ...clone.metadata, id: generateId() };
  workspace.openTab(clone);
  // Capture the just-opened tab's store now: openTab made it active, but the
  // active tab could change before the rAF fires, and fitAll must frame the
  // layout we opened, not whatever happens to be active a frame later.
  const openedStore = workspace.activeStore;
  const canvasStore = getCanvasStore();
  requestAnimationFrame(() => {
    canvasStore.fitAll(openedStore.racks, openedStore.rack_groups);
  });
}

/**
 * Open the starter with the given id, loading the set first if needed. Used by
 * the command-palette entries, which dispatch by id and have no live template
 * reference. A missing id (load failed, or unknown id) is a no-op.
 */
export function openStarterById(id: StarterTemplateId): void {
  void ensureStartersLoaded()
    .then((result) => {
      const template = result.find((t) => t.id === id);
      if (template) openStarter(template);
    })
    .catch(() => {
      // ensureStartersLoaded degrades to [] rather than rejecting; this guard
      // just ensures a dispatch entry can never surface an unhandled rejection.
    });
}

/** Reset the cached starters so a test starts from a cold load. Test-only. */
export function resetStarterTemplatesForTest(): void {
  templates = [];
  loaded = false;
  loadPromise = null;
}
