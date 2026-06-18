# Upgrade-Safety Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that data written by a prior Rackula release still loads, with no silent loss, in the new release, across both the YAML ingress path and browser localStorage, plus a hands-on container upgrade check before tagging.

**Architecture:** A Vitest fixture corpus drives old-format layouts through the real production load functions (`parseLayoutYaml`, `parseLayoutYamlWithImages`, `loadLayoutBody`) and asserts round-trip completeness (nothing dropped except declared transformations). A manual Docker smoke script covers volume permissions and on-disk discovery that the in-memory test cannot see. A fail-closed CI job blocks releases that change the schema without adding a corpus fixture. Docs and policy are updated to retire the greenfield stance.

**Tech Stack:** TypeScript (strict), Vitest, Svelte 5, Bun (API), Docker Compose, bash, GitHub Actions.

## Global Constraints

- Writing style (all files, prose and comments): no em dashes, en dashes, or smart quotes; use plain colons, commas, periods, hyphens. No emoji. No bold in list items. Be succinct.
- Markdown is never hard-wrapped: one line per paragraph (prettier `proseWrap: never`).
- Testing rules (ESLint hard-blocks in test files): no `querySelector`/DOM access, no `toHaveClass`, no hardcoded colour assertions, no `toHaveLength(literal)` unless it is a behavioural invariant carrying `// eslint-disable-next-line no-restricted-syntax -- <justification>`.
- The corpus test asserts behaviour (no silent data loss), not static data values. Fixtures are inputs, not assertions; adding a fixture must touch zero test code (Zero-Change Rule).
- Rail-position invariant: rail positions are whole-U integers; never assert or introduce fractional rail positions.
- Bash scripts: `#!/usr/bin/env bash`, `set -euo pipefail`, errors to stderr via a `die()` helper, status logging to stderr. Avoid `mapfile` (macOS bash 3.2 incompatibility); use `while IFS= read -r`.
- Commit message format: `type: description` with a trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Pre-commit husky hook can crash on macOS (`mapfile`); if a commit fails for that reason and the change was locally verified, commit with `--no-verify`.
- Work happens in the existing worktree `.worktree/Rackula-upgrade-safety` on branch `feat/upgrade-safety-harness`. Never edit project files on `main`.

---

## File Structure

- Create: `src/tests/upgrade-corpus-helpers.ts` — leaf collection and silent-loss detection (pure, unit-testable).
- Create: `src/tests/upgrade-corpus-helpers.test.ts` — tests for the helper itself.
- Create: `src/tests/upgrade-corpus.test.ts` — globs fixtures, runs YAML ingress, asserts completeness.
- Create: `src/tests/browser-upgrade.test.ts` — localStorage ingress (`loadLayoutBody`, `loadWorkspaceIndex`).
- Create: `src/tests/fixtures/upgrade-corpus/` — fixture `.rackula.yaml` + `.expected.json` pairs and a `README.md`.
- Create: `scripts/upgrade-smoke.sh` — manual pre-release Docker upgrade smoke.
- Create: `scripts/check-corpus-freshness.sh` — release guard (schema changed implies a new fixture).
- Create: `scripts/add-corpus-fixture.sh` — one-command capture helper for the recurring ritual.
- Modify: `.github/workflows/release.yml` — add a `corpus-guard` job and make `stage-release` depend on it.
- Modify: `CLAUDE.md` — rewrite the greenfield Development Philosophy paragraph and the No-backwards-compatibility-hacks subsection.
- Modify: `docs/deployment/SELF-HOSTING.md` — add an "Upgrading an existing deployment" section.

## Reference: verified code surface

Load path (frontend):

- `parseLayoutYaml(yamlString: string): Promise<Layout>` at `src/lib/utils/yaml.ts:624`. Runs YAML parse, schema-version gate, Zod validation, then `adaptLegacyLayout`. Throws on invalid. Does NOT run `migrateLayout`.
- `parseLayoutYamlWithImages(yamlString: string): Promise<{ layout: Layout; images: ... }>` at `src/lib/utils/yaml.ts:637`.
- `parseYaml<T = unknown>(yamlString: string): Promise<T>` at `src/lib/utils/yaml.ts:101` (raw parse, no validation).
- `assertSchemaVersionSupported(schemaVersion: string | undefined): void` at `src/lib/schemas/index.ts:825` (throws on newer MAJOR).
- `migrateLayout(raw: Record<string, unknown>): Layout | null` at `src/lib/storage/migrate-layout.ts:43` (v0.6 single `rack` to `racks[]`, U-value positions scaled by `UNITS_PER_U`; null on failure).
- `loadLayoutBody(id: string): { ok: true; layout: Layout } | { ok: false }` at `src/lib/storage/browser-workspace.ts:186` (parses localStorage JSON, runs `migrateLayout`).
- `loadWorkspaceIndex(): WorkspaceIndex | null` at `src/lib/storage/browser-workspace.ts:118`.
- localStorage keys: `Rackula:workspace` (index), `Rackula:layout:<id>` (body), `Rackula:everHadLayouts`, `Rackula:autosave`. Body-key builder: `` `Rackula:layout:${id}` ``.
- `SCHEMA_VERSION = "1.0"` at `src/lib/schemas/index.ts:804`.
- Test factories in `src/tests/factories.ts`: `createTestLayout`, `createTestRack`, `createTestDevice`, `createTestDeviceType`.

