# Spike #1113: YAML Schema Versioning and Compatibility Policy

**Date:** 2026-06-13 **Parent epic:** #570 (Developer-Friendly Data Format) **Status:** Signed off 2026-06-13 (post devils-advocate) **Canonical policy:** [docs/reference/SCHEMA.md](../reference/SCHEMA.md) (this doc is the spike record) **Adversarial review:** applied (serializer-allowlist drop mechanism, non-destructive reject, always-emit version, pin-gate-to-major, round-trip elevated). See "Changes from v1" at the end. Research basis (codebase + external precedent) is summarised in the appendix below.

---

## Executive summary

Rackula's `metadata.schema_version` (`"1.0"`) is written but never read for any decision; real compatibility is driven off the app version (`Layout.version` vs `0.7.0`). This policy makes `schema_version` the authoritative data-format version, sets a semver-style additive/breaking rubric, and a **reject-newer-major** forward-compat stance. The decisive real-world finding: layout data is dropped not by validation but by the **serializer's fixed field allowlist** (`serializeLayoutToYaml`, `src/lib/utils/yaml.ts:255`), which emits only known top-level keys and silently discards the rest on every save. That makes "preserve unknown sections through load->save" the load-bearing data-safety mechanism, not an optional extra. #617's `images:` is additive (MINOR, no bump) and is safe because #617 adds `images` to the writer explicitly with a round-trip test. Runtime enforcement is split into follow-ups so this spike stays a policy deliverable.

---

## 1. Versioning contract

- **`metadata.schema_version` (`MAJOR.MINOR`) is the only field a reader consults** to decide whether it can load a document. Current value `1.0`; current MAJOR is `1`.
- **`Layout.version` is provenance** (the app version that wrote/last-migrated the file) **plus the existing pre-0.7.0 position-migration trigger, and nothing new keys off it.** It is NOT renamed (it is written into every file in the wild and injected from `package.json`; renaming would itself be a MAJOR-tier change). A code comment at the migration site records this rule so the next contributor does not extend it.
- **Every writer MUST emit `schema_version`** (it already defaults to `"1.0"` at `yaml.ts:265`). A CI/test assertion confirms serialized output always contains it, so a future writer cannot silently omit it and let a newer-format file masquerade as 1.0.
- **Absent `schema_version` on read => treated as `1.0` for YAML layout files only** (every YAML file predating versioning is 1.0 by construction). This defaulting is scoped to the YAML parser; it is a read-side allowance only and is never produced on write. Other payloads without a version marker (share-links) are NOT covered by this default; see section 6.

## 2. Reader rule (compatibility matrix)

`app.major` = highest format the running app understands; `doc.*` = the document's `schema_version`. **Gate strictly on `schema_version.major`. Never gate on `Layout.version` / app version** (that bumps every release and would over-reject: the draw.io mistake, see the appendix). A test asserts an app-version bump alone never rejects.

| Document vs app | Behaviour |
| --- | --- |
| `doc.major > app.major` | **REJECT, non-destructively.** Never write the file. Show "This layout was created by a newer version of Rackula. Update Rackula to open it," and offer a recovery path: keep the original file untouched / view raw YAML. |
| `doc.major == app.major` (any MINOR) | **LOAD** (tolerant reader: unknown additive fields ignored by validation; see the resave hazard in 4). |
| `doc.major < app.major` | **LOAD + migrate** (a MAJOR bump ships a migration from the previous major, with prior-version fixtures). |

Reject is the better failure than silent drop: loud, non-destructive, recoverable. It is only worth it if pinned to MAJOR; minor bumps must keep loading on old readers.

## 3. Breaking vs additive rubric

Run this 5-point check at every release (lift it into the `/release` checklist so it fires each time, not just here): **remove / rename / retype / require / redefine** an existing field => **MAJOR**. Otherwise additive => **MINOR**.

