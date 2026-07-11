/**
 * Bounded, cycle-safe complexity check for parsed YAML bodies (#2912).
 *
 * js-yaml resolves anchors/aliases to shared object references in O(input):
 * a document with nested aliases (each level referencing the prior twice) is
 * acyclic, but a naive tree walk that re-expands every alias -- including
 * the prior `JSON.stringify(parsed)` guard -- does O(2^depth) work. A body
 * a few hundred bytes long can expand to gigabytes, hanging the event loop
 * or OOMing the process. The same risk exists in any other naive consumer
 * of the parsed value downstream (e.g. schema validation), so this check
 * rejects overly-aliased documents outright rather than merely making its
 * own traversal cheap.
 *
 * The fix computes each unique object's *would-be-expanded* size exactly
 * once via memoized post-order accumulation: a shared reference's size is
 * looked up (O(1)) rather than re-walked, so total work is O(nodes + edges)
 * in the compact (shared-reference) graph -- not in the expanded tree. A
 * running total is checked after every child is folded in, so a document
 * that would expand past the cap is rejected as soon as that becomes
 * knowable, without ever materializing the expansion. A separate
 * "currently on the traversal path" set catches genuine cycles (a node
 * reachable from itself), which this DP formulation would otherwise recurse
 * into forever.
 */

/**
 * Safety cap on the would-be-expanded node count. Exponential growth from
 * aliasing means an attacker needs only a handful of extra alias levels to
 * clear any reasonable cap, so the exact value mostly trades off headroom
 * for legitimate large layouts against how much work a rejected request
 * does. 200,000 comfortably covers realistic self-hosted layouts (hundreds
 * of racks/devices) while still being reached within milliseconds for any
 * alias-bomb shape.
 */
const MAX_EXPANDED_NODES = 200_000;

export class YamlCircularReferenceError extends Error {
  constructor() {
    super("YAML body contains circular references and cannot be processed");
    this.name = "YamlCircularReferenceError";
  }
}

export class YamlTooComplexError extends Error {
  constructor() {
    super(
      "YAML body is too complex to process (nested aliases exceed the size limit)",
    );
    this.name = "YamlTooComplexError";
  }
}

/**
 * Walks a parsed YAML value and throws if it is circular or would expand
 * (via aliases) past MAX_EXPANDED_NODES. Returns normally for legitimate
 * bodies, including ones with large but non-exponential shared references.
 */
export function assertYamlComplexityBounded(value: unknown): void {
  const onPath = new Set<object>();
  const sizeOf = new Map<object, number>();

  function walk(node: unknown): number {
    if (node === null || typeof node !== "object") {
      return 1;
    }
    const obj = node as object;

    const memoized = sizeOf.get(obj);
    if (memoized !== undefined) {
      // Already fully sized via another alias to this same object -- reuse
      // the computed total instead of re-walking its children. This is what
      // keeps total work O(nodes + edges) instead of O(expanded size).
      return memoized;
    }

    if (onPath.has(obj)) {
      throw new YamlCircularReferenceError();
    }
    onPath.add(obj);

    let total = 1;
    const children: unknown[] = Array.isArray(obj)
      ? obj
      : Object.values(obj as Record<string, unknown>);
    for (const child of children) {
      total += walk(child);
      if (total > MAX_EXPANDED_NODES) {
        onPath.delete(obj);
        throw new YamlTooComplexError();
      }
    }

    onPath.delete(obj);
    sizeOf.set(obj, total);
    return total;
  }

  walk(value);
}