API (Bun):

- `PUT /api/layouts/{uuid}` body = raw YAML (Content-Type `text/yaml`), returns `{ id, updatedAt, message }`, 201 if new.
- `GET /api/layouts/{uuid}` returns YAML text + header `X-Rackula-Updated-At`.
- `GET /api/version` returns `{ version, commit, buildTime }`. `GET /api/health` returns `{ ok: true, ... }`. API port 3001.

Docker:

- Persist compose: `deploy/docker-compose.persist.yml`. Frontend image `ghcr.io/rackulalives/rackula:persist`, API `ghcr.io/rackulalives/rackula-api:latest`. Volume `./data:/data`, container user uid 1001. Frontend port `8080`, proxies `/api/*` to `rackula-api:3001`.
- Released image tags: `ghcr.io/rackulalives/rackula:v{version}-persist` and `ghcr.io/rackulalives/rackula-api:{version}`.
- Previous released tag: `git tag --list 'v*' --sort=-v:refname`.

---

### Task 1: Silent-loss detection helper

**Files:**

- Create: `src/tests/upgrade-corpus-helpers.ts`
- Test: `src/tests/upgrade-corpus-helpers.test.ts`

**Interfaces:**

- Produces: `collectLeaves(node: unknown): LeafIndex`, `findSilentLosses(raw: unknown, loaded: unknown, allowList: AllowListEntry[]): SilentLoss[]`, and types `AllowListEntry = { pathPattern: string; reason: string }`, `SilentLoss = { value: string; paths: string[] }`. Used by Tasks 2, 3, 4.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/upgrade-corpus-helpers.test.ts
import { describe, it, expect } from "vitest";
import { findSilentLosses } from "./upgrade-corpus-helpers";

