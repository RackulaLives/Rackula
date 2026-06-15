import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { z } from "$lib/zod";
import { LayoutSchema } from "$lib/schemas";

/**
 * Guards the generated JSON Schema artifact (issue #2226).
 *
 * The real failure mode is a stale artifact: someone changes the Zod schema in
 * src/lib/schemas and forgets to re-run `npm run generate-schema`, so the
 * published contract drifts from the source of truth. These tests fail when that
 * happens. They mirror the generator's options exactly; if the generator changes
 * its options, update both.
 */
const ARTIFACT_PATH = join(
  process.cwd(),
  "static",
  "schemas",
  "layout-v1.json",
);

function generate(): Record<string, unknown> {
  const generated = z.toJSONSchema(LayoutSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  const { $schema, ...rest } = generated;
  return {
    $schema,
    $id: "https://count.racku.la/schemas/layout-v1.json",
    title: "Rackula Layout",
    ...rest,
  };
}

describe("layout JSON Schema artifact", () => {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as Record<
    string,
    unknown
  >;

  it("is in sync with the Zod source schema", () => {
    const fresh = generate();
    // Compare structural content (drop the envelope fields the generator adds
    // around the Zod output) so this asserts the generated body, not the prose.
    const strip = (s: Record<string, unknown>) => {
      const { $id, $description, title, $schema, ...body } = s;
      void $id;
      void $description;
      void title;
      void $schema;
      return body;
    };
    expect(strip(artifact)).toEqual(strip(fresh));
  });

  it("carries the published schema envelope", () => {
    expect(artifact.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(artifact.$id).toBe("https://count.racku.la/schemas/layout-v1.json");
    expect(typeof artifact.$description).toBe("string");
    expect(artifact.$description as string).toMatch(/beta/i);
  });
});
