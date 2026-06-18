# Self-Hosting Guide Refactor - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the self-hosting guide so users can go from zero to working persistent deployment in under 2 minutes, with progressive disclosure for customization.

**Issue:** #944

**Blocked by:** #973 (CI must publish `:persist` tag before this guide can reference it)

---

## Problem Statement

The current self-hosting guide (docs/deployment/SELF-HOSTING.md) has several issues:

1. **References non-existent image tag** - Mentions `:persist` tag that doesn't exist
2. **Outdated environment variables** - Uses `PORT` instead of `RACKULA_API_PORT`
3. **Missing new runtime variables** - `API_HOST`, `API_PORT` not documented
4. **Incorrect compose patterns** - Shows `depends_on` but we use `profiles: [persist]`
5. **Missing tmpfs mount** - Security examples don't include `/etc/nginx/conf.d`
6. **Too verbose for quick start** - 547 lines before user gets a working deployment
7. **Wrong troubleshooting commands** - Says `curl localhost:3001` but API isn't exposed

## User Research

**Primary motivations for self-hosting:**

- Data privacy (don't want layouts on someone else's server)
- Persistence across devices/browsers
- Data hoarding (keeping their own copy)

**Target audiences:**

- Homelab enthusiasts (comfortable with Docker, want customization)
- Casual self-hosters (copy-paste, just want it working)

**Success criteria:**

1. User runs one command (or 3-line copy-paste)
2. Opens browser, sees Rackula
3. Creates a layout, closes browser
4. Opens on another device, layout is there

---

## Solution Architecture

### Prerequisites

1. **CI publishes `:persist` tag** - See #973 (must be completed before this work)
2. **New `deploy/docker-compose.persist.yml`** - Created as part of this plan (Task 1)

### New Document Structure

```
# Self-Hosting Guide

## Quick Start (30 seconds)
## What You Get
## Customization
  - Change ports
  - Different data directory
  - Reverse proxy (Traefik/Caddy/nginx)
  - Add authentication
## Environment Variables Reference
## Troubleshooting
## Advanced
  - Building from source
  - Backup and restore
  - Security hardening
```

---

## Implementation Tasks

### Task 1: Create docker-compose.persist.yml

**Files:**

- Create: `deploy/docker-compose.persist.yml`

**Content:**

```yaml
# Rackula with Persistence - Self-Hosting Quick Start
#
# Usage:
#   mkdir -p data && sudo chown 1001:1001 data
#   docker compose up -d
#   Open http://localhost:8080
#
# Documentation: https://github.com/RackulaLives/Rackula/blob/main/docs/deployment/SELF-HOSTING.md

services:
  rackula:
    image: ghcr.io/rackulalives/rackula:persist
    container_name: rackula
    ports:
      - "${RACKULA_PORT:-8080}:8080"
    environment:
      - API_HOST=rackula-api
      - API_PORT=${RACKULA_API_PORT:-3001}
    restart: unless-stopped
    depends_on:
      - rackula-api

    # Security hardening (optional but recommended)
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /var/cache/nginx:size=10M
      - /var/run:size=1M
      - /tmp:size=5M
      - /etc/nginx/conf.d:size=1M,uid=101,gid=101

  rackula-api:
    image: ghcr.io/rackulalives/rackula-api:latest
    container_name: rackula-api
    restart: unless-stopped
    volumes:
      - ./data:/data
    environment:
      - DATA_DIR=/data
      - RACKULA_API_PORT=${RACKULA_API_PORT:-3001}

    # Security hardening
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp:size=5M

    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "-qO-",
          "http://127.0.0.1:${RACKULA_API_PORT:-3001}/health",
        ]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3

    expose:
      - "${RACKULA_API_PORT:-3001}"
```

**Acceptance criteria:**

- File exists at `deploy/docker-compose.persist.yml`
- Running `docker compose up -d` starts both containers
- Persistence works end-to-end

---

### Task 2: Rewrite SELF-HOSTING.md

**Files:**

- Rewrite: `docs/deployment/SELF-HOSTING.md`

**New content structure:**

#### Quick Start Section

````markdown
## Quick Start

### Option 1: Download and Run (Recommended)

```bash
# Download the compose file
mkdir rackula && cd rackula
curl -fsSL https://raw.githubusercontent.com/RackulaLives/Rackula/main/deploy/docker-compose.persist.yml -o docker-compose.yml

# Set up data directory (API runs as UID 1001)
mkdir -p data && sudo chown 1001:1001 data

# Start Rackula
docker compose up -d
```
````

Open http://localhost:8080 - your layouts now save to `./data/`.

### Option 2: Without Persistence

If you just want to try Rackula (layouts stored in browser only):

```bash
docker run -d -p 8080:8080 ghcr.io/rackulalives/rackula:latest
```

