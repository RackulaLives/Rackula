import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  loadStarterTemplates,
  TEMPLATE_FILES,
} from "$lib/templates/starter-templates";
import { parseLayoutYaml } from "$lib/utils/yaml";

/**
 * A minimal but schema-valid layout YAML, parameterised by name so each fake
 * response is distinguishable.
 */
function validYaml(name: string): string {
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

function okResponse(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as Response;
}

function notFoundResponse(): Response {
  return { ok: false, status: 404, text: async () => "" } as Response;
}

describe("loadStarterTemplates", () => {
  it("returns one parsed template per file, in manifest order", async () => {
    // The fetcher answers each URL with a layout named after the file, so the
    // returned order can be asserted from the layout names.
    const fetcher = vi.fn(async (url: string | URL) => {
      const id = String(url).match(/templates\/(.+)\.rackula\.yaml$/)?.[1];
      return okResponse(validYaml(id ?? "unknown"));
    }) as unknown as typeof fetch;

    const templates = await loadStarterTemplates(fetcher);

    expect(templates.map((t) => t.id)).toEqual([
      "home-lab",
      "network-closet",
      "media-server",
    ]);
    // Each id maps to the layout actually parsed from that file.
    expect(templates.map((t) => t.layout.name)).toEqual([
      "home-lab",
      "network-closet",
      "media-server",
    ]);
  });

  it("skips a template whose fetch is not ok, keeping the rest", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      if (String(url).includes("network-closet")) return notFoundResponse();
      const id = String(url).match(/templates\/(.+)\.rackula\.yaml$/)?.[1];
      return okResponse(validYaml(id ?? "unknown"));
    }) as unknown as typeof fetch;

    const templates = await loadStarterTemplates(fetcher);

    expect(templates.map((t) => t.id)).toEqual(["home-lab", "media-server"]);
  });

  it("skips a template whose YAML fails schema validation", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      if (String(url).includes("media-server")) {
        return okResponse("name: 7\nthis: [is, not, a, layout]\n");
      }
      const id = String(url).match(/templates\/(.+)\.rackula\.yaml$/)?.[1];
      return okResponse(validYaml(id ?? "unknown"));
    }) as unknown as typeof fetch;

    const templates = await loadStarterTemplates(fetcher);

    expect(templates.map((t) => t.id)).toEqual(["home-lab", "network-closet"]);
  });

  it("returns an empty array when every template fails to load", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const templates = await loadStarterTemplates(fetcher);

    expect(templates).toEqual([]);
  });
});

describe("shipped template files", () => {
  // The chooser only loads templates that pass schema validation, so a malformed
  // shipped file would silently vanish from the empty state. This parses each
  // real file through the runtime layout schema to catch that at build time.
  // Reuses the source-of-truth manifest so adding a template needs no test edit.
  it.each(TEMPLATE_FILES)("%s parses as a valid layout", async (id) => {
    const path = join(
      process.cwd(),
      "static",
      "templates",
      `${id}.rackula.yaml`,
    );
    const yamlText = readFileSync(path, "utf8");

    const layout = await parseLayoutYaml(yamlText);

    expect(layout.racks.length).toBeGreaterThan(0);
    // Every placed device resolves to a device type declared in the same file,
    // so the preview renderer has the geometry it needs (no external lookup).
    const declaredSlugs = new Set(layout.device_types.map((d) => d.slug));
    for (const rack of layout.racks) {
      for (const device of rack.devices) {
        expect(declaredSlugs).toContain(device.device_type);
      }
    }
  });
});
