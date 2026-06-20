# Docker Upgrade Testing

This guide is for a maintainer about to tag a release. It explains how to confirm that an existing self-hosted deployment with saved data can take new images without losing that data.

## What this tests, and what it does not

Saved layouts live in the `/data` volume and are stored by the API as YAML, verbatim. The API does not migrate or transform a layout on read or write. So data loss across a server upgrade comes from one of two places:

1. On-disk format compatibility. The API stores each layout as a folder, `{DATA_DIR}/{Name}-{UUID}/{name}.rackula.yaml`, with snapshots and assets inside the folder, and finds it by scanning for the UUID. If new code stops recognizing a folder that old code wrote, the layout becomes invisible: the data is still on disk, but the API returns 404, which looks like the layout was wiped.
2. The deployment environment. The shipped compose file declares the bind mount and runs the API under a read-only rootfs as uid 1001. A changed mount path, a permission problem, or a write outside `/data` and `/tmp` can break reads or writes after an upgrade.

Field-level migration of a layout (for example a pre-carrier `slot_position` layout becoming a carrier layout) happens in the browser, not the server. That path is covered separately by the Vitest upgrade corpus. This guide does not cover it.

The migration is one-way: the first save rewrites the file in the new format. Both storage modes keep an automatic pre-migration backup. Browser users get a one-time localStorage snapshot; server-storage (Docker) deployments get a durable `pre-carrier-backup.yaml` written once inside the layout folder when the migrating save lands (the app signals it with the `X-Rackula-Pre-Carrier-Migration` header). It is retrievable at `GET /layouts/:uuid/pre-carrier-backup`. Backing up `/data` before an upgrade is still recommended as a belt-and-suspenders measure. The smoke test asserts both that a pre-carrier file is served back unchanged after a pull with no save, and that a migrating save preserves the original in the durable backup.

## The two layers

There are two layers of upgrade-safety coverage. Use both.

| Layer | What it covers | When it runs |
| --- | --- | --- |
| `src/tests/upgrade-corpus.test.ts` | Field-level no-loss on the YAML format, through the real load path | Every CI run |
| `scripts/upgrade-smoke.sh` | On-disk format and deployment environment, through a real compose upgrade | Manually, before tagging |

The corpus test is the field-level guarantee. The smoke test is the deployment guarantee. Neither replaces the other.

## Running the smoke test

The smoke test seeds a layout using the previous released image, upgrades to a locally built image against the same bind mount, and asserts the data survives.

Prerequisites: `docker`, `docker compose` (v2), `curl`, `cmp`, `git`, and `sudo`. The script uses `sudo` to set the bind mount to uid 1001 and to remove the uid-1001-owned files the container leaves behind.

```bash
scripts/upgrade-smoke.sh                 # resolves the previous release tag
OLD_TAG=v26.5.0 scripts/upgrade-smoke.sh # pin the version to upgrade from
```

If the previous image is private, log in to the registry first:

```bash
gh auth token | docker login ghcr.io -u <user> --password-stdin
```

A successful run ends with `PASS: upgrade from <tag> preserved the seeded layout`.

## What each assertion proves

| Assertion | What it proves |
| --- | --- |
| discovery | New code finds and lists the folder the old release wrote. |
| no data loss | The layout is byte-identical after the upgrade. Since the API stores YAML verbatim, any difference is corruption. |
| pre-carrier discovery | The new release lists a layout written in the pre-carrier (`slot_position`) format. |
| pre-carrier untouched at rest | A pre-carrier layout is served back byte-identical after a pull with no save. The server does not transform data at rest; migration happens only when the app loads and saves it. |
| migrating save backs up the original | A save carrying the migration header writes a durable `pre-carrier-backup.yaml` holding the pre-migration bytes, retrievable at `GET /layouts/:uuid/pre-carrier-backup`. |
| backup is one-time | A second migrating save does not overwrite the backup, so the original pre-carrier copy is never lost to a later autosave. |
| snapshots survive | Snapshots written by the old release are still readable. This is skipped when the old release predates the snapshot feature. |
| writes work under read_only | The upgraded container can still persist a change with a read-only rootfs and only `/data` and `/tmp` writable. |
| the write created a snapshot | The new build snapshots the prior copy before overwriting it. |
| version endpoint responds | The upgraded API is serving. |

## Reading a failure

| Message | Likely cause |
| --- | --- |
| `could not pull ... (login to ghcr.io?)` | The previous image tag is wrong or private. Check the tag, or log in to ghcr.io. |
| `API did not become healthy` | The container failed to start against the bind mount. Check the logs it prints, and that the data dir is owned by uid 1001. |
| `GET after upgrade failed (not found, ...)` | New code cannot read the old-written folder. This is the on-disk format regression the test exists to catch. |
| `FAIL: no data loss ...` | The stored layout changed across the upgrade. The data was altered or corrupted. |
| `FAIL: writes work under read_only ...` | The new image tries to write outside `/data` or `/tmp`, or cannot write to the bind mount. |

## Environment notes

Run this on Linux or the self-hosted runner. On macOS Docker Desktop the uid 1001 and bind-mount permissions are virtualized, so the on-disk format and read-only checks still run but the host-permission dimension is not truly exercised.

The new image is built from the working tree, so it carries no release version metadata (empty commit and build time). That is expected before a tag exists; the version assertion only checks that the endpoint responds.

## See also

- [SELF-HOSTING.md](../deployment/SELF-HOSTING.md) for the operator-facing upgrade steps.
- [TESTING.md](./TESTING.md#data-format-and-persistence-regression-coverage) for the automated data-format and persistence coverage.
