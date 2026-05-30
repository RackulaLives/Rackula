# LXC Best Practices Research for Rackula

**Date:** 2026-05-29
**Purpose:** Research best practices for deploying Rackula as an LXC container on Proxmox VE, targeting community-scripts submission.

---

## 1. Security Hardening

### Proxmox/LXC Level

- **Unprivileged containers only** (default since PVE 7+). Root UID 0 inside maps to an unprivileged user on the host. LXC team considers these "safe by design."
- **Keep AppArmor enabled.** The default profile restricts dangerous syscalls like `mount`. Disabling (`lxc.apparmor.profile = unconfined`) is not recommended for production.
- **Minimise features.** Only enable `nesting=1` and `keyctl=1` if required by the workload. Each feature increases attack surface.
- **cgroup v2** (required since PVE 9.0) provides per-service resource isolation and OOM control.
- **Never bind mount system directories** (`/`, `/var`, `/etc`) into a container.

### systemd Per-Service Sandbox (Inside Container)

The existing `rackula-api.service` has a basic sandbox with `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, and `ReadWritePaths`. This is a good start but far from complete. The full hardening cookbook adds:

**Filesystem protection:**
| Directive | Purpose | Current State |
|---|---|---|
| `ProtectSystem=strict` | Entire FS read-only except ReadWritePaths | Present |
| `ProtectHome=true` | Hides /home, /root, /run/user | Present |
| `PrivateTmp=true` | Isolated /tmp namespace | Present |
| `ReadWritePaths=` | Writable directory whitelist | Present (only /opt/rackula/data) |
| `ReadOnlyPaths=` | Explicit read-only paths | Missing |
| `InaccessiblePaths=` | Completely hidden paths | Missing |
| `UMask=0077` | Restricts default file creation | Missing |

**Kernel protection:**
| Directive | Purpose | Current State |
|---|---|---|
| `ProtectKernelTunables=true` | Blocks /proc/sys, /sys access | Missing |
| `ProtectKernelModules=true` | Prevents kernel module load/unload | Missing |
| `ProtectKernelLogs=true` | Blocks dmesg access | Missing |
| `ProtectControlGroups=true` | Blocks /sys/fs/cgroup writes | Missing |
| `ProtectClock=true` | Prevents clock modification | Missing |
| `ProtectHostname=true` | Blocks hostname changes | Missing |
| `ProtectProc=invisible` | Hides other users' /proc entries | Missing |
| `ProcSubset=pid` | Limits /proc to PID entries only | Missing |

**Process restrictions:**
| Directive | Purpose | Current State |
|---|---|---|
| `NoNewPrivileges=true` | Prevents privilege escalation | Present |
| `RestrictSUIDSGID=true` | Blocks setuid/setgid | Missing |
| `RestrictRealtime=true` | Denies realtime scheduling | Missing |
| `RestrictNamespaces=true` | Blocks namespace creation | Missing |
| `LockPersonality=true` | Prevents execution domain changes | Missing |
| `MemoryDenyWriteExecute=true` | Blocks W+X memory | Missing (breaks JIT -- see note) |
| `PrivateDevices=true` | Private /dev without real device nodes | Missing |
| `RemoveIPC=true` | Removes IPC on service stop | Missing |

**Capability dropping:**
| Directive | Purpose | Current State |
|---|---|---|
| `CapabilityBoundingSet=` | Strips all capabilities | Missing |
| `AmbientCapabilities=` | No inherited caps for non-root | Missing |

Since the API runs as `rackula` user on port 3001 (high port), both should be empty.

**Syscall filtering:**
| Directive | Purpose | Current State |
|---|---|---|
| `SystemCallArchitectures=native` | Blocks compat-arch syscalls | Missing |
| `SystemCallFilter=@system-service` | Allowlist of standard syscalls | Missing |
| `SystemCallFilter=~@privileged @resources` | Deny privileged syscall groups | Missing |

**Network egress control:**
| Directive | Purpose | Current State |
|---|---|---|
| `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6` | Limits address families | Missing |
| `IPAddressDeny=any` | Blocks all IP egress | Missing |
| `IPAddressAllow=127.0.0.0/8` | Whitelists localhost only | Missing |

The API only needs localhost access (nginx proxies to it), so `IPAddressDeny=any` + `IPAddressAllow=127.0.0.0/8` would prevent any exfiltration if the service were compromised.

**Important caveat:** `MemoryDenyWriteExecute=true` breaks JIT runtimes. Bun uses JIT for its JavaScriptCore engine, so this directive **must not** be used. Node.js and PHP-FPM with JIT are similarly affected.

**Audit tool:** `systemd-analyze security rackula-api` produces a numeric exposure score. Stock services score 6.5-9.5 (UNSAFE). Hardened services target ~2.0 (OK).

**nginx service hardening** should also be applied. The worked example from the cookbook requires:

- `ProtectSystem=strict` with `ReadWritePaths=/var/log/nginx /var/lib/nginx /var/cache/nginx /run`
- `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectKernelLogs`, `ProtectControlGroups`, `ProtectClock`, `ProtectHostname`
- `NoNewPrivileges=true`, `RestrictSUIDSGID=true`, `RestrictRealtime=true`, `LockPersonality=true`
- `MemoryDenyWriteExecute=true` (nginx does not use JIT -- safe to enable)
- `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_CHOWN CAP_DAC_OVERRIDE CAP_SETGID CAP_SETUID` (nginx on port 80 needs these)
- `AmbientCapabilities=CAP_NET_BIND_SERVICE`
- `SystemCallArchitectures=native`, `SystemCallFilter=@system-service ~@privileged @resources`

### Sources

- [Proxmox Wiki -- Linux Container](https://pve.proxmox.com/wiki/Linux_Container)
- [systemd Hardening: A Production Sandboxing Cookbook](https://blog.servarat.net/systemd-hardening-a-production-sandboxing-cookbook/)
- [pve-secure-gitlab-lxc](https://github.com/hiall-fyi/pve-secure-gitlab-lxc)

---

## 2. Community-Scripts Requirements

### Submission Pipeline

**New scripts must go to [ProxmoxVED](https://github.com/community-scripts/ProxmoxVED), NOT ProxmoxVE.** PRs with new scripts opened directly against ProxmoxVE will be closed without review. After acceptance in ProxmoxVED, maintainers promote scripts to the main repo.

### Required Two-File Structure

| File                         | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `ct/rackula.sh`              | Container creation, variable setup, update handling |
| `install/rackula-install.sh` | Application installation logic                      |

Both files must exist and follow naming convention: lowercase, hyphen-separated, matching names between directories.

### CT Script Template (Required Structure)

```bash
#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: AuthorName (GitHubUsername)
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://application-url.com