````

#### What You Get Section
```markdown
## What You Get

- **Layouts saved as YAML** in `./data/layout-name.yaml`
- **Access from any browser** on your network
- **No accounts or passwords** - add your own auth via reverse proxy if needed
- **Custom device images** stored in `./data/assets/`

Architecture:
- Frontend (nginx) serves the app and proxies `/api/*` to the API
- API (Bun) reads/writes YAML files to the data directory
````

#### Environment Variables Section

````markdown
## Environment Variables

All variables have sensible defaults. Only configure if you need to change something.

### Runtime Variables

| Variable | Default | Description |
| --- | --- | --- |
| `RACKULA_PORT` | `8080` | Host port for the web UI |
| `RACKULA_API_PORT` | `3001` | Port the API listens on |
| `API_HOST` | `rackula-api` | Hostname of API container (for nginx proxy) |
| `API_PORT` | `3001` | Port of API container (for nginx proxy) |

Example with custom ports:

```bash
RACKULA_PORT=3000 RACKULA_API_PORT=4000 docker compose up -d
```
````

### Build-Time Variables

These require rebuilding the image - see [Advanced: Building from Source](#building-from-source).

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_PERSIST_ENABLED` | `false` | Enable persistence UI (`:persist` tag has this set) |

````

#### Troubleshooting Section (consolidated)
```markdown
## Troubleshooting

### "Persistence API unavailable"

The UI shows this when it can't reach the API.

**Check the API is running:**
```bash
docker ps | grep rackula-api
docker logs rackula-api
````

**Check containers can communicate:**

```bash
docker exec rackula wget -qO- http://rackula-api:3001/health
```

**Common causes:**

- API container not running
- Containers on different Docker networks
- Wrong `API_HOST` value

### Permission Denied Errors

The API runs as UID 1001 and needs write access to the data directory.

**Fix:**

```bash
sudo chown -R 1001:1001 ./data
```

### Container Keeps Restarting

**Check logs:**

```bash
docker logs rackula
docker logs rackula-api
```

**Common causes:**

- Port already in use: `RACKULA_PORT=8081 docker compose up -d`
- Data directory doesn't exist: `mkdir -p data`

````

#### Advanced Section
```markdown
## Advanced

### Building from Source

If you need persistence or other build-time customizations:

```bash
git clone https://github.com/RackulaLives/Rackula.git
cd Rackula

docker build \
  --build-arg VITE_PERSIST_ENABLED=true \
  -t rackula:custom \
  -f deploy/Dockerfile .
````

Then update your docker-compose.yml to use `image: rackula:custom`.

### Backup and Restore

**Backup:**

```bash
tar czf rackula-backup.tar.gz -C ./data .
```

**Restore:**

```bash
tar xzf rackula-backup.tar.gz -C ./data
```

### Running Behind a Reverse Proxy

Example with Traefik:

```yaml
services:
  rackula:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rackula.rule=Host(`rack.example.com`)"
    expose:
      - "8080" # Don't bind to host port
```

### Security Hardening

The provided docker-compose.persist.yml includes:

- `read_only: true` - Immutable container filesystem
- `no-new-privileges` - Prevent privilege escalation
- `cap_drop: ALL` - Drop all Linux capabilities
- tmpfs mounts for writable directories

For authentication, use your reverse proxy (Traefik, Caddy, nginx) with:

- Basic auth
- OAuth/OIDC (Authelia, Authentik)
- Tailscale/VPN

````

**Acceptance criteria:**
- Quick Start works as documented
- All environment variables are accurate
- Troubleshooting commands work
- No references to non-existent features

---

### Task 3: Update root docker-compose.yml comments

**Files:**
- Modify: `docker-compose.yml` (root)

**Changes:**
- Add header comment pointing to SELF-HOSTING.md
- Clarify this is the development/reference compose
- Keep profiles pattern for dev use

**New header:**
```yaml
# Rackula Development Docker Compose
#
# For self-hosting, use: deploy/docker-compose.persist.yml
# Documentation: docs/deployment/SELF-HOSTING.md
#
# Development usage:
#   docker compose up -d                    # Frontend only (no persistence)
#   docker compose --profile persist up -d  # With API sidecar
````

---

## Verification Checklist

After implementation (requires #973 to be completed first):

- [ ] Quick Start commands work end-to-end on fresh system
- [ ] Persistence actually works (create layout, restart, layout persists)
- [ ] All environment variables work as documented
- [ ] Troubleshooting commands produce expected output
- [ ] No broken links in documentation

---

## Out of Scope

These are explicitly NOT part of this refactor:

- Multi-user authentication (documented as "use reverse proxy")
- Database backend (remains file-based YAML)
- Kubernetes manifests (Docker Compose only)
- Quickstart shell script (nice-to-have, not required)
