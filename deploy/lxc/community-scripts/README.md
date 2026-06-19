# Rackula community-scripts (canonical)

These three files are the canonical source of truth for the Rackula PVE Community Scripts entry:

- `ct/rackula.sh`
- `install/rackula-install.sh`
- `json/rackula.json`

## Sync direction: canonical to fork, one way only

The upstream submission goes through the `ggfevans/ProxmoxVED` fork on branch `feat/add-rackula` (which targets `community-scripts/ProxmoxVED`). That fork is a downstream mirror, not a second source of truth.

Always edit these files here first, then copy them to the fork. Never edit the fork first. Editing fork-first is what caused past drift, where install and runtime fixes landed in the fork or on feature branches but never reached these canonical copies.

To re-sync after changing anything here:

```bash
SRC=deploy/lxc/community-scripts
DST=/path/to/ggfevans/ProxmoxVED
cp "$SRC/ct/rackula.sh"             "$DST/ct/rackula.sh"
cp "$SRC/install/rackula-install.sh" "$DST/install/rackula-install.sh"
cp "$SRC/json/rackula.json"         "$DST/json/rackula.json"
```

After syncing, the fork trio must be byte-identical to these files, with one intentional exception described below.

## Intentional divergence: no dev override upstream

The canonical copies include the env-gated `RACKULA_PREBUILD_TARBALL` dev override (deploys a local tarball for smoke testing, used by the gated release pipeline). The upstream submission does not: community-scripts wants lean scripts with no dev-only paths, so the override blocks and their comments are stripped from the fork branch.

In short: canonical = upstream + dev override. When syncing, carry every other change over verbatim, then re-remove the override on the fork side. It lives in three places: the fail-loud guard in `update_script()` in `ct/rackula.sh`, the deploy branch in the same function, and the deploy branch in `install/rackula-install.sh`.

## URL note: ProxmoxVE vs ProxmoxVED

The `build.func` source line and the License URL point at `ProxmoxVED` (the dev/testing repo), matching the re-submission target. When a script is promoted from ProxmoxVED to the production `ProxmoxVE` repo, those two URLs flip to `ProxmoxVE`.
