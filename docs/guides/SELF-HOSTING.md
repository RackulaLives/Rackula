# Self-Hosting Guide

This guide covers deploying Rackula with optional server-side persistence for self-hosted environments.

---

## Quick Start

### Without Persistence (Default)

The simplest deployment uses browser localStorage for storage:

```bash
docker run -d \
  --name rackula \
  -p 8080:8080 \
  ghcr.io/rackulalives/rackula:latest
```

Access at `http://localhost:8080`. Layouts are stored in the browser and export/import via YAML files.

### With Persistence

For server-side storage that persists across browsers and devices, use Docker Compose:

```yaml
# docker-compose.yaml
services:
  rackula:
    image: ghcr.io/rackulalives/rackula:persist
    ports:
      - "8080:8080"
    depends_on:
      - api

  api:
    image: ghcr.io/rackulalives/rackula-api:latest
    container_name: rackula-api
    volumes:
      - rackula-data:/data
    environment:
      - DATA_DIR=/data
      - PORT=3001

volumes:
  rackula-data:
```

```bash
docker compose up -d
```

Access at `http://localhost:8080`. Layouts save automatically to the server.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Rackula SPA (Svelte)                   │   │
│  │                                                      │   │
│  │  ┌──────────────┐    ┌──────────────────────────┐  │   │
│  │  │ localStorage │    │ Persistence Service      │  │   │
│  │  │ (fallback)   │    │ → PUT /api/layouts/:id   │  │   │
│  │  └──────────────┘    │ → GET /api/layouts       │  │   │
│  │                      └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                           │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐   │
│  │   nginx (port 8080) │    │  API Sidecar (Bun)     │   │
│  │                     │    │                         │   │
│  │  /              → SPA│    │  GET  /api/layouts     │   │
│  │  /api/*   → proxy ──┼───►│  PUT  /api/layouts/:id │   │
│  │  /health  → proxy   │    │  DELETE /api/layouts/:id│   │
│  │                     │    │  PUT /api/assets/:id   │   │
│  └─────────────────────┘    └─────────────────────────┘   │
│                                        │                    │
│                                        ▼                    │
│                              ┌─────────────────┐           │
│                              │  /data volume   │           │
│                              │  (persistent)   │           │
│                              └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**Components:**

| Component       | Image                                  | Purpose                         |
| --------------- | -------------------------------------- | ------------------------------- |
| **SPA**         | `ghcr.io/rackulalives/rackula:persist` | Static frontend with nginx      |
| **API Sidecar** | `ghcr.io/rackulalives/rackula-api`     | Bun-based REST API for storage  |
| **Data Volume** | Docker volume or bind mount            | Persistent YAML + asset storage |

**Request Flow:**

1. Browser loads SPA from nginx
2. SPA detects persistence is enabled (built with `VITE_PERSIST_ENABLED=true`)
3. API calls go to `/api/*` routes
4. nginx proxies `/api/*` requests to the API sidecar
5. API reads/writes to the data volume

---

## Data Directory Structure

The API stores all data in the configured data directory:

```
/data/
├── my-homelab.yaml           # Layout file (full state)
├── production-rack.yaml      # Another layout
├── test-setup.yaml
└── assets/                   # Custom device images
    ├── my-homelab/           # Assets per layout
    │   └── custom-nas/       # Assets per device slug
    │       ├── front.png
    │       └── rear.png
    └── production-rack/
        └── custom-switch/
            └── front.png
```

**Layout files** are YAML with the complete rack state:

```yaml
version: "1.0"
name: my-homelab
racks:
  - id: rack-1
    name: Main Rack
    size: 42
    devices:
      - slug: dell-r730
        position: 10
        label: Proxmox Host
```

**Asset files** are PNG files for custom device types with paths based on:

- Layout name (slugified)
- Device type slug
- View (`front.png` or `rear.png`)

---

## Environment Variables

### Build-Time Variables

These are set when building the Docker image:

| Variable                | Default | Description                         |
| ----------------------- | ------- | ----------------------------------- |
| `VITE_PERSIST_ENABLED`  | `false` | Enable persistence UI and API calls |
| `VITE_UMAMI_ENABLED`    | `false` | Enable Umami analytics              |
| `VITE_UMAMI_SCRIPT_URL` | -       | Umami instance script URL           |
| `VITE_UMAMI_WEBSITE_ID` | -       | Umami website ID                    |

To build with persistence enabled:

```bash
docker build \
  --build-arg VITE_PERSIST_ENABLED=true \
  -t rackula:persist \
  -f deploy/Dockerfile .
```

**Note:** Build-time variables are baked into the image. To change `VITE_PERSIST_ENABLED` or other `VITE_*` variables, you must rebuild the image with `--build-arg`. They cannot be changed at container runtime.

### Runtime Variables (API Sidecar)

| Variable   | Default | Description                             |
| ---------- | ------- | --------------------------------------- |
| `DATA_DIR` | `/data` | Path to data directory inside container |
| `PORT`     | `3001`  | API server port                         |

Example with custom settings:

```yaml
api:
  image: ghcr.io/rackulalives/rackula-api:latest
  environment:
    - DATA_DIR=/data
    - PORT=3001
  volumes:
    - ./my-layouts:/data
```

---

## Security Considerations

### Container Security

Both containers follow security best practices:

**Non-root execution:**

```dockerfile
# SPA uses nginxinc/nginx-unprivileged
# API creates and runs as 'rackula' user (UID 1001)
USER rackula
```

**Read-only filesystem (optional):**

```yaml
services:
  rackula:
    read_only: true
    tmpfs:
      - /tmp
      - /var/cache/nginx
      - /var/run

  api:
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - rackula-data:/data # Only data dir is writable
```

**Resource limits:**

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
        reservations:
          memory: 64M
```

### Network Security

- API only listens on internal Docker network (not exposed to host)
- nginx proxies API requests, acting as a gateway
- CORS allows all origins by default (`Access-Control-Allow-Origin: *`)
  - **Security note:** This exposes the API to cross-origin requests from any website
  - For production, set `CORS_ORIGIN` environment variable to your specific domain(s)
  - Only use wildcard CORS in isolated/trusted network environments

### No Authentication

Rackula does **not** include authentication. For access control:

1. **Reverse proxy auth:** Use nginx/Traefik/Caddy with basic auth or OAuth
2. **VPN/Tailscale:** Restrict network access
3. **Firewall rules:** Limit source IPs

Example with Traefik basic auth:

```yaml
services:
  rackula:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rackula.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$..."
```

---

## Single-User Design

Rackula is designed for **personal/single-user deployments**:

- **No user accounts** - All layouts are shared
- **No locking** - Concurrent edits use last-write-wins
- **No audit trail** - Changes overwrite immediately

### Conflict Resolution

If two browsers edit the same layout:

1. Both load the current state
2. Each makes changes
3. Whichever saves last wins

This is acceptable for personal use. For multi-user scenarios:

- **Deploy separate instances** per user
- **Use different layout names** to avoid conflicts
- **Consider a database-backed solution** for true multi-user

### Recommended Deployments

| Use Case         | Recommendation                                         |
| ---------------- | ------------------------------------------------------ |
| Personal homelab | Single instance, no auth needed if on trusted network  |
| Family/household | Single instance with basic auth                        |
| Small team       | Separate instances per user, or accept last-write-wins |
| Enterprise       | Not recommended - lacks audit, auth, multi-tenancy     |

---

## Troubleshooting

### API Unavailable Errors

**Symptom:** UI shows "Persistence API unavailable" or falls back to localStorage.

**Check API health:**

```bash
# From host
curl http://localhost:3001/health

# From inside rackula container
docker exec rackula wget -qO- http://rackula-api:3001/health
```

**Check logs:**

```bash
docker logs rackula-api
docker logs rackula
```

**Common causes:**

1. API container not running: `docker ps | grep rackula-api`
2. Wrong container name (must be `rackula-api` for nginx proxy)
3. Containers on different networks

**Fix network issues:**

```yaml
services:
  rackula:
    networks:
      - rackula-net
  api:
    container_name: rackula-api # Required for nginx proxy
    networks:
      - rackula-net

networks:
  rackula-net:
```

### Permission Issues

**Symptom:** API returns 500 errors or "EACCES" in logs.

**Check data directory permissions:**

```bash
docker exec rackula-api ls -la /data
```

The `rackula` user (UID 1001) must own the data directory.

#### Bind Mount Permissions

When using a bind mount (e.g., `./data:/data`), the host directory must have the correct
ownership and permissions for the container's non-root user. The API container runs as
UID 1001 by default.

**Set up the host directory:**

```bash
# Create the directory and set ownership to container's UID
mkdir -p ./data
sudo chown 1001:1001 ./data

# Ensure read/write permissions
sudo chmod 755 ./data
```

**Using a different UID:**

If you run the container with a different user ID (via `--user`), adjust the ownership
accordingly:

```bash
# Example: running as UID 1000
sudo chown 1000:1000 ./data
```

**Permission modes:**

| Mode  | Use Case                                 |
| ----- | ---------------------------------------- |
| `755` | Standard - owner read/write, others read |
| `700` | Restrictive - owner only                 |
| `775` | Group writable - shared access           |

**Common permission errors:**

- `EACCES: permission denied` - Directory not owned by container UID
- `EROFS: read-only file system` - Directory mounted read-only or lacks write permission
- `ENOENT: no such file or directory` - Host directory doesn't exist

**Example docker-compose with bind mount:**

```yaml
services:
  api:
    image: ghcr.io/rackulalives/rackula-api:latest
    volumes:
      - ./data:/data # Host ./data must be owned by UID 1001
```

#### Named Volume Permissions

Docker named volumes handle permissions automatically. The container's entrypoint
typically sets correct ownership:

```yaml
volumes:
  rackula-data: # Docker handles permissions
```

This is the **recommended approach** for most deployments as it avoids permission issues.

### Health Check Failures

**Symptom:** Container marked unhealthy, restarts repeatedly.

**Check health manually:**

```bash
# SPA health
curl http://localhost:8080/health

# API health
docker exec rackula-api wget -qO- http://127.0.0.1:3001/health
```

**Common causes:**

1. Port mismatch (API expects 3001, health check uses different port)
2. Startup time too short (adjust `--start-period`)
3. Network issues between containers

**Adjust health check timing:**

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3001/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```

### Layout Not Saving

**Symptom:** Changes appear lost after refresh.

**Verify persistence is working:**

1. Open browser DevTools (F12) → Network tab
2. Create or modify a layout
3. Look for `PUT /api/layouts/*` requests
4. If you see these requests, persistence is enabled
5. If no API calls appear, the image was built without `VITE_PERSIST_ENABLED=true`

**Check API is receiving requests:**

```bash
docker logs -f rackula-api
# Make a change in the UI and watch for PUT requests
```

---

## Advanced Configuration

### Custom nginx Configuration

Mount a custom nginx config:

```yaml
services:
  rackula:
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

### Backup and Restore

**Backup:**

```bash
# With named volume
docker run --rm -v rackula-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/rackula-backup.tar.gz -C /data .

# With bind mount
tar czf rackula-backup.tar.gz -C ./data .
```

**Restore:**

```bash
# With named volume
docker run --rm -v rackula-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/rackula-backup.tar.gz -C /data

# With bind mount
tar xzf rackula-backup.tar.gz -C ./data
```

### Running Behind Reverse Proxy

When running behind another reverse proxy (Traefik, Caddy, nginx):

```yaml
services:
  rackula:
    # Don't expose ports directly
    expose:
      - "8080"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rackula.rule=Host(`rack.example.com`)"
```

Ensure your reverse proxy forwards the correct headers:

```nginx
# nginx example
location / {
    proxy_pass http://rackula:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
