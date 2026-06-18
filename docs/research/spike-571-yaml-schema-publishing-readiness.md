# Spike #571: JSON Schema Publishing Readiness

**Date:** 2026-06-13 **Parent Epic:** #570 (Developer-Friendly Data Format) **Milestone:** M03 -- Data Format & Interop **Type:** Readiness assessment (issue is a feature, researched on request before committing to publish)

---

## Executive Summary

Verdict: not ready to publish yet. The mechanism is in place, but the schema shape is actively changing inside the same milestone.

The good news is the hard parts are already solved. Zod 4.4.3 ships a native `z.toJSONSchema()`, so no new dependency is needed (the issue's `zod-to-json-schema` recommendation is superseded). The versioning policy is decided and documented in `docs/reference/SCHEMA.md` (#1113): one schema per MAJOR, an owned `$id` (`schemas.racku.la/layout/v{MAJOR}.json`), and `metadata.schema_version` as the authoritative offline gate that readers check instead of fetching a URL.

The blocker is timing. Issue #2158 (carrier-first sub-U, an OPEN epic in M03, the same milestone as #571) deletes the `slot_position` pathway and reshapes layout positioning. Publishing `v1.json` from today's Zod schema would ship an artifact that goes stale the moment #2158 lands. The issue's own alignment audit already reached this conclusion ("publish AFTER #2158's schema bump"). Two supporting gaps also need closing: the runtime version-rejection gate (#2205, OPEN, M03) is documented but not implemented, and nothing in CI asserts that writers always emit `schema_version`.

Decision taken (2026-06-13): gate #571 on #2158, and decompose the publishing work into scoped sub-issues that become actionable once the schema shape stabilizes.

---

## Technical Findings

### Schema generation is a solved problem

The project pins `zod@^4.4.3`. Zod 4 includes a native JSON Schema converter (`node_modules/zod/v4/core/to-json-schema.d.ts` confirms the export). It supports target dialects (draft-07, draft-2020-12, openapi-3.0) and an `io` parameter controlling how transforms and defaults are represented.

Implication: drop the external `zod-to-json-schema` dependency from the plan. Use `z.toJSONSchema(LayoutSchema, { target: "draft-2020-12" })` (or the equivalent instance method) in a generation script.

### The top-level schema and its un-translatable parts

The saved-layout schema is `LayoutSchema` in `src/lib/schemas/index.ts`, built in three layers: an input shape, a base with a `.transform()` (position migration), and a final form with `.superRefine()` cross-collection validation.

These constructs do not survive the conversion to JSON Schema and define the validation gap users will see in their editors:

- `.refine()` (port-connection validation, slot_id requirements)
- `.superRefine()` (half-depth interface constraints, cross-collection foreign keys)
- `.transform()` (position migration for backward compatibility)
- `.passthrough()` (unknown-field preservation, used throughout)

This confirms the issue's "~80% validation" framing. JSON Schema will catch missing required fields, wrong types, and bad enum values. It will not catch cross-field rules (for example, a child referencing a non-existent parent). Documentation must state this plainly.

### schema_version: present, emitted, but not gated

`metadata.schema_version` is a flat `z.string()` (`src/lib/schemas/index.ts:753`), currently `"1.0"`, written on every save (`serialization.ts:27`, `archive.ts:250/699/730`, `yaml.ts:310`).

What is missing: the reader does not reject a newer MAJOR. There is no `doc.major > app.major` check at the ingress, so opening a future-version file silently proceeds and risks data loss. This gate is the entire content of #2205 (OPEN, M03). It is the offline mechanism the whole versioning policy depends on, and it should land before or alongside the first published schema.

### No CI guarantee that schema_version is emitted

Writers default to `"1.0"`, but no test asserts that serialized output actually contains `schema_version`. A future refactor could drop it, producing files that read as pre-versioning. A one-line assertion in the serialization tests closes this.

---

## In-Flight Schema Changes (the timing blocker)

### #2158 carrier-first sub-U (OPEN epic, M03)

Spec: `docs/superpowers/specs/2026-06-12-carrier-first-sub-u-design.md` (approved, in the #2158 worktree, not yet on main). The M03 implementation:

- Removes `PlacedDevice.slot_position` and its left/right pair-keeping pathway.
- Changes position validation (integer-only for rack-level devices).
- Adds a container requirement for sub-U devices.

This reshapes the positioning model. A `v1.json` generated today captures the pre-carrier shape and would misrepresent the schema once #2158 ships in the same milestone. This is the primary reason to wait.

### #617 images in YAML (merged 2026-06-13)

Additive (embedded image fields), stays at `schema_version` "1.0". Not a blocker, but the generation step must run after it is on main so the published schema includes the new fields.

---

## Build, Hosting, and Export

- Build: standard Vite (`npm run build`). No schema step exists. A new `scripts/generate-schema.*` plus npm scripts (`generate-schema`, a sync check for CI) are needed.
- Hosting: `static/` is served at the deployment root on both environments (dev d.racku.la via GitHub Pages, prod count.racku.la via VPS). The policy `$id` is `schemas.racku.la/layout/v{MAJOR}.json`. Note the `$id` is an identifier, not a fetch target (readers gate offline on `schema_version`), so the canonical `$id` can be set before `schemas.racku.la` DNS exists; the actual yaml-language-server fetch URL can point at a real served path in the interim.
- Export comment: `serializeLayoutToYaml` (`src/lib/utils/yaml.ts:300-340`) builds the YAML string. `js-yaml` has no comment option, but prepending a `# yaml-language-server: $schema=...` line before `yaml.dump()` output is a small, optional enhancement.

---

## Readiness Blockers (summary)

1. Schema shape unstable: #2158 (M03) deletes `slot_position` and reshapes positioning. Publish after it merges. (Sequencing decision: gate #571 on #2158.)
2. No runtime version gate: #2205 (M03) documented but not implemented. Land before first publish.
3. No CI assertion that `schema_version` is always emitted. Add a serialization test.

---

## Recommendation and Path Forward

Keep #571 as the tracking parent under epic #570. Gate it on #2158. Once the M03 schema churn settles, the publishing work is small and well-defined:

1. Generation script using Zod 4 native `z.toJSONSchema()` plus a committed `static/schemas/layout-v1.json` artifact.
2. CI sync check (regenerate and diff against the committed artifact) plus the `schema_version`-always-emitted assertion.
3. Hosting and `$id` wiring per SCHEMA.md (owned `$id`, real served URL).
4. Docs: canonical URL, one sample YAML with `$schema` usage, VS Code + yaml-language-server setup, and an explicit list of what the schema cannot enforce.
5. Optional: embed the `# yaml-language-server: $schema=...` comment in YAML export.

Prerequisite already tracked separately: #2205 (version-rejection gate).
