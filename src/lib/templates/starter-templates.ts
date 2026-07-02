/**
 * Starter templates
 *
 * Loads the example layouts offered behind the split "+" control (#2829) and,
 * transiently, the empty-canvas chooser (#2095). Each template is a
 * `.rackula.yaml` file in `static/templates`, fetched at runtime and validated
 * against the layout schema. Adding a template is a data-only change: drop a new
 * file in that directory and add its manifest entry below. Each shipped starter
 * also needs a matching STARTER_COLOURS entry; the typed colour map makes a
 * missing entry a compile error. No component code changes either way.
 *
 * Loading is best-effort. A template that fails to fetch or parse is skipped,
 * never thrown: the menu degrades to "Blank layout" only rather than breaking
 * the new-layout path (#2829: "on load failure the From template section does
 * not render").
 */

import type { Layout } from "$lib/types";
import { parseLayoutYaml } from "$lib/utils/yaml";
import { layoutDebug } from "$lib/utils/debug";

/** A starter template paired with its source file for keying and fetching. */
export interface StarterTemplate {
  /** Stable id, also the file basename. Used as the keyed-each key. */
  id: string;
  /** The validated, runtime-ready layout to load when chosen. */
  layout: Layout;
  /**
   * The brand-palette colour for this starter's menu dot, as a CSS custom
   * property reference so the value stays tokenised (#2829, R2). Resolved from
   * the id manifest below, with a muted fallback for an unknown id.
   */
  colour: string;
}

/**
 * The set of template files to offer, in display order. The basename (minus
 * `.rackula.yaml`) is the template id. Listed explicitly rather than globbed so
 * the order is intentional and the manifest reads as documentation.
 */
export const TEMPLATE_FILES = [
  "home-lab",
  "network-closet",
  "media-server",
] as const;

/** A shipped starter's id, i.e. one of {@link TEMPLATE_FILES}. */
export type StarterTemplateId = (typeof TEMPLATE_FILES)[number];

/**
 * Menu-dot colour per starter id, referencing the Dracula brand tokens in
 * tokens.css (#2829, R2). CSS custom property references, never raw hex, so the
 * dot follows the design tokens. A starter without an entry falls back to the
 * muted text colour.
 */
const STARTER_COLOURS: Record<StarterTemplateId, string> = {
  "home-lab": "var(--dracula-purple)",
  "network-closet": "var(--dracula-cyan)",
  "media-server": "var(--dracula-green)",
};

/** Resolve a starter's menu-dot colour token, defaulting to the muted colour. */
function resolveStarterColour(id: StarterTemplateId): string {
  return STARTER_COLOURS[id] ?? "var(--colour-text-muted)";
}

/**
 * Human-readable rack/device summary for a starter, e.g. "1 rack, 8 devices".
 * Pure so menus and tests can render the meta line without a component (#2829).
 */
export function starterRackSummary(template: StarterTemplate): string {
  const rackCount = template.layout.racks.length;
  const deviceCount = template.layout.racks.reduce(
    (sum, rack) => sum + rack.devices.length,
    0,
  );
  const rackWord = rackCount === 1 ? "rack" : "racks";
  const deviceWord = deviceCount === 1 ? "device" : "devices";
  return `${rackCount} ${rackWord}, ${deviceCount} ${deviceWord}`;
}

/**
 * Build the URL for a template file under the app's base path.
 *
 * `import.meta.env.BASE_URL` carries the deploy base (`/` locally, a subpath on
 * GitHub Pages), so templates resolve correctly under any base. BASE_URL always
 * ends in a slash, so a single join is safe.
 */
function templateUrl(id: string): string {
  return `${import.meta.env.BASE_URL}templates/${id}.rackula.yaml`;
}

/**
 * Fetch and parse a single template. Returns null (never throws) when the file
 * is missing, the response is not OK, or the YAML fails schema validation, so a
 * single bad template never sinks the rest of the chooser.
 */
async function loadTemplate(
  id: StarterTemplateId,
  fetcher: typeof fetch,
): Promise<StarterTemplate | null> {
  try {
    const response = await fetcher(templateUrl(id));
    if (!response.ok) {
      layoutDebug.state(
        "starter template %s fetch failed: %d",
        id,
        response.status,
      );
      return null;
    }
    const yamlText = await response.text();
    const layout = await parseLayoutYaml(yamlText);
    return { id, layout, colour: resolveStarterColour(id) };
  } catch (error) {
    layoutDebug.state("starter template %s failed to load: %o", id, error);
    return null;
  }
}

/**
 * Load all starter templates that parse successfully, preserving manifest order.
 *
 * `fetcher` is injectable for testing; it defaults to the global `fetch`.
 * Returns an empty array when nothing loads, which the menu treats as
 * "no templates" and shows only the blank-layout row.
 */
export async function loadStarterTemplates(
  fetcher: typeof fetch = fetch,
): Promise<StarterTemplate[]> {
  const results = await Promise.all(
    TEMPLATE_FILES.map((id) => loadTemplate(id, fetcher)),
  );
  return results.filter((t): t is StarterTemplate => t !== null);
}