describe("findSilentLosses", () => {
  it("reports a leaf value that disappears and is not on the allow-list", () => {
    const raw = { name: "Lab", note: "keep me" };
    const loaded = { name: "Lab" };
    const losses = findSilentLosses(raw, loaded, []);
    expect(losses).toEqual([{ value: "string:keep me", paths: ["$.note"] }]);
  });

  it("treats a value as preserved when it survives under a restructured path", () => {
    // singular `rack` becomes racks[0]; the id value moves but survives
    const raw = { rack: { id: "rack-a" } };
    const loaded = { racks: [{ id: "rack-a" }] };
    expect(findSilentLosses(raw, loaded, [])).toEqual([]);
  });

  it("allows a declared drop when every source path matches the allow-list", () => {
    const raw = { racks: [{ devices: [{ slot_position: "0" }] }] };
    const loaded = { racks: [{ devices: [{}] }] };
    const allow = [
      { pathPattern: "slot_position$", reason: "consumed by carrier adapter" },
    ];
    expect(findSilentLosses(raw, loaded, allow)).toEqual([]);
  });

  it("flags a partial loss when a repeated value loses occurrences", () => {
    const raw = { a: "x", b: "x" };
    const loaded = { a: "x" };
    expect(findSilentLosses(raw, loaded, [])).toEqual([
      { value: "string:x", paths: ["$.a", "$.b"] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/tests/upgrade-corpus-helpers.test.ts` Expected: FAIL with "Failed to resolve import './upgrade-corpus-helpers'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tests/upgrade-corpus-helpers.ts
// Detects silent data loss when an old-format layout is loaded by the current
// code. Works on VALUES, not paths, so it is robust to legitimate restructuring
// (for example singular `rack` becoming `racks[0]`): a value that moves but
// survives is not a loss. A value that vanishes is a loss unless every place it
// appeared in the raw input matches an allow-list pattern (a declared, intentional
// transformation such as position scaling or `slot_position` consumption).
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
  if (node === null || node === undefined) return index;
  if (typeof node === "object") {
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
  const value = `${typeof node}:${String(node)}`;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/tests/upgrade-corpus-helpers.test.ts` Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tests/upgrade-corpus-helpers.ts src/tests/upgrade-corpus-helpers.test.ts
git commit -m "test: add silent-loss detection helper for upgrade corpus"
```

---

### Task 2: Corpus directory, first current-format fixture, and the YAML-ingress test

**Files:**

- Create: `src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml`
- Create: `src/tests/fixtures/upgrade-corpus/v26.5.0-representative.expected.json`
- Create: `src/tests/upgrade-corpus.test.ts`

**Interfaces:**

- Consumes: `findSilentLosses`, `AllowListEntry` from Task 1; `parseLayoutYaml`, `parseYaml` from `$lib/utils/yaml`.
- Produces: the globbing test pattern reused by Tasks 3 and 4. Sidecar JSON shape: `{ "reject"?: boolean, "hasImages"?: boolean, "allowList"?: AllowListEntry[] }`.

- [ ] **Step 1: Create the first fixture (current format, representative)**

```yaml
# src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml
# yaml-language-server: $schema=https://count.racku.la/schemas/layout-v1.json
metadata:
  id: 550e8400-e29b-41d4-a716-446655440000
  name: Representative Lab
  schema_version: "1.0"
version: "1.0"
name: Representative Lab
racks:
  - id: "rack-a"
    name: "Rack A"
    height: 42
    width: 19
    desc_units: false
    show_rear: true
    form_factor: "4-post-cabinet"
    starting_unit: 1
    position: 0
    devices:
      - id: "dev-switch"
        device_type: "switch-1u"
        position: 240
        face: "front"
      - id: "dev-server"
        device_type: "server-2u"
        position: 60
        face: "front"
device_types:
  - slug: "switch-1u"
    u_height: 1
    manufacturer: "Acme"
    colour: "#336699"
    category: "network"
  - slug: "server-2u"
    u_height: 2
    manufacturer: "Acme"
    colour: "#336699"
    category: "server"
settings:
  display_mode: "label"
  show_labels_on_images: false
```

- [ ] **Step 2: Create its sidecar (current format needs no transformations)**

```json
{
  "allowList": []
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// src/tests/upgrade-corpus.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLayoutYaml,
  parseLayoutYamlWithImages,
  parseYaml,
} from "$lib/utils/yaml";
import {
  findSilentLosses,
  type AllowListEntry,
} from "./upgrade-corpus-helpers";

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
        await expect(parseLayoutYaml(yaml)).rejects.toThrow();
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/tests/upgrade-corpus.test.ts` Expected: PASS. The discovery test passes and `v26.5.0-representative.rackula.yaml` loads with no losses.

- [ ] **Step 5: Verify lint is clean on the new test**

Run: `npm run lint` Expected: no errors in `src/tests/upgrade-corpus.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/tests/upgrade-corpus.test.ts src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml src/tests/fixtures/upgrade-corpus/v26.5.0-representative.expected.json
git commit -m "test: add upgrade corpus YAML-ingress test with first fixture"
```

---

### Task 3: Legacy and edge-case YAML fixtures

**Files:**

- Create: `src/tests/fixtures/upgrade-corpus/pre-carrier-slot-position.rackula.yaml`
- Create: `src/tests/fixtures/upgrade-corpus/pre-carrier-slot-position.expected.json`
- Create: `src/tests/fixtures/upgrade-corpus/schema-version-absent.rackula.yaml`
- Create: `src/tests/fixtures/upgrade-corpus/schema-version-absent.expected.json`
- Create: `src/tests/fixtures/upgrade-corpus/schema-version-future.rackula.yaml`
- Create: `src/tests/fixtures/upgrade-corpus/schema-version-future.expected.json`

**Interfaces:**

- Consumes: the globbing test from Task 2 (no test-code changes; fixtures are discovered automatically).

- [ ] **Step 1: Create the pre-carrier slot_position fixture**

Build a layout that places a device through a half-width carrier using the legacy `slot_position` field that `adaptLegacyLayout` consumes. Inspect `src/lib/storage/adapt-legacy-layout.ts` and `src/tests/adapt-legacy-layout.test.ts` to copy the exact legacy shape (device with `slot_position` and the carrier slug constants `CARRIER_2COL_SLUG` / `CARRIER_2X2_SLUG`), then serialize a minimal but valid layout to YAML. The fixture must contain at least one device using `slot_position`.

```yaml
# src/tests/fixtures/upgrade-corpus/pre-carrier-slot-position.rackula.yaml
# yaml-language-server: $schema=https://count.racku.la/schemas/layout-v1.json
metadata:
  id: 11111111-1111-4111-8111-111111111111
  name: Pre-Carrier Lab
  schema_version: "1.0"
version: "1.0"
name: Pre-Carrier Lab
racks:
  - id: "rack-a"
    name: "Rack A"
    height: 42
    width: 19
    desc_units: false
    show_rear: true
    form_factor: "4-post-cabinet"
    starting_unit: 1
    position: 0
    devices:
      - id: "carrier-1"
        device_type: "carrier-1u-2col"
        position: 160
        face: "front"
      - id: "rb-child"
        device_type: "rb-half"
        position: 160
        face: "front"
        slot_position: "0"
device_types:
  - slug: "carrier-1u-2col"
    u_height: 1
    manufacturer: "Generic"
    category: "other"
  - slug: "rb-half"
    u_height: 1
    manufacturer: "MikroTik"
    category: "network"
settings:
  display_mode: "label"
  show_labels_on_images: false
```

Note: if `adaptLegacyLayout` or `LayoutSchema` rejects this exact shape when run in Step 4, adjust the fixture to the minimal shape the adapter actually accepts (the test failure output names the rejected field). The objective is a fixture that loads through `parseLayoutYaml` and exercises `slot_position` consumption.

- [ ] **Step 2: Create its sidecar (slot_position consumption is a declared drop)**

```json
{
  "allowList": [
    {
      "pathPattern": "slot_position$",
      "reason": "consumed by carrier adapter into container placement"
    }
  ]
}
```

- [ ] **Step 3: Create the schema-version-absent fixture and sidecar**

Copy `v26.5.0-representative.rackula.yaml` but remove the `metadata.schema_version` line and the top-level `version` line is kept. The gate must treat an absent `schema_version` as `1.0` and load it.

```json
{
  "allowList": []
}
```

- [ ] **Step 4: Create the future-version fixture and sidecar (must be rejected)**

Copy the representative fixture but set `metadata.schema_version: "2.0"`. The sidecar marks it for rejection.

```json
{
  "reject": true
}
```

- [ ] **Step 5: Run the corpus test against all fixtures**

Run: `npm run test:run -- src/tests/upgrade-corpus.test.ts` Expected: PASS. The slot_position and absent-version fixtures load with no undeclared losses; the future-version fixture is rejected.

- [ ] **Step 6: Commit**

```bash
git add src/tests/fixtures/upgrade-corpus/
git commit -m "test: add legacy and edge-case fixtures to upgrade corpus"
```

---

### Task 4: Browser-mode localStorage upgrade tests

**Files:**

- Create: `src/tests/browser-upgrade.test.ts`

**Interfaces:**

- Consumes: `loadLayoutBody`, `loadWorkspaceIndex` from `$lib/storage/browser-workspace`; `findSilentLosses` from Task 1.

**Why a separate file:** the localStorage path runs `migrateLayout` (the v0.6 single-`rack` to `racks[]` migration), which the YAML path does not. It also has a key structure (`Rackula:workspace` index plus `Rackula:layout:<id>` bodies) that, if changed, orphans old browser data even when each body parses. Neither risk is visible to Task 2/3.

- [ ] **Step 1: Confirm the localStorage body shape**

Read `src/lib/storage/browser-workspace.ts:118-206` and `src/tests/browser-workspace-persist.test.ts` to confirm the exact JSON shape stored under `Rackula:layout:<id>` (what `loadLayoutBody` parses before calling `migrateLayout`) and the `Rackula:workspace` index shape that `loadWorkspaceIndex` reads. The test below assumes `loadLayoutBody` reads the raw body from `safeGetItem` and returns `{ ok: true, layout }`. Adjust the seeded shape to match the actual reader.

- [ ] **Step 2: Write the failing test**

```typescript
// src/tests/browser-upgrade.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadLayoutBody,
  loadWorkspaceIndex,
} from "$lib/storage/browser-workspace";
import { findSilentLosses } from "./upgrade-corpus-helpers";

// A v0.6-shaped layout body: single `rack` (not `racks[]`), U-value position.
// migrateLayout converts `rack` -> `racks[0]` and scales position by UNITS_PER_U.
const V06_BODY = {
  version: "0.6.0",
  name: "Old Browser Lab",
  rack: {
    id: "rack-a",
    name: "Rack A",
    height: 42,
    devices: [
      { id: "dev-1", device_type: "switch-1u", position: 5, face: "front" },
    ],
  },
  device_types: [
    {
      slug: "switch-1u",
      u_height: 1,
      manufacturer: "Acme",
      category: "network",
    },
  ],
};

describe("browser upgrade: localStorage ingress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadLayoutBody migrates a v0.6 body without dropping distinctive values", () => {
    localStorage.setItem("Rackula:layout:old-1", JSON.stringify(V06_BODY));
    const result = loadLayoutBody("old-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // position scales (5 -> 5 * UNITS_PER_U) so allow position changes;
    // singular `rack` -> racks[0] preserves the id/name/slug values.
    const losses = findSilentLosses(V06_BODY, result.layout, [
      {
        pathPattern: "position$",
        reason: "U value scaled to internal units by migrateLayout",
      },
    ]);
    expect(losses, `silent loss:\n${JSON.stringify(losses, null, 2)}`).toEqual(
      [],
    );
  });

  it("loadWorkspaceIndex still finds layouts under the current key structure", () => {
    // Seed an index that references a stored body, mirroring an upgraded browser.
    localStorage.setItem("Rackula:layout:old-1", JSON.stringify(V06_BODY));
    const index = loadWorkspaceIndex();
    // If the key structure changed in a release, this returns null while a body
    // still exists, which is exactly the orphaning we guard against.
    expect(index === null || typeof index === "object").toBe(true);
  });
});
```

Note on the second test: read `loadWorkspaceIndex` and the index shape first, then strengthen this assertion to seed a real `Rackula:workspace` index entry pointing at `old-1` and assert the index lists that id. The placeholder assertion above must be replaced with that concrete check once the index shape is confirmed in Step 1. Do not leave the weak assertion.

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `npm run test:run -- src/tests/browser-upgrade.test.ts` Expected first run: FAIL if the seeded shape does not match the reader (fix the shape per Step 1). Then PASS once shapes align.

- [ ] **Step 4: Verify lint**

Run: `npm run lint` Expected: no errors in `src/tests/browser-upgrade.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/tests/browser-upgrade.test.ts
git commit -m "test: add browser-mode localStorage upgrade tests"
```

---

### Task 5: Manual Docker upgrade smoke script

**Files:**

- Create: `scripts/upgrade-smoke.sh`

**Interfaces:**

- Consumes: a corpus fixture as seed data (reuses `src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml`).
- Produces: a zero-argument script; exit 0 on PASS, non-zero on FAIL.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# upgrade-smoke.sh — Manual pre-release Docker upgrade smoke.
#
# Seeds a /data volume using the PREVIOUS released images, then brings up the
# locally built NEW images against the same volume and confirms the seeded
# layout survives. Covers two risks the in-memory corpus test cannot see:
# volume permissions (uid 1001) and on-disk layout discovery.
#
# Usage: scripts/upgrade-smoke.sh        (resolves previous tag automatically)
#        OLD_TAG=v26.5.0 scripts/upgrade-smoke.sh   (override)
#
# Requires: docker, curl. Old images are pulled from ghcr.io; if they are
# private, run `gh auth token | docker login ghcr.io -u <user> --password-stdin`
# first.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo ">> $*" >&2; }

command -v docker >/dev/null || die "docker not found"
command -v curl >/dev/null || die "curl not found"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Resolve the previous released tag (newest v* tag not pointing at HEAD).
OLD_TAG="${OLD_TAG:-}"
if [[ -z "$OLD_TAG" ]]; then
  head_tag="$(git tag --points-at HEAD --list 'v*' | head -1 || true)"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$t" != "$head_tag" ]]; then OLD_TAG="$t"; break; fi
  done < <(git tag --list 'v*' --sort=-v:refname)
fi
[[ -n "$OLD_TAG" ]] || die "could not resolve a previous release tag; set OLD_TAG=vX.Y.Z"
OLD_VERSION="${OLD_TAG#v}"
info "Upgrading from $OLD_TAG"

OLD_FRONTEND="ghcr.io/rackulalives/rackula:${OLD_TAG}-persist"
OLD_API="ghcr.io/rackulalives/rackula-api:${OLD_VERSION}"

PROJECT="rackula-upgrade-smoke"
VOLUME="${PROJECT}-data"
NET="${PROJECT}-net"
SEED_YAML="src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml"
SEED_UUID="550e8400-e29b-41d4-a716-446655440000"
API_PORT=13001

cleanup() {
  docker rm -f "${PROJECT}-api" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$VOLUME" >/dev/null
docker network create "$NET" >/dev/null 2>&1 || true

wait_for_health() {
  local name="$1" tries=30
  while (( tries-- > 0 )); do
    if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  docker logs "$name" >&2 || true
  die "API did not become healthy"
}

run_api() {
  local image="$1" name="$2"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network "$NET" \
    -e DATA_DIR=/data -e RACKULA_API_PORT=3001 -e RACKULA_AUTH_MODE=none \
    -v "${VOLUME}:/data" -p "${API_PORT}:3001" "$image" >/dev/null
}

info "Pulling and starting OLD API ($OLD_API)"
docker pull "$OLD_API" >/dev/null || die "could not pull $OLD_API (login to ghcr.io?)"
run_api "$OLD_API" "${PROJECT}-api"
wait_for_health "${PROJECT}-api"

info "Seeding layout $SEED_UUID through the OLD API"
curl -fsS -X PUT "http://127.0.0.1:${API_PORT}/api/layouts/${SEED_UUID}" \
  -H "Content-Type: text/yaml" --data-binary "@${SEED_YAML}" >/dev/null \
  || die "seed PUT failed"

info "Stopping OLD API (keeping volume)"
docker rm -f "${PROJECT}-api" >/dev/null

info "Building NEW API image from working tree"
docker build -f api/Dockerfile -t "${PROJECT}/api:new" api >/dev/null \
  || die "new API image build failed"

info "Starting NEW API against the same volume"
run_api "${PROJECT}/api:new" "${PROJECT}-api"
wait_for_health "${PROJECT}-api"

info "Asserting the seeded layout survived the upgrade"
body="$(curl -fsS "http://127.0.0.1:${API_PORT}/api/layouts/${SEED_UUID}")" \
  || die "GET after upgrade failed (layout not found, permissions, or discovery change)"
echo "$body" | grep -q "Representative Lab" \
  || die "layout body did not contain expected content after upgrade"

info "Asserting NEW API reports a version"
curl -fsS "http://127.0.0.1:${API_PORT}/api/version" | grep -q '"version"' \
  || die "version endpoint did not return a version"

echo "PASS: upgrade from ${OLD_TAG} preserved the seeded layout" >&2
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/upgrade-smoke.sh
```

- [ ] **Step 3: Run it (requires Docker and at least one prior v\* tag)**

Run: `scripts/upgrade-smoke.sh` Expected: ends with `PASS: upgrade from vX.Y.Z preserved the seeded layout`. If no prior tag exists or Docker is unavailable, it exits non-zero with a clear ERROR; record that as a known precondition rather than a code defect.

- [ ] **Step 4: Lint the script**

Run: `command -v shellcheck >/dev/null && shellcheck scripts/upgrade-smoke.sh || echo "shellcheck not installed, skipping"` Expected: no errors (or skipped).

- [ ] **Step 5: Commit**

```bash
git add scripts/upgrade-smoke.sh
git commit -m "test: add manual Docker upgrade smoke script"
```

---

### Task 6: Release guard (fail-closed CI)

**Files:**

- Create: `scripts/check-corpus-freshness.sh`
- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Consumes: git tags and the corpus directory.
- Produces: a `corpus-guard` job that `stage-release` depends on.

- [ ] **Step 1: Write the guard script**

```bash
#!/usr/bin/env bash
# check-corpus-freshness.sh — Fail if the schema changed since the last release
# but no new upgrade-corpus fixture was added. Fail-closed release guard.
#
# Usage: scripts/check-corpus-freshness.sh [BASE_REF]
# BASE_REF defaults to the newest v* tag that does not point at HEAD.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

CORPUS_DIR="src/tests/fixtures/upgrade-corpus"
SCHEMA_PATHS=(
  "src/lib/schemas"
  "src/lib/utils/yaml.ts"
  "src/lib/utils/serialization.ts"
  "src/lib/storage/migrate-layout.ts"
  "src/lib/storage/adapt-legacy-layout.ts"
)

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  head_tag="$(git tag --points-at HEAD --list 'v*' | head -1 || true)"
  while IFS= read -r t; do
    [[ -z "$t" ]] && continue
    if [[ "$t" != "$head_tag" ]]; then BASE="$t"; break; fi
  done < <(git tag --list 'v*' --sort=-v:refname)
fi
[[ -n "$BASE" ]] || die "could not resolve a previous release tag; pass one explicitly"

echo ">> comparing ${BASE}..HEAD" >&2
if git diff --quiet "$BASE" HEAD -- "${SCHEMA_PATHS[@]}"; then
  echo ">> no schema-path changes since ${BASE}; corpus freshness not required" >&2
  exit 0
fi

added="$(git diff --name-only --diff-filter=A "$BASE" HEAD -- "${CORPUS_DIR}/*.rackula.yaml" | grep -c . || true)"
if [[ "${added:-0}" -lt 1 ]]; then
  die "schema changed since ${BASE} but no new corpus fixture was added under ${CORPUS_DIR}. Capture a current-format layout (see ${CORPUS_DIR}/README.md) and commit it."
fi
echo ">> schema changed and ${added} new corpus fixture(s) added since ${BASE}; OK" >&2
```

- [ ] **Step 2: Make it executable and test locally**

```bash
chmod +x scripts/check-corpus-freshness.sh
scripts/check-corpus-freshness.sh "$(git tag --list 'v*' --sort=-v:refname | head -1)"
```

Expected: prints either "no schema-path changes" or "N new corpus fixture(s) added; OK", exit 0. (On this branch the corpus is brand new, so it passes.)

- [ ] **Step 3: Add the `corpus-guard` job to release.yml**

Insert this job after the `validate` job (after line 88, before the `stage-release` job at line 93) in `.github/workflows/release.yml`:

```yaml
# Fail-closed guard: a release that changes the data schema must add a new
# upgrade-corpus fixture, so every future release is forced to load this
# release's format. See docs/superpowers/specs/2026-06-17-upgrade-safety-harness-design.md.
corpus-guard:
  name: "Guard: upgrade corpus freshness"
  runs-on: ubuntu-latest
  timeout-minutes: 5
  permissions:
    contents: read
  steps:
    - name: Checkout (full history + tags)
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
        fetch-tags: true
    - name: Check corpus freshness
      run: scripts/check-corpus-freshness.sh
```

- [ ] **Step 4: Make `stage-release` depend on the guard**

In `.github/workflows/release.yml`, change the `stage-release` job's needs line (line 95) from:

```yaml
needs: [validate]
```

to:

```yaml
needs: [validate, corpus-guard]
```

- [ ] **Step 5: Validate the workflow YAML**

Run: `command -v actionlint >/dev/null && actionlint .github/workflows/release.yml || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"` Expected: no errors / "yaml ok".

- [ ] **Step 6: Commit**

```bash
git add scripts/check-corpus-freshness.sh .github/workflows/release.yml
git commit -m "ci: add fail-closed release guard for upgrade corpus freshness"
```

---

### Task 7: Capture tooling, docs, and policy

**Files:**

- Create: `scripts/add-corpus-fixture.sh`
- Create: `src/tests/fixtures/upgrade-corpus/README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/deployment/SELF-HOSTING.md`

**Interfaces:**

- Consumes: nothing. Produces: the recurring-ritual one-command helper and updated policy.

- [ ] **Step 1: Write the capture helper**

```bash
#!/usr/bin/env bash
# add-corpus-fixture.sh — Add a current-format layout to the upgrade corpus.
#
# Usage: scripts/add-corpus-fixture.sh <path-to.rackula.yaml> <tag-slug>
# Example: scripts/add-corpus-fixture.sh ~/Downloads/lab.rackula.yaml v26.6.0-lab
#
# Copies the layout into the corpus and writes an empty allow-list sidecar
# (current-format layouts need no transformations). Verify by running:
#   npm run test:run -- src/tests/upgrade-corpus.test.ts
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

SRC="${1:-}"
SLUG="${2:-}"
[[ -n "$SRC" && -n "$SLUG" ]] || die "usage: $0 <path-to.rackula.yaml> <tag-slug>"
[[ -f "$SRC" ]] || die "no such file: $SRC"

DIR="src/tests/fixtures/upgrade-corpus"
cp "$SRC" "${DIR}/${SLUG}.rackula.yaml"
printf '{\n  "allowList": []\n}\n' > "${DIR}/${SLUG}.expected.json"
echo ">> added ${DIR}/${SLUG}.rackula.yaml + sidecar" >&2
echo ">> now run: npm run test:run -- src/tests/upgrade-corpus.test.ts" >&2
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/add-corpus-fixture.sh
```

- [ ] **Step 3: Write the corpus README**

````markdown
# Upgrade Corpus

Each entry is a pair: a `.rackula.yaml` layout exactly as some past version wrote it, and a `.expected.json` sidecar listing intentional transformations the load may apply.

`src/tests/upgrade-corpus.test.ts` runs every YAML fixture through the real `parseLayoutYaml` and fails if any leaf value disappears that is not declared in the sidecar allow-list. Browser-mode localStorage cases live in `src/tests/browser-upgrade.test.ts`.

## Sidecar format

```json
{
  "reject": false,
  "hasImages": false,
  "allowList": [
    { "pathPattern": "slot_position$", "reason": "consumed by carrier adapter" }
  ]
}
```
````

`reject: true` asserts the version gate rejects the fixture. `hasImages: true` routes loading through `parseLayoutYamlWithImages`. `allowList` patterns are JS regexes matched against the raw leaf path; a value that vanishes is a failure unless every path it appeared at matches an entry.

## Adding a fixture each release (required when the schema changes)

1. Export a representative layout from the version about to ship.
2. Run `scripts/add-corpus-fixture.sh <file> v<version>-<desc>`.
3. Run `npm run test:run -- src/tests/upgrade-corpus.test.ts` and confirm it passes.
4. Commit both files.

The release pipeline blocks (see `scripts/check-corpus-freshness.sh`) if a schema-touching release adds no new fixture.

`````

- [ ] **Step 4: Rewrite the greenfield policy in CLAUDE.md**

In `CLAUDE.md`, under `## Development Philosophy`, replace the `**Greenfield approach:**` paragraph:

Replace:
````markdown
**Greenfield approach:** Do not use migration or legacy support concepts in this project.
Implement features as if they are the first and only implementation.
`````

with:

```markdown
**Prior-release data is supported and tested:** Rackula has shipped releases that real users run with saved data. Reading data written by a prior release is a first-class, tested requirement. A schema change must be backward-compatible, or ship a migration plus a new fixture in the upgrade corpus (`src/tests/fixtures/upgrade-corpus/`). See the design at `docs/superpowers/specs/2026-06-17-upgrade-safety-harness-design.md`.
```

- [ ] **Step 5: Update the No-backwards-compatibility-hacks subsection in CLAUDE.md**

Replace the `**No backwards compatibility hacks:**` block:

```markdown
**No backwards compatibility hacks:**

- No renaming to `_unusedVar`
- No re-exporting removed types
- No `// removed` comments
- If unused, delete it
```

with:

```markdown
**No dead-code hacks:**

- No renaming to `_unusedVar`
- No re-exporting removed types
- No `// removed` comments
- If unused, delete it

This is about dead code, not data. Migrations and legacy-data adapters that let prior-release layouts load are required code, not hacks; keep them and test them via the upgrade corpus.
```

- [ ] **Step 6: Add the upgrade section to SELF-HOSTING.md**

In `docs/deployment/SELF-HOSTING.md`, after the `## Customization` section and before `## Stop-Gap Authentication Hardening`, insert:

```markdown
## Upgrading an existing deployment

Your layouts live in the `/data` volume and are not touched by pulling a new image.

1. Back up the data directory first: `cp -a data data.bak` (or snapshot the volume).
2. Pull the new images: `docker compose pull`.
3. Recreate the containers: `docker compose up -d`.

Layouts written by the previous release load as-is. If a release migrates the data format, the migration runs on load and the upgraded layout is written back on your next save. The server also keeps automatic snapshots per layout, so a bad write does not lose the prior copy. Keep the directory owned by uid 1001 (`sudo chown -R 1001:1001 data`).
```

- [ ] **Step 7: Format docs and verify**

Run: `npx prettier --write CLAUDE.md docs/deployment/SELF-HOSTING.md "src/tests/fixtures/upgrade-corpus/README.md"` Then run: `command -v shellcheck >/dev/null && shellcheck scripts/add-corpus-fixture.sh || echo "shellcheck skipped"` Expected: files formatted, no shellcheck errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/add-corpus-fixture.sh src/tests/fixtures/upgrade-corpus/README.md CLAUDE.md docs/deployment/SELF-HOSTING.md
git commit -m "docs: retire greenfield stance, document upgrade path and corpus ritual"
```

---

### Task 8: File the API save-path validation fast-follow

**Files:** none (GitHub issue only).

- [ ] **Step 1: Create the issue**

```bash
gh issue create \
  --title "API persists layouts without schema validation (fast-follow from upgrade-safety harness)" \
  --body "$(cat <<'EOF'
The persistence API saves layout YAML after a syntax check only; it does not validate against the Zod LayoutSchema before writing to the /data volume (see api/src/routes/layouts.ts PUT /layouts/:uuid -> saveLayout). Malformed or stale-format data can be persisted and only fails later in the frontend load.

Deferred from the upgrade-safety harness design (docs/superpowers/specs/2026-06-17-upgrade-safety-harness-design.md, Component 5 / out of scope). It is defense-in-depth, not the silent-loss fix, so it was intentionally not bundled with the test harness before release.

Acceptance:
- PUT /layouts/:uuid rejects a body that fails schema validation with a 4xx and a clear error.
- Valid layouts continue to save unchanged.
- A test covers reject-on-invalid and accept-on-valid.
EOF
)"
```

- [ ] **Step 2: Record the issue number** in the PR description when the branch is finished.

---

## Self-Review

**1. Spec coverage:**

- Component 1 (fixture corpus, real+synthetic, split sidecar): Tasks 2, 3 (synthetic + first real-format), Task 7 Step 1 (auto sidecar via `add-corpus-fixture.sh`). Operator-supplied real fixtures are captured with the Task 7 helper after merge; noted in handoff.
- Component 2 (corpus test, real entry point, round-trip completeness, localStorage case): Task 1 (helper), Task 2 (YAML ingress via `parseLayoutYaml`), Task 4 (localStorage via `loadLayoutBody` + `loadWorkspaceIndex`).
- Component 3 (Docker smoke, perms + on-disk, zero-arg auto-tag): Task 5.
- Component 4 (ritual blocks, auto sidecar): Task 6 (guard) + Task 7 (helper, README).
- Component 5 (CLAUDE.md + SELF-HOSTING.md): Task 7 Steps 4-6.
- Out-of-scope API validation fast-follow: Task 8. All spec components map to tasks. No gaps.

**2. Placeholder scan:** Two spots intentionally instruct verify-then-adjust against real code (Task 3 Step 1 legacy shape, Task 4 Step 1 body shape) because the exact accepted shape must be read from source; both name the concrete function and the failure signal, and Task 4 Step 2 explicitly forbids leaving the weak assertion. No "TBD"/"handle edge cases"/empty-code placeholders remain.

**3. Type consistency:** `findSilentLosses(raw, loaded, allowList)` and `AllowListEntry { pathPattern, reason }` are defined in Task 1 and consumed identically in Tasks 2 and 4. Sidecar shape `{ reject?, hasImages?, allowList? }` is defined in Task 2 and matched by Task 3 fixtures and the Task 7 README. `parseLayoutYaml` / `parseLayoutYamlWithImages` signatures match the verified surface.
