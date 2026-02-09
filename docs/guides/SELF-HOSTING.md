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
- **Optional write-route token auth** for `PUT`/`DELETE` API routes
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
- **Write-route token auth** with `RACKULA_API_WRITE_TOKEN` for API `PUT`/`DELETE`

For a copy-pastable interim hardening path with Docker + NGINX (UI and API protection, deny-by-default route allowlist, Docker secrets, and API rate limits), use the stop-gap section below.

---

## Stop-Gap Authentication Hardening (Docker + NGINX)

This section adds an interim authentication layer for self-hosted Rackula using Docker and NGINX.
It is designed for internal deployments that need immediate protection while first-class app auth is in progress.

Tracking:
- Epic: <https://github.com/RackulaLives/Rackula/issues/1095>
- Long-term auth docs plan: <https://github.com/RackulaLives/Rackula/issues/1107>

> This is a stop-gap, not a replacement for built-in Rackula authentication and authorization.

### Best-Practice Baseline Used Here

This guide aligns with current public guidance:

- Basic auth must run over TLS for any non-trusted network path (RFC 7617, OWASP Web Service Security Cheat Sheet).
- Deny by default on protected resources and explicitly allow required API routes (OWASP Top 10 2025 A01).
- Protect both frontend and API paths to avoid "front door locked, API open" misconfigurations.
- No trusted-IP auth bypass to avoid accidental anonymous access paths (`satisfy all` behavior).
- Use Docker secrets for credentials instead of environment variables (Docker docs).
- Add API rate limiting at the proxy to reduce abuse impact (NGINX `limit_req`, OWASP API4:2023).

This section's defaults:
- Protect both `/` and `/api/*`.
- Block all anonymous API access (read and write).
- Do not use trusted-IP password bypass.
- Store credentials using Docker secrets.
- Apply rate limits on allowed API routes.

### Required Warnings and Caveats

- Rackula currently has no built-in auth controls. Proxy auth is defense-in-depth only.
- If you protect `/` but leave API routes or API ports exposed, anonymous clients can still read or mutate data.
- HTTP Basic credentials are reused on requests and can be recovered if traffic is intercepted. Use TLS unless strictly LAN-only and trusted.
- Shared credentials are operationally risky. Rotate them often and immediately on staff/team changes.

### Target Architecture

```text
Browser
  -> auth-proxy (NGINX, Basic auth, rate limit, route allowlist)
    -> rackula (frontend + internal /api proxy)
      -> rackula-api (persistence API)
```

Hardening goal:
- Only `auth-proxy` is published to host ports.
- `rackula` and `rackula-api` are internal-only via Docker networking (`expose`, not `ports`).

### Copy-Paste Example

#### 1) Prepare files and credentials

Install `htpasswd` tooling (`apache2-utils` on Debian/Ubuntu or `httpd-tools` on RHEL/Fedora), then:

```bash
mkdir -p rackula-auth/nginx rackula-auth/secrets rackula-auth/data
cd rackula-auth

# Create bcrypt-protected credential file
htpasswd -cB -C 12 ./secrets/rackula.htpasswd rackula-admin
chmod 600 ./secrets/rackula.htpasswd

# API container writes data as UID 1001
sudo chown 1001:1001 ./data
```

#### 2) `docker-compose.yml`

```yaml
services:
  auth-proxy:
    image: nginx:1.27-alpine
    container_name: rackula-auth-proxy
    depends_on:
      rackula:
        condition: service_started
    ports:
      - "8080:8080"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    secrets:
      - rackula_htpasswd
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /var/cache/nginx:size=10M
      - /var/run:size=1M
      - /tmp:size=5M
    networks:
      - rackula

  rackula:
    image: ghcr.io/rackulalives/rackula:persist
    container_name: rackula
    expose:
      - "8080"
    environment:
      - API_HOST=rackula-api
      - API_PORT=3001
      - RACKULA_LISTEN_PORT=8080
    depends_on:
      rackula-api:
        condition: service_healthy
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /var/cache/nginx:size=10M
      - /var/run:size=1M
      - /tmp:size=5M
      - /etc/nginx/conf.d:size=1M,uid=101,gid=101
    networks:
      - rackula

  rackula-api:
    image: ghcr.io/rackulalives/rackula-api:latest
    container_name: rackula-api
    expose:
      - "3001"
    volumes:
      - ./data:/data
    environment:
      - DATA_DIR=/data
      - RACKULA_API_PORT=3001
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:size=5M
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3001/health"]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3
    networks:
      - rackula

secrets:
  rackula_htpasswd:
    file: ./secrets/rackula.htpasswd

networks:
  rackula: {}
```

