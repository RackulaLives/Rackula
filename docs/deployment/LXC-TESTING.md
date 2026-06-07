# LXC Testing Guide

How to validate the Rackula LXC install at different layers without cutting a
release or triggering a production deploy.

---

## Three test layers

The LXC install stack has three independent concerns, each with different test
requirements:

### Layer 1 - Install script logic

Tests: dependency installation (nginx, unzip, ca-certificates), Bun install,
nginx and systemd wiring, `rackula-install.sh` flow.

Requires a release? No. Serve the install script directly from your fork using
`COMMUNITY_SCRIPTS_URL` and install against the existing `latest` release
tarball. The script is exercised end-to-end; the payload content is not what
is under test.

### Layer 2 - Payload (this guide)

Tests: frontend build output, API source + production deps, config files
(nginx.conf, rackula-api.service, security-headers.conf, drop-in override).

Requires a release? No. Use the artifact-only build mode described below to
produce a real-fidelity tarball from any branch and extract it into a throwaway
container.

### Layer 3 - Fetch/verify/update machinery

Tests: `fetch_and_deploy_gh_release`, sha256 verification, `--strip-components`,
`check_for_gh_release`.

Requires a release? Yes. This is stable framework code (proven by v26.6.2) that
is rarely changed. Accept that it is exercised only at real release time.

---

## Release-free payload test (Layer 2)

### 1. Trigger an artifact-only build

Go to Actions > Build LXC Tarball > Run workflow, or use the CLI:

```bash
gh workflow run build-lxc.yml \
  --field publish=false \
  --field ref=main
```

Optional: pass `--field version=vDEV-mybranch` to give the tarball a meaningful
label. Without it, the label defaults to `vDEV-<short-sha>`.

This runs the full build job (frontend build, multi-arch argon2 bun install,
tarball assembly, argon2 binary guards) and uploads the result as a GitHub
Actions artifact. The publish job is skipped, so no release is created and
`deploy-prod.yml` is not triggered.

Artifact retention: 7 days.

### 2. Download the artifact

```bash
# List recent runs
gh run list --workflow=build-lxc.yml --limit=5

# Download the artifact from the run
gh run download <run-id> --name lxc-tarball --dir /tmp/rackula-lxc
```

### 3. Transfer to the container

```bash
# From the Proxmox host, copy the tarball into the CT
pct push <CTID> /tmp/rackula-lxc/rackula-lxc-*.tar.gz /tmp/rackula-lxc.tar.gz
```

### 4. Extract and install into the CT

Inside the CT, replace the fetch step from `rackula-install.sh` with a direct
extract, then run the rest of the install manually:

```bash
# Extract the payload where the installer expects it
mkdir -p /opt/rackula
tar xzf /tmp/rackula-lxc.tar.gz --strip-components=1 -C /opt/rackula

# Then run the install steps from rackula-install.sh
# (from "Installing Rackula" onwards - skip the fetch_and_deploy_gh_release call)
```

### 5. Verify

```bash
systemctl status rackula-api nginx
curl -sf http://127.0.0.1:3001/health
```

Both services should be active, and `/health` should return 200.

---

## argon2 multi-arch guards

The CI build always asserts both Linux binaries are present before assembling
the tarball:

```
test -f node_modules/@node-rs/argon2-linux-x64-gnu/argon2.linux-x64-gnu.node
test -f node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node
```

If you build the tarball locally on macOS as a fallback, apply the same guards
before distributing the tarball. A macOS-local build can silently omit a Linux
argon2 binary; the CI guards catch this, but a local build does not run them
automatically.

```bash
# After: bun install --frozen-lockfile --production --cpu='*' --os=linux
test -f api/node_modules/@node-rs/argon2-linux-x64-gnu/argon2.linux-x64-gnu.node \
  || { echo "ERROR: x64 argon2 binary missing"; exit 1; }
test -f api/node_modules/@node-rs/argon2-linux-arm64-gnu/argon2.linux-arm64-gnu.node \
  || { echo "ERROR: arm64 argon2 binary missing"; exit 1; }
```
