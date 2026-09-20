# Rackula community-scripts (mirror)

These two files mirror the Rackula PVE Community Scripts entry:

- `ct/rackula.sh`
- `install/rackula-install.sh`

## Sync direction: mirror of upstream

Upstream is [`community-scripts/ProxmoxVE`](https://github.com/community-scripts/ProxmoxVE). These copies stopped being the canonical source of truth on 2026-06-12, when Rackula was promoted out of ProxmoxVED. They are kept here so `scripts/lxc-smoke-test.sh` can run the real install and update paths from a checkout, and so changes can be drafted before they go upstream.

Reconciling these copies against upstream is tracked in [#3382](https://github.com/RackulaLives/Rackula/issues/3382). Until that lands, treat any difference from upstream as drift to investigate, not as an intended local change.

Draft a change here, then carry it upstream via a PR against `community-scripts/ProxmoxVE`:

```bash
SRC=deploy/lxc/community-scripts
DST=/path/to/community-scripts/ProxmoxVE
cp "$SRC/ct/rackula.sh"              "$DST/ct/rackula.sh"
cp "$SRC/install/rackula-install.sh" "$DST/install/rackula-install.sh"
```

App catalogue metadata is no longer a file in the repo. It lives in upstream's PocketBase instance and is edited with `/pocketbase rackula ...` bot commands, so there is nothing to copy for it.

After syncing, the two files must be byte-identical to upstream, with one intentional exception described below.

## Intentional divergence: no dev override upstream

These copies include the env-gated `RACKULA_PREBUILD_TARBALL` dev override (deploys a local tarball for smoke testing, used by the gated release pipeline). Upstream does not: community-scripts wants lean scripts with no dev-only paths, so the override blocks and their comments are stripped before submission.

In short: local = upstream + dev override. When syncing, carry every other change over verbatim, then re-remove the override on the upstream side. It lives in three places: the fail-loud guard in `update_script()` in `ct/rackula.sh`, the deploy branch in the same function, and the deploy branch in `install/rackula-install.sh`.

This is the only allowed difference. #3382 turns it into a parity allowlist so the rest can be checked automatically.

## URL note: ProxmoxVE vs ProxmoxVED

The `build.func` source line and the License URL point at `ProxmoxVE`. Rackula was promoted from the `ProxmoxVED` dev/testing repo to the production `ProxmoxVE` repo, and those two URLs flipped with it. New scripts still start life in ProxmoxVED and flip on promotion.

ProxmoxVED has since moved its engine out into `community-scripts/core` and dropped `misc/` entirely, so `ProxmoxVED/main/misc/build.func` and `misc/install.func` now 404. ProxmoxVE still serves both. Anything here that fetches framework helpers must target ProxmoxVE, including `scripts/lxc-smoke-test.sh`, whose release gate broke on the old URL.
