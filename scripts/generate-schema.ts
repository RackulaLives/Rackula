/**
 * Generate the layout JSON Schema from the Zod source (issue #2226).
 *
 * Emits static/schemas/layout-v1.json from LayoutSchema using Zod 4's native
 * z.toJSONSchema(). The JSON Schema is the published, language-agnostic contract
 * for the saved-layout format; the Zod schema in src/lib/schemas/index.ts stays
 * the single source of truth and this script is its deterministic projection.
 *
 * Why io: "input": validators run against the file as written to disk, which is
 * the schema's input shape (before the migration transform that snaps legacy
 * positions and fills rack IDs). The output shape only exists in memory after a
 * successful parse.
 *
 * Why unrepresentable: "any": LayoutSchema carries .transform()/.superRefine()
 * cross-field rules that JSON Schema cannot express. Those are emitted as
 * permissive ("any") rather than throwing, so the artifact covers the structural
 * ~80% of validation. The $description records this limitation.
 *
 * Usage:
 *   npm run generate-schema
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { z as Zod } from "$lib/zod.ts";
import type { LayoutSchema as LayoutSchemaType } from "$lib/schemas/index.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const OUTPUT_FILE = join(ROOT, "static", "schemas", "layout-v1.json");

/** JSON Schema dialect this artifact targets; pinned so the published contract
 * does not silently follow Zod's default. */
export const JSON_SCHEMA_DIALECT =
  "https://json-schema.org/draft/2020-12/schema";

/**
 * Canonical schema identifier per docs/reference/SCHEMA.md
 * (schemas.racku.la/layout/v{MAJOR}.json). This is an identifier, not a fetch
 * target: readers gate loadability offline on metadata.schema_version, so the
 * canonical $id is set before schemas.racku.la DNS exists. The artifact is
 * served in the interim at the count.racku.la/d.racku.la /schemas/ path (see
 * the Published Schema section of SCHEMA.md).
 */
export const SCHEMA_ID = "https://schemas.racku.la/layout/v1.json";

export const SCHEMA_DESCRIPTION =
  "Beta. Generated from the Rackula Zod layout schema. Covers the structural " +
  "shape of a saved layout but not cross-field rules expressed in Zod " +
  "(.refine/.superRefine: referential integrity, carrier-first rail placement, " +
  "slot fit) or the load-time .transform (legacy position migration, rack id " +
  "generation, unknown-field preservation). Expect roughly 80 percent " +
  "validation coverage; the Zod schema in src/lib/schemas/index.ts is " +
  "authoritative.";

/**
 * Recursively sort object keys so the output is byte-stable across runs.
 * Arrays keep their order (it is semantic in JSON Schema, e.g. required lists).
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Project the Zod layout schema to the full, sorted, published JSON Schema
 * object. Takes the Zod namespace and LayoutSchema as parameters so the script
 * and its drift-guard test produce byte-identical output from one code path.
 */
export function assembleSchema(
  z: typeof Zod,
  layoutSchema: typeof LayoutSchemaType,
): Record<string, unknown> {
  const generated = z.toJSONSchema(layoutSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;

  // Discard Zod's emitted dialect and pin our own below, so the published
  // contract does not couple to Zod's default.
  const { $schema: _generatedDialect, ...rest } = generated;
  void _generatedDialect;

  return sortKeys({
    $schema: JSON_SCHEMA_DIALECT,
    $id: SCHEMA_ID,
    $description: SCHEMA_DESCRIPTION,
    title: "Rackula Layout",
    ...rest,
  }) as Record<string, unknown>;
}

/** Generate the artifact from the live Zod schema and write it to disk. */
async function main(): Promise<void> {
  // version.ts reads the Vite-injected __APP_VERSION__ global, which only exists
  // in a build. Provide it from package.json before importing the schema graph.
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ) as { version: string };
  (globalThis as Record<string, unknown>).__APP_VERSION__ = pkg.version;

  const { z } = await import("$lib/zod.ts");
  const { LayoutSchema } = await import("$lib/schemas/index.ts");

  const schema = assembleSchema(z, LayoutSchema);

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(schema, null, 2) + "\n");

  console.log(`Wrote ${OUTPUT_FILE}`);
}

// Run only when executed directly, not when imported (e.g. by the drift test),
// so importing this module never triggers the file write.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
