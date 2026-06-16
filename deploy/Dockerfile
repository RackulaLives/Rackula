# Build stage
FROM node:22-alpine AS build
WORKDIR /app

# Build configuration
ARG VITE_ENV=production
ENV VITE_ENV=${VITE_ENV}

# Short commit hash for version.json (.dockerignore strips .git, so the
# build cannot derive it from the repo; CI passes git rev-parse --short HEAD)
ARG APP_COMMIT=""
ENV APP_COMMIT=${APP_COMMIT}

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Production stage - non-root nginx
FROM nginxinc/nginx-unprivileged:alpine
# Patch system packages to resolve known CVEs (e.g. libpng, libxml2 CVE-2026-6732,
# libssl3/libcrypto3 CVE-2026-45447). APK_CACHEBUST is fed a per-build value
# (release version / date) so this layer's buildcache is invalidated each build
# and apk upgrade re-fetches current Alpine secfixes instead of reusing a stale
# cached layer. The openssl libs are named explicitly so the fix for the tracked
# CVE-2026-45447 alerts is force-applied even if a future base ships them pinned.
ARG APK_CACHEBUST=0
USER root
RUN echo "apk-cachebust=${APK_CACHEBUST}" && \
    apk upgrade --no-cache && \
    apk add --no-cache --upgrade "libssl3>=3.5.7-r0" "libcrypto3>=3.5.7-r0"
USER nginx

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"
LABEL org.opencontainers.image.description="Rack Layout Designer for Homelabbers"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Rackula"

# API proxy configuration
# API_HOST: Hostname or IP of the API server (default: rackula-api)
# API_PORT: Port the API listens on (default: 3001)
# API_WRITE_TOKEN: Optional bearer token injected for PUT/DELETE API requests (runtime env)
# RACKULA_AUTH_MODE: Auth mode toggle for app/API anonymous access gate (none|oidc|local)
# RACKULA_STORAGE_MODE: Frontend storage mode written to config.js at startup (browser|server; default: browser)
# RACKULA_ENV: Deployment environment written to config.js at startup (dev shows the dev build toast; unset means production, so no default)
# RACKULA_LISTEN_PORT: Port nginx listens on inside the container (default: 8080)
# RACKULA_ENABLE_IPV6: IPv6 listen auto-detection (auto|true|false; default: auto)
# NGINX_RESOLVER: DNS resolver for nginx upstream resolution (default: 127.0.0.11 for Docker; override for Kubernetes)
# NGINX_ENVSUBST_FILTER: Regex filter - only substitute these env vars, leave nginx vars ($host etc.) alone
ENV API_HOST=rackula-api
ENV API_PORT=3001
ENV RACKULA_AUTH_MODE=none
ENV RACKULA_STORAGE_MODE=browser
ENV RACKULA_LISTEN_PORT=8080
ENV RACKULA_ENABLE_IPV6=auto
ENV NGINX_RESOLVER=127.0.0.11
ENV NGINX_ENVSUBST_FILTER=^(API_HOST|API_PORT|API_WRITE_TOKEN|RACKULA_AUTH_MODE|AUTH_MODE|RACKULA_LISTEN_PORT|RACKULA_IPV6_LISTEN|NGINX_RESOLVER|RACKULA_TRUST_PROXY)$

# Copy nginx config template (auto-processed by nginx's /docker-entrypoint.d/20-envsubst-on-templates.sh)
COPY ./deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
# Security headers snippet — shared between server block and /assets/ location
# (nginx drops server-level add_header when a location defines its own)
COPY ./deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
# Shared auth endpoint proxy settings
COPY ./deploy/nginx-auth-proxy.conf /etc/nginx/snippets/auth-proxy.conf
COPY --chmod=755 ./deploy/docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh
COPY --from=build /app/dist /usr/share/nginx/html

# Health check tracks runtime listen port; busybox wget is present in base image.
# EXPOSE remains 8080 as an advisory default for tooling/docs.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${RACKULA_LISTEN_PORT:-8080}/health || exit 1

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrapper.sh"]
CMD ["nginx", "-g", "daemon off;"]
