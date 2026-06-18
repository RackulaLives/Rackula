// src/tests/upgrade-corpus.test.ts
import { describe, it, expect } from "vitest";
import { parseLayoutYaml, parseLayoutYamlWithImages, parseYaml } from "$lib/utils/yaml";
import { findSilentLosses, type AllowListEntry } from "./upgrade-corpus-helpers";

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

function sidecarFor(yamlPath: string): Sidecar {
  const base = yamlPath.replace(/\.rackula\.yaml$/, "");
  const entry = Object.entries(sidecars).find(
    ([p]) => p.replace(/\.expected\.json$/, "") === base,
  );
  return entry?.[1] ?? { allowList: [] };
}

describe("upgrade corpus: YAML ingress via parseLayoutYaml", () => {
  const names = Object.keys(yamlFiles);
  it("discovers at least one fixture", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const [path, yaml] of Object.entries(yamlFiles)) {
    const spec = sidecarFor(path);
    const name = path.split("/").pop() ?? path;

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
