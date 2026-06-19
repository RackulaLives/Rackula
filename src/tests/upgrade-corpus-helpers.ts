// src/tests/upgrade-corpus-helpers.ts
// Detects silent data loss when an old-format layout is loaded by the current
// code. Works on VALUES, not paths, so it is robust to legitimate restructuring
// (for example singular `rack` becoming `racks[0]`): a value that moves but
// survives is not a loss. A value that vanishes is a loss unless every place it
// appeared in the raw input matches an allow-list pattern (a declared, intentional
// transformation such as position scaling or `slot_position` consumption).
// Null leaves are recorded as "null:null" and treated as droppable values just
// like any other primitive; undefined is never recorded (it does not appear in
// parsed YAML/JSON).
// Limitation: value-presence can mask a real drop if the same primitive value
// also appears elsewhere. Distinctive values (ids, names, labels, colours, notes)
// are the silent-loss risk this targets, and those rarely collide.

export interface LeafIndex {
  values: Map<string, number>;
  paths: Map<string, string[]>;
}

export interface AllowListEntry {
  pathPattern: string;
  reason: string;
}

export interface SilentLoss {
  value: string;
  paths: string[];
}

export function collectLeaves(
  node: unknown,
  path = "$",
  acc?: LeafIndex,
): LeafIndex {
  const index: LeafIndex = acc ?? { values: new Map(), paths: new Map() };
  if (node === undefined) return index; // undefined never appears in parsed YAML/JSON
  if (node !== null && typeof node === "object") {
    if (Array.isArray(node)) {
      node.forEach((item, i) => collectLeaves(item, `${path}[${i}]`, index));
    } else {
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        collectLeaves(value, `${path}.${key}`, index);
      }
    }
    return index;
  }
  // primitive OR null is a leaf
  const value = node === null ? "null:null" : `${typeof node}:${String(node)}`;
  index.values.set(value, (index.values.get(value) ?? 0) + 1);
  const list = index.paths.get(value) ?? [];
  list.push(path);
  index.paths.set(value, list);
  return index;
}

export function findSilentLosses(
  raw: unknown,
  loaded: unknown,
  allowList: AllowListEntry[],
): SilentLoss[] {
  const rawIndex = collectLeaves(raw);
  const loadedIndex = collectLeaves(loaded);
  const patterns = allowList.map((entry) => new RegExp(entry.pathPattern));
  const losses: SilentLoss[] = [];
  for (const [value, count] of rawIndex.values) {
    const survived = loadedIndex.values.get(value) ?? 0;
    if (survived >= count) continue;
    const paths = rawIndex.paths.get(value) ?? [];
    const allDeclared = paths.every((p) => patterns.some((re) => re.test(p)));
    if (!allDeclared) losses.push({ value, paths });
  }
  return losses;
}
