# Self-Hosting Guide

Deploy Rackula with server-side persistence so your layouts sync across browsers and devices.

---

## Quick Start

### Option 1: With Persistence (Recommended)

```bash
# Download the compose file
mkdir rackula && cd rackula
curl -fsSL https://raw.githubusercontent.com/RackulaLives/Rackula/main/deploy/docker-compose.persist.yml -o docker-compose.yml

# Set up data directory (API runs as UID 1001)
mkdir -p data && sudo chown 1001:1001 data

# Start Rackula
docker compose up -d
```

Open <http://localhost:8080> - your layouts now save to `./data/`.

### Option 2: Without Persistence

If you just want to try Rackula (layouts stored in browser only):

```bash
docker run -d -p 8080:8080 ghcr.io/rackulalives/rackula:latest
```

---

## What You Get

- **Layouts saved as YAML** in `./data/layout-name.yaml`
- **Access from any browser** on your network
- **No accounts or passwords** - add your own auth via reverse proxy if needed
- **Custom device images** stored in `./data/assets/`

**Architecture:**

```text
Browser → nginx (port 8080) → serves SPA
                            → proxies /api/* to API
         API (port 3001)    → reads/writes YAML to data directory
```

---

## Customization

### Change Ports

```bash
RACKULA_PORT=3000 RACKULA_API_PORT=4000 docker compose up -d
```

### Different Data Directory

Edit `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/data:/data
```

Ensure the directory is owned by UID 1001: `sudo chown 1001:1001 /path/to/your/data`

### Reverse Proxy (Traefik)

```yaml
services:
  rackula:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rackula.rule=Host(`rack.example.com`)"
      - "traefik.http.services.rackula.loadbalancer.server.port=8080"
    expose:
      - "8080" # Don't bind to host port
```

### Add Authentication

Rackula has no built-in auth. Use your reverse proxy:

- **Basic auth** via Traefik/Caddy/nginx
- **OAuth/OIDC** with Authelia or Authentik
- **VPN** with Tailscale or WireGuard

---

## Environment Variables

All variables have sensible defaults. Only configure if you need to change something.

### Runtime Variables

| Variable              | Default       | Description                                     |
| --------------------- | ------------- | ----------------------------------------------- |
| `RACKULA_PORT`        | `8080`        | Host port for the web UI                        |
| `RACKULA_LISTEN_PORT` | `8080`        | Port nginx listens on inside the container      |
| `RACKULA_API_PORT`    | `3001`        | Port the API listens on                         |
| `API_HOST`            | `rackula-api` | Hostname of API container (for nginx proxy)     |
| `API_PORT`            | `3001`        | Port of API container (for nginx proxy)         |
| `DATA_DIR`            | `/data`       | Path to data directory inside API container     |

**Port mapping explained:**

By default, both `RACKULA_PORT` and `RACKULA_LISTEN_PORT` are `8080`, meaning:
- Host port 8080 → Container port 8080 → nginx listening on 8080

For most users, just set `RACKULA_PORT` to change the host port:

```bash
RACKULA_PORT=3000 docker compose up -d  # Access at localhost:3000
```

If you need nginx to listen on a specific port inside the container (e.g., for rootless Podman or specific orchestration requirements), set both:

```bash
RACKULA_PORT=3000 RACKULA_LISTEN_PORT=3000 docker compose up -d
```

### Build-Time Variables

These require rebuilding the image - see [Building from Source](#building-from-source).

| Variable               | Default | Description                                         |
| ---------------------- | ------- | --------------------------------------------------- |
| `VITE_PERSIST_ENABLED` | `false` | Enable persistence UI (`:persist` tag has this set) |
| `VITE_UMAMI_ENABLED`   | `false` | Enable Umami analytics                              |

---

## Troubleshooting

### "Persistence API unavailable"

The UI shows this when it can't reach the API.

**Check the API is running:**

```bash
docker ps | grep rackula-api
docker logs rackula-api
```

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

### Layout Not Saving

1. Open browser DevTools (F12) → Network tab
2. Create or modify a layout
3. Look for `PUT /api/layouts/*` requests
4. If no API calls appear, you're using the wrong setup - use Option 1 (persistence compose file) not Option 2 (simple docker run)

---

## Advanced

### Building from Source

If you need persistence + custom analytics:

```bash
git clone https://github.com/RackulaLives/Rackula.git
cd Rackula

docker build \
  --build-arg VITE_PERSIST_ENABLED=true \
  --build-arg VITE_UMAMI_ENABLED=true \
  --build-arg VITE_UMAMI_SCRIPT_URL=https://your-umami.com/script.js \
  --build-arg VITE_UMAMI_WEBSITE_ID=your-site-id \
  -t rackula:custom \
  -f deploy/Dockerfile .
```

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

### Data Directory Structure

```text
./data/
├── my-homelab.yaml           # Layout file
├── production-rack.yaml
└── assets/                   # Custom device images
    └── my-homelab/
        └── custom-nas/
            ├── front.png
            └── rear.png
```

### Security Hardening

The provided docker-compose.persist.yml includes:

- `read_only: true` - Immutable container filesystem
- `no-new-privileges` - Prevent privilege escalation
- `cap_drop: ALL` - Drop all Linux capabilities
- tmpfs mounts for writable directories

### Single-User Design

Rackula is designed for personal use:

- **No user accounts** - All layouts are shared
- **No locking** - Concurrent edits use last-write-wins
- **No audit trail** - Changes overwrite immediately

For multi-user scenarios, deploy separate instances per user.
