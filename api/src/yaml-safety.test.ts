/**
 * Bounded YAML complexity traversal (#2912)
 *
 * js-yaml resolves anchors/aliases to shared object references in O(input).
 * A naive tree walk (e.g. JSON.stringify) re-expands every alias, so a small,
 * acyclic document with nested aliases can expand to gigabytes ("billion
 * laughs"). assertYamlComplexityBounded must:
 * - Detect genuine cycles (a node reachable from itself) and reject them.
 * - Reject documents whose *would-be-expanded* size exceeds a bound, without
 *   ever materializing that expansion (bounded CPU and memory).
 * - Pass through legitimate documents, including ones with large but
 *   non-exponential shared references, quickly.
 */
import { describe, it, expect } from "bun:test";
import {
  assertYamlComplexityBounded,
  YamlCircularReferenceError,
  YamlTooComplexError,
} from "./yaml-safety";

/**
 * Builds a chain of arrays where each level references the previous level
 * twice, mimicking a YAML anchor/alias "billion laughs" body. The compact
 * (shared-reference) graph has O(depth) nodes and edges, but a naive
 * expansion would have O(2^depth) leaves.
 */
function buildAliasBombChain(depth: number): unknown {
  let level: unknown[] = ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x"];
  for (let i = 0; i < depth; i++) {
    level = [level, level];
  }
  return level;
}

describe("assertYamlComplexityBounded", () => {
  it("does not throw for a normal, unshared object", () => {
    const value = {
      version: "1.0.0",
      name: "Test",
      racks: [{ id: "rack-a", devices: [{ id: "dev-1" }, { id: "dev-2" }] }],
    };
    expect(() => assertYamlComplexityBounded(value)).not.toThrow();
  });

  it("does not throw for many non-exponential shared references to the same small object", () => {
    // A legitimate pattern: the same small object referenced many times
    // (e.g. a shared device-type lookup). Total size is linear, not
    // exponential, so this must pass quickly.
    const shared = { note: "shared" };
    const value = { items: Array(5000).fill(shared) };
    const start = performance.now();
    expect(() => assertYamlComplexityBounded(value)).not.toThrow();
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("throws YamlCircularReferenceError for a genuinely circular object", () => {
    const obj: Record<string, unknown> = { name: "circular" };
    obj.self = obj;
    expect(() => assertYamlComplexityBounded(obj)).toThrow(
      YamlCircularReferenceError,
    );
  });

  it("throws YamlCircularReferenceError for a cycle nested inside an array", () => {
    const inner: Record<string, unknown> = {};
    const outer = { list: [inner] };
    inner.parent = outer;
    expect(() => assertYamlComplexityBounded(outer)).toThrow(
      YamlCircularReferenceError,
    );
  });

  it("throws YamlTooComplexError for a nested-alias chain that would expand exponentially, without expanding it", () => {
    // Depth 40 would expand to roughly 10 * 2^40 (~1.1e13) leaves if
    // materialized -- infeasible to actually build. The bounded traversal
    // must reject this in well under a second by tracking would-be-expanded
    // size via memoized per-node totals, never walking an already-fully-sized
    // node's children twice.
    const bomb = buildAliasBombChain(40);
    const start = performance.now();
    expect(() => assertYamlComplexityBounded(bomb)).toThrow(
      YamlTooComplexError,
    );
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("does not throw for a large legitimate array under the node cap", () => {
    const value = {
      racks: Array.from({ length: 500 }, (_, i) => ({
        id: `rack-${i}`,
        devices: Array.from({ length: 10 }, (_, j) => ({
          id: `dev-${i}-${j}`,
          device_type: "switch-1u",
          position: j,
          face: "front",
        })),
      })),
    };
    expect(() => assertYamlComplexityBounded(value)).not.toThrow();
  });
});