APP="AppName"
var_tags="${var_tags:-tag1;tag2}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-256}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() { ... }

start
build_container
description
```

### Install Script Template (Required Structure)

```bash
#!/usr/bin/env bash
source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

# ... dependency install, app setup, service creation ...

motd_ssh
customize
cleanup_lxc
```

### Anti-Patterns That Will Get PRs Rejected

| Anti-Pattern                                                                      | Correct Pattern                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Custom curl/wget for GitHub releases                                              | `fetch_and_deploy_gh_release "app" "owner/repo" "tarball"`   |
| Docker-based installation                                                         | Bare-metal only                                              |
| Custom runtime install (curl pipe bash for Node/Bun)                              | `setup_*` functions                                          |
| Wrapping `tools.func` functions in `msg_info`/`msg_ok`                            | Call directly -- they have built-in messaging                |
| `apt-get` instead of `apt`                                                        | `$STD apt install -y`                                        |
| Creating system users in LXC                                                      | Run as root (LXC containers run as root)                     |
| Using `sudo` in LXC                                                               | Already root                                                 |
| Backing up to `/tmp`                                                              | Back up within `/opt`                                        |
| `export` in `.env` files                                                          | Plain `KEY=VALUE`                                            |
| Hardcoded versions for external tools                                             | `fetch_and_deploy_gh_release` or `get_latest_github_release` |
| `systemctl daemon-reload` for new services                                        | Not needed for new units                                     |
| External shell scripts                                                            | Run commands directly                                        |
| Writing files without heredocs                                                    | Always use a single heredoc                                  |
| Pre-installed packages as deps (curl, sudo, wget, jq, gnupg, ca-certificates, mc) | Omit these                                                   |
| Default "(Patience)" in msg_info                                                  | Plain label only                                             |
| Missing `$STD` before apt/npm/build commands                                      | Always prefix                                                |

### Bun Runtime -- Three Paths

There is **no `setup_bun` function** in `tools.func`. The available runtime setup functions are: `setup_nodejs`, `setup_uv`, `setup_go`, `setup_rust`, `setup_ruby`, `setup_java`, `setup_php`. However, `setup_nodejs` supports `NODE_MODULE="bun"` which installs Bun as a **global npm package** via `npm install -g bun@latest`.

**Three paths forward:**

1. **`NODE_VERSION="22" NODE_MODULE="bun" setup_nodejs`** — Install Node.js + Bun via npm global. This is the "official" path used by `convertx-install.sh`. **Downside:** Installs the entire Node.js runtime (which Rackula doesn't need), and Bun runs as an npm global package rather than a standalone runtime. Rackula's API uses Bun-native features (runs `.ts` directly) that may behave differently when Bun is installed via npm vs natively.

2. **`curl -fsSL https://bun.sh/install | bash`** — Direct Bun runtime install. **Despite the anti-pattern label**, this pattern is used by multiple accepted scripts (`yubal-install.sh`, `gitea-mirror-install.sh`) in the repo. The key difference: wrap in `$STD` and use `/opt/bun` prefix (matching `yubal`), not `/root/.bun` (current Rackula pattern).

