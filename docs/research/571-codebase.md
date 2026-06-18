# Research Spike #571: JSON Schema Publishing Readiness Assessment

**Date:** 2026-06-13  
**Issue:** #571 — Publish JSON Schema for YAML validation  
**Status:** Readiness assessment (READ-ONLY codebase investigation)  
**Worktree:** `/Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-571`

---

## Executive Summary

**Readiness verdict: NOT READY to publish.**

The project has the foundational schema versioning policy and Zod 4 native JSON Schema support, but three critical blockers prevent publishing:

1. **Carrier-first schema redesign (issue #2158)** is pending in a worktree with approved specs but not yet merged to main. Publishing now ships a layout schema that will become stale/incompatible on M03.
2. **Missing rejection gate for newer-MAJOR schema versions (#2205)** is tracked as follow-up work. The policy exists (SCHEMA.md) but is not enforced at runtime.
3. **No CI assertion for `schema_version` in serialized output.** Writers default to `"1.0"` but a test does not pin this, allowing future writers to accidentally omit it.

The infrastructure for publishing (versioned `$id` URL pattern, field ordering, metadata section) is ready. The gate implementation and schema stability are the critical path items.

---

## 1. The Zod Schemas

### Top-Level Schema for Saved Layout Files

**Exact name:** `LayoutSchema` (exported from `src/lib/schemas/index.ts`)

The layout schema is defined in two parts due to migration complexity:

- **Input schema:** `LayoutSchemaInput` (line 777–797) — accepts legacy single `rack` or modern `racks[]` array
- **Base transform:** `LayoutSchemaBase` (line 972–1056) — applies migration transforms (position migration, rack ID generation, slot-position recovery)
- **Validation layer:** `LayoutSchema` (line 1061–1209) — applies cross-field referential integrity checks via `.superRefine()`

The final exported `LayoutSchema` is the complete entry point for validation on load.

### Non-JSON-Schema-Translatable Constructs

Zod features that DON'T translate to JSON Schema and their locations:

| Construct | Purpose | File:Lines | Impact |
| --- | --- | --- | --- |
| `.refine()` | Single-field validation with custom message | `index.ts:416–419` (ConnectionSchema: "Cannot connect a port to itself") | Expressed as JSON Schema `not` or custom error message in editor, not automatically |
| `.refine()` | Container+slot validation | `index.ts:615–626` (PlacedDeviceSchema: slot_id required when container_id set) | **Critical:** requires conditional logic in editor validation |
| `.superRefine()` | Half-depth device interface validation | `index.ts:543–564` (DeviceTypeSchema: half-depth cannot have interfaces on both faces) | Custom error path handling; needs editor-side replication |
| `.superRefine()` | Rack and group referential checks | `index.ts:1061–1209` (LayoutSchema: slug uniqueness, rack_groups reference valid racks, container children reference valid parents) | **Most complex:** cross-collection foreign-key logic; editor cannot replicate without schema context |
| `.transform()` | Position migration (pre-0.7.0 to internal units) | `index.ts:972–1056` | Not publishable; only for backward compat on load |
| `.passthrough()` | Unknown field preservation | `index.ts:254`, `index.ts:542`, `index.ts:614`, `index.ts:674`, etc. | Requires `additionalProperties: true` in JSON Schema |
| `.default()` | Runtime defaults | `index.ts:585` (ports default to `[]`), `index.ts:699` (show_rear defaults to `true`) | Expressed as `default` in JSON Schema; safe |

### The `metadata.schema_version` Field

**Current value:** `"1.0"` (hardcoded default in serializers at `yaml.ts:310`, `archive.ts:250`, `archive.ts:699`, `archive.ts:730`)

**How it is set:**

- Every save defaults to `"1.0"` (no runtime bump mechanism exists yet)
- Writers at `serializeLayoutToYamlWithMetadata` and `serializeLayoutToYaml` emit this field
- Input schema allows any non-empty string (line 753: `z.string().min(1, "Schema version is required")`)

**How the loader gates on it:**

The **rejection gate does not exist in the running app.**

Per `docs/reference/SCHEMA.md` (lines 47–56) and `docs/research/spike-1113-schema-versioning-policy.md` (sections 1–2, signed off 2026-06-13), the policy states:

- On read: absent `schema_version` is treated as `"1.0"` (line 42–45 of SCHEMA.md)
- Reject if `doc.major > app.major` (non-destructively)
- Load any `doc.major == app.major`

However, **issue #2205** (tracked open in spike-1113 section 10) is the issue to implement this gate. It is not yet built. The schema does validate that `schema_version` is a non-empty string (`index.ts:753`); the missing piece is specifically the newer-MAJOR rejection gate (`doc.major > app.major`), not field-level validation.

### Discriminated Unions and Recursive Schemas

**Discriminated unions:** None used in the main layout schema. The closest is the `MinimalLayoutV2Schema` (share.ts) which detects multi-rack format by presence of `rs` field (line 156–168), not a true Zod discriminated union.

**Lazy/recursive schemas:** None. Containers use nested `device.container_id` references, not recursive type definitions.

---

## 2. Zod 4 Native JSON Schema Support

**Confirmed:** Zod 4.4.3 (the pinned version in `package.json` line 97) includes native JSON Schema support.

**Evidence:**

- File `/Users/gvns/code/projects/Rackula/Rackula/node_modules/zod/v4/core/to-json-schema.d.ts` exists with exports for:
  - `createToJSONSchemaMethod<T>` (creates a `.toJSONSchema()` instance method)
  - Parameters: `target` ("draft-04", "draft-07", "draft-2020-12", "openapi-3.0")
  - `io` parameter ("input" or "output") for transforms
  - `unrepresentable` ("throw" or "any") for non-translatable schemas

**Not yet used in project:** No imports of `toJSONSchema` or calls to `.toJSONSchema()` exist in the codebase. The spike should confirm the exact API (call syntax, which version released it) and benchmark generation time and output size.

The library `zod-to-json-schema` (mentioned in issue #571 title) is NOT a dependency; it was superseded in Zod 4 by the native method.

---

## 3. Existing Schema Versioning Policy

**Location:** `docs/reference/SCHEMA.md` (lines 24–91 and the full document)

**The published-schema convention it prescribes (exact language):**

From spike-1113 section 7 (line 124–128):

> When a JSON Schema is published it mirrors the in-file MAJOR at an owned versioned `$id` (e.g. `schemas.racku.la/layout/v1.json`); the reader never fetches a URL to decide loadability -- `schema_version` is the authoritative offline gate.

**Exact `$id` URL pattern:**

`schemas.racku.la/layout/v{MAJOR}.json`

Example: `schemas.racku.la/layout/v1.json` for schema version 1.0–1.x

**Additional prescriptions:**

- Field `$schema`: should declare the JSON Schema dialect (e.g., `"https://json-schema.org/draft/2020-12/schema"` for Draft 2020-12)
- One schema file published per MAJOR version
- The file is versioned in Git and served at a stable URL
- Readers use the offline `metadata.schema_version` field to decide loadability, never fetch the URL to decide (the URL is for documentation and editor integration only)
- Serializer test must assert `schema_version` is always present in saved output (currently NOT implemented; tracked as #2205 subtask)

---

## 4. In-Flight Schema Changes (CRITICAL)

### Issue #2158: Carrier-First Sub-U Design

**Status:** Approved design spec merged into worktree; **NOT merged to main**

**Location:** `/Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2158/docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md`

**Schema impact:** **MAJOR breaking change**

From the spec (sections "Data model" and "Changes"):

1. **Removes field:** `PlacedDevice.slot_position` will be deleted (line 60: "PlacedDevice.slot_position is removed")
2. **Modifies semantics:** Rail positions become integer U only (line 57: "Rail positions become integer U. The factor-3 and factor-2 position offsets are removed")
3. **New validation rule:** Sub-U devices MUST have `container_id` + `slot_id` and CANNOT be placed at rail level (line 71–76, enforcement layer 1–3)
4. **New field:** Containers now use `DeviceType.slots[]` (already implemented; no change needed)

**What changes in the schema:**

- `PlacedDeviceSchema.slot_position` field removed (currently optional, line 582)
- `PlacedDeviceSchema.position` validation changes: currently accepts any number >= 0.5; will enforce integer-only for rack-level devices
- `DeviceTypeSchema` constraint added: if `u_height < 1` or non-integer, device is rejected if not a container (currently no such validation)

**Timeline:** Specs approved 2026-06-12. Both #2158 and this issue (#571) sit in M03 (Data Format & Interop), so the schema reshape and the schema publish land in the same milestone. That is exactly why #571 is gated on #2158.

**Conclusion:** Publishing a schema now for v1.0 captures the current state. M03's schema will either be v1.1 (additive) or v2.0 (breaking). If breaking, the v1.0 schema becomes legacy. If additive (the design adds new fields but preserves existing ones), it stays v1.1 and old editors continue working on v1.0 files.

### Issue #617: Images in YAML

**Status:** **Already merged to main** (commit 728e19b4, 2026-06-13)

**Schema impact:** MINOR additive change

- Adds optional `images:` top-level section (key-value map of data URLs)
- Does NOT change `LayoutSchema`; preserved by unknown-section round-trip (#2208)
- `metadata.schema_version` stays `"1.0"` (per SCHEMA.md line 72)

No blocker.

---

## 5. Build/CI Integration

### Existing Schema-Generation Scripts

**Search result:** No scripts named `*schema*` exist in `scripts/`.

Scripts found in `scripts/`:

- `generate-brand-assets.ts` (device library generation)
- `generate-bundled-images.ts` (image bundling)
- `generate-gh-dash-config.js` (GitHub dashboard)
- `generate-netbox-homelab-candidates.ts` (NetBox import)

**No existing JSON Schema generation or export.**

### Package.json Build Scripts

`npm run build`: `vite build` (standard SvelteKit production build; no schema generation)

**No npm script** calls a schema generator.

### Where Generated Schema Would Live

**Candidate locations:**

1. `static/schemas/layout-v1.json` — served at dev deployment (GitHub Pages)
2. `api/schemas/layout-v1.json` — if VPS has a dedicated `/schemas/` endpoint
3. Both, with a redirect/mirror setup

**Current `static/` contents:** `badges/`, `brand/`, `fonts/`, favicon files, `og-image.svg`, `robots.txt`, `screenshot-*.png`

No schemas directory exists yet.

### CI Validation for Schema Sync

**Current CI:** GitHub Actions (inferred from `.github/workflows/` structure, not listed here)

**Proposed CI task (not yet built):**

```bash
npm run generate-schema  # Generate src/lib/schemas/layout-v1.json from LayoutSchema
npm run test-schema-sync  # Verify schema matches Zod output
```

These would be new npm scripts, added before publishing.

---

## 6. Export Path: YAML Comment with Schema Location

### Where YAML Export Happens

**Primary function:** `serializeLayoutToYaml` (`src/lib/utils/yaml.ts:300–340`)

Called from:

- `downloadYamlFile` (App.svelte) — user triggers manual export
- `saveLayoutToServer` (api.ts) — server PUT request
- `handleSaveAsArchive` (archive.ts:628) — ZIP save operation

### Could We Embed `# yaml-language-server: $schema=...` Comment?

**Yes, feasible.**

The YAML comment `# yaml-language-server: $schema=https://...` is the RedHat YAML Language Server directive. It tells VS Code and other editors where to fetch the schema for validation.

**Implementation point:** `serializeToYaml` (line 54–62) calls `yaml.dump()` with options. The `js-yaml` library does not have a built-in option to prepend comments, but we can:

1. Generate the YAML string via `yaml.dump()`
2. Prepend the comment manually: `comment + yamlString`

**Example:**

```typescript
const comment = `# yaml-language-server: $schema=https://schemas.racku.la/layout/v${getMajorVersion(layout.metadata?.schema_version)}.json\n`;
return comment + yamlString;
```

**Current state:** Not implemented. Would be a small addition (5–10 lines) once the schema URL is live.

---

## 7. Hosting: Static Asset Serving

### Static Directory

**Location:** `static/` in project root

Served at deployment root (`https://d.racku.la/`, `https://count.racku.la/`) by the hosting infrastructure (GitHub Pages for dev, VPS Docker for prod).

### Deployment Infrastructure

From `CLAUDE.md` (lines 555–567):

| Environment | URL            | Trigger     | Infrastructure |
| ----------- | -------------- | ----------- | -------------- |
| Dev         | d.racku.la     | Push main   | GitHub Pages   |
| Prod        | count.racku.la | Git tag v\* | VPS (Docker)   |

**Schema URL would be:**

- Dev: `https://d.racku.la/schemas/layout-v1.json`
- Prod: `https://count.racku.la/schemas/layout-v1.json`

**Implementation:** Add `static/schemas/layout-v1.json` to Git. Both deployments automatically serve it.

### Is `schemas.racku.la` Referenced?

**Yes, in documentation only:**

`docs/research/spike-1113-schema-versioning-policy.md` line 127 uses `schemas.racku.la/layout/v1.json` as the example `$id` URL. This is the **intended domain** (separate subdomain) but not yet purchased or configured.

**Alternative (simpler):** Use `count.racku.la/schemas/layout-v1.json` (same domain, `static/` subdir). The issue description mentions `schemas.racku.la` but the policy allows any stable URL.

---

## Readiness Blockers

### Blocker 1: Carrier-First Schema Change (M03 Pending)

**Issue:** #2158 (carrier-first sub-U design)

**Impact:** Publishing v1.0 schema now captures the current state. When M03 ships, the schema changes (removes `slot_position`, enforces integer U positions, adds container-only rules). This is a MAJOR version bump (schema v2.0). Any published v1.0 schema becomes immediately stale.

**Risk:** Users download the v1.0 schema, configure editors for it, then M03 ships and their editors show incorrect validation errors on any file using the new structure.

**Resolution options:**

1. Wait for M03 (#2158 merge), publish v2.0 as the first published version
2. Publish v1.0 now with prominent deprecation notice: "This schema is for layouts made before M03; v2.0 will be published in July 2026"
3. Hold off on publishing until M03 lands

**Recommendation:** Hold off on publishing until #2158 ships. Publishable schema requires stable schema definition, and #2158 is actively scheduled (per spike-1113, it's the "next" milestone after M02).

### Blocker 2: Missing Runtime Rejection Gate (#2205)

**Issue:** #2205 (reject-newer-major schema version gate)

**Current state:** The policy exists (SCHEMA.md, spike-1113) but is NOT implemented in code.

- App accepts any `metadata.schema_version` value
- No check for `doc.major > app.major`
- Users opening a file from a newer Rackula version see silent drops or misread data, not a clear "update your app" message

**Why it matters for publishing:** If we publish a schema at v1.0, someone editing with that schema's validator may create a layout that uses v2.0 features. Opening that layout in the current app (which only understands v1.0) should reject it loudly. Without the gate, it loads silently and drops unknown fields.

**Resolution:** Implement #2205 before or concurrent with publishing.

**Effort:** Low (~1–2 days per spike-1113 section 10). The check is simple: parse `metadata.schema_version`, extract MAJOR, compare to app's known MAJOR (currently `1`).

### Blocker 3: No CI Assertion for `schema_version` in Output

**Current state:** Writers default to `schema_version: "1.0"` (yaml.ts:310) but no test enforces this.

**Risk:** A future refactor accidentally removes the default, and serialized files are emitted without a version field. These files masquerade as pre-versioning (and are treated as `1.0`), hiding the actual format change.

**Resolution:** Add test assertion in `src/tests/schemas.test.ts` or `src/tests/yaml-roundtrip.test.ts`:

```typescript
it("serializer always emits schema_version in metadata", async () => {
  const layout = createTestLayout({ metadata: { schema_version: "1.0" } });
  const yaml = await serializeLayoutToYaml(layout);
  expect(yaml).toContain("schema_version:");
});
```

**Effort:** Minimal (~30 min).

---

## Secondary Readiness Items (Nice-to-Have)

These don't block publishing but improve usability:

### 1. YAML Comment with Schema URL

Prepend `# yaml-language-server: $schema=...` to exported YAML for editor integration. (Feasible, ~10 LOC)

### 2. Zod toJSONSchema() Benchmarking

Confirm generation time on LayoutSchema (for CI pipeline performance). (Required for CI integration)

### 3. Multiple Schema Targets

Generate schema for multiple JSON Schema dialects (draft-04, draft-07, draft-2020-12, openapi-3.0) and serve all. (Deferred; v1.0 can start with draft-2020-12)

### 4. Breaking vs Additive Checklist in `/release` Skill

Codify the five-point check (remove/rename/retype/require/redefine => MAJOR) into the release workflow. (Process improvement, not code)

---

## Summary Table

| Area | Status | Details |
| --- | --- | --- |
| **Zod schemas** | Ready | LayoutSchema fully defined; non-translatable constructs identified |
| **Zod 4 JSON Schema** | Ready | Native support confirmed; not yet integrated |
| **Versioning policy** | Documented | SCHEMA.md and spike-1113 fully specify contract |
| **Schema generation** | Not started | No npm script; easy to add |
| **Runtime version gate** | Not implemented | #2205 tracks this; needed before publish |
| **CI schema assertion** | Not implemented | Missing test for "always emit schema_version" |
| **Static hosting** | Ready | `static/schemas/` can serve v1.json |
| **YAML comment integration** | Not implemented | Feasible; low-priority |
| **#2158 carrier-first impact** | MAJOR blocker | Will invalidate v1.0 schema in M03 |

---

## Conclusion

**Do not publish JSON Schema for v1.0 layout format at this time.**

**Three critical blockers must be resolved:**

1. **Stabilize the schema (resolve #2158)** or explicitly acknowledge that v1.0 is pre-M03 and v2.0 will ship in July 2026
2. **Implement the version rejection gate (#2205)** so files from newer Rackula versions are rejected, not silently corrupted
3. **Add CI assertion** that `schema_version` is always emitted in serialized output

**Recommended next steps (priority order):**

1. Complete #2158 (carrier-first) or make a firm decision to publish v1.0 as pre-M03 with a deprecation timeline
2. Implement #2205 (version gate) — low effort, unblocks publishing
3. Add CI assertion for `schema_version` — trivial test
4. Generate schema via native Zod 4 `toJSONSchema()` method
5. Serve at `https://count.racku.la/schemas/layout-v1.json` (or `schemas.racku.la` if DNS is configured)
6. Add YAML export comment (nice-to-have, can follow publishing)

---

**Research completed:** 2026-06-13  
**Data sources:** src/lib/schemas/index.ts, docs/reference/SCHEMA.md, docs/research/spike-1113-schema-versioning-policy.md, .worktree/Rackula-issue-2158 specs, git log, package.json, CLAUDE.md, src/lib/utils/yaml.ts
