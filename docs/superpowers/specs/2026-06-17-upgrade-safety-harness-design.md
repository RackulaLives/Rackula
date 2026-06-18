# Upgrade-Safety Harness Design

Date: 2026-06-17 Status: Approved design, pending implementation plan

## Problem

A large set of changes have landed across the UI and the data schema since the last release. The concern is that an existing self-hosted deployment could break, or silently lose data, when its operator pulls the new Docker image on top of a `/data` volume written by the currently-released version. Today nothing exercises that path end to end.

This document also retires the project's prior "greenfield, no migration, first-and-only-implementation" stance. Rackula has shipped releases that real users run with real saved data. Reading data written by a prior release is now a supported, tested requirement, not a legacy hack.

## Current state

What already exists:

- `metadata.schema_version` is stamped on every save, with a reject-newer-major gate (a `2.0` file will not load into a `1.x` app).
- A real migration path in `src/lib/storage/migrate-layout.ts` (v0.6 single `rack` to v0.7 `racks[]`, plus U-value to internal-unit position conversion).
- A legacy adapter in `src/lib/storage/adapt-legacy-layout.ts` (covers the carrier-first `slot_position` removal and half-width/sub-U recovery).
- Unit tests for each of those pieces in isolation.
- Server mode writes YAML to the `/data` volume as folder-per-layout, with auto-snapshots on write conflict.

What is absent (the gap this design closes):

- No test that exercises the assembled load pipeline against data written by an older release.
- No upgrade check at the container level (old data on a volume, then a new image).
- No documented upgrade procedure for self-hosters.
- The API persists YAML without validating it against the schema (syntax check only). Tracked as a fast-follow, out of scope here.

## Decisions

These were settled during brainstorming:

1. Build order: scripted-first, CI-shaped. The upgrade test is one artifact; it is built and proven locally first, then later wrapped in CI. We do not debug a brand-new test through the slow CI loop.
2. Old-data source: a fixture corpus. The schema and migration risk lives entirely in the frontend load pipeline, so the core test needs no containers.
3. Corpus sourcing: real plus synthetic. Real layouts give realism; synthetic fixtures deliberately cover known-dangerous historical formats.
4. Container-mechanics layer: a manual pre-release Docker smoke, run by hand before tagging. Not in CI.
5. API save-path validation: deferred to a fast-follow issue, not bundled here.

## Components

### 1. Fixture corpus

Location: `src/tests/fixtures/upgrade-corpus/`.

Each entry is a pair of files:

- `{tag}-{desc}.rackula.yaml`: a layout exactly as a past version wrote it.
- `{tag}-{desc}.expected.json`: an explicit allow-list of intentional transformations and drops for this fixture (for example, "v0.6 single `rack` becomes `racks[0]`", "`slot_position` is consumed by the carrier adapter"). This is not a spot-check list of good things; it is the set of changes the round-trip-completeness check (Component 2) is allowed to ignore. Everything not on this list must survive.

Sidecar authoring is split by fixture type to keep the recurring path frictionless:

- Synthetic old-format fixtures: the sidecar is hand-authored once. Invariants cannot be auto-derived from a format the current code no longer writes.
- Recurring current-format fixtures (the per-release captures from Component 4): `scripts/add-corpus-fixture.sh` copies the YAML and writes an empty `allowList` sidecar. An empty allow-list is the correct recorded result because a current-format fixture loads clean with no transformations, and the corpus test verifies that. Dropping a new fixture is one command with zero hand-authoring.

Either way, adding a fixture touches zero test code, satisfying the project's Zero-Change Rule.

Seed set:

Real (operator-supplied, captured outside this repo):

- A layout captured from the currently-live `count.racku.la` version. This is the literal upgrade-from target.
- One or two additional real layouts of varied complexity.

Synthetic (hand-built to hit dangerous formats):