3. **`fetch_and_deploy_gh_release "bun" "oven-sh/bun" "singlefile"`** — Install Bun binary from GitHub releases. Cleanest from a community-scripts compliance standpoint but requires testing that the `bun` binary from the release page works standalone (it should — Bun distributes a single binary).

**Recommendation:** Path 2 is the pragmatic choice. It matches existing accepted patterns, avoids the Node.js dependency overhead, and requires the least rework. Switch from `/root/.bun` to `/opt/bun` install prefix to match `yubal`/`gitea-mirror` convention.

### JSON Metadata File

Required at `json/rackula.json` with fields: `name`, `slug`, `categories` (ID array), `date_created`, `type` (`ct`), `updateable`, `privileged`, `interface_port`, `documentation`, `website`, `logo`, `description`, `install_methods`, `default_credentials`, `notes`.

### PR Checklist

- [ ] No Docker installation used
- [ ] `fetch_and_deploy_gh_release` used with explicit mode (`"tarball"`, `"singlefile"`, etc.)
- [ ] `check_for_gh_release` used for update checks
- [ ] `setup_*` functions used for runtimes (or approved alternative for Bun)
- [ ] `tools.func` functions NOT wrapped in `msg_info`/`msg_ok`
- [ ] No redundant variables
- [ ] No hardcoded versions for external tools
- [ ] `$STD` before all apt/npm/build commands
- [ ] `apt` used (NOT `apt-get`)
- [ ] No core packages listed as dependencies
- [ ] Update function present and functional
- [ ] Data backup in update function (backups to `/opt`, NOT `/tmp`)
- [ ] `motd_ssh`, `customize`, `cleanup_lxc` at the end
- [ ] JSON metadata file created
- [ ] No custom download/version-check logic

### Sources

