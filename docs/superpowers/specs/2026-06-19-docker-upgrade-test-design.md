# Faithful Docker upgrade test and guide

Date: 2026-06-19 Status: approved, pending implementation plan

## Problem

We need to confirm that an existing self-hosted Docker deployment with real saved data can take new images without losing data. The upgrade-safety harness (PR #2448) added `scripts/upgrade-smoke.sh` for this, but on review the script does not model the scenario it claims to cover.

The script runs only the API container via `docker run` against a named volume it creates itself, with `read_only` absent and no compose file, seeds via `PUT`, then asserts with `grep "Representative Lab"` on a single `GET`. A real deployment is a two-container compose stack (`deploy/docker-compose.persist.yml`): frontend plus `rackula-api`, data on a bind mount `./data:/data`, API running `read_only: true` with only `/tmp` as tmpfs, uid 1001.

## Corrected risk model

Reading the API storage layer changed the design. The API stores layout YAML verbatim: `PUT` validates (YAML parse, `metadata.id` match, schema check for the id guard) then writes the raw bytes, and `GET` returns the stored string. There is no server-side migration or transform. Migration is a client and browser concern, already covered by the Vitest corpus (`src/tests/upgrade-corpus.test.ts`).

Two consequences:

1. Write-back-after-migration loss is not a server-path risk. The server never transforms, so there is nothing to lose on a write-back round trip at the server level.
2. The correct no-loss assertion for the server path is byte-for-byte equality of the layout after upgrade against what was stored. Any difference is corruption. A field-level differ is unnecessary here.

The on-disk format is folder-per-layout: `{DATA_DIR}/{Name}-{UUID}/{name}.rackula.yaml`, with `snapshots/` and assets inside the folder, and folders located by scanning for a UUID suffix (`findFolderByUuid` calls `extractUuidFromFolderName`). There is legacy-slug handling, so the format has already evolved once.

The genuine server-upgrade data-loss surface reduces to two things, both handled weakly today:

1. On-disk format compatibility. Does new code still find and read folders, files, and snapshots that old code wrote? Folder-naming or UUID-extraction drift makes a layout silently invisible: data on disk, but `getLayout` returns null, so it looks wiped.
2. Deployment-environment fidelity. The bind-mount path from the shipped compose file, uid 1001, and the `read_only: true` rootfs. The current `docker run` with a named volume and no `read_only` tests none of this.

## Compose file choice

The canonical self-host file `deploy/docker-compose.persist.yml` hardcodes image tags and is not env-overridable. The root `docker-compose.yml` uses `${RACKULA_API_IMAGE:-...}` and a `persist` profile, so it can be pointed at an old or new image. `compose-parity.yml` runs `scripts/check-compose-persist-parity.sh` on every PR touching either file, so the two are kept in lockstep on the dimensions that matter. The test drives the root compose file with `--profile persist` plus an override, and parity CI guarantees fidelity to the canonical persist file.

## Design

### Part 1: rework scripts/upgrade-smoke.sh

The script drives a real compose stack through an old-to-new upgrade.

1. Preflight. Require `docker`, `docker compose`, `curl`, `cmp`, `git`, and `sudo` (the bind mount is chowned to uid 1001 before the run and the resulting uid-1001-owned files are removed with `sudo` at the end). `jq` is not required: byte-equality uses `cmp` and snapshot counts use `grep`. Resolve `OLD_TAG` (auto-resolve to the previous `v*` tag, or accept an `OLD_TAG=` override).
2. Throwaway data and override. Create a temp host data dir with `mktemp -d`. Generate a compose override that repoints the api bind-mount source at the temp dir and publishes the api port (`13001:3001`) so the script can curl the API directly. The `/data` target, `read_only: true`, `/tmp` tmpfs, uid 1001, and env all come from the real compose file.
3. Seed under the old image. Bring up `rackula-api` with `RACKULA_API_IMAGE=ghcr.io/rackulalives/rackula-api:${OLD_VERSION}` via `docker compose -f docker-compose.yml -f <override> --profile persist up -d rackula-api`; wait for health. First `PUT` the existing `src/tests/fixtures/upgrade-corpus/v26.5.0-representative.rackula.yaml` to a known UUID (creates the layout). Then issue a second `PUT` of the same body with a deliberately stale `X-Rackula-Updated-At` header (for example `1970-01-01T00:00:00.000Z`). `saveLayout` writes a pre-overwrite snapshot only when an echoed updated-at is present and mismatches the stored copy, so the stale header is what deterministically produces a snapshot; a header-less `PUT` writes none. `GET` the layout back and save it as `before.yaml`, the canonical copy of what the old release persisted.
4. Upgrade. `compose down` (the temp data dir survives because it is a bind mount), build the new image from the working tree (`docker build -f api/Dockerfile -t rackula-upgrade-smoke/api:new api`), and bring the stack back up with `RACKULA_API_IMAGE=rackula-upgrade-smoke/api:new`.
5. Assertions, in order:
   - Discovery: `GET /layouts` lists the seeded UUID, proving new code finds the old-written folder.
   - No loss: `GET /layouts/:uuid` is byte-identical to `before.yaml` via `cmp`.
   - Snapshots survive (version-conditional): `GET /layouts/:uuid/snapshots` still lists the pre-upgrade snapshot. The snapshot feature (echoed `X-Rackula-Updated-At` plus the snapshots route) is unreleased as of v26.6.3, so when the old image produced no snapshot the script skips this assertion with a logged note rather than failing. Use a tolerant request (not `curl -f`) because pre-feature images return 404 on the snapshots route. The snapshot-write path is still proven on the new build by the read_only write assertion below.
   - Writes work under read_only: `PUT` a genuinely modified body (again with a stale `X-Rackula-Updated-At` so the prior copy is snapshotted) returns 200, the subsequent `GET` matches the modified body, and the snapshot count increases by one. This proves the upgraded container can persist with a read-only rootfs and a `/tmp`-only tmpfs.
   - The version endpoint responds.
6. Cleanup trap. `compose down --remove-orphans`, then `sudo rm -rf` the temp data dir (the container writes uid-1001-owned files into the bind mount that the host user cannot remove otherwise), and remove the override file and the built image.

The frontend container is excluded deliberately: it is stateless nginx with no data-loss signal, and skipping its build keeps the test fast. The script talks to the API directly through the published port, using the unprefixed routes (`/health`, `/version`, `/layouts`). Those are the paths the API serves in production, because nginx strips the `/api` prefix before forwarding; the `/api/*` alias exists only for direct-access convenience.

### Part 2: docs/guides/DOCKER-UPGRADE-TESTING.md

A layered, honest guide:

- What server-path data loss actually is: on-disk format compatibility plus mount, perms, and `read_only`. What it is not: field-level migration, which is the browser path covered by the Vitest corpus.
- The two layers: `upgrade-corpus.test.ts` is the field-level no-loss guarantee that runs in CI; `upgrade-smoke.sh` is the on-disk and deployment-environment check, run manually before tagging.
- Run instructions, the `OLD_TAG` override, the ghcr.io login line for private images, the macOS caveat, what each assertion proves, a table mapping failure messages to likely cause, and cross-links to `SELF-HOSTING.md` and `TESTING.md`.

## Environment caveat

On macOS Docker Desktop, host uid 1001 and bind-mount permissions are virtualized, so the uid-permission dimension is only truly exercised on Linux. The guide states that Linux or the self-hosted runner is the supported environment. On macOS the test still validates on-disk format and `read_only` behaviour but not host permissions. The flow was validated end to end on a Debian 13 (trixie) x86_64 VM (see Validation).

## Out of scope

The Vitest corpus, `browser-upgrade.test.ts`, and the `corpus-guard` release job are unchanged. No field-level logic changes and no new TypeScript.

## Decisions

- Manual, not CI. The script pulls old published images and builds a new one, matching the current intent. A `workflow_dispatch` trigger can be added later.
- Include the snapshot create and survival assertions. Snapshots are core to the data-safety story.
- Drive the root compose file with an override, relying on parity CI for persist-file fidelity.

## Validation

The flow was run manually as a spike on a Debian 13 (trixie) x86_64 VM on 2026-06-19, before writing the concrete script, driving the latest release (v26.6.3) to a working-tree build of `main`. Result: 5 assertions passed, 1 skipped.

Confirmed working:

- Compose stack old image to new image via `RACKULA_API_IMAGE`, a port-publish override, and `--project-directory` pointing `./data` at a throwaway dir.
- Bind mount plus uid 1001 plus `read_only: true`: the new container wrote to the bind-mounted `/data` under a read-only rootfs (the write assertion passed). This is the environment fidelity the old test lacked.
- Byte-equality no-loss: the 919-byte layout was byte-identical after the upgrade.
- Discovery: the new API listed the old-written folder.

Findings folded into the design:

- The snapshot feature is unreleased as of v26.6.3, so seeding under the latest release produced no snapshot and the snapshots route returned 404. The snapshot-survival assertion is therefore version-conditional and self-skips; the snapshot count query must tolerate a 404. The snapshot-write path is still proven on the new build (a post-upgrade write created a snapshot).
- The bind mount accumulates uid-1001-owned files, so cleanup requires `sudo rm -rf`.
- A working-tree build carries no version metadata (empty commit and buildTime), so the version assertion only checks that the endpoint responds.

## Verification (for the concrete implementation)

- ShellCheck clean on the reworked script.
- An end-to-end run on Linux (or the self-hosted runner) against the previous release tag, confirming the script passes and that perturbing the stored layout makes the byte-equality assertion fail (teeth check).
- `prettier --check` clean on the new guide.