- Pre-carrier-first layout containing `slot_position`, to exercise `adapt-legacy-layout.ts`.
- v0.6.x layout with a single `rack` and U-value positions, to exercise `migrate-layout.ts`.
- The flat `legacy-layout.yaml` format the API auto-migrates on save.
- A layout with an embedded base64 image asset (the images-in-YAML path, issue #617).
- A `schema_version`-absent file, which must be treated as `1.0`.
- A deliberately `2.0` file, which must be rejected by the gate.

### 2. Corpus test

Location: `src/tests/upgrade-corpus.test.ts`. Runs in the existing `validate` CI job.

Call the real entry point. The test must import and call the single exported function the app UI actually invokes when it loads a layout, not a re-assembly of `parseLayoutYaml`, the gate, `migrateLayout`, `adaptLegacyLayout`, and `LayoutSchema.parse` stitched together inside the test. Re-assembling the steps tests the test's own wiring, which can pass while the real load path differs in order or in surrounding behaviour. The first implementation task is to identify that entry point and route the corpus through it.

Assertion model is round-trip completeness, not a spot-check. For each fixture the test loads the raw old file, runs it through the real load path, then walks the leaf keys and values of the raw input and confirms each one either survives into the loaded result or appears on the fixture's `.expected.json` allow-list of intentional transformations. Anything that vanishes and is not on the allow-list fails the test. This is deliberately inverted from "assert these good things survived", because silent loss is by definition the field nobody thought to list. Spot-checks (rack count, device count, all rail positions integer, assets present) are kept as fast, readable secondary assertions, but the completeness walk is the primary guard. The `2.0` fixture asserts rejection.

This sits in the project's "always test" category: cross-component integration, migration, and data-preservation invariants. Any exact-count assertion used as a secondary spot-check carries an `eslint-disable-next-line no-restricted-syntax` with justification, per the project's testing convention. The corpus files are inputs, not assertions on static data, so the Zero-Change Rule holds.

Browser-mode key-schema coverage. The corpus covers the data format for both server and browser mode, since both run the same load path. Browser mode has one extra risk the corpus does not see: the localStorage key structure (the `Rackula:workspace` index plus `Rackula:layout:<id>` bodies). If a release changes those keys, old browser data is orphaned even though each layout body parses fine, and neither the corpus test nor the server-side Docker smoke detects it. A single Vitest case mitigates this cheaply: seed old-shape localStorage keys, run the workspace loader, and assert it still finds and loads the layout. Include this case; the alternative is a silent orphaning that no other layer catches.

### 3. Manual pre-release Docker smoke

Location: `scripts/upgrade-smoke.sh`, plus a short doc section.

Why this exists, given the corpus already covers data format. The smoke covers two risks the corpus test cannot see, because the corpus only exercises YAML parsing in memory:

- Volume permissions. The API image chowns `/data` to uid 1001. The day that uid or user changes, every existing volume becomes unreadable on upgrade. The corpus test cannot detect this; the smoke can.
- On-disk structure. The corpus tests parsing, not discovery. It does not exercise `listLayouts()` or `findFolderByUuid()` against an old on-disk folder structure. The flat-file to folder-per-layout change was exactly this kind of change. If a release alters where files live on disk, old volumes go invisible, and only the smoke catches it.

Container boot itself is already covered by the gated pipeline's Docker health check, so the smoke is not about boot.

Operability requirement. The script runs with zero arguments and auto-resolves the previous released tag from git tags (or the registry). An upgrade smoke that needs manual tag lookup or manual volume setup will not be run before a release, and an un-run smoke is worth nothing. It is non-interactive and uses exit codes; it is in principle promotable to CI later, though promotion would reintroduce the slowness and flakiness we deliberately avoided, so it stays manual by default.

Steps:

1. Bring up the previous released image (`deploy/docker-compose.persist.yml` pinned to the auto-resolved last tag) and POST a corpus layout through its API to seed a temporary `/data` volume.
2. `docker compose down`, keeping the volume.
3. Bring up the new build against the same volume.
4. `curl /version` and assert it reports the new version. `GET /layouts/{uuid}` and assert the seeded layout returns and validates.
5. Exit non-zero on any failure, with a clear PASS or FAIL line.

The smoke reuses the corpus fixtures as seed data, so both layers share one source of truth.

### 4. Corpus-grows-each-release ritual

The durable value. Each release, capture one representative layout in the current format, tag it, and add it to the corpus with an auto-generated sidecar (one command, per Component 1). Over time the corpus becomes a forward-compatibility ratchet: every future release must load every prior release's format.

This must block, not merely remind. A checklist line read past under release pressure by a solo maintainer will rot. The `/release` flow runs a guard that exits non-zero when a release touches the schema (the `src/lib/schemas` or serialization paths changed since the last tag) but no new corpus fixture was added. A `README.md` in the corpus directory documents the one-command capture.

Scope of protection. The corpus is a ratchet for known formats. It can only fail on a format it contains; it cannot protect against a future change that drops a format never captured. The actual guarantee against future breakage is the policy in Component 5, enforced at review time. The corpus test enforces that policy retroactively and should be trusted as such, not as proof that any conceivable old file will load.

### 5. Docs and policy updates

- `CLAUDE.md`: rewrite the "Development Philosophy" greenfield paragraph. Prior-release data is supported and tested. New schema changes must be backward-compatible or ship a migration plus a corpus fixture.
- `docs/deployment/SELF-HOSTING.md`: add an "Upgrading an existing deployment" section. Back up `/data`, pull the new tag, `docker compose up`. Note that snapshots auto-protect on write.

## Out of scope (YAGNI)

- A full CI container-upgrade job. Slow and non-deterministic; the manual smoke covers the container risk for now.
- Automated capture of production data.
- Multi-version migration chains beyond what the fixtures exercise.
- API save-path schema validation. Filed as a fast-follow issue.

## Testing strategy for the harness itself

The corpus test is the test. The Docker smoke is manual. No meta-tests are needed.

## Milestone

Fits release-stability work. Candidate milestone is M02 (LXC Release & Stability) given the release-blocking framing. Final placement decided when the work is filed as issues.