- [ProxmoxVE CONTRIBUTING.md](https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/CONTRIBUTING.md)
- [ProxmoxVED AGENTS.md](https://github.com/community-scripts/ProxmoxVED/blob/main/AGENTS.md)
- [ProxmoxVE tools.func Wiki](https://github.com/community-scripts/ProxmoxVE/wiki/tools.func)
- [Install Script Template Wiki](https://github.com/community-scripts/ProxmoxVE/wiki/%5BScript%5D:-AppName%E2%80%90install.sh)

---

## 3. Update/Rollback Patterns

### Current community-scripts Pattern (move-then-restore)

The standard pattern across accepted scripts uses `mv` for backup and manual restore:

```bash
# 1. Stop services
systemctl stop appname nginx

# 2. Backup user data
mv "/opt/appname" "/opt/appname-backup"

# 3. Deploy new release
fetch_and_deploy_gh_release "appname" "owner/repo" "tarball"

# 4. Restore user data from backup
mv "/opt/appname-backup/.env" "/opt/appname/.env"
mv "/opt/appname-backup/data" "/opt/appname/data"

# 5. Remove backup on success
rm -rf "/opt/appname-backup"

# 6. Start services
systemctl start appname nginx
```

**Weaknesses of this pattern:**

- Not truly atomic -- if step 3 or 4 fails mid-way, the original is at `*-backup` and must be manually restored
- No automatic rollback on failure -- no `trap` handler that restores from backup
- `mv` is disk-efficient but means the original location is empty during the update window
- No lock file to prevent concurrent update execution

### Improved Atomic Pattern (symlink-swap)

```bash
# 1. Build new version in separate directory
fetch_and_deploy_gh_release "appname-new" "owner/repo" "tarball"
# configure new version, copy persistent data
cp -a /opt/appname/data /opt/appname-new/data
cp /opt/appname/.env /opt/appname-new/.env

# 2. Keep old version as backup
mv /opt/appname /opt/appname-old

# 3. Atomic swap via symlink
ln -sfn /opt/appname-new /opt/appname

# 4. Start services -- if they fail, swap back
systemctl start appname
if ! systemctl is-active --quiet appname; then
  ln -sfn /opt/appname-old /opt/appname
  systemctl start appname
  msg_error "Update failed, rolled back to previous version"
  exit 1
fi

# 5. Remove old version after confirmed success
rm -rf /opt/appname-old
```

### Trap-based Rollback

```bash
cleanup() {
  if [[ -d /opt/appname-backup && ! -d /opt/appname ]]; then
    mv /opt/appname-backup /opt/appname
    msg_error "Update failed, restored from backup"
  fi
  rm -f /tmp/update.lock
}
trap cleanup EXIT

# Prevent concurrent updates
if [[ -f /tmp/update.lock ]]; then
  msg_error "Update already in progress"
  exit 1
fi
touch /tmp/update.lock
```

### Proxmox-Level Rollback

For catastrophic failures, container-level restore is recommended:

```bash
# Pre-update snapshot
vzdump <CTID> --mode snapshot --compress zstd

# Restore if needed
pct stop <CTID>
pct restore <CTID> /path/to/backup.tar.zst
pct start <CTID>
```

### Current Rackula Implementation Issues

The current `update_script()` in `rackula.sh`:

1. Uses `cp -a` for backup (not `mv` -- safer but uses more disk)
2. Downloads to `/tmp` (community-scripts requires backups in `/opt`, not `/tmp`)
3. Uses custom `curl` + `tar` instead of `fetch_and_deploy_gh_release`
4. No trap-based rollback on failure
5. No lock file to prevent concurrent updates
6. Removes backup unconditionally after "success" without verifying service health
7. Does NOT verify the service actually starts after update

### Sources

- [Community-scripts update_script Wiki](https://github.com/community-scripts/ProxmoxVE/wiki/%5BScript%5D:-AppName.sh)
- [Update Scripts documentation](https://community-scripts-proxmoxve.mintlify.app/usage/update-scripts)
- [Script Structure & Patterns](https://community-scripts-proxmoxve.mintlify.app/concepts/script-structure)

---

## 4. Authentication in LXC Context

### The Problem

Rackula runs in LXC behind nginx on port 80, possibly without TLS termination from a reverse proxy. The current design uses nginx `map` directives to inject a write token for PUT/DELETE requests. This is clever but has important implications.

### Current Approach (nginx token injection)

The nginx config uses three `map` directives:

1. Detect if request method is PUT or DELETE (`$rackula_is_write_method`)
2. Check if write token is configured (`$rackula_token_check`)
3. For write methods with token configured, replace the `Authorization` header with `Bearer <token>` (`$rackula_api_authorization`)

This means:

- GET requests pass through unauthenticated (read-only, by design)
- PUT/DELETE requests are automatically authenticated by nginx before reaching the API
- The token is stored in `/etc/nginx/snippets/rackula-api-token.conf` (chmod 600) and `/opt/rackula/data/.env`

### Patterns Used by Other Self-Hosted Apps

| Pattern                    | How It Works                                         | Example               | Trade-off                                                     |
| -------------------------- | ---------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| **Auth proxy in front**    | Lightweight Go proxy handles auth before forwarding  | auth-proxy            | Adds a process; supports separate read/write protection flags |
| **Built-in app auth**      | App implements session/JWT auth directly             | GitLab CE in LXC      | More complex; requires user management                        |
| **Localhost-only + token** | Bind to 127.0.0.1, bearer tokens, no public exposure | sentinelx-core        | No remote access without proxy                                |
| **App-terminated TLS**     | App handles TLS directly                             | GitLab built-in Nginx | Requires cert management                                      |
| **nginx token injection**  | nginx maps inject auth header                        | Rackula current       | Smart but non-obvious; trust in nginx config                  |

### Concerns with Current Approach

1. **Token stored in two places** (`/etc/nginx/snippets/` and `/opt/rackula/data/.env`) -- drift risk if either is edited manually
2. **No token rotation mechanism** -- token is generated once at install, never rotated
3. **HSTS header included but served over HTTP** -- browsers ignore HSTS over plain HTTP per RFC 6797 S7.2. The current `security-headers.conf` includes `Strict-Transport-Security` which is only meaningful behind a TLS-terminating reverse proxy
4. **CORS config** -- `ALLOW_INSECURE_CORS=true` allows cross-origin requests over HTTP; appropriate for internal/LAN use but should be documented as a security boundary

### Recommendations

1. Add a `rackula-rotate-token` helper script or make the update script rotate the token
2. Conditionally include HSTS only when TLS is detected (or remove it and document that it should be added behind a TLS proxy)
3. Add a `SECURITY.md` or install note explaining the trust model: read-only is public, writes require the token stored in `.env`
4. Consider `auth-proxy` pattern if more granular auth is ever needed (e.g., multiple users with different permissions)

### Sources

- [auth-proxy](https://github.com/haturatu/auth-proxy)
- [sentinelx-core](https://github.com/pensados/sentinelx-core)
- [pve-secure-gitlab-lxc](https://github.com/hiall-fyi/pve-secure-gitlab-lxc)

---

## 5. Resource Sizing

### Benchmarks from Similar Apps

| Workload                           | RAM        | CPU       | Disk    | Source                    |
| ---------------------------------- | ---------- | --------- | ------- | ------------------------- |
| Minimal Node.js/Bun API            | 128-256 MB | 1 core    | 4 GB    | runesoft.net, datazone.de |
| Standard web app (Node + nginx)    | 256-512 MB | 1-2 cores | 8 GB    | mathbong.com              |
| Homarr (Node.js + Redis + nginx)   | 2048 MB    | 2 cores   | 8 GB    | community-scripts         |
| 2FAuth (PHP-FPM + MariaDB + nginx) | 512 MB     | 1 core    | 2 GB    | community-scripts         |
| LXC base overhead                  | ~20 MB     | N/A       | ~500 MB | datazone.de               |

### Rackula-Specific Analysis

**Frontend:** Static Svelte SPA served by nginx. Zero runtime cost beyond nginx (which uses ~2-5 MB RSS per worker).

**API:** Bun process running Hono framework. Bun is more memory-efficient than Node.js. A simple Hono API typically uses 30-80 MB RSS. With persistence writes and layout storage, budget 100-150 MB peak.

**nginx:** ~5-10 MB total with 2 workers.

**OS overhead:** Debian minimal in LXC is ~50-80 MB.

**Total realistic idle:** ~100-180 MB. **Total realistic peak:** ~250-350 MB.

### Current Allocation vs Recommendation

| Resource | Current | Recommended       | Rationale                                                |
| -------- | ------- | ----------------- | -------------------------------------------------------- |
| RAM      | 256 MB  | 512 MB            | Provides headroom for peak load + OOM safety margin      |
| CPU      | 1 core  | 1 core            | Sufficient for a single-user homelab tool                |
| Disk     | 4 GB    | 8 GB              | 4 GB is tight with OS + nginx + Bun + logs + growth room |
| Swap     | Not set | 0 (use host zram) | Swap in LXC adds latency; host zram is better            |

**Why 512 MB over 256 MB:** While 256 MB can technically run the app, the margin is thin. A burst of API requests or a garbage collection cycle could trigger OOM. 512 MB gives a 2x safety factor and aligns with community-scripts norms (2FAuth allocates 512 MB for a simpler PHP app).

**Why 8 GB disk:** The LXC base is ~500 MB, OS packages ~1.5 GB, Bun + node_modules ~200 MB, frontend build ~50 MB, logs and data growth ~1 GB. That is already ~3.25 GB on a 4 GB disk with no room for updates (which need temporary space for the tarball + extraction). 8 GB provides comfortable headroom and aligns with community-scripts norms (most web apps use 8 GB).

### Proxmox Config

```bash
pct create <CTID> local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst \
  -unprivileged 1 \
  -cores 1 \
  -cpulimit 1 \
  -memory 512 \
  -swap 0 \
  -rootfs local-lvm:8 \
  -net0 name=eth0,bridge=vmbr0,firewall=1 \
  -features nesting=1
```

### Sources

- [mathbong.com -- Standardizing LXC Containers](http://mathbong.com/en/blog/infra/proxmox/06-standard-lxc-setup-and-boundaries)
- [Krython -- LXC Performance Tuning](https://www.krython.com/post/lxc-container-performance-tuning)
- [runesoft.net -- Express API on Proxmox LXC](https://runesoft.net/linux/ubuntu/hosting-my-own-api-running-on-nodejs-using-proxmox-and-lxc/)
- [DATAZONE -- Proxmox LXC Containers](https://datazone.de/en/aktuelles/proxmox-lxc-container-virtualization/)

---

## 6. Process Supervision

### Current State

The `rackula-api.service` uses:

- `Type=simple` -- systemd considers the unit started immediately after the service manager forks off the main service process and does not wait for the service binary to finish launching or for any readiness signaling before continuing
- `Restart=always` -- restarts on any exit (crash, signal, timeout)
- `RestartSec=5` -- 5-second delay between restarts

This is basic but functional. There is no watchdog, no health check, no OOM handling, and no resource limits.

### Recommended Additions

**Watchdog timer:**

```ini
WatchdogSec=30
```

The Bun process must send `WATCHDOG=1` notifications every 30 seconds via `sd_notify`. If it fails to do so, systemd kills and restarts it. This catches hangs (not just crashes).

For this to work, the service needs:

- `Type=notify` (not `simple`)
- The Bun process must call `sd_notify("WATCHDOG=1")` periodically

Alternative without app-level changes: use a sidecar or wrapper that checks the `/health` endpoint and pings the watchdog.

**OOM handling:**

```ini
OOMPolicy=stop
OOMScoreAdjust=-100
```

- `OOMPolicy=stop` -- systemd cleanly stops the unit when OOM killer hits it, then Restart=always brings it back
- `OOMScoreAdjust=-100` -- only a modest protection bias. Scale is `-1000` (strongest protection) to `1000` (most killable), with `0` as default. Use around `-500` or lower if you need significantly stronger protection; OOM kill is still possible under severe pressure.

**Resource limits:**

```ini
MemoryMax=384M
MemoryHigh=320M
TasksMax=32
LimitNOFILE=1024
```

- `MemoryMax` -- hard ceiling; process is killed if it exceeds this (harder than cgroup limit)
- `MemoryHigh` -- throttle threshold; process is slowed and pressured to reclaim memory
- `TasksMax` -- prevents fork bombs; 32 is generous for a single Bun process
- `LimitNOFILE` -- open file descriptors; 1024 is generous for a simple API

**Health check endpoint:** Already exists at `/api/health` (proxied by nginx) and `/health` (nginx returns 200 directly). These are good but not wired into any monitoring.

**Start-up verification:**

```bash
# After systemctl start, verify the health endpoint responds
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
    msg_ok "Service running successfully"
    break
  fi
  sleep 1
done
```

This pattern is recommended by community-scripts but currently missing from the install script.

### nginx Supervision

nginx already has robust supervision built into the Debian package unit. The key addition is a watchdog for the entire web stack:

```bash
# Verify both services after update
systemctl is-active --quiet rackula-api || { msg_error "API failed to start"; exit 1; }
systemctl is-active --quiet nginx || { msg_error "nginx failed to start"; exit 1; }
```

### Sources

- [systemd.scope man page -- OOMPolicy](https://www.freedesktop.org/software/systemd/man/254/systemd.scope.html)
- [systemd-docker -- watchdog integration](https://github.com/systemd-docker/systemd-docker)
- [go-systemd-sidecar -- health checks](https://github.com/addisonbair/go-systemd-sidecar)

---

## 7. Networking

### Best Practices for LXC Service Containers

**Static IP vs DHCP:** Use static IPs for server/service containers. Predictable addressing is essential for firewall rules, monitoring, and client configuration. Reserve a DHCP range and assign static IPs outside it.

**Current community-scripts pattern:** The build framework automatically detects and displays the container IP. Scripts output access URLs using `${IP}` and `${GATEWAY}` variables. No custom networking is configured.

**DNS configuration:** Debian 12 LXCs have a known issue where DHCP overwrites `/etc/resolv.conf`, ignoring Proxmox GUI DNS settings. Fix: install `resolvconf` inside the container:

```bash
apt install resolvconf
```

**Port exposure:** Rackula uses nginx on port 80. This is the standard pattern for community-scripts web apps. No external port mapping is needed since LXC containers on `vmbr0` are directly addressable on the LAN.

**Firewall:** Enable Proxmox firewall at all three levels (Datacenter > Node > Container). Default deny inbound; allow only port 80 (and 443 if TLS is added).

```bash
# Container firewall rules
[RULES]
IN ACCEPT -p tcp -dport 80 -source 192.168.0.0/16  # HTTP from LAN
IN DROP                                              # Block all other inbound
```

**VLANs:** If the Proxmox host uses VLAN-aware bridges, assign the container to the appropriate VLAN:

```bash
pct set <CTID> -net0 name=eth0,bridge=vmbr0,tag=10,ip=dhcp
```

**No NAT needed for LAN access.** LXC containers on the same bridge as the host are directly reachable. Port forwarding/NAT is only needed when exposing services to the internet through the host's public IP.

### Current Rackula State

The current implementation does not configure any custom networking. The community-scripts framework handles IP detection and display. This is correct and should not be changed.

### Sources

- [Proxmox Container Toolkit](https://pve.proxmox.com/pve-docs/chapter-pct.html)
- [Proxmox Wiki -- Linux Container](https://pve.proxmox.com/wiki/Linux_Container)
- [Community-scripts Networking Guide](https://community-scripts-proxmoxve.mintlify.app/guides/networking)

---

## 8. Backup and Data Persistence

### Proxmox Mount Points for Data Persistence

**Storage-backed mount points** (recommended):

```
mp0: local-lvm:subvol-<CTID>-disk-1,mp=/opt/rackula/data,size=4G,backup=1
```

- The `backup=1` flag ensures vzdump includes this volume in container backups
- The volume persists independently of the container rootfs
- If the container is destroyed and recreated, the volume can be reattached

**Bind mount points** (alternative):

```
mp0: /mnt/bindmounts/rackula-data,mp=/opt/rackula/data
```

- Data lives on the host filesystem, persists regardless of container lifecycle
- **Never backed up by vzdump** -- must use `proxmox-backup-client` or host-level backup
- May have permission issues in unprivileged containers due to UID mapping

### Recommended Strategy for Rackula

1. **Use storage-backed mount point** for `/opt/rackula/data` with `backup=1`
2. The rest of `/opt/rackula/` (frontend, api) lives in rootfs and can be rebuilt from the tarball
3. The `.env` file in `/opt/rackula/data/` is the critical persistent file (contains the write token)

### Unprivileged Container UID Mapping

If using bind mounts with unprivileged containers, UID mapping may cause permission issues. The `idmap` option can help:

```
mp0: /mnt/bindmounts/rackula-data,mp=/opt/rackula/data,idmap=u:1000:1000:1
```

Or use `idmap=passthrough` for identity mapping (IDs inside container match IDs on disk).

### vzdump Exclusions

These paths are always skipped by vzdump: `/tmp/?*`, `/var/tmp/?*`, `/var/run/?*pid`, bind mount and device mount point contents.

### What the Install Script Should Do

The current install script creates `/opt/rackula/data/` inside the rootfs. For better data persistence:

1. During install, create the data directory as normal
2. Document that users should create a mount point for `/opt/rackula/data` before running the update script
3. The update script should check if `/opt/rackula/data` is a mount point and warn if not

Alternatively, the CT script could configure the mount point during container creation. However, community-scripts typically do not configure mount points -- they leave storage decisions to the user.

### Sources

- [Proxmox Wiki -- LXC Bind Mounts](https://pve.proxmox.com/wiki/LXC_Bind_Mounts)
- [pct.conf man page](https://pve.proxmox.com/pve-docs-9-beta/pct.conf.5.html)
- [Proxmox Forum -- Restoring LXC mount points](https://forum.proxmox.com/threads/restoring-lxc-will-this-erase-the-mount-points-or-not.175530/)

---

## 9. Monitoring and Observability

### Minimum Viable Monitoring for LXC

**Layer 1: Process health (systemd)**

- `Restart=always` handles crash recovery
- `WatchdogSec=` handles hang detection (if implemented)
- `systemctl status rackula-api` for manual checks
- `journalctl -u rackula-api -f` for live log streaming

**Layer 2: HTTP health checks**

- `/health` endpoint (nginx, returns 200) -- confirms nginx is serving
- `/api/health` endpoint (proxied to API) -- confirms the full stack is functional
- Both already exist in the current implementation

**Layer 3: External monitoring (recommended)**

- **Beszel** -- 10 MB agent per LXC, 5-minute setup, handles health checks + alerts out of the box. Free, self-hosted. Best fit for Proxmox homelab use.
- Alternatively, use Proxmox's built-in monitoring via the web UI

**Layer 4: Log aggregation (optional)**

- For a single-service LXC, journald is sufficient
- For fleet-level observability, ship logs via Promtail + Loki or a lightweight syslog forwarder

### Recommended Minimum Setup

1. Enable `WatchdogSec=30` in the service unit (requires Bun `sd_notify` integration or sidecar)
2. Add `StandardOutput=journal` and `StandardError=journal` explicitly (default, but explicit is better)
3. Log key lifecycle events: startup, shutdown, health check failures
4. Document the `/health` and `/api/health` endpoints for external monitoring

### What NOT to Add (for a homelab tool)

- Full Prometheus + Grafana stack (overkill for a single service)
- Distributed tracing
- Log aggregation beyond journald
- APM / profiling tools

### Sources

- [Beszel -- Lightweight Server Monitor](https://github.com/henrygd/beszel)
- [DEV Community -- Monitor Proxmox with Beszel](https://dev.to/vikasprogrammer/how-to-monitor-proxmox-with-beszel-in-5-minutes-2026-45c8)
- [NodePrism -- Full LXC Monitoring](https://github.com/digin1/NodePrism)

---

## 10. Gap Analysis vs Current Implementation

### Critical Issues (Must Fix Before Submission)

| Gap                                             | Severity | Detail                                                                                                                                                                                                                    |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Bun install pattern non-standard**            | MEDIUM   | Uses `/root/.bun` prefix instead of `/opt/bun` (matches `yubal`/`gitea-mirror`). The `curl \| bash` install is actually accepted by maintainers (see `yubal`, `gitea-mirror`). Fix: change install prefix to `/opt/bun`.  |
| **Uses `apt-get` instead of `apt`**             | CRITICAL | Line 17: `$STD apt-get install -y` must be `$STD apt install -y`                                                                                                                                                          |
| **Version file in wrong location**              | CRITICAL | Current: `~/.rackula`. Required: `/opt/${APP}_version.txt` or the community-scripts standard `~/.rackula` (both accepted but the `check_for_gh_release` function expects `~/.appname`)                                    |
| **Custom download logic in update**             | CRITICAL | Uses custom `curl` + `tar` instead of `fetch_and_deploy_gh_release`                                                                                                                                                       |
| **Update script downloads to `/tmp`**           | HIGH     | Backups go to `/opt/rackula/data.bak` (correct) but tarball extraction to `/tmp` may be flagged                                                                                                                           |
| **No service health verification after update** | HIGH     | Services are started but never verified to be running                                                                                                                                                                     |
| **User creation may be rejected**               | MEDIUM   | Anti-pattern says "LXC containers run as root; don't create system users." However, the `rackula` user exists for systemd `User=` directive which is a security best practice. This may need discussion with maintainers. |
| **systemctl daemon-reload for new service**     | MEDIUM   | Line 219: not needed for new service creation per community-scripts rules                                                                                                                                                 |
| **Missing `setup_*` function call for Bun**     | LOW      | No standard function exists yet; `curl                                                                                                                                                                                    | bash`accepted in other scripts with`/opt/bun` prefix |

### Security Gaps (Should Fix Before Submission)

| Gap                            | Severity | Detail                                                                                                                         |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Minimal systemd sandboxing** | HIGH     | Only 5 directives; full cookbook has 20+. Missing kernel protection, capability drops, syscall filters, network egress control |
| **No nginx sandboxing**        | HIGH     | nginx runs with default unit; should apply same hardening pattern                                                              |
| **HSTS over HTTP**             | MEDIUM   | `Strict-Transport-Security` header included but meaningless over port 80 without TLS proxy                                     |
| **No token rotation**          | MEDIUM   | Write token generated once, never rotated                                                                                      |
| **No rate limiting**           | LOW      | nginx has no `limit_req` directives for API endpoints                                                                          |

### Operational Gaps (Should Fix)

| Gap                                         | Severity | Detail                                                                         |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| **RAM allocation too low**                  | MEDIUM   | 256 MB is on the edge; 512 MB is safer and aligns with community-scripts norms |
| **Disk allocation too low**                 | MEDIUM   | 4 GB is tight for OS + app + updates; 8 GB is standard                         |
| **No WatchdogSec**                          | LOW      | No hang detection beyond Restart=always                                        |
| **No OOM handling**                         | LOW      | No OOMPolicy, OOMScoreAdjust, or MemoryMax                                     |
| **No update lock file**                     | LOW      | Concurrent updates could corrupt data                                          |
| **No automatic rollback on update failure** | MEDIUM   | If update fails mid-way, manual intervention required                          |
| **No data mount point documentation**       | LOW      | Users should be told to use a mount point for data persistence                 |

### Missing Features (Nice to Have)

| Feature                                        | Priority | Detail                                         |
| ---------------------------------------------- | -------- | ---------------------------------------------- |
| Token rotation helper script                   | Low      | Convenience feature                            |
| Health check integration with systemd watchdog | Low      | Requires Bun sd_notify                         |
| IPv6 support documentation                     | Low      | nginx already listens on `[::]:80`             |
| MOTD with access info                          | Low      | community-scripts provides this via `motd_ssh` |

### What Already Works Well

- Two-file structure (ct/ + install/) is correct
- JSON metadata file exists and is well-structured
- nginx config with API proxy, SPA fallback, gzip, and security headers is comprehensive
- Token injection via nginx maps is clever and effective
- Frontend/API separation with different ownership is good security practice
- `/health` and `/api/health` endpoints exist
- Unprivileged container is the default
- The build-lxc.yml workflow produces a proper tarball

---

## Recommendations

### Priority 1: Must Fix for community-scripts Submission

1. **Fix Bun install prefix.** Change from `/root/.bun` to `/opt/bun` to match the convention used by accepted scripts (`yubal`, `gitea-mirror`). The `curl -fsSL https://bun.sh/install | bash` pattern itself is accepted by maintainers despite being listed as an anti-pattern in the wiki.

2. **Replace `apt-get` with `apt`** in the install script.

3. **Replace custom download logic in `update_script()`** with `fetch_and_deploy_gh_release`. The current approach of manually curling the tarball URL and extracting will be rejected.

4. **Use `check_for_gh_release`** for the version check in `update_script()` instead of `get_latest_github_release` + manual comparison.

5. **Add service health verification** after starting services in both install and update scripts.

6. **Remove `systemctl daemon-reload`** for the new service creation (it is not needed).

### Priority 2: Security Hardening

7. **Expand systemd sandboxing** for `rackula-api.service`: add kernel protection directives, capability dropping (`CapabilityBoundingSet=` `AmbientCapabilities=`), syscall filtering, and network egress control (`IPAddressDeny=any` + `IPAddressAllow=127.0.0.0/8`).

8. **Add nginx service hardening** via a drop-in override at `/etc/systemd/system/nginx.service.d/override.conf`.

9. **Conditional HSTS**: Remove `Strict-Transport-Security` from the default security headers for HTTP-only deployments, or add a comment explaining it only takes effect behind a TLS proxy.

10. **Add token rotation documentation** or a helper script.

### Priority 3: Resource and Reliability

11. **Increase RAM to 512 MB and disk to 8 GB** in the CT script defaults.

12. **Add `WatchdogSec=30`** and `MemoryMax=384M` to the service unit.

13. **Add trap-based rollback** in `update_script()` to restore from backup if any step fails.

14. **Add an update lock file** to prevent concurrent updates.

15. **Document data persistence** -- recommend mount point for `/opt/rackula/data`.

### Priority 4: Community Alignment

16. **Contribute `setup_bun` to `tools.func`** upstream, or open a discussion with maintainers about the best approach for Bun-based apps.

17. **Add `verb_ip6`** to the install script (currently missing from the initialization sequence).

18. **Submit to ProxmoxVED** (not ProxmoxVE) -- this is the required entry point for new scripts.

### Implementation Order

```
1. Fix anti-patterns (Priority 1)     -- blocking for submission
2. Expand sandboxing (Priority 2)     -- blocking for maintainer approval
3. Adjust resources (Priority 3)     -- easy wins, improves reliability
4. Add rollback/lock (Priority 3)     -- improves update robustness
5. Engage maintainers (Priority 4)   -- opens path for setup_bun
6. Submit to ProxmoxVED               -- after all above resolved
```
