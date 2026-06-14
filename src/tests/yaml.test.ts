import { describe, it, expect } from "vitest";
import {
  parseYaml,
  parseLayoutYaml,
  serializeLayoutToYaml,
} from "$lib/utils/yaml";
import { createTestLayout } from "./factories";

describe("parseYaml schema restriction (#2041)", () => {
  it("rejects dangerous non-JSON YAML function tags", async () => {
    await expect(
      parseYaml("danger: !!js/function 'function(){}'"),
    ).rejects.toThrow();
  });

  it("rejects non-JSON YAML type tags the server's JSON_SCHEMA forbids", async () => {
    // !!binary is in js-yaml's DEFAULT_SCHEMA but not JSON_SCHEMA; restricting
    // the client to JSON_SCHEMA (matching the server) must reject it.
    await expect(parseYaml("data: !!binary 'aGVsbG8='")).rejects.toThrow();
  });

  it("still parses a plain layout round-trip", async () => {
    const yaml = await serializeLayoutToYaml(createTestLayout(), "");
    const layout = await parseLayoutYaml(yaml);
    expect(layout.name).toBeTruthy();
  });
});
