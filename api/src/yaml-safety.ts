/**
 * Bounded, cycle-safe complexity check for parsed YAML bodies (#2912).
 *
 * js-yaml resolves anchors/aliases to shared object references in O(input), so
 * a naive walk that re-expands each alias (the old JSON.stringify guard) does
 * O(2^depth) work: a sub-1MB body can expand to gigabytes and hang the event
 * loop or OOM the process. This computes each unique object's would-be-expanded
 * size once (memoized) and reuses shared references in O(1), so total work is
 * O(nodes + edges) in the compact graph and the expansion is never
 * materialized. String leaves count their length, so the bound also covers
 * value-heavy bombs (one large string aliased many times), not just node-heavy
 * ones. The cap scales with input byte length: an unaliased body expands to at
 * most about its own size, so any body whose expansion far exceeds its source
 * is rejected while legitimate large layouts pass. A separate on-path set
 * catches genuine cycles.
 *
 * Input must come from js-yaml JSON_SCHEMA (plain objects, arrays, and JSON
 * scalars); the traversal does not descend into Map/Date/typed-array
 * containers, which that schema never produces.
 */

/**
 * Floor on the expanded-size budget, for small bodies. Above this the budget
 * scales with input length (SIZE_MULTIPLIER x bytes), so the limit tracks
 * attacker-controlled input size rather than a fixed magic number.
 */
const MIN_EXPANDED_SIZE = 1_000_000;

/**
 * How many units of expanded size each input byte may legitimately produce.
 * An unaliased YAML body expands to roughly its own size or less, so 4x gives
 * comfortable headroom for legitimate layouts while any real alias bomb
 * (which amplifies by orders of magnitude) is still rejected.
 */
const SIZE_MULTIPLIER = 4;

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
 * Throws if a parsed YAML value is circular or would expand (via aliases) past
 * a size bound derived from inputByteLength. Returns normally for legitimate
 * bodies, including ones with large but non-exponential shared references.
 */
export function assertYamlComplexityBounded(
  value: unknown,
  inputByteLength: number,
): void {
  const maxExpandedSize = Math.max(
    MIN_EXPANDED_SIZE,
    inputByteLength * SIZE_MULTIPLIER,
  );
  const onPath = new Set<object>();
  const sizeOf = new Map<object, number>();

  function walk(node: unknown): number {
    // Count a string by its length so the budget measures expanded size in
    // characters, not just node count -- a large string aliased many times is
    // as much a bomb as a deeply nested one.
    if (typeof node === "string") {
      return node.length;
    }
    if (node === null || typeof node !== "object") {
      return 1;
    }
    const obj = node as object;

    const memoized = sizeOf.get(obj);
    if (memoized !== undefined) {
      // Already fully sized via another alias to this same object -- reuse the
      // computed total instead of re-walking its children. This is what keeps
      // total work O(nodes + edges) instead of O(expanded size).
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
      if (total > maxExpandedSize) {
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