- **MINOR (additive, old readers still load):** new OPTIONAL field; new OPTIONAL top-level section (e.g. #617 `images:`); enum widening old readers can ignore.
- **MAJOR (breaking, old readers reject):** remove/rename a field; change type/units/semantics; make an optional field required; restructure existing data.

Examples: `cables` was MINOR. The pre-0.7.0 position-units change would have been MAJOR. `images:` (#617) is MINOR.

## 4. The real drop mechanism: the serializer allowlist (load-bearing)

`serializeLayoutToYaml` (`src/lib/utils/yaml.ts:255`) builds its output from a **fixed allowlist** (`metadata, version, name, racks, device_types, settings, rack_groups, cables`) and never spreads `...layout`. So **any top-level key not on that list is dropped on save, by every build, today.** `toRuntimeLayout` (`yaml.ts:349`) does spread `...parsed` on read, so an unknown key survives into memory, but the writer discards it on the next save. Validation / `.passthrough()` are not where data dies; the writer allowlist is.

Consequences:

- **An additive MINOR section is only resave-safe if the writer preserves it.** Two ways: (a) add the section to the allowlist explicitly, or (b) a generic "re-emit unknown top-level keys" round-trip in the serializer.
- **#617 uses (a):** it adds `images` to the writer and ships a load->save->load test asserting a base64 image survives. So #617 cannot drop its own images.
- **(b) is what makes FUTURE additive sections safe across mixed builds.** Concrete timeline: v+1 ships `images`; v+2 ships a second additive section `annotations`; a user still on v+1 opens a v+2 file (same MAJOR, newer MINOR => loads), then resaves => `annotations` are gone, silently, because v+1's allowlist lacks them. "Both halves ship together" protects exactly one release and then evaporates the moment two additive builds coexist (the homelab laptop-vs-NAS case). The durable fix is the generic round-trip, built once (capture unknown top-level keys in `toRuntimeLayout`, re-emit them in `serializeLayoutToYaml`).

**Decision (signed off 2026-06-13):** build the generic round-trip NOW as its own small issue/PR, landing before #617. So additive safety is structural for all future sections, not single-generation. #617 still adds `images` to the writer explicitly with its own round-trip test.

## 5. Migration model

Backward migrations run at the validated ingress (`parseLayoutYaml` -> `LayoutSchema` transform): position migration, rack->racks, slot recovery, ID dedup -- today keyed off `Layout.version`. A MAJOR bump ships a migration from the previous MAJOR with prior-version fixtures. Format migrations key off `schema_version` when the first MAJOR bump actually ships; until then the existing `Layout.version` position migration stands (no new migrations key off `Layout.version`).

## 6. Enforcement: primary ingress + open doors (stated honestly)

The reject-newer-major check belongs at the shared Zod chokepoint (`LayoutSchema` / `parseLayoutYaml`), which covers **file load and server GET (primary ingress)**. Two doors are NOT gated today and are tracked open, not silently assumed closed:

- **localStorage working copy** is unvalidated (bypasses the gate). Real debt, but NOT a #617 blocker: it is same-build session state, so it cannot present a newer-MAJOR document than the build reading it.
- **Share-links** carry no version marker; do NOT apply the absent-version => 1.0 default to them (that would over-accept versionless payloads). Define old-URL behaviour after a future schema bump (reject, read-only, or migrate) and coordinate with M08 #820.

## 7. Publishing (relationship to #571)

One line, deferred to #571: when a JSON Schema is published it mirrors the in-file MAJOR at an owned versioned `$id` (e.g. `schemas.racku.la/layout/v1.json`); the reader never fetches a URL to decide loadability -- `schema_version` is the authoritative offline gate.

## 8. Read-surface inventory

File load + server GET: gated (primary ingress). Snapshot restore (#2042): route through the validated pipeline when built. Share-link: add a version marker (follow-up C). localStorage: route through schema (follow-up B). (Single source for this table; sections 6/8 do not duplicate.)

## 9. Decisions locked

1. `schema_version` is authoritative (gate on `.major`); `Layout.version` is provenance + the existing position-migration trigger, not renamed, nothing new keys off it.
2. Forward-compat: reject newer MAJOR (non-destructive, with recovery); load any same-MAJOR MINOR (tolerant); migrate older MAJOR. Absent => 1.0 on read; always emit on write (CI-asserted).
3. #617 `images:` is additive => MINOR; `schema_version` stays `"1.0"`; the writer emits `images` with a load->save->load round-trip test.
4. Enforce at the primary ingress; localStorage and share-link doors are tracked open, not claimed closed.
5. **[Signed off]** Generic unknown-section round-trip is built NOW as its own issue/PR before #617 (neutralises the additive-drop hazard for all future sections, structurally).

## 10. Follow-up issues (re-triaged)

- **E (#2208) -- generic unknown-section round-trip (BUILDING NOW, own PR, M15):** preserve unknown top-level keys through load->save (capture in `toRuntimeLayout`, re-emit in `serializeLayoutToYaml`). Lands before #617 so no future additive section can silently drop. Also corrects SCHEMA.md's previously-false "unknown fields retained when saving" claim.
- **A (#2205) -- reject-newer-major runtime gate (M03):** build with or right after #617 (cheap, un-retrofittable once newer files exist); tests for the major boundary, the app-version-bump-never-rejects case, and absent-version => 1.0.
- **B (#2206) -- validate the localStorage working-copy read path (M15):** route through `LayoutSchema`. Real debt; not a #617 blocker.
- **C (#2207) -- share-link explicit version marker (M08):** coordinate with #820. Deferred.
- ~~D -- post-#2158 snapshot/old-URL compat~~: folded into A (it is "write the migration when the first MAJOR bump is scheduled"); do not file as standalone busywork now.

---

## Changes from v1 (what the adversarial pass changed)

- Named the **serializer allowlist** (`yaml.ts:255`) as the actual drop mechanism; rewrote the former "temporal mitigation" theory around it.
- **Elevated the generic round-trip** from optional follow-up E to the load-bearing item, with a concrete two-additive-release data-loss timeline; made it the one sign-off decision.
- Reject is now **non-destructive with a recovery path** (lockout mitigation).
- **Always emit `schema_version`** (CI-asserted) to stop absence masking a future newer file.
- **Pin the gate to `schema_version.major`**, never app version, with a test (the live footgun: migrations key off `Layout.version` today).
- Simplified the two-version-field rule (no rename; nothing new keys off `Layout.version`); dropped the rename "open question" as a trap.
- Made the single-ingress claim **honest** (primary ingress gated; two doors tracked open).
- Cut overkill: JSON Schema `$id` design -> one line (#571); 2.0 migration-folding end-state -> one line; removed duplicate read-surface tables; removed the mid-sentence v1 artifact in s4.

---

## Appendix: research basis

### Codebase (as of main `008a7934`)

- Two version fields: `Layout.version` (app provenance, injected from `package.json`) and `metadata.schema_version` (`"1.0"`, written at `src/lib/utils/yaml.ts` ~265 but never read for any decision). De-facto migrations key off `Layout.version` vs `0.7.0`, not `schema_version`.
- Read surfaces: file load (`src/lib/utils/archive.ts` -> `parseLayoutYaml`), server GET (`src/lib/storage/api.ts`), share-link (`src/lib/utils/share.ts`, v1/v2 by field presence, no version marker) all validate via `LayoutSchema`; the localStorage working copy (`src/lib/storage/working-copy.ts`) is unvalidated. Snapshot restore (#2042) is future.
- `LayoutSchemaInput` is `.passthrough()` and the transform spreads `...rest`, so unknown top-level keys survive onto the runtime layout on read. The drop point is the serializer: `serializeLayoutToYaml` and the per-object ordering helpers re-emit a fixed field list, so unknown sections are discarded on save (fixed by #2208).
- Existing de-facto migrations: pre-0.7.0 position units (`needsPositionMigration`, `migrateDevicePositions`), legacy `rack` -> `racks`, slot-position recovery (#1248/#1602), device-id dedup (#1363). `compareVersions` exists in `src/lib/schemas/index.ts`.

### External precedent

- Semver applied to data formats: additive optional field/section = MINOR; remove/retype/ require/restructure = MAJOR (semver.org; OpenAPI; Kubernetes `apiVersion`).
- Reject-newer-major for editable/stateful documents is mainstream: Terraform state ("created by a newer version; upgrade to open"), Kubernetes (declines unrecognised `apiVersion`). draw.io's best-effort/no-gate render path is the counter-example (it does not re-save edits).
- Tolerant reader / Postel's law makes additive MINOR safe, but an unaware reader that drops unknown sections destroys them on resave; reject-newer-major does not prevent that. The fix is round-tripping unknown sections (Kubernetes `x-kubernetes-preserve-unknown-fields` semantics), which is #2208.
- Publishing (#571): one JSON Schema per MAJOR at an owned versioned `$id` (e.g. `schemas.racku.la/layout/v1.json`); `$schema` declares the dialect; the reader never fetches a URL to decide loadability.