#### 3) `nginx/nginx.conf`

```nginx
events {}

http {
    server_tokens off;
    access_log /dev/stdout;
    error_log /dev/stderr warn;

    upstream rackula_upstream {
        server rackula:8080;
        keepalive 16;
    }

    # Per-client API throttle; tune for your environment.
    limit_req_zone $binary_remote_addr zone=api_per_ip:10m rate=10r/s;

    server {
        listen 8080;
        server_name _;
        satisfy all; # Require all access controls to pass (no IP bypass).
        limit_req_status 429;

        # Unauthenticated endpoint for container liveness checks only.
        location = /healthz {
            access_log off;
            default_type text/plain;
            return 200 "OK\n";
        }

        # Frontend routes: protected.
        location / {
            auth_basic "Rackula Protected";
            auth_basic_user_file /run/secrets/rackula_htpasswd;

            proxy_pass http://rackula_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # Explicit API allowlist: health
        location = /api/health {
            auth_basic "Rackula Protected";
            auth_basic_user_file /run/secrets/rackula_htpasswd;

            limit_req zone=api_per_ip burst=20 nodelay;
            proxy_pass http://rackula_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Explicit API allowlist: layouts CRUD
        location ~ ^/api/layouts(/.*)?$ {
            auth_basic "Rackula Protected";
            auth_basic_user_file /run/secrets/rackula_htpasswd;

            limit_req zone=api_per_ip burst=20 nodelay;
            proxy_pass http://rackula_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Explicit API allowlist: asset CRUD
        location ~ ^/api/assets/.+/(front|rear)$ {
            auth_basic "Rackula Protected";
            auth_basic_user_file /run/secrets/rackula_htpasswd;

            limit_req zone=api_per_ip burst=20 nodelay;
            proxy_pass http://rackula_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Deny-by-default for unexpected API paths.
        location /api/ {
            return 403;
        }
    }
}
```

#### 4) Start

```bash
docker compose up -d
```

Open `http://localhost:8080`.

### Validation Checklist (Manual)

Use these checks before sharing the deployment:

1. Anonymous users cannot open the app UI:

```bash
curl -i http://localhost:8080/
```

Expected: `401 Unauthorized`.

2. Anonymous users cannot read layouts:

```bash
curl -i http://localhost:8080/api/layouts
```

Expected: `401 Unauthorized`.

3. Anonymous users cannot mutate layouts:

```bash
curl -i -X PUT \
  http://localhost:8080/api/layouts/11111111-1111-4111-8111-111111111111 \
  -H "Content-Type: text/yaml" \
  --data-binary "metadata: {}"
```

Expected: `401 Unauthorized`.

4. Anonymous users cannot hit unknown API paths:

```bash
curl -i http://localhost:8080/api/internal/debug
```

Expected: `403 Forbidden`.

5. Authenticated requests succeed:

```bash
curl -i -u rackula-admin:YOUR_PASSWORD http://localhost:8080/api/health
```

Expected: `200 OK`.

6. API is not directly exposed on host ports:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
curl -i http://localhost:3001/health
```

Expected:
- `rackula-api` has no `0.0.0.0:3001->...` mapping.
- direct host call to `:3001` fails.

7. Rate limiting is active on API routes:

```bash
seq 1 120 | xargs -I{} -P20 sh -c '
  curl -s -o /dev/null -w "%{http_code}\n" \
    -u rackula-admin:YOUR_PASSWORD \
    http://localhost:8080/api/health
