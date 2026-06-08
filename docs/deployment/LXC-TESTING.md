# LXC Testing Guide

Testing the Proxmox LXC install without cutting a release.

---

## Three Test Layers

There are three distinct concerns in the LXC install pipeline. Each has a different testing strategy:

| Layer | What it covers | Needs a release? |
|---|---|---|
| Install script logic | Dependencies, Bun install, nginx/systemd wiring in `rackula-install.sh` | No |
| Payload | Frontend build, API source, native deps, config files in the tarball | No |
| Fetch/verify/update machinery | `fetch_and_deploy_gh_release`, update flow | Yes |

The fetch/verify/update machinery is stable framework code proven by the initial release and rarely changed. The install script and payload change frequently during active development. Test those without releasing.

---

## Layer 1: Testing install script logic

The install script (`install/rackula-install.sh`) can be tested against a new version of the script without changing the payload. Point a throwaway CT at a fork branch to serve the modified script, and let it install the existing `latest` release tarball.

```bash
# On your Proxmox host, run the install with a custom script URL pointing at your fork.
# The CT fetches rackula-install.sh from the URL you provide, then pulls the latest
# release tarball from GitHub.
COMMUNITY_SCRIPTS_URL=https://raw.githubusercontent.com/<your-fork>/ProxmoxVED/<branch> \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/<your-fork>/ProxmoxVED/<branch>/ct/rackula.sh)"
```

This is sufficient for changes to script structure, dependency installs, and nginx/systemd wiring.

---

## Layer 2: Testing the payload (release-free)

Use the `build-lxc-dev.yml` workflow to build a tarball from any branch or SHA as a downloadable run artifact, without creating or touching a release. It is a separate, read-only workflow (no release-write permissions), unlike the release `build-lxc.yml`.

### Trigger a dev build

In the GitHub Actions UI, open "Build LXC Tarball (dev)" (`build-lxc-dev.yml`), pick the
branch or tag to build from the "Use workflow from" dropdown, and optionally set a custom
**version** label (defaults to `vDEV-<sha>`).

Or with the `gh` CLI (`--ref` selects the branch or tag to build from):

```bash
gh workflow run build-lxc-dev.yml --ref my-feature-branch
```

### Download the artifact

```bash
# Find the run ID
gh run list --workflow=build-lxc-dev.yml --limit=5

# Download the artifact from that run (named lxc-tarball-<version>)
gh run download <run-id> --dir /tmp/rackula-lxc-test
ls /tmp/rackula-lxc-test/
# rackula-lxc-vDEV-abc1234.tar.gz
# rackula-lxc-vDEV-abc1234.tar.gz.sha256
```

### Smoke test on a Proxmox host

Run `scripts/lxc-smoke-test.sh` on your Proxmox host. It auto-allocates a throwaway CT
(hostname `rackula-smoke-*`), runs the real `rackula-install.sh` against the payload, exercises
the upgrade path, runs health/frontend/service checks, and tears the CT down (unless `--keep`).
It refuses to touch any CT whose hostname lacks the `rackula-smoke-` prefix, so a real container
is never at risk.

The script runs the canonical install/update scripts, so it needs the repo layout
(`deploy/lxc/community-scripts/`), not just `lxc-smoke-test.sh` on its own. Clone the repo on
the host, or `rsync` the repo (or at least `scripts/` + `deploy/lxc/community-scripts/`) across:

```bash
# Option A: clone on the host
git clone https://github.com/RackulaLives/Rackula && cd Rackula

# Option B: rsync from your workstation (preserves the layout the script expects)
rsync -a --relative scripts/lxc-smoke-test.sh deploy/lxc/community-scripts root@<pve-host>:rackula/
scp /tmp/rackula-lxc-test/rackula-lxc-*.tar.gz root@<pve-host>:/tmp/

# On the Proxmox host (root), from the repo root:
./scripts/lxc-smoke-test.sh --tarball /tmp/rackula-lxc-vDEV-*.tar.gz             # deploy + upgrade (default)
./scripts/lxc-smoke-test.sh --tarball /tmp/rackula-lxc-vDEV-*.tar.gz --mode deploy --keep
```

Flags: `--mode deploy|upgrade|both`, `--baseline release|<tarball>` (upgrade-from payload,
default the real latest release), `--storage`/`--bridge`/`--template` (auto-detected),
`--keep` (skip teardown). Exit code is non-zero if any check fails.

The upgrade test installs the baseline, seeds a marker in `/opt/rackula/data`, runs the real
`update_script`, and verifies the marker survived.

### How the override works

`scripts/lxc-smoke-test.sh` deploys a local tarball by setting `RACKULA_PREBUILD_TARBALL` for
the real install and update scripts. Both `install/rackula-install.sh` and the ct
`update_script` honor it: when set to an existing tarball they extract that payload instead of
calling `fetch_and_deploy_gh_release ... latest`, and `update_script` skips its
`check_for_gh_release` version gate so the upgrade body runs. The override is inert when the
variable is unset, so a normal release install is unaffected.

---

## Layer 3: Testing fetch/verify/update machinery

This layer requires a real GitHub Release with a tarball asset. Use the standard release process:

```bash
/release    # creates tag, changelog entry, and triggers build-lxc.yml
```

Only do this when the machinery itself changes (e.g. `fetch_and_deploy_gh_release` logic, checksum verification, or the update flow in `ct/rackula.sh`).

---

## Local macOS build fallback

If you need to assemble the tarball locally (e.g. for offline CT testing):

```bash
# Prerequisites: Node 22, Bun 1.x

# 1. Build the frontend
VITE_ENV=production VITE_PERSIST_ENABLED=true VITE_UMAMI_ENABLED=false npm ci && npm run build

# 2. Install API production dependencies with cross-platform native binaries
cd api
bun install --frozen-lockfile --production --cpu='*' --os=linux

# 3. Verify argon2 native binaries are present for both architectures
test -f node_modules/@node-rs/argon2-linux-x64-gnu/argon2.linux-x64-gnu.node \
  || { echo "ERROR: x64 argon2 binary missing"; exit 1; }
test -f node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node \
  || { echo "ERROR: arm64 argon2 binary missing"; exit 1; }

# 4. Assemble the tarball
cd ..
VERSION="vDEV-local"
TARBALL_DIR="rackula-lxc-${VERSION}"

mkdir -p "${TARBALL_DIR}/frontend" "${TARBALL_DIR}/api" "${TARBALL_DIR}/config"

cp -r dist/* "${TARBALL_DIR}/frontend/"
cp -r api/src api/node_modules api/package.json api/tsconfig.json "${TARBALL_DIR}/api/"
cp deploy/lxc/nginx.conf deploy/lxc/rackula-api.service \
   deploy/lxc/security-headers.conf deploy/lxc/nginx.service.d-override.conf \
   "${TARBALL_DIR}/config/"

tar czf "rackula-lxc-${VERSION}.tar.gz" "${TARBALL_DIR}"
sha256sum "rackula-lxc-${VERSION}.tar.gz" > "rackula-lxc-${VERSION}.tar.gz.sha256"
rm -rf "${TARBALL_DIR}"
echo "Built: rackula-lxc-${VERSION}.tar.gz"
```

The `test -f` guards for both `argon2-linux-x64-gnu` and `argon2-linux-arm64-gnu` are mandatory. Without the `--cpu='*' --os=linux` flags, Bun installs only the host platform binary, which causes the API to fail at startup on arm64 LXC containers.
