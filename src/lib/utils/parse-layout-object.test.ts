// src/lib/utils/parse-layout-object.test.ts
//
// parseLayoutObject is the shared read-door chokepoint for paths that hold a
// runtime layout object rather than a YAML string: the localStorage autosave
// (working-copy.ts) and the multi-layout browser workspace (browser-workspace.ts).
// These tests pin its two load-bearing guards as RESULT-object behaviour (never
// the DOM):
//   1. the forward-compat version gate refuses a future-major body (#2664), so a
//      future-major document in localStorage is rejected on the autosave door,
//      not just the YAML file door;
//   2. schema validation still rejects a malformed body (a null device);
// while prior-release / current bodies continue to load unchanged.
import { describe, it, expect } from "vitest";
import { parseLayoutObject } from "./yaml";
import { createTestLayout } from "../../tests/factories";

/** A schema-valid runtime body with a current-major schema_version header. */
function currentVersionBody(): Record<string, unknown> {
  const layout = createTestLayout();
  return {
    ...layout,
    metadata: {
      id: "11111111-1111-4111-8111-111111111111",
      name: layout.name,
      schema_version: "1.0",
    },
  };
}

describe("parseLayoutObject: forward-compat version gate (#2664)", () => {
  it("refuses a future-major body and returns null (does not throw)", () => {
    const body = currentVersionBody();
    (body.metadata as Record<string, unknown>).schema_version = "2.0";

    // The autosave/workspace door must surface a future major as null, the same
    // refusal the YAML file door produces, without an uncaught throw.
    let result: ReturnType<typeof parseLayoutObject>;
    expect(() => {
      result = parseLayoutObject(body);
    }).not.toThrow();
    expect(result!).toBeNull();
  });

  it("loads a current-major body unchanged (gate is a no-op for the current format)", () => {
    const result = parseLayoutObject(currentVersionBody());
    expect(result).not.toBeNull();
    expect(result?.metadata?.schema_version).toBe("1.0");
  });

  it("loads a body with an absent schema_version (legacy predates versioning)", () => {
    const layout = createTestLayout();
    const result = parseLayoutObject(layout);
    expect(result).not.toBeNull();
    expect(result?.name).toBe(layout.name);
  });
});

describe("parseLayoutObject: schema validation still rejects malformed bodies", () => {
  it("rejects a body whose rack carries a null device, returning null", () => {
    const layout = createTestLayout();
    const body = {
      ...layout,
      racks: [{ ...layout.racks[0], devices: [null] }],
    };
    const result = parseLayoutObject(body);
    expect(result).toBeNull();
  });
});
