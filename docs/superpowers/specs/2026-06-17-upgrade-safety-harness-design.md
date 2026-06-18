# Upgrade-Safety Harness Design

Date: 2026-06-17
Status: Approved design, pending implementation plan

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
- `{tag}-{desc}.expected.json`: the invariants that must survive a load (rack count, device count, the all-rail-positions-are-integers invariant, whether assets are present).

The sidecar JSON means adding a fixture touches zero test code, satisfying the project's Zero-Change Rule.

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

The test globs the corpus directory and, for each fixture, runs the real production load pipeline: `parseLayoutYaml`, the schema-version gate, `migrateLayout`, `adaptLegacyLayout`, then `LayoutSchema.parse`. It then asserts the invariants in the paired `.expected.json` survive: no data lost across migration, all rail positions still integers, assets preserved. The `2.0` fixture asserts rejection.

This sits in the project's "always test" category: cross-component integration, migration, and data-preservation invariants. The one exact-count assertion (device count preserved through migration) carries an `eslint-disable-next-line no-restricted-syntax` with justification, per the project's testing convention. The corpus files are inputs, not assertions on static data, so the Zero-Change Rule holds.

### 3. Manual pre-release Docker smoke

Location: `scripts/upgrade-smoke.sh`, plus a short doc section.

Run by hand before tagging a release. The script is non-interactive and uses exit codes, so it is promotable to CI later without rework. Steps:

1. Bring up the previous released image (`deploy/docker-compose.persist.yml` pinned to the last tag) and POST a corpus layout through its API to seed a temporary `/data` volume.
2. `docker compose down`, keeping the volume.
3. Bring up the new build against the same volume.
4. `curl /version` and assert it reports the new version. `GET /layouts/{uuid}` and assert the seeded layout returns and validates.
5. Exit non-zero on any failure, with a clear PASS or FAIL line.

The smoke reuses the corpus fixtures as seed data, so both layers share one source of truth.

### 4. Corpus-grows-each-release ritual

The durable value. Each release, capture one representative layout in the current format, tag it, and add it to the corpus. Over time the corpus becomes a forward-compatibility ratchet: every future release must load every prior release's format.

This is wired as a step in the `/release` skill and a one-line note in a corpus `README.md`, so it is not forgotten.

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
