/**
 * Bounded YAML complexity traversal (#2912)
 *
 * js-yaml resolves anchors/aliases to shared object references in O(input).
 * A naive tree walk (e.g. JSON.stringify) re-expands every alias, so a small,
 * acyclic document with nested aliases can expand to gigabytes ("billion
 * laughs"). assertYamlComplexityBounded must:
 * - Detect genuine cycles (a node reachable from itself) and reject them.
 * - Reject documents whose would-be-expanded size exceeds a bound, without
 *   ever materializing that expansion (bounded CPU and memory). The bound
 *   covers both node-heavy (nested aliases) and value-heavy (one large string
 *   aliased many times) bombs.
 * - Pass through legitimate documents, including ones with large but
 *   non-exponential shared references.
 *
 * Boundedness is asserted structurally rather than by wall-clock: the depth-40
 * alias bomb below has ~10 * 2^40 expanded leaves, so a regression to full
 * expansion could not build or walk it within the test runner's timeout. A
 * test that completes at all therefore proves the traversal stayed in the
 * compact graph.
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
    expect(() => assertYamlComplexityBounded(value, 200)).not.toThrow();
  });

  it("does not throw for many non-exponential shared references to the same small object", () => {
    // A legitimate pattern: the same small object referenced many times
    // (e.g. a shared device-type lookup). Total expanded size is linear, not
    // exponential, so this must pass.
    const shared = { note: "shared" };
    const value = { items: Array(5000).fill(shared) };
    expect(() => assertYamlComplexityBounded(value, 100)).not.toThrow();
  });

  it("throws YamlCircularReferenceError for a genuinely circular object", () => {
    const obj: Record<string, unknown> = { name: "circular" };
    obj.self = obj;
    expect(() => assertYamlComplexityBounded(obj, 100)).toThrow(
      YamlCircularReferenceError,
    );
  });

  it("throws YamlCircularReferenceError for a cycle nested inside an array", () => {
    const inner: Record<string, unknown> = {};
    const outer = { list: [inner] };
    inner.parent = outer;
    expect(() => assertYamlComplexityBounded(outer, 100)).toThrow(
      YamlCircularReferenceError,
    );
  });

  it("throws YamlTooComplexError for a nested-alias chain that would expand exponentially, without expanding it", () => {
    // Depth 40 would expand to roughly 10 * 2^40 (~1.1e13) leaves if
    // materialized -- infeasible to build. The bounded traversal must reject
    // it by tracking would-be-expanded size via memoized per-node totals,
    // never walking an already-fully-sized node's children twice. The input
    // byte length is tiny, so the floor budget applies.
    const bomb = buildAliasBombChain(40);
    expect(() => assertYamlComplexityBounded(bomb, 500)).toThrow(
      YamlTooComplexError,
    );
  });

  it("throws YamlTooComplexError for a value-heavy bomb: one large string aliased many times", () => {
    // A small source can define one ~50KB string via an anchor and alias it
    // thousands of times. Node count stays tiny, but the would-be-expanded
    // size is hundreds of MB. Counting string leaves by length catches this.
    const big = "z".repeat(50_000);
    const value = { arr: Array(5000).fill(big) };
    expect(() => assertYamlComplexityBounded(value, 55_000)).toThrow(
      YamlTooComplexError,
    );
  });

  it("does not throw for a large legitimate layout whose expanded size tracks its input size", () => {
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
    // A body of this shape serializes to a few hundred KB; the cap scales with
    // that, so a genuine (unaliased) layout of this size passes.
    expect(() => assertYamlComplexityBounded(value, 300_000)).not.toThrow();
  });
});
