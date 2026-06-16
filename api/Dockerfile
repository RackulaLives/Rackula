# Rackula API Sidecar
# Tiny Bun-based API for layout persistence
FROM oven/bun:1.3.10-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Production image
FROM base AS runner
WORKDIR /app

# Patch system packages to resolve known CVEs (e.g. libssl3/libcrypto3
# CVE-2026-31789 and CVE-2026-45447). The oven/bun:1.3.10-alpine base does not
# ship libxml2, so CVE-2026-6732 does not apply here; this mirrors
# deploy/Dockerfile's pattern. APK_CACHEBUST is fed a per-build value so the
# buildcache for this layer is invalidated each build and apk upgrade re-fetches
# current Alpine secfixes. The openssl libs are named explicitly so the fix for
# the tracked CVE-2026-45447 alerts is force-applied.
ARG APK_CACHEBUST=0
RUN echo "apk-cachebust=${APK_CACHEBUST}" && \
    apk upgrade --no-cache && \
    apk add --no-cache --upgrade "libssl3>=3.5.7-r0" "libcrypto3>=3.5.7-r0"

# Create non-root user with matching group
RUN addgroup --system --gid 1001 rackula && \
    adduser --system --uid 1001 --ingroup rackula rackula

# Copy dependencies, manifest, and source
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Create data directory
RUN mkdir -p /data && chown rackula:rackula /data

# OCI labels
LABEL org.opencontainers.image.source="https://github.com/RackulaLives/Rackula"
LABEL org.opencontainers.image.description="Rackula API Sidecar for persistent storage"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Rackula API"

USER rackula

# Version metadata injected at build time from the release tag (single source
# of truth). Surfaced at runtime via GET /version for cross-image alignment checks.
# api/package.json's version is only a local-dev fallback (see resolveVersionInfo).
ARG APP_VERSION=""
ARG APP_COMMIT=""
ARG APP_BUILD_TIME=""
ENV APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT} \
    APP_BUILD_TIME=${APP_BUILD_TIME}

ENV NODE_ENV=production PORT=3001 DATA_DIR=/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/health || exit 1

CMD ["bun", "src/index.ts"]