' | sort | uniq -c
```

Expected: mostly `200`, with some `429` under burst load.

### LAN-Only vs TLS-Enabled Internal Deployments

#### LAN-only (minimum stop-gap)

- Keep auth-proxy on `:8080`.
- Restrict network access to trusted subnets with host firewall rules.
- Do not expose this endpoint on the public internet.

#### TLS-enabled internal deployment (recommended)

For any environment beyond a fully trusted LAN segment, terminate TLS at the auth proxy.

Example adjustment:

```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rackula.internal.example;
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Keep the same protected locations from the base config.
}
```

Also mount certificate files into `auth-proxy` read-only and publish `443`.
Only enable HSTS after confirming all subdomains are HTTPS-only to avoid client lockout.
For production-hardened TLS settings, generate a tuned config from Mozilla SSL Configuration Generator: <https://ssl-config.mozilla.org/>.

### Credential Rotation and Secret Handling

- Store credentials in a secret file, not environment variables.
- Keep `./secrets/rackula.htpasswd` out of git (`.gitignore`) and set mode `600`.
- Rotate credentials on a regular schedule and immediately after personnel/team changes.
- Remove old users explicitly:

```bash
htpasswd -D ./secrets/rackula.htpasswd OLD_USERNAME
docker compose up -d --force-recreate auth-proxy
```

### Operational Notes

#### Schools

- Use separate credentials per class/lab where possible.
- Rotate at term boundaries and when staff changes.

#### Enterprises

- Treat Basic auth as interim only.
- Plan migration to centralized identity (OIDC/SAML via gateway or native app auth when available).
- Log and monitor repeated 401/403 and high-rate API write attempts.

#### Homelab teams

- Prefer per-person credentials over one shared credential.
- If you must share one credential, rotate aggressively and document who has access.

### Troubleshooting

#### 401 Unauthorized for valid users

Check:
- Username/password typo.
- Secret file mounted and readable at `/run/secrets/rackula_htpasswd`.
- NGINX is using the expected config.

Helpful commands:

```bash
docker compose logs auth-proxy --tail=200
docker compose exec auth-proxy ls -l /run/secrets
```

#### 502 Bad Gateway

Usually means proxy cannot reach Rackula or Rackula cannot reach API.

```bash
docker compose ps
docker compose logs rackula --tail=200
docker compose logs rackula-api --tail=200
docker compose exec auth-proxy wget -qO- http://rackula:8080/health
docker compose exec rackula wget -qO- http://rackula-api:3001/health
```

#### Reverse-proxy route issues

- If `/` is protected but `/api/*` is not, anonymous mutation is still possible.
- If `rackula-api` is published with host ports, clients can bypass proxy auth.
- If `satisfy any` is combined with broad `allow` rules, password checks can be bypassed.
- Keep API internal-only and route all client traffic through `auth-proxy`.

### References

- RFC 7617 (HTTP Basic): <https://www.rfc-editor.org/rfc/rfc7617>
- OWASP Web Service Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Web_Service_Security_Cheat_Sheet.html>
- OWASP Top 10 2025 A01 Broken Access Control: <https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/>
- OWASP API4:2023 Unrestricted Resource Consumption: <https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/>
- NGINX auth_basic module: <https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html>
- NGINX access module (`allow`/`deny` evaluation order): <https://nginx.org/en/docs/http/ngx_http_access_module.html>
- NGINX core module (`satisfy all` vs `satisfy any`): <https://nginx.org/r/satisfy>
- NGINX request rate limiting (`limit_req`): <https://nginx.org/en/docs/http/ngx_http_limit_req_module.html>
- Docker Compose secrets: <https://docs.docker.com/compose/how-tos/use-secrets/>

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
| `CORS_ORIGIN`         | `http://localhost:8080` | Allowed browser origin(s) for API access (production-safe default) |
| `RACKULA_API_WRITE_TOKEN` | _unset_    | Optional bearer token required for API `PUT`/`DELETE` |
| `ALLOW_INSECURE_CORS` | `false`       | Explicitly allow wildcard CORS in production (not recommended) |
| `DATA_DIR`            | `/data`       | Path to data directory inside API container     |

**Port mapping explained:**

By default, both `RACKULA_PORT` and `RACKULA_LISTEN_PORT` are `8080`, meaning:
- Host port 8080 → Container port 8080 → nginx listening on 8080

For most users, just set `RACKULA_PORT` to change the host port:

```bash
RACKULA_PORT=3000 docker compose up -d  # Access at localhost:3000
```

If you change the host/domain, set `CORS_ORIGIN` to the exact browser origin:

```bash
RACKULA_PORT=3000 CORS_ORIGIN=http://localhost:3000 docker compose up -d
```

If you need nginx to listen on a specific port inside the container (e.g., for rootless Podman or specific orchestration requirements), set both:

```bash
RACKULA_PORT=3000 RACKULA_LISTEN_PORT=3000 docker compose up -d
```

### Secure Production Example

For Internet-facing deployments, set explicit CORS and a write token:

```bash
CORS_ORIGIN=https://rack.example.com
RACKULA_API_WRITE_TOKEN=replace-with-long-random-secret
docker compose up -d
```

`RACKULA_API_WRITE_TOKEN` is injected by nginx to API requests and enforced on mutating API routes.

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
- production-safe CORS defaults (`CORS_ORIGIN`, `ALLOW_INSECURE_CORS=false`)
- optional write-route bearer auth (`RACKULA_API_WRITE_TOKEN`)

### Single-User Design

Rackula is designed for personal use:

- **No user accounts** - All layouts are shared
- **No locking** - Concurrent edits use last-write-wins
- **No audit trail** - Changes overwrite immediately

For multi-user scenarios, deploy separate instances per user.
