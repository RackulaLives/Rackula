// src/tests/upgrade-corpus.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLayoutYaml,
  parseLayoutYamlWithImages,
  parseYaml,
} from "$lib/utils/yaml";
import {
  findSilentLosses,
  type AllowListEntry,
} from "./upgrade-corpus-helpers";

interface Sidecar {
  reject?: boolean;
  hasImages?: boolean;
  allowList?: AllowListEntry[];
}

const yamlFiles = import.meta.glob("./fixtures/upgrade-corpus/*.rackula.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sidecars = import.meta.glob("./fixtures/upgrade-corpus/*.expected.json", {
  import: "default",
  eager: true,
}) as Record<string, Sidecar>;

function sidecarFor(yamlPath: string): Sidecar | null {
  const base = yamlPath.replace(/\.rackula\.yaml$/, "");
  const entry = Object.entries(sidecars).find(
    ([p]) => p.replace(/\.expected\.json$/, "") === base,
  );
  return entry?.[1] ?? null;
}

describe("upgrade corpus: YAML ingress via parseLayoutYaml", () => {
  const names = Object.keys(yamlFiles);
  it("discovers at least one fixture", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const [path, yaml] of Object.entries(yamlFiles)) {
    const name = path.split("/").pop() ?? path;
    const spec = sidecarFor(path);
    if (!spec) {
      it(`${name}: missing required .expected.json sidecar`, () => {
        expect.fail(
          `No .expected.json for ${name}. Every corpus fixture needs an explicit sidecar (see scripts/add-corpus-fixture.sh).`,
        );
      });
      continue;
    }

    if (spec.reject) {
      it(`${name}: is rejected by the version gate`, async () => {
        await expect(parseLayoutYaml(yaml)).rejects.toThrow(
          /newer version of Rackula/,
        );
      });
      continue;
    }

    it(`${name}: loads with no silent data loss`, async () => {
      const raw = await parseYaml(yaml);
      const loaded = spec.hasImages
        ? (await parseLayoutYamlWithImages(yaml)).layout
        : await parseLayoutYaml(yaml);
      const losses = findSilentLosses(raw, loaded, spec.allowList ?? []);
      expect(
        losses,
        `silent data loss in ${name}:\n${JSON.stringify(losses, null, 2)}`,
      ).toEqual([]);
    });
  }
});

// === Over-rack rail position is clamped on load, not rejected (#2661) ===
// The corpus check above only proves no silent data loss; here we pin the actual
// clamped value the load produces so a regression that stops clamping (or that
// hard-rejects an over-rack layout, breaking prior-release loading) fails.
const overRackYaml = (
  await import("./fixtures/upgrade-corpus/over-rack-rail-position.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: over-rack rail clamp (#2661)", () => {
  it("clamps a rail device above a 10U rack to the highest whole-U, loading does not fail", async () => {
    const layout = await parseLayoutYaml(overRackYaml);
    const device = layout.racks[0]!.devices[0]!;
    // UNITS_PER_U = 6; raw position 66 (U11) clamps to U10 = 60 in a 10U rack.
    expect(device.position).toBe(60);
    // Invariant: a rail position is always a whole U (no fractional rails).
    expect(device.position % 6).toBe(0);
  });
});

// === Prior-release racks gain depth_mm/base_weight defaults on load (#2738) ===
// A layout written before the depth/base-weight fields existed must still load,
// and the load must fill the schema defaults rather than leaving the fields unset.
const preDepthWeightYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.5-pre-depth-weight.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: depth/base-weight defaults (#2738)", () => {
  it("fills depth_mm and base_weight defaults for a rack written without them", async () => {
    const layout = await parseLayoutYaml(preDepthWeightYaml);
    const rack = layout.racks[0]!;
    expect(rack.depth_mm).toBe(1000);
    expect(rack.base_weight).toBe(0);
  });
});
