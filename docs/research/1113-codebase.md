# Spike #1113 -- Codebase Findings: YAML schema versioning today

Snapshot of how Rackula versions and reads layout data as of main `008a7934`.

## Version fields

Two distinct fields exist; only one is meant to be the data-format version.

| Field | Source | Meaning | Current value |
| --- | --- | --- | --- |
| `Layout.version` | `src/lib/types/index.ts` (~700); injected from `package.json` via `src/lib/version.ts` (`__APP_VERSION__`) | App version that created/last-migrated the layout (provenance) | e.g. `"26.6.3"` |
| `metadata.schema_version` | `src/lib/types/index.ts` (~25); written in `src/lib/utils/yaml.ts` (~265) as `schema_version || "1.0"` | Data-format version | `"1.0"` (hardcoded, never bumped) |

Key point: the de-facto migration logic keys off `Layout.version` (compared against
`0.7.0`), NOT `schema_version`. `schema_version` is currently inert -- written but never read
for any decision. There is **no forward-compat check**: any `schema_version` loads silently.

## Read surfaces (every path that parses layout data)

| Surface | File | Validated (Zod `LayoutSchema`)? | Version check? |
| --- | --- | --- | --- |
| File load (YAML + ZIP) | `src/lib/utils/archive.ts` `extractFolderArchive` (~337) -> `parseLayoutYaml` | Yes | None |
| Share-link | `src/lib/utils/share.ts` (~176-250), `src/lib/schemas/share.ts` | Yes (`MinimalLayout` v1 / `MinimalLayoutV2`) | None -- version inferred by field presence (`r` vs `rs`); no version marker in the URL |
| Server GET | `src/lib/storage/api.ts` `loadSavedLayout` (~288) -> `parseLayoutYaml` | Yes | None |
| Snapshot restore | future (#2042); no read path yet | n/a | n/a |
| localStorage working copy | `src/lib/storage/working-copy.ts` `loadSessionWithTimestamp` (~157) | **No** -- raw JSON.parse + manual migration, Zod NOT called | None |

`parseLayoutYaml` (`src/lib/utils/yaml.ts` ~370) is the common validated entry:
`parseYaml` -> `LayoutSchema.safeParse` -> `toRuntimeLayout`. `LayoutSchemaInput`
(`src/lib/schemas/index.ts` ~777) is `.passthrough()`, so unknown top-level keys survive
validation (relevant: #617's `images` section will pass through; it must be stripped before
it rides onto the runtime Layout).

## De-facto compatibility behaviour (the migrations the policy must codify)

All in `src/lib/schemas/index.ts`, applied in the `LayoutSchemaBase.transform` (~972-1056):

- **Position migration** (pre-0.7.0 U-values -> internal units): `needsPositionMigration`
  (~828) via `compareVersions(version, "0.7.0")` plus a heuristic (`position < UNITS_PER_U`);
  `migrateDevicePositions` multiplies by `UNITS_PER_U` (=6). Container children are skipped.
  On migration the output `version` is stamped with the current app `VERSION`.
- **Legacy rack -> racks[]**: `LayoutSchemaInput` accepts both `rack` (single) and `racks`
  (array); the transform wraps a single `rack` into `racks`.
- **Slot-position recovery** (#1248/#1602): `recoverSlotPositions` (~898) re-derives
  left/right for half-width device pairs missing `slot_position`.
- **ID generation / dedup** (#1363): missing rack ids get `nanoid()`; duplicate device ids
  are remapped and container references updated.

`compareVersions` (~804) already exists and is the natural primitive for a forward-compat
major-version gate.

## Schema-change classification for #617 (images section)

#617 adds an optional top-level `images:` map (base64 data URLs for user-uploaded device
images). This is **purely additive**: no existing field changes type, semantics, or
required-ness. Existing readers ignore it (they drop it -- which is the data-loss motivation
for #617). Under any standard rubric this is a non-breaking / additive change and does NOT
require a major `schema_version` bump.

## Docs landscape

- `docs/reference/SCHEMA.md` EXISTS (the canonical data-schema reference) and is linked from
  `docs/reference/SPEC.md` (no dangling link). But it is stale and partly WRONG for this
  spike's purposes: its "Unknown Fields" section claims unknown fields are "Retained when
  saving" and "allows forward compatibility" -- FALSE, the serializer allowlist drops unknown
  top-level sections on save. Its Layout `version` field is described as "Schema version",
  conflating app version with format version. The versioning policy belongs as a new section
  in this existing file, plus a correction to the Unknown Fields claim.
- Research spikes: `docs/research/spike-{n}-{title}.md` (e.g. `spike-572-file-format-accessibility.md`).
- Prior format research: `docs/research/spike-572-*` (recommended single YAML + base64),
  `spike-573-*` (YAML viewer/editor).
- No published JSON Schema file exists yet (that is #571). Zod can emit one via
  `zodToJsonSchema` (already in node_modules).

## Constraints the policy must respect

1. `metadata.schema_version` should become the authoritative data-format version; `Layout.version`
   stays provenance. The policy must say so explicitly because today they are conflated.
2. The localStorage working-copy read path is unvalidated -- the policy governs it but
   closing the gap is implementation work (follow-up).
3. Share-links carry no version marker -- forward-compat there needs a separate mechanism
   (follow-up; coordinate with the M08 #820 shortener which persists them long-term).
4. A forward-compat gate (reject newer-major) is a small change at `parseLayoutYaml` /
   `LayoutSchema`, but it is runtime code -- specify here, implement as a follow-up so the
   spike stays a policy deliverable.
