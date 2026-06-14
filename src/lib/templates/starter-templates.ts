/**
 * Starter templates
 *
 * Loads the example layouts shown in the empty-canvas template chooser (#2095).
 * Each template is a `.rackula.yaml` file in `static/templates`, fetched at
 * runtime and validated against the layout schema. Adding a template is a
 * data-only change: drop a new file in that directory and add its manifest
 * entry below, no component code changes.
 *
 * Loading is best-effort. A template that fails to fetch or parse is skipped,
 * never thrown: the empty state degrades to its baseline (add-rack) rather than
 * breaking the first-run experience (#2095 AC: "remains the WelcomeScreen
 * baseline when templates fail to load").
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
  id: string,
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
    return { id, layout };
  } catch (error) {
    layoutDebug.state("starter template %s failed to load: %o", id, error);
    return null;
  }
}

/**
 * Load all starter templates that parse successfully, preserving manifest order.
 *
 * `fetcher` is injectable for testing; it defaults to the global `fetch`.
 * Returns an empty array when nothing loads, which the empty state treats as
 * "no templates" and falls back to the baseline affordance.
 */
export async function loadStarterTemplates(
  fetcher: typeof fetch = fetch,
): Promise<StarterTemplate[]> {
  const results = await Promise.all(
    TEMPLATE_FILES.map((id) => loadTemplate(id, fetcher)),
  );
  return results.filter((t): t is StarterTemplate => t !== null);
}
